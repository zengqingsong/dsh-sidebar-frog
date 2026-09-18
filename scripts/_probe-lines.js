/**
 * Scratch probe (not part of the suite): drive the two line-number switches in the
 * GUI the user is looking at, through the SETTINGS UI (not by writing storage
 * directly), and read back what the panel and the editor actually draw.
 *
 *   node scripts/_probe-lines.js [url]
 *
 * Leaves the settings at their shipped defaults (preview off, editor on).
 */
import { launch } from './cdp.js'
import { readSecret, mintCookie, authorityOf } from '../../../dsh-classroom/tools/auth.js'

const url = process.argv[2] || 'http://127.0.0.1:3080/'
const cookie = mintCookie(authorityOf(url), readSecret())
const s = await launch({ width: 1600, height: 950 })
if (!s) { console.error('no browser'); process.exit(3) }

const errors = []
s.on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)))
s.on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') errors.push('ERR ' + (p.args || []).map((a) => a.value ?? a.description).join(' '))
})
const log = (...a) => console.log(...a)
const wait = (ms) => s.wait(ms)
const ev = (expr) => s.evaluate(expr)

const SETTINGS_KEY = 'dsh-sidebar-frog:settings'
const readSettings = () => ev(`(() => { try { return localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) } catch (e) { return null } })()`)

// What the panel's rendered document is doing: the class, the label, and what the
// stylesheet's ::before actually DRAWS (computed content is the substituted value).
const gutterState = () => ev(`(() => {
  const root = document.querySelector('.artifacts-markdown')
  if (!root) return { root: false }
  const block = root.querySelector(':scope > [data-lineno]')
  return {
    root: true,
    cls: root.className,
    padLeft: getComputedStyle(root).paddingLeft,
    label: block ? block.getAttribute('data-lineno') : null,
    line: block ? block.getAttribute('data-line') : null,
    drawn: block ? getComputedStyle(block, '::before').content : null,
    labelled: root.querySelectorAll('[data-lineno]').length,
  }
})()`)

const editorState = () => ev(`(() => {
  const ed = document.querySelector('.artifacts-editpane .cm-editor, .cm-editor')
  if (!ed) return { editor: false }
  const nums = [...ed.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
    .filter((e) => /^\\d+$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 0)
    .map((e) => e.textContent.trim())
  return { editor: true, mode: !!document.querySelector('.artifacts-edbtn-mode'), numbers: nums.slice(0, 4), count: nums.length }
})()`)

// Flip a switch through the real settings UI: find the row by its label, click the
// checkbox inside it, and wait for the store to agree. The row is scrolled into view
// first — this section sits below the fold, and a click at an off-screen y hits
// nothing at all (the same trap the skin probe documents).
const toggle = async (label, want) => {
  const at = await ev(`(() => {
    const row = [...document.querySelectorAll('.artifacts-setrow')].find((r) => {
      const t = r.querySelector('.artifacts-settitle')
      return t && t.textContent.trim() === ${JSON.stringify(label)}
    })
    if (!row) return { found: false, labels: [...document.querySelectorAll('.artifacts-settitle')].map((t) => t.textContent.trim()) }
    const cb = row.querySelector('input[type=checkbox]')
    if (!cb) return { found: false, why: 'no checkbox' }
    if (cb.scrollIntoView) cb.scrollIntoView({ block: 'center' })
    const box = cb.getBoundingClientRect()
    return { found: true, checked: cb.checked, x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })()`)
  if (!at.found) throw new Error('no switch labelled ' + label + ': ' + JSON.stringify(at.labels || at.why))
  if (at.checked === want) { log('  ' + label + ' already ' + want); return }
  await s.click(at.x, at.y)
  const key = label.indexOf('预览') === 0 ? 'previewLineNumbers' : 'editorLineNumbers'
  for (let i = 0; i < 20; i += 1) {
    const raw = await readSettings()
    const data = raw ? JSON.parse(raw) : {}
    if (data[key] === want) return
    await wait(150)
  }
  throw new Error('the switch ' + label + ' did not reach ' + want + ': ' + await readSettings())
}

// Click the centre of the first element whose trimmed text equals `text`.
const clickText = async (text) => {
  const at = await ev(`(() => {
    const el = [...document.querySelectorAll('button, [role="tab"], [role="button"], a, div, span')]
      .filter((e) => (e.innerText || '').trim() === ${JSON.stringify(text)})
      .pop()
    if (!el) return null
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center' })
    const b = el.getBoundingClientRect()
    return b.width && b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null
  })()`)
  if (!at) throw new Error('nothing to click for ' + JSON.stringify(text))
  await s.click(at.x, at.y)
  return at
}

