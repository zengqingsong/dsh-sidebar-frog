// ── File tree (文件树) — IDE-style explorer ──────────────────────────────────
//
// Appearance follows a typical IDE explorer (VS Code's mostly): 22px flat
// rows, a disclosure chevron, per-type coloured file icons, indent guides,
// square selection, and always-visible change letters (A/M) for the files the
// agent created or edited.
//
// Interaction habits borrowed from an IDE:
//   • ↑/↓ move the cursor · → expands or walks into a folder · ← collapses or
//     walks out · Enter previews · Home/End jump · typing does type-ahead
//   • right-click opens a context menu (open / copy path / copy relative path /
//     @引用 / refresh this folder / expand-collapse all)
//   • single click previews a file, double click pins it (italic = preview)
//   • F5 re-reads every expanded folder; the header expands/collapses all
//   • the expansion state is remembered per workspace root
//   • an explorer-style filter box: host-side recursive search when the host
//     exposes /search, otherwise it filters the levels already loaded
//   • "reveal": the ancestors of the file being previewed expand and scroll in
//
// Every directory level stays cached on its own (keyed by absolute path), so
// the per-folder ↻ re-reads exactly one level and leaves the rest — expansion,
// sibling contents, scroll position — untouched.

// Where the context menu is mounted.
//
// A context menu belongs at the pointer, and "at the pointer" only means
// something in viewport coordinates. Inside the panel that is not where a
// `position: fixed` box is measured from: `.artifacts-panel` sets
// `container-type: inline-size`, which is layout containment, so the PANEL is the
// containing block — a menu left in there is placed (and clipped) against the
// panel, and any coordinate we hand it is silently reinterpreted. Converting
// clientX/clientY into panel space was the previous workaround; a portal removes
// the whole class of bug (containment, an overflowing ancestor, a transformed
// one) and matches the popout tab, whose menu has always hung off <body>.
//
// react-dom is not guaranteed (the dynamic runner injects only `react`), so the
// in-panel path stays as the fallback — it computes panel-relative coordinates.
const MENU_PORTAL_TARGET = (typeof document !== 'undefined' && document.body) || null
const MENU_PORTAL = !!(ReactDOM && typeof ReactDOM.createPortal === 'function' && MENU_PORTAL_TARGET)

