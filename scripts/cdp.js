/**
 * Minimal Chrome DevTools Protocol driver — no dependencies.
 *
 * Why this exists: the plugin's UI is a browser UI, and three rounds of bugs
 * (a context menu drawn one panel-width off screen, a toolbar button hidden by a
 * container query, and now a menu that ignores clicks) were all invisible to the
 * Node-side tests and to code reading. Guessing at browser behaviour cost more
 * than this file does: Node 22 ships a global `WebSocket`, and Chrome/Edge are
 * already installed on the box, so a real engine can be driven with zero
 * packages and no network.
 *
 *   const { launch } = await import('./cdp.js')
 *   const s = await launch({ url: 'http://127.0.0.1:1234/' })
 *   await s.waitFor('!!document.querySelector("#treeBody [data-path]")')
 *   await s.click(...(await s.center('[data-path="D:\\\\ws\\\\src"]')))
 *   await s.close()
 *
 * Notes that matter for reproducing input bugs:
 *  - Input goes through `Input.dispatchMouseEvent`, i.e. the real input
 *    pipeline, so Chrome synthesises click/dblclick/contextmenu and updates
 *    hover state exactly as it does for a human. This is what makes it possible
 *    to catch a `click` that never reaches its button because the node under the
 *    cursor was replaced between mousedown and mouseup.
 *  - The browser is launched with `stdio: 'ignore'` and the debugging port is
 *    read from `DevToolsActivePort` inside the profile directory: no pipes are
 *    opened, which keeps this working under the harness file sandbox too.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const CANDIDATES = [
  process.env.DSH_TEST_BROWSER,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
  process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
  process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean)

/** First installed Chromium-family browser, or null. */
export function findBrowser() {
  for (const p of CANDIDATES) {
    try { if (existsSync(p)) return p } catch (e) { /* keep looking */ }
  }
  return null
}

class Session {
  constructor(ws, child, profile, browser) {
    this.ws = ws
    this.child = child
    this.profile = profile
    this.browser = browser
    this._id = 0
    this._pending = new Map()
    this._handlers = new Map()
    this._closed = false
    // Dialogs the page raised that nobody asked for, and the policy the current
    // navigation installed. See the handler in `launch`.
    this.dialogs = []
    this._dialogPolicy = null
    ws.addEventListener('message', (ev) => this._onMessage(ev))
    ws.addEventListener('close', () => {
      this._closed = true
      for (const [, p] of this._pending) {
        clearTimeout(p.timer)
        p.reject(new Error('browser connection closed'))
      }
      this._pending.clear()
    })
  }

