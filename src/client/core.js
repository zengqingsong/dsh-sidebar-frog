    // ── Lifetime: every registration belongs to this plugin's own fiber ─────
    // The shell HOT-SWAPS a rebuilt client plugin: dsh-client-hmr's `reload`
    // invalidates the module, deletes the loader entry's fiber, waits for its
    // inertia (its disposers) and then calls `entry.refresh()` — which applies
    // the freshly fetched bundle again. A registration whose disposer never
    // reached that fiber therefore OUTLIVES the module that made it, and the new
    // apply collides with itself. Both collisions are silent and wrong:
    //
    //   · the tab registry refuses an id it already holds, so every type is
    //     rolled back and the panel falls back to the floating window — the
    //     「原始的界面」, which then survives until the process is restarted;
    //   · the document-preview registry refuses a duplicate implementation, so
    //     the lent Markdown / table renderer quietly disappears.
    //
    // `ctx.effect` is the one channel a plugin has for handing disposers back to
    // its fiber, and the product's own client plugins wrap EVERY registration in
    // it (ui-sidebar-files does exactly this for its tab type). This helper is
    // that call, with a fallback for a context that has no `effect` at all.
    const bindLifecycle = (fn) => {
      if (ctx && typeof ctx.effect === 'function') return ctx.effect(fn)
      const dispose = fn()
      if (typeof dispose === 'function' && ctx && typeof ctx.on === 'function') {
        try { ctx.on('dispose', () => { try { dispose() } catch (e) {} }) } catch (e) {}
      }
      return dispose
    }

    // ── Which build the HOST half is running ───────────────────────────────
    // The two halves of this plugin have different lifetimes, and that asymmetry
    // is the whole reason a rebuild sometimes needs a process restart:
    //
    //   · the HOST half is read once, when `dsh web` boots (it composes the
    //     routes, the popout page and the vendored assets in memory), so new
    //     host code needs a restart;
    //   · the CLIENT half is fetched per page load and the shell can even
    //     hot-swap it (dsh-client-hmr), so it needs only a refresh.
    //
    // The host reports its own digest in the artifact-list answer; settings shows
    // both and says which one is stale, instead of leaving the user to guess why
    // a rebuilt feature "did nothing".
    const hostBuildStore = {
      value: '',
      listeners: [],
      set(value) {
        const next = typeof value === 'string' ? value : ''
        if (next === this.value) return
        this.value = next
        this.listeners.forEach((fn) => { try { fn(next) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const useHostBuild = () => {
      const [value, setValue] = React.useState(hostBuildStore.value)
      React.useEffect(() => hostBuildStore.subscribe(setValue), [])
      return value
    }

    // Last path segment. Windows paths use "\", so split on BOTH separators —
    // splitting on "/" alone made a path like D:\ai\proj\chart.png display its
    // whole self wherever a file name was expected.
    const basename = (p) => {
      const text = String(p == null ? '' : p)
      const parts = text.split(/[/\\]/)
      return parts[parts.length - 1] || text
    }

    // ── Which session is on screen ──────────────────────────────────────────
    // The list snapshot carries NO `current`/`active` field in the DSH this
    // plugin runs against: `SessionListState` is
    // `{ ids, byId, phase, subagentsByParent, jobsBySession }`
    // (@deepseek-ai/dsh-api-session-controller). Reading `snap.current` — the
    // shape this used to assume — therefore returned '' on EVERY call, silently,
    // for every consumer at once.
    //
    // What is left as the truth is the retention count: the session the MAIN
    // VIEW holds is the session being shown, which is exactly the test the
    // shell's own session surface makes (`isMain` in ui-session reads
    // `list.getSnapshot().byId[id].retainedBy.mainView`). So that is what is read
    // here, with the explicit field still honored first for a shell that has one.
    //
    // An empty id is not cosmetic. It roots the file tree at "the most recent
    // session's workspace" (the host's own fallback for an unnamed request),
    // which looks right until the user switches workspace or session; it drops
    // the `?sessionId=` from the popout page; it makes `@引用` give up on the
    // composer and copy to the clipboard instead; and it is why 「在系统侧边栏
    // 打开」 refused with no reason at all.
    const currentSessionId = () => {
      try {
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list
        if (!list || typeof list.getSnapshot !== 'function') return ''
        const snap = list.getSnapshot()
        if (!snap) return ''
        const explicit = snap.current != null ? snap.current : snap.active
        if (typeof explicit === 'string' && explicit) return explicit
        const byId = snap.byId || {}
        const ids = Array.isArray(snap.ids) && snap.ids.length ? snap.ids : Object.keys(byId)
        for (const id of ids) {
          const row = byId[id]
          if (row && row.retainedBy && row.retainedBy.mainView > 0) return id
        }
      } catch (e) {}
      return ''
    }

    // The workspace root of one session, from the same list snapshot. It is what
    // makes an absolute path INSIDE that workspace addressable as a session file
    // (see sessionFileAddress in src/client/docpreview.js).
    const sessionCwd = (sessionId) => {
      try {
        if (typeof sessionId !== 'string' || !sessionId) return ''
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list
        if (!list || typeof list.getSnapshot !== 'function') return ''
        const snap = list.getSnapshot()
        const row = snap && snap.byId ? snap.byId[sessionId] : null
        return row && typeof row.cwd === 'string' ? row.cwd : ''
      } catch (e) { return '' }
    }

    // Write `@path` into the current session's composer draft. Returns true on
    // success, false when the input API is unavailable (caller then falls back
    // to clipboard copy).
    const quoteToComposer = (path) => {
      try {
        const sessions = ctx.get('sessions')
        const conversation = ctx.get('conversation')
        if (!sessions || !conversation) return false
        const sessionId = currentSessionId()
        if (!sessionId) return false
        const actx = typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
        if (!actx) return false
        const input = conversation.input && typeof conversation.input.for === 'function' ? conversation.input.for(actx) : undefined
        if (!input || typeof input.setDraft !== 'function') return false
        let draft = ''
        try {
          if (input.state && typeof input.state.getSnapshot === 'function') draft = input.state.getSnapshot().draft || ''
        } catch (e) {}
        const text = '@' + path
        input.setDraft(draft && draft.trim() !== '' ? draft + ' ' + text : text)
        return true
      } catch (e) {
        return false
      }
    }

    const fallbackCopy = (text) => {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch (e) {}
    }

    // Shared open/close state between the header trigger and the floating panel.
    const store = {
      open: false,
      listeners: [],
      setOpen(v) {
        if (this.open === v) return
        this.open = v
        this.listeners.forEach((fn) => { try { fn(v) } catch (e) {} })
      },
      toggle() { this.setOpen(!this.open) },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const useOpen = () => {
      const [open, setOpen] = React.useState(store.open)
      React.useEffect(() => store.subscribe(setOpen), [])
      return open
    }

    // Feature settings, persisted in localStorage so they survive reloads and
    // shared with the popout tab (see src/shared/settings.js). The key and the
    // defaults live in the shared modules, so the two halves cannot disagree
    // about either.
    const SETTINGS_KEY = BRIDGE.settings
    function loadSettings() {
      try { return parseSettings(localStorage.getItem(SETTINGS_KEY)) } catch (e) { return parseSettings(null) }
    }

    const settingsStore = {
      data: loadSettings(),
      listeners: [],
      get() { return this.data },
      set(key, value) {
        // normalizeSettings clamps the numbers into their documented ranges and
        // coerces the booleans, so nothing else has to re-validate on read.
        const next = normalizeSettings(Object.assign({}, this.data, { [key]: value }))
        this.data = next
        try { localStorage.setItem(SETTINGS_KEY, serializeSettings(next)) } catch (e) {}
        this.listeners.forEach((fn) => { try { fn(next) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    // Apply the "默认展开" preference once at startup, before any component
    // mounts so the initial open/closed state matches the persisted setting.
    store.open = !!settingsStore.get().defaultOpen

    const useSettings = () => {
      const [s, setS] = React.useState(settingsStore.get())
      React.useEffect(() => settingsStore.subscribe(setS), [])
      return s
    }

    // Transient status line ("已复制", "已从弹出页插入 …") shared by the panel and
    // the cross-window bridge. It lives outside React because the bridge runs
    // whether or not the panel is open — and because the one timer must survive
    // the panel unmounting.
    const noticeStore = {
      text: '',
      timer: null,
      listeners: [],
      flash(msg, ms) {
        this.text = msg ? String(msg) : ''
        this.listeners.forEach((fn) => { try { fn(this.text) } catch (e) {} })
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        if (this.text) this.timer = setTimeout(() => { this.timer = null; noticeStore.flash('') }, ms || 1600)
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const useNotice = () => {
      const [text, setText] = React.useState(noticeStore.text)
      React.useEffect(() => noticeStore.subscribe(setText), [])
      return text
    }

    // ── Divider position ───────────────────────────────────────────────────
    // Both halves read and write the same px override: a drag in either place is
    // remembered by the other, and clearing it ("展开预览区") falls back to the
    // configured「预览区默认宽度」percentage in both.
    const readStoredPreviewWidth = () => {
      try { return bridgeParseWidth(localStorage.getItem(BRIDGE.previewWidth)) } catch (e) { return null }
    }
    const storePreviewWidth = (px) => {
      const n = Math.round(px)
      if (!Number.isFinite(n) || n <= 0) return
      try { localStorage.setItem(BRIDGE.previewWidth, String(n)) } catch (e) {}
    }
    const clearStoredPreviewWidth = () => {
      try { localStorage.removeItem(BRIDGE.previewWidth) } catch (e) {}
    }

    // The divider override, shared by the panel and the popout tab: whichever
    // one is dragged updates the other live, and both fall back to the
    // configured percentage when it is cleared. `persist` is false during a drag
    // (one localStorage write per mouseup, not per mousemove) and true when the
    // value settles.
    const previewWidthStore = {
      value: readStoredPreviewWidth(),
      listeners: [],
      set(px, persist) {
        this.value = px == null ? null : Math.round(px)
        if (persist) {
          if (this.value == null) clearStoredPreviewWidth()
          else storePreviewWidth(this.value)
        }
        this.listeners.forEach((fn) => { try { fn(this.value) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const usePreviewWidth = () => {
      const [px, setPx] = React.useState(previewWidthStore.value)
      React.useEffect(() => previewWidthStore.subscribe(setPx), [])
      return px
    }

    // ── Background jobs ────────────────────────────────────────────────────
    // Read straight out of the official session list store: the shell already
    // mirrors every session's background jobs into `jobsBySession` (its own
    // header button renders the same array), so a job view costs no host code and
    // cannot drift from what the shell shows. Read-only on purpose — the jobs
    // service is owner-scoped and the shell owns running/stopping them.
    const readJobs = (sessionId) => {
      try {
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list
        const snap = list && typeof list.getSnapshot === 'function' ? list.getSnapshot() : null
        const bySession = snap && snap.jobsBySession
        if (bySession && sessionId && bySession[sessionId]) return bySession[sessionId].slice()
      } catch (e) {}
      return []
    }

    const useJobs = (sessionId) => {
      const [jobs, setJobs] = React.useState(() => readJobs(sessionId))
      React.useEffect(() => {
        setJobs(readJobs(sessionId))
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return undefined
        return list.subscribe(() => setJobs(readJobs(sessionId)))
      }, [sessionId])
      return jobs
    }

    const jobIsLive = (job) => !!job && (job.status === 'running' || job.status === 'stopping')

    // ── Cross-window bridge: the popout tab and this window ────────────────
    // The popout is a second document on the same origin, so localStorage is
    // shared and a write over there arrives here as a `storage` event (never in
    // the writer itself, which is what makes it usable as a message channel).
    // Three legs, all keyed in src/shared/bridge.js:
    //   quote  ← the popout asks this window to write an @reference into the
    //            composer, and gets an ack back telling it whether to copy
    //            instead (no composer here, or no main window at all);
    //   settings ⇄ two app windows open side by side stay in step;
    //   previewWidth ⇄ the divider dragged in the popout follows here.
    const installCrossWindowBridge = () => {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
      const onQuote = (e) => {
        if (!e || e.key !== BRIDGE.quote || !e.newValue) return
        const req = bridgeDecodeQuote(e.newValue)
        // A stale payload (left in storage by an earlier popout) must not pop
        // text into the composer just because this window happened to reload.
        if (!req || !bridgeQuoteIsFresh(req, Date.now())) return
        const inserted = quoteToComposer(req.path)
        try { localStorage.setItem(BRIDGE.ack, bridgeEncodeAck(req.nonce, inserted)) } catch (err) {}
        if (inserted) noticeStore.flash('已从弹出页插入 @' + basename(req.path))
      }
      // Two app windows open side by side: whichever one owns the settings UI
      // keeps the other in step.
      const onSettings = (e) => {
        if (!e || e.key !== SETTINGS_KEY) return
        const next = parseSettings(e.newValue)
        settingsStore.data = next
        settingsStore.listeners.forEach((fn) => { try { fn(next) } catch (err) {} })
      }
      // The popout tab dragged its divider: follow it (without writing back, or
      // the two windows would ping-pong the same value).
      const onWidth = (e) => {
        if (!e || e.key !== BRIDGE.previewWidth) return
        previewWidthStore.set(readStoredPreviewWidth(), false)
      }
      window.addEventListener('storage', onQuote)
      window.addEventListener('storage', onSettings)
      window.addEventListener('storage', onWidth)
      return () => {
        window.removeEventListener('storage', onQuote)
        window.removeEventListener('storage', onSettings)
        window.removeEventListener('storage', onWidth)
      }
    }
    // Bound to the fiber, and not only for tidiness: the WINDOW outlives a
    // hot-swapped module, so listeners left behind by the previous bundle run
    // alongside the new one's — after N reloads a single @引用 from the popout
    // would be inserted N times, and a settings change would be applied N times.
    bindLifecycle(installCrossWindowBridge)

    // ── Where the shell's own right sidebar is ─────────────────────────────
    // The shell ships a native right sidebar (files / document preview / any
    // third-party tab type). Our floating panel has to sit BESIDE it, and the
    // conversation column has to yield to both — which needs its width.
    //
    // There is no CSS variable for it. The panel is a plain element
    // (`[data-sidebar-right-panel]`) that slides in with
    // `[data-sidebar-right-open]`, and the community better-sidebar plugin
    // STOPPED drawing a right panel in v0.19 (it registers tabs into the native
    // one instead), so the `--dsh-sidebar-width` this plugin used to read has had
    // no writer for a while: every offset silently evaluated to 0 and the
    // "make room" behaviour degraded to "make none". Measuring the element is
    // what actually tracks the shell, including its own drag and animation.
    const SHELL_RIGHT_PANEL = '[data-sidebar-right-panel]'
    const SHELL_RIGHT_ATTR = 'data-sidebar-right-open'
    const SHELL_RIGHT_VAR = '--dsh-sidebar-frog-right'

    const shellRightWidth = () => {
      if (typeof document === 'undefined') return 0
      const el = document.querySelector(SHELL_RIGHT_PANEL)
      if (!el) return 0
      if (el.getAttribute(SHELL_RIGHT_ATTR) == null) return 0
      const rect = el.getBoundingClientRect()
      const width = Math.round(window.innerWidth - rect.left)
      return width > 0 ? width : 0
    }

    const publishShellRight = () => {
      const width = shellRightWidth()
      try {
        if (width > 0) document.documentElement.style.setProperty(SHELL_RIGHT_VAR, width + 'px')
        else document.documentElement.style.removeProperty(SHELL_RIGHT_VAR)
      } catch (e) {}
      return width
    }

    // Follow the shell's panel for as long as this component lives: a
    // ResizeObserver covers its drag and its slide-in animation, the attribute
    // observer covers open/close (which changes the width without a resize while
    // the element is still off-canvas), and a slow poll covers a panel that
    // mounts after us or an engine without either observer.
    const watchShellRight = () => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
      let observer = null
      let attrObserver = null
      let poll = null
      const attach = () => {
        const el = document.querySelector(SHELL_RIGHT_PANEL)
        if (!el) return false
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(() => publishShellRight())
          try { observer.observe(el) } catch (e) {}
        }
        if (typeof MutationObserver === 'function') {
          attrObserver = new MutationObserver(() => publishShellRight())
          try { attrObserver.observe(el, { attributes: true, attributeFilter: [SHELL_RIGHT_ATTR, 'data-sidebar-right-mode'] }) } catch (e) {}
        }
        return true
      }
      publishShellRight()
      if (!attach()) {
        // The shell mounts its panel lazily; keep looking until it appears.
        poll = setInterval(() => { if (attach()) { publishShellRight(); clearInterval(poll); poll = null } }, 1000)
      }
      const onResize = () => publishShellRight()
      window.addEventListener('resize', onResize)
      return () => {
        try { if (observer) observer.disconnect() } catch (e) {}
        try { if (attrObserver) attrObserver.disconnect() } catch (e) {}
        if (poll) clearInterval(poll)
        window.removeEventListener('resize', onResize)
        try { document.documentElement.style.removeProperty(SHELL_RIGHT_VAR) } catch (e) {}
      }
    }

