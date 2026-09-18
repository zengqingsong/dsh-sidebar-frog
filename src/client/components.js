// The file tree (文件树) is its own module — see src/client/filetree.js: an
// IDE-style explorer (chevrons, indent guides, per-type icons, change letters,
// keyboard navigation, context menu, filter box, remembered expansion).

// Every link that opens the popout page shares this browsing-context name, so a
// second click reuses ONE tab instead of piling up new ones. There are four, and
// WHICH of them exists depends on the surface — which is how the feature went
// missing once (see the note on the two native entries in src/client/native.js):
// the floating panel's own top bar while it is open, the corner switch while it
// is closed, and on the NATIVE surface — where neither of those is registered at
// all — the standing 弹出页 button in the left sidebar's foot and the
// 「在新标签页弹出」 item on each of this plugin's own tabs.
const POPOUT_TARGET = 'dsh-sidebar-frog-popout'

// The popout page's address for a session, composed in ONE place: four entry
// points across two files must never disagree about what 「弹出」 opens, and a
// session-scoped page opened without its `sessionId` would root its file tree at
// the wrong workspace.
const popoutHrefFor = (sid) => '/dsh-sidebar-frog' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')

// 后台任务 (background jobs). A READ-ONLY view of the shell's own job mirror:
// the panel never starts or stops anything — the jobs service is owner-scoped
// and the shell owns that lifecycle — it just shows the same array the shell's
// header button shows, in the same order (live first, then most recent), so a
// long-running command started by the agent is visible next to its artifacts.
const jobStatusLabel = (status) =>
  status === 'running' ? '运行中'
    : status === 'stopping' ? '正在停止'
      : status === 'failed' ? '已失败'
        : status === 'killed' ? '已取消'
          : '已完成'

const jobDuration = (job, now) => {
  const start = typeof job.startedAt === 'number' ? job.startedAt : null
  if (start == null) return ''
  const end = jobIsLive(job) ? now : (typeof job.finishedAt === 'number' ? job.finishedAt : start)
  const secs = Math.max(0, Math.round((end - start) / 1000))
  if (secs < 60) return secs + 's'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return mins + 'm' + (secs % 60 ? ' ' + (secs % 60) + 's' : '')
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
}

const JobsPane = (props) => {
  const jobs = props.jobs || []
  const live = jobs.some(jobIsLive)
  const [now, setNow] = React.useState(Date.now())
  // A running job's duration ticks once a second; a settled list never re-renders.
  React.useEffect(() => {
    if (!live) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])

  const rows = jobs.slice().sort((a, b) => {
    const la = jobIsLive(a)
    const lb = jobIsLive(b)
    if (la !== lb) return la ? -1 : 1
    const fa = (typeof a.finishedAt === 'number' ? a.finishedAt : a.startedAt) || 0
    const fb = (typeof b.finishedAt === 'number' ? b.finishedAt : b.startedAt) || 0
    return fb - fa
  })

  return React.createElement('div', { className: 'artifacts-body' },
    React.createElement('div', { className: 'artifacts-jobs-hint' }, '后台任务由系统运行；这里是只读视图，与标题栏的任务计数同源。'),
    rows.length
      ? rows.map((job) => React.createElement('div', {
        key: job.id || job.label,
        className: 'artifacts-job' + (jobIsLive(job) ? ' is-live' : ''),
      },
        React.createElement('span', { className: 'artifacts-job-dot artifacts-job-dot-' + (job.status || 'completed'), 'aria-hidden': 'true' }),
        React.createElement('div', { className: 'artifacts-job-main' },
          React.createElement('div', { className: 'artifacts-job-row' },
            React.createElement('span', { className: 'artifacts-job-label', title: job.label || job.kind || '' }, job.label || job.kind || job.id || '任务'),
            React.createElement('span', { className: 'artifacts-job-time', title: typeof job.startedAt === 'number' ? new Date(job.startedAt).toLocaleString() : '' }, jobDuration(job, now)),
          ),
          React.createElement('div', { className: 'artifacts-job-sub' },
            React.createElement('span', { className: 'artifacts-job-status' }, jobStatusLabel(job.status)),
            job.detail ? React.createElement('span', { className: 'artifacts-job-detail', title: job.detail }, job.detail) : null,
          ),
        ),
      ))
      : React.createElement('div', { className: 'artifacts-hint' }, '当前没有后台任务。'),
  )
}

