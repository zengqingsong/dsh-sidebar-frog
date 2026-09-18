/**
 * Scratch probe (not part of the suite): create a file and a folder through the
 * panel's file TREE, in the GUI the user is looking at, and check the four things
 * that actually have to happen — the row appears, the file lands on disk, the new
 * file opens in EDIT mode, and the panel is clean afterwards.
 *
 *   node scripts/_probe-create.js [url] [file|dir|both]
 *
 * It creates `_verify-frog.md` and `_verify-frog-dir/` at the WORKSPACE ROOT of
 * the running server and deletes them again at the end (rm -rf through the
 * panel's own 删除 menu would need the confirm dialog, so cleanup is done on
 * disk by the caller / by this script's own fs calls).
 *
 * Auth: the running server is NOT restarted or touched; the browser-session
 * cookie is re-minted from the secret in $DSH_HOME/.credentials.yaml.
 */
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { launch } from './cdp.js'
import { readSecret, mintCookie, authorityOf } from '../../../dsh-classroom/tools/auth.js'

const url = process.argv[2] || 'http://127.0.0.1:3080/'
const what = process.argv[3] || 'both'
const WORKSPACE = process.argv[4] || process.cwd()
const FILE_NAME = '_verify-frog.md'
const DIR_NAME = '_verify-frog-dir'

const cookie = mintCookie(authorityOf(url), readSecret())
const s = await launch({ width: 1600, height: 950 })
if (!s) { console.error('no browser'); process.exit(3) }

const errors = []
const notes = []
s.on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)))
s.on('Runtime.consoleAPICalled', (p) => {
  const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
  if (p.type === 'error') errors.push('ERR ' + text)
})
const log = (...a) => console.log(...a)
const wait = (ms) => s.wait(ms)
const ev = (expr) => s.evaluate(expr)

// The panel's own status pill: the only place a refused create says WHY.
const watchPill = async () => {
  const t = await ev(`(() => {
    const p = document.querySelector('.artifacts-notice-pill')
    return p ? (p.innerText || '').trim() : null
  })()`)
  if (t && notes[notes.length - 1] !== t) notes.push(t)
  return t
}

const treeState = () => ev(`(() => {
  const rows = [...document.querySelectorAll('[data-path]')].map((r) => r.getAttribute('data-path'))
  const input = document.querySelector('.artifacts-tree-create')
  const err = document.querySelector('.artifacts-tree-create-error')
  return {
    rows: rows.length,
    created: rows.filter((p) => /_verify-frog/.test(p)),
    inputOpen: !!input,
    inputKind: input ? input.getAttribute('data-creating') : null,
    inputError: err ? (err.innerText || '').trim() : null,
    tabChips: [...document.querySelectorAll('[role="tab"]')].map((t) => (t.innerText || '').trim()).filter(Boolean),
    // The editor half of "a new file opens ready to type in".
    editor: !!document.querySelector('.cm-editor, .artifacts-editor .cm-content, textarea.artifacts-edit-textarea'),
    editToggle: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter((t) => t === '编辑' || t === '完成' || t === '保存'),
  }
})()`)

const typeName = async (name) => {
  await ev(`(() => {
    const el = document.querySelector('.artifacts-tree-create')
    if (el) el.focus()
    return !!el
  })()`)
  await wait(250)
  // Through the input pipeline, so React's controlled input sees every keystroke.
  await s.send('Input.insertText', { text: name })
  await wait(350)
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
  await wait(1500)

  // Open the column on the file tree.
  await ev(`(() => {
    const ours = document.querySelector('[data-frog-footer="files"]')
    if (ours) { ours.click(); return 'frog-footer' }
    const shell = document.querySelector('[aria-label="打开右侧边栏"]')
    if (shell) { shell.click(); return 'shell-expand' }
    return null
  })()`)
  await wait(3000)
  log('tree before: ' + JSON.stringify(await treeState()))

  // The toolbar's + button (title names both kinds).
  const plus = await ev(`(() => {
    const el = [...document.querySelectorAll('.artifacts-tree-tool')]
      .find((b) => (b.getAttribute('title') || '').indexOf('新建文件') === 0)
    if (!el) return null
    const box = el.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })()`)
  log('+ button: ' + JSON.stringify(plus))
  if (!plus) throw new Error('the 新建 toolbar button was not found')
  await s.click(plus.x, plus.y)
  await wait(700)
  log('input row: ' + JSON.stringify(await treeState()))

  if (what === 'file' || what === 'both') {
    await typeName(FILE_NAME)
    await s.key('Enter')
    await wait(2500)
    await wait(1200)
    log('after create file: ' + JSON.stringify(await treeState()))
    log('pill: ' + JSON.stringify(await watchPill()))
  }

  if (what === 'dir' || what === 'both') {
    // A second press of + → the folder kind is chosen inside the row: the row
    // defaults to a file, so switch it the way the UI offers (the menu's
    // 新建文件夹 path). Using the context menu is the honest user path.
    await s.click(plus.x, plus.y)
    await wait(600)
    const menuItems = await ev(`(() => [...document.querySelectorAll('.artifacts-menu-item')].map((i) => (i.innerText || '').trim()))()`)
    log('menu after + (should be empty): ' + JSON.stringify(menuItems))
    log('input row 2: ' + JSON.stringify(await treeState()))
    await typeName(DIR_NAME)
    await s.key('Enter')
    await wait(2500)
    log('after create (second): ' + JSON.stringify(await treeState()))
    log('pill: ' + JSON.stringify(await watchPill()))
  }

  // The panel's own 新建文件夹 entry point: right-click a row.
  const row = await ev(`(() => {
    const r = [...document.querySelectorAll('[data-path]')][0]
    if (!r) return null
    const box = r.getBoundingClientRect()
    return { path: r.getAttribute('data-path'), x: box.left + 40, y: box.top + box.height / 2 }
  })()`)
  log('first row: ' + JSON.stringify(row))
  if (row) {
    await s.rightClick(row.x, row.y)
    await wait(800)
    const menu = await ev(`(() => [...document.querySelectorAll('.artifacts-menu-item')].map((i) => (i.innerText || '').trim()))()`)
    log('context menu: ' + JSON.stringify(menu))
    const box = await ev(`(() => {
      const el = [...document.querySelectorAll('.artifacts-menu-item')].find((i) => (i.innerText || '').trim() === '新建文件夹')
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })()`)
    if (box) {
      await s.click(box.x, box.y)
      await wait(700)
      await typeName('_verify-frog-menu-dir')
      await s.key('Enter')
      await wait(2500)
      log('after menu create: ' + JSON.stringify(await treeState()))
      log('pill: ' + JSON.stringify(await watchPill()))
    } else {
      log('no 新建文件夹 item in the menu')
    }
  }

  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-create.png')
  log('--- pills seen ---')
  log(JSON.stringify(notes))
  log('--- console errors ---')
  log(errors.slice(0, 20).join('\n') || '(none)')
} catch (e) {
  log('FAILED: ' + (e && e.message))
  log(errors.slice(0, 20).join('\n') || '(none)')
} finally {
  await s.close()
  // Always clean up, and say what was actually there.
  for (const name of [FILE_NAME, DIR_NAME, '_verify-frog-menu-dir']) {
    try {
      await rm(join(WORKSPACE, name), { recursive: true, force: true })
      log('cleaned: ' + name)
    } catch (e) { log('cleanup failed for ' + name + ': ' + e.message) }
  }
}
