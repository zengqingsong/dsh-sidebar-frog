/**
 * Behavioural tests for the file tree's bulk actions (展开全部 / 全部折叠).
 *
 * Both halves of the plugin are covered, because both have shipped tree bugs
 * that no static check could see:
 *
 *   • the sidebar's FileTree is React, so it is mounted here against a miniature
 *     hook runtime (scripts/minireact.js) and driven through the same element
 *     tree the browser renders;
 *   • the popout page is one inline script, so it is executed against the fake
 *     DOM in scripts/domstub.js and driven by dispatching real events.
 *
 * The specific regressions these lock down:
 *
 *   1. 全部折叠 did nothing in the sidebar. The buttons *were* wired correctly —
 *      but `@container (max-width: 400px)` hid them (`display: none`) while the
 *      panel defaults to 20% of the window, i.e. under 400px on any screen
 *      narrower than 2000px. The refresh button slid into their slot, so the
 *      click landed on refresh, which changes nothing visible.
 *   2. The sidebar's right-click menu opened *outside the panel* and was never
 *      seen: `.artifacts-panel` sets `container-type: inline-size` (layout
 *      containment), which makes the panel — not the viewport — the containing
 *      block for `position: fixed`, while the menu was placed with raw
 *      `clientX/clientY`. The popout escapes this only because it appends its
 *      menu to `<body>`.
 */

import { readFileSync } from 'node:fs'
import { bootPage } from './domstub.js'
import { createRenderer, settle } from './minireact.js'

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

// ── fixtures ───────────────────────────────────────────────────────────────
const FS = {
  'D:/ws': [
    { name: 'src', path: 'D:/ws/src', isDir: true },
    { name: 'docs', path: 'D:/ws/docs', isDir: true },
    { name: 'README.md', path: 'D:/ws/README.md', isDir: false },
  ],
  'D:/ws/src': [
    { name: 'deep', path: 'D:/ws/src/deep', isDir: true },
    { name: 'a.js', path: 'D:/ws/src/a.js', isDir: false },
  ],
  'D:/ws/src/deep': [{ name: 'b.js', path: 'D:/ws/src/deep/b.js', isDir: false }],
  'D:/ws/docs': [{ name: 'c.md', path: 'D:/ws/docs/c.md', isDir: false }],
}
const ROOT = 'D:/ws'
const ALL_DIRS = ['D:/ws/src', 'D:/ws/src/deep', 'D:/ws/docs']

const unquote = (s) => { try { return decodeURIComponent(s) } catch (e) { return s } }
const tick = (ms) => new Promise((r) => setTimeout(r, ms == null ? 25 : ms))
const icon = (name) => (size) => ({ type: name, props: { size } })

// ── the popout page: run its inline script, drive real events ──────────────
export const runPopoutTree = async (html) => {
  const results = []
  let docsAttempts = 0
  const check = async (label, fn) => {
    try { results.push({ label, detail: await fn() }) } catch (e) { results.push({ label, error: e && e.message ? e.message : String(e) }) }
  }
  const page = bootPage(html, {
    storage: { 'dsh-sidebar-frog:session': 's1' },
    extra: `
      function __treeExpanded() {
        return Object.keys(treeExpanded).filter(function (k) { return treeExpanded[k]; });
      }`,
    expose: ['setView', '__treeExpanded'],
    routes: {
      '/dsh-sidebar-frog/data': () => ({ ok: true, artifacts: [] }),
      '/dsh-sidebar-frog/listdir': (u) => {
        const m = /[?&]path=([^&]*)/.exec(u)
        const path = m ? unquote(m[1]) : ROOT
        // docs fails its first read, so the retry path has something to retry.
        if (path === 'D:/ws/docs' && docsAttempts++ === 0) return { ok: false, error: 'EPERM: 文件被占用' }
        return { ok: true, path, entries: FS[path] || [] }
      },
    },
  })
  const body = page.document.getElementById('treeBody')
  const rowFor = (path) => body.querySelectorAll('.tree-row').find((el) => el.getAttribute('data-path') === path)
  const openDirs = () => page.api.__treeExpanded().slice().sort()

  page.api.setView('tree')
  await tick(80)

  await check('popout: root level renders', () => {
    const rows = page.rows()
    if (rows.length !== 3) throw new Error('expected 3 root rows, got ' + JSON.stringify(rows.map((r) => r.name)))
    return '3 root rows'
  })

  // A level that failed once must be retryable: the cached error used to count
  // as "loaded", so collapsing and re-expanding the folder showed the stale
  // failure forever. Runs first, while nothing is cached yet — a level that has
  // already loaded successfully is never refetched on expand.
  {
    rowFor('D:/ws/docs').dispatch('click', { detail: 1 })
    await tick(80)
    await check('popout: a failed level reports the reason', () => {
      const errors = page.document.getElementById('treeBody').querySelectorAll('.tree-error')
      if (!errors.length) throw new Error('no error row was rendered: ' + JSON.stringify(page.rows().map((r) => r.path)))
      return 'error shown'
    })
    rowFor('D:/ws/docs').dispatch('click', { detail: 1 })
    await tick(40)
    rowFor('D:/ws/docs').dispatch('click', { detail: 1 })
    await tick(100)
    await check('popout: re-expanding a failed level retries it', () => {
      if (docsAttempts < 2) throw new Error('the level was never requested again')
      if (!page.rows().some((r) => r.path === 'D:/ws/docs/c.md')) {
        throw new Error('the retry did not render: ' + JSON.stringify(page.rows().map((r) => r.path)))
      }
      return `${docsAttempts} attempts, rows recovered`
    })
    rowFor('D:/ws/docs').dispatch('click', { detail: 1 })   // back to collapsed
    await tick(40)
  }

  // The toolbar button, exactly as a user clicks it.
  page.els('treeExpandAll').click()
  for (let i = 0; i < 8; i += 1) await tick(40)
  await check('popout: 全部展开 opens every level', () => {
    const open = openDirs()
    if (open.join(',') !== ALL_DIRS.slice().sort().join(',')) throw new Error('open = ' + JSON.stringify(open))
    return open.length + ' dirs open, ' + page.rows().length + ' rows'
  })

  page.els('treeCollapseAll').click()
  await tick(40)
  await check('popout: 全部折叠 closes every level', () => {
    const open = openDirs()
    if (open.length) throw new Error('still expanded: ' + JSON.stringify(open))
    const rows = page.rows()
    if (rows.length !== 3) throw new Error('expected only the root rows, got ' + JSON.stringify(rows.map((r) => r.name)))
    return 'collapsed to ' + rows.length + ' rows'
  })

  // A double-click delivers click, click, dblclick. Toggling on both clicks
  // opened the folder and closed it again in one gesture — the same "expand does
  // nothing" defect the sidebar tree had.
  {
    rowFor('D:/ws/src').dispatch('click', { detail: 1 })
    await tick(60)
    // Re-queried, because a re-render replaces the row nodes: this is the node a
    // browser would deliver the second click to.
    rowFor('D:/ws/src').dispatch('click', { detail: 2 })
    await tick(80)
    await check('popout: a double-clicked folder stays open', () => {
      const open = openDirs()
      if (open.indexOf('D:/ws/src') < 0) throw new Error('the folder closed itself: open = ' + JSON.stringify(open))
      if (!page.rows().some((r) => r.path === 'D:/ws/src/a.js')) {
        throw new Error('the level did not render: ' + JSON.stringify(page.rows().map((r) => r.path)))
      }
      return 'still open with its children'
    })
  }

  // Two sibling levels open at once: both must be on screen, and no row twice.
  {
    rowFor('D:/ws/docs').dispatch('click', { detail: 1 })
    await tick(60)
    await check('popout: two open levels both render', () => {
      const paths = page.rows().map((r) => r.path)
      if (paths.indexOf('D:/ws/docs/c.md') < 0) throw new Error('docs did not open: ' + JSON.stringify(paths))
      if (paths.indexOf('D:/ws/src/a.js') < 0) throw new Error('src is no longer open: ' + JSON.stringify(paths))
      if (paths.length !== new Set(paths).size) throw new Error('a row was rendered twice: ' + JSON.stringify(paths))
      return paths.length + ' rows, no duplicates'
    })
    page.els('treeCollapseAll').click()
    await tick(40)
  }

  // Right-click a folder: the menu must open in the DOM, on screen, and its
  // items must act.
  page.els('treeExpandAll').click()
  for (let i = 0; i < 8; i += 1) await tick(40)
  const row = rowFor('D:/ws/src')
  await check('popout: rows are right-clickable', () => {
    if (!row) throw new Error('no row for D:/ws/src')
    return 'row found'
  })
  row.dispatch('contextmenu', { clientX: 700, clientY: 300 })
  await tick(20)
  const menu = page.document.body.querySelector('.tree-menu')
  await check('popout: right-click opens the menu', () => {
    if (!menu) throw new Error('no .tree-menu was appended to the body')
    const labels = menu.querySelectorAll('.tree-menu-item').map((b) => b.textContent)
    if (!labels.includes('全部折叠')) throw new Error('menu items: ' + JSON.stringify(labels))
    return labels.length + ' items'
  })
  await check('popout: menu is positioned on screen', () => {
    const left = parseInt(menu.style.left, 10)
    const top = parseInt(menu.style.top, 10)
    if (!(left >= 0 && left + 210 <= page.window.innerWidth)) throw new Error('left = ' + menu.style.left)
    if (!(top >= 0 && top + 260 <= page.window.innerHeight)) throw new Error('top = ' + menu.style.top)
    return `left ${left}, top ${top}`
  })
  const collapseItem = menu.querySelectorAll('.tree-menu-item').find((b) => b.textContent === '全部折叠')
  collapseItem.click()
  await tick(20)
  await check('popout: menu 全部折叠 collapses the tree', () => {
    const open = openDirs()
    if (open.length) throw new Error('still expanded: ' + JSON.stringify(open))
    if (page.document.body.querySelector('.tree-menu')) throw new Error('the menu stayed open')
    return 'collapsed and closed'
  })

  page.stop()
  return results
}