// The panel's CONTENT, shared by its two surfaces. `surface: 'native'` renders
// inside the shell's own right sidebar — the system then owns the frame, the
// width, 展开/收起 and fullscreen. `surface: 'overlay'` (the default) is the
// floating panel this plugin draws when the shell offers no tab registry to
// register into, and only that surface carries the resize handle, the width and
// the layout push.
const ArtifactsContent = (props) => {
  const surface = props && props.surface === 'native' ? 'native' : 'overlay'
  const overlay = surface !== 'native'
  const open = useOpen()
  // A native tab body is mounted by the shell for as long as its tab exists —
  // whether it is the visible one is the shell's business, not this
  // component's — so only the overlay has an open/closed state of its own.
  const active = overlay ? open : true
  const settings = useSettings()
  const [items, setItems] = React.useState([])
  const [error, setError] = React.useState(null)
  // A counter that changes only when the LEDGER's own list changes. The Git view
  // reads it as "the agent just touched the workspace" and refreshes on it — so a
  // poll that returns the identical list does not wake a `git status`, which on a
  // large repository is the most expensive thing this panel could ask for.
  const [artifactTick, setArtifactTick] = React.useState(0)
  const ledgerSig = React.useRef('')
  // Files opened as TABS inside this panel. Clicking a file (in the artifact list
  // or the tree) adds it here and switches to it; the tab then owns the panel's
  // FULL width. That is the point: a sidebar is too narrow to show a preview
  // beside the tree, so the file gets the whole strip instead of half of it.
  const [openFiles, setOpenFiles] = React.useState([])   // [{ path }] in open order
  // The file 新建文件 just created, while its tab is the active one: that tab
  // starts in 编辑 instead of 预览 (see treeOpen and EditorPane's initialMode).
  // Cleared the moment another file becomes active, so it is a one-shot hint and
  // never a mode that sticks to a path.
  const [pendingEdit, setPendingEdit] = React.useState('')
  // `fixedView` pins this instance to ONE view. The native surface registers a
  // separate system tab per view (see FROG_TABS in src/client/native.js), so each
  // of those bodies draws its view and nothing else — no self-drawn view switcher
  // duplicating the shell's tab strip. The floating panel has no such strip, so it
  // keeps its own (`fixedView` empty) and switches in place.
  const fixedView = (props && props.fixedView) || ''
  // Which session this instance is showing.
  //
  // A NATIVE tab body is a session-scoped slot, so the shell hands it the session
  // it was opened for (`sessionId`); that id is authoritative and is what every
  // host call, the popout link and the shell hand-off below are keyed by. The
  // floating panel and the standalone popout have no seat of their own, so they
  // fall back to the root read (currentSessionId, src/client/core.js).
  const seatSessionId = (props && typeof props.sessionId === 'string' && props.sessionId) || ''
  const sessionId = seatSessionId || currentSessionId()
  // Which inner view is showing: pinned on a native tab, chosen by the band on the
  // floating panel. The ledger is the floating panel's first view (that is what it
  // exists for); a bare native instance with no pin also starts there.
  const [activeTab, setActiveTab] = React.useState(
    fixedView || (overlay || !settings.showFileTree ? 'artifacts' : 'tree'),
  ) // 'artifacts' | 'tree' | 'jobs' | 'git' | 'file:<path>'
  const view = fixedView || activeTab
  // What the active file tab renders: { path, type, diff, loading, content… }.
  const [preview, setPreview] = React.useState(null)
  const [deleteMode, setDeleteMode] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [panelWidth, setPanelWidth] = React.useState(null) // null = use default
  const [resizing, setResizing] = React.useState(false)
  // The tree pane is mounted on first use and then KEPT mounted (hidden, not
  // unmounted) — see the panes below. Mounting it lazily would cost a /listdir
  // on every panel open for people who never open that tab; unmounting it on the
  // way out is what used to lose the loaded levels and the scroll position. An
  // instance that IS the tree mounts it straight away.
  const [treeReady, setTreeReady] = React.useState(fixedView ? fixedView === 'tree' : (!overlay && !!settings.showFileTree))
  // 撤销 (change review). `undoBusy` disables the button while the host writes,
  // and `reloadAt` forces the preview to re-read the file after a revert instead
  // of showing the content the user just undid.
  const [undoBusy, setUndoBusy] = React.useState(false)
  const [reloadAt, setReloadAt] = React.useState(0)
  // Which dirty file tab has been asked to close once. Closing a tab with
  // unsaved edits throws them away, and the product has no modal to confirm
  // with — so the button itself asks twice, the way 清除模式 does.
  const [closeArmed, setCloseArmed] = React.useState('')
  useDraftTick()

  // The panel is single-column, so the only pane floor that matters is the one
  // keeping file names readable — the same 280px the popout's list pane keeps
  // (scripts/check.js fails if the two drift apart).
  const SPLIT_LIST_MIN = 280

  React.useEffect(() => {
    if (!active) return
    let alive = true
    const load = () => {
      host.call('artifacts.list').then((res) => {
        if (!alive) return
        const next = res && Array.isArray(res.artifacts) ? res.artifacts : []
        setItems(next)
        setError(null)
        // The host states its own build in the same answer, so the settings panel
        // can name which half is stale after a rebuild (see hostBuildStore).
        if (res && typeof res.build === 'string') hostBuildStore.set(res.build)
        const sig = next.map((a) => a.path + '@' + a.at + '#' + ((a.history && a.history.length) || 0)).join('|')
        if (sig !== ledgerSig.current) {
          ledgerSig.current = sig
          setArtifactTick((n) => n + 1)
        }
      }).catch((e) => {
        if (alive) setError(e && e.message ? String(e.message) : String(e))
      })
    }
    load()
    let dispose
    if (settings.autoRefresh) dispose = ctx.interval(load, 2000)
    return () => { alive = false; if (dispose) dispose() }
  }, [active, settings.autoRefresh])

  // Publish the current session id to localStorage so the standalone
  // popout tab (which has no client session store) can root its file tree
  // at the active workspace and follow workspace switches in real time.
  //
  // The seat's own id (see `sessionId` above) is what a native tab knows for
  // certain, and the root read covers a change of session behind a mounted
  // panel: the subscription below fires on it, and the ref carries the seat's
  // value into that callback.
  const sessionRef = React.useRef(sessionId)
  sessionRef.current = sessionId
  React.useEffect(() => {
    const KEY = BRIDGE.session
    const write = () => {
      try {
        const sid = sessionRef.current || currentSessionId()
        if (localStorage.getItem(KEY) !== sid) localStorage.setItem(KEY, sid || '')
      } catch (e) { }
    }
    write()
    let list
    try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) { }
    if (!list || typeof list.subscribe !== 'function') return
    return list.subscribe(write)
  }, [])

  // Panel width (px): a drag from this session if there is one, otherwise
  // 「默认面板宽度」, either way floored by「最短面板宽度」and by enough room for the
  // list / tree to stay readable. The rule itself lives in src/shared/settings.js
  // (panelWidthPx) so scripts/check.js can drive it.
  const paneFloorPx = SPLIT_LIST_MIN + 2
  // Both are the OVERLAY's geometry: a native tab's width is the shell's.
  const minWidthPx = overlay ? panelMinWidthPx(window.innerWidth, settings, paneFloorPx) : 0
  const widthPx = overlay ? panelWidthPx(window.innerWidth, settings, panelWidth, paneFloorPx) : 0

  // Reserve layout space for the panel while open: shrink the app frame by
  // the panel's live width so the conversation column yields instead of
  // being covered (see the `html #root` rule in styles). A native tab needs no
  // push at all — the shell already lays the column out around its own sidebar.
  React.useEffect(() => {
    if (!overlay) return undefined
    const root = document.documentElement
    root.style.setProperty('--dsh-sidebar-frog-width', active ? widthPx + 'px' : '0px')
    return () => { root.style.setProperty('--dsh-sidebar-frog-width', '0px') }
  }, [overlay, active, widthPx])

  // Disable the layout transition while dragging so the frame tracks the
  // pointer instead of lagging (mirrors body[data-dsh-sidebar-frog-dragging]).
  React.useEffect(() => {
    if (resizing) document.body.setAttribute('data-dsh-sidebar-frog-dragging', '')
    else document.body.removeAttribute('data-dsh-sidebar-frog-dragging')
    return () => { document.body.removeAttribute('data-dsh-sidebar-frog-dragging') }
  }, [resizing])

  // Background jobs come from the shell's own mirror (see useJobs), so the view
  // only shows rows while there is something to show — the same rule the shell's
  // header button follows.
  const jobs = useJobs(sessionId)

  // Drawn only where the band has something to hold. The floating surface keeps
  // its view switcher whenever it has a view to switch; a native ledger tab holds
  // the open document tabs and 清除 (which belongs to the ledger alone); a bare
  // native view — tree, jobs, usage — draws no bar of its own at all, so every tab
  // in that column is exactly one band, like the product's own tabs.
  const showBand = fixedView
    ? fixedView === 'artifacts'
    : (settings.showFileTree || openFiles.length > 0)

  if (!active) return null

  const sid = sessionId
  const popoutHref = popoutHrefFor(sid)

  const startResize = (e) => {
    e.preventDefault()
    setResizing(true)
    const rightOffset = shellRightWidth()
    const onMove = (ev) => {
      const w = window.innerWidth - ev.clientX - rightOffset
      setPanelWidth(Math.max(minWidthPx, Math.min(w, window.innerWidth - rightOffset - 24)))
    }
    const onUp = () => {
      setResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const flash = (msg) => noticeStore.flash(msg)
  const copyText = (text, msg) => {
    const done = () => flash(msg)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done() })
    } else { fallbackCopy(text); done() }
  }
  const quotePath = (path) => {
    if (quoteToComposer(path)) { flash('已插入输入框'); return }
    copyText('@' + path, '已复制 @引用（未能写入输入框）')
  }

  const remove = (path) => {
    host.call('artifacts.remove', { path }).then((res) => {
      if (res && res.ok) {
        setItems((prev) => prev.filter((x) => x.path !== path))
        closeFileTab(path)
        setDeleteTarget(null)
        flash('已清除')
      } else {
        flash((res && res.error) || '清除失败')
      }
    }).catch(() => flash('清除失败'))
  }

  // Re-read the ledger after a revert or a save: the row's diff and its undo
  // affordance both describe the state BEFORE the write, so neither may survive
  // it. The 2 s poll would get there eventually; this makes the panel honest
  // immediately. Passing this to the editor is also what makes a save show up in
  // the ledger at once — with 撤销 offering to put your own change back.
  const refreshAfterRevert = () => {
    setReloadAt(Date.now())
    host.call('artifacts.list').then((res) => {
      if (res && Array.isArray(res.artifacts)) setItems(res.artifacts)
    }).catch(() => {})
  }

  // 撤销 the newest recorded change of the file on screen. The host refuses
  // rather than guesses when the file moved on (or when undoing would mean
  // deleting a file it has no interface for), and its reason is what the user
  // needs to see — a silent no-op would read as a broken button.
  const undoChange = (opId) => {
    if (!activeFile || undoBusy) return
    setUndoBusy(true)
    host.call('artifacts.revert', { path: activeFile, opId: opId }).then((res) => {
      setUndoBusy(false)
      if (res && res.ok) {
        flash('已撤销这次改动')
        refreshAfterRevert()
      } else {
        flash((res && res.error) || '撤销失败')
      }
    }).catch((e) => {
      setUndoBusy(false)
      flash(e && e.message ? String(e.message) : '撤销失败')
    })
  }

  // Open a file as a TAB of this panel. Re-opening a file that already has a tab
  // just switches to it (no duplicate tabs), and the tree/list stay one click
  // away in their own tabs — so nothing is ever squeezed into half a sidebar.
  const openFileTab = (path) => {
    if (!path) return
    setOpenFiles((prev) => (prev.some((f) => f.path === path) ? prev : prev.concat([{ path }])))
    setActiveTab('file:' + path)
  }

  const closeFileTab = (path) => {
    const next = openFiles.filter((f) => f.path !== path)
    setOpenFiles(next)
    // The tab's unsaved draft goes with it. The close button asked twice when
    // there was one (see the tab strip), so this is the confirmation, not a
    // silent discard.
    draftStore.drop(path)
    // Closing the tab you are looking at falls back to the tab on its left
    // (the most recently opened other file), or to the artifact list.
    if (activeTab === 'file:' + path) {
      setActiveTab(next.length ? 'file:' + next[next.length - 1].path : 'artifacts')
    }
  }

  const select = (it) => openFileTab(it.path)

  // Hand a file to the renderer the SHELL would pick (see openInShellSidebar in
  // src/client/docpreview.js). It can refuse — no sidebar face, no session, or an
  // address no type will open — and a silent no-op reads as a broken button, so
  // the refusal is reported, WITH the reason the shell gave.
  //
  // The session is passed IN rather than looked up inside: on the native surface
  // this instance's own seat knows it exactly (see `sessionId` above), and a
  // hand-off addressed to another session's workspace would open the right tab
  // over the wrong file.
  const openInShell = (path) => {
    const res = openInShellSidebar(path, sid)
    if (res && res.ok) flash('已在系统侧边栏打开')
    else flash(openShellFailureText(res))
  }

  // Opening a file from the TREE. A native tab holds one view and has no file
  // tabs of its own, so the click hands the file to the shell, which opens it as
  // a document tab in this same column — the way the product's own file links
  // work. The floating panel keeps its internal file tabs: it has no shell strip
  // to land in when the column itself is what is missing.
  const treeOpen = (path, opts) => {
    // A file the person just created opens in 编辑 when it lands in this panel's
    // own tab: an empty file has nothing to preview. `pendingEdit` is consumed by
    // whoever renders that tab (see EditorPane's initialMode below), and it is
    // dropped as soon as another file becomes active — re-opening it later is an
    // ordinary preview.
    if (opts && opts.created && !fixedView) setPendingEdit(path)
    if (fixedView) { openInShell(path); return }
    openFileTab(path)
  }

  const activeFile = activeTab.indexOf('file:') === 0 ? activeTab.slice(5) : ''

  // The one-shot 编辑 hint belongs to ONE tab: as soon as another file is the
  // active one it is spent, so re-opening the created file later is an ordinary
  // preview rather than a mode that keeps coming back.
  React.useEffect(() => {
    if (pendingEdit && pendingEdit !== activeFile) setPendingEdit('')
  }, [activeFile, pendingEdit])

  // The artifact list is re-polled every 2s; reading it through a ref keeps that
  // poll from re-reading the previewed file on every tick (only the file itself,
  // or a switch of tabs, does that).
  const itemsRef = React.useRef(items)
  itemsRef.current = items

  // Load the active file tab's content. Images and PDFs are served as binary
  // media, so they need no text read; everything else comes from artifacts.read,
  // with the edit diff — and the undo affordance the host attached to it —
  // attached when the agent changed that file.
  React.useEffect(() => {
    if (!activeFile) { setPreview(null); return }
    const type = extType(activeFile)
    const hit = itemsRef.current.find((x) => x.path === activeFile)
    const base = {
      path: activeFile,
      type,
      // Who the SHELL would draw this file with (see documentRendererFor in
      // src/client/docpreview.js). Shown in the preview header, and the reason
      // the hand-off button exists: for a suffix we render as mojibake an
      // installed renderer may already be able to show it properly.
      renderer: documentRendererFor(activeFile),
      diff: (hit && hit.diff) || null,
      undo: (hit && hit.undo) || null,
      // Only the binary-document card calls this, and only after a person clicks
      // 「以纯文本查看」: the host refuses to decode a binary container as text by
      // default (BINARY_TYPES in src/host/core.js), so the escape hatch has to
      // ask for it explicitly.
      onReadText: () => host.call('artifacts.read', { path: activeFile, forceText: true }),
    }
    // Types with no text to fetch: media is streamed from /media, and a binary
    // document has nothing to decode (its card asks for bytes only on demand).
    if (type === 'image' || type === 'pdf' || type === 'audio' || type === 'video' || type === 'document') {
      setPreview(Object.assign({}, base, { loading: false }))
      return
    }
    let alive = true
    setPreview(Object.assign({}, base, { loading: true }))
    host.call('artifacts.read', { path: activeFile }).then((res) => {
      if (alive) setPreview(Object.assign({}, base, { loading: false }, res))
    }).catch((e) => {
      if (alive) setPreview(Object.assign({}, base, { loading: false, ok: false, error: String(e && e.message ? e.message : e) }))
    })
    return () => { alive = false }
  }, [activeFile, reloadAt])

  const listChildren = []
  // The list request's failure was tracked but never shown, so a rejected or
  // unreachable host looked exactly like "the agent produced nothing yet".
  if (error) {
    listChildren.push(React.createElement('div', { key: 'list-error', className: 'artifacts-error' }, error))
  }
  if (!items.length && !error) {
    listChildren.push(React.createElement('div', { key: 'empty', className: 'artifacts-empty' }, '暂无产物 — 代理创建/编辑的文件会出现在这里。'))
  }
  items.forEach((it) => {
    const isDeleteMarked = deleteMode && deleteTarget === it.path
    listChildren.push(React.createElement('div', {
      key: it.id || it.path,
      className: 'artifacts-item' +
        (activeFile === it.path ? ' is-active' : '') +
        (isDeleteMarked ? ' is-delete-marked' : ''),
    },
      React.createElement('button', {
        type: 'button',
        className: 'artifacts-item-main',
        onClick: () => {
          if (deleteMode) setDeleteTarget(isDeleteMarked ? null : it.path)
          else select(it)
        },
        onDoubleClick: () => { if (!deleteMode) select(it) },
      },
        React.createElement('div', { className: 'artifacts-item-row' },
          React.createElement('span', { className: 'artifacts-badge artifacts-badge-' + it.kind }, it.kind === 'create' ? '新建' : '编辑'),
          React.createElement('span', {
            // Italic while it is only previewed, upright once pinned — the same
            // signal an IDE's preview tab gives (here the tab lives in the panel).
            className: 'artifacts-item-base',
            title: basename(it.path),
          }, basename(it.path)),
          // Last-touched age, the same compact form the popout tab shows (a live
          // ledger is as much about "when" as about "what").
          React.createElement('span', {
            className: 'artifacts-item-time',
            title: it.at ? new Date(it.at).toLocaleString() : '',
          }, relativeTime(it.at)),
        ),
        React.createElement('div', { className: 'artifacts-item-full', title: it.path }, it.path),
      ),
      React.createElement('div', { className: 'artifacts-item-actions' },
        isDeleteMarked ? React.createElement('button', {
          type: 'button',
          className: 'artifacts-minibtn artifacts-delete-x',
          title: '清除该产物',
          onClick: () => remove(it.path),
        }, '×') : null,
        deleteMode ? null : React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '复制路径', onClick: () => copyText(it.path, '已复制路径') }, '⧉'),
        deleteMode ? null : React.createElement('button', { type: 'button', className: 'artifacts-minibtn', title: '@引用到输入框', onClick: () => quotePath(it.path) }, '@'),
      ),
    ))
  })

  return React.createElement('div', {
    className: 'artifacts-panel' + (overlay ? '' : ' artifacts-panel-native') + (resizing ? ' artifacts-resizing' : ''),
    style: overlay ? { width: widthPx } : undefined,
    role: 'dialog', 'aria-label': 'Artifacts',
  },
    overlay ? React.createElement('div', {
      className: 'artifacts-resize',
      title: '拖动调整宽度',
      onMouseDown: startResize,
    }) : null,
    // ── The panel's own top bar: OVERLAY ONLY ──────────────────────────────
    // Under the native surface the shell's tab strip IS this column's header,
    // and every other tab in that column draws exactly ONE band of its own (the
    // product's files tab draws its path and tools in a single 38px row). A
    // second, mostly empty bar made this tab visibly heavier than its
    // neighbours, so the native surface keeps one band — the view switcher —
    // and 清除 rides the end of it, the way the product's files header carries
    // its tools in the same row as its path.
    //
    // The transient notice is not chrome at all: it now lives in the shell's
    // own frame-wide overlay layer (`shell.overlay`, whose contract names a
    // toast stack as exactly what belongs there — see NoticePill), so feedback
    // is visible from every view without any view having to host a line for it.
    overlay ? React.createElement('div', { className: 'artifacts-head' },
      React.createElement('div', { className: 'artifacts-head-left' },
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-headbtn',
          title: '收起侧边栏',
          'aria-label': '收起侧边栏',
          onClick: () => store.setOpen(false),
        }, CollapsePanelIcon(15)),
        React.createElement('a', {
          className: 'artifacts-link',
          href: popoutHref,
          target: POPOUT_TARGET,
          rel: 'noreferrer noopener',
          title: '在新标签页弹出（可拖到另一块显示器）',
          'aria-label': '在新标签页弹出',
        }, PopoutIcon(15)),
      ),
      React.createElement('span', { className: 'artifacts-spacer' }),
      activeTab === 'artifacts' ? React.createElement('button', {
        type: 'button',
        className: 'artifacts-iconbtn' + (deleteMode ? ' artifacts-delete-on' : ''),
        title: deleteMode ? '退出清除模式' : '清除模式',
        onClick: () => { setDeleteMode(!deleteMode); setDeleteTarget(null) },
      }, '清除') : null,
    ) : null,
    // The band. On the floating surface it is the panel's own view switcher; on a
    // native per-view tab there are no views to switch (the shell's tab strip is
    // the switcher), so it holds only what THAT view needs: the open document
    // tabs and 清除 for the ledger, nothing at all for the bare views. It is
    // drawn only where it has something to hold, so no view carries an empty bar.
    showBand ? React.createElement('div', { className: 'artifacts-tabs' },
      // The floating surface's view switcher — never on a native tab, where the
      // shell's own strip already names the view.
      !fixedView && overlay ? React.createElement('button', {
        type: 'button',
        className: 'artifacts-tab' + (view === 'artifacts' ? ' is-active' : ''),
        onClick: () => setActiveTab('artifacts'),
      }, '产物') : null,
      !fixedView && overlay && settings.showFileTree ? React.createElement('button', {
        type: 'button',
        className: 'artifacts-tab' + (view === 'tree' ? ' is-active' : ''),
        onClick: () => { setActiveTab('tree'); setTreeReady(true); setDeleteMode(false); setDeleteTarget(null) },
      }, '文件树') : null,
      !fixedView && overlay && jobs.length ? React.createElement('button', {
        type: 'button',
        className: 'artifacts-tab' + (view === 'jobs' ? ' is-active' : ''),
        title: jobs.filter(jobIsLive).length + ' 个运行中 / 共 ' + jobs.length + ' 个后台任务',
        onClick: () => { setActiveTab('jobs'); setDeleteMode(false); setDeleteTarget(null) },
      }, '任务 ' + jobs.length) : null,
      // Git is offered unconditionally on the floating band, exactly as its system
      // tab is unconditional in the column: whether the workspace is a repository
      // is not known until asked, and the native surface has no way to hide a tab
      // per workspace, so the two surfaces must offer the same set. The view
      // itself answers "这里没有 Git 仓库" with the reason when that is the truth.
      !fixedView && overlay ? React.createElement('button', {
        type: 'button',
        className: 'artifacts-tab' + (view === 'git' ? ' is-active' : ''),
        title: 'Git 只读切片：分支、ahead/behind、改动文件与行级差异（不含写操作）',
        onClick: () => { setActiveTab('git'); setDeleteMode(false); setDeleteTarget(null) },
      }, 'Git') : null,
      // A native ledger tab's band keeps a left-hand label so it reads as a header
      // rather than an almost-empty strip — the same shape the product's files tab
      // uses (a fact about the view on the left, its tools on the right), just with
      // the live record count instead of a path.
      fixedView === 'artifacts' ? React.createElement('span', { className: 'artifacts-tab-note' }, items.length + ' 个产物') : null,
      openFiles.map((f) => React.createElement('div', {
        key: 'file:' + f.path,
        className: 'artifacts-tab artifacts-tab-file' + (activeFile === f.path ? ' is-active' : ''),
      },
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tab-label',
          title: f.path,
          onClick: () => { setActiveTab('file:' + f.path); setDeleteMode(false); setDeleteTarget(null); setCloseArmed('') },
        },
          // The dot is the file's unsaved draft: a tab that unloads its editor on
          // every switch has to say which files are still holding edits.
          draftStore.isDirty(f.path) ? React.createElement('span', { key: 'dirty', className: 'artifacts-tab-dirty', title: '有未保存的修改' }, '●') : null,
          basename(f.path),
        ),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-tab-close' + (closeArmed === f.path ? ' is-armed' : ''),
          // First click on a dirty tab arms instead of closing: the click that
          // discards unsaved work must be a decision, not a mis-aim at the tab
          // next to it.
          title: closeArmed === f.path ? '再点一次：关闭并丢弃未保存的修改' : (draftStore.isDirty(f.path) ? '关闭标签页（有未保存的修改）' : '关闭标签页'),
          'aria-label': '关闭 ' + basename(f.path),
          onClick: (ev) => {
            ev.stopPropagation()
            if (draftStore.isDirty(f.path) && closeArmed !== f.path) { setCloseArmed(f.path); return }
            setCloseArmed('')
            closeFileTab(f.path)
          },
        }, closeArmed === f.path ? '确认' : CloseIcon(10)),
      )),
      // Sticky, so it stays at the strip's right edge however many file tabs are
      // open (the strip itself scrolls sideways). 清除 belongs to the ledger: it
      // clears the in-memory RECORD of an artifact, so it is offered by the view
      // that lists them and by no other. The floating panel carries its copy in its
      // own top bar (it has one), so this one is the native ledger's alone.
      fixedView === 'artifacts' && !activeFile ? React.createElement('button', {
        key: 'clear',
        type: 'button',
        className: 'artifacts-tab-action artifacts-iconbtn' + (deleteMode ? ' artifacts-delete-on' : ''),
        title: deleteMode ? '退出清除模式' : '清除模式',
        onClick: () => { setDeleteMode(!deleteMode); setDeleteTarget(null) },
      }, '清除') : null,
    ) : null,
    React.createElement('div', { className: 'artifacts-main' },
      // ONE pane visible at a time, full width — but the two list views stay
      // MOUNTED and are only made invisible. Unmounting them was what made every
      // visit to 文件树 re-read the root level and jump back to the top: the
      // loaded levels, the expanded set and the scroll offset all live in the
      // component's own state, and a React unmount throws them away.
      activeFile
        ? React.createElement('div', { className: 'artifacts-preview' },
          preview ? React.createElement(EditorPane, {
            // One instance per file: switching tabs must not carry the previous
            // file's 已保存 status (or its edit mode) across. Unsaved text does
            // travel — that lives in draftStore, keyed by path.
            key: activeFile,
            path: activeFile,
            editable: isEditablePreview(preview),
            // 编辑 straight away for a file that was just created (see treeOpen).
            initialMode: pendingEdit && pendingEdit === activeFile ? 'edit' : 'view',
            // The seat's session: a save is filed against it (see EditorPane).
            sessionId: sid,
            content: preview.content,
            // The revision this preview read. The save sends it back, which is
            // what turns "somebody changed the file while you were typing" into
            // a refusal instead of a silent overwrite (see saveFile in
            // src/host/core.js).
            baseVersion: preview.version || null,
            baseSize: typeof preview.size === 'number' ? preview.size : null,
            onSaved: refreshAfterRevert,
          }, renderPreview(Object.assign({}, preview, {
            onUndo: undoChange,
            undoBusy: undoBusy,
            onOpenInShell: openInShell,
            // The session the reader is in: a document-relative image is resolved
            // against ITS workspace by the media route (see mdMedia).
            sessionId: sid,
          }))) : null,
        )
        : null,
      // A native tab pinned to the tree draws the tree WHATEVER the floating
      // panel's 「文件树」 preference says. That preference switches the floating
      // band between its views; the column's 文件 tab, by contrast, always exists
      // (this plugin takes the product's own `files` kind over), so honouring the
      // preference here would leave the tab PRESENT AND EMPTY — a blank column
      // with nothing to click and nothing in any log. The setting is not offered
      // on the native surface for the same reason (see SettingsSection).
      ((settings.showFileTree || fixedView === 'tree') && treeReady) ? React.createElement('div', {
        className: 'artifacts-pane' + (activeFile || view !== 'tree' ? ' is-hidden' : ''),
        'aria-hidden': (activeFile || view !== 'tree') ? 'true' : undefined,
      },
        React.createElement(FileTree, {
          onOpen: treeOpen,
          selectedPath: null,
          pinnedPath: null,
          // The artifact records double as the explorer's change letters (A/M).
          items: items,
          // The seat's own session, so every directory read is fenced to THIS
          // tab's workspace (see seatSessionId in src/client/filetree.js).
          sessionId: seatSessionId,
        }),
      ) : null,
      React.createElement('div', {
        className: 'artifacts-pane' + (activeFile || view !== 'artifacts' ? ' is-hidden' : ''),
        'aria-hidden': (activeFile || view !== 'artifacts') ? 'true' : undefined,
      },
        React.createElement('div', { className: 'artifacts-body' }, [
          deleteMode ? React.createElement('div', { className: 'artifacts-delete-hint' }, '清除模式：点击产物标记，再点红色 × 清除（仅清除内存记录，不删除磁盘文件）') : null,
          listChildren,
        ]),
      ),
      // The jobs pane is mounted only while its view is active: it renders from
      // the store snapshot, so unmounting it loses nothing (unlike the file
      // tree, whose loaded levels and scroll offset live in its own state).
      (view === 'jobs' && !activeFile) ? React.createElement('div', { className: 'artifacts-pane' },
        React.createElement(JobsPane, { jobs: jobs }),
      ) : null,
      // Git is mounted only while it is the visible view. It keeps its state
      // OUTSIDE the component (the git snapshot store), so a remount is cheap.
      (view === 'git' && !activeFile) ? React.createElement('div', { className: 'artifacts-pane' },
        React.createElement(GitPane, { sessionId: sid, artifactTick: artifactTick }),
      ) : null,
    ),
  )
}

