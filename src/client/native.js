    // ── The shell's own right sidebar: this panel's native home ────────────
    // `ctx.sidebarRightTabs` is a PUBLIC extension point, not a private one:
    // a tab TYPE registers there (what it is — its kind, its title, its guide
    // entry) and its BODY registers into the keyed `sidebar.right.pane.tab`
    // seat under the same `id` (what it draws). That is exactly how the
    // product's own document preview registers itself, so a third-party tab is
    // a first-class occupant rather than a guest.
    //
    // Registering is worth more than the pixels it replaces:
    //   · the shell owns 展开 / 收起 / 全屏 / 拖宽 / 分栏, so this plugin draws
    //     NO second sidebar toggle — the duplicated control that used to sit in
    //     the same 28px band as the shell's own button is simply gone;
    //   · the layout push (`html #root { margin-right }`) and the panel-width
    //     preferences become the shell's business instead of ours.
    //
    // The floating panel stays as the FALLBACK for a shell that offers no such
    // registry (an older build, or a contract that moved on): `registerNativeTab`
    // then returns false and the caller registers the overlay instead. Both
    // paths ship in every build, and scripts/check.js drives each one.
    // ── One system tab per view ─────────────────────────────────────────────
    // Every view this plugin offers is a tab TYPE of the shell's column, not a
    // view inside a self-drawn frame: the chip, the chrome, fullscreen, floating
    // and the tab menu are all the shell's, and each body draws its view and
    // nothing else.
    //
    // ── Why the tree rides the product's own `files` kind ───────────────────
    // The first row is not a new kind: it takes the product's `files` over. That
    // is the documented half of its two-band rule — "a kind may carry one
    // `builtin` and one `extension` registration at once: the extension is the one
    // in force — claims, `get`, the guide page, and the body and title, which the
    // seat finds under the definition's own `id` — and the builtin resumes when
    // the extension unregisters" — and it is what makes the column's 文件 tab THIS
    // file tree: the one with @引用 into the composer, the right-click menu,
    // per-directory refresh, filtering, keyboard navigation and A/M change
    // letters. The product's own tree is a plain list (its bundle has no
    // `contextmenu` and no reference action at all), so a user coming from this
    // plugin's floating panel watched the file tree "lose" both capabilities the
    // moment the column started showing the product's tab instead of ours.
    //
    // ── One guide entry per view ────────────────────────────────────────────
    // Each row carries exactly one, so the chooser page lists the whole set. The
    // column's own seeding rule then applies — "one entry ⇒ open it; several ⇒
    // open the chooser" (ui-sidebar-right's defaultSeed) — which is the accepted
    // price of listing every view instead of hiding three of them behind the
    // first. Handing the column back is one click in settings (`nativeFileTree`),
    // and the builtin resumes exactly as the contract promises.
    //
    // `view` is the internal name the body factory switches on (see the
    // `fixedView` prop in src/client/components.js); `order` is the position in
    // the guide. USAGE_TAB_ID / USAGE_TAB_KIND / USAGE_TAB_TITLE come from
    // src/client/usage.js, and the Git ids from src/client/git.js — both are
    // inlined into this same closure just below, and are only READ when
    // registration runs, long after they exist.
    const FROG_FILES_ID = 'dsh-sidebar-frog/files'
    // The kind the tree occupies, spelled once: the tab definition below, the
    // footer entry point and the 「加载时展开」default all open the SAME page by it.
    const FROG_FILES_KIND = 'files'
    const FROG_TABS = [
      {
        id: FROG_FILES_ID, kind: FROG_FILES_KIND, view: 'tree', title: '文件', order: 10,
        description: '工作区文件树：@引用到输入框、右键菜单、按目录刷新与 A/M 改动字母。',
      },
      {
        id: 'dsh-sidebar-frog/artifacts', kind: 'frog-artifacts', view: 'artifacts', title: '产物', order: 20,
        description: '代理创建 / 编辑过的文件台账，带行级 diff 与撤销。',
      },
      {
        id: 'dsh-sidebar-frog/jobs', kind: 'frog-jobs', view: 'jobs', title: '任务', order: 30,
        description: '会话里的后台任务：只读镜像系统自己的任务列表，不自建 runner。',
      },
      {
        id: USAGE_TAB_ID, kind: USAGE_TAB_KIND, view: 'usage', title: USAGE_TAB_TITLE, order: 40,
        description: '上下文占用与累计 token 用量：直接读系统的会话投影，不另记一份账。',
      },
      {
        id: GIT_TAB_ID, kind: GIT_TAB_KIND, view: 'git', title: GIT_TAB_TITLE, order: 50,
        description: 'Git 只读切片：分支、ahead/behind、已改/未跟踪文件，以及某个文件与 HEAD 的行级差异。不含任何写操作。',
      },
    ]
    // ── Legacy tab kinds: never delete a name this plugin has occupied ───────
    // The right column's LAYOUT IS DURABLE — it rides the session log — so a
    // session that once had a tab of an older kind re-opens that tab after an
    // upgrade. The seat dispatches a tab by `definition?.id ?? tab.kind`, and
    // with the old definition gone it falls back to the bare old KIND, looks for
    // a body under that key, finds none, and prints the shell's 「这类内容还没有
    // 可用的查看方式。」 where the panel used to be. That is exactly what the
    // round-3 rename (`frog` → the product's `files`) did to every existing
    // session, so the old kind keeps a body here.
    //
    // THE RULE: renaming the kind or the id again means APPENDING the retired
    // name below, never replacing it.
    //
    // `frog-browser` is on the list for the second reason a name retires: the
    // view is GONE (the 内置浏览器 tab was removed after review — the product's
    // own document preview already renders a workspace .html live, so the pane
    // only ever earned its place for a dev server, and it cost a whole
    // cookie-less data route to serve one). A session that had that tab open must
    // still draw something: like every other retired name it comes back as the
    // ledger, the view the panel exists for.
    const FROG_LEGACY_TAB_KEYS = ['frog', 'frog-browser']

    // Every kind this plugin answers for in the column: the five current views
    // plus every retired name a restored tab can still carry. The per-tab popout
    // item below is offered on THESE and on nothing else — a foreign tab in the
    // same column (the product's chooser, another plugin's panel) must not grow a
    // button that opens this plugin's page.
    const FROG_TAB_KINDS = new Set(FROG_TABS.map((spec) => spec.kind).concat(FROG_LEGACY_TAB_KEYS))

    // Which surface the panel actually got. The settings section reads it,
    // because the width and 默认展开 preferences belong to the overlay alone.
    let frogNativeSurface = false

    const sidebarTabs = () => {
      try {
        const tabs = ctx.get('sidebarRightTabs')
        return tabs && typeof tabs.register === 'function' ? tabs : null
      } catch (e) { return null }
    }

    // A PAGE type: without `patterns` it recognizes no resource address and is
    // opened by kind (the guide entry and the strip's own controls name it).
    // `priority: 'extension'` is the band a type from outside the product
    // declares; every thunk is re-read on use so a language change needs no
    // re-registration.
    const frogTabDefinition = (spec) => ({
      id: spec.id,
      kind: spec.kind,
      priority: 'extension',
      title: () => spec.title,
      guide: [{ order: spec.order, title: () => spec.title, description: () => spec.description }],
    })

    // Register every view as a tab of the column. Returns whether that is now the
    // panel's surface; a `false` return means the caller must register the
    // floating panel, and guarantees this attempt left nothing registered behind
    // (a type whose body never registered would render the seat's "nothing can
    // view this" notice).
    //
    // The two stages are the product's own idiom, mirroring
    // ui-sidebar-documentpreview: the types go into the registry, and the bodies
    // go into the keyed seat THROUGH `slots.inject` — that seat is declared as a
    // child of `rightbar.session`, so it only exists once a session view is
    // mounted, and `inject` is what defers the registration until it does. The
    // seat looks a body up by `entryKey`, which is the definition's `id`, so each
    // body's key must be exactly its own id and not the kind.
    //
    // Whether we register at all is the `nativeFileTree` setting, read ONCE here
    // rather than watched: swapping the panel's whole surface under a live column
    // means tearing down one registration while building the other, and a
    // half-swapped state (both surfaces, or neither) is far worse than asking for
    // a reload. Switching it off hands the column straight back to the product.
    const registerNativeTab = (slots, renderView) => {
      const tabs = sidebarTabs()
      if (!tabs) return false
      if (!settingsStore.get().nativeFileTree) return false
      const dropTypes = []
      const rollback = () => {
        for (const drop of dropTypes) {
          try { if (typeof drop === 'function') drop() } catch (e) {}
        }
      }
      try {
        // All types first: each `register` throws on an id already in use (a
        // double-mounted half, or a registration left behind by a hot-swapped
        // bundle — see bindLifecycle in src/client/core.js), and losing the panel
        // over it would be the wrong trade, so every one of them is rolled back
        // and the caller falls back to the floating panel.
        //
        // Bound to the fiber ON PURPOSE: the type registrations are exactly what
        // leaked across a hot swap before, and a leaked type is what made the
        // next apply collide and drop to the floating window.
        for (const spec of FROG_TABS) dropTypes.push(bindLifecycle(() => tabs.register(frogTabDefinition(spec))))
      } catch (e) {
        rollback()
        return false
      }
      try {
        // The generator form is the product's own idiom for more than one
        // registration into one seat (ui-sidebar-right does exactly this for its
        // two seats): each `yield` hands the framework that registration's
        // disposer.
        slots.inject('sidebar.right.pane.tab', function* registerFrogBodies() {
          for (const spec of FROG_TABS) {
            yield slots.register({ name: 'sidebar.right.pane.tab', key: spec.id }, renderView(spec.view))
          }
          for (const legacy of FROG_LEGACY_TAB_KEYS) {
            // A restored tab of a retired kind draws the LEDGER, which is what
            // that tab meant when it was opened — not the file tree.
            yield slots.register({ name: 'sidebar.right.pane.tab', key: legacy }, renderView('artifacts'))
          }
        })
        frogNativeSurface = true
        return true
      } catch (e) {
        rollback()
        return false
      }
    }

    // ── The column's own entry points ───────────────────────────────────────
    // Where this plugin asks the shell to show its tree. One command does both
    // jobs: `openTab` claims the page, places it, and expands the column in the
    // same step — "content the user cannot see is not opened" — so a caller never
    // has to expand first and open second.
    const shellSidebar = () => {
      try {
        const sidebar = ctx.get('sidebarRight')
        return sidebar && typeof sidebar.openTab === 'function' ? sidebar : null
      } catch (e) { return null }
    }

    // Returns whether the shell ACCEPTED the open. `false` covers both "no such
    // face" and "no seat is mounted for a session yet" — the latter is the normal
    // answer for a moment after a session switch, which is what the retry ladder
    // below exists for.
    const openFrogFilesTab = () => {
      const sidebar = shellSidebar()
      if (!sidebar) return false
      try {
        sidebar.openTab(FROG_FILES_KIND)
        return true
      } catch (e) { return false }
    }

    // The session the shell itself calls BLANK: one that has never run a turn.
    // The id comes from the SAME reader the panel uses everywhere else
    // (currentSessionId in src/client/core.js) — the list snapshot has no
    // `current` field to read, and a private second reader is how this one came
    // to answer '' forever — and only a literal `blank: true` counts: an older
    // shell whose summaries say nothing is left alone rather than guessed at.
    const blankSessionId = () => {
      try {
        const sessions = ctx.get('sessions')
        const list = sessions && sessions.list
        if (!list || typeof list.getSnapshot !== 'function') return ''
        const id = currentSessionId()
        if (!id) return ''
        const snap = list.getSnapshot()
        const summary = snap && snap.byId && snap.byId[id]
        return summary && summary.blank === true ? id : ''
      } catch (e) { return '' }
    }

    // ── Why a default page is needed at all ────────────────────────────────
    // In native mode the shell owns the column, and its two own defaults leave
    // this plugin's tree out of reach in a brand-new session:
    //
    //   · the surface a session starts with is COLLAPSED and holds no tab, and
    //     the shell's ONLY expand control is registered into
    //     `conversation.session.header.corner` — a header the shell renders
    //     `display:none` for as long as the session is blank. A session that has
    //     never run a turn therefore offers no way to open the column at all:
    //     not this tree, and not the product's own 文件 tab either.
    //   · and once the column CAN be opened, the pane is seeded by the shell's
    //     `defaultSeed`, which resolves to "the sole guide entry, or the chooser
    //     page when there are zero or more than one". Stock DSH registers exactly
    //     one entry (the product's files kind); this plugin registers six, so a
    //     first expansion would land on the chooser instead of the tree.
    //
    // So the plugin makes the column's first page explicit, exactly as the
    // floating panel honored 「加载时展开」: it opens 文件 itself. Two rules keep
    // that from ever taking over a column the user is using:
    //
    //   · only a session the shell reports as BLANK is considered — a session
    //     with turns in it keeps whatever layout it has;
    //   · only while the mounted column holds NO tab at all, and only once per
    //     session: a column that has been used, or emptied down to the guide, is
    //     never re-seeded.
    //
    // The ladder, not a single call: the open needs the seat to be MOUNTED for
    // the session it names, and the seat mounts a render after the snapshot that
    // announced the session. The first attempt is synchronous so a seat that is
    // already there is served at once; the rest cover the switch. Every attempt
    // that succeeds — or that finds a column already holding something — retires
    // that session for good.
    const COLUMN_RETRY_MS = [0, 120, 400, 900, 1800]
    const columnSettled = new Set()

    const installColumnEntryPoints = (slots) => {
      if (!frogNativeSurface) return false
      // Gated by the takeover switch and 「加载时展开」only. NOT by the floating
      // panel's 「文件树」 preference: that one governs the OVERLAY's band, while
      // the column's 文件 tab is drawn regardless of it (a native 文件 tab must
      // never be blank — see the `fixedView === 'tree'` rule in components.js).
      // Reading it here would quietly disable both entry points for anyone who had
      // switched that view off while the panel was floating.
      if (!settingsStore.get().nativeFileTree) return false

      // ── The way IN (文件树) and the way OUT (弹出页) — ONE seat occupant ───
      // Root-scoped and rendered in every state — including the hero screen of a
      // blank session, where the shell hides the header holding its own expand
      // button. This is that button's stand-in for the column this plugin owns,
      // it is why the tree is reachable before the first message, and it is the
      // only seat that still exists while the column is collapsed.
      //
      // The link is here for the same reason: the floating panel owns two links to
      // `/dsh-sidebar-frog` (its own top bar while it is open, the corner switch
      // while it is closed) and NEITHER of them is registered when the column
      // carries the panel — so without a footer link, 「一键弹出到独立标签页」 has
      // no way in at all on the native surface, while the README keeps promising
      // it. That is not hypothetical: it is what shipped, and nothing noticed,
      // because every check asked about the overlay. (1) The VISIBLE one is this
      // link; (2) is the per-tab item further down.
      //
      // ONE occupant, not two — a layout fact, not a taste call. The shell lays
      // this seat out as a ROW in BOTH fold states (`dsh-client-ui-sidebar`:
      // `.footerActions{display:flex}`, and in the rail
      // `.collapsed .footerActions{justify-content:center;width:auto}`), so two
      // registrations are ALWAYS side by side. In the rail they do not even fit:
      // it is 56px wide (`SIDEBAR_COLLAPSED`, ui-layout) minus 10px of inline
      // padding — a 36px content box — while one round button is 36px, so the
      // second button landed outside the rail. That row is not ours to restyle
      // (its class is a private CSS-module hash), so the pair is registered as one
      // occupant that owns its own direction: a column (`.artifacts-foot-stack`).
      slots.inject('sidebar.footer.action', () => slots.register({
        name: 'sidebar.footer.action', id: 'dsh-sidebar-frog-foot', order: 45, label: '文件树与弹出页',
      }, SidebarFooterActions))

      // (2) The per-tab one, in the column's own actions menu
      // (`sidebar.right.tab.menu.item`, a list seat under the mounted column).
      // Worth knowing: the kit's tab chip has no visible trigger for that menu —
      // it opens on RIGHT-CLICK — which is exactly why it is the secondary way out
      // and the footer button above is the one that must always exist.
      slots.inject('sidebar.right.tab.menu.item', () => slots.register({
        name: 'sidebar.right.tab.menu.item', id: 'dsh-sidebar-frog-popout-tab', order: 30, label: '在新标签页弹出',
      }, PopoutMenuItem))

      bindLifecycle(() => {
        const attempt = () => {
          const current = settingsStore.get()
          // 「加载时展开」is the preference the floating panel honored; in native
          // mode this is where it means something.
          if (!current.defaultOpen || !current.nativeFileTree) return
          const sidebar = shellSidebar()
          if (!sidebar || typeof sidebar.active !== 'function') return
          const sessionId = blankSessionId()
          if (!sessionId || columnSettled.has(sessionId)) return
          let empty
          try { empty = sidebar.active() === undefined } catch (e) { return }
          if (empty === false) {
            // The user's column, not ours to seed.
            columnSettled.add(sessionId)
            return
          }
          if (openFrogFilesTab()) columnSettled.add(sessionId)
        }
        let timers = []
        const kick = () => {
          for (const timer of timers) clearTimeout(timer)
          timers = []
          attempt()
          for (const ms of COLUMN_RETRY_MS) {
            if (ms > 0) timers.push(setTimeout(attempt, ms))
          }
        }
        kick()
        const stops = [settingsStore.subscribe(kick)]
        try {
          const sessions = ctx.get('sessions')
          const list = sessions && sessions.list
          if (list && typeof list.subscribe === 'function') stops.push(list.subscribe(kick))
        } catch (e) {}
        return () => {
          for (const timer of timers) clearTimeout(timer)
          timers = []
          for (const stop of stops) { try { if (typeof stop === 'function') stop() } catch (e) {} }
        }
      })

      return true
    }

    // The footer button. `wide` is the shell's own fold state: an icon row in the
    // 56px rail, an icon + label row in the expanded column — the same shape the
    // product's own footer occupants take.
    //
    // The one case where it cannot do its job is "no session view mounted at all"
    // (first paint, before a session is selected): the column's commands go through
    // the mounted seat, so there is nothing to open into. Saying so beats a button
    // that silently does nothing — the failure mode this codebase refuses to ship.
    const SidebarFooterButton = (props) => {
      const wide = !!(props && props.wide)
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-foot-btn' + (wide ? ' is-wide' : ''),
        'data-frog-footer': 'files',
        title: '打开文件树（右侧边栏）',
        'aria-label': '打开文件树',
        onClick: () => {
          if (!openFrogFilesTab()) noticeStore.flash('还没有会话视图可挂载——先新建或打开一个会话')
        },
      },
        FolderOpenIcon(wide ? 16 : 18),
        wide ? React.createElement('span', { className: 'artifacts-foot-label' }, '文件树') : null,
      )
    }

    // The standing one-click way OUT, stacked under it in the same seat.
    //
    // It is an <a>, not a button calling `window.open`: a real navigation cannot
    // be eaten by a popup blocker (a blocked `window.open` returns null and the
    // click would look dead), and `target` reuses the one browsing context the
    // other three links share.
    const FooterPopoutButton = (props) => {
      const wide = !!(props && props.wide)
      return React.createElement('a', {
        className: 'artifacts-foot-btn' + (wide ? ' is-wide' : ''),
        href: popoutHrefFor(currentSessionId()),
        target: POPOUT_TARGET,
        rel: 'noreferrer noopener',
        'data-frog-footer': 'popout',
        title: '在独立标签页打开（可拖到另一块显示器，与侧边栏实时同步）',
        'aria-label': '弹出到独立标签页',
      },
        PopoutIcon(wide ? 16 : 18),
        wide ? React.createElement('span', { className: 'artifacts-foot-label' }, '弹出页') : null,
      )
    }

    // The seat's occupant: the pair above, in a column.
    //
    // Why a wrapper exists at all is in `installColumnEntryPoints` (the shell's
    // row, and the 36px rail content box that a second occupant overflows); what
    // it does is only this — hand both controls the column state the seat supplies
    // and let the stylesheet stack them. Each control keeps its own identity
    // (`data-frog-footer`) and its own behaviour, so the guards and the browser
    // see the same two controls either way.
    const SidebarFooterActions = (props) => {
      const wide = !!(props && props.wide)
      return React.createElement('div', {
        className: 'artifacts-foot-stack' + (wide ? ' is-wide' : ''),
        'data-frog-footer': 'stack',
      },
        SidebarFooterButton(props),
        FooterPopoutButton(props),
      )
    }

    // 「在新标签页弹出」 as one of a TAB's own actions. Two facts about that seat
    // shape this component:
    //
    //   · the kit renders our node as a RAW CHILD of its menu portal — its own
    //     rows carry a private CSS-module class this plugin cannot use — so the
    //     row is styled by this plugin (`artifacts-menuitem` in styles.js), in the
    //     menu's own colour rather than the panel's, because the portal lives
    //     outside the panel;
    //   · the item decides its own visibility from the tab it is handed, so a tab
    //     that is not ours renders nothing. An item that acts must also dismiss
    //     the menu: the menu is the kit's and closes only on its own actions.
    const PopoutMenuItem = (props) => {
      const tab = props && props.tab
      const dismiss = props && props.dismiss
      if (!tab || !FROG_TAB_KINDS.has(tab.kind)) return null
      return React.createElement('a', {
        className: 'artifacts-menuitem',
        href: popoutHrefFor(currentSessionId()),
        target: POPOUT_TARGET,
        rel: 'noreferrer noopener',
        role: 'menuitem',
        'data-frog-popout': 'tab',
        title: '在新标签页弹出（可拖到另一块显示器）',
        onClick: () => { if (typeof dismiss === 'function') dismiss() },
      },
        PopoutIcon(14),
        React.createElement('span', { className: 'artifacts-menuitem-label' }, '在新标签页弹出'),
      )
    }