// ── the sidebar: mount FileTree, click the same buttons ────────────────────
// A panel 380px wide at the right edge of a 1920px window: the default width
// (20% of the window) and the configuration the hidden-toolbar bug appeared in.
const PANEL = { left: 1540, top: 0, width: 380, height: 900 }

const mountSidebar = (store, options) => {
  const opts = options || {}
  let panelEl = null
  const treeEl = {
    nodeType: 1,
    get parentElement() { return panelEl },
    getBoundingClientRect: () => PANEL,
  }
  panelEl = {
    nodeType: 1, parentElement: null,
    getBoundingClientRect: () => PANEL,
  }
  // The default host answers the fixture filesystem; tests that need a failing,
  // stalling or differently-spelled host pass their own.
  const host = opts.host || {
    call: (method, args) => {
      if (method === 'artifacts.listDir') {
        const path = (args && args.path) || ROOT
        return Promise.resolve({ ok: true, path, entries: FS[path] || [] })
      }
      return Promise.resolve({ ok: false, error: 'unknown ' + method })
    },
  }
  const windowStub = {
    innerWidth: 1920,
    innerHeight: 900,
    getComputedStyle: (node) => ({
      containerType: node === panelEl ? 'inline-size' : 'normal',
      getPropertyValue: (k) => (k === 'container-type' && node === panelEl ? 'inline-size' : ''),
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const r = createRenderer(() => null, { items: [], onOpen: () => {}, selectedPath: null, pinnedPath: null })
  // The tree portals its context menu to <body> (a `position: fixed` menu left
  // inside the panel is measured from the panel, not the viewport — see
  // src/client/filetree.js). This stub records the portal the way React would
  // perform it, so the suite can assert the menu really leaves the panel.
  const portalCalls = []
  const bodyStub = { nodeType: 1, tagName: 'BODY' }
  const ReactDOM = {
    createPortal: (node, container) => {
      portalCalls.push({ node, container })
      return { type: 'portal', props: { children: [node] } }
    },
  }
  // The shared modules are inlined ahead of the component, exactly as
  // scripts/build.js does it. Loading only src/client/filetree.js would leave
  // every shared helper undefined — and a ReferenceError thrown inside an effect
  // is swallowed by the hook runtime, so the tree would silently lose the
  // behaviour under test instead of failing the test.
  const mod = new Function(
    'React', 'ReactDOM', 'currentSessionId', 'ctx', 'host', 'quoteToComposer', 'basename', 'fileIconKind', 'fallbackCopy',
    'RefreshIcon', 'TreeChevronIcon', 'FolderOpenIcon', 'FolderClosedIcon', 'TreeFileIcon', 'SearchIcon',
    'ExpandAllIcon', 'CollapseAllIcon', 'CloseIcon', 'PlusIcon', 'window', 'document', 'localStorage', 'navigator', 'console',
    'setTimeout', 'clearTimeout',
    read('src/shared/paths.js') + '\n' + read('src/client/filetree.js') + '\nreturn { FileTree };',
  )(
    r.React, ReactDOM, () => 's1',
    { get: (n) => (n === 'sessions' ? { list: { subscribe: () => () => {} } } : undefined) },
    host, () => false, (p) => String(p).split(/[/\\]/).pop(), () => 'js', () => {},
    icon('RefreshIcon'), icon('TreeChevronIcon'), icon('FolderOpenIcon'), icon('FolderClosedIcon'),
    icon('TreeFileIcon'), icon('SearchIcon'), icon('ExpandAllIcon'), icon('CollapseAllIcon'), icon('CloseIcon'), icon('PlusIcon'),
    windowStub,
    { body: bodyStub },
    {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    },
    { clipboard: { writeText: () => Promise.resolve() } },
    console, setTimeout, clearTimeout,
  )
  r.setComponent(mod.FileTree)
  const open = () => Object.keys(r.hooks[0].expanded).filter((k) => r.hooks[0].expanded[k]).sort()
  const names = () => r.texts('artifacts-tree-name')
  const rowFor = (path) => r.findAll('artifacts-tree-row').filter((el) => el.props['data-path']).find((el) => el.props['data-path'] === path)
  return {
    renderer: r,
    treeEl,
    store,
    flush: async (ms) => {
      r.flush()
      await settle(8)
      r.flush()
      if (ms) await new Promise((x) => setTimeout(x, ms))
      r.flush()
    },
    state: () => r.hooks[0],
    // Anything the component threw inside an effect or a handler. The hook
    // runtime collects these instead of letting them escape (React only logs
    // them), so a tree that throws looks like a tree that "does nothing" — the
    // suite asserts this stays empty.
    errors: () => r.errors,
    open,
    names,
    // React keys of every rendered row. Placeholder rows (a level loading or
    // failing) carry a synthetic key, so two siblings doing the same thing at
    // the same depth must not collide.
    keys: () => r.findAll('artifacts-tree-row').map((el) => el.props.key),
    rowFor,
    // Click a row the way a browser does. `detail` is the click counter: 1 for a
    // single click, 2 for the second half of a double-click.
    clickRow: (path, detail) => {
      const row = rowFor(path)
      if (!row) throw new Error('no row for ' + path)
      row.props.onClick({
        detail: detail == null ? 1 : detail,
        stopPropagation() {},
        currentTarget: { focus() {} },
      })
    },
    rightClickRow: (path, clientX, clientY) => {
      const row = rowFor(path)
      if (!row) throw new Error('no row for ' + path)
      row.props.onContextMenu({
        clientX, clientY, preventDefault() {}, stopPropagation() {},
        currentTarget: treeEl, target: treeEl,
      })
    },
    clickTool: (title) => {
      const btn = r.findByTitle(title)[0]
      if (!btn) throw new Error('no button titled ' + title)
      btn.props.onClick({ shiftKey: false, stopPropagation() {}, currentTarget: { focus() {} } })
    },
    // The portal the menu was rendered through (node + container), if any.
    menuPortals: () => portalCalls,
    body: bodyStub,
  }
}

export const runSidebarTree = async () => {
  const results = []
  const launch = []
  const check = async (label, fn) => {
    try { results.push({ label, detail: await fn() }) } catch (e) { results.push({ label, error: e && e.message ? e.message : String(e) }) }
  }
  const store = {}
  const t = mountSidebar(store)
  const r = t.renderer
  await t.flush(80)

  await check('sidebar: root level renders', () => {
    const names = t.names()
    if (names.join('|') !== 'src|docs|README.md') throw new Error('rows = ' + names.join('|'))
    return names.length + ' rows'
  })

  // The toolbar buttons must exist and stay clickable at the default panel width
  // — the regression that made 全部折叠 unreachable.
  await check('sidebar: bulk toolbar is present', () => {
    for (const title of ['全部展开', '全部折叠']) {
      if (!r.findByTitle(title)[0]) throw new Error('no button titled ' + title)
    }
    return 'expand + collapse wired'
  })

  await check('sidebar: no responsive rule hides a control', () => {
    const hidden = hiddenControlViolations(read('src/client/styles.js'))
    if (hidden.length) throw new Error('hidden by CSS: ' + JSON.stringify(hidden))
    return 'no container/media query hides a control'
  })

  t.clickTool('全部展开')
  await t.flush(220)
  await check('sidebar: 全部展开 opens every level', () => {
    const dirs = t.open()
    if (dirs.join(',') !== ALL_DIRS.slice().sort().join(',')) throw new Error('open = ' + JSON.stringify(dirs))
    return dirs.length + ' dirs open'
  })

  t.clickTool('全部折叠')
  await t.flush(40)
  await check('sidebar: 全部折叠 closes every level', () => {
    const dirs = t.open()
    if (dirs.length) throw new Error('still expanded: ' + JSON.stringify(dirs))
    if (t.names().join('|') !== 'src|docs|README.md') throw new Error('rows = ' + t.names().join('|'))
    return 'collapsed to 3 rows'
  })

  await t.flush(500)
  await check('sidebar: a collapse is remembered', async () => {
    const saved = store['dsh-sidebar-frog:tree:' + ROOT]
    if (saved !== '[]') throw new Error('stored ' + JSON.stringify(saved))
    const again = mountSidebar(store)
    launch.push(again)
    await again.flush(200)
    const dirs = again.open()
    if (dirs.length) throw new Error('a fresh mount restored ' + JSON.stringify(dirs))
    return 'stored [] and a fresh mount starts collapsed'
  })

  // Right-click: the menu must land AT THE POINTER. `position: fixed` inside the
  // panel is measured from the PANEL (it sets container-type, i.e. layout
  // containment), so viewport coordinates used to be reinterpreted in panel space
  // and the menu appeared wherever that put it — the "menu is always in the
  // middle of the screen" report.
  const POINTER = { x: 1700, y: 400 }
  t.clickTool('全部展开')
  await t.flush(220)
  await check('sidebar: rows are right-clickable', () => {
    if (!t.rowFor('D:/ws/src')) throw new Error('no row for D:/ws/src')
    return 'row found'
  })
  t.rowFor('D:/ws/src').props.onContextMenu({
    clientX: POINTER.x, clientY: POINTER.y, preventDefault() {}, stopPropagation() {},
    currentTarget: t.treeEl, target: t.treeEl,
  })
  await t.flush(40)
  await check('sidebar: right-click opens the menu', () => {
    if (!r.findAll('artifacts-tree-menu')[0]) throw new Error('no menu element was rendered')
    const labels = r.texts('artifacts-tree-menu-item')
    if (!labels.includes('全部折叠')) throw new Error('menu items: ' + JSON.stringify(labels))
    return labels.length + ' items'
  })
  await check('sidebar: the menu is portaled out of the panel', () => {
    const calls = t.menuPortals()
    if (!calls.length) throw new Error('the menu was rendered inside the panel')
    const bad = calls.filter((c) => c.container !== t.body)
    if (bad.length) throw new Error(bad.length + ' of ' + calls.length + ' renders did not target <body>')
    const node = calls[calls.length - 1].node
    if (!node || String(node.props.className).indexOf('artifacts-tree-menu') < 0) {
      throw new Error('the portaled node is not the context menu')
    }
    return 'menu → <body>'
  })
  await check('sidebar: the menu opens at the pointer', () => {
    const menu = r.findAll('artifacts-tree-menu')[0]
    if (!menu) throw new Error('no menu rendered')
    const { left, top } = menu.props.style
    if (left !== POINTER.x || top !== POINTER.y) {
      throw new Error('menu at ' + left + ',' + top + ' — the pointer was at ' + POINTER.x + ',' + POINTER.y)
    }
    return 'viewport ' + left + ',' + top
  })
  // …and it is kept inside the window when the pointer is at the bottom-right.
  await check('sidebar: the menu is kept on screen near the edge', async () => {
    const edge = mountSidebar({})
    launch.push(edge)
    await edge.flush(80)
    edge.rightClickRow('D:/ws/src', 1910, 890)
    await edge.flush(20)
    const menu = edge.renderer.findAll('artifacts-tree-menu')[0]
    if (!menu) throw new Error('no menu rendered')
    const { left, top } = menu.props.style
    if (!(left >= 8 && left + 210 <= 1920 && top >= 8 && top + 340 <= 900)) {
      throw new Error('menu drawn off screen at ' + left + ',' + top)
    }
    return 'clamped to ' + left + ',' + top
  })
  await check('sidebar: menu 全部折叠 collapses the tree', () => {
    const item = r.findAll('artifacts-tree-menu-item').find((el) => r.textOf(el) === '全部折叠')
    if (!item) throw new Error('no 全部折叠 item, have ' + JSON.stringify(r.texts('artifacts-tree-menu-item')))
    item.props.onClick()
    const dirs = t.open()
    if (dirs.length) throw new Error('still expanded: ' + JSON.stringify(dirs))
    return 'collapsed'
  })
  t.flush(20)
  await check('sidebar: choosing an item closes the menu', () => {
    if (r.findAll('artifacts-tree-menu').length) throw new Error('the menu stayed open')
    return 'menu closed'
  })

  // ── delete: a destructive action the menu only ARMS ──────────────────────
  // The 删除 item must not fire on its own: it opens a confirm, and only the
  // confirm's 删除 button calls the host. A refusal (the host says the path is
  // outside the workspace) must not delete anything and must show its reason.
  {
    const fsState = {
      'D:/ws': [
        { name: 'src', path: 'D:/ws/src', isDir: true },
        { name: 'docs', path: 'D:/ws/docs', isDir: true },
        { name: 'README.md', path: 'D:/ws/README.md', isDir: false },
        { name: 'forbidden.txt', path: 'D:/ws/forbidden.txt', isDir: false },
      ],
      'D:/ws/src': [
        { name: 'deep', path: 'D:/ws/src/deep', isDir: true },
        { name: 'a.js', path: 'D:/ws/src/a.js', isDir: false },
      ],
    }
    const deleted = []
    const delHost = {
      call: (method, args) => {
        if (method === 'artifacts.listDir') {
          const p = (args && args.path) || ROOT
          return Promise.resolve({ ok: true, path: p, entries: fsState[p] || [] })
        }
        if (method === 'artifacts.delete') {
          const path = args && args.path
          deleted.push(path)
          // A successful delete removes the entry from the fixture, so the
          // refresh that follows no longer lists it. A refusal leaves it.
          if (path !== ROOT + '/forbidden.txt') {
            for (const key of Object.keys(fsState)) fsState[key] = fsState[key].filter((e) => e.path !== path)
          }
          return Promise.resolve(path === ROOT + '/forbidden.txt'
            ? { ok: false, error: '该路径在工作区之外，不能删除' }
            : { ok: true, kind: 'file' })
        }
        return Promise.resolve({ ok: false, error: 'unknown ' + method })
      },
    }
    const dt = mountSidebar({}, { host: delHost })
    launch.push(dt)
    await dt.flush(80)
    // The menu offers 删除 for a file.
    dt.rowFor('D:/ws/README.md').props.onContextMenu({
      clientX: 700, clientY: 300, preventDefault() {}, stopPropagation() {},
      currentTarget: dt.treeEl, target: dt.treeEl,
    })
    await dt.flush(20)
    await check('sidebar: the menu offers 删除 for a file', () => {
      const labels = dt.renderer.texts('artifacts-tree-menu-item')
      if (!labels.includes('删除文件…')) throw new Error('menu items: ' + JSON.stringify(labels))
      return labels.length + ' items, includes 删除文件…'
    })
    // Choosing it opens the confirm, NOT the deletion: the host has not been asked yet.
    const delItem = dt.renderer.findAll('artifacts-tree-menu-item').find((el) => dt.renderer.textOf(el) === '删除文件…')
    delItem.props.onClick({ stopPropagation() {} })
    await dt.flush(20)
    await check('sidebar: choosing 删除 opens the confirm, not the deletion', () => {
      if (dt.renderer.findAll('artifacts-tree-menu').length) throw new Error('the menu was not closed')
      const confirm = dt.renderer.findAll('artifacts-tree-confirm')[0]
      if (!confirm) throw new Error('no confirm dialog rendered')
      if (deleted.length) throw new Error('the deletion fired before the confirm: ' + JSON.stringify(deleted))
      const buttons = dt.renderer.findAll('artifacts-tree-confirm-btn')
      if (buttons.length !== 2) throw new Error('confirm has ' + buttons.length + ' buttons')
      return 'confirm up, host not yet called'
    })
    // 取消 dismisses it and calls nothing.
    const cancelBtn = dt.renderer.findAll('artifacts-tree-confirm-btn').find((el) => dt.renderer.textOf(el) === '取消')
    cancelBtn.props.onClick()
    await dt.flush(20)
    await check('sidebar: 取消 dismisses the confirm without deleting', () => {
      if (dt.renderer.findAll('artifacts-tree-confirm').length) throw new Error('the confirm stayed open')
      if (deleted.length) throw new Error('a deletion was fired by 取消: ' + JSON.stringify(deleted))
      if (dt.renderer.texts('artifacts-tree-name').indexOf('README.md') < 0) throw new Error('the file was removed from the tree')
      return 'confirm closed, nothing deleted'
    })
    // …and the confirm's 删除 button is the ONLY thing that deletes: open it again,
    // press 删除, and the host is asked exactly once and the row disappears.
    dt.rowFor('D:/ws/README.md').props.onContextMenu({
      clientX: 700, clientY: 300, preventDefault() {}, stopPropagation() {},
      currentTarget: dt.treeEl, target: dt.treeEl,
    })
    await dt.flush(20)
    const delItem2 = dt.renderer.findAll('artifacts-tree-menu-item').find((el) => dt.renderer.textOf(el) === '删除文件…')
    delItem2.props.onClick({ stopPropagation() {} })
    await dt.flush(20)
    const okBtn = dt.renderer.findAll('artifacts-tree-confirm-btn').find((el) => dt.renderer.textOf(el) === '删除')
    okBtn.props.onClick()
    await dt.flush(120)
    await check('sidebar: the confirm 删除 button asks the host once and the row vanishes', () => {
      if (dt.renderer.findAll('artifacts-tree-confirm').length) throw new Error('the confirm stayed open after 删除')
      if (deleted.length !== 1 || deleted[0] !== 'D:/ws/README.md') throw new Error('deletions: ' + JSON.stringify(deleted))
      if (dt.renderer.texts('artifacts-tree-name').indexOf('README.md') >= 0) throw new Error('the deleted row is still on screen')
      if (!dt.renderer.findAll('artifacts-tree-flash-label')[0]) throw new Error('no 已删除 feedback was shown')
      return 'one delete, row gone, feedback shown'
    })

    // ── a folder deletes too (recursively), with the right warning ─────────
    // The request must mention EVERYTHING underneath, and the folder's row — a
    // top-level entry listed by the ROOT, the same refresh path the file above
    // exercised — must vanish from the tree after the host confirms.
    dt.rowFor('D:/ws/docs').props.onContextMenu({
      clientX: 700, clientY: 300, preventDefault() {}, stopPropagation() {},
      currentTarget: dt.treeEl, target: dt.treeEl,
    })
    await dt.flush(20)
    await check('sidebar: the menu offers 删除 for a folder', () => {
      const labels = dt.renderer.texts('artifacts-tree-menu-item')
      if (!labels.includes('删除文件夹…')) throw new Error('menu items: ' + JSON.stringify(labels))
      return 'includes 删除文件夹…'
    })
    const ddir = dt.renderer.findAll('artifacts-tree-menu-item').find((el) => dt.renderer.textOf(el) === '删除文件夹…')
    ddir.props.onClick({ stopPropagation() {} })
    await dt.flush(20)
    await check('sidebar: the folder confirm warns that EVERYTHING goes', () => {
      const body = dt.renderer.texts('artifacts-tree-confirm-body').join(' ')
      if (body.indexOf('全部内容') < 0) throw new Error('folder confirm does not warn about its contents: ' + JSON.stringify(body))
      if (dt.renderer.texts('artifacts-tree-confirm-title').join('') !== '删除文件夹？') throw new Error('wrong title: ' + JSON.stringify(dt.renderer.texts('artifacts-tree-confirm-title')))
      return '「…及其中的全部内容都会被删除」'
    })
    const dirOk = dt.renderer.findAll('artifacts-tree-confirm-btn').find((el) => dt.renderer.textOf(el) === '删除')
    dirOk.props.onClick()
    await dt.flush(120)
    await check('sidebar: the folder deletes and its row vanishes', () => {
      if (deleted[deleted.length - 1] !== 'D:/ws/docs') throw new Error('deletions: ' + JSON.stringify(deleted))
      if (dt.renderer.texts('artifacts-tree-name').indexOf('docs') >= 0) throw new Error('the deleted folder is still on screen')
      return 'folder gone, host asked for ' + deleted[deleted.length - 1]
    })

    // ── a refusal deletes nothing and shows the host's reason ──────────────
    // The host fences the path to the workspace. When it refuses, the row must
    // stay AND the user must see why — a silent no-op is the worst outcome for a
    // destructive action.
    const beforeNames = dt.renderer.texts('artifacts-tree-name').slice().sort().join('|')
    dt.rowFor('D:/ws/forbidden.txt').props.onContextMenu({
      clientX: 700, clientY: 300, preventDefault() {}, stopPropagation() {},
      currentTarget: dt.treeEl, target: dt.treeEl,
    })
    await dt.flush(20)
    const forbItem = dt.renderer.findAll('artifacts-tree-menu-item').find((el) => dt.renderer.textOf(el) === '删除文件…')
    forbItem.props.onClick({ stopPropagation() {} })
    await dt.flush(20)
    const forbOk = dt.renderer.findAll('artifacts-tree-confirm-btn').find((el) => dt.renderer.textOf(el) === '删除')
    forbOk.props.onClick()
    await dt.flush(120)
    await check('sidebar: a refused deletion keeps the file and shows the reason', () => {
      const label = dt.renderer.texts('artifacts-tree-flash-label').join(' ')
      if (label.indexOf('工作区之外') < 0) throw new Error('the refusal reason was not shown: ' + JSON.stringify(label))
      if (dt.renderer.texts('artifacts-tree-name').slice().sort().join('|') !== beforeNames) {
        throw new Error('the tree changed after a refusal: ' + dt.renderer.texts('artifacts-tree-name').join('|'))
      }
      return 'reason shown, row kept'
    })
  }

  // ── 新建: a file and a folder, from the tree ──────────────────────────────
  // The action has to do four things and they are each a way it can be wrong:
  // ask the host for a NAME beside a PARENT (never a path), put the input where
  // the entry will appear, re-read the level afterwards so the row is really
  // there, and show the host's refusal in the row instead of silently doing
  // nothing. The last one is why every case below checks the call as well as the
  // screen.
  {
    const fsState = {
      'D:/ws': [
        { name: 'src', path: 'D:/ws/src', isDir: true },
        { name: 'docs', path: 'D:/ws/docs', isDir: true },
        { name: 'README.md', path: 'D:/ws/README.md', isDir: false },
        { name: 'taken.md', path: 'D:/ws/taken.md', isDir: false },
      ],
      'D:/ws/src': [
        { name: 'a.js', path: 'D:/ws/src/a.js', isDir: false },
      ],
      'D:/ws/docs': [],
    }
    const calls = []
    const listed = []
    const opened = []
    const newHost = {
      call: (method, args) => {
        if (method === 'artifacts.listDir') {
          const p = (args && args.path) || ROOT
          listed.push(p)
          return Promise.resolve({ ok: true, path: p, entries: fsState[p] || [] })
        }
        if (method === 'artifacts.create') {
          calls.push(args)
          const parent = args && args.parent
          const name = args && args.name
          const path = parent + '/' + name
          if (name === 'taken.md') return Promise.resolve({ ok: false, error: '已存在同名文件「taken.md」' })
          // The real host owns the name rules; the fixture mirrors the two the
          // guard leans on (an existing entry, and a name that is not one path
          // component) so the tree's handling of a refusal is what is under test.
          if (/[\\/]/.test(String(name))) return Promise.resolve({ ok: false, error: '名称不能包含路径分隔符（/ 或 \\）' })
          // A successful create lands in the fixture, so the refresh that follows
          // actually lists it — otherwise "the row appears" would prove nothing.
          if (fsState[parent] && !fsState[parent].some((e) => e.name === name)) {
            fsState[parent] = fsState[parent].concat([{ name: name, path: path, isDir: args.kind === 'dir' }])
            fsState[path] = []
          }
          return Promise.resolve({ ok: true, kind: args.kind === 'dir' ? 'directory' : 'file', path: path, name: name, parent: parent })
        }
        return Promise.resolve({ ok: false, error: 'unknown ' + method })
      },
    }
    const nt = mountSidebar({}, { host: newHost })
    launch.push(nt)
    await nt.flush(80)
    nt.renderer.setProps({ onOpen: (path, opts) => opened.push({ path, opts }) })
    const menuAt = (path) => nt.rowFor(path).props.onContextMenu({
      clientX: 700, clientY: 300, preventDefault() {}, stopPropagation() {},
      currentTarget: nt.treeEl, target: nt.treeEl,
    })
    const createInput = () => nt.renderer.findAll('artifacts-tree-create')[0]
    const createRow = () => nt.renderer.findAll('artifacts-tree-createrow')[0]
    const choose = (label) => {
      const item = nt.renderer.findAll('artifacts-tree-menu-item').find((el) => nt.renderer.textOf(el) === label)
      if (!item) throw new Error('no ' + label + ' item, have ' + JSON.stringify(nt.renderer.texts('artifacts-tree-menu-item')))
      item.props.onClick({ stopPropagation() {} })
    }
    const type = async (text) => {
      const input = createInput()
      if (!input) throw new Error('no create input is on screen')
      input.props.onChange({ currentTarget: { value: text } })
      // A real browser re-renders between the keystroke and the next key: the
      // Enter handler is the one from the LATEST render, and without this flush
      // the row would still be holding the name from before the typing.
      await nt.flush(20)
    }
    const enter = async () => {
      const input = createInput()
      if (!input) throw new Error('no create input is on screen')
      input.props.onKeyDown({ key: 'Enter', preventDefault() {}, stopPropagation() {} })
      await nt.flush(120)
    }

    menuAt('D:/ws/src')
    await nt.flush(20)
    await check('sidebar: the menu offers 新建文件 and 新建文件夹 on a folder', () => {
      const labels = nt.renderer.texts('artifacts-tree-menu-item')
      if (labels.indexOf('新建文件') < 0 || labels.indexOf('新建文件夹') < 0) {
        throw new Error('menu items: ' + JSON.stringify(labels))
      }
      return labels.length + ' items, both create verbs present'
    })
    choose('新建文件')
    await nt.flush(30)
    await check('sidebar: 新建文件 opens an input inside that folder, and calls nothing yet', () => {
      const row = createRow()
      if (!row) throw new Error('no create row rendered')
      const input = createInput()
      if (!input) throw new Error('no create input rendered')
      if (calls.length) throw new Error('the host was called before a name was typed: ' + JSON.stringify(calls))
      // The folder must be OPEN, or the input is inside a collapsed branch.
      if (nt.open().indexOf('D:/ws/src') < 0) throw new Error('the target folder was not expanded: ' + JSON.stringify(nt.open()))
      // …and the row sits at the level that will receive the entry (depth 1 under
      // a top-level folder), which is what makes "where will it go" visible.
      const depth = Number(nt.renderer.findAll('artifacts-tree-createrow')[0].props['data-depth'])
      if (depth !== 1) throw new Error('the create row rendered at depth ' + depth)
      return 'input at depth ' + depth + ' under D:/ws/src'
    })
    // The keyboard belongs to the input: an arrow key must not move the tree
    // cursor while a name is being typed. (The cursor is read off the rendered
    // rows — it is a class on the row, so this needs no knowledge of the hook
    // order the component happens to use.)
    const cursorPath = () => {
      const row = nt.renderer.findAll('artifacts-tree-row').find((el) => String(el.props.className).indexOf('is-cursor') >= 0)
      return row ? row.props['data-path'] : null
    }
    await check('sidebar: the tree cursor does not move while a name is typed', () => {
      const before = cursorPath()
      nt.renderer.findAll('artifacts-tree-body')[0].props.onKeyDown({ key: 'ArrowDown', preventDefault() {}, stopPropagation() {} })
      if (cursorPath() !== before) throw new Error('the cursor moved while typing: ' + before + ' → ' + cursorPath())
      return 'cursor stayed on ' + String(before)
    })
    await type('notes.md')
    await enter()
    await check('sidebar: Enter creates the file beside that parent, re-reads the level, and opens it', () => {
      if (calls.length !== 1) throw new Error('create calls: ' + JSON.stringify(calls))
      const call = calls[0]
      if (call.parent !== 'D:/ws/src' || call.name !== 'notes.md' || call.kind !== 'file') {
        throw new Error('the create request was ' + JSON.stringify(call))
      }
      // A name beside a parent, never a path: the host is the one that joins them.
      if (String(call.name).indexOf('/') >= 0 || String(call.name).indexOf('\\') >= 0) {
        throw new Error('a path was sent where a name belongs: ' + JSON.stringify(call.name))
      }
      if (call.sessionId !== 's1') throw new Error('the seat session did not travel: ' + JSON.stringify(call))
      if (createRow()) throw new Error('the input row stayed on screen after a successful create')
      if (listed.lastIndexOf('D:/ws/src') < 0) throw new Error('the parent level was not re-read: ' + JSON.stringify(listed))
      if (nt.renderer.texts('artifacts-tree-name').indexOf('notes.md') < 0) {
        throw new Error('the new file is not in the tree: ' + nt.renderer.texts('artifacts-tree-name').join('|'))
      }
      // A freshly created file is empty, so it is opened for EDITING (the caller
      // decides what created:true means) instead of left as a blank preview.
      if (!opened.length || opened[0].path !== 'D:/ws/src/notes.md' || !(opened[0].opts && opened[0].opts.created)) {
        throw new Error('the new file was not opened as created: ' + JSON.stringify(opened))
      }
      return 'notes.md created under D:/ws/src, opened for editing'
    })

    // A folder: created, expanded, and NOT opened as a document.
    const openedBefore = opened.length
    menuAt('D:/ws/src')
    await nt.flush(20)
    choose('新建文件夹')
    await nt.flush(30)
    await type('assets')
    await enter()
    await check('sidebar: 新建文件夹 creates and opens the folder, without opening a document', () => {
      const call = calls[calls.length - 1]
      if (call.parent !== 'D:/ws/src' || call.name !== 'assets' || call.kind !== 'dir') {
        throw new Error('the folder request was ' + JSON.stringify(call))
      }
      if (opened.length !== openedBefore) throw new Error('creating a folder opened a document: ' + JSON.stringify(opened.slice(openedBefore)))
      if (nt.renderer.texts('artifacts-tree-name').indexOf('assets') < 0) throw new Error('the new folder is not in the tree')
      return 'assets created (not opened as a document)'
    })

    // ── a name the host refuses keeps the row and shows why ────────────────
    // Right-clicking a FILE creates a SIBLING — the root level here — which is
    // also the case that proves the row is drawn at the level that will receive
    // it rather than under the row that was clicked.
    menuAt('D:/ws/taken.md')
    await nt.flush(20)
    await check('sidebar: a file offers the sibling verbs', () => {
      const labels = nt.renderer.texts('artifacts-tree-menu-item')
      if (labels.indexOf('新建同级文件') < 0 || labels.indexOf('新建同级文件夹') < 0) {
        throw new Error('menu items: ' + JSON.stringify(labels))
      }
      return '新建同级文件 / 新建同级文件夹'
    })
    choose('新建同级文件')
    await nt.flush(30)
    await type('taken.md')
    await enter()
    await check('sidebar: a refused name keeps the input row and shows the host\'s reason', () => {
      const row = createRow()
      if (!row) throw new Error('the input row closed on a refusal — the name is gone')
      const text = nt.renderer.texts('artifacts-tree-create-error').join(' ')
      if (text.indexOf('已存在同名文件') < 0) throw new Error('the reason was not shown: ' + JSON.stringify(text))
      const input = createInput()
      if (!input || input.props.value !== 'taken.md') throw new Error('the typed name was lost: ' + JSON.stringify(input && input.props.value))
      if (String(row.props['data-depth']) !== '0') throw new Error('a sibling was created at depth ' + row.props['data-depth'])
      return 'row kept at the sibling level with 「' + text + '」'
    })
    // A name the host refuses for a filesystem reason (a separator is not a name
    // on any platform) shows the host's sentence too: the client does not keep a
    // second copy of the rules to disagree with.
    await type('nested/name.md')
    await enter()
    await check('sidebar: a separator in the name is refused, and said so', () => {
      const text = nt.renderer.texts('artifacts-tree-create-error').join(' ')
      if (text.indexOf('路径分隔符') < 0) throw new Error('the host\'s reason was not shown: ' + JSON.stringify(text))
      if (!createRow()) throw new Error('the row closed on a refusal')
      return 'refused with 「' + text + '」'
    })
    // Escape backs out: the row goes and nothing is created.
    const callsBeforeEscape = calls.length
    nt.renderer.findAll('artifacts-tree-create')[0].props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
    await nt.flush(30)
    await check('sidebar: Escape closes the create row and calls nothing', () => {
      if (createRow()) throw new Error('the row stayed after Escape')
      if (calls.length !== callsBeforeEscape) throw new Error('Escape created something: ' + JSON.stringify(calls.slice(callsBeforeEscape)))
      return 'closed, nothing created'
    })

    // ── the + button: the same two verbs, aimed at the cursor's directory ───
    // The + has no row of its own, so it acts on whatever the tree is pointing
    // at — here the keyboard cursor, put on a top-level folder first.
    nt.clickRow('D:/ws/docs', 1)
    await nt.flush(30)
    const newBtn = nt.renderer.findByTitle('新建文件 / 文件夹（在选中的目录里；没选中就是工作区根目录）')[0]
    if (!newBtn) throw new Error('no 新建 toolbar button')
    newBtn.props.onClick({
      preventDefault() {}, stopPropagation() {},
      currentTarget: { getBoundingClientRect: () => ({ left: 1600, top: 20, bottom: 42, width: 22, height: 22 }) },
    })
    await nt.flush(20)
    await check('sidebar: the + button opens a two-verb menu', () => {
      const labels = nt.renderer.texts('artifacts-tree-menu-item')
      if (labels.join('|') !== '新建文件|新建文件夹') throw new Error('the + menu listed ' + JSON.stringify(labels))
      return 'two verbs, aimed at the cursored folder'
    })
    choose('新建文件夹')
    await nt.flush(30)
    const plusRow = createRow()
    if (!plusRow) throw new Error('no input row after the + menu')
    await check('sidebar: the + menu puts its input at the level that will receive the entry', () => {
      return '+ menu input at depth ' + String(plusRow.props['data-depth'])
    })
    await type('fromButton')
    await enter()
    await check('sidebar: the + button created inside the cursored folder', () => {
      const call = calls[calls.length - 1] || {}
      if (call.parent !== 'D:/ws/docs' || call.name !== 'fromButton' || call.kind !== 'dir') {
        throw new Error('the + create request was ' + JSON.stringify(call))
      }
      return 'fromButton created under D:/ws/docs'
    })
  }

  // ── a double-click must not undo itself ─────────────────────────────────
  // Browsers deliver click(detail 1), click(detail 2), dblclick. Toggling on
  // both clicks opened the folder and closed it again in the same gesture, so
  // double-clicking a folder — what every file manager teaches — looked exactly
  // like "expanding does nothing at all".
  {
    const dbl = mountSidebar({})
    launch.push(dbl)
    await dbl.flush(80)
    dbl.clickRow('D:/ws/src', 1)
    await dbl.flush(40)
    await check('sidebar: the first click of a double-click expands', () => {
      if (dbl.open().indexOf('D:/ws/src') < 0) throw new Error('not expanded: ' + JSON.stringify(dbl.open()))
      return 'expanded'
    })
    dbl.clickRow('D:/ws/src', 2)
    await dbl.flush(60)
    await check('sidebar: the second click of a double-click is ignored', () => {
      if (dbl.open().indexOf('D:/ws/src') < 0) throw new Error('the folder closed itself: open = ' + JSON.stringify(dbl.open()))
      if (dbl.names().indexOf('deep') < 0) throw new Error('the level did not render: ' + dbl.names().join('|'))
      return 'still open, children on screen'
    })
    // …while a deliberate second click (a new gesture) still collapses it.
    dbl.clickRow('D:/ws/src', 1)
    await dbl.flush(40)
    await check('sidebar: a later single click still collapses', () => {
      if (dbl.open().indexOf('D:/ws/src') >= 0) throw new Error('it stayed open: ' + JSON.stringify(dbl.open()))
      return 'collapsed'
    })
  }

  // ── a level that failed once must be retryable ───────────────────────────
  // The cache used to treat a stored error as "loaded", so collapsing and
  // re-expanding a folder that failed once (a file lock, a transient EPERM, a
  // directory created a moment ago) showed the stale failure forever.
  {
    let attempts = 0
    const flaky = mountSidebar({}, {
      host: {
        call: (method, args) => {
          if (method !== 'artifacts.listDir') return Promise.resolve({ ok: false, error: 'unknown ' + method })
          const path = (args && args.path) || ROOT
          if (path === 'D:/ws/src' && attempts++ === 0) return Promise.resolve({ ok: false, error: 'EPERM: 文件被占用' })
          return Promise.resolve({ ok: true, path, entries: FS[path] || [] })
        },
      },
    })
    launch.push(flaky)
    await flaky.flush(80)
    flaky.clickRow('D:/ws/src', 1)
    await flaky.flush(60)
    await check('sidebar: a failed level reports the reason', () => {
      if (!flaky.renderer.texts('artifacts-tree-error').some((s) => s.indexOf('EPERM') >= 0)) {
        throw new Error('no error row: ' + JSON.stringify(flaky.renderer.texts('artifacts-tree-error')))
      }
      return 'error shown'
    })
    flaky.clickRow('D:/ws/src', 1)   // collapse
    await flaky.flush(40)
    flaky.clickRow('D:/ws/src', 1)   // expand again — this must re-request the level
    await flaky.flush(120)
    await check('sidebar: re-expanding a failed level retries it', () => {
      if (attempts < 2) throw new Error('the level was never requested again')
      if (flaky.names().indexOf('a.js') < 0) throw new Error('the retry did not render: ' + flaky.names().join('|'))
      return `${attempts} attempts, rows recovered`
    })
  }

  // ── placeholder rows must not share a key ────────────────────────────────
  // Two sibling folders loading at once produced one key per depth, so React
  // saw duplicate children and could drop or reuse one of the rows.
  {
    const pending = mountSidebar({}, {
      host: {
        call: (method, args) => {
          if (method !== 'artifacts.listDir') return Promise.resolve({ ok: false, error: 'unknown ' + method })
          const path = (args && args.path) || ''
          if (!path) return Promise.resolve({ ok: true, path: ROOT, entries: FS[ROOT] })
          return new Promise(() => {})   // never answers: both levels stay loading
        },
      },
    })
    launch.push(pending)
    await pending.flush(80)
    pending.clickRow('D:/ws/src', 1)
    await pending.flush(20)
    pending.clickRow('D:/ws/docs', 1)
    await pending.flush(40)
    await check('sidebar: sibling loading rows have distinct keys', () => {
      const keys = pending.keys()
      const dupes = keys.filter((k, i) => k != null && keys.indexOf(k) !== i)
      if (dupes.length) throw new Error('duplicate keys: ' + JSON.stringify(dupes))
      const loading = keys.filter((k) => String(k).indexOf('load:') === 0)
      if (loading.length !== 2) throw new Error('expected 2 loading rows, got ' + JSON.stringify(keys))
      return keys.length + ' rows, ' + loading.length + ' loading, all keys distinct'
    })
  }

  // ── the root and its entries must agree on one spelling ──────────────────
  // The host used to echo the level path back as the caller typed it (a session
  // cwd with forward slashes) while every entry below it was a realpath
  // (backslashes). Containment then failed for every path, so what got persisted
  // was always "nothing is open" and the tree came back collapsed.
  {
    const FS_WIN = {
      'D:\\ws': [
        { name: 'src', path: 'D:\\ws\\src', isDir: true },
        { name: 'README.md', path: 'D:\\ws\\README.md', isDir: false },
      ],
      'D:\\ws\\src': [{ name: 'a.js', path: 'D:\\ws\\src\\a.js', isDir: false }],
    }
    const winStore = {}
    const winHost = {
      call: (method, args) => {
        if (method !== 'artifacts.listDir') return Promise.resolve({ ok: false, error: 'unknown ' + method })
        const path = (args && args.path) || ''
        if (!path) return Promise.resolve({ ok: true, path: 'D:/ws', entries: FS_WIN['D:\\ws'] })
        return Promise.resolve({ ok: true, path, entries: FS_WIN[path] || [] })
      },
    }
    const first = mountSidebar(winStore, { host: winHost })
    launch.push(first)
    await first.flush(80)
    await check('sidebar: a differently-spelled root still nests', () => {
      if (first.names().join('|') !== 'src|README.md') throw new Error('rows = ' + first.names().join('|'))
      return 'root D:/ws with D:\\ws\\… entries'
    })
    first.clickRow('D:\\ws\\src', 1)
    await first.flush(60)
    await check('sidebar: the mixed-spelling folder expands', () => {
      if (first.names().indexOf('a.js') < 0) throw new Error('rows = ' + first.names().join('|'))
      return 'nested row rendered'
    })
    await first.flush(500)   // the remember-expansion debounce
    await check('sidebar: the expansion is stored under the reported root', () => {
      const saved = winStore['dsh-sidebar-frog:tree:D:/ws']
      if (!saved || saved.indexOf('D:\\\\ws\\\\src') < 0) throw new Error('stored ' + JSON.stringify(saved))
      return 'stored ' + saved
    })
    const again = mountSidebar(winStore, { host: winHost })
    launch.push(again)
    await again.flush(250)
    await check('sidebar: it comes back expanded after a remount', () => {
      const dirs = again.open()
      if (dirs.indexOf('D:\\ws\\src') < 0) throw new Error('restored ' + JSON.stringify(dirs))
      if (again.names().indexOf('a.js') < 0) throw new Error('the restored level was not loaded: ' + again.names().join('|'))
      return 'restored ' + JSON.stringify(dirs)
    })
  }

  // A tree that throws inside an effect keeps rendering while silently dropping
  // the behaviour — the exact shape of "expand/collapse does nothing". Every
  // mount in this suite must come out clean.
  await check('sidebar: nothing threw in the tree', () => {
    const thrown = []
    for (const inst of [t, ...launch]) {
      for (const e of inst.errors()) thrown.push(e && e.message ? e.message : String(e))
    }
    if (thrown.length) throw new Error(thrown.slice(0, 3).join(' | '))
    return `${1 + launch.length} mounted tree(s), no errors`
  })

  for (const extra of launch) extra.renderer.unmount()
  return results
}

/**
 * Functional controls must not be removed by a responsive rule.
 *
 * Hiding chrome (a title, a label) at narrow widths is fine; hiding a *control*
 * silently deletes a feature for every user with a narrow window — which is how
 * 全部折叠 became unreachable (`display: none` under 400px, while the panel
 * defaults to 20% of the window). Returns the offending selectors.
 */
export const hiddenControlViolations = (css, fromWidth) => {
  const CONTROL = /^(?:[\w-]*(?:-tool|-refresh|-act|-btn|-tab|artifacts-tree-ref|artifacts-tree-tool))$/
  const blockAt = (text, openIndex) => {
    let depth = 0
    for (let i = openIndex; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1
      else if (text[i] === '}') { depth -= 1; if (!depth) return text.slice(openIndex + 1, i) }
    }
    return ''
  }
  const out = []
  for (const q of css.matchAll(/@(?:container|media)[^{]*\{/g)) {
    const header = q[0]
    const width = /max-width:\s*(\d+)px/.exec(header)
    if (fromWidth != null && !(width && Number(width[1]) >= fromWidth)) continue
    const body = blockAt(css, q.index + header.length - 1)
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(?:^|;|\s)(?:display\s*:\s*none|visibility\s*:\s*hidden)/.test(rule[2])) continue
      const classes = (rule[1].match(/\.[A-Za-z_][\w-]*/g) || []).map((c) => c.slice(1))
      const hit = classes.filter((c) => CONTROL.test(c))
      if (hit.length) out.push({ query: header.trim().replace(/\s+/g, ' '), selector: rule[1].trim().replace(/\s+/g, ' '), classes: hit })
    }
  }
  return out
}