// The floating panel — the FALLBACK surface, registered only when the shell's
// right sidebar offered no tab registry to register into (see native.js). It
// owns the open/closed state, and with it the layout push the content applies.
const ArtifactsPanel = () => {
  const open = useOpen()
  if (!open) return null
  return React.createElement(ArtifactsContent, { surface: 'overlay' })
}

// Transient feedback ("已复制路径", "已插入输入框", "已撤销这次改动") — a pill in the
// SHELL's own frame-wide overlay layer rather than a line inside the panel.
//
// `shell.overlay`'s contract names a toast stack as exactly what belongs there:
// the layer sits above every column and outside their scroll containers, and it
// is click-through, so an occupant never blocks the app underneath. Putting the
// notice there means one implementation serves both panel surfaces, no
// scrolling strip can carry it off-screen, and the panel stops having to
// reserve a band for it — which is what let the native surface drop to a single
// row. It renders nothing while idle, so it costs the layer nothing.
const NoticePill = () => {
  const notice = useNotice()
  if (!notice) return null
  return React.createElement('div', {
    className: 'artifacts-notice-pill',
    role: 'status',
    'aria-live': 'polite',
  }, notice)
}

// The system's own sidebar toggle, wherever the shell puts it (better-sidebar
// marks it; it exists only while that panel is collapsed).
const SHELL_SIDEBAR_TOGGLE = '[data-sidebar-right-expand]'
// Air between the shell's toggle and our switch when both are on screen.
const CORNER_GAP_PX = 8

