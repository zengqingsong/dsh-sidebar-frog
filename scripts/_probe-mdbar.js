/**
 * Scratch probe: the Markdown selection bar, end to end, in the GUI the user is
 * looking at — select a paragraph in a rendered document, quote its source
 * lines, then ask the editor to open them.
 *
 *   node scripts/_probe-mdbar.js [url]
 *
 * Runs against the FLOATING panel (`nativeFileTree: false`), because that is the
 * surface whose file tabs carry the editor: the system document tab is a
 * renderer-only seat with no 定位 to offer.
 */
import { launch } from './cdp.js'
import { readSecret, mintCookie } from '../../../dsh-classroom/tools/auth.js'

const url = process.argv[2] || 'http://127.0.0.1:3080/'
const cookie = mintCookie('127.0.0.1:3080', readSecret())
const s = await launch({ width: 1600, height: 950 })
if (!s) { console.error('no browser'); process.exit(3) }
const errors = []
s.on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)))
s.on('Runtime.consoleAPICalled', (p) => {
  const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
  if (p.type === 'error') errors.push('ERR ' + text)
})
const log = (...a) => console.log(...a)
const wait = (ms) => s.wait(ms)
const ev = (expr) => s.evaluate(expr)

try {
  await s.send('Network.enable')
  await s.send('Network.setCookie', { name: cookie.name, value: cookie.value, url })
  await s.navigate(url)
  await s.waitFor('document.readyState === "complete"', { timeout: 30000, label: 'load' })
  await wait(6000)
  await ev(`(() => {
    for (const w of ['继续', '跳过', '开始使用', '知道了']) {
      const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === w)
      if (el) { el.click(); return w }
    }
    return null
  })()`)
  await wait(1200)

  // The floating panel is where the plugin's own file tabs (and its editor) live.
  await ev(`(() => {
    const KEY = 'dsh-sidebar-frog:settings'
    const cur = JSON.parse(localStorage.getItem(KEY) || '{}')
    cur.nativeFileTree = false
    localStorage.setItem(KEY, JSON.stringify(cur))
    return true
  })()`)
  await s.navigate(url)
  await s.waitFor('document.readyState === "complete"', { timeout: 30000, label: 'reload' })
  await wait(7000)
  log('open panel: ' + JSON.stringify(await ev(`(() => {
    const ours = document.querySelector('[data-frog-footer="files"]')
    if (ours) { ours.click(); return 'rail button' }
    const shell = document.querySelector('[aria-label="打开右侧边栏"]')
    if (shell) { shell.click(); return 'shell' }
    return null
  })()`)))
  await wait(2500)
  // The floating panel opens on its 产物 view; the file tree is a band button.
  log('band: ' + JSON.stringify(await ev(`(() => {
    const panel = document.querySelector('.artifacts-panel')
    const btn = panel ? [...panel.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '文件树') : null
    if (!btn) return { clicked: false, buttons: panel ? [...panel.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).slice(0, 10) : [] }
    btn.click()
    return { clicked: true }
  })()`)))
  await wait(2000)
  log('panel present: ' + JSON.stringify(await ev(`(() => ({
    panel: !!document.querySelector('.artifacts-panel'),
    treeRows: document.querySelectorAll('[data-path]').length,
  }))()`)))
  log('open a Markdown file: ' + JSON.stringify(await ev(`(async () => {
    // Any Markdown file in whatever workspace this session has: expand the first
    // directory that holds one, then open it.
    const rows = () => [...document.querySelectorAll('[data-path]')]
    const dirs = rows().filter((r) => r.getAttribute('data-dir') === 'true' || /[^\\/.]$/.test(r.getAttribute('data-path')))
    for (const d of dirs.slice(0, 4)) {
      d.click()
      await new Promise((res) => setTimeout(res, 900))
      const md = rows().find((r) => /\\.(md|markdown)$/i.test(r.getAttribute('data-path')))
      if (md) { md.click(); return { found: true, path: md.getAttribute('data-path') } }
    }
    return { found: false, paths: rows().map((r) => r.getAttribute('data-path')).slice(0, 10) }
  })()`)))
  await s.waitFor('!!document.querySelector(".artifacts-markdown [data-line]")', { timeout: 8000, label: 'anchored preview' })
    .catch(() => {})
  await wait(1500)
  log('preview: ' + JSON.stringify(await ev(`(() => {
    const root = document.querySelector('.artifacts-markdown')
    return {
      anchored: root ? root.querySelectorAll('[data-line]').length : 0,
      h1: root && root.querySelector('h1') ? root.querySelector('h1').getAttribute('data-line') : null,
      editorBar: !!document.querySelector('.artifacts-edbar'),
      locateOffered: !!document.querySelector('.artifacts-editpane'),
    }
  })()`)))

  // Select a paragraph inside the rendered document, as a reader would.
  const selection = await ev(`(() => {
    const root = document.querySelector('.artifacts-markdown')
    if (!root) return null
    const target = [...root.querySelectorAll('p[data-line]')].find((p) => (p.innerText || '').length > 30)
    if (!target) return null
    const range = document.createRange()
    range.selectNodeContents(target)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    return { line: target.getAttribute('data-line'), text: (target.innerText || '').slice(0, 40) }
  })()`)
  log('selected: ' + JSON.stringify(selection))
  await wait(900)
  const bar = await ev(`(() => {
    const b = document.querySelector('.artifacts-mdselbar')
    if (!b) return { found: false }
    return {
      found: true,
      visible: b.style.display !== 'none',
      label: (b.querySelector('.artifacts-mdselbar-label') || {}).textContent || '',
      buttons: [...b.querySelectorAll('.artifacts-mdselbar-btn')].map((x) => x.textContent),
      rect: (() => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) } })(),
    }
  })()`)
  log('bar census: ' + JSON.stringify(await ev(`(() => ({
    markdownRoots: document.querySelectorAll('.artifacts-markdown').length,
    bars: [...document.querySelectorAll('.artifacts-mdselbar')].map((b) => ({
      buttons: [...b.querySelectorAll('.artifacts-mdselbar-btn')].map((x) => x.textContent),
      label: (b.querySelector('.artifacts-mdselbar-label') || {}).textContent || '',
    })),
    inEditorPane: [...document.querySelectorAll('.artifacts-markdown')].map((r) => !!r.closest('.artifacts-editpane')),
  }))()`)))
  log('bar: ' + JSON.stringify(bar))

  if (bar.found) {
    // 引用 — a plain DOM button, so a real click is enough.
    await ev(`(() => {
      const b = document.querySelector('.artifacts-mdselbar')
      b.querySelectorAll('.artifacts-mdselbar-btn')[0].click()
      return true
    })()`)
    await wait(1200)
    log('after 引用: ' + JSON.stringify(await ev(`(() => {
      const editor = document.querySelector('[contenteditable="true"]')
      const notice = document.querySelector('.artifacts-notice, .artifacts-flash')
      return {
        composer: editor ? (editor.innerText || editor.textContent || '').slice(0, 160) : null,
        notice: notice ? (notice.innerText || '').trim() : null,
        barGone: !document.querySelector('.artifacts-mdselbar') || document.querySelector('.artifacts-mdselbar').style.display === 'none',
      }
    })()`), null, 1))

    // 定位 — offered only where an editor can act on it.
    if (bar.buttons.indexOf('定位') >= 0) {
      await ev(`(() => {
        const root = document.querySelector('.artifacts-markdown')
        const target = [...root.querySelectorAll('p[data-line]')].find((p) => (p.innerText || '').length > 30)
        const range = document.createRange()
        range.selectNodeContents(target)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
        return true
      })()`)
      await wait(800)
      await ev(`(() => {
        const b = document.querySelector('.artifacts-mdselbar')
        const btn = [...b.querySelectorAll('.artifacts-mdselbar-btn')].find((x) => x.textContent === '定位')
        if (btn) btn.click()
        return !!btn
      })()`)
      await wait(2500)
      log('after 定位: ' + JSON.stringify(await ev(`(() => {
        const modeBtn = document.querySelector('.artifacts-edbtn-mode')
        const cm = document.querySelector('.cm-editor')
        return {
          editMode: !!modeBtn && modeBtn.className.indexOf('is-on') >= 0,
          codeMirror: !!cm,
          selectedText: String(window.getSelection() || '').slice(0, 60),
          selectedLines: [...document.querySelectorAll('.cm-line')].filter((l) => l.className.indexOf('cm-activeLine') >= 0).length,
        }
      })()`), null, 1))
    }
  }

  log('--- console errors ---')
  log(errors.slice(0, 12).join('\n') || '(none)')
  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-mdbar.png')
} catch (e) {
  log('FAILED: ' + (e && e.message))
  log(errors.slice(0, 12).join('\n') || '(none)')
} finally {
  await s.close()
}
