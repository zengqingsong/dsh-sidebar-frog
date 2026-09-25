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
    // ── Which kind this tree occupies is a SETTING, not a constant ───────────
    // Two trees on one strip is what the column used to get: the product's 文件
    // (its own tree, with a live per-directory watcher) and this plugin's 文件树
    // beside it. They draw the same workspace and only one of them carries
    // @引用 / 右键菜单 / 新建删除, so the pair reads as the same thing said twice.
    //
    // The registry's band rule is the only lever the product offers over a
    // builtin tab — a kind may carry one `builtin` and one `extension`, the
    // extension is the one in force, and the builtin resumes when it unregisters
    // — so the two arrangements are:
    //
    //   · `systemFileTree` OFF (default): this plugin registers an `extension`
    //     over the product's `files` kind. The column holds ONE file tree, in the
    //     tab users already know, with every capability this plugin has. What it
    //     costs is inside the product's body: 0.1.7's tree grew a live watcher
    //     (`workspaceFiles.changes`, `data-files-auto-refresh`) that only runs
    //     while ITS body is mounted, so a takeover stops it. That is why the tree
    //     refreshes the directories its own artifact data says changed (see the
    //     artifact-path effect in src/client/filetree.js) instead of leaving the
    //     user to notice a stale row.
    //   · `systemFileTree` ON: nothing is registered for `files`, so the product
    //     keeps its tab, its watcher and its auto-refresh exactly as it ships,
    //     and this plugin's tree is its own 文件树 tab beside it. Nothing is taken
    //     from the product, so nothing has to be handed back.
    //
    // Both settings are read ONCE at registration and recorded in `frogTreeKind`
    // (below), because the footer button, the tab menu and the default page must
    // all name the kind that was actually registered.
    //
    // What the product's tree still does not have is the two capabilities this
    // one does — its bundle has no `contextmenu` and no reference action at all.
    // The reference half is not a reason to take the tree over: `@引用` never
    // depended on this tree, it writes through the shell's own
    // `conversation.input.for(...).setDraft` (see quoteToComposer in
    // src/client/core.js). So it is offered on the PRODUCT's flow too, as a
    // document action in the product's own preview header — see
    // installDocumentActions below. The right-click menu, 新建 / 删除 and the
    // A/M change letters stay here, which is what this tab is for.
    //
    // ── One guide entry per view ────────────────────────────────────────────
    // Each row carries exactly one, so the chooser page lists the whole set. The
    // column's own seeding rule then applies — "one entry ⇒ open it; several ⇒
    // open the chooser" (ui-sidebar-right's defaultSeed) — which is the accepted
    // price of listing every view instead of hiding three of them behind the
    // first.
    //
    // `view` is the internal name the body factory switches on (see the
    // `fixedView` prop in src/client/components.js); `order` is the position in
    // the guide. USAGE_TAB_ID / USAGE_TAB_KIND / USAGE_TAB_TITLE come from
    // src/client/usage.js, and the Git ids from src/client/git.js — both are
    // inlined into this same closure just below, and are only READ when
    // registration runs, long after they exist.
    // ── The guide entry's picture ───────────────────────────────────────────
    // Every entry in the column's chooser carries an `icon`, and the product's
    // own 文件 entry uses `GuideArtworkFiles` — the amber folder-on-a-card, the
    // SAME artwork, byte for byte (36×36 canvas; the guide sizes it to 26px and
    // tints the slot `--dsw-alias-label-secondary`, which is why the palette is
    // fixed here rather than `currentColor`).
    //
    // Copying it beats importing it: the primitives package is the product's
    // internal, not an extension point a plugin may depend on, and the one thing
    // that must NOT happen is our 文件树 chooser row looking unlike the 文件 one
    // beside it. Same reasoning as the 48 code icons in src/shared/filetype.js.
    //
    // The other four entries borrow the product's own 16×16 stroke icons
    // (`viewBox 0 0 16 16`, `strokeWidth: 1`, `currentColor`) so the whole
    // chooser reads as one set instead of "one product icon and four strangers".
    const guideArtworkSvg = (attrs, children) => React.createElement('svg', attrs, children)
    // `IconProps`: `{ size, className }`. The guide renders a guide entry's icon as
    // `<Icon size={26} className={…} />`, so an artwork that ignores its props
    // draws at the wrong size — or, if it is not a component at all, takes the
    // whole chooser down (see the registration below).
    const GuideArtworkFiles = ({ size = 36, className } = {}) => guideArtworkSvg({
      width: size, height: size, viewBox: '0 0 36 36', fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, className,
    }, [
      React.createElement('path', {
        key: 'f1',
        d: 'M10.7603 27.922H24.6817C26.3441 27.922 27.1753 27.922 27.8102 27.5984C28.3687 27.3139 28.8228 26.8598 29.1074 26.3012C29.4309 25.6663 29.4309 24.8351 29.4309 23.1727V15.4936',
        stroke: '#FFCD78', strokeWidth: '1.97886',
      }),
      React.createElement('path', {
        key: 'f2',
        d: 'M13.1597 8.07812C13.4182 8.07818 13.6727 8.14336 13.8989 8.26855L16.7554 9.84961C16.9817 9.97485 17.2369 10.041 17.4956 10.041H26.106C26.9492 10.0412 27.6323 10.7251 27.6323 11.5684V24.5371C27.6323 25.3805 26.9483 26.0645 26.105 26.0645H8.09619C7.25281 26.0645 6.56884 25.3805 6.56885 24.5371V9.60449C6.56909 8.76133 7.25297 8.07812 8.09619 8.07812H13.1597ZM9.81592 14.5508V16.5293H24.3999V14.5508H9.81592Z',
        fill: '#FFBC4D',
      }),
    ])
    // The product's IconDeliverDoc: a stack of pages. 产物 is that idea exactly.
    const GuideArtworkArtifacts = ({ size = 16, className } = {}) => guideArtworkSvg({
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1,
      xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, className,
    }, [
      React.createElement('path', { key: 'a1', d: 'M6.15479 4.91687H9.84543', stroke: 'currentColor' }),
      React.createElement('path', { key: 'a2', d: 'M11.8798 9.55347V2.71525C11.8798 2.37416 11.564 2.09766 11.1744 2.09766H4.82577C4.43618 2.09766 4.12036 2.37416 4.12036 2.71525V9.55347', stroke: 'currentColor' }),
      React.createElement('path', { key: 'a3', d: 'M2.28735 13.8022V8.84792C2.28735 8.77514 2.36262 8.72673 2.42884 8.75693L13.2936 13.7112C13.3914 13.7558 13.3596 13.9022 13.2521 13.9022H2.38735C2.33213 13.9022 2.28735 13.8575 2.28735 13.8022Z', stroke: 'currentColor' }),
      React.createElement('path', { key: 'a4', d: 'M7.46929 10.979L13.5783 8.7416C13.6435 8.7177 13.7126 8.76601 13.7126 8.83551L13.7125 13.8022C13.7125 13.8574 13.6678 13.9022 13.6125 13.9022H7.99999', stroke: 'currentColor' }),
      React.createElement('path', { key: 'a5', d: 'M6.15479 7.2395H9.05644', stroke: 'currentColor' }),
    ])
    // A play triangle for 任务 (the product paints its Jobs rows with a state
    // dot, so the glyph — not the colour — carries the meaning).
    const GuideArtworkJobs = ({ size = 16, className } = {}) => guideArtworkSvg({
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1,
      xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, className,
    }, React.createElement('path', {
      key: 'j1',
      d: 'M5.5 3.4L12.2 8L5.5 12.6V3.4Z',
      stroke: 'currentColor', strokeLinejoin: 'round',
    }))
    // A gauge for 用量: the arc plus the needle, the universal "how much".
    const GuideArtworkUsage = ({ size = 16, className } = {}) => guideArtworkSvg({
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1,
      xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, className,
    }, [
      React.createElement('path', { key: 'u1', d: 'M2.4 12.2A6.4 6.4 0 0 1 13.6 12.2', stroke: 'currentColor', strokeLinecap: 'round' }),
      React.createElement('path', { key: 'u2', d: 'M8 11.6L10.9 7.6', stroke: 'currentColor', strokeLinecap: 'round' }),
    ])
    // The two-node branch, for the read-only Git slice.
    const GuideArtworkGit = ({ size = 16, className } = {}) => guideArtworkSvg({
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', strokeWidth: 1,
      xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true, className,
    }, [
      React.createElement('circle', { key: 'g1', cx: 4.6, cy: 3.6, r: 1.9, stroke: 'currentColor' }),
      React.createElement('circle', { key: 'g2', cx: 11.4, cy: 8, r: 1.9, stroke: 'currentColor' }),
      React.createElement('circle', { key: 'g3', cx: 4.6, cy: 12.4, r: 1.9, stroke: 'currentColor' }),
      React.createElement('path', { key: 'g4', d: 'M4.6 5.5V10.5M6.5 3.9C8.4 4.2 9.6 5.5 9.7 7.4', stroke: 'currentColor', strokeLinecap: 'round' }),
    ])

    const FROG_FILES_ID = 'dsh-sidebar-frog/files'
    // The kind this tree occupies WHEN the product's own tree is also on the
    // strip. Spelled once, because the tab definition below, the footer entry
    // point and the 「加载时展开」default all open the SAME page by it.
    const FROG_FILES_KIND = 'frog-files'
    // The product's own file-tree kind (`@deepseek-ai/dsh-client-ui-sidebar-files`
    // registers it in the `builtin` band). Named here because one setting decides
    // whether this plugin shadows it — see `frogTreeKind`.
    const SYSTEM_FILES_KIND = 'files'
    // The title the takeover tab wears. The product's own word for the tab it
    // drew, kept: the tab in that slot is still "the file tree", and renaming it
    // would be a second change on top of the one the user asked for.
    const SYSTEM_FILES_TITLE = '文件'

    // ── The one recorded decision: which kind OUR tree page occupies ─────────
    // `systemFileTree` decides it, read ONCE at registration (registerNativeTab)
    // and recorded here so the footer button, the tab's own popout menu item and
    // the 「加载时展开」default all name the SAME kind the types were registered
    // under. Re-reading the store in each of those would let a settings change
    // between registration and a click name a kind nothing answers for — and the
    // click would go nowhere, which is the failure this codebase refuses to ship.
    //
    //   · `systemFileTree` on  → the product's 文件 tab keeps its own tree
    //     (watcher and all) and this plugin's tree is the 文件树 tab beside it;
    //   · `systemFileTree` off → this plugin's tree takes the `files` kind over,
    //     so the column holds exactly one file tree, in the tab users know.
    let frogTreeKind = FROG_FILES_KIND
    const FROG_TABS = [
      {
        // 文件树, not 文件: the product's own tab is the 文件 one, and two chips
        // reading the same word would be indistinguishable on the strip.
        id: FROG_FILES_ID, kind: FROG_FILES_KIND, view: 'tree', title: '文件树', order: 10,
        icon: GuideArtworkFiles,
        description: '本插件的文件树：@引用到输入框、右键菜单、新建/删除、按目录刷新与 A/M 改动字母。系统的「文件」标签是另一棵（自带实时监听）。',
      },
      {
        id: 'dsh-sidebar-frog/artifacts', kind: 'frog-artifacts', view: 'artifacts', title: '产物', order: 20,
        icon: GuideArtworkArtifacts,
        description: '代理创建 / 编辑过的文件台账，带行级 diff 与撤销。',
      },
      {
        id: 'dsh-sidebar-frog/jobs', kind: 'frog-jobs', view: 'jobs', title: '任务', order: 30,
        icon: GuideArtworkJobs,
        description: '会话里的后台任务：只读镜像系统自己的任务列表，不自建 runner。',
      },
      {
        id: USAGE_TAB_ID, kind: USAGE_TAB_KIND, view: 'usage', title: USAGE_TAB_TITLE, order: 40,
        icon: GuideArtworkUsage,
        description: '上下文占用与累计 token 用量：直接读系统的会话投影，不另记一份账。',
      },
      {
        id: GIT_TAB_ID, kind: GIT_TAB_KIND, view: 'git', title: GIT_TAB_TITLE, order: 50,
        icon: GuideArtworkGit,
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
    // The ONE exception is the round-4 move off the product's `files` kind. A
    // restored tab of kind `files` needs no body from this plugin, because the
    // PRODUCT declares that kind itself (id `@deepseek-ai/dsh-client-ui-sidebar-files`),
    // so the seat resolves `entryKey` to the product's id and draws the product's
    // tree — the right answer, and a body of ours under the bare key `files` would
    // never be reached anyway. Retiring a name INTO another owner is not a gap.
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
      // The chooser's row picture goes in as a COMPONENT, not as an element.
      // `SidebarRightGuideEntry.icon` is typed `ComponentType<IconProps>`, and the
      // guide body renders it as `<Icon size={26} className={…} />` — the same
      // shape the product's own CompassGlyph / CubeGlyph / GuideArtworkFiles have.
      // Calling `spec.icon()` here (as this did) hands React an element OBJECT as
      // the element type; React rejects it, the throw lands inside the guide's own
      // render, and because that is the fallback for the whole body the Start page
      // comes out completely empty — while the tab strip, which is built from the
      // definitions rather than from the guide, still looks perfectly normal.
      //
      // `id` is the entry's own identity: the registry rejects duplicates within a
      // definition, and the guide passes it to the entry slot. The product's own
      // entries carry one ("workspace", "new"); `spec.view` is ours, and is unique
      // per definition by construction.
      guide: [{
        id: spec.view,
        order: spec.order,
        title: () => spec.title,
        description: () => spec.description,
        icon: spec.icon,
      }],
    })

    // ── The takeover definition: this plugin's tree in the PRODUCT's 文件 tab ──
    // `kind: 'files'` at the `extension` band outranks the product's `builtin`
    // registration, and the registry's own contract says what that means: the
    // extension is the one in force for claims, `get`, the chooser page, and the
    // body and title the seat dispatches — and the builtin resumes when this
    // unregisters. So this one definition is the whole mechanism by which the
    // column ends up with a single file tree.
    //
    // Two details are deliberate:
    //   · the body registers under THIS `id` (the seat looks a body up by the id
    //     of the type in force, never by the kind), so the key below is
    //     FROG_FILES_ID and not 'files';
    //   · the guide entry reuses the product's own entry `id` ("workspace"), its
    //     `order` (10) and its `commandId` ("workspace.files"), so the ⌘/Ctrl+P
    //     shortcut keeps opening this tab and the rest of the chooser does not
    //     shift around it.
    const systemFilesDefinition = () => ({
      id: FROG_FILES_ID,
      kind: SYSTEM_FILES_KIND,
      priority: 'extension',
      title: () => SYSTEM_FILES_TITLE,
      guide: [{
        id: 'workspace',
        order: 10,
        commandId: 'workspace.files',
        title: () => SYSTEM_FILES_TITLE,
        description: () => '本插件的文件树放在系统「文件」这个位置：@引用到输入框、右键菜单、新建/删除、按目录刷新与 A/M 改动字母。系统的实时目录监听随它自己的页面一起停用，改由本插件在产物变化时刷新相应目录；另一个编辑器改动的文件，需要手动刷新一次。想两棵树都在，把「显示系统的文件树」打开。',
        icon: GuideArtworkFiles,
      }],
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
      const chosen = settingsStore.get()
      if (!chosen.nativeFileTree) return false
      // Which file tree the column gets, decided ONCE here and recorded for the
      // footer, the tab menu and the default page to agree with (see
      // `frogTreeKind`). Both settings are read at this one point on purpose: the
      // pair is what the registration below is built from.
      const takeover = !chosen.systemFileTree
      frogTreeKind = takeover ? SYSTEM_FILES_KIND : FROG_FILES_KIND
      // In takeover mode the tree's own kind is not registered at all — that is
      // what removes the SECOND tree, and the whole point of the setting.
      const specs = FROG_TABS.filter((spec) => !(takeover && spec.kind === FROG_FILES_KIND))
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
        if (takeover) dropTypes.push(bindLifecycle(() => tabs.register(systemFilesDefinition())))
        for (const spec of specs) dropTypes.push(bindLifecycle(() => tabs.register(frogTabDefinition(spec))))
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
          if (takeover) {
            // The tree, under the id of the type in force for kind `files` — the
            // seat dispatches by THAT, not by the kind …
            yield slots.register({ name: 'sidebar.right.pane.tab', key: FROG_FILES_ID }, renderView('tree'))
            // … and under the RETIRED kind as well. A session whose saved layout
            // holds a 文件树 tab opened before this setting was switched finds no
            // definition for `frog-files` (nothing registers that kind in this
            // mode), and the seat then dispatches by the bare `tab.kind`. Without
            // this registration that tab renders the seat's "nothing can view
            // this" notice — a restored tab must never come back blank.
            yield slots.register({ name: 'sidebar.right.pane.tab', key: FROG_FILES_KIND }, renderView('tree'))
          }
          for (const spec of specs) {
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

    // ── @引用 on the PRODUCT's own document preview ────────────────────────
    // The reference half of this plugin is not a tree feature and never was: it
    // writes `@path` through the shell's own composer API (quoteToComposer in
    // src/client/core.js, which calls `conversation.input.for(...).setDraft`).
    // Nothing about it needed this tree — the tree was only ever where the
    // BUTTON happened to live.
    //
    // 0.1.7 gives that button a first-class home: `sidebar.right.tab.document.actions`
    // is a LIST seat the product's own document preview renders in its header
    // ("Header toolbar contributions acting on the previewed file", declared by
    // ui-sidebar-documentpreview as a child of the text preview), handing each
    // occupant `{ absolutePath }`. So the flow the user actually wants —
    // click a file in the SYSTEM tree, reference it — now works on the product's
    // tree, its preview, and its document tabs alike, without a single DOM probe.
    //
    // Degrading safely is the whole reason this is a separate registration. The
    // seat does not exist before 0.1.7, and `slots.inject` does not throw for a
    // key that is never declared: it parks the callback until a declaration
    // appears and disposes it when one collapses ("Install an effect for each
    // declaration lifetime of a slot"). On an older shell the wait simply never
    // resolves, so this contributes nothing and costs nothing.
    //
    // The path is made WORKSPACE-RELATIVE before it becomes a reference — that is
    // what the composer's grammar resolves, and what every other caller in this
    // plugin passes (the tree's rows, the popout bridge). An absolute path is only
    // kept when it cannot be expressed under the session's root, so a reference is
    // never silently wrong; the composer's own help still accepts it.
    // READ THE SEAT'S OWN CONTRACT, NOT A GUESS: this seat's owner props are
    // `{ absolutePath }` and NOTHING else, so a `props.sessionId` here would be
    // `undefined` on every render — which silently made `referenceFor` skip the
    // rebase and emit an ABSOLUTE path into the composer. The seat is
    // `scope: 'session'`, and the preview belongs to the session the column is
    // showing, so the shell's own current-session reader is the right fallback.
    const referenceFor = (absolutePath, sessionId) => {
      const raw = String(absolutePath == null ? '' : absolutePath).replace(/\\/g, '/')
      if (!raw) return ''
      const owner = sessionId || currentSessionId()
      const root = (owner ? sessionCwd(owner) : '').replace(/\\/g, '/').replace(/\/+$/, '')
      if (root && raw.indexOf(root + '/') === 0) return raw.slice(root.length + 1)
      return raw
    }

    // One small button, in the product's own toolbar idiom: icon + label, so it
    // reads the same as the reload / wrap controls it stands beside.
    const DocumentReferenceAction = (props) => {
      const path = referenceFor(props && props.absolutePath, props && props.sessionId)
      if (!path) return null
      return React.createElement('button', {
        type: 'button',
        className: 'artifacts-doc-action',
        'data-frog-doc-action': 'reference',
        'data-frog-doc-path': path,
        title: '把 @' + path + ' 引用到输入框',
        'aria-label': '引用到输入框',
        onClick: () => {
          if (quoteToComposer(path)) noticeStore.flash('已插入 @' + basename(path))
          else copyToClipboard('@' + path, '已复制 @引用')
        },
      },
        React.createElement('span', { className: 'artifacts-doc-action-label' }, '@引用'),
      )
    }

    const installDocumentActions = (slots) => {
      try {
        slots.inject('sidebar.right.tab.document.actions', () => slots.register({
          name: 'sidebar.right.tab.document.actions',
          id: 'dsh-sidebar-frog-doc-reference',
          order: 40,
          label: '@引用到输入框',
        }, DocumentReferenceAction))
        return true
      } catch (e) { return false }
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
        // `frogTreeKind`, not a constant: the kind this tree is registered under
        // is whichever one the surface decision picked (see `frogTreeKind`), and
        // opening anything else would ask the column for a page nothing draws.
        sidebar.openTab(frogTreeKind)
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
      // Gated by the panel-surface switch and 「加载时展开」only. NOT by the floating
      // panel's 「文件树」 preference: that one governs the OVERLAY's band, while
      // the column's 文件树 tab is drawn regardless of it (a native 文件树 tab must
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
    //
    // TWO kinds of tab get an item here, and the second one is why this component
    // grew:
    //   · this plugin's own views — the page itself (在新标签页弹出);
    //   · any RESOURCE tab whose address names a file (在弹出页打开 <name>). That
    //     is the single route that works for a document this plugin does not draw
    //     at all — the product renders .html, images, Office, PDF and anything
    //     else by itself, so no body of ours runs and no button of ours can be on
    //     screen. It is also what replaced the one-line bar that used to sit above
    //     every document tab: the row above that body is the product's own header
    //     (path, renderer picker, reload) and has no extension point, so a bar of
    //     ours could only ever be a second, near-empty row — while this item rides
    //     the tab strip, which is the row above the whole document.
    const PopoutMenuItem = (props) => {
      const tab = props && props.tab
      const dismiss = props && props.dismiss
      if (!tab) return null
      // Our own views — plus the product's `files` kind when THIS PLUGIN is the
      // one drawing it. In takeover mode that tab is ours, so it gets our menu
      // item; while the product draws it, it must not: a foreign tab must not
      // grow a button that opens this plugin's page.
      if (FROG_TAB_KINDS.has(tab.kind) || tab.kind === frogTreeKind) {
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
      const path = pathFromFileAddress(tab.contentId || tab.address || '')
      if (!path) return null
      const sessionId = sessionFromFileAddress(tab.contentId || tab.address || '') || currentSessionId()
      return React.createElement('a', {
        className: 'artifacts-menuitem',
        href: popoutFileHrefFor(sessionId, path),
        target: POPOUT_TARGET,
        rel: 'noreferrer noopener',
        role: 'menuitem',
        'data-frog-popout': 'file',
        'data-frog-doc-path': path,
        title: '在弹出页打开「' + basename(path) + '」（独立标签页，与侧边栏实时同步）',
        onClick: () => { if (typeof dismiss === 'function') dismiss() },
      },
        PopoutIcon(14),
        React.createElement('span', { className: 'artifacts-menuitem-label' }, '在弹出页打开 ' + basename(path)),
      )
    }