// The panel's entry point while it is CLOSED, pinned to the top-right corner and
// registered into the root-scoped `shell.overlay` list so it exists with or
// without a conversation. It draws nothing while the panel is open: the panel's
// own header carries 收起 there, and this is the overlay surface's only surface
// at all (the native surface never registers this component — see body.js).
//
// It must not land on top of the shell's own sidebar toggle: that one sits in the
// session header's corner, our panel narrows that column by the width it claims,
// and a fixed offset therefore puts both buttons in the same 28px band. So the
// offset is measured from the shell's button (see the effect) and published as
// --frog-corner-right; when the shell has no such button we let the stylesheet's
// plain "left of the sidebars" fallback apply.
const CornerButton = () => {
  const open = useOpen()
  const sid = currentSessionId()
  const popoutHref = popoutHrefFor(sid)

  React.useEffect(() => {
    const root = document.documentElement
    // Where the shell's own right sidebar is, measured from its element (see
    // watchShellRight in src/client/core.js): the panel offset, the room reserved
    // in the conversation column and the drag clamp all read the CSS variable it
    // publishes. One watcher for both components, mounted here because the corner
    // entry exists with or without a conversation.
    const stopShellRight = watchShellRight()
    const place = () => {
      const shellBtn = document.querySelector(SHELL_SIDEBAR_TOGGLE)
      const rect = shellBtn ? shellBtn.getBoundingClientRect() : null
      if (!rect || !rect.width) {
        // No shell toggle on screen: hand the position back to the stylesheet.
        root.style.removeProperty('--frog-corner-right')
        return
      }
      const offset = Math.max(12, Math.round(window.innerWidth - rect.left + CORNER_GAP_PX))
      root.style.setProperty('--frog-corner-right', offset + 'px')
    }
    place()
    // The shell's button mounts and unmounts with that panel and with plugin load
    // order, and our own width change moves it — so re-measure a few times right
    // after a change, then keep a cheap 2s guard against the rest.
    const timers = [60, 260, 900].map((ms) => setTimeout(place, ms))
    const poll = setInterval(place, 2000)
    window.addEventListener('resize', place)
    return () => {
      timers.forEach((t) => clearTimeout(t))
      clearInterval(poll)
      window.removeEventListener('resize', place)
      stopShellRight()
      root.style.removeProperty('--frog-corner-right')
    }
  }, [open])

  // Open, the panel's own header carries 收起 — so this entry draws nothing.
  // Drawing a second sidebar glyph here would put it in the same 28px band as
  // the shell's own toggle, in the header's share-button cluster: one duplicated
  // feature, which is exactly what this removes.
  if (open) return null

  return React.createElement('div', { className: 'artifacts-corner' },
    React.createElement('button', {
      type: 'button',
      className: 'artifacts-corner-btn',
      title: '打开侧边栏',
      'aria-label': '打开侧边栏',
      'aria-expanded': false,
      onClick: () => store.setOpen(true),
    }, PanelIcon(18)),
    // 弹出 is offered while the panel is closed; once it is open the panel's own
    // header carries the same action, and two identical buttons a thumb apart is
    // the duplication this rewrite removes.
    React.createElement('a', {
      className: 'artifacts-corner-btn',
      href: popoutHref,
      target: POPOUT_TARGET,
      rel: 'noreferrer noopener',
      title: '在新标签页弹出',
      'aria-label': '在新标签页弹出',
    }, PopoutIcon(16)),
  )
}

