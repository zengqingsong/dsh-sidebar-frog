/**
 * Scratch probe: what the surfaces actually offer for reading / editing /
 * selecting text, in the GUI the user is looking at.
 *
 *   node scripts/_probe-edit.js [url]
 *
 * Reports, for the native sidebar's document tab and for this plugin's own
 * panel: whether an editor is reachable, whether line numbers are drawn, and
 * whether anything can send a selection to the composer.
 */
import { launch } from './cdp.js'
import { readSecret, mintCookie } from '../../../dsh-classroom/tools/auth.js'

const url = process.argv[2] || 'http://127.0.0.1:3080/'
const cookie = mintCookie('127.0.0.1:3080', readSecret())
const s = await launch({ width: 1600, height: 950 })
if (!s) { console.error('no browser'); process.exit(3) }
const errors = []
s.on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)))
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
  await wait(1500)

  // 1. The native column, and a file opened from the tree (the click path the
  //    user takes daily): this lands in the SHELL's document tab.
  log('column: ' + JSON.stringify(await ev(`(() => {
    const ours = document.querySelector('[data-frog-footer="files"]')
    if (ours) { ours.click(); return 'frog-footer' }
    const shell = document.querySelector('[aria-label="打开右侧边栏"]')
    if (shell) { shell.click(); return 'shell-expand' }
    return null
  })()`)))
  await wait(2500)
  log('file → ' + JSON.stringify(await ev(`(() => {
    const row = [...document.querySelectorAll('[data-path]')].find((r) => /README\\.md$/i.test(r.getAttribute('data-path')))
    if (!row) return null
    row.click()
    return row.getAttribute('data-path')
  })()`)))
  await wait(6000)
  log('document tab: ' + JSON.stringify(await ev(`(() => {
    const bar = document.querySelector('.artifacts-edbar')
    const pane = document.querySelector('.artifacts-editpane')
    const cm = document.querySelector('.cm-editor')
    const md = document.querySelector('.artifacts-markdown')
    // Anything in the tab that reads like an edit/send affordance.
    const buttons = [...document.querySelectorAll('button[title],[role="button"][title]')]
      .map((b) => b.getAttribute('title')).filter(Boolean)
    return {
      editorToolbar: !!bar,
      editorPane: !!pane,
      codeMirror: !!cm,
      markdownRendered: !!md,
      cmLineNumbers: document.querySelectorAll('.cm-lineNumbers').length,
      codeGutter: document.querySelectorAll('.artifacts-code-gutter').length,
      buttons: buttons.slice(0, 24),
      editish: buttons.filter((t) => /编辑|保存|发送|引用|选中/.test(t)),
    }
  })()`, null, 1)))

  // 2. The plugin's own panel: switch the shell to the floating panel (its file
  //    tabs carry the editor), by turning the native-surface setting off.
  log('open a file INSIDE the panel: ' + JSON.stringify(await ev(`(() => {
    // The artifact list is the floating panel's first view; its rows carry a @ button.
    const at = [...document.querySelectorAll('.artifacts-minibtn')]
    return { minibtns: at.length }
  })()`)))
  log('selection in the document: ' + JSON.stringify(await ev(`(() => {
    const md = document.querySelector('.artifacts-markdown')
    if (!md) return { markdown: false }
    const sel = window.getSelection()
    const range = document.createRange()
    const h2 = md.querySelector('h2')
    if (h2 && h2.firstChild) { range.selectNodeContents(h2); sel.removeAllRanges(); sel.addRange(range) }
    return {
      selected: String(sel.toString()).slice(0, 60),
      hasSendAction: !!document.querySelector('[class*="send-to-chat"],[class*="quote-sel"],[data-frog-send-selection]'),
      lineAnchors: document.querySelectorAll('[data-line]').length,
    }
  })()`, null, 1)))

  // 3. A CODE file (the product's own body, which we do NOT claim): does it
  //    address source lines, and are line numbers visible?
  const showFiles = async () => {
    // The tree lives in the column's 文件 tab, which a document tab replaces on
    // screen — so it has to be brought back before every tree interaction.
    const hit = await ev(`(() => {
      const tab = [...document.querySelectorAll('[role="tab"],button')]
        .find((el) => (el.innerText || '').trim() === '文件')
      if (tab) { tab.click(); return '文件 tab' }
      const ours = document.querySelector('[data-frog-footer="files"]')
      if (ours) { ours.click(); return 'frog footer' }
      return null
    })()`)
    await wait(1800)
    return hit
  }
  const walk = async (name) => {
    await showFiles()
    const hit = await ev(`(() => {
      const rows = [...document.querySelectorAll('[data-path]')]
      const row = rows.find((r) => r.getAttribute('data-path').replace(/.*[\\\\/]/, '') === ${JSON.stringify(name)})
      if (!row) return { found: false, names: rows.map((r) => r.getAttribute('data-path').replace(/.*[\\\\/]/, '')).slice(0, 14) }
      row.click()
      return { found: true, path: row.getAttribute('data-path') }
    })()`)
    await wait(3500)
    return hit
  }
  for (const dir of ['src', 'shared']) {
    log('expand ' + dir + ': ' + JSON.stringify(await walk(dir)))
  }
  log('open markdown.js: ' + JSON.stringify(await walk('markdown.js')))
  await wait(4000)
  log('code body: ' + JSON.stringify(await ev(`(() => {
    const body = document.querySelector('[data-code-preview], .dhJKeW_body, [class*="body"]')
    const lines = document.querySelectorAll('[data-textpreview-line]')
    const preLines = document.querySelectorAll('pre .line, [data-code-block-content] .line')
    const first = lines[0] || preLines[0] || null
    const cs = first ? getComputedStyle(first, '::before') : null
    // Select inside the third line to see what a selection can resolve to.
    const target = lines[2] || preLines[2]
    let selectedLine = null
    if (target) {
      const r = document.createRange()
      r.selectNodeContents(target)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
      const node = sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode
      const anchor = node && node.closest ? node.closest('[data-textpreview-line]') : null
      selectedLine = anchor ? anchor.getAttribute('data-textpreview-line') : (target.getAttribute('data-textpreview-line'))
    }
    return {
      plainLineElements: lines.length,
      codeLineElements: preLines.length,
      firstLineAttr: first ? first.getAttribute('data-textpreview-line') : null,
      beforeContent: cs ? cs.content : null,
      numbersVisible: cs ? cs.content !== 'none' && cs.content !== '' : false,
      selectedLine,
      bodyClass: body ? body.className : null,
      toolbar: [...document.querySelectorAll('button[title]')].map((b) => b.getAttribute('title')).filter(Boolean).slice(0, 20),
    }
  })()`, null, 1)))

  // 4. The plugin's own 「产物」 native tab: a file opened from ITS list is a tab
  //    of this plugin (not a hand-off), so this is where the editor should be.
  log('产物 tab: ' + JSON.stringify(await ev(`(() => {
    const tab = [...document.querySelectorAll('[role="tab"],button')]
      .find((el) => (el.innerText || '').trim() === '产物')
    if (!tab) return { found: false, tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => (t.innerText || '').trim()).slice(0, 10) }
    tab.click()
    return { found: true }
  })()`)))
  await wait(2500)
  log('产物 rows: ' + JSON.stringify(await ev(`(() => {
    const rows = [...document.querySelectorAll('.artifacts-row, [class*="artifacts-item"], [class*="artifacts-row"]')]
    return { rows: rows.length, text: rows.slice(0, 3).map((r) => (r.innerText || '').replace(/\\s+/g, ' ').slice(0, 60)) }
  })()`)))
  log('open first artifact: ' + JSON.stringify(await ev(`(() => {
    const row = document.querySelector('.artifacts-row') || document.querySelector('[class*="artifacts-row"]')
    if (!row) return null
    const btn = row.querySelector('.artifacts-open,.artifacts-name,[class*="name"],button') || row
    btn.click()
    return (row.innerText || '').replace(/\\s+/g, ' ').slice(0, 60)
  })()`)))
  await wait(3500)
  log('pane after click: ' + JSON.stringify(await ev(`(() => {
    const bar = document.querySelector('.artifacts-edbar')
    const cm = document.querySelector('.cm-editor')
    return {
      editorToolbar: !!bar,
      codeMirror: !!cm,
      toggleTitle: bar ? (bar.querySelector('button') || {}).getAttribute && bar.querySelector('button').getAttribute('title') : null,
      buttons: bar ? [...bar.querySelectorAll('button')].map((b) => (b.getAttribute('title') || b.innerText || '').trim()) : [],
    }
  })()`, null, 1)))

  log('--- console errors ---')
  log(errors.slice(0, 12).join('\n') || '(none)')
  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-edit.png')
} catch (e) {
  log('FAILED: ' + (e && e.message))
  log(errors.slice(0, 12).join('\n') || '(none)')
} finally {
  await s.close()
}