  _onMessage(ev) {
    let msg
    try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) } catch (e) { return }
    if (msg.id != null) {
      const p = this._pending.get(msg.id)
      if (!p) return
      this._pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(p.method + ': ' + (msg.error.message || JSON.stringify(msg.error))))
      else p.resolve(msg.result)
      return
    }
    const list = this._handlers.get(msg.method)
    if (list) for (const fn of list) { try { fn(msg.params || {}) } catch (e) { /* a listener must not kill the session */ } }
  }

  /** Subscribe to a CDP event (`Runtime.exceptionThrown`, `Page.loadEventFired`, …). */
  on(method, fn) {
    if (!this._handlers.has(method)) this._handlers.set(method, [])
    this._handlers.get(method).push(fn)
    return this
  }

  send(method, params, timeout = 20000) {
    if (this._closed) return Promise.reject(new Error(method + ': browser connection is closed'))
    const id = ++this._id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new Error(method + ': timed out after ' + timeout + 'ms'))
      }, timeout)
      this._pending.set(id, { resolve, reject, timer, method })
      try { this.ws.send(JSON.stringify({ id, method, params: params || {} })) } catch (e) {
        clearTimeout(timer)
        this._pending.delete(id)
        reject(e)
      }
    })
  }

  /** Evaluate in the page; rejects when the page throws, so a broken page fails loudly. */
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (r && r.exceptionDetails) {
      const d = r.exceptionDetails
      const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'unknown error'
      throw new Error('page threw while evaluating: ' + desc)
    }
    return r && r.result ? r.result.value : undefined
  }

  /** Poll an expression until it is truthy. Throws with `label` on timeout. */
  async waitFor(expression, { timeout = 8000, interval = 40, label } = {}) {
    const deadline = Date.now() + timeout
    let last
    for (;;) {
      last = await this.evaluate(expression)
      if (last) return last
      if (Date.now() > deadline) throw new Error('timed out waiting for ' + (label || expression))
      await sleep(interval)
    }
  }

  async wait(ms) { await sleep(ms) }

  /**
   * Navigate this tab and wait for the NEW document to be ready.
   *
   * Deliberately not `Page.loadEventFired`: that event only arrives once
   * `Page.enable` has been called, and this page polls the host every two seconds
   * anyway, so "the load event" is both fragile and beside the point. What matters
   * is that the URL changed and the new document is no longer `loading`.
   *
   * Answers the dialog for the duration of THIS navigation. The session has one
   * permanent `Page.javascriptDialogOpening` handler (see `launch`) that dismisses
   * anything unexpected and records it; this only sets the answer it should give.
   * The previous version added a handler per call, so navigating twice left two
   * handlers answering the same dialog.
   */
  async navigate(url, { onDialog = null, timeout = 20000 } = {}) {
    const previous = this._dialogPolicy
    this._dialogPolicy = onDialog
    try {
      await this.send('Page.navigate', { url })
      const deadline = Date.now() + timeout
      for (;;) {
        let info = null
        try {
          info = await this.evaluate('({ href: location.href, state: document.readyState })')
        } catch (e) {
          // Mid-commit the old execution context can be gone: that is not a failure.
          info = null
        }
        if (info && info.href === url && info.state !== 'loading') return
        if (Date.now() > deadline) {
          throw new Error('navigate: the tab never reached ' + url + ' (at ' + JSON.stringify(info) + ')')
        }
        await sleep(50)
      }
    } finally {
      this._dialogPolicy = previous
    }
  }

  /** Centre point of the first element matching `selector`, or null. */
  async center(selector) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) return null
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x, top: r.y, width: r.width, height: r.height }
    })()`)
  }

  async text(selector) {
    return this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      return el ? el.textContent : null
    })()`)
  }

  async count(selector) {
    return this.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`)
  }

  mouseMove(x, y) {
    return this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' })
  }

  mousePress(x, y, button = 'left', clickCount = 1) {
    const buttons = button === 'left' ? 1 : button === 'right' ? 2 : 4
    return this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons, clickCount, pointerType: 'mouse' })
  }

  mouseRelease(x, y, button = 'left', clickCount = 1) {
    return this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount, pointerType: 'mouse' })
  }

  /** A real click: move, press, release. Chrome synthesises the `click` event. */
  async click(x, y, button = 'left') {
    await this.mouseMove(x, y)
    await this.mousePress(x, y, button)
    await this.mouseRelease(x, y, button)
    await sleep(30)
  }

  /** A real double click (two clicks, the second with clickCount 2 ⇒ `dblclick`). */
  async doubleClick(x, y) {
    await this.mouseMove(x, y)
    await this.mousePress(x, y, 'left', 1)
    await this.mouseRelease(x, y, 'left', 1)
    await this.mousePress(x, y, 'left', 2)
    await this.mouseRelease(x, y, 'left', 2)
    await sleep(30)
  }

  /** Mouse press and release that deliberately straddle `between` ms. */
  async clickWithGap(x, y, between, button = 'left') {
    await this.mouseMove(x, y)
    await this.mousePress(x, y, button)
    await sleep(between)
    await this.mouseRelease(x, y, button)
    await sleep(30)
  }

  async key(key, { code, keyCode } = {}) {
    const map = {
      Escape: { code: 'Escape', keyCode: 27 },
      Enter: { code: 'Enter', keyCode: 13 },
      ArrowDown: { code: 'ArrowDown', keyCode: 40 },
      ArrowUp: { code: 'ArrowUp', keyCode: 38 },
      ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
      ArrowRight: { code: 'ArrowRight', keyCode: 39 },
      Tab: { code: 'Tab', keyCode: 9 },
      F5: { code: 'F5', keyCode: 116 },
    }
    const info = map[key] || { code: code || key, keyCode: keyCode || 0 }
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key, code: info.code, windowsVirtualKeyCode: info.keyCode, nativeVirtualKeyCode: info.keyCode,
    })
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key, code: info.code, windowsVirtualKeyCode: info.keyCode, nativeVirtualKeyCode: info.keyCode,
    })
    await sleep(30)
  }

  async screenshot(path) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(r.data, 'base64'))
    return path
  }

  async close() {
    try { this.ws.close() } catch (e) { /* already gone */ }
    try { this.child.kill() } catch (e) { /* already gone */ }
    await sleep(200)
    // Chrome releases its profile asynchronously; a locked file here is noise,
    // never a test failure.
    try { rmSync(this.profile, { recursive: true, force: true }) } catch (e) { /* leave it */ }
  }
}

/**
 * Launch a headless Chromium with `url` open and attach to its page target.
 * Returns null when no browser is installed (callers skip, they do not fail).
 */
export async function launch({ url, width = 1400, height = 900, timeout = 30000 } = {}) {
  const bin = findBrowser()
  if (!bin) return null
  const profile = mkdtempSync(join(tmpdir(), 'dsf-cdp-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--mute-audio',
    '--window-size=' + width + ',' + height,
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
  ]
  if (url) args.push(url)
  const child = spawn(bin, args, { stdio: 'ignore', windowsHide: true })
  child.on('error', () => { /* reported by the port timeout below */ })

  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + timeout
  let port = 0
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      // Chrome creates this file and writes it in two steps, so a read that
      // lands in between fails with EBUSY on Windows. That is the browser
      // working, not a broken profile: keep polling instead of throwing the
      // whole run away on a race that resolves in milliseconds.
      let line = ''
      try {
        line = readFileSync(portFile, 'utf8').split('\n')[0].trim()
      } catch (e) {
        await sleep(100)
        continue
      }
      port = parseInt(line, 10) || 0
      if (port) break
    }
    await sleep(100)
  }
  if (!port) {
    try { child.kill() } catch (e) { /* already gone */ }
    throw new Error('browser did not open a debugging port (' + bin + ')')
  }

  let target = null
  while (Date.now() < deadline && !target) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list')
      const list = await res.json()
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      target = pages.find((t) => url && String(t.url).startsWith(url.split('?')[0])) || pages[0] || null
    } catch (e) { /* not up yet */ }
    if (!target) await sleep(100)
  }
  if (!target) {
    try { child.kill() } catch (e) { /* already gone */ }
    throw new Error('no page target appeared')
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('websocket attach timed out')), 10000)
    ws.addEventListener('open', () => { clearTimeout(timer); resolve() })
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('websocket attach failed')) })
  })

  const session = new Session(ws, child, profile, bin)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Log.enable')
  // A native dialog BLOCKS the renderer: this page calls `window.confirm` before
  // destructive work (removing a file), and an unanswered one makes every later
  // `Runtime.evaluate` time out at 20s. One stray confirm therefore used to turn
  // into a cascade of ~15 unrelated failures and finally an abort with no summary
  // — which the mutation harness could not classify at all.
  //
  // Answer everything, record what was answered, and let the test that provoked
  // it fail on its own merits. `navigate({ onDialog })` overrides the answer for
  // the duration of that navigation (the popout asks before it leaves a dirty
  // editor, and that one must be ACCEPTED).
  session.on('Page.javascriptDialogOpening', (p) => {
    const policy = session._dialogPolicy
    if (!policy) session.dialogs.push(p && p.message ? p.message : '(dialog)')
    session.send('Page.handleJavaScriptDialog', { accept: policy === 'accept' }).catch(() => {})
  })
  return session
}