const SettingsToggle = (props) =>
  React.createElement('div', { className: 'artifacts-setrow' },
    React.createElement('div', { className: 'artifacts-settext' },
      React.createElement('div', { className: 'artifacts-settitle' }, props.label),
      React.createElement('div', { className: 'artifacts-setdesc' }, props.desc),
    ),
    React.createElement('label', { className: 'artifacts-switch' },
      React.createElement('input', {
        type: 'checkbox',
        checked: props.value,
        'aria-label': props.label,
        onChange: (e) => props.onToggle(e.currentTarget.checked),
      }),
      React.createElement('span', { className: 'artifacts-switch-track', 'aria-hidden': 'true' },
        React.createElement('span', { className: 'artifacts-switch-thumb' }),
      ),
    ),
  )

const LEND_STATE_TEXT = {
  live: '已借出',
  off: '已关闭 · 交回系统内置',
  fallback: '未接管 · 系统渲染器在本浏览器可用',
  pending: '未生效 · 注册尚未完成',
  failed: '未生效 · 被系统拒绝',
  noregistry: '未生效 · 本页没有文档预览注册表',
}

const SettingsSection = () => {
  const settings = useSettings()
  const set = (key, value) => settingsStore.set(key, value)
  const hostBuild = useHostBuild()
  const lend = useDocumentLend()

  return React.createElement('div', { className: 'artifacts-settings' },
    React.createElement('p', { className: 'artifacts-setintro' }, '管理「dsh-sidebar-frog」的显示与行为。'),
    // The two halves' build ids. The host half is read ONCE, when `dsh web`
    // starts (it composes the routes, the popout page and the vendored assets in
    // memory); the client half is fetched per page load and can be hot-swapped.
    // So a mismatch is the normal state after a rebuild and it is the ONLY thing
    // that needs a process restart — saying which half is stale, in the panel,
    // is the difference between "restart it" and "why is this broken again".
    React.createElement('p', { className: 'artifacts-setbuild' },
      '客户端 build ' + BUILD + (hostBuild ? '  ·  宿主 build ' + hostBuild : '')),
    hostBuild && hostBuild !== BUILD
      ? React.createElement('p', { className: 'artifacts-setstale' },
        '宿主半侧还是旧构建：新路由与产物捕获要等 dsh web 重启才会生效（客户端可以只刷新页面）。')
      : null,
    // Which surface the panel got changes what is worth configuring. Under the
    // native tab the shell owns 展开/收起 and the column's width, so those
    // preferences are not offered at all rather than silently doing nothing.
    React.createElement('p', { className: 'artifacts-setmode' }, frogNativeSurface
      ? '面板形态：系统右侧边栏的原生标签页 — 展开/收起、全屏、拖宽由系统提供；左侧栏底部那颗「文件树」是本插件加的常驻入口。'
      : '面板形态：本插件的浮动面板（未检测到系统的右侧边栏 Tab 注册点，已降级）。'),
    React.createElement('div', { className: 'artifacts-setgroup' },
      // 「默认展开」means something on BOTH surfaces, so it is offered on both —
      // with the surface's own wording. On the floating panel it is the panel's
      // open state; under the shell's column it is the default PAGE: the shell
      // starts a session's column collapsed and unseeded and seeds it with the
      // guide (this plugin contributes five entries, so the "sole entry" rule
      // never applies), and a BLANK session hides the header that holds the
      // shell's only expand control. So with this on, a brand-new session gets
      // the 文件 page opened for it; off, the column is left exactly as the
      // shell made it. See installColumnEntryPoints in src/client/native.js.
      React.createElement(SettingsToggle, {
        label: '默认展开',
        desc: frogNativeSurface
          ? '新建会话时，若右侧边栏还是空的，自动打开「文件」页（同时展开那一列；空白会话里系统自己的展开按钮是被藏起来的）。有内容的会话、或你自己用过的侧边栏一律不动。关闭则完全交给系统。'
          : '页面加载后侧边栏默认展开；关闭则默认收起，点右上角图标再打开。',
        value: settings.defaultOpen,
        onToggle: (v) => set('defaultOpen', v),
      }),
      React.createElement(SettingsToggle, {
        label: '自动刷新',
        desc: '开启后侧边栏展开时将即时同步并更新产物列表',
        value: settings.autoRefresh,
        onToggle: (v) => set('autoRefresh', v),
      }),
      // Floating-only, like the width preferences above and for the same reason:
      // it switches THIS panel's band between its views. On the native surface
      // every view is its own system tab — including the column's 文件 tab, which
      // exists whether or not this is ticked — so the toggle could only ever blank
      // that tab, which is precisely what a "fake switch" is.
      frogNativeSurface ? null : React.createElement(SettingsToggle, {
        label: '文件树',
        desc: '在浮动面板的带子上显示「文件树」视图，浏览工作区目录。原生形态下不显示这一项：系统的「文件」标签就是本插件的文件树。',
        value: settings.showFileTree,
        onToggle: (v) => set('showFileTree', v),
      }),
      // Which surface the panel takes. The native one REPLACES the column's own
      // 文件 tab (that is the point: the product's tree has no @引用 and no
      // right-click menu, so the column's file tree would look crippled next to
      // this plugin's). Switching it off hands the tab straight back to the
      // product's tree and moves this panel into its own floating window.
      React.createElement(SettingsToggle, {
        label: '用系统右侧边栏承载面板',
        desc: '把本插件的面板注册为系统右侧边栏「文件」标签的实现（extension 档压过系统自带实现）：那棵文件树即本插件的文件树，带 @引用到输入框、右键菜单、按目录刷新等能力，展开/收起、全屏、拖宽由系统提供。关闭则交回系统自带的文件树，面板退回本插件的浮动窗口。修改后需刷新页面生效。',
        value: settings.nativeFileTree,
        onToggle: (v) => set('nativeFileTree', v),
      }),
      // The renderer this plugin LENDS to the shell's own document preview. It is
      // a switch rather than a silent takeover because the built-in renderer has
      // chrome ours does not (code copy buttons, footnotes): the trade is math /
      // diagrams for that chrome, and it is the user's to make.
      //
      // The status block above the switches is the other half of that bargain:
      // a lent renderer can be missing for five different reasons that all look
      // identical from here (the file simply renders the product's way), so the
      // live state is SHOWN instead of being left to guesswork. It is also the
      // only place that names the browser-capability case: the product's PDF
      // renderer needs a Map method (getOrInsertComputed) that only exists from
      // Chromium 145 on, and on an engine without it this plugin takes the
      // suffix over — see the `pdf` entry in src/client/docpreview.js.
      React.createElement('div', { className: 'artifacts-setgroup' },
        React.createElement('div', { className: 'artifacts-settitle' }, '系统文档预览：借出状态'),
        React.createElement('div', { className: 'artifacts-setdesc' },
          lend.registry
            ? '系统右侧边栏打开下列后缀时，用哪一个渲染器。'
            : '本页还没有系统的文档预览注册表（渲染器一个都没借出，稍后会重试）。'),
        React.createElement('div', { className: 'artifacts-setdesc' },
          lend.productPdf
            ? '本浏览器可以运行系统自带的 PDF 渲染器（pdf.js 6），PDF 不接管。'
            : '本浏览器缺少 pdf.js 6 需要的 Map.prototype.getOrInsertComputed（Chromium 145 起才有），系统的 PDF 预览会直接报错，所以 PDF 由本插件接管（内置 pdf.js 3）。'),
        (lend.rows || []).map((row) => React.createElement('div', { key: row.id, className: 'artifacts-setlendrow' },
          React.createElement('span', { className: 'artifacts-setlendname' }, row.suffixes),
          React.createElement('span', { className: 'artifacts-setlendstate is-' + row.state },
            LEND_STATE_TEXT[row.state] || row.state),
          row.reason ? React.createElement('span', { className: 'artifacts-setlendwhy' }, row.reason) : null,
        )),
      ),
      React.createElement(SettingsToggle, {
        label: '系统 Markdown 用本插件渲染',
        desc: '把本插件的 Markdown 渲染器（离线数学公式 / Mermaid 图表 / JSXGraph 交互几何）注册给系统的文档预览，.md 在系统右侧边栏里也能渲染公式与图表；关闭则交回系统自带渲染器（保留代码复制、脚注等原生功能）。',
        value: settings.nativeMarkdown,
        onToggle: (v) => set('nativeMarkdown', v),
      }),
      // The second renderer lent to the same registry. Unlike Markdown there is
      // no built-in competitor for .csv/.tsv — the product has no table renderer
      // at all, so without this the shell shows a spreadsheet as one long line.
      React.createElement(SettingsToggle, {
        label: '系统表格用本插件渲染',
        desc: '把本插件的表格渲染器（CSV / TSV：固定表头、点列排序、行列统计）注册给系统的文档预览，这类文件在系统右侧边栏里也是表格；关闭则交回系统自带的纯文本视图。',
        value: settings.nativeTable,
        onToggle: (v) => set('nativeTable', v),
      }),
      // The third lend, and the only one that needs the COMPLETE file rather than
      // its text: an Office document is a ZIP container. Nothing in the product
      // claims .docx/.xlsx/.pptx, so without this the shell's sidebar can only
      // say it has no way to view the file.
      React.createElement(SettingsToggle, {
        label: '系统 Office 文档用本插件渲染',
        desc: '把本插件的 Office 阅读器（离线：Word .docx、Excel .xlsx、PowerPoint .pptx）注册给系统的文档预览，这三类文件在系统右侧边栏里也能直接读；关闭则交回系统（它没有这三类的渲染器，会显示「没有可用的查看方式」）。本插件的面板与弹出页不受此开关影响。',
        value: settings.nativeOffice,
        onToggle: (v) => set('nativeOffice', v),
      }),
      frogNativeSurface ? null : React.createElement('div', { className: 'artifacts-setrow' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, '默认面板宽度'),
          React.createElement('div', { className: 'artifacts-setdesc' }, '面板展开时的宽度（占窗口宽度的百分比，20–85），默认 ' + DEFAULT_SETTINGS.defaultPanelWidth + '%；拖动面板左边缘可临时调整，重新加载后回到该宽度。'),
        ),
        React.createElement('div', { className: 'artifacts-setcontrol' },
          React.createElement('input', {
            type: 'number',
            className: 'artifacts-widthinput',
            min: 20,
            max: 85,
            value: settings.defaultPanelWidth,
            onChange: (e) => {
              const n = parseInt(e.currentTarget.value, 10)
              if (Number.isNaN(n)) return
              set('defaultPanelWidth', Math.max(20, Math.min(85, n)))
            },
          }),
          React.createElement('span', { className: 'artifacts-suffix' }, '%'),
        ),
      ),
      frogNativeSurface ? null : React.createElement('div', { className: 'artifacts-setrow' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, '最短面板宽度'),
          React.createElement('div', { className: 'artifacts-setdesc' }, '面板的最小宽度（占窗口宽度的百分比，20–60）；更宽可通过拖动面板左边缘调整。'),
        ),
        React.createElement('div', { className: 'artifacts-setcontrol' },
          React.createElement('input', {
            type: 'number',
            className: 'artifacts-widthinput',
            min: 20,
            max: 60,
            value: settings.minPanelWidth,
            onChange: (e) => {
              const n = parseInt(e.currentTarget.value, 10)
              if (Number.isNaN(n)) return
              set('minPanelWidth', Math.max(20, Math.min(60, n)))
            },
          }),
          React.createElement('span', { className: 'artifacts-suffix' }, '%'),
        ),
      ),
      // The document skin: which platform typography rendered Markdown wears.
      // It sits with the renderer switches because it belongs to the same
      // question — how a document is DRAWN here — and it applies to all three
      // readers at once (this panel, the shell's document tab, the popout page).
      //
      // A row of BUTTONS, not a <select>, for two reasons. It is the shape this
      // app already uses for a small closed choice (外观: 浅色/深色/跟随系统), so
      // it reads as part of the same settings page; and a native select popup is
      // a browser widget this panel can neither style nor test — it was reported
      // as "cannot be selected" in the running app, which no assertion here can
      // see into. One button per skin with the current one marked: the state is a
      // class and an aria-pressed, and choosing is an ordinary onClick.
      React.createElement('div', { className: 'artifacts-setrow is-stacked' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, 'Markdown 文档皮肤'),
          React.createElement('div', { className: 'artifacts-setdesc' }, '渲染 Markdown 时使用的排版样式：默认跟随本应用的主题，也可以套用 GitHub / 微信 / 知乎 这类平台的文档排版。皮肤只改排版与结构（标题线、行距、代码块、表格、图片位置），颜色仍取自当前主题，因此明暗两种主题下都成立；面板、系统侧边栏的文档页与弹出页会一起切换。'),
        ),
        React.createElement('div', { className: 'artifacts-setcontrol artifacts-setchips' },
          markdownSkinOptions().map((opt) => {
            const on = markdownSkinName(settings.markdownSkin) === opt.value
            return React.createElement('button', {
              key: opt.value,
              type: 'button',
              className: 'artifacts-chip' + (on ? ' is-on' : ''),
              'data-frog-skin': opt.value,
              'aria-pressed': on ? 'true' : 'false',
              title: 'Markdown 文档皮肤：' + opt.label,
              onClick: () => set('markdownSkin', opt.value),
            }, opt.label)
          }),
        ),
      ),
      // Line numbers, as a PAIR of switches rather than one. They answer the same
      // question ("which line am I looking at?") about two different views, and
      // people want them differently: a reader who keeps the preview open wants
      // the gutter to cite a line in a request, while someone editing in a narrow
      // panel may want the column gone to buy back width. One switch would force
      // both views to agree; two cost nothing and let the pair be set apart.
      //
      // The preview's numbers are the file's REAL lines (the renderer stamps each
      // block with the source line it came from), not a count of drawn rows.
      React.createElement(SettingsToggle, {
        label: '预览显示行号',
        desc: '在渲染后的 Markdown 左侧显示每一块的源码行号，方便按行定位与引用（多行的块显示起止行，如 12–18）。数字取自渲染时就写进块上的源码行锚点，因此与选中文本后「引用/定位」报告的行号永远一致；只标注顶层块（标题、段落、列表、代码块…），列表项、表格单元格这类嵌套块不标注，否则数字会缩进错位。面板、系统侧边栏的文档页与弹出页一起生效。',
        value: settings.previewLineNumbers,
        onToggle: (v) => set('previewLineNumbers', v),
      }),
      React.createElement(SettingsToggle, {
        label: '编辑器显示行号',
        desc: '编辑器（CodeMirror）左侧的行号列。关闭可省出一点宽度，尤其是窄面板；切换是即时的，不会重挂编辑器，因此光标位置、撤销历史与未保存的草稿都保留。',
        value: settings.editorLineNumbers,
        onToggle: (v) => set('editorLineNumbers', v),
      }),
      React.createElement('div', { className: 'artifacts-setrow' },
        React.createElement('div', { className: 'artifacts-settext' },
          React.createElement('div', { className: 'artifacts-settitle' }, '弹出页预览区宽度'),
          React.createElement('div', { className: 'artifacts-setdesc' }, '弹出标签页里预览区占分割区的百分比（20–80），决定预览与列表/文件树之间分界线的初始位置；仍可左右拖动分界线临时调整。侧边栏不受这一项影响：那里点文件会在面板自己的标签里全宽预览。'),
        ),
        React.createElement('div', { className: 'artifacts-setcontrol' },
          React.createElement('input', {
            type: 'number',
            className: 'artifacts-widthinput',
            min: 20,
            max: 80,
            value: settings.previewHeight,
            onChange: (e) => {
              const n = parseInt(e.currentTarget.value, 10)
              if (Number.isNaN(n)) return
              set('previewHeight', Math.max(20, Math.min(80, n)))
            },
          }),
          React.createElement('span', { className: 'artifacts-suffix' }, '%'),
        ),
      ),
    ),
  )
}