// Walk the tree open until a Markdown row is visible, then click it. The tree
// renders one level at a time, so this is the same sequence a person performs.
const openSomeMarkdown = async () => {
  for (let depth = 0; depth < 4; depth += 1) {
    const md = await ev(`(() => {
      const rows = [...document.querySelectorAll('[data-path]')]
      const file = rows.find((r) => /\\.(md|markdown)$/i.test(r.getAttribute('data-path')))
      if (!file) return null
      const b = file.getBoundingClientRect()
      return { path: file.getAttribute('data-path'), x: b.left + 60, y: b.top + b.height / 2 }
    })()`)
    if (md) { await s.click(md.x, md.y); return md.path }
    const dir = await ev(`(() => {
      const row = [...document.querySelectorAll('[data-path]')].find((r) => r.getAttribute('aria-expanded') === 'false')
      if (!row) return null
      const b = row.getBoundingClientRect()
      return { path: row.getAttribute('data-path'), x: b.left + 60, y: b.top + b.height / 2 }
    })()`)
    if (!dir) return null
    await s.click(dir.x, dir.y)
    await wait(1200)
  }
  return null
}

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

  // Open the column.
  log('open: ' + await ev(`(() => {
    const ours = document.querySelector('[data-frog-footer="files"]')
    if (ours) { ours.click(); return 'rail button' }
    const shell = document.querySelector('[aria-label="打开右侧边栏"]')
    if (shell) { shell.click(); return 'shell expand' }
    return 'nothing to open'
  })()`))
  await wait(2500)

  // Open a Markdown document from the tree, so the preview in the panel is ours.
  log('doc opened: ' + JSON.stringify(await openSomeMarkdown()))
  await wait(2500)
  log('panel state: ' + JSON.stringify(await ev(`(() => {
    const root = document.querySelector('.artifacts-markdown')
    return {
      rootParent: root && root.parentElement ? String(root.parentElement.className) : null,
      edbar: document.querySelectorAll('.artifacts-edbar').length,
      edbarButtons: [...document.querySelectorAll('.artifacts-edbar button, .artifacts-edbar .artifacts-edbtn')].map((b) => (b.innerText || '').trim()).filter(Boolean),
      previewBody: document.querySelectorAll('.artifacts-preview-body').length,
      cmEditors: document.querySelectorAll('.cm-editor').length,
      tabNames: [...document.querySelectorAll('[role="tab"]')].map((t) => (t.innerText || '').trim()).slice(0, 12),
      panelTabs: [...document.querySelectorAll('.artifacts-tab, .artifacts-panetab')].map((t) => (t.innerText || '').trim()).slice(0, 12),
    }
  })()`)))

  // The switches live in the product's settings dialog, under this plugin's section.
  await clickText('设置')
  await wait(2500)
  await clickText('可弹出式侧边栏')
  await wait(1500)
  log('settings section rows: ' + JSON.stringify(await ev(
    `[...document.querySelectorAll('.artifacts-settitle')].map((t) => t.textContent.trim())`)))

  log('settings before: ' + await readSettings())
  log('gutter (default, setting off): ' + JSON.stringify(await gutterState()))

  // ── the preview switch, through the settings UI ────────────────────────────
  log('--- 预览显示行号 → on ---')
  await toggle('预览显示行号', true)
  await wait(1200)
  const on = await gutterState()
  log('gutter after ON: ' + JSON.stringify(on))
  const drawn = String(on.drawn).replace(/^"|"$/g, '')
  log('drawn === label ? ' + (drawn === String(on.label)))
  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-lines-preview.png')

  // ── the editor: open it and flip the editor switch ─────────────────────────
  // The settings dialog covers the panel, so it is closed first — otherwise the
  // click lands on the dialog and the editor button is never reached.
  const closeSettings = async () => {
    for (let i = 0; i < 3; i += 1) {
      await s.key('Escape')
      await wait(400)
      if (await ev('!!document.querySelector(".artifacts-edbtn-mode")')) return true
    }
    return ev('!!document.querySelector(".artifacts-edbtn-mode")')
  }
  log('settings closed: ' + await closeSettings())
  log('--- enter edit mode ---')
  const editAt = await ev(`(() => {
    const b = document.querySelector('.artifacts-edbtn-mode')
    if (!b) return null
    const box = b.getBoundingClientRect()
    return box.width ? { label: (b.innerText || '').trim(), x: box.left + box.width / 2, y: box.top + box.height / 2 } : null
  })()`)
  log('edit button: ' + JSON.stringify(editAt))
  if (editAt) {
    await s.click(editAt.x, editAt.y)
    for (let i = 0; i < 20; i += 1) { if ((await editorState()).editor) break; await wait(500) }
  }
  log('editor with the setting on: ' + JSON.stringify(await editorState()))

  // Back to the settings for the editor switch, flipped while the editor is OPEN.
  await clickText('设置')
  await wait(2000)
  await clickText('可弹出式侧边栏')
  await wait(1200)
  log('--- 编辑器显示行号 → off (live) ---')
  await toggle('编辑器显示行号', false)
  await wait(900)
  log('editor after OFF: ' + JSON.stringify(await editorState()))
  await toggle('编辑器显示行号', true)
  await wait(900)
  log('editor after ON: ' + JSON.stringify(await editorState()))
  await closeSettings()
  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-lines-editor.png')

  // Leave the shipped defaults behind (preview off, editor on).
  await clickText('设置')
  await wait(2000)
  await clickText('可弹出式侧边栏')
  await wait(1200)
  await toggle('预览显示行号', false)
  await wait(900)
  log('gutter after OFF: ' + JSON.stringify(await gutterState()))
  log('settings after: ' + await readSettings())
  // ── the editor: the POPOUT page ────────────────────────────────────────────
  // Not the system sidebar's document tab: that one registers for `text-pages`
  // delivery and stays read-only until the whole file has arrived in a single page
  // (textEditability in src/client/docpreview.js refuses a partial payload, because
  // saving a page would shorten the file). The popout mounts the same CodeMirror
  // controller, so it is where this switch is observable on any document.
  await closeSettings()
  log('--- popout: the editor column, flipped live ---')
  await s.navigate(url.replace(/\/+$/, '') + '/dsh-sidebar-frog')
  await s.waitFor('!!document.getElementById("tabs")', { timeout: 20000, label: 'the popout page' })
  await wait(1500)
  const tabAt = await ev(`(() => {
    const t = document.querySelector('.tab[data-view="tree"]')
    if (!t) return null
    const b = t.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })()`)
  if (tabAt) await s.click(tabAt.x, tabAt.y)
  await s.waitFor('document.querySelectorAll("#treeBody [data-path]").length > 0', { timeout: 8000, label: 'the popout tree' })
  const popoutDoc = await ev(`(() => {
    const md = [...document.querySelectorAll('#treeBody [data-path]')].find((r) => /\\.(md|markdown|csv|txt)$/i.test(r.getAttribute('data-path')))
    if (!md) return null
    const b = md.getBoundingClientRect()
    return { path: md.getAttribute('data-path'), x: b.left + 60, y: b.top + b.height / 2 }
  })()`)
  log('popout doc: ' + JSON.stringify(popoutDoc))
  if (popoutDoc) {
    await s.click(popoutDoc.x, popoutDoc.y)
    await s.waitFor('!!document.querySelector(".editbtn")', { timeout: 8000, label: 'the 编辑 button' })
    const editBtn = await s.center('.editbtn')
    await s.click(editBtn.x, editBtn.y)
    await s.waitFor('!!document.querySelector(".editcm .cm-editor")', { timeout: 20000, label: 'CodeMirror' })
    const popEditor = () => ev(`(() => {
      const ed = document.querySelector('.editcm .cm-editor')
      if (!ed) return { editor: false }
      const nums = [...ed.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
        .filter((e) => /^\\d+$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 0)
        .map((e) => e.textContent.trim())
      return { editor: true, column: !!ed.querySelector('.cm-lineNumbers'), first: nums.slice(0, 3), count: nums.length }
    })()`)
    log('popout editor (setting on): ' + JSON.stringify(await popEditor()))
    const flip = async (want) => {
      await ev(`(() => {
        const key = ${JSON.stringify(SETTINGS_KEY)}
        const data = JSON.parse(localStorage.getItem(key))
        data.editorLineNumbers = ${want ? 'true' : 'false'}
        localStorage.setItem(key, JSON.stringify(data))
        window.dispatchEvent(new StorageEvent('storage', { key: key, newValue: JSON.stringify(data) }))
      })()`)
      await wait(900)
      return popEditor()
    }
    log('popout editor after OFF: ' + JSON.stringify(await flip(false)))
    log('popout editor after ON: ' + JSON.stringify(await flip(true)))
  }
  log('--- console errors ---')
  log(errors.slice(0, 12).join('\n') || '(none)')
} catch (e) {
  log('FAILED: ' + (e && e.message))
  log(errors.slice(0, 12).join('\n') || '(none)')
  try { await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-lines-failed.png') } catch (x) {}
} finally {
  await s.close()
}