const FileTree = (props) => {
  const [tree, setTree] = React.useState(() => ({
    root: null,      // { path, entries } — the workspace root level
    loading: false,  // root level read in flight
    error: null,     // last root read error (rows stay on screen)
    children: {},    // dir path -> { entries } | { entries, error } | { loading } | { error }
    expanded: {},    // dir path -> bool
    busy: {},        // dir path -> single-level refresh in flight (row spinner)
  }))
  const treeRef = React.useRef(tree)
  // Patch state and keep the snapshot ref in step, so event handlers can read
  // the freshest tree without waiting for a re-render (no stale closures).
  //
  // The patch is applied to the REF, and that result becomes the state. It used
  // to be applied inside the functional updater instead, which meant the ref was
  // only correct once React got around to rendering: anything reading it in the
  // meantime — a second click, an effect, an in-flight fetch's callback — could
  // act on a snapshot the update had not produced yet, and the ref was the one
  // place the two could disagree. Computing it here makes the ref and the state
  // the same object at every moment.
  const apply = (patch) => {
    const next = patch(treeRef.current)
    treeRef.current = next
    setTree(next)
    return next
  }

  const [filterOpen, setFilterOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [search, setSearch] = React.useState(null)   // { loading, results, offline, error }
  const [menu, setMenu] = React.useState(null)       // { x, y, path, name, isDir, index }
  const [cursor, setCursor] = React.useState(null)   // keyboard cursor path
  const [copiedPath, setCopiedPath] = React.useState(null)
  const [copiedLabel, setCopiedLabel] = React.useState('')
  const [flashPath, setFlashPath] = React.useState(null)
  // Delete: a destructive action, so the menu item only ARMS it. `confirmDel`
  // holds the entry awaiting the confirm dialog; `delBusy` is the in-flight host
  // call that disables 删除 so a double click cannot fire it twice.
  const [confirmDel, setConfirmDel] = React.useState(null)
  const [delBusy, setDelBusy] = React.useState(false)
  // 新建: the inline row that asks for a name. `parent` is the directory the
  // entry will be created in (the workspace root when it is the root), so the
  // row can be drawn at the level it belongs to — under the folder it will land
  // in, not floating at the top of the tree. `error` is the host's own sentence
  // when it refuses (an existing entry, a name Windows will not take).
  const [creating, setCreating] = React.useState(null)   // { parent, kind, name, error, busy }

  const rootTimer = React.useRef(null)
  const copyTimer = React.useRef(null)
  const flashTimer = React.useRef(null)
  const searchTimer = React.useRef(null)
  const persistTimer = React.useRef(null)
  const typeBuf = React.useRef({ text: '', at: 0 })
  const listRef = React.useRef(null)
  const filterRef = React.useRef(null)
  // The 新建 input, so the tree can put the caret in it and scroll it into view.
  const createRef = React.useRef(null)
  // The menu box itself: focused on open, and measured so it can be nudged back
  // inside the window (see the fit effect next to the close-on-click one).
  const menuRef = React.useRef(null)

  // Which session this tree is rooted at.
  //
  // The SEAT's own id wins whenever the shell handed one down: a native tab body
  // is a session-scoped slot, so `props.sessionId` IS the session that tab lives
  // in, and every host call below is fenced to that session's workspace. The
  // root read (currentSessionId) is the fallback for the surfaces with no seat of
  // their own — the floating panel and the standalone popout page.
  //
  // The distinction is not theoretical: with only the root read, an empty id made
  // every request "unnamed", and the host answers an unnamed request with the
  // MOST RECENT session's workspace — the right directory by luck, until the user
  // switches workspace or session.
  const seatSessionId = () => (props && typeof props.sessionId === 'string' && props.sessionId)
    || currentSessionId()

  // Track the active session so the tree re-roots automatically when the
  // workspace changes (no manual refresh needed).
  const [sessionId, setSessionId] = React.useState(seatSessionId())
  React.useEffect(() => { setSessionId(seatSessionId()) }, [props && props.sessionId])
  React.useEffect(() => {
    let list
    try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) { }
    if (!list || typeof list.subscribe !== 'function') return
    return list.subscribe(() => setSessionId(seatSessionId()))
  }, [])

  // ── data ────────────────────────────────────────────────────────────────
  // Read one directory level. `path` empty ⇒ the root resolved from the session.
  const fetchDir = (path) => host.call('artifacts.listDir', {
    path: path || undefined,
    sessionId: seatSessionId(),
  }).then((res) => (res && res.ok
    ? { entries: Array.isArray(res.entries) ? res.entries : [], path: res.path }
    : { error: (res && res.error) || '读取失败' }
  )).catch(() => ({ error: '读取失败' }))

  // A directory that disappears takes its cached descendants and their
  // expansion state with it, so a path that comes back later is fetched fresh
  // instead of resurrecting stale contents. Containment is delegated to the
  // shared helper (src/shared/paths.js): the popout tree compares the very same
  // host-issued strings, so both halves must agree on separator and case.
  const pruneMissing = (children, expanded, oldEntries, newEntries) => {
    const alive = {}
    for (const e of newEntries) alive[e.path] = true
    for (const e of (oldEntries || [])) {
      if (!e.isDir || alive[e.path]) continue
      for (const key of Object.keys(children)) if (pathUnder(key, e.path)) delete children[key]
      for (const key of Object.keys(expanded)) if (pathUnder(key, e.path)) delete expanded[key]
    }
  }

  const flash = (path) => {
    clearTimeout(flashTimer.current)
    setFlashPath(path)
    flashTimer.current = setTimeout(() => setFlashPath(null), 900)
  }

  // Reload the workspace root level. `hard` throws every cached level and the
  // expansion state away (workspace switch); the default keeps both, so
  // refreshing never collapses the tree under the user.
  const loadRoot = (hard) => {
    clearTimeout(rootTimer.current)
    apply((prev) => (hard
      ? { root: null, loading: true, error: null, children: {}, expanded: {}, busy: {} }
      : { ...prev, loading: true }))
    // A freshly switched-to workspace may not be resolvable on the host for a
    // beat (its session is still loading/persisting). Retry briefly.
    const attempt = (tries) => {
      fetchDir('').then((res) => {
        if (res.error && tries > 0) {
          rootTimer.current = setTimeout(() => attempt(tries - 1), 400)
          return
        }
        apply((prev) => {
          // A failed refresh keeps the rows already on screen and only reports
          // the reason — a transient error must not blank the whole tree.
          if (res.error) return { ...prev, loading: false, error: res.error }
          const children = { ...prev.children }
          const expanded = { ...prev.expanded }
          pruneMissing(children, expanded, prev.root && prev.root.entries, res.entries)
          return { ...prev, loading: false, error: null, root: { path: res.path, entries: res.entries }, children, expanded }
        })
      })
    }
    attempt(hard ? 3 : 1)
  }

  // Load a level that is expanded but has no cached contents yet (used by the
  // remembered expansion state, expand-all and reveal), or retry one whose only
  // cached result is a failure.
  //
  // The "in flight" mark goes through `apply`, so a second caller in the same
  // tick cannot start a duplicate request. A level holding an *error* is
  // deliberately not treated as loaded: a folder that failed once (a file lock,
  // a transient EPERM, a directory being created right now) used to keep showing
  // that failure for the rest of the session, because the cached node
  // short-circuited every later attempt — the user collapsed and re-expanded it
  // and nothing happened.
  const ensureLoaded = (path) => {
    if (!path) return false
    const snap = treeRef.current
    if (snap.busy[path]) return false
    const node = snap.children[path]
    if (node && !node.error) return false   // loaded, or already in flight
    apply((prev) => ({
      ...prev,
      children: {
        ...prev.children,
        [path]: node && node.entries ? { entries: node.entries, loading: true } : { loading: true },
      },
    }))
    fetchDir(path).then((res) => {
      apply((prev) => {
        const cur = prev.children[path] || {}
        // A retry that fails again keeps whatever rows it already had, exactly
        // like a failed single-level refresh.
        const entries = res.entries || cur.entries
        return {
          ...prev,
          children: {
            ...prev.children,
            [path]: res.error
              ? (entries ? { entries, error: res.error } : { error: res.error })
              : { entries: res.entries },
          },
        }
      })
    })
    return true
  }

  // Re-read ONE directory. Rows already loaded stay visible while the request
  // is in flight (the row spins); nothing else in the tree is touched.
  const refreshDir = (path) => {
    if (treeRef.current.busy[path]) return
    apply((prev) => {
      const node = prev.children[path] || {}
      return {
        ...prev,
        children: { ...prev.children, [path]: { entries: node.entries, loading: !node.entries, refreshing: true } },
        expanded: { ...prev.expanded, [path]: true },
        busy: { ...prev.busy, [path]: true },
      }
    })
    fetchDir(path).then((res) => {
      apply((prev) => {
        const busy = { ...prev.busy }
        delete busy[path]
        const node = prev.children[path] || {}
        if (res.error) {
          return {
            ...prev,
            busy,
            children: {
              ...prev.children,
              [path]: node.entries ? { entries: node.entries, error: res.error } : { error: res.error },
            },
          }
        }
        const children = { ...prev.children, [path]: { entries: res.entries } }
        const expanded = { ...prev.expanded }
        pruneMissing(children, expanded, node.entries, res.entries)
        return { ...prev, busy, children, expanded }
      })
      flash(path)
    })
  }

  const toggle = (path, force) => {
    const snap = treeRef.current
    const isOpen = !!snap.expanded[path]
    const want = force == null ? !isOpen : !!force
    // A manual collapse cancels an expand-all in flight, otherwise the
    // continuing intent would immediately re-open what the user just closed.
    if (!want) expandingAll.current = { on: false, idle: 0 }
    apply((prev) => ({ ...prev, expanded: { ...prev.expanded, [path]: want } }))
    setCursor(path)
    if (want) ensureLoaded(path)
  }

  // Expand-all keeps working as deeper levels arrive: the first pass can only
  // open what is cached, so the effect below re-walks on every tree change
  // until a few passes add nothing new.
  const expandingAll = React.useRef({ on: false, idle: 0 })

  const expandAll = () => {
    expandingAll.current = { on: true, idle: 0 }
    expandLoaded()
  }

  const expandLoaded = () => {
    const snap = treeRef.current
    const expanded = { ...snap.expanded }
    let added = 0
    let budget = 400
    const walk = (entries) => {
      for (const e of (entries || [])) {
        if (!e.isDir || budget <= 0) continue
        budget -= 1
        if (!expanded[e.path]) { expanded[e.path] = true; added += 1 }
        const node = snap.children[e.path]
        if (node && node.entries) walk(node.entries)
      }
    }
    walk(snap.root && snap.root.entries)
    if (added) apply((prev) => ({ ...prev, expanded }))
    return added
  }

  const collapseAll = () => {
    expandingAll.current = { on: false, idle: 0 }
    apply((prev) => ({ ...prev, expanded: {} }))
  }

  // F5: re-read the root plus every folder currently expanded (no collapse).
  const refreshExpanded = () => {
    const snap = treeRef.current
    const dirs = Object.keys(snap.expanded).filter((p) => snap.expanded[p])
    loadRoot(false)
    dirs.slice(0, 60).forEach((p) => refreshDir(p))
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  const rootPath = tree.root && tree.root.path ? tree.root.path : ''

  const relPath = (path) => (rootPath ? pathRelativeTo(path, rootPath) : path)

  const copyText = (text, label) => {
    const done = () => {
      setCopiedPath(menu ? menu.path : null)
      setCopiedLabel(label)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => { setCopiedPath(null); setCopiedLabel('') }, 1600)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
    } else { fallbackCopy(text); done() }
  }

  const refToComposer = (path) => {
    const text = '@' + path
    if (quoteToComposer(path)) {
      setCopiedPath(path)
      setCopiedLabel('已插入输入框')
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => { setCopiedPath(null); setCopiedLabel('') }, 1600)
      return
    }
    copyText(text, '已复制 @引用')
  }

  // Delete the entry from DISK (the host's /delete route), not just from the
  // 产物 list — that one is 清除 and lives in the ledger view. The host fences
  // the path to the session workspace, and its reason is what the user sees when
  // a deletion is refused (a path outside the workspace, the workspace root
  // itself, a locked file).
  const doDelete = (entry) => {
    if (delBusy) return
    setDelBusy(true)
    host.call('artifacts.delete', { path: entry.path, sessionId: seatSessionId() }).then((res) => {
      setDelBusy(false)
      setConfirmDel(null)
      if (res && res.ok) {
        setFlashLabel(entry.name, '已删除')
        // The level that listed the entry is now stale: re-read the parent (or
        // the root when it was a top-level entry). pruneMissing also drops the
        // cached children and expansion of anything deleted.
        //
        // A top-level entry is listed by tree.root.entries, NOT by tree.children:
        // parentDirOf yields the WORKSPACE ROOT for it, which is truthy — so the
        // old `if (parent)` here called refreshDir(root), writing a
        // children['<root>'] key the renderer never reads, and the deleted row
        // stayed on screen. The parent level equals the root exactly when the
        // entry was top-level; that is when the ROOT, not a child level, is stale.
        const parent = parentDirOf(entry.path)
        if (parent && pathRelativeTo(parent, rootPath) !== '') refreshDir(parent)
        else loadRoot(false)
      } else {
        setFlashLabel(entry.name, (res && res.error) || '删除失败')
      }
    }).catch(() => {
      setDelBusy(false)
      setConfirmDel(null)
      setFlashLabel(entry.name, '删除失败')
    })
  }

  // The directory a tree entry lives in (its parent level), spelled the way the
  // host spells it. Empty for a top-level entry, whose level is the root.
  const parentDirOf = (path) => {
    const text = String(path == null ? '' : path)
    const at = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'))
    if (at <= 0) return ''
    return text.slice(0, at)
  }

  // The directory a 新建 should land in, for the row the person aimed at: a
  // folder takes the entry INSIDE itself, a file takes its own directory (a
  // sibling), and no target at all means the workspace root. One rule for the
  // context menu, the + button and the empty-area right click.
  const createTargetFor = (entry) => {
    if (entry && entry.isDir) return entry.path
    if (entry && entry.path) return parentDirOf(entry.path)
    return rootPath
  }

  // Open the inline name row. A folder that is about to receive the entry must
  // be EXPANDED first: the row is drawn inside that level, and inside a
  // collapsed branch it would be created and never seen.
  const beginCreate = (entry, kind) => {
    const parent = createTargetFor(entry)
    setMenu(null)
    setConfirmDel(null)
    setCreating({ parent: parent || '', kind: kind === 'dir' ? 'dir' : 'file', name: '', error: '', busy: false })
    if (parent && parent !== rootPath) toggle(parent, true)
    const list = listRef.current
    if (list && list.focus) list.focus()
  }

  // Create it. The name goes to the host as a NAME beside a PARENT directory —
  // never as a path — and the host's answer is what the row shows. Only "there
  // is no name at all" is decided here: that is an affordance of this input, not
  // a filesystem rule, and duplicating the host's platform rules in the client
  // is how two rule sets start disagreeing.
  const doCreate = () => {
    const c = creating
    if (!c || c.busy) return
    const name = String(c.name || '').trim()
    if (!name) { setCreating(Object.assign({}, c, { error: '请输入名称' })); return }
    setCreating(Object.assign({}, c, { busy: true, error: '' }))
    host.call('artifacts.create', { parent: c.parent, name: name, kind: c.kind, sessionId: seatSessionId() }).then((res) => {
      if (!res || !res.ok) {
        setCreating(Object.assign({}, c, { busy: false, error: (res && res.error) || '新建失败' }))
        return
      }
      setCreating(null)
      // The level that now holds the entry is stale: re-read the parent, or the
      // root when the entry was created at the top level (tree.root.entries is
      // what lists that level — the same distinction 删除 has to make).
      const parent = c.parent
      if (parent && parent !== rootPath && pathRelativeTo(parent, rootPath) !== '') refreshDir(parent)
      else loadRoot(false)
      setFlashLabel(res.name || name, c.kind === 'dir' ? '已新建文件夹' : '已新建文件')
      const fresh = res.path || ''
      if (fresh) {
        setCursor(fresh)
        // After the level has been re-read, put the new row on screen. A folder
        // is opened; a file opens as a tab (and the caller starts it in 编辑 —
        // a file that was just created is empty, so a preview of it is a blank
        // page, which is not what "新建文件" is for).
        setTimeout(() => { scrollRowIntoView(fresh) }, 120)
        if (c.kind === 'dir') setTimeout(() => toggle(fresh, true), 60)
        else if (props.onOpen) props.onOpen(fresh, { pinned: false, created: true })
      }
    }).catch(() => {
      setCreating(Object.assign({}, c, { busy: false, error: '新建失败' }))
    })
  }

  // Transient feedback that survives the deleted row vanishing: a small banner
  // at the top of the tree body naming the entry and what happened to it, for a
  // couple of seconds.
  const [flashLabel, _setFlashLabelState] = React.useState(null)
  const flashLabelTimer = React.useRef(null)
  const setFlashLabel = (name, label) => {
    clearTimeout(flashLabelTimer.current)
    _setFlashLabelState({ name: name || '', text: label || '' })
    flashLabelTimer.current = setTimeout(() => _setFlashLabelState(null), 2600)
  }

  const openEntry = (entry, pinned) => {
    if (entry.isDir) { toggle(entry.path); return }
    if (props.onOpen) props.onOpen(entry.path, { pinned: !!pinned })
  }

  // ── filter / search ─────────────────────────────────────────────────────
  // Host-side bounded recursive search when available; otherwise fall back to
  // filtering the levels already in the cache (and say so).
  const runSearch = (q) => {
    const text = String(q || '').trim()
    if (!text) { setSearch(null); return }
    setSearch({ loading: true, results: [], local: false })
    host.call('artifacts.search', { q: text, sessionId: seatSessionId(), limit: 200 })
      .then((res) => {
        if (res && res.ok && Array.isArray(res.results)) {
          setSearch({ loading: false, results: res.results, local: false, truncated: !!res.truncated })
          return
        }
        setSearch({ loading: false, results: localSearch(text), local: true })
      })
      .catch(() => setSearch({ loading: false, results: localSearch(text), local: true }))
  }

  const localSearch = (text) => {
    const q = text.toLowerCase()
    const snap = treeRef.current
    const out = []
    const seen = {}
    const walk = (entries) => {
      for (const e of (entries || [])) {
        if (out.length >= 200) return
        if (e.name.toLowerCase().indexOf(q) >= 0 && !seen[e.path]) {
          seen[e.path] = true
          out.push({ name: e.name, path: e.path, isDir: e.isDir })
        }
        if (e.isDir) {
          const node = snap.children[e.path]
          if (node && node.entries) walk(node.entries)
        }
      }
    }
    walk(snap.root && snap.root.entries)
    return out
  }

  const setQueryText = (text) => {
    setQuery(text)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => runSearch(text), 220)
  }

  // ── effects ─────────────────────────────────────────────────────────────
  React.useEffect(() => { loadRoot(true) }, [sessionId])

  React.useEffect(() => () => {
    clearTimeout(rootTimer.current)
    clearTimeout(copyTimer.current)
    clearTimeout(flashTimer.current)
    clearTimeout(searchTimer.current)
    clearTimeout(persistTimer.current)
    clearTimeout(flashLabelTimer.current)
  }, [])

  // Load levels that are expanded but not cached yet (remembered state,
  // expand-all, reveal). Bounded per pass so a big expansion never storms the
  // host.
  React.useEffect(() => {
    const snap = treeRef.current
    const pending = Object.keys(snap.expanded).filter((p) => snap.expanded[p] && !snap.children[p])
    pending.slice(0, 4).forEach((p) => ensureLoaded(p))
    if (!expandingAll.current.on) return
    // Keep an expand-all intent alive until it stops finding new folders.
    const added = expandLoaded()
    expandingAll.current.idle = added ? 0 : expandingAll.current.idle + 1
    if (expandingAll.current.idle > 3) expandingAll.current.on = false
  }, [tree])

  // Remember which folders are open, per workspace root.
  const persistKey = rootPath ? 'dsh-sidebar-frog:tree:' + rootPath : ''
  React.useEffect(() => {
    if (!persistKey) return
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      try {
        const open = Object.keys(treeRef.current.expanded)
          .filter((p) => treeRef.current.expanded[p] && pathUnder(p, rootPath))
        localStorage.setItem(persistKey, JSON.stringify(open))
      } catch (e) { }
    }, 400)
  }, [tree.expanded, persistKey])

  // Restore the remembered expansion once the root is known.
  const restoredFor = React.useRef('')
  React.useEffect(() => {
    if (!rootPath || restoredFor.current === rootPath) return
    restoredFor.current = rootPath
    let open = []
    try { open = JSON.parse(localStorage.getItem('dsh-sidebar-frog:tree:' + rootPath) || '[]') } catch (e) { open = [] }
    if (!Array.isArray(open) || !open.length) return
    const expanded = {}
    for (const p of open) if (typeof p === 'string' && pathUnder(p, rootPath) && !pathUnder(rootPath, p)) expanded[p] = true
    apply((prev) => ({ ...prev, expanded: { ...prev.expanded, ...expanded } }))
  }, [rootPath])

  // Reveal the file being previewed: expand its ancestors and scroll to it.
  const revealing = React.useRef('')
  React.useEffect(() => {
    const target = props.selectedPath
    if (!target || !rootPath || !pathUnder(target, rootPath)) return
    if (revealing.current === target) return
    revealing.current = target
    // Every directory between the root and the file, spelled the way the host
    // spelled the file (a top-level file has none: it is already visible).
    const dirs = pathAncestorsOf(target, rootPath)
    if (!dirs.length) return
    const expanded = {}
    for (const d of dirs) expanded[d] = true
    apply((prev) => ({ ...prev, expanded: { ...prev.expanded, ...expanded } }))
    const step = (i) => {
      if (i >= dirs.length) {
        setTimeout(() => scrollRowIntoView(target), 30)
        return
      }
      ensureLoaded(dirs[i])
      setTimeout(() => step(i + 1), 60)
    }
    step(0)
  }, [props.selectedPath, rootPath])

  // Switching workspaces starts a fresh reveal.
  React.useEffect(() => { revealing.current = '' }, [rootPath])

  // ── visible rows (flat list, IDE style) ─────────────────────────────────
  const filtered = !!query.trim() && !!search && !search.loading
  const rows = []
  if (filtered) {
    for (const r of (search.results || [])) rows.push({ entry: r, depth: r.depth != null ? r.depth : 0, flat: true })
  } else {
    const walk = (entries, depth, parent) => {
      for (const e of (entries || [])) {
        rows.push({ entry: e, depth: depth, flat: false })
        if (!e.isDir || !tree.expanded[e.path]) continue
        const node = tree.children[e.path]
        if (node && node.entries) {
          walk(node.entries, depth + 1, e.path)
          // A refresh that failed after the level had loaded keeps its rows and
          // reports the reason underneath, instead of wiping the level.
          if (node.error) rows.push({ error: node.error, depth: depth + 1, parent: e.path })
        } else if (node && node.error) {
          rows.push({ error: node.error, depth: depth + 1, parent: e.path })
        } else if (node && node.loading) {
          rows.push({ loading: true, depth: depth + 1, parent: e.path })
        }
      }
    }
    if (tree.root) walk(tree.root.entries, 0, '')
  }
  // The 新建 input row takes its place where the entry will appear: directly
  // under the folder that will receive it, or at the top of the tree for the
  // workspace root. Inserted into the row list (not rendered separately) so the
  // guides, the indentation and the scroll position all follow from the tree
  // itself. The keyboard cursor never lands on it — rowIndex skips entry-less
  // rows, and the input stops its own propagation. Inserted BEFORE rowIndex is
  // built, so the indices the keyboard uses stay the indices of this list.
  if (creating && !filtered) {
    const parent = creating.parent
    let at = 0
    let depth = 0
    if (parent && parent !== rootPath) {
      const found = rows.findIndex((r) => r.entry && r.entry.path === parent)
      if (found >= 0) { at = found + 1; depth = rows[found].depth + 1 }
    }
    rows.splice(at, 0, { create: true, depth: depth })
  }
  const rowIndex = {}
  rows.forEach((r, i) => { if (r.entry) rowIndex[r.entry.path] = i })

  // ── keyboard ────────────────────────────────────────────────────────────
  // Attribute selectors are built by hand, so a path with a quote or a stray
  // bracket must not be able to throw here: an exception inside a reveal timer
  // or a key handler would take the whole tree's interaction with it.
  const rowElement = (path) => {
    const list = listRef.current
    if (!list || typeof list.querySelector !== 'function') return null
    try { return list.querySelector('[data-path="' + cssEscape(path) + '"]') } catch (e) { return null }
  }

  const scrollRowIntoView = (path) => {
    const el = rowElement(path)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' })
  }

  const moveCursor = (next) => {
    if (!next) return
    setCursor(next.entry.path)
    scrollRowIntoView(next.entry.path)
  }

  const onKeyDown = (ev) => {
    // The 新建 input owns the keyboard while it is open: an arrow key there must
    // move the caret, not the tree cursor, and Enter is the input's own submit.
    // (The input stops propagation too; this is the belt to that braces, because
    // the body's handler is the one that would otherwise act on the event.)
    if (creating) return
    // The delete confirm is a modal-ish overlay drawn over the tree: Escape
    // cancels it and Enter runs it, everything else is swallowed so it cannot
    // move the cursor or open a file while the question is up.
    if (confirmDel) {
      if (ev.key === 'Escape') { ev.preventDefault(); setConfirmDel(null); return }
      if (ev.key === 'Enter') { ev.preventDefault(); doDelete(confirmDel); return }
      return
    }
    if (menu) { onMenuKeyDown(ev); return }
    const idx = cursor != null ? rowIndex[cursor] : -1
    const cur = idx >= 0 ? rows[idx] : null
    const key = ev.key
    if (key === 'ArrowDown') { ev.preventDefault(); moveCursor(rows[Math.min(rows.length - 1, idx + 1)] || rows[0]); return }
    if (key === 'ArrowUp') { ev.preventDefault(); moveCursor(rows[Math.max(0, idx - 1)]); return }
    if (key === 'Home') { ev.preventDefault(); moveCursor(rows[0]); return }
    if (key === 'End') { ev.preventDefault(); moveCursor(rows[rows.length - 1]); return }
    if (key === 'ArrowRight') {
      ev.preventDefault()
      if (!cur) { moveCursor(rows[0]); return }
      if (cur.entry.isDir) {
        if (!tree.expanded[cur.entry.path]) toggle(cur.entry.path, true)
        else moveCursor(rows[idx + 1])
      }
      return
    }
    if (key === 'ArrowLeft') {
      ev.preventDefault()
      if (!cur) return
      if (cur.entry.isDir && tree.expanded[cur.entry.path]) { toggle(cur.entry.path, false); return }
      for (let i = idx - 1; i >= 0; i -= 1) {
        if (rows[i].depth < cur.depth) { moveCursor(rows[i]); return }
      }
      return
    }
    if (key === 'Enter' || key === ' ') {
      if (!cur) { if (rows[0]) { ev.preventDefault(); moveCursor(rows[0]) } return }
      ev.preventDefault()
      openEntry(cur.entry, false)
      return
    }
    if (key === 'F5') { ev.preventDefault(); refreshExpanded(); return }
    if (key === 'Escape') {
      if (menu) { setMenu(null); return }
      if (query) { setQueryText(''); return }
      return
    }
    // Type-ahead: letters jump to the next entry starting with the buffer.
    if (key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && key !== ' ') {
      const now = Date.now()
      const buf = now - typeBuf.current.at > 700 ? key : typeBuf.current.text + key
      typeBuf.current = { text: buf, at: now }
      const needle = buf.toLowerCase()
      const start = idx + 1
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[(start + i) % rows.length]
        if (String(r.entry.name).toLowerCase().indexOf(needle) === 0) { ev.preventDefault(); moveCursor(r); return }
      }
    }
  }

  const onMenuKeyDown = (ev) => {
    const items = menu ? menuItems(menu) : []
    if (ev.key === 'Escape') { ev.preventDefault(); setMenu(null); return }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setMenu({ ...menu, index: Math.min(items.length - 1, (menu.index || 0) + 1) }); return }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); setMenu({ ...menu, index: Math.max(0, (menu.index || 0) - 1) }); return }
    if (ev.key === 'Enter') { ev.preventDefault(); const it = items[menu.index || 0]; setMenu(null); if (it) it.run(); return }
  }

  // ── context menu ────────────────────────────────────────────────────────
  const menuItems = (m) => {
    const entry = m.entry
    const items = []
    // The + button's own menu: the two create verbs and nothing else. It is the
    // same list the row menu carries, so there is one wording for one action.
    if (m.only === 'create') {
      items.push({ label: '新建文件', run: () => beginCreate(entry, 'file') })
      items.push({ label: '新建文件夹', run: () => beginCreate(entry, 'dir') })
      return items
    }
    if (entry.isDir) {
      const open = !!tree.expanded[entry.path]
      items.push({ label: open ? '折叠文件夹' : '展开文件夹', run: () => toggle(entry.path, !open) })
    } else {
      items.push({ label: '打开预览', run: () => openEntry(entry, false) })
      items.push({ label: '固定预览', run: () => openEntry(entry, true) })
    }
    items.push({ sep: true })
    // 新建 sits at the top of the action group, the way every IDE's explorer
    // orders it. On a folder it creates INSIDE that folder; on a file it creates
    // a sibling — which is what right-clicking a file and choosing New File does
    // everywhere else, and where the input row appears makes it self-evident.
    items.push({ label: entry.isDir ? '新建文件' : '新建同级文件', run: () => beginCreate(entry, 'file') })
    items.push({ label: entry.isDir ? '新建文件夹' : '新建同级文件夹', run: () => beginCreate(entry, 'dir') })
    items.push({ sep: true })
    items.push({ label: '复制路径', run: () => copyText(entry.path, '已复制路径') })
    items.push({ label: '复制相对路径', run: () => copyText(relPath(entry.path), '已复制相对路径') })
    items.push({ label: '@引用到输入框', run: () => refToComposer(entry.path) })
    // Files only, and row-less on purpose: this is the one 「在弹出页打开」 that
    // exists for EVERY file, including the suffixes this plugin never draws
    // (the product renders .html, images, Office and PDF by itself, so no view
    // of ours is on screen to carry the link). window.open of a real address in
    // a click handler is not blocked, and the shared target name reuses one tab.
    if (!entry.isDir) {
      items.push({
        label: '在弹出页打开',
        run: () => { try { window.open(popoutFileHrefFor(sessionId, entry.path), POPOUT_TARGET, 'noopener') } catch (e) {} },
      })
    }
    if (entry.isDir) {
      items.push({ sep: true })
      items.push({ label: '仅刷新此目录', run: () => refreshDir(entry.path) })
      items.push({ label: '展开全部', run: () => { toggle(entry.path, true); expandAll() } })
    }
    items.push({ sep: true })
    // Destructive: the item only opens the confirm dialog — the deletion itself
    // needs the 删除 button in it, so a stray double click can never fire it.
    items.push({
      label: entry.isDir ? '删除文件夹…' : '删除文件…',
      danger: true,
      run: () => setConfirmDel(entry),
    })
    items.push({ label: '全部展开', run: expandAll })
    items.push({ label: '全部折叠', run: collapseAll })
    return items
  }

  // Where `position: fixed` is actually measured from — only needed on the
  // fallback path (see MENU_PORTAL at the top of this file): with the menu
  // portaled to <body> the viewport really is the containing block. When the
  // menu stays inside the panel, the nearest containment context is the origin
  // its coordinates are read in, so walk up for it and express the position in
  // its space. (Container queries and this computed property shipped together
  // (Chrome 105+ / Safari 16+ / Firefox 110+), so an engine that honours
  // `container-type` also reports it here — and an engine that does not is not
  // applying containment either, which is exactly the viewport fallback.)
  const fixedContainingBlock = (from) => {
    const viewport = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    let node = from
    while (node && node.nodeType === 1) {
      let type = ''
      try {
        if (typeof window.getComputedStyle === 'function') {
          const cs = window.getComputedStyle(node)
          const raw = cs && (cs.containerType || (cs.getPropertyValue ? cs.getPropertyValue('container-type') : ''))
          type = typeof raw === 'string' ? raw : ''
        }
      } catch (e) { type = '' }
      if (type && type !== 'normal' && typeof node.getBoundingClientRect === 'function') {
        const r = node.getBoundingClientRect()
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      }
      node = node.parentElement
    }
    return viewport
  }

  const openMenu = (ev, entry) => {
    ev.preventDefault()
    ev.stopPropagation()
    setCursor(entry.path)
    const at = placeMenu(ev.clientX, ev.clientY, ev.currentTarget || ev.target)
    setMenu({ x: at.x, y: at.y, entry, index: 0 })
  }

  // The + button's menu: the same two verbs, aimed at whatever the tree is
  // pointed at (the keyboard cursor's row, else the workspace root) and placed
  // under the button that opened it. Its own target instead of "the row under
  // the pointer", because there is no pointer row — and silently picking one
  // would be a guess about where the file goes.
  const openCreateMenu = (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    const at = placeMenu(
      ev && ev.clientX ? ev.clientX : menuAnchorX(ev),
      ev && ev.clientY ? ev.clientY : menuAnchorY(ev),
      ev && (ev.currentTarget || ev.target),
    )
    const target = cursorEntry() || { path: rootPath, name: basename(rootPath), isDir: true }
    setMenu({ x: at.x, y: at.y, entry: target, index: 0, only: 'create' })
  }

  const menuAnchorX = (ev) => {
    const box = ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect ? ev.currentTarget.getBoundingClientRect() : null
    return box ? box.left : 8
  }
  const menuAnchorY = (ev) => {
    const box = ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect ? ev.currentTarget.getBoundingClientRect() : null
    return box ? box.bottom + 4 : 8
  }

  // The row the keyboard cursor is on, as an entry. The + button has no row of
  // its own, so this is how it stays predictable: whatever the tree is pointing
  // at receives the new entry.
  const cursorEntry = () => {
    if (!cursor) return null
    const find = (entries) => {
      for (const e of (entries || [])) {
        if (e.path === cursor) return e
        const node = treeRef.current.children[e.path]
        if (e.isDir && node && node.entries) {
          const hit = find(node.entries)
          if (hit) return hit
        }
      }
      return null
    }
    return find(treeRef.current.root && treeRef.current.root.entries)
  }

  // Clamp a menu position into the window (and into the panel's own space on the
  // no-portal fallback path).
  const placeMenu = (clientX, clientY, fromEl) => {
    const MENU_W = 210   // min-width 184px + padding, the box we keep on screen
    const MENU_H = 340   // the tallest menu (a directory: 12 items + 3 separators)
    const vx = Math.max(8, Math.min(clientX, window.innerWidth - MENU_W))
    const vy = Math.max(8, Math.min(clientY, window.innerHeight - MENU_H))
    const base = MENU_PORTAL ? null : fixedContainingBlock(fromEl)
    return {
      x: base ? Math.max(8, Math.min(vx - base.left, Math.max(8, base.width - MENU_W))) : vx,
      y: base ? Math.max(8, Math.min(vy - base.top, Math.max(8, base.height - MENU_H))) : vy,
    }
  }

  React.useEffect(() => {
    if (!menu && !confirmDel) return
    const close = () => { setMenu(null); setConfirmDel(null) }
    const onScroll = () => { setMenu(null); setConfirmDel(null) }
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu, confirmDel])

  // Fit the menu inside the window using its REAL box. openMenu clamps with the
  // widest/tallest a menu is expected to be, which is a guess: an item list that
  // came out wider or taller than that would still hang off the edge. Runs before
  // paint (useLayoutEffect where it exists), so the nudge is never visible.
  ;(React.useLayoutEffect || React.useEffect)(() => {
    if (!menu || !MENU_PORTAL) return
    const el = menuRef.current
    if (!el || typeof el.getBoundingClientRect !== 'function') return
    const r = el.getBoundingClientRect()
    const left = r.right > window.innerWidth - 8 ? Math.max(8, window.innerWidth - 8 - r.width) : menu.x
    const top = r.bottom > window.innerHeight - 8 ? Math.max(8, window.innerHeight - 8 - r.height) : menu.y
    if (left !== menu.x || top !== menu.y) setMenu(Object.assign({}, menu, { x: left, y: top }))
  }, [menu])

  // Focus the filter box as soon as it opens.
  React.useEffect(() => {
    if (filterOpen && filterRef.current) filterRef.current.focus()
  }, [filterOpen])

  // ── row rendering ───────────────────────────────────────────────────────
  const statusKind = {}
  for (const it of (Array.isArray(props.items) ? props.items : [])) {
    if (it && it.path) statusKind[it.path] = it.kind === 'create' ? 'A' : 'M'
  }

  const actionsFor = (entry) => React.createElement('span', { className: 'artifacts-tree-actions' },
    entry.isDir ? React.createElement('button', {
      type: 'button',
      className: 'artifacts-tree-act' + (tree.busy[entry.path] ? ' is-busy' : ''),
      title: '仅刷新此目录',
      'aria-label': '仅刷新此目录',
      onClick: (e) => { e.stopPropagation(); refreshDir(entry.path) },
    }, RefreshIcon(13)) : null,
    copiedPath === entry.path
      ? React.createElement('span', { className: 'artifacts-tree-copied' }, copiedLabel || '已复制')
      : React.createElement('button', {
        type: 'button',
        className: 'artifacts-tree-ref',
        title: '引用到输入框（失败则复制 @path）',
        onClick: (e) => { e.stopPropagation(); refToComposer(entry.path) },
      }, '@', React.createElement('span', { className: 'artifacts-tree-ref-text' }, '引用')),
  )

  const renderRow = (row) => {
    const guideUnit = 12
    // The 新建 row: an input at the depth of the directory it will fill, drawn
    // right where the new entry will appear, with the same guides and icons as a
    // real row so it reads as "this is about to exist here". Checked BEFORE the
    // entry-less branch below, which would otherwise draw it as "加载中…".
    if (row.create) {
      const c = creating || { kind: 'file', name: '', error: '', busy: false }
      const depth = row.depth
      const guides = []
      for (let i = 0; i < depth; i += 1) {
        guides.push(React.createElement('span', { key: i, className: 'artifacts-tree-guide', style: { left: 6 + i * 12 } }))
      }
      return React.createElement('div', {
        key: 'create-row',
        className: 'artifacts-tree-row artifacts-tree-createrow' + (c.error ? ' is-invalid' : ''),
        // Depth on the element so the row can be checked where it is drawn, which
        // is the whole point of inserting it into the row list.
        'data-depth': depth,
        'data-creating': c.kind,
        style: { paddingLeft: 4 + depth * 12 },
      },
        guides,
        React.createElement('span', { className: 'artifacts-tree-twisty is-file' }),
        React.createElement('span', { className: 'artifacts-tree-ico artifacts-tree-ico-' + (c.kind === 'dir' ? 'folder' : iconGlyph(c.name || '').kind) },
          c.kind === 'dir' ? FolderClosedIcon(16) : React.createElement(FileTypeGlyph, { size: 16, path: c.name || '' })),
        React.createElement('input', {
          ref: createRef,
          className: 'artifacts-tree-create',
          type: 'text',
          value: c.name,
          disabled: !!c.busy,
          spellCheck: false,
          autoFocus: true,
          'aria-label': c.kind === 'dir' ? '新文件夹名称' : '新文件名称',
          'aria-invalid': c.error ? 'true' : undefined,
          placeholder: c.kind === 'dir' ? '新文件夹名称' : '新文件名称（如 notes.md）',
          onChange: (e) => setCreating(Object.assign({}, c, { name: e.currentTarget.value, error: '' })),
          onKeyDown: (e) => {
            // The input owns these two keys: Enter creates, Escape backs out.
            // stopPropagation keeps the tree's own key handler (which moves the
            // cursor) from reading them as navigation.
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setCreating(null); return }
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); doCreate(); return }
            e.stopPropagation()
          },
          // Clicking anywhere else means "never mind" — the standard explorer
          // behaviour, and the reason a stray click cannot leave a half-typed
          // name parked in the tree. Submitting sets busy, which skips this.
          onBlur: () => { if (!c.busy) setCreating(null) },
        }),
        c.error ? React.createElement('span', { className: 'artifacts-tree-create-error' }, c.error) : null,
        c.busy ? React.createElement('span', { className: 'artifacts-tree-create-hint' }, '新建中…') : null,
      )
    }
    // Non-entry rows: a level that is loading or that failed to load. The key
    // carries the PARENT path, not just the depth — several sibling folders can
    // be loading (or failing) at the same depth at once, and reusing one key for
    // them made React collapse the duplicates into a single reused element.
    if (!row.entry) {
      return React.createElement('div', {
        key: (row.error ? 'err:' : 'load:') + (row.parent || ''),
        className: 'artifacts-tree-row ' + (row.error ? 'artifacts-tree-error' : 'artifacts-tree-loading'),
        style: { paddingLeft: 4 + row.depth * guideUnit + 16 },
      }, row.error || '加载中…')
    }
    const entry = row.entry
    const depth = row.depth
    const flat = row.flat
    const isDir = !!entry.isDir
    const isOpen = isDir && !!tree.expanded[entry.path]
    const isSelected = props.selectedPath === entry.path
    const isCursor = cursor === entry.path
    const kind = statusKind[entry.path]
    const guides = []
    for (let i = 0; i < depth; i += 1) {
      guides.push(React.createElement('span', { key: i, className: 'artifacts-tree-guide', style: { left: 6 + i * guideUnit } }))
    }
    return React.createElement('div', {
      key: entry.path,
      'data-path': entry.path,
      'data-depth': depth,
      role: 'treeitem',
      tabIndex: -1,
      'aria-level': depth + 1,
      'aria-selected': isSelected,
      'aria-expanded': isDir ? isOpen : undefined,
      className: 'artifacts-tree-row' +
        (isDir ? ' artifacts-tree-dir' : '') +
        (entry.hidden ? ' artifacts-tree-hidden' : '') +
        (isSelected ? ' is-selected' : '') +
        (isCursor ? ' is-cursor' : '') +
        (flashPath === entry.path ? ' is-flashed' : '') +
        (tree.busy[entry.path] ? ' is-actions-open' : '') +
        (copiedPath === entry.path ? ' is-actions-open' : '') +
        (flat ? ' is-flat' : ''),
      style: { paddingLeft: 4 + depth * guideUnit },
      title: flat ? entry.path : entry.path,
      onClick: (ev) => {
        setCursor(entry.path)
        // A double-click delivers click, click, dblclick. Toggling folders on
        // both clicks opens and immediately closes the one the user aimed at, so
        // double-clicking a folder — the habit every file manager teaches —
        // looked exactly like "expanding does nothing". The second click of a
        // multi-click carries detail > 1, which is the only reliable signal
        // (detail is 0 for keyboard activation, and then we do want the toggle).
        if (isDir) {
          if (!(ev && ev.detail > 1)) toggle(entry.path)
        } else openEntry(entry, false)
        if (ev.currentTarget && ev.currentTarget.focus) ev.currentTarget.focus()
      },
      // Files only: a folder's second click is swallowed by the detail guard in
      // onClick, so a double-click must not do anything extra here.
      onDoubleClick: () => { if (!isDir) openEntry(entry, true) },
      onContextMenu: (ev) => openMenu(ev, entry),
      // Focus follows the row, so keyboard focus and the arrow-key cursor never
      // disagree (Enter acts on the focused row, exactly like an IDE).
      onFocus: () => setCursor(entry.path),
    },
      guides,
      isDir
        ? React.createElement('span', { className: 'artifacts-tree-twisty' + (isOpen ? ' is-open' : '') },
          TreeChevronIcon(12))
        : React.createElement('span', { className: 'artifacts-tree-twisty is-file' }),
      isDir
        ? React.createElement('span', { className: 'artifacts-tree-ico artifacts-tree-ico-folder' },
          isOpen ? FolderOpenIcon(16) : FolderClosedIcon(16))
        // The class segment is the ONE description's kind (iconGlyph), not a
        // second classifier: a row's icon and its colour can then never disagree
        // about what the file is.
        : React.createElement('span', { className: 'artifacts-tree-ico artifacts-tree-ico-' + iconGlyph(entry.path).kind },
          React.createElement(FileTypeGlyph, { size: 16, path: entry.path })),
      React.createElement('span', {
        className: 'artifacts-tree-name' +
          (flat ? ' is-flat' : '') +
          (isSelected && !props.pinnedPath ? ' is-preview' : ''),
      }, entry.name),
      flat && depth === 0 && entry.path !== entry.name
        ? React.createElement('span', { className: 'artifacts-tree-sub' }, relPath(entry.path))
        : null,
      kind ? React.createElement('span', { className: 'artifacts-tree-status artifacts-tree-status-' + (kind === 'A' ? 'add' : 'mod'), title: kind === 'A' ? '代理新建' : '代理修改' }, kind) : null,
      actionsFor(entry),
    )
  }

  const showEmptyHint = !tree.root && !tree.loading
  const noResults = filtered && !(search.results || []).length

  // The menu box, built once: portaled to <body> when react-dom is available
  // (view coordinates, no containment to fight), rendered in place otherwise.
  const menuEl = menu ? React.createElement('div', {
    className: 'artifacts-tree-menu',
    style: { left: menu.x, top: menu.y },
    role: 'menu',
    onClick: (e) => e.stopPropagation(),
    onKeyDown: onMenuKeyDown,
    tabIndex: -1,
    ref: (el) => { menuRef.current = el; if (el && el.focus) el.focus() },
  }, menuItems(menu).map((it, i) => (it.sep
    ? React.createElement('div', { key: 'sep' + i, className: 'artifacts-tree-menu-sep' })
    : React.createElement('button', {
      key: it.label,
      type: 'button',
      role: 'menuitem',
      className: 'artifacts-tree-menu-item' + ((menu.index || 0) === i ? ' is-active' : '') + (it.danger ? ' is-danger' : ''),
      onMouseEnter: () => setMenu({ ...menu, index: i }),
      // stopPropagation: the window click-closer (armed while the menu is open)
      // is still listening for THIS click when it lands — it would fire before the
      // new confirm's listener is attached and close the confirm the instant it
      // opens. The item is the menu's own click, so it must not be "outside".
      // (A test that calls the handler with no event gets a no-op, not a throw.)
      onClick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); setMenu(null); it.run() },
    }, it.label)))) : null

  // The delete confirmation. A destructive action gets a real question: the
  // entry's name, and for a folder a reminder that EVERYTHING under it goes. It
  // is portaled next to the menu so it is never clipped by the tree's scroll
  // box, and it is the ONLY thing that can run the deletion (the menu item just
  // arms it). `delBusy` keeps 删除 single-clicked.
  const confirmEl = confirmDel ? React.createElement('div', {
    className: 'artifacts-tree-confirm',
    // Centered in the viewport. The box is portaled to <body> (see the return
    // below), where `position: fixed` is really measured from the viewport — the
    // panel itself sets container-type, so a fixed box left inside it would be
    // placed (and clipped) against the panel, exactly the bug the menu's portal
    // removes.
    style: {
      left: Math.max(8, Math.round((window.innerWidth - 320) / 2)),
      top: Math.max(8, Math.round((window.innerHeight - 160) / 2)),
    },
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-label': '确认删除',
    onClick: (e) => e.stopPropagation(),
  },
    React.createElement('div', { className: 'artifacts-tree-confirm-title' },
      confirmDel.isDir ? '删除文件夹？' : '删除文件？'),
    React.createElement('div', { className: 'artifacts-tree-confirm-body' },
      confirmDel.isDir
        ? '「' + confirmDel.name + '」及其中的全部内容都会被删除，且无法恢复。'
        : '「' + confirmDel.name + '」会被删除，且无法恢复。'),
    React.createElement('div', { className: 'artifacts-tree-confirm-actions' },
      React.createElement('button', {
        type: 'button',
        className: 'artifacts-tree-confirm-btn',
        'aria-label': '取消删除',
        onClick: () => setConfirmDel(null),
      }, '取消'),
      React.createElement('button', {
        type: 'button',
        className: 'artifacts-tree-confirm-btn is-danger' + (delBusy ? ' is-busy' : ''),
        disabled: delBusy,
        'aria-label': '确认删除',
        onClick: () => doDelete(confirmDel),
      }, delBusy ? '删除中…' : '删除'),
    ),
  ) : null

  return React.createElement('div', { className: 'artifacts-tree' },
    React.createElement('div', { className: 'artifacts-tree-header' },
      React.createElement('span', { className: 'artifacts-tree-root', title: rootPath }, tree.root ? basename(rootPath) : '…'),
      React.createElement('span', { className: 'artifacts-tree-tools' },
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-tool' + (creating ? ' is-on' : ''),
          title: '新建文件 / 文件夹（在选中的目录里；没选中就是工作区根目录）',
          'aria-label': '新建',
          'aria-haspopup': 'menu',
          onClick: openCreateMenu,
        }, PlusIcon(14)),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-tool' + (filterOpen ? ' is-on' : ''),
          title: '过滤文件（Ctrl/Cmd+P 不适用——点这里打开）',
          'aria-label': '过滤文件',
          onClick: () => { setFilterOpen(!filterOpen); if (filterOpen) setQueryText('') },
        }, SearchIcon(14)),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-tool',
          title: '全部展开',
          'aria-label': '全部展开',
          onClick: expandAll,
        }, ExpandAllIcon(14)),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-tool',
          title: '全部折叠',
          'aria-label': '全部折叠',
          onClick: collapseAll,
        }, CollapseAllIcon(14)),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tree-refresh' + (tree.loading ? ' is-busy' : ''),
          title: '刷新已展开的目录（F5）· Shift+点击：整棵树重新加载',
          'aria-label': '刷新',
          onClick: (e) => (e.shiftKey ? loadRoot(true) : refreshExpanded()),
        }, RefreshIcon(14)),
      ),
    ),
    filterOpen ? React.createElement('div', { className: 'artifacts-tree-filter' },
      SearchIcon(12),
      React.createElement('input', {
        ref: filterRef,
        className: 'artifacts-tree-filter-input',
        type: 'text',
        value: query,
        placeholder: '按文件名过滤…',
        'aria-label': '按文件名过滤',
        onChange: (e) => setQueryText(e.currentTarget.value),
        onKeyDown: (e) => {
          if (e.key === 'Escape') { e.preventDefault(); setQueryText(''); setFilterOpen(false) }
          if (e.key === 'ArrowDown') { e.preventDefault(); const el = listRef.current; if (el) el.focus() }
        },
      }),
      query ? React.createElement('button', {
        type: 'button',
        className: 'artifacts-tree-filter-clear',
        title: '清除过滤',
        'aria-label': '清除过滤',
        onClick: () => { setQueryText(''); if (filterRef.current) filterRef.current.focus() },
      }, CloseIcon(12)) : null,
    ) : null,
    React.createElement('div', {
      className: 'artifacts-tree-body',
      ref: listRef,
      role: 'tree',
      tabIndex: 0,
      'aria-label': '工作区文件树',
      onKeyDown: onKeyDown,
      // Right-clicking the blank area below the last row means "here" — the
      // workspace root — and offers the same two verbs. A row sets its own menu
      // and stops the event, so this only ever fires on empty space.
      onContextMenu: (ev) => openCreateMenu(ev),
    },
      flashLabel ? React.createElement('div', { key: 'flash-label', className: 'artifacts-tree-flash-label' }, flashLabel.text) : null,
      showEmptyHint
        ? React.createElement('div', { className: 'artifacts-hint' }, tree.error || '加载文件树…')
        : [
          tree.error ? React.createElement('div', { key: 'root-error', className: 'artifacts-tree-row artifacts-tree-error' }, tree.error) : null,
          filtered && search && search.loading
            ? React.createElement('div', { key: 'search-loading', className: 'artifacts-tree-row artifacts-tree-loading' }, '搜索中…')
            : null,
          noResults && !(search && search.loading)
            ? React.createElement('div', { key: 'no-results', className: 'artifacts-hint' },
              search && search.local ? '没有匹配（仅搜索已加载的目录）' : '没有匹配的文件')
            : null,
          search && search.local && !search.loading && (search.results || []).length
            ? React.createElement('div', { key: 'local-note', className: 'artifacts-tree-note' }, '仅搜索已加载的目录（重启 dsh web 后可用全库搜索）')
            : null,
          !filtered && tree.root && (!tree.root.entries || !tree.root.entries.length)
            ? React.createElement('div', { key: 'root-empty', className: 'artifacts-hint' }, '（空目录）')
            : null,
          rows.map(renderRow),
        ],
    ),
    menuEl && MENU_PORTAL ? ReactDOM.createPortal(menuEl, MENU_PORTAL_TARGET) : menuEl,
    // The confirm rides the SAME portal as the menu: it is `position: fixed` and
    // must be measured from the viewport, not the panel's containment box. When
    // react-dom is unavailable the menu's in-place fallback applies to it too.
    confirmEl && MENU_PORTAL ? ReactDOM.createPortal(confirmEl, MENU_PORTAL_TARGET) : confirmEl,
  )
}

// CSS attribute selectors need the path escaped (Windows paths contain "\").
const cssEscape = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
