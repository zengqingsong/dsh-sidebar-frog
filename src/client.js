/**
 * 可弹出式侧边栏 · dsh-sidebar-frog — Client body
 *
 * Assembled by `scripts/build.js` into `src/client.js` (the static browser
 * bundle served at `/plugins/dsh-sidebar-frog/client.js` and registered
 * through `window.__ModuleLoader__`).
 *
 * The placeholder tokens in this skeleton are replaced at build time by:
 *   bridge     → src/shared/bridge.js     (cross-window keys + payload codecs)
 *   settings   → src/shared/settings.js   (the settings shape, shared with the popout)
 *   format     → src/shared/format.js     (relative time, shared with the popout)
 *   ext        → src/shared/ext.js
 *   filetype   → src/shared/filetype.js   (file-tree icon classifier + brand artwork, shared with the popout page)
 *   highlight  → src/shared/highlight.js
 *   markdown   → src/shared/markdown.js
 *   editor     → src/shared/editor.js     (the CodeMirror mount, shared with the popout page)
 *   core       → src/client/core.js       (state/store/settings helpers)
 *   styles     → src/client/styles.js     (the injected CSS)
 *   icons      → src/client/icons.js      (inline SVG icons)
 *   preview    → src/client/preview.js    (renderDiff/renderPreview/CodeView)
 *   filetree   → src/client/filetree.js   (IDE-style FileTree explorer)
 *   editorui   → src/client/editor.js     (the 编辑 pane: toolbar, drafts, conflicts)
 *   components → src/client/components.js (ArtifactsContent/ArtifactsPanel/CornerButton/settings)
 *   native     → src/client/native.js     (registration into the shell's own right sidebar)
 *   docpreview → src/client/docpreview.js (the renderer lent to the shell's document preview)
 *   usage      → src/client/usage.js      (用量/上下文, read from the shell's own projections)
 *   git        → src/client/git.js        (Git 只读切片: 分支 / ahead-behind / 改动 / 与 HEAD 的差异)
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-frog',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // Closure symbols — the same names the dynamic runner injects.
    const React = require('react')

    // The file tree's right-click menu is portaled to <body>: `position: fixed`
    // inside the panel is measured from the panel, not the viewport (the panel
    // sets container-type, i.e. layout containment), so a menu left inside it is
    // placed against the wrong origin. Optional — the dynamic runner does not
    // inject react-dom, and the tree then renders the menu in place.
    let ReactDOM = null
    try { ReactDOM = require('react-dom') } catch (e) { ReactDOM = null }

    // DSH's built-in Shiki syntax highlighter. Optional: gracefully degrades to
    // a plain code view when unavailable (e.g. under the dynamic runner, which
    // does not inject this module).
    let primitives = null
    try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (e) { primitives = null }

    const styles = {
      insert(css) {
        if (typeof document === 'undefined') return
        const id = 'dsh-sidebar-frog-styles'
        const existing = document.getElementById(id)
        if (existing) {
          // A hot-swapped bundle must be able to REPLACE its stylesheet, not be
          // skipped by it. The shell removes `<style data-plugin="<id>">` before
          // re-applying a rebuilt plugin (dsh-client-hmr's removeOwnedStyles); a
          // tag it did not remove — an older build's, written before this
          // attribute existed — would otherwise pin the panel to the previous
          // CSS for the life of the page, which is how a CSS change appeared to
          // need a full restart.
          existing.textContent = css
          return
        }
        const el = document.createElement('style')
        el.id = id
        // The attribute that removal looks for. Without it this plugin's own
        // stylesheet is orphaned on every hot swap.
        el.setAttribute('data-plugin', 'dsh-sidebar-frog')
        el.textContent = css
        document.head.appendChild(el)
      },
    }

    // Every data route sits behind the same Host/Origin fence and browser-cookie
    // authentication DSH applies to /api, so a missing or expired browser session
    // answers 401/403 with a plain-text body. Without this, `r.json()` would blow
    // up on that body and the panel would show a JSON parse error instead of
    // something the user can act on.
    const UNAUTHORIZED = '未通过会话认证（401）：请刷新页面重新登录后再试'
    const fetchJson = (url, init) => fetch(url, init).then((r) => {
      if (r.status === 401 || r.status === 403) throw new Error(UNAUTHORIZED)
      return r.json()
    })

    const host = {
      call(method, args) {
        if (method === 'artifacts.list') {
          return fetchJson('/dsh-sidebar-frog/data')
        }
        if (method === 'artifacts.read') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetchJson('/dsh-sidebar-frog/content?path=' + encodeURIComponent(path))
        }
        if (method === 'artifacts.remove') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          return fetchJson('/dsh-sidebar-frog/remove?path=' + encodeURIComponent(path), { method: 'POST' })
        }
        if (method === 'artifacts.delete') {
          // DELETE from disk (the file tree's 删除), a body for the same reason as
          // 撤销/保存: a mutation travels in a body, not a URL that lands in logs.
          // The host fences the path to the session workspace and answers a reason
          // on refusal, which the tree shows to the user.
          const body = JSON.stringify({
            path: args && typeof args.path === 'string' ? args.path : '',
            sessionId: args && typeof args.sessionId === 'string' ? args.sessionId : '',
          })
          return fetchJson('/dsh-sidebar-frog/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
          })
        }
        if (method === 'artifacts.create') {
          // 新建: one empty file or one folder inside a directory of the
          // workspace. The body carries a PARENT + a NAME rather than a path —
          // the host validates the name, joins it and fences the result to the
          // session workspace, and answers a reason the tree shows next to the
          // input when it refuses (an existing entry, a name Windows will not
          // take, a directory outside the workspace).
          const body = JSON.stringify({
            parent: args && typeof args.parent === 'string' ? args.parent : '',
            name: args && typeof args.name === 'string' ? args.name : '',
            kind: args && args.kind === 'dir' ? 'dir' : 'file',
            sessionId: args && typeof args.sessionId === 'string' ? args.sessionId : '',
          })
          return fetchJson('/dsh-sidebar-frog/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
          })
        }
        if (method === 'artifacts.revert') {
          // The one mutating call that carries a body: {path, opId}. A refusal
          // ("file moved on", "no snapshot") comes back as JSON with ok:false and
          // a reason, so it is shown to the user rather than thrown away.
          const body = JSON.stringify({
            path: args && typeof args.path === 'string' ? args.path : '',
            opId: args && typeof args.opId === 'string' ? args.opId : '',
          })
          return fetchJson('/dsh-sidebar-frog/revert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
          })
        }
        if (method === 'artifacts.save') {
          // 保存: the other mutating call that carries a body, and the only one
          // whose body holds file text. `baseVersion`/`baseSize` describe the
          // revision the editor was opened on; the host turns them into a
          // refusal (with a reason) rather than letting a save overwrite a change
          // nobody looked at. `force` is the explicit 「仍然保存」 the conflict bar
          // offers — the write stays atomic and version-guarded either way.
          const body = JSON.stringify({
            path: args && typeof args.path === 'string' ? args.path : '',
            content: args && typeof args.content === 'string' ? args.content : '',
            sessionId: args && typeof args.sessionId === 'string' ? args.sessionId : '',
            baseVersion: args && typeof args.baseVersion === 'string' ? args.baseVersion : undefined,
            baseSize: args && typeof args.baseSize === 'number' ? args.baseSize : undefined,
            force: !!(args && args.force),
          })
          return fetchJson('/dsh-sidebar-frog/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
          })
        }
        if (method === 'artifacts.listDir') {
          const path = args && typeof args.path === 'string' ? args.path : ''
          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          return fetchJson('/dsh-sidebar-frog/listdir?path=' + encodeURIComponent(path) + '&sessionId=' + encodeURIComponent(sessionId))
        }
        if (method === 'artifacts.search') {
          const q = args && typeof args.q === 'string' ? args.q : ''
          const sessionId = args && typeof args.sessionId === 'string' ? args.sessionId : ''
          const limit = args && args.limit ? String(args.limit) : ''
          // Rejects for an older host (404 — the route did not exist yet) and for
          // an unauthenticated one (401); the tree falls back either way to
          // filtering the levels it already has loaded.
          return fetchJson('/dsh-sidebar-frog/search?q=' + encodeURIComponent(q) + '&sessionId=' + encodeURIComponent(sessionId) + (limit ? '&limit=' + encodeURIComponent(limit) : ''))
        }
        return Promise.reject(new Error('dsh-sidebar-frog: unknown host method ' + method))
      },
    }

    // Canonical plugin body — extract this `return { ... }` for cordis_define.
    const plugin = (() => {
      return {
        inject: ['timer', 'sidebarRightTabs'],
        apply(ctx) {
          const slots = ctx.get('slots')
          if (slots === undefined) return

          // Which build this browser half is. The host prints the same digest at
          // startup and the popout page carries it as a <meta>; settings shows
          // this one, so a half-restarted process is visible instead of looking
          // like an unrelated UI bug.
          const BUILD = 'f15f5ace'

              // Cross-window bridge between the two halves of the plugin.
    //
    // The in-app sidebar and the popout tab are two documents on the same origin,
    // so they share localStorage and can talk through "storage" events (which fire
    // in every *other* document of the origin, never in the writer itself). Every
    // cross-window key and payload shape lives in this one file, so the two halves
    // cannot drift on a key name or a field: a mismatched key would otherwise fail
    // silently — no error anywhere, just a feature that never works.
    //
    // Portable JS (var/function, no template literals, no closing script tag) so
    // this file can be inlined verbatim into the host Node scope, the client bundle,
    // and the standalone page's String.raw inline script.
    var BRIDGE = {
      session: 'dsh-sidebar-frog:session',           // main → popout: active session id
      settings: 'dsh-sidebar-frog:settings',         // shared: feature settings (src/shared/settings.js)
      previewWidth: 'dsh-sidebar-frog:previewWidth', // shared: divider position in px after a drag
      quote: 'dsh-sidebar-frog:quote',               // popout → main: "insert this @path"
      ack: 'dsh-sidebar-frog:quote-ack',             // main → popout: "it landed / it did not"
    };

    // A quote request is only acted on while it is fresh. localStorage outlives the
    // tab that wrote it, so a payload left behind by an earlier popout would
    // otherwise pop text into the composer the next time this window loads.
    var BRIDGE_QUOTE_TTL_MS = 10000;
    // How long the popout waits for an ack before assuming nobody is listening and
    // falling back to the clipboard. The main window answers synchronously in its
    // storage handler, so this only has to cover a busy main thread.
    var BRIDGE_ACK_TIMEOUT_MS = 700;

    // Unique per request: writing the *same* string twice fires no storage event,
    // so quoting the same file twice in a row would be dropped without a nonce.
    function bridgeNonce() {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function bridgeParse(raw) {
      if (typeof raw !== 'string' || !raw) return null;
      try {
        var data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
      } catch (e) {
        return null;
      }
    }

    function bridgeEncodeQuote(path, nonce, ts) {
      return JSON.stringify({
        v: 1,
        path: String(path == null ? '' : path),
        nonce: String(nonce == null ? '' : nonce),
        ts: Number(ts) || 0,
      });
    }

    // Returns null (never throws) for anything that is not a well-formed request:
    // the receiving window is a running app, so a hand-edited localStorage entry
    // must not be able to break it.
    function bridgeDecodeQuote(raw) {
      var data = bridgeParse(raw);
      if (!data || data.v !== 1) return null;
      if (typeof data.path !== 'string' || !data.path) return null;
      if (typeof data.nonce !== 'string' || !data.nonce) return null;
      if (typeof data.ts !== 'number' || !isFinite(data.ts)) return null;
      return { path: data.path, nonce: data.nonce, ts: data.ts };
    }

    function bridgeEncodeAck(nonce, ok) {
      return JSON.stringify({ v: 1, nonce: String(nonce == null ? '' : nonce), ok: !!ok });
    }

    function bridgeDecodeAck(raw) {
      var data = bridgeParse(raw);
      if (!data || data.v !== 1) return null;
      if (typeof data.nonce !== 'string' || !data.nonce) return null;
      return { nonce: data.nonce, ok: data.ok === true };
    }

    function bridgeQuoteIsFresh(quote, now, ttl) {
      if (!quote || typeof quote.ts !== 'number') return false;
      var budget = typeof ttl === 'number' ? ttl : BRIDGE_QUOTE_TTL_MS;
      var at = typeof now === 'number' ? now : Date.now();
      return Math.abs(at - quote.ts) <= budget;
    }

    // The divider position is a plain integer number of pixels; anything else in
    // storage (a percentage from an older build, a hand-edited value) is ignored.
    function bridgeParseWidth(raw) {
      if (raw == null || raw === '') return null;
      var n = parseInt(raw, 10);
      return isFinite(n) && n > 0 ? n : null;
    }

              // Feature settings — the single definition of the settings shape.
    //
    // The sidebar owns the settings UI (settings.section) and writes this entry;
    // the popout tab reads the *same* localStorage entry so the two halves behave
    // the same way (polling, the 文件树 tab, the default divider position). Keeping
    // defaults and clamping here means a value can never be validated one way when
    // it is written and interpreted another way when it is read.
    //
    // Portable JS (var/function, no template literals, no closing script tag); the
    // storage key itself lives in src/shared/bridge.js.
    var DEFAULT_SETTINGS = {
      autoRefresh: true,   // poll the artifact list while the panel is open
      defaultPanelWidth: 26, // panel width on load / before any drag, as % of window width
      minPanelWidth: 20,   // minimum panel width as % of window width
      showFileTree: true,  // show the 文件树 (file tree) tab
      defaultOpen: true,   // expand the sidebar by default on load
      previewHeight: 80,   // popout: default preview width as % of the split area (its ceiling — see below)
      // Which surface the panel takes. On: every view registers as a tab TYPE of the
      // shell's own right column, so 展开 / 收起 / 全屏 / 拖宽 / 分栏 and the tab strip
      // are the shell's. Off: the panel falls back to its own floating window.
      //
      // Read once at load (see src/client/native.js), together with systemFileTree
      // below: the pair decides which KINDS the column gets, and swapping kinds under
      // a live column means tearing one registration down while building another.
      nativeFileTree: true,
      // Whether the column shows the PRODUCT's own file tree as well as this
      // plugin's. Off (the default) means exactly ONE file tree: this plugin's, in
      // the 文件 tab users already know, because the two trees side by side said the
      // same thing twice and only one of them has @引用 / 右键菜单 / 新建删除.
      //
      // "Hiding a tab" is not something the product offers — there is no unregister,
      // no filter and no "hidden" flag on a tab record. The one lever is the
      // registry's documented band rule: a kind may carry one builtin and one
      // extension, the extension is the one in force, and the builtin resumes when it
      // unregisters. So this setting registers an extension over the product's files
      // kind, which is what takes its entry off the chooser and its body off screen.
      //
      // The product's files type is a pure PAGE type (no patterns, no canOpen, no
      // resource addresses — checked against the installed package), so shadowing it
      // takes nothing else with it: opening a file from the conversation still routes
      // exactly as before.
      //
      // The real cost is that the product's live per-directory watcher lives INSIDE
      // its body, so a takeover stops it. This plugin's tree therefore refreshes the
      // directories its own data says changed (see the artifact-path effect in
      // src/client/filetree.js), which covers the agent's edits; a file changed by
      // another editor arrives on the next manual refresh instead of instantly.
      // Switching this ON hands the watcher back and puts both trees on the strip.
      // Read once at load; requires a page refresh (see src/client/native.js).
      //
      // NOTE: no backticks anywhere in this file. It is spliced into the popout
      // page's String.raw template, so one backtick ends the literal and takes the
      // whole embedded script with it (scripts/check.js fails on it by name).
      systemFileTree: false,
      // Lend this plugin's Markdown renderer (offline MathJax / Mermaid / JSXGraph)
      // to the SHELL's own document preview: registered in the "extension" band it
      // wins over the product's built-in Markdown over there, so the same .md file
      // gains math and diagrams in the official right sidebar too. Off hands .md
      // back to the built-in renderer (its wider chrome returns with it).
      // See src/client/docpreview.js.
      nativeMarkdown: true,
      // Lend the TABLE renderer (CSV / TSV: sticky header, click-to-sort, row and
      // column counts) to the same registry. 0.1.7 gave the product its own Excel
      // renderer claiming csv/tsv too, but the extension band outranks builtin, so
      // this still wins and a spreadsheet keeps its sortable table in the official
      // sidebar. Off hands them to the product's own sheet view (on 0.1.6, which had
      // no such claim, to its plain-text view).
      // See src/client/docpreview.js.
      nativeTable: true,
      // Lend the OFFICE readers (docx / xlsx / pptx, all offline and vendored) to
      // the same registry, which delivers the file's COMPLETE BYTES to them
      // (loading: 'bytes-complete'). The product claims NONE of these as paginated
      // documents: 0.1.7 routed xls/xlsx out to its new Excel renderer and left its
      // office reader on doc/docx/ppt/pptx, and nothing claims pptx as slides — so
      // the extension band wins where they overlap and pptx is ours alone. Off hands
      // them to the product's coverage, which for pptx is the shell's "no way to view
      // this content" notice. The panel and the popout tab render Office files either
      // way: this switch is about the SHELL's sidebar, not about this plugin's own
      // previews.
      // See src/client/docpreview.js and src/shared/office.js.
      nativeOffice: true,
      // Which DOCUMENT SKIN rendered Markdown wears: the shipped look, or one of the
      // platform typographies in src/shared/skins.js (GitHub, 微信, 知乎). Typography
      // and layout only — colors come from the theme, so a skin is right in light and
      // dark alike. Applied to the panel, the shell's own document tab and the popout
      // page from this one value; see markdownSkinClass.
      markdownSkin: 'default',
      // Show each block's SOURCE line in a gutter down the left edge of a rendered
      // document — the answer to "which line is this?" without leaving the reader.
      // The numbers come from the anchors the renderer already stamps on every block
      // (data-lineno, see mdAnchor in src/shared/markdown.js), so they are the file's
      // real line numbers and not a count of drawn rows.
      //
      // Off by default: it is chrome added around a document, and a reader who wants
      // the text alone should get the text alone. The EDITOR's gutter is a separate
      // switch (editorLineNumbers) so the two can be had independently — which is the
      // point of asking for two settings instead of one.
      previewLineNumbers: false,
      // CodeMirror's own line-number column, in the panel's editor and the popout
      // page's alike (both mount the same controller — src/shared/editor.js).
      // On by default: it is the editor's own convention, and switching it off buys
      // the width back on a narrow panel.
      editorLineNumbers: true,
    };

    var SETTINGS_RANGES = {
      // The default width is allowed past the floor's own ceiling: it is what the
      // panel opens with, and a wide panel is still legitimate on a big screen.
      defaultPanelWidth: [20, 85],
      minPanelWidth: [20, 60],
      previewHeight: [20, 80],
    };

    // Settings whose value is one of a fixed set of names rather than a number.
    // EVERY string-valued setting must be listed here WITH its fallback among the
    // allowed names, or it can never be changed at all:
    // clampSetting reads a setting through parseInt, so a name like "github"
    // arrives as NaN and comes back out as the DEFAULT — which is exactly how the
    // Markdown skin picker shipped unselectable (the choice was stored, read back as
    // the default, and the control snapped back under the user's pointer).
    //
    // The list is a literal on purpose, not a reference to MD_SKIN_ORDER in
    // src/shared/skins.js: this module is evaluated BEFORE the skins module in both
    // bundles (the popout page reads its settings at the top of its script), so a
    // cross-reference would read an uninitialized var. The two are held together by
    // a guard in scripts/check.js instead — a copy that can be checked beats a
    // coupling that cannot be loaded.
    var SETTINGS_CHOICES = {
      markdownSkin: ['default', 'github', 'wechat', 'zhihu'],
    };

    function clampSetting(key, value) {
      var fallback = DEFAULT_SETTINGS[key];
      var range = SETTINGS_RANGES[key];
      var n = typeof value === 'number' ? value : parseInt(value, 10);
      if (typeof n !== 'number' || !isFinite(n)) return fallback;
      if (!range) return n;
      return Math.max(range[0], Math.min(range[1], n));
    }

    // One of a fixed set of names: an unknown or missing name is the default, so a
    // hand-edited localStorage entry degrades to a usable value instead of leaving a
    // setting nothing can interpret.
    function choiceSetting(key, value) {
      var allowed = SETTINGS_CHOICES[key] || [];
      var text = typeof value === 'string' ? value : '';
      return allowed.indexOf(text) >= 0 ? text : DEFAULT_SETTINGS[key];
    }

    // Fills in defaults, drops unknown keys, and normalizes every value by its own
    // kind — booleans coerced, numbers clamped, names checked against their list.
    // Applied on both sides of every read and write, so a malformed entry (partial
    // JSON, a string where a number belongs, 5000%) degrades to a usable object
    // instead of propagating.
    function normalizeSettings(raw) {
      var out = {};
      Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
        var fallback = DEFAULT_SETTINGS[key];
        var value = raw && Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : fallback;
        if (typeof fallback === 'boolean') out[key] = !!value;
        else if (typeof fallback === 'string') out[key] = choiceSetting(key, value);
        else out[key] = clampSetting(key, value);
      });
      return out;
    }

    function parseSettings(text) {
      if (typeof text === 'string' && text) {
        try {
          return normalizeSettings(JSON.parse(text));
        } catch (e) {
          // Corrupt entry (hand-edited, half-written): fall through to defaults.
        }
      }
      return normalizeSettings(null);
    }

    function serializeSettings(data) {
      return JSON.stringify(normalizeSettings(data));
    }

    // ── Panel width policy ─────────────────────────────────────────────────────
    // What width the sidebar panel takes: a drag from this session if there is one,
    // otherwise「默认面板宽度」, either way floored by「最短面板宽度」and by enough room
    // for its content to stay usable.
    //
    // This lives here, as pure functions, instead of inline in the component for one
    // reason: the panel's opening width is the first thing a user sees, and a
    // regression to "opens at the minimum again" is invisible in every other check
    // (the panel still renders, the tree still works). scripts/check.js drives these
    // directly.
    //
    // paneFloorPx is the width below which the panel's content is no longer usable.
    // The panel holds ONE pane (the artifact list / file tree — the preview lives in
    // the popout tab), so the caller passes the list floor; it owns that number
    // because it also clamps the edge drag, so it is passed in rather than
    // duplicated here.

    function toPx(value) {
      var n = typeof value === 'number' ? value : parseInt(value, 10);
      return typeof n === 'number' && isFinite(n) ? n : 0;
    }

    // The hard floor: never below 80px, never below the configured minimum, and
    // never below the pane floor — which is itself capped at 45% of the window so
    // the conversation column always keeps a reasonable share.
    function panelMinWidthPx(windowWidth, settings, paneFloorPx) {
      var win = toPx(windowWidth);
      var min = clampSetting('minPanelWidth', settings && settings.minPanelWidth);
      return Math.max(
        80,
        Math.round(win * min / 100),
        Math.min(toPx(paneFloorPx), Math.round(win * 0.45))
      );
    }

    // What the panel opens with (and returns to on reload, since a drag is not
    // persisted): the configured default width, but never under the floor.
    function panelDefaultWidthPx(windowWidth, settings, paneFloorPx) {
      var win = toPx(windowWidth);
      var want = Math.round(win * clampSetting('defaultPanelWidth', settings && settings.defaultPanelWidth) / 100);
      return Math.max(panelMinWidthPx(win, settings, paneFloorPx), want);
    }

    // The live width: dragPx is a drag from this session (null = none yet).
    function panelWidthPx(windowWidth, settings, dragPx, paneFloorPx) {
      var drag = dragPx == null ? 0 : toPx(dragPx);
      if (drag <= 0) return panelDefaultWidthPx(windowWidth, settings, paneFloorPx);
      return Math.max(drag, panelMinWidthPx(windowWidth, settings, paneFloorPx));
    }

              // Small formatting helpers shared by both halves of the plugin.
    //
    // The artifact list is a live ledger, so "when" is half the information — and
    // the two halves must say it the same way. Written once here, the sidebar row,
    // the popout row and the tooltips can never disagree.
    //
    // Portable JS (var/function, no template literals, no closing script tag) so
    // this file can be inlined verbatim into the host Node scope, the client bundle,
    // and the standalone page's String.raw inline script.
    function relativeTime(ts, now) {
      var at = Number(ts);
      if (!isFinite(at) || at <= 0) return '';
      var ref = typeof now === 'number' ? now : Date.now();
      var seconds = Math.floor((ref - at) / 1000);
      // A clock skew between the host and the browser must not read as "in 3 hours".
      if (seconds < 0) seconds = 0;
      if (seconds < 60) return '刚刚';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
      return Math.floor(seconds / 86400) + 'd';
    }

              // ── Workspace path comparison (工作区路径) ───────────────────────────────────
    //
    // Both file trees — the sidebar's React explorer and the standalone popout page
    // — cache levels and remember expansion against *absolute path strings* handed
    // out by the host, and compare those strings to decide what lives under what.
    // Getting the comparison wrong is silent: the tree still paints and a clicked
    // folder still opens, but the remembered expansion, the "reveal the previewed
    // file" walk and the relative-path labels quietly stop working.
    //
    // The host spellings the same directory two ways, which is what broke it:
    //   • a level's OWN path used to be echoed straight back from the request (so
    //     whatever the caller typed — a session cwd with forward slashes, a drive
    //     letter in lower case), while
    //   • every ENTRY path is a realpath (native separators, canonical case).
    // On Windows that is "D:/ws" against "D:\ws\src": not a prefix of one another as
    // plain strings, so every containment test failed and the tree forgot where it
    // was. The host now answers with the resolved spelling of the level it listed
    // (see listDir in src/host/core.js), and these helpers keep the comparison
    // honest for the spellings that can still differ.
    //
    // Comparisons are separator-insensitive and — for Windows-shaped paths only,
    // where case genuinely is not significant — case-insensitive. Slicing always
    // happens on the ORIGINAL string, so callers keep the host's own spelling.
    //
    // NOTE: no backticks and no dollar-brace anywhere in this file — it is inlined
    // into the popout's single String.raw literal (scripts/check.js enforces that).

    // "D:\x", "D:/x", "\\server\share" — spellings whose case is not significant.
    const PATH_WINDOWS = /^(?:[A-Za-z]:[\\/]|\\\\)/

    const pathIsWindows = (value) => PATH_WINDOWS.test(String(value == null ? '' : value))

    // The comparison form of a path: never returned to a caller, never sliced — it
    // exists only to be compared. Both spellings that have to match ("D:/ws" from a
    // session cwd, "D:\ws\src" from a realpath) differ in separator as well as in
    // case, so both are folded here. Case only matters on Windows-shaped paths,
    // where it is genuinely not significant; on POSIX it is a filename difference.
    const pathFold = (value) => {
      const text = String(value == null ? '' : value)
      return pathIsWindows(text) ? text.toLowerCase().replace(/[\\/]+/g, '/') : text
    }

    // Trailing separators are noise — except on a bare drive root, where "D:\" and
    // "D:" are not the same place.
    const pathTrim = (value) => {
      const text = String(value == null ? '' : value)
      if (text.length <= 1) return text
      if (/^[A-Za-z]:[\\/]$/.test(text)) return text
      return text.replace(/[\\/]+$/, '')
    }

    // Is "candidate" the same place as, or somewhere inside, "prefix"?
    const pathUnder = (candidate, prefix) => {
      const base = pathTrim(prefix)
      if (!base) return false
      const c = pathFold(pathTrim(candidate))
      const p = pathFold(base)
      if (c === p) return true
      return c.indexOf(p + '/') === 0 || c.indexOf(p + '\\') === 0
    }

    // The part of "full" below "root" ("" when they are the same place). Falls back
    // to the whole path when it is not inside the root, which is what a label wants.
    const pathRelativeTo = (full, root) => {
      const base = pathTrim(root)
      const text = String(full == null ? '' : full)
      if (!base || !pathUnder(text, base)) return text
      if (pathFold(pathTrim(text)) === pathFold(base)) return ''
      return text.slice(base.length + 1)
    }

    // Every intermediate directory between "root" and "full", outermost first,
    // spelled with the separators "full" actually uses. This is the walk that
    // expands a previewed file's ancestors; a top-level entry yields none.
    const pathAncestorsOf = (full, root) => {
      const base = pathTrim(root)
      const text = String(full == null ? '' : full)
      if (!base || !pathUnder(text, base)) return []
      const parts = text.slice(base.length).split(/[\\/]+/).filter(Boolean)
      const dirs = []
      let acc = text.slice(0, base.length)
      for (let i = 0; i < parts.length - 1; i += 1) {
        acc = acc + (text.charAt(acc.length) || '/') + parts[i]
        dirs.push(acc)
      }
      return dirs
    }

              // Line-level diff shared by the sidebar panel and the standalone popout page.
    //
    // Why a hand-written diff: the ledger already carries the full "before" and
    // "after" text of every agent write/edit (the host reads it off the live tool
    // result, see src/host/core.js), and both halves of the plugin render it — a
    // small, dependency-free LCS keeps that text out of two duplicated renderers
    // and keeps the bundles free of a diff library.
    //
    // Portable JS on purpose (var/function, no template literals): this file is
    // inlined verbatim into the host bundle, the client bundle and the popout
    // page's inline script by scripts/build.js.
    //
    // Cost is bounded: the DP table is only built when lines(old) * lines(new)
    // stays under DIFF_CELL_MAX; otherwise the diff degrades to "strip the common
    // head and tail, replace the middle", which is what a huge rewrite looks like
    // anyway and never hangs the page.

    var DIFF_CELL_MAX = 400000;
    var DIFF_LINE_MAX = 4000;

    function splitDiffLines(text) {
      var s = String(text == null ? '' : text);
      if (s === '') return [];
      // The host hands over LF-normalized text (fs write outcomes are LF), so a
      // single split is enough here.
      var lines = s.split('\n');
      // A trailing newline means "ends with a newline", not "one more empty line".
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      return lines;
    }

    function diffCommonEdges(a, b) {
      var head = 0;
      var maxHead = Math.min(a.length, b.length);
      while (head < maxHead && a[head] === b[head]) head += 1;
      var tail = 0;
      var maxTail = Math.min(a.length, b.length) - head;
      while (tail < maxTail && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
      return { head: head, tail: tail };
    }

    // Longest common subsequence over lines, returned as index pairs.
    function diffLcsPairs(a, b) {
      var n = a.length;
      var m = b.length;
      var width = m + 1;
      var table = new Uint32Array((n + 1) * width);
      for (var i = n - 1; i >= 0; i -= 1) {
        for (var j = m - 1; j >= 0; j -= 1) {
          table[i * width + j] = a[i] === b[j]
            ? table[(i + 1) * width + (j + 1)] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
        }
      }
      var pairs = [];
      var x = 0;
      var y = 0;
      while (x < n && y < m) {
        if (a[x] === b[y]) { pairs.push([x, y]); x += 1; y += 1; continue; }
        if (table[(x + 1) * width + y] >= table[x * width + (y + 1)]) x += 1;
        else y += 1;
      }
      return pairs;
    }

    function diffRows(a, b, head, tail) {
      var rows = [];
      var i;
      for (i = 0; i < head; i += 1) rows.push({ t: 'ctx', text: a[i], oldNo: i + 1, newNo: i + 1 });
      var midA = a.slice(head, a.length - tail);
      var midB = b.slice(head, b.length - tail);
      var pairs = midA.length * midB.length <= DIFF_CELL_MAX ? diffLcsPairs(midA, midB) : null;
      var ai = 0;
      var bi = 0;
      for (var k = 0; pairs && k < pairs.length; k += 1) {
        var pa = pairs[k][0];
        var pb = pairs[k][1];
        while (ai < pa) { rows.push({ t: 'del', text: midA[ai], oldNo: head + ai + 1, newNo: null }); ai += 1; }
        while (bi < pb) { rows.push({ t: 'add', text: midB[bi], oldNo: null, newNo: head + bi + 1 }); bi += 1; }
        rows.push({ t: 'ctx', text: midA[ai], oldNo: head + ai + 1, newNo: head + bi + 1 });
        ai += 1;
        bi += 1;
      }
      while (ai < midA.length) { rows.push({ t: 'del', text: midA[ai], oldNo: head + ai + 1, newNo: null }); ai += 1; }
      while (bi < midB.length) { rows.push({ t: 'add', text: midB[bi], oldNo: null, newNo: head + bi + 1 }); bi += 1; }
      for (i = 0; i < tail; i += 1) {
        var oldIdx = a.length - tail + i;
        var newIdx = b.length - tail + i;
        rows.push({ t: 'ctx', text: a[oldIdx], oldNo: oldIdx + 1, newNo: newIdx + 1 });
      }
      return rows;
    }

    // One row per line: { t: 'ctx' | 'add' | 'del', text, oldNo, newNo }.
    // The result also carries a truncated flag: true when the inputs were too large
    // to diff exactly and the middle was collapsed into a delete-then-add block.
    function diffLines(before, after) {
      var a = splitDiffLines(before);
      var b = splitDiffLines(after);
      if (a.length > DIFF_LINE_MAX || b.length > DIFF_LINE_MAX) {
        return { rows: diffRows(a, b, 0, 0), truncated: true };
      }
      var edges = diffCommonEdges(a, b);
      var rows = diffRows(a, b, edges.head, edges.tail);
      return { rows: rows, truncated: a.length * b.length > DIFF_CELL_MAX && rows.length > 0 };
    }

    // Summary counts for a diff header ("+3 −1").
    function diffStats(rows) {
      var add = 0;
      var del = 0;
      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].t === 'add') add += 1;
        else if (rows[i].t === 'del') del += 1;
      }
      return { add: add, del: del };
    }

              // Shared extension → preview-type helpers (portable JS: var/function, no
    // template literals, so this file can be inlined verbatim into the host Node
    // scope, the client bundle, and the standalone page's String.raw inline script).
    var EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 };
    var EXT_PDF = { pdf: 1 };
    var EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 };
    var EXT_HTML = { html: 1, htm: 1, xhtml: 1 };
    // Explorer icon categories (see fileIconKind) — the colour of the icon is the
    // type signal, the way an IDE's file icons work.
    var EXT_MARKUP = { xml: 1, vue: 1, svelte: 1, astro: 1, hbs: 1, ejs: 1, pug: 1, razor: 1 };
    var EXT_STYLE = { css: 1, scss: 1, sass: 1, less: 1, styl: 1, pcss: 1 };
    var EXT_DATA = { json: 1, jsonc: 1, json5: 1, yaml: 1, yml: 1, toml: 1, ini: 1, cfg: 1, conf: 1, env: 1, csv: 1, tsv: 1, lock: 1, properties: 1 };
    var EXT_SHELL = { sh: 1, bash: 1, zsh: 1, fish: 1, ps1: 1, psm1: 1, bat: 1, cmd: 1 };
    var EXT_DOC = { doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, odt: 1, ods: 1, rtf: 1, epub: 1 };
    // The subset of EXT_DOC this plugin can actually READ offline (see
    // src/shared/office.js and the vendored docx-preview / SheetJS / pptx-renderer).
    // Split out deliberately: "document" means "a binary container nobody here can
    // draw" — it earns the card that says so plus the hand-off to an installed shell
    // renderer — while "office" means "we draw this ourselves". The rest of EXT_DOC
    // (.doc/.odt/.rtf/.epub) stays a card, because claiming a suffix without a
    // reader turns an honest refusal into a broken renderer.
    var EXT_OFFICE = { docx: 1, xlsx: 1, pptx: 1 };
    var EXT_CODE = {
      js: 1, mjs: 1, cjs: 1, jsx: 1, ts: 1, tsx: 1, mts: 1, cts: 1, py: 1, pyi: 1, rb: 1, go: 1, rs: 1,
      java: 1, kt: 1, kts: 1, c: 1, h: 1, cc: 1, cpp: 1, cxx: 1, hpp: 1, cs: 1, php: 1, swift: 1, m: 1,
      mm: 1, scala: 1, lua: 1, dart: 1, sql: 1, r: 1, jl: 1, ex: 1, exs: 1, erl: 1, hs: 1, clj: 1, groovy: 1,
    };
    var EXT_TEXT = { txt: 1, text: 1, log: 1, out: 1, list: 1, gitignore: 1, editorconfig: 1 };
    // Delimited text this plugin parses into a real table (src/shared/table.js).
    // The psv suffix is the pipe-separated convention the delimiter sniffer detects.
    var EXT_TABLE = { csv: 1, tsv: 1, psv: 1 };
    // Playable by the browser's own element, streamed from the host's /media route.
    // The extension only decides WHICH element to use; whether the codec actually
    // plays is the engine's call, and the view says so when it refuses.
    var EXT_AUDIO = { mp3: 1, wav: 1, ogg: 1, oga: 1, m4a: 1, aac: 1, flac: 1, opus: 1, weba: 1 };
    var EXT_VIDEO = { mp4: 1, m4v: 1, webm: 1, mov: 1, mkv: 1, ogv: 1 };

    function extType(path) {
      var ext = fileExt(path);
      // svg lands in the image band on purpose: an <img> never runs the scripts a
      // standalone SVG may carry, so this is the safe way to show one, and it is
      // also the reason there is no separate SVG renderer.
      if (EXT_IMAGE[ext]) return 'image';
      if (EXT_PDF[ext]) return 'pdf';
      if (EXT_MARKDOWN[ext]) return 'markdown';
      if (EXT_HTML[ext]) return 'html';
      if (EXT_TABLE[ext]) return 'table';
      if (EXT_AUDIO[ext]) return 'audio';
      if (EXT_VIDEO[ext]) return 'video';
      // An Office document this plugin reads itself, offline, with a vendored
      // parser. Checked BEFORE the binary container below: .docx is in both maps,
      // and this one is the more specific answer.
      if (EXT_OFFICE[ext]) return 'office';
      // A binary container (doc / odt / rtf / epub …). Naming it is what keeps it
      // away from the text path: decoding one of these as UTF-8 is exactly
      // the screen of mojibake this type exists to prevent.
      if (EXT_DOC[ext]) return 'document';
      return 'text';
    }

    function fileExt(path) {
      var m = /\.([^.]+)$/.exec(String(path || ''));
      return m ? m[1].toLowerCase() : '';
    }

    // Explorer icon category for a path. Shared by the sidebar tree and the
    // standalone page so both tint a file the same way.
    function fileIconKind(path) {
      var p = String(path || '');
      var ext = fileExt(p);
      if (EXT_IMAGE[ext]) return 'image';
      if (EXT_PDF[ext]) return 'pdf';
      if (EXT_MARKDOWN[ext]) return 'markdown';
      if (EXT_HTML[ext]) return 'markup';
      if (EXT_MARKUP[ext]) return 'markup';
      if (EXT_STYLE[ext]) return 'style';
      if (EXT_DATA[ext]) return 'data';
      if (EXT_AUDIO[ext] || EXT_VIDEO[ext]) return 'media';
      if (EXT_SHELL[ext]) return 'shell';
      if (EXT_DOC[ext]) return 'doc';
      if (EXT_CODE[ext]) return 'code';
      if (EXT_TEXT[ext]) return 'text';
      // Well-known extension-less files.
      var base = p.replace(/\\/g, '/').split('/').pop().toLowerCase();
      if (base === 'makefile' || base === 'dockerfile' || base === 'procfile' || base.indexOf('.env') === 0) return 'shell';
      if (base === 'license' || base === 'notice' || base === 'authors') return 'text';
      return 'text';
    }

              // The file tree's icon system, matching the one the Harness's own file tree
    // draws (client-ui-primitives 'FileTypeIcon' / 'CodeFileIcon').
    //
    // Portable JS on purpose: 'src/client' (React), 'src/host/page.js' (plain DOM)
    // and the shell all need the SAME answer to "what picture does this file get",
    // and the only way three renderers cannot drift is one shared classifier plus
    // one shared artwork table. See scripts/build.js for the injection points.
    //
    // Two tiers, exactly as the built-in tree:
    //
    //   * a CODE FILE gets its language's full-colour brand square (48 of them:
    //     .js → the JS logo, .rs → the Rust gear, package.json → the Node hexagon);
    //   * anything else gets a 28px "file card" glyph whose MARK names the kind
    //     (MD / PDF / a spreadsheet grid / a play triangle) and whose COLOUR comes
    //     from the category class in src/client/styles.js.
    //
    // Folders are not here: they are the product's own IconFolderClose/OpenOutline
    // artwork and live with the other tree chrome (see FolderClosedIcon in
    // src/client/icons.js), because a folder glyph is chrome, not a file type.

    // ── BEGIN GENERATED ARTWORK · scripts/gen-filetype-icons.js ───────────

    // 48 full-colour brand glyphs, in the primitives declared order. Sourced
    // verbatim from the install — see the generator header for why.
    var CODE_ICON_TYPES = [
      "angular",
      "c",
      "clojure",
      "cmake",
      "cpp",
      "csharp",
      "css",
      "dart",
      "docker",
      "elixir",
      "env",
      "erlang",
      "flutter",
      "git",
      "go",
      "graphql",
      "haskell",
      "ini",
      "java",
      "javascript",
      "json",
      "kotlin",
      "lua",
      "makefile",
      "node",
      "objective-c",
      "perl",
      "php",
      "powershell",
      "protobuf",
      "python",
      "r",
      "react",
      "ruby",
      "rust",
      "scala",
      "shell",
      "solidity",
      "sql",
      "svelte",
      "swift",
      "toml",
      "typescript",
      "vue",
      "wasm",
      "xml",
      "yaml",
      "zig",
    ]

    // Instance-scoped ids: several glyphs carry <linearGradient>/<clipPath> and
    // their artwork references those ids. Two copies of one glyph on screen with
    // the same id means the second silently borrows the first one’s paint, so
    // every render stamps its OWN id into the token below.
    var CODE_ICON_ID_TOKEN = "__DSH_CODE_ICON_INSTANCE__"

    var CODE_ICON_ART = {
      "angular": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F8ECEF\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#DD0031\" d=\"M16.712 17.711H7.288l-1.204 2.916L12 24l5.916-3.373-1.204-2.916ZM14.692 0l7.832 16.855.814-12.856L14.692 0ZM9.308 0 .662 3.999l.814 12.856L9.308 0Zm-.405 13.93h6.198L12 6.396 8.903 13.93Z\"/></g>",
      "c": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EEF4F8\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#659AD2\" d=\"M16.5921 9.1962s-.354-3.298-3.627-3.39c-3.2741-.09-4.9552 2.474-4.9552 6.14 0 3.6651 1.858 6.5972 5.0451 6.5972 3.184 0 3.5381-3.665 3.5381-3.665l6.1041.365s.36 3.31-2.196 5.836c-2.552 2.5241-5.6901 2.9371-7.8762 2.9201-2.19-.017-5.2261.034-8.1602-2.97-2.938-3.0101-3.436-5.9302-3.436-8.8002 0-2.8701.556-6.6702 4.047-9.5502C7.444.72 9.849 0 12.254 0c10.0422 0 10.7172 9.2602 10.7172 9.2602z\"/></g>",
      "clojure": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F1F7EC\" stroke=\"#DCEAD2\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><g fill=\"none\"><path d=\"M64 0C28.712 0 0 28.6 0 63.751c0 35.155 28.712 63.753 64 63.753s64-28.598 64-63.753C128 28.6 99.288 0 64 0\" fill=\"#FFF\"/><path d=\"M61.659 64.898a265.825 265.825 0 00-1.867 4.12c-2.322 5.241-4.894 11.62-5.834 15.706-.337 1.455-.546 3.258-.542 5.258 0 .79.043 1.622.11 2.469a30.74 30.74 0 0010.533 1.87 30.796 30.796 0 009.642-1.566 18.09 18.09 0 01-2.011-2.12c-4.11-5.221-6.403-12.872-10.031-25.737M46.485 38.96c-7.85 5.51-12.986 14.6-13.005 24.9.019 10.145 5.001 19.116 12.653 24.65 1.877-7.789 6.582-14.92 13.637-29.214a114.691 114.691 0 00-1.43-3.72c-1.955-4.884-4.776-10.556-7.294-13.124-1.283-1.342-2.84-2.502-4.561-3.492\" fill=\"#91DC47\"/><path d=\"M90.697 98.798c-4.05-.506-7.392-1.116-10.317-2.144a36.708 36.708 0 01-16.32 3.807c-20.293 0-36.742-16.383-36.745-36.602 0-10.97 4.852-20.805 12.528-27.512-2.053-.495-4.194-.783-6.38-.779-10.782.101-22.162 6.044-26.9 22.095-.443 2.337-.337 4.103-.337 6.197 0 31.818 25.895 57.613 57.835 57.613 19.561 0 36.841-9.682 47.305-24.489-5.66 1.405-11.103 2.077-15.763 2.091-1.747 0-3.387-.093-4.906-.277\" fill=\"#63B132\"/><path d=\"M79.829 87.634c.357.176 1.167.464 2.293.783 7.579-5.542 12.504-14.469 12.523-24.558h-.003c-.028-16.82-13.693-30.43-30.582-30.462a30.765 30.765 0 00-9.602 1.554c6.21 7.05 9.196 17.127 12.084 28.148l.005.013c.005.009.924 3.06 2.501 7.11 1.566 4.042 3.797 9.048 6.23 12.696 1.597 2.444 3.354 4.2 4.551 4.716\" fill=\"#90B4FE\"/><path d=\"M17.057 30.311c5.463-3.408 11.04-4.637 15.908-4.593 6.722.02 12.008 2.096 14.544 3.516.612.352 1.194.73 1.764 1.12a36.714 36.714 0 0114.786-3.096c20.295.003 36.747 16.386 36.75 36.601-.003 10.192-4.188 19.408-10.934 26.044a45.3 45.3 0 005.225.29c6.406.004 13.329-1.404 18.52-5.753 3.384-2.84 6.22-6.998 7.792-13.233.307-2.408.484-4.856.484-7.347 0-31.817-25.892-57.614-57.835-57.614-19.372 0-36.508 9.5-47.004 24.065z\" fill=\"#5881D8\"/></g></svg>",
      "cmake": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F2F5F7\" stroke=\"#D9E1E7\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#064F8C\" d=\"M62.8.4L.3 123.8l68.1-57.9z\"/><path fill=\"#249847\" d=\"M123.8 127.7l-84-33.9L0 127.7z\"/><path fill=\"#BE2128\" d=\"M128 126.6L65.6 2.5l9.2 102.6z\"/><path fill=\"#CDCDCE\" d=\"M71.9 104l-3.1-34.9L42 92z\"/></svg>",
      "cpp": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#E8F2F8\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#00599C\" d=\"M22.394 6c-.167-.29-.398-.543-.652-.69L12.926.22c-.509-.294-1.34-.294-1.848 0L2.26 5.31c-.508.293-.923 1.013-.923 1.6v10.18c0 .294.104.62.271.91.167.29.398.543.652.69l8.816 5.09c.508.293 1.34.293 1.848 0l8.816-5.09c.254-.147.485-.4.652-.69.167-.29.27-.616.27-.91V6.91c.003-.294-.1-.62-.268-.91zM12 19.11c-3.92 0-7.109-3.19-7.109-7.11 0-3.92 3.19-7.11 7.11-7.11a7.133 7.133 0 016.156 3.553l-3.076 1.78a3.567 3.567 0 00-3.08-1.78A3.56 3.56 0 008.444 12 3.56 3.56 0 0012 15.555a3.57 3.57 0 003.08-1.778l3.078 1.78A7.135 7.135 0 0112 19.11zm7.11-6.715h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79zm2.962 0h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79z\"/></g>",
      "csharp": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3EEF7\" stroke=\"#E2D7EA\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#9B4F96\" d=\"M115.4 30.7L67.1 2.9c-.8-.5-1.9-.7-3.1-.7-1.2 0-2.3.3-3.1.7l-48 27.9c-1.7 1-2.9 3.5-2.9 5.4v55.7c0 1.1.2 2.4 1 3.5l106.8-62c-.6-1.2-1.5-2.1-2.4-2.7z\"/><path fill=\"#68217A\" d=\"M10.7 95.3c.5.8 1.2 1.5 1.9 1.9l48.2 27.9c.8.5 1.9.7 3.1.7 1.2 0 2.3-.3 3.1-.7l48-27.9c1.7-1 2.9-3.5 2.9-5.4V36.1c0-.9-.1-1.9-.6-2.8l-106.6 62z\"/><path fill=\"#fff\" d=\"M85.3 76.1C81.1 83.5 73.1 88.5 64 88.5c-13.5 0-24.5-11-24.5-24.5s11-24.5 24.5-24.5c9.1 0 17.1 5 21.3 12.5l13-7.5c-6.8-11.9-19.6-20-34.3-20-21.8 0-39.5 17.7-39.5 39.5s17.7 39.5 39.5 39.5c14.6 0 27.4-8 34.2-19.8l-12.9-7.6zM97 66.2l.9-4.3h-4.2v-4.7h5.1L100 51h4.9l-1.2 6.1h3.8l1.2-6.1h4.8l-1.2 6.1h2.4v4.7h-3.3l-.9 4.3h4.2v4.7h-5.1l-1.2 6h-4.9l1.2-6h-3.8l-1.2 6h-4.8l1.2-6h-2.4v-4.7H97zm4.8 0h3.8l.9-4.3h-3.8l-.9 4.3z\"/></svg>",
      "css": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#1572B6\"/><text x=\"10\" y=\"12.8\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"6.2\" font-weight=\"900\" fill=\"#fff\">CSS</text>",
      "dart": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECF7FA\" stroke=\"#D5EAF0\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#00c4b3\" d=\"M35.2 34.9l-8.3-8.3v59.7l.1 2.8c0 1.3.2 2.8.7 4.3l65.6 23.1 16.3-7.2-74.4-74.4z\"/><path d=\"M27.7 93.4zm81.9 15.9l-16.3 7.2-65.4-23.1c1.3 4.8 4 10.1 7 13.2l21.3 21.2 47.6.1 5.8-18.6z\" fill=\"#22d3c5\"/><path fill=\"#0075c9\" d=\"M1.7 65.1C-.4 67.3.7 72 4 75.5l14.7 14.8 9.2 3.3c-.3-1.5-.7-3-.7-4.3l-.1-2.8-.2-59.8m82.7 82.6l7.2-16.4-23-65.6c-1.5-.3-3-.6-4.3-.7l-2.9-.1-59.6.1\"/><path d=\"M93.6 27.3c.2 0 .2 0 0 0 .2 0 .2 0 0 0zm16 82l17.7-5.8V54.8l-20.4-20.5c-3-3-8.3-5.8-13.2-7l23.1 65.6\" fill=\"#00a8e1\"/><path fill=\"#00c4b3\" d=\"M90.5 18.2L75.7 3.5c-3.4-3.4-8-4.4-10.4-2.3L26.9 26.6h59.5l2.9.1c1.3 0 2.8.2 4.3.7l-3.1-9.2z\"/></svg>",
      "docker": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#E8F4FC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#2496ED\" d=\"M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z\"/></g>",
      "elixir": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3EEF6\" stroke=\"#E3D9E8\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-a\" gradientUnits=\"userSpaceOnUse\" x1=\"835.592\" y1=\"-36.546\" x2=\"821.211\" y2=\"553.414\" gradientTransform=\"matrix(.1297 0 0 .2 -46.03 17.198)\"><stop offset=\"0\" stop-color=\"#d9d8dc\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".385\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-a)\" d=\"M64.4.5C36.7 13.9 1.9 83.4 30.9 113.9c26.8 33.5 85.4 1.3 68.4-40.5-21.5-36-35-37.9-34.9-72.9z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-b\" gradientUnits=\"userSpaceOnUse\" x1=\"942.357\" y1=\"-40.593\" x2=\"824.692\" y2=\"472.243\" gradientTransform=\"matrix(.1142 0 0 .2271 -47.053 17.229)\"><stop offset=\"0\" stop-color=\"#8d67af\" stop-opacity=\".672\"/><stop offset=\"1\" stop-color=\"#9f8daf\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-b)\" d=\"M64.4.2C36.8 13.6 1.9 82.9 31 113.5c10.7 12.4 28 16.5 37.7 9.1 26.4-18.8 7.4-53.1 10.4-78.5C68.1 33.9 64.2 11.3 64.4.2z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-c\" gradientUnits=\"userSpaceOnUse\" x1=\"924.646\" y1=\"120.513\" x2=\"924.646\" y2=\"505.851\" gradientTransform=\"matrix(.1227 0 0 .2115 -46.493 17.206)\"><stop offset=\"0\" stop-color=\"#26053d\" stop-opacity=\".762\"/><stop offset=\"1\" stop-color=\"#b7b4b4\" stop-opacity=\".278\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-c)\" d=\"M56.7 4.3c-22.3 15.9-28.2 75-24.1 94.2 8.2 48.1 75.2 28.3 69.6-16.5-6-29.2-48.8-39.2-45.5-77.7z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-d\" gradientUnits=\"userSpaceOnUse\" x1=\"428.034\" y1=\"198.448\" x2=\"607.325\" y2=\"559.255\" gradientTransform=\"matrix(.1848 0 0 .1404 -42.394 17.138)\"><stop offset=\"0\" stop-color=\"#91739f\" stop-opacity=\".46\"/><stop offset=\"1\" stop-color=\"#32054f\" stop-opacity=\".54\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-d)\" d=\"M78.8 49.8c10.4 13.4 12.7 22.6 6.8 27.9-27.7 19.4-61.3 7.4-54-37.3C22.1 63 4.5 96.8 43.3 101.6c20.8 3.6 54 2 58.9-16.1-.2-15.9-10.8-22.9-23.4-35.7z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-e\" gradientUnits=\"userSpaceOnUse\" x1=\"907.895\" y1=\"540.636\" x2=\"590.242\" y2=\"201.281\" gradientTransform=\"matrix(.1418 0 0 .1829 -45.23 17.18)\"><stop offset=\"0\" stop-color=\"#463d49\" stop-opacity=\".331\"/><stop offset=\"1\" stop-color=\"#340a50\" stop-opacity=\".821\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-e)\" d=\"M38.1 36.4c-2.9 21.2 35.1 77.9 58.3 71-17.7 35.6-56.9-21.2-64-41.7 1.5-11 2.2-16.4 5.7-29.3z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-f\" gradientUnits=\"userSpaceOnUse\" x1=\"1102.297\" y1=\"100.542\" x2=\"1008.071\" y2=\"431.648\" gradientTransform=\"matrix(.106 0 0 .2448 -47.595 17.242)\"><stop offset=\"0\" stop-color=\"#715383\" stop-opacity=\".145\"/><stop offset=\"1\" stop-color=\"#f4f4f4\" stop-opacity=\".234\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-f)\" d=\"M60.4 49.7c.8 7.9 3.9 20.5 0 28.8S38.7 102 43.6 115.3c11.4 24.8 37.1-4.4 36.9-19 1.1-11.8-6.6-38.7-1.8-52.5L76.5 41l-13.6-4c-2.2 3.2-3 7.5-2.5 12.7z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-g\" gradientUnits=\"userSpaceOnUse\" x1=\"1354.664\" y1=\"140.06\" x2=\"1059.233\" y2=\"84.466\" gradientTransform=\"matrix(.09173 0 0 .2828 -48.536 17.28)\"><stop offset=\"0\" stop-color=\"#a5a1a8\" stop-opacity=\".356\"/><stop offset=\"1\" stop-color=\"#370c50\" stop-opacity=\".582\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-g)\" d=\"M65.3 10.8C36 27.4 48 53.4 49.3 81.6l19.1-55.4c-1.4-5.7-2.3-9.5-3.1-15.4z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#330A4C\" fill-opacity=\".316\" d=\"M68.3 26.1c-14.8 11.7-14.1 31.3-18.6 54 8.1-21.3 4.1-38.2 18.6-54z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#FFF\" d=\"M45.8 119.7c8 1.1 12.1 2.2 12.5 3 .3 4.2-11.1 1.2-12.5-3z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#EDEDED\" fill-opacity=\".603\" d=\"M49.8 10.8c-6.9 7.7-14.4 21.8-18.2 29.7-1 6.5-.5 15.7.6 23.5.9-18.2 7.5-39.2 17.6-53.2z\"/></svg>",
      "env": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECD53F\"/><text x=\"10\" y=\"12.9\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"5.7\" font-weight=\"900\" fill=\"#24292F\">.ENV</text>",
      "erlang": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FAEDF1\" stroke=\"#EED6DE\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path d=\"M20.7 103.9C11 93.5 5.2 79.2 5.3 62.1 5.2 47 10 34 18.2 24.1H1v79.7l19.7.1zm90.4 0c4.2-4.5 8-9.8 11.4-15.9l-19-9.5c-6.7 10.8-16.4 20.8-29.9 20.9-19.6-.1-27.3-16.9-27.3-38.5h73.3c.1-2.4.1-3.6 0-4.7.5-12.9-2.9-23.7-9.1-32.1H127v79.7l-15.9.1zM47.5 42.4c.8-9.8 8.5-16.3 17.6-16.4 9.1 0 15.7 6.6 15.9 16.4H47.5z\" fill=\"#A90533\"/></svg>",
      "flutter": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EEF7FD\" stroke=\"#D7EAF6\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><g fill=\"#3FB6D3\"><path d=\"M12.3 64.2L76.3 0h39.4L32.1 83.6zM76.3 128h39.4L81.6 93.9l34.1-34.8H76.3L42.2 93.5z\"/></g><path fill=\"#27AACD\" d=\"M81.6 93.9l-20-20-19.4 19.6 19.4 19.6z\"/><path fill=\"#19599A\" d=\"M115.7 128L81.6 93.9l-20 19.2L76.3 128z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__flutter-original-a\" gradientUnits=\"userSpaceOnUse\" x1=\"59.365\" y1=\"116.36\" x2=\"86.825\" y2=\"99.399\"><stop offset=\"0\" stop-color=\"#1b4e94\"/><stop offset=\".63\" stop-color=\"#1a5497\"/><stop offset=\"1\" stop-color=\"#195a9b\"/></linearGradient><path fill=\"url(#__DSH_CODE_ICON_INSTANCE__flutter-original-a)\" d=\"M61.6 113.1l30.8-8.4-10.8-10.8z\"/></svg>",
      "git": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FFF0EC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#F05032\" d=\"M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z\"/></g>",
      "go": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#E7F9FC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#00ADD8\" d=\"M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-.327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-.304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 01.292-.187h4.253c-.023.316-.023.631-.07.947a4.983 4.983 0 01-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424.83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648.07.105.023.164-.117.2m3.868 6.461c-1.064-.024-2.034-.328-2.852-1.029a3.665 3.665 0 01-1.262-2.255c-.21-1.32.152-2.489.947-3.529.853-1.122 1.881-1.706 3.272-1.95 1.192-.21 2.314-.095 3.33.595.923.63 1.496 1.484 1.648 2.605.198 1.578-.257 2.863-1.344 3.962-.771.783-1.718 1.273-2.805 1.495-.315.06-.63.07-.934.106zm2.78-4.72c-.011-.153-.011-.27-.034-.387-.21-1.157-1.274-1.81-2.384-1.554-1.087.245-1.788.935-2.045 2.033-.21.912.234 1.835 1.075 2.21.643.28 1.285.244 1.905-.07.923-.48 1.425-1.228 1.484-2.233z\"/></g>",
      "graphql": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCEAF6\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#E10098\" d=\"M12.002 0a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm8.54 4.931a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm0 9.862a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm-8.54 4.931a2.138 2.138 0 1 0 0 4.276 2.138 2.138 0 1 0 0-4.276zm-8.542-4.93a2.138 2.138 0 1 0 0 4.276 2.138 2.138 0 1 0 0-4.277zm0-9.863a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm8.542-3.378L2.953 6.777v10.448l9.049 5.224 9.047-5.224V6.777zm0 1.601 7.66 13.27H4.34zm-1.387.371L3.97 15.037V7.363zm2.774 0 6.646 3.838v7.674zM5.355 17.44h13.293l-6.646 3.836z\"/></g>",
      "haskell": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3F0F7\" stroke=\"#E1D9EA\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#463B63\" d=\"M0 110.2L30.1 65 0 19.9h22.6L52.7 65l-30.1 45.1H0z\"/><path fill=\"#5E5187\" d=\"M30.1 110.2L60.2 65 30.1 19.9h22.6l60.2 90.3H90.4L71.5 81.9l-18.8 28.2H30.1z\"/><path fill=\"#904F8C\" d=\"M102.9 83.8l-10-15.1H128v15.1h-25.1zM87.8 61.3l-10-15.1H128v15.1H87.8z\"/></svg>",
      "ini": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#6E7781\"/><text x=\"10\" y=\"13.2\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"7.2\" font-weight=\"800\" fill=\"#fff\">INI</text>",
      "java": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F4F7FA\" stroke=\"#D9E2E8\" stroke-width=\".5\"/><svg x=\"2.5\" y=\"2.5\" width=\"15\" height=\"15\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#0074BD\" d=\"M47.617 98.12s-4.767 2.774 3.397 3.71c9.892 1.13 14.947.968 25.845-1.092 0 0 2.871 1.795 6.873 3.351-24.439 10.47-55.308-.607-36.115-5.969zm-2.988-13.665s-5.348 3.959 2.823 4.805c10.567 1.091 18.91 1.18 33.354-1.6 0 0 1.993 2.025 5.132 3.131-29.542 8.64-62.446.68-41.309-6.336z\"/><path fill=\"#EA2D2E\" d=\"M69.802 61.271c6.025 6.935-1.58 13.17-1.58 13.17s15.289-7.891 8.269-17.777c-6.559-9.215-11.587-13.792 15.635-29.58 0 .001-42.731 10.67-22.324 34.187z\"/><path fill=\"#0074BD\" d=\"M102.123 108.229s3.529 2.91-3.888 5.159c-14.102 4.272-58.706 5.56-71.094.171-4.451-1.938 3.899-4.625 6.526-5.192 2.739-.593 4.303-.485 4.303-.485-4.953-3.487-32.013 6.85-13.743 9.815 49.821 8.076 90.817-3.637 77.896-9.468zM49.912 70.294s-22.686 5.389-8.033 7.348c6.188.828 18.518.638 30.011-.326 9.39-.789 18.813-2.474 18.813-2.474s-3.308 1.419-5.704 3.053c-23.042 6.061-67.544 3.238-54.731-2.958 10.832-5.239 19.644-4.643 19.644-4.643zm40.697 22.747c23.421-12.167 12.591-23.86 5.032-22.285-1.848.385-2.677.72-2.677.72s.688-1.079 2-1.543c14.953-5.255 26.451 15.503-4.823 23.725 0-.002.359-.327.468-.617z\"/><path fill=\"#EA2D2E\" d=\"M76.491 1.587S89.459 14.563 64.188 34.51c-20.266 16.006-4.621 25.13-.007 35.559-11.831-10.673-20.509-20.07-14.688-28.815C58.041 28.42 81.722 22.195 76.491 1.587z\"/><path fill=\"#0074BD\" d=\"M52.214 126.021c22.476 1.437 57-.8 57.817-11.436 0 0-1.571 4.032-18.577 7.231-19.186 3.612-42.854 3.191-56.887.874 0 .001 2.875 2.381 17.647 3.331z\"/></svg>",
      "javascript": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#F0DB4F\" d=\"M1.408 1.408h125.184v125.185H1.408z\"/><path fill=\"#323330\" d=\"M116.347 96.736c-.917-5.711-4.641-10.508-15.672-14.981-3.832-1.761-8.104-3.022-9.377-5.926-.452-1.69-.512-2.642-.226-3.665.821-3.32 4.784-4.355 7.925-3.403 2.023.678 3.938 2.237 5.093 4.724 5.402-3.498 5.391-3.475 9.163-5.879-1.381-2.141-2.118-3.129-3.022-4.045-3.249-3.629-7.676-5.498-14.756-5.355l-3.688.477c-3.534.893-6.902 2.748-8.877 5.235-5.926 6.724-4.236 18.492 2.975 23.335 7.104 5.332 17.54 6.545 18.873 11.531 1.297 6.104-4.486 8.08-10.234 7.378-4.236-.881-6.592-3.034-9.139-6.949-4.688 2.713-4.688 2.713-9.508 5.485 1.143 2.499 2.344 3.63 4.26 5.795 9.068 9.198 31.76 8.746 35.83-5.176.165-.478 1.261-3.666.38-8.581zM69.462 58.943H57.753l-.048 30.272c0 6.438.333 12.34-.714 14.149-1.713 3.558-6.152 3.117-8.175 2.427-2.059-1.012-3.106-2.451-4.319-4.485-.333-.584-.583-1.036-.667-1.071l-9.52 5.83c1.583 3.249 3.915 6.069 6.902 7.901 4.462 2.678 10.459 3.499 16.731 2.059 4.082-1.189 7.604-3.652 9.448-7.401 2.666-4.915 2.094-10.864 2.07-17.444.06-10.735.001-21.468.001-32.237z\"/></svg></g>",
      "json": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F4F4F4\" stroke=\"#DDDDDD\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__a\" x1=\"-670.564\" x2=\"-583.105\" y1=\"-280.831\" y2=\"-368.306\" gradientTransform=\"matrix(.9988 0 0 -.9987 689.011 -259.008)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\"/><stop offset=\"1\" stop-color=\"#fff\"/></linearGradient><path fill=\"url(#__DSH_CODE_ICON_INSTANCE__a)\" fill-rule=\"evenodd\" d=\"M63.895 94.303c27.433 37.398 54.281-10.438 54.241-39.205-.046-34.012-34.518-53.021-54.263-53.021C32.182 2.077 2 28.269 2 64.105 2 103.937 36.596 126 63.873 126c-6.172-.889-26.742-5.296-27.019-52.674-.186-32.044 10.453-44.846 26.974-39.214.37.137 18.223 7.18 18.223 30.187 0 22.908-18.156 30.004-18.156 30.004z\" clip-rule=\"evenodd\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__b\" x1=\"-579.148\" x2=\"-666.607\" y1=\"-364.34\" y2=\"-276.873\" gradientTransform=\"matrix(.9988 0 0 -.9987 689.011 -259.008)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\"/><stop offset=\"1\" stop-color=\"#fff\"/></linearGradient><path fill=\"url(#__DSH_CODE_ICON_INSTANCE__b)\" fill-rule=\"evenodd\" d=\"M63.863 34.086C45.736 27.838 23.53 42.778 23.53 72.703 23.53 121.565 59.739 126 64.128 126 95.818 126 126 99.808 126 63.972 126 24.14 91.404 2.077 64.127 2.077c7.555-1.046 40.719 8.176 40.719 53.504 0 29.559-24.764 45.651-40.87 38.776-.37-.137-18.223-7.18-18.223-30.187 0-22.91 18.11-30.085 18.11-30.084z\" clip-rule=\"evenodd\"/></svg>",
      "kotlin": "<defs><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__k\" x1=\"1\" y1=\"19\" x2=\"19\" y2=\"1\"><stop stop-color=\"#0095D5\"/><stop offset=\".5\" stop-color=\"#7F52FF\"/><stop offset=\"1\" stop-color=\"#F88909\"/></linearGradient></defs><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__k)\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#FFFFFF\" d=\"M24 24H0V0h24L12 12Z\"/></g>",
      "lua": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECECF7\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#000080\" d=\"M.38 10.377l-.272-.037c-.048.344-.082.695-.101 1.041l.275.016c.018-.34.051-.682.098-1.02zM4.136 3.289l-.184-.205c-.258.232-.509.48-.746.734l.202.188c.231-.248.476-.49.728-.717zM5.769 2.059l-.146-.235c-.296.186-.586.385-.863.594l.166.219c.27-.203.554-.399.843-.578zM1.824 18.369c.185.297.384.586.593.863l.22-.164c-.205-.271-.399-.555-.58-.844l-.233.145zM1.127 16.402l-.255.104c.129.318.274.635.431.943l.005.01.245-.125-.005-.01c-.153-.301-.295-.611-.421-.922zM.298 9.309l.269.063c.076-.332.168-.664.272-.986l-.261-.087c-.108.332-.202.672-.28 1.01zM.274 12.42l-.275.01c.012.348.04.699.083 1.043l.273-.033c-.042-.336-.069-.68-.081-1.02zM.256 14.506c.073.34.162.682.264 1.014l.263-.08c-.1-.326-.187-.658-.258-.99l-.269.056zM11.573.275L11.563 0c-.348.012-.699.039-1.044.082l.034.273c.338-.041.68-.068 1.02-.08zM23.221 8.566c.1.326.186.66.256.992l.27-.059c-.072-.34-.16-.682-.262-1.014l-.264.081zM17.621 1.389c-.309-.164-.627-.314-.947-.449l-.107.252c.314.133.625.281.926.439l.128-.242zM15.693.572c-.332-.105-.67-.199-1.01-.277l-.063.268c.332.076.664.168.988.273l.085-.264zM6.674 1.545c.298-.15.606-.291.916-.418L7.486.873c-.317.127-.632.272-.937.428l-.015.008.125.244.015-.008zM23.727 11.588l.275-.01a11.797 11.797 0 0 0-.082-1.045l-.273.033c.041.338.068.682.08 1.022zM13.654.105c-.346-.047-.696-.08-1.043-.098l-.014.273c.339.018.683.051 1.019.098l.038-.273zM9.544.527l-.058-.27c-.34.072-.681.16-1.014.264l.081.262c.325-.099.659-.185.991-.256zM1.921 5.469l.231.15c.185-.285.384-.566.592-.834l-.217-.17c-.213.276-.417.563-.606.854zM.943 7.318l.253.107c.132-.313.28-.625.439-.924l-.243-.128c-.163.307-.314.625-.449.945zM18.223 21.943l.145.234c.295-.186.586-.385.863-.594l-.164-.219c-.272.204-.557.4-.844.579zM21.248 19.219l.217.17c.215-.273.418-.561.607-.854l-.23-.148c-.186.285-.385.564-.594.832zM19.855 20.715l.184.203c.258-.23.51-.479.746-.732l-.201-.188c-.23.248-.477.488-.729.717zM22.359 17.504l.244.129c.162-.307.314-.625.449-.945l-.254-.107a11.27 11.27 0 0 1-.439.923zM23.617 13.629l.273.039c.049-.346.082-.695.102-1.043l-.275-.014c-.018.338-.051.682-.1 1.018zM23.156 15.621l.264.086c.107-.332.201-.67.279-1.01l-.268-.063c-.077.333-.169.665-.275.987zM22.453 6.672c.154.303.297.617.424.932l.256-.104c-.131-.322-.277-.643-.436-.953l-.244.125zM8.296 23.418c.331.107.67.201 1.009.279l.062-.268c-.331-.076-.663-.168-.986-.273l-.085.262zM10.335 23.889c.345.049.696.082 1.043.102l.014-.275c-.339-.018-.682-.051-1.019-.098l-.038.271zM17.326 22.449c-.303.154-.613.297-.926.424l.104.256c.318-.131.639-.275.947-.434l.004-.002-.123-.246-.006.002zM4.613 21.467c.274.213.562.418.854.605l.149-.23c-.285-.184-.565-.385-.833-.592l-.17.217zM12.417 23.725l.009.275c.348-.014.699-.041 1.045-.084l-.035-.271c-.336.041-.68.068-1.019.08zM6.37 22.604c.307.162.625.314.946.449l.107-.254c-.313-.133-.624-.279-.924-.439l-.129.244zM3.083 20.041c.233.258.48.51.734.746l.188-.201c-.249-.23-.49-.477-.717-.729l-.205.184zM14.445 23.475l.059.27c.34-.074.68-.162 1.014-.266l-.082-.262c-.325.099-.659.185-.991.258zM21.18.129A2.689 2.689 0 1 0 21.18 5.507 2.689 2.689 0 1 0 21.18.129zM15.324 15.447c0 .471.314.66.852.66.67 0 1.297-.396 1.297-1.016v-.645c-.23.107-.379.141-1.107.24-.735.109-1.042.306-1.042.761zM12 2.818c-5.07 0-9.18 4.109-9.18 9.18 0 5.068 4.11 9.18 9.18 9.18 5.07 0 9.18-4.111 9.18-9.18 0-5.07-4.11-9.18-9.18-9.18zm-2.487 13.77H5.771v-6.023h.769v5.346h2.974v.677zm4.13 0h-.619v-.67c-.405.57-.811.793-1.446.793-.843 0-1.38-.463-1.38-1.182v-3.271h.686v3c0 .52.347.85.893.85.719 0 1.181-.578 1.181-1.461v-2.389h.686v4.33zm-.53-8.393c0-1.484 1.205-2.689 2.689-2.689s2.688 1.205 2.688 2.689-1.203 2.688-2.688 2.688-2.689-1.203-2.689-2.688zm5.567 7.856v.52c-.223.059-.33.074-.471.074-.34 0-.637-.238-.711-.57-.381.406-.918.637-1.471.637-.877 0-1.422-.463-1.422-1.248 0-.527.256-.916.76-1.123.266-.107.414-.141 1.389-.264.545-.066.719-.191.719-.48v-.182c0-.412-.348-.645-.967-.645-.645 0-.957.24-1.016.77h-.693c.041-1 .686-1.404 1.734-1.404 1.066 0 1.627.412 1.627 1.182v2.412c0 .215.133.338.373.338.041-.002.074-.002.149-.017z\"/></g>",
      "makefile": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#427819\"/><path fill=\"#fff\" d=\"m5 4.5 2.3 2.3 2.3-2.3L11 5.9 8.7 8.2l2.4 2.4L9.7 12l-2.4-2.4L5 11.9 3.6 10.5l2.3-2.3-2.3-2.3zm7 6.5h4v1.5h-4zm0 2.8h4v1.5h-4z\"/>",
      "node": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EDF7EA\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#539E43\" d=\"M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993 c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233 c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081 c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833 c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402 c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253 c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z\"/></g>",
      "objective-c": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#438EFF\"/><text x=\"10\" y=\"13.2\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"7.2\" font-weight=\"800\" fill=\"#fff\">OC</text>",
      "perl": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EAF2F7\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#0073A1\" d=\"M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0m.157 1.103a10.91 10.91 0 0 1 9.214 5.404c-1.962.152-3.156 1.698-5.132 3.553-2.81 2.637-4.562.582-5.288-.898-.447-1.004-.847-2.117-1.544-2.769A.4.4 0 0 1 9.3 6.02l.08-.37a.083.083 0 0 0-.074-.1c-.33-.022-.601.093-.84.368a2.5 2.5 0 0 0-.375-.064c-.863-.093-1.036.345-1.873.345H5.81c-.758 0-1.391.361-1.7.892-.248.424-.257.884.15.93-.126.445.292.62 1.224.192 0 0 .733.421 1.749.421.549 0 .712.087.914.967.486 2.138 2.404 5.655 6.282 5.655l.118.166c.659.934.86 2.113.48 3.184-.307.867-.697 1.531-.697 1.531q.01.178.01.349c0 .81-.175 1.553-.387 2.23a10.91 10.91 0 0 1-11.989-6.342A10.91 10.91 0 0 1 7.608 2.01a10.9 10.9 0 0 1 4.55-.907M7.524 6.47c.288 0 .575.231.477.272a.4.4 0 0 1-.1.02.38.38 0 0 1-.375.327.384.384 0 0 1-.378-.326.4.4 0 0 1-.101-.02c-.098-.042.19-.273.477-.273m10.193 10.49q.05 0 .101.007.326.054.694.096.135.01.269.026a13.4 13.4 0 0 0 2.846-.007 10.9 10.9 0 0 1-2.007 2.705c-.11-.23-.547-1.19-.573-2.196q-.156-.01-.313-.026-.13-.014-.256-.022a18 18 0 0 1-.735-.102h-.003c-.032 0-.06.01-.074.035l-.003.012q-.081.265-.182.544c.428 1.084.652 2.078.652 2.078.14.22.258.432.363.64a11 11 0 0 1-2.168 1.264 11 11 0 0 1-1.205.426 13.3 13.3 0 0 1 1.055-2.531s.678-1.445 1.027-2.564v-.004a.55.55 0 0 1 .512-.38\"/></g>",
      "php": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F0EFF8\" stroke=\"#DDDCEB\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#777BB4\" d=\"M7.01 10.207h-.944l-.515 2.648h.838c.556 0 .97-.105 1.242-.314.272-.21.455-.559.55-1.049.092-.47.05-.802-.124-.995-.175-.193-.523-.29-1.047-.29zM12 5.688C5.373 5.688 0 8.514 0 12s5.373 6.313 12 6.313S24 15.486 24 12c0-3.486-5.373-6.312-12-6.312zm-3.26 7.451c-.261.25-.575.438-.917.551-.336.108-.765.164-1.285.164H5.357l-.327 1.681H3.652l1.23-6.326h2.65c.797 0 1.378.209 1.744.628.366.418.476 1.002.33 1.752a2.836 2.836 0 0 1-.305.847c-.143.255-.33.49-.561.703zm4.024.715l.543-2.799c.063-.318.039-.536-.068-.651-.107-.116-.336-.174-.687-.174H11.46l-.704 3.625H9.388l1.23-6.327h1.367l-.327 1.682h1.218c.767 0 1.295.134 1.586.401s.378.7.263 1.299l-.572 2.944h-1.389zm7.597-2.265a2.782 2.782 0 0 1-.305.847c-.143.255-.33.49-.561.703a2.44 2.44 0 0 1-.917.551c-.336.108-.765.164-1.286.164h-1.18l-.327 1.682h-1.378l1.23-6.326h2.649c.797 0 1.378.209 1.744.628.366.417.477 1.001.331 1.751zM17.766 10.207h-.943l-.516 2.648h.838c.557 0 .971-.105 1.242-.314.272-.21.455-.559.551-1.049.092-.47.049-.802-.125-.995s-.524-.29-1.047-.29z\"/></g>",
      "powershell": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#2671BE\"/><path fill=\"#fff\" fill-opacity=\".16\" d=\"M5.5 4h11l-3.5 12H2z\"/><path d=\"m6.5 6.5 3 3-4.2 3.2m4 1h4\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
      "protobuf": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#4285F4\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"1.2\" stroke-linejoin=\"round\" d=\"m10 3.5 6 3.3v6.4l-6 3.3-6-3.3V6.8z\"/><path fill=\"#fff\" d=\"M6.5 6.5h4.4c2.3 0 3.6 1.2 3.6 3.1s-1.3 3.1-3.6 3.1H9v2H6.5zM9 8.4v2.4h1.6c.8 0 1.2-.4 1.2-1.2s-.4-1.2-1.2-1.2z\"/>",
      "python": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F2F4F7\" stroke=\"#D5DBE5\" stroke-width=\".5\"/><g transform=\"matrix(.126 0 0 .126 2.30 2.24)\"><path fill=\"#3776AB\" d=\"M 60.510156,6.3979729 C 55.926503,6.4192712 51.549217,6.8101906 47.697656,7.4917229 C 36.35144,9.4962267 34.291407,13.691825 34.291406,21.429223 L 34.291406,31.647973 L 61.103906,31.647973 L 61.103906,35.054223 L 34.291406,35.054223 L 24.228906,35.054223 C 16.436447,35.054223 9.6131468,39.73794 7.4789058,48.647973 C 5.0170858,58.860939 4.9078907,65.233996 7.4789058,75.897973 C 9.3848341,83.835825 13.936449,89.491721 21.728906,89.491723 L 30.947656,89.491723 L 30.947656,77.241723 C 30.947656,68.391821 38.6048,60.585475 47.697656,60.585473 L 74.478906,60.585473 C 81.933857,60.585473 87.885159,54.447309 87.885156,46.960473 L 87.885156,21.429223 C 87.885156,14.162884 81.755176,8.7044455 74.478906,7.4917229 C 69.872919,6.7249976 65.093809,6.3766746 60.510156,6.3979729 z M 46.010156,14.616723 C 48.779703,14.616723 51.041406,16.915369 51.041406,19.741723 C 51.041404,22.558059 48.779703,24.835473 46.010156,24.835473 C 43.23068,24.835472 40.978906,22.558058 40.978906,19.741723 C 40.978905,16.91537 43.23068,14.616723 46.010156,14.616723 z \"/><path fill=\"#FFD43B\" d=\"M 91.228906,35.054223 L 91.228906,46.960473 C 91.228906,56.191228 83.403011,63.960472 74.478906,63.960473 L 47.697656,63.960473 C 40.361823,63.960473 34.291407,70.238956 34.291406,77.585473 L 34.291406,103.11672 C 34.291406,110.38306 40.609994,114.65704 47.697656,116.74172 C 56.184987,119.23733 64.323893,119.68835 74.478906,116.74172 C 81.229061,114.78733 87.885159,110.85411 87.885156,103.11672 L 87.885156,92.897973 L 61.103906,92.897973 L 61.103906,89.491723 L 87.885156,89.491723 L 101.29141,89.491723 C 109.08387,89.491723 111.98766,84.056315 114.69765,75.897973 C 117.49698,67.499087 117.37787,59.422197 114.69765,48.647973 C 112.77187,40.890532 109.09378,35.054223 101.29141,35.054223 L 91.228906,35.054223 z M 76.166406,99.710473 C 78.945884,99.710476 81.197656,101.98789 81.197656,104.80422 C 81.197654,107.63057 78.945881,109.92922 76.166406,109.92922 C 73.396856,109.92922 71.135156,107.63057 71.135156,104.80422 C 71.135158,101.98789 73.396853,99.710473 76.166406,99.710473 z \"/></g>",
      "r": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EEF2F6\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#276DC3\" d=\"M12 2.746c-6.627 0-12 3.599-12 8.037 0 3.897 4.144 7.144 9.64 7.88V16.26c-2.924-.915-4.925-2.755-4.925-4.877 0-3.035 4.084-5.494 9.12-5.494 5.038 0 8.757 1.683 8.757 5.494 0 1.976-.999 3.379-2.662 4.272.09.066.174.128.258.216.169.149.25.363.372.544 2.128-1.45 3.44-3.437 3.44-5.631 0-4.44-5.373-8.038-12-8.038zm-2.111 4.99v13.516l4.093-.002-.002-5.291h1.1c.225 0 .321.066.549.25.272.22.715.982.715.982l2.164 4.063 4.627-.002-2.864-4.826s-.086-.193-.265-.383a2.22 2.22 0 00-.582-.416c-.422-.214-1.149-.434-1.149-.434s3.578-.264 3.578-3.826c0-3.562-3.744-3.63-3.744-3.63zm4.127 2.93l2.478.002s1.149-.062 1.149 1.127c0 1.165-1.149 1.17-1.149 1.17h-2.478zm1.754 6.119c-.494.049-1.012.079-1.54.088v1.807a16.622 16.622 0 002.37-.473l-.471-.891s-.108-.183-.248-.394c-.039-.054-.08-.098-.111-.137z\"/></g>",
      "react": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#20232A\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#61DAFB\" d=\"M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z\"/></g>",
      "ruby": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCEDEC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#CC342D\" d=\"M20.156.083c3.033.525 3.893 2.598 3.829 4.77L24 4.822 22.635 22.71 4.89 23.926h.016C3.433 23.864.15 23.729 0 19.139l1.645-3 2.819 6.586.503 1.172 2.805-9.144-.03.007.016-.03 9.255 2.956-1.396-5.431-.99-3.9 8.82-.569-.615-.51L16.5 2.114 20.159.073l-.003.01zM0 19.089zM5.13 5.073c3.561-3.533 8.157-5.621 9.922-3.84 1.762 1.777-.105 6.105-3.673 9.636-3.563 3.532-8.103 5.734-9.864 3.957-1.766-1.777.045-6.217 3.612-9.75l.003-.003z\"/></g>",
      "rust": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3E6DD\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#2B2B2B\" d=\"M23.8346 11.7033l-1.0073-.6236a13.7268 13.7268 0 00-.0283-.2936l.8656-.8069a.3483.3483 0 00-.1154-.578l-1.1066-.414a8.4958 8.4958 0 00-.087-.2856l.6904-.9587a.3462.3462 0 00-.2257-.5446l-1.1663-.1894a9.3574 9.3574 0 00-.1407-.2622l.49-1.0761a.3437.3437 0 00-.0274-.3361.3486.3486 0 00-.3006-.154l-1.1845.0416a6.7444 6.7444 0 00-.1873-.2268l.2723-1.153a.3472.3472 0 00-.417-.4172l-1.1532.2724a14.0183 14.0183 0 00-.2278-.1873l.0415-1.1845a.3442.3442 0 00-.49-.328l-1.076.491c-.0872-.0476-.1742-.0952-.2623-.1407l-.1903-1.1673A.3483.3483 0 0016.256.955l-.9597.6905a8.4867 8.4867 0 00-.2855-.086l-.414-1.1066a.3483.3483 0 00-.5781-.1154l-.8069.8666a9.2936 9.2936 0 00-.2936-.0284L12.2946.1683a.3462.3462 0 00-.5892 0l-.6236 1.0073a13.7383 13.7383 0 00-.2936.0284L9.9803.3374a.3462.3462 0 00-.578.1154l-.4141 1.1065c-.0962.0274-.1903.0567-.2855.086L7.744.955a.3483.3483 0 00-.5447.2258L7.009 2.348a9.3574 9.3574 0 00-.2622.1407l-1.0762-.491a.3462.3462 0 00-.49.328l.0416 1.1845a7.9826 7.9826 0 00-.2278.1873L3.8413 3.425a.3472.3472 0 00-.4171.4171l.2713 1.1531c-.0628.075-.1255.1509-.1863.2268l-1.1845-.0415a.3462.3462 0 00-.328.49l.491 1.0761a9.167 9.167 0 00-.1407.2622l-1.1662.1894a.3483.3483 0 00-.2258.5446l.6904.9587a13.303 13.303 0 00-.087.2855l-1.1065.414a.3483.3483 0 00-.1155.5781l.8656.807a9.2936 9.2936 0 00-.0283.2935l-1.0073.6236a.3442.3442 0 000 .5892l1.0073.6236c.008.0982.0182.1964.0283.2936l-.8656.8079a.3462.3462 0 00.1155.578l1.1065.4141c.0273.0962.0567.1914.087.2855l-.6904.9587a.3452.3452 0 00.2268.5447l1.1662.1893c.0456.088.0922.1751.1408.2622l-.491 1.0762a.3462.3462 0 00.328.49l1.1834-.0415c.0618.0769.1235.1528.1873.2277l-.2713 1.1541a.3462.3462 0 00.4171.4161l1.153-.2713c.075.0638.151.1255.2279.1863l-.0415 1.1845a.3442.3442 0 00.49.327l1.0761-.49c.087.0486.1741.0951.2622.1407l.1903 1.1662a.3483.3483 0 00.5447.2268l.9587-.6904a9.299 9.299 0 00.2855.087l.414 1.1066a.3452.3452 0 00.5781.1154l.8079-.8656c.0972.0111.1954.0203.2936.0294l.6236 1.0073a.3472.3472 0 00.5892 0l.6236-1.0073c.0982-.0091.1964-.0183.2936-.0294l.8069.8656a.3483.3483 0 00.578-.1154l.4141-1.1066a8.4626 8.4626 0 00.2855-.087l.9587.6904a.3452.3452 0 00.5447-.2268l.1903-1.1662c.088-.0456.1751-.0931.2622-.1407l1.0762.49a.3472.3472 0 00.49-.327l-.0415-1.1845a6.7267 6.7267 0 00.2267-.1863l1.1531.2713a.3472.3472 0 00.4171-.416l-.2713-1.1542c.0628-.0749.1255-.1508.1863-.2278l1.1845.0415a.3442.3442 0 00.328-.49l-.49-1.076c.0475-.0872.0951-.1742.1407-.2623l1.1662-.1893a.3483.3483 0 00.2258-.5447l-.6904-.9587.087-.2855 1.1066-.414a.3462.3462 0 00.1154-.5781l-.8656-.8079c.0101-.0972.0202-.1954.0283-.2936l1.0073-.6236a.3442.3442 0 000-.5892zm-6.7413 8.3551a.7138.7138 0 01.2986-1.396.714.714 0 11-.2997 1.396zm-.3422-2.3142a.649.649 0 00-.7715.5l-.3573 1.6685c-1.1035.501-2.3285.7795-3.6193.7795a8.7368 8.7368 0 01-3.6951-.814l-.3574-1.6684a.648.648 0 00-.7714-.499l-1.473.3158a8.7216 8.7216 0 01-.7613-.898h7.1676c.081 0 .1356-.0141.1356-.088v-2.536c0-.074-.0536-.0881-.1356-.0881h-2.0966v-1.6077h2.2677c.2065 0 1.1065.0587 1.394 1.2088.0901.3533.2875 1.5044.4232 1.8729.1346.413.6833 1.2381 1.2685 1.2381h3.5716a.7492.7492 0 00.1296-.0131 8.7874 8.7874 0 01-.8119.9526zM6.8369 20.024a.714.714 0 11-.2997-1.396.714.714 0 01.2997 1.396zM4.1177 8.9972a.7137.7137 0 11-1.304.5791.7137.7137 0 011.304-.579zm-.8352 1.9813l1.5347-.6824a.65.65 0 00.33-.8585l-.3158-.7147h1.2432v5.6025H3.5669a8.7753 8.7753 0 01-.2834-3.348zm6.7343-.5437V8.7836h2.9601c.153 0 1.0792.1772 1.0792.8697 0 .575-.7107.7815-1.2948.7815zm10.7574 1.4862c0 .2187-.008.4363-.0243.651h-.9c-.09 0-.1265.0586-.1265.1477v.413c0 .973-.5487 1.1846-1.0296 1.2382-.4576.0517-.9648-.1913-1.0275-.4717-.2704-1.5186-.7198-1.8436-1.4305-2.4034.8817-.5599 1.799-1.386 1.799-2.4915 0-1.1936-.819-1.9458-1.3769-2.3153-.7825-.5163-1.6491-.6195-1.883-.6195H5.4682a8.7651 8.7651 0 014.907-2.7699l1.0974 1.151a.648.648 0 00.9182.0213l1.227-1.1743a8.7753 8.7753 0 016.0044 4.2762l-.8403 1.8982a.652.652 0 00.33.8585l1.6178.7188c.0283.2875.0425.577.0425.8717zm-9.3006-9.5993a.7128.7128 0 11.984 1.0316.7137.7137 0 01-.984-1.0316zm8.3389 6.71a.7107.7107 0 01.9395-.3625.7137.7137 0 11-.9405.3635z\"/></g>",
      "scala": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCECEB\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#DC322F\" d=\"M4.589 24c4.537 0 13.81-1.516 14.821-3v-5.729c-.957 1.408-10.284 2.912-14.821 2.912V24zM4.589 16.365c4.537 0 13.81-1.516 14.821-3V7.636c-.957 1.408-10.284 2.912-14.821 2.912v5.817zM4.589 8.729c4.537 0 13.81-1.516 14.821-3V0C18.453 1.408 9.126 2.912 4.589 2.912v5.817z\"/></g>",
      "shell": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#303642\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#7EE787\" d=\"M21.038,4.9l-7.577-4.498C13.009,0.134,12.505,0,12,0c-0.505,0-1.009,0.134-1.462,0.403L2.961,4.9 C2.057,5.437,1.5,6.429,1.5,7.503v8.995c0,1.073,0.557,2.066,1.462,2.603l7.577,4.497C10.991,23.866,11.495,24,12,24 c0.505,0,1.009-0.134,1.461-0.402l7.577-4.497c0.904-0.537,1.462-1.529,1.462-2.603V7.503C22.5,6.429,21.943,5.437,21.038,4.9z M15.17,18.946l0.013,0.646c0.001,0.078-0.05,0.167-0.111,0.198l-0.383,0.22c-0.061,0.031-0.111-0.007-0.112-0.085L14.57,19.29 c-0.328,0.136-0.66,0.169-0.872,0.084c-0.04-0.016-0.057-0.075-0.041-0.142l0.139-0.584c0.011-0.046,0.036-0.092,0.069-0.121 c0.012-0.011,0.024-0.02,0.036-0.026c0.022-0.011,0.043-0.014,0.062-0.006c0.229,0.077,0.521,0.041,0.802-0.101 c0.357-0.181,0.596-0.545,0.592-0.907c-0.003-0.328-0.181-0.465-0.613-0.468c-0.55,0.001-1.064-0.107-1.072-0.917 c-0.007-0.667,0.34-1.361,0.889-1.8l-0.007-0.652c-0.001-0.08,0.048-0.168,0.111-0.2l0.37-0.236 c0.061-0.031,0.111,0.007,0.112,0.087l0.006,0.653c0.273-0.109,0.511-0.138,0.726-0.088c0.047,0.012,0.067,0.076,0.048,0.151 l-0.144,0.578c-0.011,0.044-0.036,0.088-0.065,0.116c-0.012,0.012-0.025,0.021-0.038,0.028c-0.019,0.01-0.038,0.013-0.057,0.009 c-0.098-0.022-0.332-0.073-0.699,0.113c-0.385,0.195-0.52,0.53-0.517,0.778c0.003,0.297,0.155,0.387,0.681,0.396 c0.7,0.012,1.003,0.318,1.01,1.023C16.105,17.747,15.736,18.491,15.17,18.946z M19.143,17.859c0,0.06-0.008,0.116-0.058,0.145 l-1.916,1.164c-0.05,0.029-0.09,0.004-0.09-0.056v-0.494c0-0.06,0.037-0.093,0.087-0.122l1.887-1.129 c0.05-0.029,0.09-0.004,0.09,0.056V17.859z M20.459,6.797l-7.168,4.427c-0.894,0.523-1.553,1.109-1.553,2.187v8.833 c0,0.645,0.26,1.063,0.66,1.184c-0.131,0.023-0.264,0.039-0.398,0.039c-0.42,0-0.833-0.114-1.197-0.33L3.226,18.64 c-0.741-0.44-1.201-1.261-1.201-2.142V7.503c0-0.881,0.46-1.702,1.201-2.142l7.577-4.498c0.363-0.216,0.777-0.33,1.197-0.33 c0.419,0,0.833,0.114,1.197,0.33l7.577,4.498c0.624,0.371,1.046,1.013,1.164,1.732C21.686,6.557,21.12,6.411,20.459,6.797z\"/></g>",
      "solidity": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F0F0F0\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#363636\" d=\"M4.409 6.608L7.981.255l3.572 6.353H4.409zM8.411 0l3.569 6.348L15.552 0H8.411zm4.036 17.392l3.572 6.354 3.575-6.354h-7.147zm-.608-10.284h-7.43l3.715 6.605 3.715-6.605zm.428-.25h7.428L15.982.255l-3.715 6.603zM15.589 24l-3.569-6.349L8.448 24h7.141zm-3.856-6.858H4.306l3.712 6.603 3.715-6.603zm.428-.25h7.433l-3.718-6.605-3.715 6.605z\"/></g>",
      "sql": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#336791\"/><ellipse cx=\"10\" cy=\"5.5\" rx=\"5.8\" ry=\"2.1\" fill=\"#fff\"/><path fill=\"#fff\" fill-opacity=\".88\" d=\"M4.2 5.5v8.9c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1V5.5c0 1.2-2.6 2.1-5.8 2.1s-5.8-.9-5.8-2.1z\"/><path d=\"M4.2 9.2c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1M4.2 12.9c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1\" fill=\"none\" stroke=\"#336791\" stroke-opacity=\".7\" stroke-width=\".7\"/>",
      "svelte": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FFF0EB\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#FF3E00\" d=\"M10.354 21.125a4.44 4.44 0 0 1-4.765-1.767 4.109 4.109 0 0 1-.703-3.107 3.898 3.898 0 0 1 .134-.522l.105-.321.287.21a7.21 7.21 0 0 0 2.186 1.092l.208.063-.02.208a1.253 1.253 0 0 0 .226.83 1.337 1.337 0 0 0 1.435.533 1.231 1.231 0 0 0 .343-.15l5.59-3.562a1.164 1.164 0 0 0 .524-.778 1.242 1.242 0 0 0-.211-.937 1.338 1.338 0 0 0-1.435-.533 1.23 1.23 0 0 0-.343.15l-2.133 1.36a4.078 4.078 0 0 1-1.135.499 4.44 4.44 0 0 1-4.765-1.766 4.108 4.108 0 0 1-.702-3.108 3.855 3.855 0 0 1 1.742-2.582l5.589-3.563a4.072 4.072 0 0 1 1.135-.499 4.44 4.44 0 0 1 4.765 1.767 4.109 4.109 0 0 1 .703 3.107 3.943 3.943 0 0 1-.134.522l-.105.321-.286-.21a7.204 7.204 0 0 0-2.187-1.093l-.208-.063.02-.207a1.255 1.255 0 0 0-.226-.831 1.337 1.337 0 0 0-1.435-.532 1.231 1.231 0 0 0-.343.15L8.62 9.368a1.162 1.162 0 0 0-.524.778 1.24 1.24 0 0 0 .211.937 1.338 1.338 0 0 0 1.435.533 1.235 1.235 0 0 0 .344-.151l2.132-1.36a4.067 4.067 0 0 1 1.135-.498 4.44 4.44 0 0 1 4.765 1.766 4.108 4.108 0 0 1 .702 3.108 3.857 3.857 0 0 1-1.742 2.583l-5.589 3.562a4.072 4.072 0 0 1-1.135.499m10.358-17.95C18.484-.015 14.082-.96 10.9 1.068L5.31 4.63a6.412 6.412 0 0 0-2.896 4.295 6.753 6.753 0 0 0 .666 4.336 6.43 6.43 0 0 0-.96 2.396 6.833 6.833 0 0 0 1.168 5.167c2.229 3.19 6.63 4.135 9.812 2.108l5.59-3.562a6.41 6.41 0 0 0 2.896-4.295 6.756 6.756 0 0 0-.665-4.336 6.429 6.429 0 0 0 .958-2.396 6.831 6.831 0 0 0-1.167-5.168Z\"/></g>",
      "swift": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#f05138\" d=\"M126.33 34.06a39.32 39.32 0 00-.79-7.83 28.78 28.78 0 00-2.65-7.58 28.84 28.84 0 00-4.76-6.32 23.42 23.42 0 00-6.62-4.55 27.27 27.27 0 00-7.68-2.53c-2.65-.51-5.56-.51-8.21-.76H30.25a45.46 45.46 0 00-6.09.51 21.82 21.82 0 00-5.82 1.52c-.53.25-1.32.51-1.85.76a33.82 33.82 0 00-5 3.28c-.53.51-1.06.76-1.59 1.26a22.41 22.41 0 00-4.76 6.32 23.61 23.61 0 00-2.65 7.58 78.5 78.5 0 00-.79 7.83v60.39a39.32 39.32 0 00.79 7.83 28.78 28.78 0 002.65 7.58 28.84 28.84 0 004.76 6.32 23.42 23.42 0 006.62 4.55 27.27 27.27 0 007.68 2.53c2.65.51 5.56.51 8.21.76h63.22a45.08 45.08 0 008.21-.76 27.27 27.27 0 007.68-2.53 30.13 30.13 0 006.62-4.55 22.41 22.41 0 004.76-6.32 23.61 23.61 0 002.65-7.58 78.49 78.49 0 00.79-7.83V34.06z\"/><path fill=\"#fefefe\" d=\"M85 96.5c-11.11 6.13-26.38 6.76-41.75.47A64.53 64.53 0 0113.84 73a50 50 0 0010.85 6.32c15.87 7.1 31.73 6.61 42.9 0-15.9-11.66-29.4-26.82-39.46-39.2a43.47 43.47 0 01-5.29-6.82c12.16 10.61 31.5 24 38.38 27.79a271.77 271.77 0 01-27-32.34 266.8 266.8 0 0044.47 34.87c.71.38 1.26.7 1.7 1a32.7 32.7 0 001.21-3.51c3.71-12.89-.53-27.54-9.79-39.67C93.25 33.81 106 57.05 100.66 76.51c-.14.53-.29 1-.45 1.55l.19.22c10.59 12.63 7.68 26 6.35 23.5C101 91 90.37 94.33 85 96.5z\"/></svg></g>",
      "toml": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F6EEEA\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#9C4121\" d=\"M.014 0h5.34v2.652H2.888v18.681h2.468V24H.015V0Zm17.622 5.049v2.78h-4.274v12.935h-3.008V7.83H6.059V5.05h11.577ZM23.986 24h-5.34v-2.652h2.467V2.667h-2.468V0h5.34v24Z\"/></g>",
      "typescript": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#fff\" d=\"M22.67 47h99.67v73.67H22.67z\"/><path data-name=\"original\" fill=\"#007acc\" d=\"M1.5 63.91v62.5h125v-125H1.5zm100.73-5a15.56 15.56 0 017.82 4.5 20.58 20.58 0 013 4c0 .16-5.4 3.81-8.69 5.85-.12.08-.6-.44-1.13-1.23a7.09 7.09 0 00-5.87-3.53c-3.79-.26-6.23 1.73-6.21 5a4.58 4.58 0 00.54 2.34c.83 1.73 2.38 2.76 7.24 4.86 8.95 3.85 12.78 6.39 15.16 10 2.66 4 3.25 10.46 1.45 15.24-2 5.2-6.9 8.73-13.83 9.9a38.32 38.32 0 01-9.52-.1 23 23 0 01-12.72-6.63c-1.15-1.27-3.39-4.58-3.25-4.82a9.34 9.34 0 011.15-.73L82 101l3.59-2.08.75 1.11a16.78 16.78 0 004.74 4.54c4 2.1 9.46 1.81 12.16-.62a5.43 5.43 0 00.69-6.92c-1-1.39-3-2.56-8.59-5-6.45-2.78-9.23-4.5-11.77-7.24a16.48 16.48 0 01-3.43-6.25 25 25 0 01-.22-8c1.33-6.23 6-10.58 12.82-11.87a31.66 31.66 0 019.49.26zm-29.34 5.24v5.12H56.66v46.23H45.15V69.26H28.88v-5a49.19 49.19 0 01.12-5.17C29.08 59 39 59 51 59h21.83z\"/></svg></g>",
      "vue": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECF8F3\" stroke=\"#D5EAE0\" stroke-width=\".5\"/><path fill=\"#41B883\" d=\"M3.5 5h3.2l3.3 5.7L13.3 5h3.2L10 16z\"/><path fill=\"#35495E\" d=\"M6.7 5H9l1 1.8L11 5h2.3L10 10.7z\"/>",
      "wasm": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#654ff0\" d=\"M.223.222v127.555h127.555V.222H78.594c.014.227.036.455.036.686 0 8.08-6.55 14.626-14.63 14.626-8.078 0-14.625-6.546-14.625-14.626 0-.231.022-.459.031-.686zm29.595 68.746h8.445l5.782 30.738h.107l6.968-30.738h7.908l6.265 31.119h.106l6.597-31.119h8.284l-10.765 45.156H61.12l-6.213-30.738H54.8l-6.7 30.738h-8.557zm59.994 0h13.334l13.284 45.156h-8.77l-2.879-10.051H89.59l-2.212 10.05h-8.5ZM94.895 80.1l-3.684 16.57h11.473L98.448 80.1Z\"/></svg></g>",
      "xml": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EAF3FA\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#005FAD\" d=\"M4.345 7.053c-.495.02-.44.725-.536 1.081-.157.583-.3 1.325-.347 1.926-.046.585-.008 1.127.066 1.719.058.46.191.767.07.89-.108.11-3.216 2.962-3.466 3.123-.26.169-.08.584.069.817.157.246.23.373.557.33.306-.042.405-.409.583-.606.228-.252 2.421-2.401 2.616-2.401.077.544.367 1.064.67 1.513.15.222.314.439.505.629.175.175.4.317.587.45.44.024.795-.301.35-.67-.17-.14-.735-.971-.927-1.43-.18-.43-.574-1.076-.146-1.428 1.494-1.23 3.72-2.262 4.247-2.313-.257 1.024-1.356 3.048-1.757 4.012-.14.333-.231.732-.185 1.094.055.434.383.774.587.806.417-.023.7-.387.946-.645.343-.357.634-.685.974-1.043.339-.356.672-.731.971-1.07.184-.207.674-.713.963-.713-.11.693-.716 1.552-.839 2.254-.125.716.531 1.596 1.217.956.623-.58 1.255-1.129 1.867-1.72.217-.208.175.037.224.242.05.208.176.91.275 1.1.18.346.496.592.897.598.362.006.727-.161.982-.414.19-.187.513-.699.154-.832-.23-.086-.217-.176-.495-.129-.172.029-.362.074-.507.179-.367-.003-.381-.89-.324-1.161.068-.327.207-.659.185-.998-.026-.418-.478-.69-.582-.72-.156-.076-.253.023-.458.212-.173.161-.363.332-.535.495-.34.322-.768.813-.942.813.305-.705.708-2.652-.643-2.48-.563.071-.95.377-1.394.71-.29.28-.683.641-.936.87-.236.216-.371.404-.496.404.132-.747 1.685-3.167.885-3.853-.158-.136-.313-.325-.515-.349a4.637 4.637 0 0 0-.833.19c-.565.18-2.78 1.28-4.19 2.289-.131.094-.214-.085-.231-.29-.087-1.058.199-2.19.496-3.188.208-.696-.557-1.225-.659-1.249zm18.177.874c-.166.364-.2.894-.248 1.319a24.307 24.307 0 0 0-1.246-.115c.238.296.691.588 1.056.724-.048.366-.434.67-.599 1.021.458-.127.676-.47.989-.821.362.22.791.627 1.26.636-.177-.376-.334-.695-.658-.966.269-.175.717-.362.924-.633-.345-.074-.718-.093-1.052-.015-.258-.284-.3-.772-.426-1.15zm-2.92.079c-.23.02-.613.49-.832.773-.807 1.039-1.542 3.15-1.661 3.542-.363 1.195-.502 2.672.28 3.722.456.612 1.258.66 2.041.434.405-.116.812-.406.95-.723.114-.263.174-.753-.404-.38-.224.145-.634.304-1.37.291-.247-.004-.651-.357-.76-.722-.192-.595-.11-1.393-.11-1.393.167-1.028.642-2.146 1.061-3.076.163-.36.658-1.259.842-1.546 0 0 .239-.373.131-.77-.031-.116-.091-.16-.168-.152zm3.072 2.976c-.12.264-.144.648-.18.956-.274-.031-.63-.066-.904-.083.172.215.501.426.766.525-.034.265-.314.486-.434.741.332-.092.49-.34.717-.596.263.16.575.456.914.462-.127-.273-.242-.504-.477-.701.195-.127.52-.262.67-.46a1.77 1.77 0 0 0-.763-.01c-.187-.206-.217-.56-.309-.834zm-1.123 2.422c-.083.183-.1.449-.125.662a12.6 12.6 0 0 0-.624-.058c.119.148.346.295.53.363-.025.184-.219.336-.301.513.23-.064.339-.236.496-.413.181.11.397.316.632.32-.088-.19-.168-.349-.33-.485.135-.087.36-.181.463-.317a1.22 1.22 0 0 0-.527-.008c-.13-.142-.151-.387-.214-.576z\"/></g>",
      "yaml": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCEEEF\" stroke=\"#F0D8DB\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\">\n<polygon transform=\"matrix(.24805 0 0 .24805 .5 5.6287)\" points=\"87.702 137.67 0 0 63.25 0 119.02 88.646 175.24 0 235.79 0 143.98 137.67 143.98 224.95 87.702 224.95\"/>\n<path d=\"m82.428 49.149h-25.266l-5.1388 12.408h-11.188l23.659-55.798h11.444l22.699 55.798h-11.956l-4.2525-12.408zm-4.197-11.14-7.7455-20.476-8.6412 20.476z\" fill=\"#cb171e\"/>\n<polygon transform=\"matrix(.24805 0 0 .24805 .5 5.6287)\" points=\"87.701 250.18 87.701 470.65 135 470.65 135 318.57 184.51 420.79 221.74 420.79 272.94 314.98 272.94 470.6 318.32 470.6 318.32 250.18 256.36 250.18 201.38 349.88 149.02 250.18\"/>\n<polygon transform=\"matrix(.24805 0 0 .24805 .5 5.6287)\" points=\"512 422.74 512 422.74 395.64 422.74 395.64 250.12 347.44 250.12 347.44 469.65 512 469.65\"/>\n</svg>",
      "zig": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FFF4DF\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#E18A00\" d=\"m23.53 1.02-7.686 3.45h-7.06l-2.98 3.452h7.173L.47 22.98l7.681-3.607h7.065v-.002l2.978-3.45-7.148-.001 12.482-14.9zM0 4.47v14.901h1.883l2.98-3.45H3.451v-8h.942l2.824-3.45H0zm22.117 0-2.98 3.608h1.412v7.844h-.942l-2.98 3.45H24V4.47h-1.883z\"/></g>",
    }

    // The directory glyphs. The built-in file tree does NOT draw a folder through
    // FileTypeIcon (whose folder kind is the amber card): FilesBody renders the
    // product’s own outline folder — IconFolderCloseRegular / IconFolderOpenRegular
    // — so those two artworks are sourced here as well. Paths only; the stroke /
    // fill / opacity semantics live in the module below the markers.
    var FOLDER_CLOSE_D = [
      "M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z",
      "M3.63501 7.66614H12.3647",
    ]

    var FOLDER_OPEN_D = [
      "M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z",
      "M13.6491 6.69446C14.6346 6.69453 15.3522 7.62895 15.0983 8.58118L13.9245 12.9845C13.7494 13.6412 13.1539 14.0988 12.4743 14.0988H2.35126C1.36574 14.0988 0.648153 13.1643 0.902044 12.212L2.07587 7.80774C2.25102 7.15128 2.84567 6.69455 3.52509 6.69446H13.6491ZM3.52509 7.69446C3.29865 7.69455 3.10004 7.84674 3.04169 8.06555L1.86786 12.4698C1.78345 12.7872 2.02285 13.0988 2.35126 13.0988H12.4743C12.7007 13.0988 12.8992 12.9463 12.9577 12.7277L14.1325 8.32336C14.2171 8.00598 13.9776 7.69453 13.6491 7.69446H3.52509Z",
      "M4.7666 1.90137C5.13227 1.90144 5.48571 2.03525 5.75977 2.27734L7.27246 3.61328C7.36379 3.69382 7.48174 3.73828 7.60352 3.73828H12.3994C13.2276 3.73841 13.8993 4.41005 13.8994 5.23828V6.7168C13.8183 6.70327 13.735 6.69436 13.6494 6.69434H12.8994V5.23828C12.8993 4.96233 12.6754 4.73841 12.3994 4.73828H7.60352C7.23781 4.73828 6.88446 4.60438 6.61035 4.3623L5.09766 3.02637C5.00636 2.94576 4.88838 2.90144 4.7666 2.90137H2.0498C1.77366 2.90137 1.5498 3.12523 1.5498 3.40137V9.78223L0.902344 12.2119C0.648452 13.1642 1.36604 14.0986 2.35156 14.0986H2.0498C1.2214 14.0986 0.549838 13.427 0.549805 12.5986V3.40137C0.549805 2.57294 1.22138 1.90137 2.0498 1.90137H4.7666Z",
    ]

    // ── END GENERATED ARTWORK ─────────────────────────────────────────────

    // ── File cards ────────────────────────────────────────────────────────────
    // The card outline, its folded corner, and a spread of card kinds. All paths
    // are on the primitives' 28×28 grid; the renderers scale to the row size.

    var FILE_BODY_D = 'M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z';
    var FILE_FOLD_D = 'M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z';
    // The mark sits on top of the card, scaled up a little so it reads at 16px.
    // Text marks (MD / PDF / PPT / W) get the larger scale because their glyph is
    // already drawn small inside its own box.
    var FILE_MARK_TRANSFORM = 'translate(14 16) scale(1.12) translate(-14 -16)';
    var FILE_LARGE_MARK_TRANSFORM = 'translate(14 16) scale(1.22) translate(-14 -16)';
    // CSS custom property carrying the card kind's colour; the stylesheet sets it
    // per kind class. Kept as a var() so a caller can retint one icon.
    var FILE_ICON_COLOR = 'var(--dsh-file-type-icon-color, var(--dsh-file-type-default-color))';

    var CARD_MD_D = 'M8.7588 19.5V14.6H9.8998L11.9298 17.932H11.3278L13.3018 14.6H14.4428L14.4568 19.5H13.1828L13.1688 16.539H13.3858L11.9088 19.017H11.2928L9.7738 16.539H10.0398V19.5H8.7588ZM15.4375 19.5V14.6H17.7545C18.2958 14.6 18.7718 14.7003 19.1825 14.901C19.5932 15.1017 19.9128 15.384 20.1415 15.748C20.3748 16.112 20.4915 16.546 20.4915 17.05C20.4915 17.5493 20.3748 17.9833 20.1415 18.352C19.9128 18.716 19.5932 18.9983 19.1825 19.199C18.7718 19.3997 18.2958 19.5 17.7545 19.5H15.4375ZM16.8235 18.394H17.6985C17.9785 18.394 18.2212 18.3427 18.4265 18.24C18.6365 18.1327 18.7998 17.9787 18.9165 17.778C19.0332 17.5727 19.0915 17.33 19.0915 17.05C19.0915 16.7653 19.0332 16.5227 18.9165 16.322C18.7998 16.1213 18.6365 15.9697 18.4265 15.867C18.2212 15.7597 17.9785 15.706 17.6985 15.706H16.8235V18.394Z';
    var CARD_PDF_D = 'M6.80616 19.5V14.6H9.04616C9.49416 14.6 9.87916 14.6723 10.2012 14.817C10.5278 14.9617 10.7798 15.1717 10.9572 15.447C11.1345 15.7177 11.2232 16.0397 11.2232 16.413C11.2232 16.7817 11.1345 17.1013 10.9572 17.372C10.7798 17.6427 10.5278 17.8527 10.2012 18.002C9.87916 18.1467 9.49416 18.219 9.04616 18.219H7.57616L8.19216 17.617V19.5H6.80616ZM8.19216 17.764L7.57616 17.127H8.96216C9.2515 17.127 9.46616 17.064 9.60616 16.938C9.75083 16.812 9.82316 16.637 9.82316 16.413C9.82316 16.1843 9.75083 16.007 9.60616 15.881C9.46616 15.755 9.2515 15.692 8.96216 15.692H7.57616L8.19216 15.055V17.764ZM11.8989 19.5V14.6H14.2159C14.7573 14.6 15.2333 14.7003 15.6439 14.901C16.0546 15.1017 16.3743 15.384 16.6029 15.748C16.8363 16.112 16.9529 16.546 16.9529 17.05C16.9529 17.5493 16.8363 17.9833 16.6029 18.352C16.3743 18.716 16.0546 18.9983 15.6439 19.199C15.2333 19.3997 14.7573 19.5 14.2159 19.5H11.8989ZM13.2849 18.394H14.1599C14.4399 18.394 14.6826 18.3427 14.8879 18.24C15.0979 18.1327 15.2613 17.9787 15.3779 17.778C15.4946 17.5727 15.5529 17.33 15.5529 17.05C15.5529 16.7653 15.4946 16.5227 15.3779 16.322C15.2613 16.1213 15.0979 15.9697 14.8879 15.867C14.6826 15.7597 14.4399 15.706 14.1599 15.706H13.2849V18.394ZM17.6821 19.5V14.6H21.5251V15.671H19.0681V19.5H17.6821ZM18.9701 17.82V16.749H21.2311V17.82H18.9701Z';
    var CARD_PPT_D = 'M11.0132 20.5V13.5H14.2132C14.8532 13.5 15.4032 13.6033 15.8632 13.81C16.3299 14.0167 16.6899 14.3167 16.9432 14.71C17.1966 15.0967 17.3232 15.5567 17.3232 16.09C17.3232 16.6167 17.1966 17.0733 16.9432 17.46C16.6899 17.8467 16.3299 18.1467 15.8632 18.36C15.4032 18.5667 14.8532 18.67 14.2132 18.67H12.1132L12.9932 17.81V20.5H11.0132ZM12.9932 18.02L12.1132 17.11H14.0932C14.5066 17.11 14.8132 17.02 15.0132 16.84C15.2199 16.66 15.3232 16.41 15.3232 16.09C15.3232 15.7633 15.2199 15.51 15.0132 15.33C14.8132 15.15 14.5066 15.06 14.0932 15.06H12.1132L12.9932 14.15V18.02Z';
    var CARD_WORD_D = 'M10.5118 20.5L8.24179 13.5H10.2818L12.1918 19.56H11.1618L13.1718 13.5H14.9918L16.8918 19.56H15.9018L17.8718 13.5H19.7618L17.4918 20.5H15.3718L13.7518 15.35H14.3218L12.6318 20.5H10.5118Z';

    /** The full-colour brand glyphs (CODE_ICON_ART keys), as a lookup set. */
    function isCodeIconType(type) {
      return Object.prototype.hasOwnProperty.call(CODE_ICON_ART, type)
    }

    /** The card kinds that carry a drawn mark on top of the card. */
    var CARD_MARKS = {
      code: { d: [
        'M10.0053 13.126L7.0236 16.3788C6.96052 16.4476 6.96052 16.5532 7.0236 16.622L10.0053 19.8748',
        'M17.9941 13.126L20.9759 16.3788C21.039 16.4476 21.039 16.5532 20.9759 16.622L17.9941 19.8748',
        'M15.2652 12.957L12.7344 20.0433',
      ], stroke: true },
      html: { d: [
        'M13.9994 9.68298C17.212 9.68298 19.8167 12.2872 19.8168 15.4997C19.8168 18.7123 17.2121 21.3171 13.9994 21.3171C10.7869 21.3169 8.18274 18.7122 8.18274 15.4997C8.1829 12.2873 10.787 9.68315 13.9994 9.68298ZM9.26213 16.0247C9.47025 17.9241 10.7936 19.4876 12.5639 20.0463C12.42 19.7977 12.2952 19.5152 12.1879 19.2116C11.885 18.3541 11.693 17.2434 11.6424 16.0247H9.26213ZM16.3565 16.0247C16.3059 17.2434 16.1145 18.3542 15.8116 19.2116C15.7044 19.5151 15.5788 19.7971 15.435 20.0456C17.2054 19.487 18.5293 17.9242 18.7374 16.0247H16.3565ZM12.6938 16.0247C12.7439 17.1459 12.9212 18.1334 13.1784 18.8616C13.332 19.2962 13.503 19.61 13.6686 19.805C13.834 19.9996 13.9473 20.0256 13.9994 20.0258C14.0514 20.0258 14.1651 20.0002 14.331 19.805C14.4966 19.61 14.6676 19.2962 14.8211 18.8616C15.0784 18.1334 15.2557 17.1459 15.3058 16.0247H12.6938ZM13.9994 10.733C13.9473 10.7331 13.834 10.7598 13.6686 10.9545C13.503 11.1494 13.3319 11.4633 13.1784 11.8978C12.903 12.6777 12.7188 13.7545 12.6849 14.9747H15.3147C15.2808 13.7545 15.0966 12.6777 14.8211 11.8978C14.6676 11.4633 14.4965 11.1494 14.331 10.9545C14.1651 10.7593 14.0514 10.733 13.9994 10.733ZM15.5888 11.0051C15.6701 11.1756 15.7444 11.3576 15.8116 11.5478C16.1343 12.4613 16.3308 13.6619 16.3647 14.9747H18.7374C18.5352 13.1307 17.2817 11.6036 15.5888 11.0051ZM12.4101 11.0051C10.7174 11.6037 9.46428 13.1308 9.26213 14.9747H11.6349C11.6688 13.6619 11.8652 12.4613 12.1879 11.5478C12.2551 11.3577 12.3288 11.1756 12.4101 11.0051Z',
      ], evenodd: true },
      image: { d: [
        'M10.4212 15.9204C10.5756 15.6558 10.9579 15.6558 11.1123 15.9204L13.6493 20.2696C13.8048 20.5362 13.6125 20.8711 13.3037 20.8711H8.22974C7.92102 20.8711 7.72868 20.5362 7.88423 20.2696L10.4212 15.9204Z',
        'M15.4981 13.186C15.6505 12.9117 16.0451 12.9117 16.1975 13.186L20.1368 20.2769C20.2849 20.5435 20.0922 20.8711 19.7872 20.8711H11.9084C11.6034 20.8711 11.4107 20.5435 11.5588 20.2769L15.4981 13.186Z',
        'M11.8603 11.3997C11.8603 12.286 11.1418 13.0045 10.2555 13.0045C9.36924 13.0045 8.65076 12.286 8.65076 11.3997C8.65076 10.5134 9.36924 9.79492 10.2555 9.79492C11.1418 9.79492 11.8603 10.5134 11.8603 11.3997Z',
      ] },
      video: { d: [
        'M17.5 14.634C18.1667 15.0189 18.1667 15.9811 17.5 16.366L11.5 19.8301C10.8333 20.215 10 19.7339 10 18.9641L10 12.0359C10 11.2661 10.8333 10.785 11.5 11.1699L17.5 14.634Z',
      ] },
      markdown: { d: [CARD_MD_D], large: true },
      pdf: { d: [CARD_PDF_D], large: true },
      ppt: { d: [CARD_PPT_D], large: true },
      word: { d: [CARD_WORD_D], large: true },
    };

    // The spreadsheet mark is its own glyph in the primitives (a stroked grid, not
    // a filled mark), which is why it is not in CARD_MARKS above.
    var CARD_EXCEL_D = 'M14 11.5H11.4C10.5599 11.5 10.1399 11.5 9.81901 11.6635C9.53677 11.8073 9.3073 12.0368 9.16349 12.319C9 12.6399 9 13.0599 9 13.9V16.5M14 11.5H16.6C17.4401 11.5 17.8601 11.5 18.181 11.6635C18.4632 11.8073 18.6927 12.0368 18.8365 12.319C19 12.6399 19 13.0599 19 13.9V16.5M14 11.5V21.5M14 21.5H16.6C17.4401 21.5 17.8601 21.5 18.181 21.3365C18.4632 21.1927 18.6927 20.9632 18.8365 20.681C19 20.3601 19 19.9401 19 19.1V16.5M14 21.5H11.4C10.5599 21.5 10.1399 21.5 9.81901 21.3365C9.53677 21.1927 9.3073 20.9632 9.16349 20.681C9 20.3601 9 19.9401 9 19.1V16.5M19 16.5H9';

    /** Every card kind, so the stylesheet and the checkers can both enumerate it. */
    var CARD_KINDS = ['code', 'excel', 'folder', 'html', 'image', 'markdown', 'other', 'pdf', 'ppt', 'video', 'word'];

    // ── Classification ────────────────────────────────────────────────────────
    // Same tables and same precedence as the built-in classifier: code filename
    // rules first, then well-known names, then extensions, then 'other'. Copies
    // rather than a dependency because the plugin must load in a shell that does
    // not expose the client runtime to plugins.

    var EXTENSION_CARD_TYPES = {
      scss: 'code', sass: 'code', less: 'code', vue: 'code', svelte: 'code', astro: 'code', bat: 'code', cmd: 'code',
      csv: 'excel', tsv: 'excel',
      html: 'html', htm: 'html',
      png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', avif: 'image',
      bmp: 'image', ico: 'image', tif: 'image', tiff: 'image', heic: 'image', heif: 'image',
      md: 'markdown', mdx: 'markdown', markdown: 'markdown',
      pdf: 'pdf',
      ppt: 'ppt', pptx: 'ppt', key: 'ppt',
      mp4: 'video', mov: 'video', m4v: 'video', webm: 'video', mkv: 'video', avi: 'video', mpg: 'video', mpeg: 'video',
      doc: 'word', docx: 'word', rtf: 'word', odt: 'word', pages: 'word',
      xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlsb: 'excel', xlt: 'excel', xltx: 'excel', xltm: 'excel',
      ods: 'excel', ots: 'excel', fods: 'excel', numbers: 'excel',
    };

    var NAME_CARD_TYPES = { changelog: 'markdown', contributing: 'markdown', readme: 'markdown' };

    var FILENAME_CODE_TYPES = {
      '.bash_profile': 'shell', '.bashrc': 'shell', '.env': 'env',
      '.gitattributes': 'git', '.gitconfig': 'git', '.gitignore': 'git', '.gitmodules': 'git', '.mailmap': 'git',
      '.profile': 'shell', '.zprofile': 'shell', '.zshrc': 'shell',
      bsdmakefile: 'makefile', 'cmakelists.txt': 'cmake', commit_editmsg: 'git',
      'compose.yaml': 'docker', 'compose.yml': 'docker', 'docker-compose.yaml': 'docker', 'docker-compose.yml': 'docker',
      dockerfile: 'docker', gemfile: 'ruby', gnumakefile: 'makefile', guardfile: 'ruby', makefile: 'makefile',
      'npm-shrinkwrap.json': 'node', 'package-lock.json': 'node', 'package.json': 'node', podfile: 'ruby', rakefile: 'ruby',
    };

    var FILENAME_CODE_PREFIXES = [['dockerfile.', 'docker'], ['.env.', 'env']];

    var FILENAME_CODE_SUFFIXES = [
      ['.component.ts', 'angular'], ['.component.html', 'angular'], ['.directive.ts', 'angular'],
      ['.service.ts', 'angular'], ['.module.ts', 'angular'], ['.pipe.ts', 'angular'], ['.guard.ts', 'angular'],
      ['.interceptor.ts', 'angular'], ['.dockerfile', 'docker'],
    ];

    var EXTENSION_CODE_TYPES = {
      bash: 'shell', c: 'c', 'c++': 'cpp', cc: 'cpp', cfg: 'ini', cjs: 'javascript',
      clj: 'clojure', cljc: 'clojure', cljs: 'clojure', cmake: 'cmake', cpp: 'cpp', cs: 'csharp', csh: 'shell',
      css: 'css', csx: 'csharp', cts: 'typescript', cxx: 'cpp', dart: 'dart', dtd: 'xml', edn: 'clojure', env: 'env',
      erl: 'erlang', es6: 'javascript', escript: 'erlang', ex: 'elixir', exs: 'elixir', fish: 'shell',
      gemspec: 'ruby', go: 'go', gql: 'graphql', graphql: 'graphql',
      h: 'c', 'h++': 'cpp', hh: 'cpp', hpp: 'cpp', hrl: 'erlang', hs: 'haskell', hxx: 'cpp',
      ini: 'ini', ipp: 'cpp', java: 'java', js: 'javascript',
      json: 'json', json5: 'json', jsonc: 'json', jsx: 'react',
      ksh: 'shell', kt: 'kotlin', kts: 'kotlin', lhs: 'haskell', lua: 'lua',
      m: 'objective-c', mak: 'makefile', mjs: 'javascript', mk: 'makefile', mm: 'objective-c', mts: 'typescript',
      node: 'node', pch: 'objective-c', php: 'php', php3: 'php', php4: 'php', php5: 'php', phps: 'php', phtml: 'php',
      pl: 'perl', plist: 'xml', pm: 'perl', pod: 'perl', proto: 'protobuf',
      ps1: 'powershell', psd1: 'powershell', psm1: 'powershell',
      py: 'python', pyi: 'python', pyw: 'python', pyx: 'python',
      r: 'r', rake: 'ruby', rb: 'ruby', rmd: 'r', rs: 'rust',
      sc: 'scala', scala: 'scala', sh: 'shell', sol: 'solidity', sql: 'sql', svelte: 'svelte', swift: 'swift',
      t: 'perl', tcsh: 'shell', toml: 'toml', tpp: 'cpp',
      ts: 'typescript', tsx: 'react', vue: 'vue', wasm: 'wasm', wast: 'wasm', wat: 'wasm',
      xml: 'xml', xsd: 'xml', xsl: 'xml', xslt: 'xml', yaml: 'yaml', yml: 'yaml', zig: 'zig', zsh: 'shell',
    };

    function fileBaseName(path) {
      var s = String(path == null ? '' : path);
      return s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1);
    }

    /** Resolve the brand code type for a path, or null when it is not a code file. */
    function codeIconType(path) {
      var name = fileBaseName(path).toLowerCase();
      var ext = fileExt(name).toLowerCase();
      // Filename rules beat extension rules, exactly as the built-in classifier:
      // 'package.json' is the Node hexagon, not the JSON logo.
      for (var i = 0; i < FILENAME_CODE_SUFFIXES.length; i++) {
        if (name.slice(-FILENAME_CODE_SUFFIXES[i][0].length) === FILENAME_CODE_SUFFIXES[i][0]) {
          return FILENAME_CODE_SUFFIXES[i][1];
        }
      }
      for (var j = 0; j < FILENAME_CODE_PREFIXES.length; j++) {
        if (name.slice(0, FILENAME_CODE_PREFIXES[j][0].length) === FILENAME_CODE_PREFIXES[j][0]) {
          return FILENAME_CODE_PREFIXES[j][1];
        }
      }
      if (FILENAME_CODE_TYPES[name]) return FILENAME_CODE_TYPES[name];
      return EXTENSION_CODE_TYPES[ext] || null;
    }

    /**
     * The icon a path gets. Returns a brand type name (a CODE_ICON_ART key) for a
     * code file, otherwise one of CARD_KINDS for a file card. 'folder' is never
     * returned: callers that own directory rows use the folder glyphs directly.
     */
    function fileIconType(path) {
      var code = codeIconType(path);
      if (code) return code;
      var name = fileBaseName(path).toLowerCase();
      var ext = fileExt(name).toLowerCase();
      return NAME_CARD_TYPES[name] || EXTENSION_CARD_TYPES[ext] || 'other';
    }

    /** The colour-carrying class segment for a resolved type. */
    function cardKindOf(type) {
      return isCodeIconType(type) ? 'code' : (type === 'folder' ? 'folder' : type);
    }

    // ── Renderer-agnostic icon descriptions ───────────────────────────────────
    // Each helper returns plain data, not DOM and not React elements. That is what
    // lets one shared module feed both renderers without either one importing the
    // other: the React tree maps 'parts' to elements, the popout page maps them to
    // 'document.createElementNS'. Both therefore draw the same geometry because
    // there is only one description of it.

    /** Whether a path gets a brand code glyph rather than a file card. */
    function isCodeIconPath(path) {
      return isCodeIconType(fileIconType(path));
    }

    /**
     * The file card for a path: body + folded corner + the kind's mark.
     * 'type' is the resolved icon type (see fileIconType).
     */
    function fileCardParts(type) {
      var parts = [
        { d: FILE_BODY_D, fill: FILE_ICON_COLOR },
        // The corner is drawn in the page background so the fold reads as a fold.
        // At 'other' weight it is the muted neutral, matching the built-in card.
        type === 'other'
          ? { d: FILE_FOLD_D, fill: 'var(--dsw-static-neutral-400, #a2a4a6)' }
          : { d: FILE_FOLD_D, fill: 'var(--dsw-static-neutral-00, #fff)', fillOpacity: '0.7' },
      ];
      if (type === 'excel') {
        // The spreadsheet mark is stroked, and sits on the card at its own scale.
        parts.push({ d: CARD_EXCEL_D, stroke: 'var(--dsw-static-neutral-00, #fff)', strokeWidth: '1.2' });
        return parts;
      }
      var mark = CARD_MARKS[type];
      if (!mark) return parts; // 'folder' and unknown kinds are a bare card
      for (var i = 0; i < mark.d.length; i++) {
        var p = { d: mark.d[i], fill: 'var(--dsw-static-neutral-00, #fff)' };
        if (mark.stroke) { p.fill = null; p.stroke = 'var(--dsw-static-neutral-00, #fff)'; p.strokeWidth = '1.35'; }
        if (mark.evenodd) { p.fillRule = 'evenodd'; p.clipRule = 'evenodd'; }
        parts.push(p);
      }
      return parts;
    }

    /** A mark's transform on the card, so the mark scales with the card kind. */
    function cardMarkTransform(type) {
      // NULL for 'code' and 'excel', and that is the built-in's behaviour, not an
      // omission: the primitives wrap a mark in a transformed <g> only for the
      // picture marks (1.12) and the four text marks (1.22) — the code chevrons and
      // the spreadsheet grid are drawn at their authored size. Applying the default
      // transform to those two moves them ~1px at 16px, which is exactly the kind of
      // near-miss a "looks the same to me" review passes.
      if (type === 'code' || type === 'excel') return null;
      var mark = CARD_MARKS[type];
      return mark && mark.large ? FILE_LARGE_MARK_TRANSFORM : FILE_MARK_TRANSFORM;
    }

    // ── Directory glyphs ──────────────────────────────────────────────────────
    // A directory is NOT a file card. The built-in file tree draws the product's own
    // outline folder — FilesBody renders IconFolderCloseRegular / IconFolderOpenRegular
    // and tints them var(--dsw-alias-label-tertiary) — while FileTypeIcon's 'folder'
    // kind (the amber card) is a different call site that this tree never reaches.
    // The geometry is generated from the install; the stroke / fill / opacity
    // semantics that turn those paths into the two pictures live here, because that
    // is what the two renderers must share.

    /** Paths + paint for a directory glyph: 'open' picks the open/closed artwork. */
    function folderGlyphParts(open) {
      var ds = open ? FOLDER_OPEN_D : FOLDER_CLOSE_D;
      var parts = [];
      for (var i = 0; i < ds.length; i++) {
        if (!open) {
          // The closed folder is stroke-only, one 1px line per path — and the
          // horizontal line is the *fold*, so it must stay a separate stroke.
          parts.push({ d: ds[i], stroke: 'currentColor', strokeWidth: '1' });
          continue;
        }
        // The open folder is filled: the front panel is the translucent one.
        parts.push(i === 0
          ? { d: ds[i], fill: 'currentColor', opacity: '0.16' }
          : { d: ds[i], fill: 'currentColor' });
      }
      return parts;
    }

    /**
     * Describe the icon for a path, for either renderer.
     *
     * Returns '{ tier, type, kind, art?, parts?, markTransform? }':
     *   * 'tier === 'code''  → 'art' is the brand markup, with CODE_ICON_ID_TOKEN
     *     still in place; the renderer stamps a unique id and inlines it.
     *   * 'tier === 'card''  → 'parts' is the card's path list.
     * 'kind' is the stylesheet class segment (see cardKindOf) that carries the
     * category colour, and 'type' is the exact resolved type for assertions.
     */
    function iconGlyph(path) {
      var type = fileIconType(path);
      if (isCodeIconType(type)) {
        return { tier: 'code', type: type, kind: 'code', art: CODE_ICON_ART[type] };
      }
      return {
        tier: 'card',
        type: type,
        kind: cardKindOf(type),
        // Not part of the card: the mark's group transform, applied by the renderer.
        markTransform: cardMarkTransform(type),
        mark: (function () {
          if (type === 'excel') return true;
          return !!CARD_MARKS[type];
        })(),
        parts: fileCardParts(type),
      };
    }


              // Office documents (.docx / .xlsx / .pptx) — reading them offline.
    //
    // Three vendored libraries do the parsing, each served by this plugin's own
    // asset routes (see the /dsh-sidebar-frog/office/* routes in src/host/routes.js),
    // so an Office file is read without a network round trip and never leaves the
    // machine:
    //
    //   · docx-preview + JSZip   → WordprocessingML → DOM pages   (Apache-2.0)
    //   · SheetJS (xlsx)         → SpreadsheetML    → a real grid  (Apache-2.0)
    //   · @aiden0z/pptx-renderer → PresentationML   → slides       (Apache-2.0)
    //
    // This module is the part BOTH halves of the plugin share: the React preview
    // inside the shell and the standalone popout page mount the same widget with the
    // same teardown discipline, so a .docx cannot look — or leak — different in the
    // two windows. That is also why the widget builds its own chrome (sheet tabs,
    // slide navigation) here rather than in either caller: chrome written twice is
    // chrome that drifts.
    //
    // Portable JS on purpose (var/function, no template literals, no interpolation,
    // no script-end marker): this file is spliced verbatim into the client bundle AND the
    // popout page's inline <script> (see scripts/build.js, and the embedding-hazard
    // guard in scripts/check.js that reads src/shared/*.js off disk).

    // Which suffixes this module can actually draw. The set is deliberately short:
    // a suffix belongs here only once a vendored reader exists for it, because
    // .doc / .odt / .rtf (see EXT_DOC in src/shared/ext.js) still take the
    // panel's binary-document card and its hand-off — claiming them here would turn
    // an honest "this container is not text" into a renderer that fails.
    var OFFICE_KINDS = { docx: 1, xlsx: 1, pptx: 1 };

    function officeKind(path) {
      var ext = fileExt(path);
      return OFFICE_KINDS[ext] ? ext : '';
    }

    function officeKindLabel(kind) {
      if (kind === 'docx') return 'Word 文档';
      if (kind === 'xlsx') return 'Excel 工作簿';
      if (kind === 'pptx') return 'PowerPoint 演示';
      return 'Office 文档';
    }

    // ── Assets ────────────────────────────────────────────────────────────────
    // Public library code, served without the cookie fence (like the pdf.js /
    // MathJax / Mermaid assets): none of it reveals anything about the workspace.
    var OFFICE_ASSETS = {
      jszip: '/dsh-sidebar-frog/office/jszip.min.js',
      docx: '/dsh-sidebar-frog/office/docx-preview.min.js',
      xlsx: '/dsh-sidebar-frog/office/xlsx.full.min.js',
      // An ES module: docx-preview and SheetJS ship UMD builds, this one does not,
      // so it is reached with a dynamic import() — same origin, same script-src.
      pptx: '/dsh-sidebar-frog/office/pptx-renderer.es.js',
    };

    // The whole-file ceiling. The shell's own document preview refuses a complete
    // read past its own cap and says so; this is the same kind of line for the
    // panel's side (which fetches bytes from /media itself, and /media serves up to
    // 25 MB in one response anyway).
    var OFFICE_MAX_FILE = 24 * 1024 * 1024;
    // The EXPANSION ceiling, and the reason it exists: a .docx is a ZIP, so a
    // 200 KB file can inflate to gigabytes and take the tab down with it. The
    // libraries have no say in this, so the archive's own central directory is read
    // BEFORE anything is handed to them (see officeZipTotals).
    var OFFICE_MAX_EXPANDED = 192 * 1024 * 1024;

    // Reads a ZIP's central directory without inflating anything: entry count plus
    // the declared compressed/uncompressed totals.
    //
    // Deliberately conservative — it walks the END OF CENTRAL DIRECTORY record and
    // then the directory entries, and returns null (meaning "no verdict") the moment
    // the structure is not what it expects. A null never blocks a file: the real
    // parser is then the one that reports the problem, in its own words.
    function officeZipTotals(bytes) {
      try {
        var view = bytes && bytes.length !== undefined && typeof bytes !== 'string'
          ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
          : null;
        if (!view) return null;
        var len = view.length;
        if (len < 22) return null;
        // EOCD is at the end, possibly followed by a comment (up to 64 KB).
        var floor = Math.max(0, len - 22 - 65535);
        var eocd = -1;
        for (var i = len - 22; i >= floor; i--) {
          if (view[i] === 0x50 && view[i + 1] === 0x4b && view[i + 2] === 0x05 && view[i + 3] === 0x06) { eocd = i; break; }
        }
        if (eocd < 0) return null;
        var dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
        var count = dv.getUint16(eocd + 10, true);
        var cdOffset = dv.getUint32(eocd + 16, true);
        if (!count || cdOffset + 46 > len) return null;
        var total = 0;
        var compressed = 0;
        var seen = 0;
        var p = cdOffset;
        while (seen < count && p + 46 <= len) {
          if (!(view[p] === 0x50 && view[p + 1] === 0x4b && view[p + 2] === 0x01 && view[p + 3] === 0x02)) break;
          var rawCompressed = dv.getUint32(p + 20, true);
          var rawTotal = dv.getUint32(p + 24, true);
          // 0xFFFFFFFF means "look in the ZIP64 extra field", i.e. a size too large
          // for this field. Reading it as 4 GB and refusing is the safe direction:
          // such an entry is already past every ceiling here.
          total += rawTotal;
          compressed += rawCompressed;
          var nameLen = dv.getUint16(p + 28, true);
          var extraLen = dv.getUint16(p + 30, true);
          var commentLen = dv.getUint16(p + 32, true);
          p += 46 + nameLen + extraLen + commentLen;
          seen += 1;
        }
        if (!seen) return null;
        return { entries: seen, uncompressed: total, compressed: compressed };
      } catch (e) {
        return null;
      }
    }

    // The pre-flight both entry points run before a library is loaded. Returns
    // { ok: true } or { ok: false, message } — a string the view shows as-is, since
    // "why can I not see my file" is the only question a refusal has to answer.
    function officeBytesVerdict(bytes) {
      var size = bytes && bytes.length !== undefined ? bytes.length : 0;
      if (!size) return { ok: false, code: 'empty', message: '这个文件是空的（0 字节），没有可读的内容。' };
      if (size > OFFICE_MAX_FILE) {
        return {
          ok: false,
          code: 'too-big',
          message: '文件太大（' + officeSizeText(size) + '）：离线预览的上限是 ' + officeSizeText(OFFICE_MAX_FILE) + '。',
        };
      }
      var zip = officeZipTotals(bytes);
      if (zip && zip.uncompressed > OFFICE_MAX_EXPANDED) {
        return {
          ok: false,
          code: 'too-expanded',
          message: '这个压缩包解开后有 ' + officeSizeText(zip.uncompressed) + '（压缩包本身只有 ' + officeSizeText(size)
            + '）：为避免把它解进内存后卡住页面，这里拒绝展开。',
        };
      }
      return { ok: true, zip: zip };
    }

    function officeSizeText(n) {
      var bytes = typeof n === 'number' && isFinite(n) ? n : 0;
      if (bytes >= 1024 * 1024 * 1024) return (Math.round(bytes / (1024 * 1024 * 1024) * 10) / 10) + ' GB';
      if (bytes >= 1024 * 1024) return (Math.round(bytes / (1024 * 1024) * 10) / 10) + ' MB';
      if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
      return bytes + ' B';
    }

    // ── Lazy library loading ──────────────────────────────────────────────────
    // A promise per URL, kept forever (a script tag is not re-fetched), and cleared
    // on failure so a retry after a transient error is possible.
    var _officeScripts = {};
    function officeLoadScript(url) {
      if (typeof document === 'undefined') return Promise.reject(new Error('这里没有可用的页面环境'));
      if (_officeScripts[url]) return _officeScripts[url];
      _officeScripts[url] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = function () { resolve(url); };
        s.onerror = function () {
          _officeScripts[url] = null;
          reject(new Error('无法加载渲染库（' + url + '）：请确认本插件是最新的，然后重启 dsh web 并硬刷新。'));
        };
        document.head.appendChild(s);
      });
      return _officeScripts[url];
    }

    var _officePptx = null;
    function officeLoadPptx() {
      if (typeof window !== 'undefined' && window.__dshFrogPptx) return Promise.resolve(window.__dshFrogPptx);
      if (_officePptx) return _officePptx;
      _officePptx = Promise.resolve().then(function () {
        return import(OFFICE_ASSETS.pptx);
      }).then(function (mod) {
        if (!mod || typeof mod.PptxViewer !== 'function') throw new Error('pptx 渲染库没有导出 PptxViewer');
        try { window.__dshFrogPptx = mod; } catch (e) {}
        return mod;
      }).catch(function (e) {
        _officePptx = null;
        throw new Error('无法加载 pptx 渲染库：' + (e && e.message ? e.message : String(e)));
      });
      return _officePptx;
    }

    // ── Small DOM helpers (used by every widget below) ────────────────────────
    function officeEl(tag, cls, text) {
      var el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text != null) el.textContent = String(text);
      return el;
    }

    function officeClear(el) {
      if (!el) return;
      while (el.firstChild) el.removeChild(el.firstChild);
    }

    function officeRemove(el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function officeHandle(kind, element, extra, destroy) {
      var handle = { kind: kind, element: element, destroy: destroy };
      if (extra) Object.keys(extra).forEach(function (key) { handle[key] = extra[key]; });
      return handle;
    }

    // Everything a failed mount may have already put on screen must come off again:
    // a half-drawn widget plus an error line is worse than the error line alone.
    function officeFail(view) {
      officeRemove(view);
    }

    function officeBytes(input) {
      if (!input) return new Uint8Array(0);
      if (input instanceof Uint8Array) return input;
      if (input instanceof ArrayBuffer) return new Uint8Array(input);
      if (input.buffer) return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
      return new Uint8Array(input);
    }

    // ── The widgets ───────────────────────────────────────────────────────────
    // Every mount appends ONE .office-view to the container it is given, resolves
    // with a handle whose destroy() removes exactly what it added, and rejects
    // with a message meant for the user. Callers own the container, the loading
    // state and the error line; this module owns the reading.

    function officeMountDocx(container, bytes) {
      var view = null;
      return officeLoadScript(OFFICE_ASSETS.jszip)
        .then(function () { return officeLoadScript(OFFICE_ASSETS.docx); })
        .then(function () {
          var lib = typeof window !== 'undefined' ? window.docx : null;
          if (!lib || typeof lib.renderAsync !== 'function') throw new Error('docx 渲染库没有就绪');
          view = officeEl('div', 'office-view office-docx');
          container.appendChild(view);
          // renderAsync(data, bodyContainer, styleContainer, options): the SAME
          // element for both, so the document's own <style> block lands beside its
          // pages instead of in some other node — and both are cleared first, which
          // is why a re-mount cannot stack two documents.
          return lib.renderAsync(bytes, view, view, {
            className: 'office-docx-page',
            inWrapper: true,
            breakPages: true,
            // Word writes an explicit "last rendered page break"; honouring it is
            // what keeps a long document's page count equal to Word's.
            ignoreLastRenderedPageBreak: false,
            // Images and embedded objects become data: URLs, so the rendered pages
            // stay self-contained after mount (the default is object URLs, which
            // this widget cannot revoke — it does not own their lifetime).
            useBase64URL: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
            renderEndnotes: true,
            renderAltChunks: true,
          });
        })
        .then(function () {
          var pages = view.querySelectorAll('section.office-docx-page').length;
          return officeHandle('docx', view, { pages: pages }, function () { officeRemove(view); });
        })
        .catch(function (e) {
          officeFail(view);
          throw e;
        });
    }

    // One worksheet as a real table. Values come from sheet_to_json with
    // raw: false, i.e. the FORMATTED text Excel would show (a date stays a date,
    // a percentage keeps its sign) — the honest reading of a spreadsheet, and the
    // reason this is not sheet_to_html: every cell is written with textContent,
    // so nothing in the file can become markup in our page.
    function officeSheetTable(XLSX, sheet, name) {
      if (!sheet) return officeEl('div', 'office-note', '工作表「' + name + '」是空的。');
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false }) || [];
      var merges = sheet['!merges'] || [];
      var ref = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
      var width = 0;
      var i;
      for (i = 0; i < rows.length; i++) if (rows[i] && rows[i].length > width) width = rows[i].length;
      if (ref && ref.e.c + 1 > width) width = ref.e.c + 1;
      // A grid nobody can read is not a preview: cap both axes and SAY that it was
      // capped, the way the panel says "(truncated preview)" for a long text file.
      var maxRows = 4000;
      var maxCols = 200;
      var truncated = false;
      if (rows.length > maxRows) { rows = rows.slice(0, maxRows); truncated = true; }
      if (width > maxCols) { width = maxCols; truncated = true; }

      var covered = {};
      var span = {};
      merges.forEach(function (m) {
        if (!m || !m.s || !m.e) return;
        var r0 = m.s.r, c0 = m.s.c, r1 = Math.min(m.e.r, rows.length - 1), c1 = Math.min(m.e.c, width - 1);
        if (r0 > r1 || c0 > c1) return;
        span[r0 + ':' + c0] = { rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
        for (var r = r0; r <= r1; r++) {
          for (var c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered[r + ':' + c] = 1;
        }
      });

      var wrap = officeEl('div', 'office-grid-wrap');
      var table = officeEl('table', 'office-grid');
      var tbody = officeEl('tbody');
      table.appendChild(tbody);
      for (var r2 = 0; r2 < rows.length; r2++) {
        var tr = officeEl('tr');
        var row = rows[r2] || [];
        for (var c2 = 0; c2 < width; c2++) {
          if (covered[r2 + ':' + c2]) continue;
          var td = officeEl('td', r2 === 0 ? 'office-grid-head' : null);
          var s = span[r2 + ':' + c2];
          if (s) {
            if (s.cols > 1) td.colSpan = s.cols;
            if (s.rows > 1) td.rowSpan = s.rows;
          }
          var value = row[c2];
          td.textContent = value == null ? '' : String(value);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      wrap.appendChild(table);
      if (truncated) {
        wrap.appendChild(officeEl('div', 'office-note', '仅显示前 ' + Math.min(rows.length, maxRows) + ' 行 × ' + width + ' 列（更大的表请用 Excel 打开）。'));
      }
      return wrap;
    }

    function officeMountXlsx(container, bytes) {
      var view = null;
      return officeLoadScript(OFFICE_ASSETS.xlsx)
        .then(function () {
          var XLSX = typeof window !== 'undefined' ? window.XLSX : null;
          if (!XLSX || typeof XLSX.read !== 'function') throw new Error('xlsx 渲染库没有就绪');
          var book = XLSX.read(bytes, { type: 'array', cellDates: true, cellStyles: false });
          var names = book && book.SheetNames ? book.SheetNames : [];
          if (!names.length) throw new Error('这个工作簿里没有工作表。');
          view = officeEl('div', 'office-view office-xlsx');
          var bar = officeEl('div', 'office-bar');
          var scroll = officeEl('div', 'office-scroll');
          view.appendChild(bar);
          view.appendChild(scroll);
          container.appendChild(view);
          var tabs = [];
          var current = -1;
          var show = function (index) {
            current = index;
            tabs.forEach(function (tab, i) {
              tab.className = 'office-tab' + (i === index ? ' is-active' : '');
              tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
            });
            officeClear(scroll);
            scroll.appendChild(officeSheetTable(XLSX, book.Sheets[names[index]], names[index]));
            scroll.scrollTop = 0;
            scroll.scrollLeft = 0;
          };
          names.forEach(function (name, index) {
            var tab = officeEl('button', 'office-tab', name);
            tab.type = 'button';
            tab.title = '工作表 ' + name;
            tab.addEventListener('click', function () { if (index !== current) show(index); });
            tabs.push(tab);
            bar.appendChild(tab);
          });
          // Only one sheet: the strip would be chrome with nothing to do, so it is
          // dropped rather than shown dead.
          if (names.length < 2) bar.className = 'office-bar is-empty';
          show(0);
          var count = officeEl('span', 'office-count', names.length + ' 个工作表');
          if (names.length > 1) bar.appendChild(count);
          return officeHandle('xlsx', view, { sheets: names.length }, function () { officeRemove(view); });
        })
        .catch(function (e) {
          officeFail(view);
          throw e;
        });
    }

    function officeMountPptx(container, bytes) {
      var view = null;
      var viewer = null;
      return officeLoadPptx()
        .then(function (mod) {
          view = officeEl('div', 'office-view office-pptx');
          var bar = officeEl('div', 'office-bar');
          var stage = officeEl('div', 'office-scroll office-pptx-stage');
          var prev = officeEl('button', 'office-nav', '‹');
          var next = officeEl('button', 'office-nav', '›');
          var label = officeEl('span', 'office-page', '…');
          prev.type = 'button';
          next.type = 'button';
          prev.title = '上一页';
          next.title = '下一页';
          bar.appendChild(prev);
          bar.appendChild(label);
          bar.appendChild(next);
          view.appendChild(bar);
          view.appendChild(stage);
          container.appendChild(view);
          var sync = function (index) {
            var total = viewer ? viewer.slideCount : 0;
            label.textContent = (index + 1) + ' / ' + total;
            prev.disabled = !total || index <= 0;
            next.disabled = !total || index >= total - 1;
          };
          prev.addEventListener('click', function () {
            if (!viewer) return;
            var at = viewer.currentSlideIndex;
            if (at > 0) viewer.goToSlide(at - 1);
          });
          next.addEventListener('click', function () {
            if (!viewer) return;
            var at = viewer.currentSlideIndex;
            if (at < viewer.slideCount - 1) viewer.goToSlide(at + 1);
          });
          return mod.PptxViewer.open(bytes, stage, {
            fitMode: 'contain',
            zoomPercent: 100,
            // Media and slide bodies are decoded on demand: a 60-slide deck would
            // otherwise inflate every embedded image before the first slide is seen.
            lazyMedia: true,
            lazySlides: true,
            scrollContainer: stage,
            zipLimits: mod.RECOMMENDED_ZIP_LIMITS,
            onSlideChange: function (index) { sync(index); },
            onSlideError: function (index, error) {
              // One broken slide must not blank the deck; the viewer keeps going and
              // the message says which page it was.
              var note = officeEl('div', 'office-note', '第 ' + (index + 1) + ' 页渲染失败：' + (error && error.message ? error.message : String(error)));
              stage.appendChild(note);
            },
          }).then(function (opened) {
            viewer = opened;
            if (!viewer.slideCount) throw new Error('这份演示文稿里没有可显示的幻灯片。');
            sync(viewer.currentSlideIndex || 0);
            return officeHandle('pptx', view, { slides: viewer.slideCount }, function () {
              try { viewer.destroy(); } catch (e) {}
              viewer = null;
              officeRemove(view);
            });
          });
        })
        .catch(function (e) {
          viewer = null;
          officeFail(view);
          throw new Error('无法解析这份演示文稿：' + (e && e.message ? e.message : String(e)));
        });
    }

    // The one entry point every caller uses.
    //
    // bytes may be a Uint8Array or an ArrayBuffer (the shell's document seat hands
    // over a Uint8Array; the panel and the popout page fetch an ArrayBuffer from
    // /media). Returns a promise for a handle — never a bare element — because every
    // widget here allocates something that must be released: a canvas, a worker, a
    // URL, a ResizeObserver.
    function officeMount(container, kind, bytes, options) {
      var opts = options || {};
      if (!container) return Promise.reject(new Error('没有可挂载的容器'));
      var data = officeBytes(bytes);
      var verdict = officeBytesVerdict(data);
      if (!verdict.ok) return Promise.reject(new Error(verdict.message));
      if (kind === 'docx') return officeMountDocx(container, data, opts);
      if (kind === 'xlsx') return officeMountXlsx(container, data, opts);
      if (kind === 'pptx') return officeMountPptx(container, data, opts);
      return Promise.reject(new Error('这个格式还不能离线渲染：' + String(kind || '')));
    }

    // Where the panel and the popout page read the bytes of a workspace file.
    function officeMediaUrl(path) {
      return '/dsh-sidebar-frog/media?path=' + encodeURIComponent(String(path || ''));
    }

              // Delimited-text (CSV / TSV / semicolon / pipe) parsing for the table view.
    //
    // Portable JS (var/function, no template literals, no closing script tag): the
    // sidebar bundle and the standalone popout page BOTH splice this file in, and
    // the page is one String.raw literal — a backtick anywhere in here ends that
    // literal early and the page's whole script becomes a syntax error. (This
    // paragraph is the rule it describes; the checker enforces it on every file in
    // src/shared.)
    //
    // It is one shared parser on purpose. The panel draws a React table and the
    // popout page draws a DOM table, but "what is a cell" must not differ between
    // them: a quoted field containing a newline is exactly where two hand-written
    // parsers drift apart, and the drift is only visible on somebody's real file.
    //
    // The grammar is RFC 4180 plus the two things real exports rely on: a UTF-8 BOM
    // (Excel writes one) and CRLF / CR line endings.

    // Candidate separators, in tie-break order: a file that parses equally well as
    // comma- and semicolon-separated is read as comma-separated.
    var TABLE_DELIMITERS = [',', '\t', ';', '|'];
    // How many records the sniffer looks at. Enough for a header plus a dozen rows,
    // cheap on a large file.
    var TABLE_SNIFF_RECORDS = 20;

    // Split text into records of fields. The delimiter is a single character.
    // A quote only opens a quoted field at the START of a field (RFC 4180); a bare
    // quote inside an unquoted field is literal text, which is what spreadsheet
    // exports actually mean by it.
    function tableSplitRecords(text, delimiter) {
      var src = String(text == null ? '' : text);
      if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // BOM
      var sep = delimiter || ',';
      var records = [];
      var row = [];
      var field = '';
      var quoted = false;
      var started = false; // a field is in progress, so a leading quote can open one
      var i = 0;
      var n = src.length;
      while (i < n) {
        var ch = src.charAt(i);
        if (quoted) {
          if (ch === '"') {
            if (src.charAt(i + 1) === '"') { field += '"'; i += 2; continue; } // escaped quote
            quoted = false; i += 1; continue;
          }
          field += ch; i += 1; continue;
        }
        if (ch === '"' && field === '' && !started) { quoted = true; started = true; i += 1; continue; }
        if (ch === sep) { row.push(field); field = ''; started = false; i += 1; continue; }
        if (ch === '\r') {
          // CRLF and a lone CR both end the record.
          row.push(field); field = ''; started = false;
          records.push(row); row = [];
          i += src.charAt(i + 1) === '\n' ? 2 : 1;
          continue;
        }
        if (ch === '\n') {
          row.push(field); field = ''; started = false;
          records.push(row); row = [];
          i += 1;
          continue;
        }
        field += ch; started = true; i += 1;
      }
      // The last record only exists if anything was pending: a trailing newline must
      // not invent an empty row.
      if (field !== '' || row.length || started) { row.push(field); records.push(row); }
      return records;
    }

    // How consistent is this separator? The fraction of sampled records whose field
    // count equals the most common field count. A separator that never yields two
    // fields scores 0 and is not a candidate at all.
    function tableDelimiterScore(text, delimiter) {
      var records = tableSplitRecords(text, delimiter).slice(0, TABLE_SNIFF_RECORDS);
      if (!records.length) return 0;
      var counts = {};
      var best = 0;
      var bestCount = 0;
      for (var i = 0; i < records.length; i += 1) {
        var c = records[i].length;
        counts[c] = (counts[c] || 0) + 1;
        if (counts[c] > bestCount) { bestCount = counts[c]; best = c; }
      }
      if (best < 2) return 0;
      return bestCount / records.length;
    }

    function tableSniffDelimiter(text) {
      var bestDelimiter = ',';
      var bestScore = 0;
      for (var i = 0; i < TABLE_DELIMITERS.length; i += 1) {
        var score = tableDelimiterScore(text, TABLE_DELIMITERS[i]);
        // Strictly greater: an earlier candidate keeps the tie (see TABLE_DELIMITERS).
        if (score > bestScore) { bestScore = score; bestDelimiter = TABLE_DELIMITERS[i]; }
      }
      return bestDelimiter;
    }

    function tableDelimiterLabel(delimiter) {
      if (delimiter === '\t') return '制表符';
      if (delimiter === ';') return '分号';
      if (delimiter === '|') return '竖线';
      return '逗号';
    }

    // Parse into a grid the views can draw directly: the first record is the header,
    // every row is padded to the widest row so the table has no holes.
    function tableParse(text, opts) {
      var o = opts || {};
      var source = String(text == null ? '' : text);
      var delimiter = o.delimiter || tableSniffDelimiter(source);
      var records = tableSplitRecords(source, delimiter);
      // Trailing blank line(s) — not data.
      while (records.length && records[records.length - 1].length === 1 && records[records.length - 1][0] === '') records.pop();
      var header = records.length ? records[0].slice() : [];
      var rows = records.slice(1);
      var columns = header.length;
      var i, j;
      for (i = 0; i < rows.length; i += 1) if (rows[i].length > columns) columns = rows[i].length;
      for (i = header.length; i < columns; i += 1) header.push('');
      for (i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        if (row.length < columns) { row = row.slice(); for (j = row.length; j < columns; j += 1) row.push(''); rows[i] = row; }
      }
      return {
        delimiter: delimiter,
        header: header,
        rows: rows,
        columns: columns,
        total: rows.length,
      };
    }

    // A cell that is *plainly* numeric sorts as a number; anything else sorts as
    // text. Deliberately strict: "1,234" (thousands separator), "12%", "2026-01-02"
    // and "v1.2" all stay text, because guessing at those is how a sort becomes
    // wrong in a way nobody can see.
    function tableCellNumber(value) {
      var s = String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
      if (!s) return null;
      if (!/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return null;
      var n = parseFloat(s);
      return isFinite(n) ? n : null;
    }

    // Numeric-aware ascending comparison; numbers come before text so a column that
    // is mostly numbers keeps its numbers together at one end.
    function tableCompare(a, b) {
      var na = tableCellNumber(a);
      var nb = tableCellNumber(b);
      if (na != null && nb != null) return na < nb ? -1 : (na > nb ? 1 : 0);
      if (na != null) return -1;
      if (nb != null) return 1;
      var sa = String(a == null ? '' : a);
      var sb = String(b == null ? '' : b);
      return sa < sb ? -1 : (sa > sb ? 1 : 0);
    }

    // Sort a copy of the rows by one column. Two deliberate rules: blank cells stay
    // at the BOTTOM in both directions (flipping them to the top is the classic
    // spreadsheet annoyance), and equal cells keep the file's own order.
    function tableSortRows(rows, column, direction) {
      var decorated = [];
      for (var i = 0; i < rows.length; i += 1) decorated.push({ row: rows[i], at: i });
      var sign = direction === 'desc' ? -1 : 1;
      decorated.sort(function (x, y) {
        var a = x.row[column];
        var b = y.row[column];
        var ea = a == null || a === '';
        var eb = b == null || b === '';
        if (ea || eb) {
          if (ea && eb) return x.at - y.at;
          return ea ? 1 : -1;
        }
        var c = tableCompare(a, b);
        return c !== 0 ? c * sign : x.at - y.at;
      });
      var out = [];
      for (var k = 0; k < decorated.length; k += 1) out.push(decorated[k].row);
      return out;
    }

    // Cell text for display: trimmed, then cut to a maximum number of characters.
    // The full value stays available as the cell's title, so nothing is lost — only
    // hidden.
    function tableFormatCell(value, max) {
      var s = String(value == null ? '' : value);
      var limit = typeof max === 'number' && max > 0 ? max : 2000;
      if (s.length <= limit) return s;
      return s.slice(0, limit - 1) + '…';
    }

              // ── Git 只读切片：解析与判定（两侧共用） ─────────────────────────────────────
    //
    // This plugin shows a READ-ONLY slice of the workspace's git state: the branch,
    // ahead/behind, the changed and untracked files, and one file's difference
    // against HEAD. It never stages, commits, discards or checks anything out —
    // that is a deliberate boundary, not an unfinished feature: writing to a
    // repository is the one operation here that can destroy a user's work with no
    // undo, and the panel's own 撤销 (revert) already covers "put one file back".
    //
    // The parsing lives in this shared module, not in the host route, for the same
    // reason the CSV parser does: the host decides what an ENTRY is and the client
    // decides how to GROUP it, and if those two disagreed a file could be listed
    // under 已暂存 while the count said otherwise. scripts/check.js drives these
    // functions directly, with text captured from real 「git status --porcelain=v1
    // -z」 output.
    //
    // ── Why porcelain v1 with -z ────────────────────────────────────────────────
    //   · 「--porcelain」 is the STABLE machine format — its columns are documented
    //     never to change, unlike the human format, which is localized and
    //     column-aligned for terminals;
    //   · 「-z」 terminates records with NUL instead of newline, which is the only
    //     form that survives a path containing a newline or a quote. Without it git
    //     C-quotes such paths ("a\nb" as 「"a\nb"」) and we would have to unquote;
    //   · with 「-z」 paths are literal, so the bytes after the two status columns
    //     are the file name exactly as it exists on disk.
    //
    // ── The record shape ───────────────────────────────────────────────────────
    // Each record is 「XY <path>」: X is the INDEX (staged) column, Y is the WORKTREE
    // column, and one space separates them. A path may contain spaces, so only the
    // first three characters are structural.
    //
    // A rename or copy (「R」/「C」) is the one record that is not self-contained: the
    // ORIGINAL path travels as the NEXT NUL-separated record, and consuming it as
    // an entry of its own is the classic bug here — it shows a phantom file and
    // steals the next entry's slot.
    //
    // NOTE: no backticks and no dollar-brace anywhere in this file — it is inlined
    // into the popout's single String.raw literal (scripts/check.js enforces that).

    // How many entries one snapshot carries. An untracked build directory can hold
    // tens of thousands of files (node_modules after a bad .gitignore), and a
    // sidebar that tries to render them all is worse than useless: the cap keeps
    // the snapshot bounded and the view says it was cut. The number is generous
    // enough that a normal working tree is never truncated.
    var GIT_ENTRY_CAP = 300

    // The status letter shown for one entry in one section. 「section」 matters
    // because the same file can sit in two sections at once (「MM」: staged edit plus
    // a further unstaged edit), and each section shows ITS OWN column.
    var GIT_SECTION_LIST = [
      { key: 'conflicted', title: '冲突', note: '需要人工合并后才能提交' },
      { key: 'staged', title: '已暂存', note: '已在索引中，等待提交' },
      { key: 'unstaged', title: '未暂存', note: '工作区与索引不一致' },
      { key: 'untracked', title: '未跟踪', note: 'Git 尚未记录的新文件' },
    ]

    // Conflicted: any unmerged column (U), or the add/add and delete/delete pairs —
    // those two are conflicts with no 「U」 in either column.
    function gitEntryConflicted(entry) {
      if (!entry) return false
      var x = String(entry.x || ' ').charAt(0)
      var y = String(entry.y || ' ').charAt(0)
      if (x === 'U' || y === 'U') return true
      if (x === 'A' && y === 'A') return true
      if (x === 'D' && y === 'D') return true
      return false
    }

    function gitEntryUntracked(entry) {
      if (!entry) return false
      return String(entry.x || ' ').charAt(0) === '?' && String(entry.y || ' ').charAt(0) === '?'
    }

    // Parse the raw text of 「git status --porcelain=v1 -z」. Returns entries in the
    // order git printed them (which is path order), each 「{ x, y, path, origPath }」.
    function parsePorcelainZ(text) {
      var out = []
      var raw = String(text == null ? '' : text)
      if (!raw) return out
      var records = raw.split('\u0000')
      for (var i = 0; i < records.length; i += 1) {
        var rec = records[i]
        if (!rec || rec.length < 3) continue
        var entry = { x: rec.charAt(0), y: rec.charAt(1), path: rec.slice(3), origPath: '' }
        var x = entry.x
        if (x === 'R' || x === 'C') {
          // The source path is the next record and belongs to THIS entry.
          var next = records[i + 1]
          if (typeof next === 'string' && next) {
            entry.origPath = next
            i += 1
          }
        }
        out.push(entry)
      }
      return out
    }

    // Which sections one entry belongs to, in GIT_SECTION_LIST order. A file with
    // both columns set (「MM」, 「AM」, 「RM」…) is deliberately listed under BOTH — that
    // is what git's own status does, and collapsing it into one row would hide the
    // fact that part of the change is already staged.
    function gitSectionsOf(entry) {
      if (!entry) return []
      var keys = []
      if (gitEntryConflicted(entry)) keys.push('conflicted')
      var x = String(entry.x || ' ').charAt(0)
      var y = String(entry.y || ' ').charAt(0)
      if (!gitEntryUntracked(entry) && !gitEntryConflicted(entry)) {
        if (x !== ' ' && x !== '?') keys.push('staged')
        if (y !== ' ' && y !== '?') keys.push('unstaged')
      }
      if (gitEntryUntracked(entry)) keys.push('untracked')
      return keys
    }

    // The single character shown against a row in one section, and the full word
    // its tooltip spells out. 「?」 is untracked, 「U」 is a conflict.
    function gitStatusLetter(entry, section) {
      var x = entry ? String(entry.x || ' ').charAt(0) : ' '
      var y = entry ? String(entry.y || ' ').charAt(0) : ' '
      var letter = ' '
      if (section === 'staged') letter = x
      else if (section === 'unstaged') letter = y
      else if (section === 'untracked') letter = '?'
      else if (section === 'conflicted') letter = 'U'
      var words = {
        M: '已修改', A: '新增', D: '已删除', R: '重命名', C: '复制',
        T: '类型变更', U: '冲突', '?': '未跟踪', ' ': '无变化',
      }
      return { letter: letter, label: words[letter] || letter }
    }

    // Group entries into the sections the view draws, dropping empty ones.
    function gitSectionGroups(entries) {
      var list = Array.isArray(entries) ? entries : []
      var groups = []
      for (var i = 0; i < GIT_SECTION_LIST.length; i += 1) {
        var spec = GIT_SECTION_LIST[i]
        var rows = []
        for (var j = 0; j < list.length; j += 1) {
          if (gitSectionsOf(list[j]).indexOf(spec.key) >= 0) rows.push(list[j])
        }
        if (rows.length) groups.push({ key: spec.key, title: spec.title, note: spec.note, rows: rows })
      }
      return groups
    }

    // Distinct-path counts, so a file that is both staged and unstaged is counted
    // once in 「total」 while still appearing in both sections.
    function gitCounts(entries) {
      var list = Array.isArray(entries) ? entries : []
      var out = { conflicted: 0, staged: 0, unstaged: 0, untracked: 0, total: 0 }
      var seen = {}
      for (var i = 0; i < list.length; i += 1) {
        var e = list[i]
        var keys = gitSectionsOf(e)
        if (!keys.length) continue
        if (!seen[e.path]) { seen[e.path] = 1; out.total += 1 }
        for (var k = 0; k < keys.length; k += 1) {
          if (out[keys[k]] != null) out[keys[k]] += 1
        }
      }
      return out
    }

    // The one-line summary the band and the header carry.
    function gitSummaryText(counts) {
      if (!counts || !counts.total) return '工作区干净'
      var parts = []
      if (counts.conflicted) parts.push(counts.conflicted + ' 冲突')
      if (counts.staged) parts.push(counts.staged + ' 已暂存')
      if (counts.unstaged) parts.push(counts.unstaged + ' 未暂存')
      if (counts.untracked) parts.push(counts.untracked + ' 未跟踪')
      return counts.total + ' 个文件有改动' + (parts.length ? '（' + parts.join(' · ') + '）' : '')
    }

    // "↑2 ↓1" — ahead and behind the upstream. Absent counts (no upstream) print
    // nothing rather than a misleading 0/0.
    function gitAheadBehindText(ahead, behind) {
      var parts = []
      if (typeof ahead === 'number' && isFinite(ahead) && ahead > 0) parts.push('↑' + ahead)
      if (typeof behind === 'number' && isFinite(behind) && behind > 0) parts.push('↓' + behind)
      return parts.join(' ')
    }

    // A remote URL is shown to the user, so credentials must never travel with it.
    // Two shapes carry them:
    //   · https://user:token@host/owner/repo.git  (userinfo)
    //   · git@host:owner/repo.git                 (ssh user — harmless, but the
    //                                              user is noise, not information)
    // and a third hides one in the query (「?access_token=…」, common on CI mirrors).
    // Stripping all three is cheap; a token leaked into a screenshot is not.
    function redactRemote(url) {
      var text = String(url == null ? '' : url).trim()
      if (!text) return ''
      var ssh = /^[A-Za-z0-9._-]+@([^/]+:.+)$/.exec(text)
      if (ssh) return ssh[1]
      var scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/]*)([\s\S]*)$/.exec(text)
      if (scheme) {
        var authority = scheme[2].replace(/^[^@]*@/, '')
        var rest = scheme[3].split('?')[0].split('#')[0]
        return scheme[1] + '://' + authority + rest
      }
      return text.split('?')[0]
    }

    // How the branch is named in the header: a detached HEAD has no branch name —
    // git answers the literal "HEAD" — and saying so is more useful than printing
    // "HEAD", which reads like a branch called HEAD.
    function gitHeadLabel(snapshot) {
      var snap = snapshot || {}
      if (snap.detached) {
        return snap.head ? 'HEAD 分离 @ ' + String(snap.head) : 'HEAD 分离'
      }
      return String(snap.branch || '') || '（无分支）'
    }

              // Shared self-contained syntax highlighter (portable JS, no template literals,
    // no interpolation, no backticks — safe to inline verbatim into the standalone
    // page's String.raw template). Emits span class tok-* tokens; color them in CSS.
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function makeHl(specs, flags) {
      var src = '';
      for (var i = 0; i < specs.length; i += 1) src += (i ? '|' : '') + '(' + specs[i][1] + ')';
      var re = new RegExp(src, flags || 'g');
      return function (code) {
        re.lastIndex = 0;
        var out = '', last = 0, m;
        while ((m = re.exec(code)) !== null) {
          if (m.index > last) out += escHtml(code.slice(last, m.index));
          for (var g = 1; g < m.length; g += 1) {
            if (m[g] !== undefined) {
              out += '<span class="tok-' + specs[g - 1][0] + '">' + escHtml(m[g]) + '</span>';
              break;
            }
          }
          last = re.lastIndex;
          if (m[0].length === 0) { re.lastIndex += 1; last = re.lastIndex; }
        }
        if (last < code.length) out += escHtml(code.slice(last));
        return out;
      };
    }

    var S_DQ = "\"(?:[^\"\\\\\\n]|\\\\.)*\"";
    var S_SQ = "\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27";
    var S_BT = "\\x60(?:[^\\x60\\\\]|\\\\.)*\\x60";
    var NUM = "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b";
    var C_LINE = "//[^\\n]*";
    var C_BLK = "/\\*[\\s\\S]*?\\*/";
    var HASH = "#[^\\n]*";
    var SQL_LINE = "--[^\\n]*";
    var HTML_COMMENT = "<!--[\\s\\S]*?-->";
    var PY_TRI = "(?:\"\"\"[\\s\\S]*?\"\"\"|\\x27\\x27\\x27[\\s\\S]*?\\x27\\x27\\x27)";
    var PY_STR = "(?:[rfbuRFBU]{0,2})(?:\"(?:[^\"\\\\\\n]|\\\\.)*\"|\\x27(?:[^\\x27\\\\\\n]|\\\\.)*\\x27)";
    var CSS_NUM = "\\b\\d+(?:\\.\\d+)?(?:[a-zA-Z%]*)\\b";
    var HEX = "#[0-9a-fA-F]{3,8}\\b";
    var AT = "@[\\w-]+";
    var PROP = "[\\w-]+(?=\\s*:)";
    var TAG = "</?[\\w-]+|/?>";
    var ATTR = "[\\w-]+(?==)";
    var VAR = "\\$(?:\\{[\\w]+\\}|[\\w]+)";
    var VAR_PHP = "\\$\\w+";
    var DECORATOR = "@[\\w.]+";
    var IMPORTANT = "!important\\b";
    var FUNC = "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()";
    var FUNC_PY = "\\b[A-Za-z_][\\w]*(?=\\s*\\()";
    var CLASS = "\\b[A-Z][\\w$]*\\b";
    var YAML_KEY = "^\\s*(?:-\\s+)?[\\w.@-]+(?=\\s*:)";

    function kwWord(kw) { return '\\b(?:' + kw.replace(/\s+/g, '|') + ')\\b'; }

    var JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return static super switch this throw try typeof var void while with yield async await of get set null undefined true false';
    var PY_KW = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self';
    var SH_KW = 'if then elif else fi for while do done case esac function select in until return exit set unset export readonly local shift source';
    var SQL_KW = 'select from where insert into update delete create drop alter table index view join left right inner outer full on as and or not null group by order having limit offset union all distinct values set primary key foreign references default like between is in exists asc desc';
    var C_KW = 'auto break case const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while';
    var GO_KW = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var';
    var RUST_KW = 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type union unsafe use where while';
    var JAVA_KW = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while';
    var RB_KW = 'begin case class def do else elsif end ensure for if module next nil not or redo rescue retry return self super then true false undef unless until when while yield';
    var PHP_KW = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global if implements include instanceof insteadof interface isset list namespace new or print private protected public require return static switch throw trait try unset use var while xor yield';

    function cFamily(kw) {
      return makeHl([
        ['comment', C_LINE + '|' + C_BLK],
        ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(kw)],
        ['function', FUNC],
        ['class', CLASS],
      ]);
    }

    var HL_ENGINES = {
      js: makeHl([
        ['comment', C_LINE + '|' + C_BLK],
        ['string', S_BT + '|' + S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(JS_KW)],
        ['builtin', '\\b(?:console|Math|JSON|Promise|Array|Object|String|Number|Boolean|RegExp|Date|Map|Set|WeakMap|WeakSet|Symbol|BigInt|Infinity|NaN|window|document|process|require|module|exports|setTimeout|clearTimeout|fetch|globalThis)\\b'],
        ['function', FUNC],
        ['class', CLASS],
      ]),
      py: makeHl([
        ['comment', HASH],
        ['string', PY_TRI + '|' + PY_STR],
        ['number', NUM],
        ['keyword', kwWord(PY_KW)],
        ['builtin', '\\b(?:print|len|range|enumerate|zip|map|filter|int|str|float|bool|list|dict|set|tuple|type|isinstance|super|open|input|repr|format|sorted|reversed|sum|min|max|abs|round|any|all|next|iter|dir|vars|getattr|setattr|hasattr|id|hash|bytes|bytearray|complex|frozenset|object|classmethod|staticmethod|property|Exception|ValueError|TypeError|KeyError|IndexError|ImportError|RuntimeError|StopIteration)\\b'],
        ['decorator', DECORATOR],
        ['function', FUNC_PY],
      ]),
      css: makeHl([
        ['comment', C_BLK],
        ['string', S_DQ + '|' + S_SQ],
        ['atrule', AT],
        ['property', PROP],
        ['number', CSS_NUM],
        ['hex', HEX],
        ['important', IMPORTANT],
      ]),
      html: makeHl([
        ['comment', HTML_COMMENT],
        ['string', S_DQ + '|' + S_SQ],
        ['tag', TAG],
        ['attr', ATTR],
      ]),
      sh: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ + '|' + S_BT],
        ['variable', VAR],
        ['number', NUM],
        ['keyword', kwWord(SH_KW)],
      ]),
      yaml: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['bool', '\\b(?:true|false|null|yes|no|on|off)\\b'],
        ['key', YAML_KEY],
      ], 'gm'),
      sql: makeHl([
        ['comment', SQL_LINE + '|' + C_BLK],
        ['string', S_SQ + '|' + S_DQ],
        ['number', NUM],
        ['keyword', kwWord(SQL_KW)],
        ['function', FUNC_PY],
      ], 'gi'),
      json: makeHl([
        ['string', S_DQ],
        ['number', NUM],
        ['bool', '\\b(?:true|false|null)\\b'],
      ]),
      c: cFamily(C_KW),
      cpp: cFamily(C_KW),
      go: cFamily(GO_KW),
      rust: cFamily(RUST_KW),
      java: cFamily(JAVA_KW),
      rb: makeHl([
        ['comment', HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['number', NUM],
        ['keyword', kwWord(RB_KW)],
        ['function', FUNC_PY],
        ['class', CLASS],
      ]),
      php: makeHl([
        ['comment', C_LINE + '|' + C_BLK + '|' + HASH],
        ['string', S_DQ + '|' + S_SQ],
        ['variable', VAR_PHP],
        ['number', NUM],
        ['keyword', kwWord(PHP_KW)],
        ['function', FUNC_PY],
      ]),
    };

    var HL_LANG_MAP = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', javascript: 'js',
      ts: 'js', tsx: 'js', mts: 'js', cts: 'js', typescript: 'js',
      json: 'json', jsonc: 'json', json5: 'js',
      py: 'py', python: 'py', pyw: 'py',
      rb: 'rb', ruby: 'rb',
      go: 'go', golang: 'go',
      rs: 'rust', rust: 'rust',
      java: 'java',
      c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'c', csharp: 'c',
      kotlin: 'c', kt: 'c', swift: 'c',
      php: 'php',
      yaml: 'yaml', yml: 'yaml', toml: 'sh', ini: 'sh', conf: 'sh', properties: 'sh', env: 'sh',
      md: 'md', markdown: 'md', mdx: 'md',
      html: 'html', htm: 'html', xhtml: 'html', vue: 'html', xml: 'html', svg: 'html',
      css: 'css', scss: 'css', less: 'css',
      sql: 'sql',
      lua: 'c',
      sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', fish: 'sh',
    };

    var HL_LANG_NAMES = {
      js: 'JavaScript', py: 'Python', css: 'CSS', html: 'HTML/XML', sh: 'Shell',
      yaml: 'YAML', sql: 'SQL', c: 'C/C++', cpp: 'C++', go: 'Go', rust: 'Rust',
      java: 'Java', rb: 'Ruby', php: 'PHP', json: 'JSON', plain: 'Text',
    };

    function hlLangOf(hint) {
      var h = String(hint || '').toLowerCase();
      if (h.charAt(0) === '.') h = h.slice(1);
      return HL_LANG_MAP[h] || 'plain';
    }

    function hlLangLabel(hint) { return HL_LANG_NAMES[hlLangOf(hint)] || 'Text'; }

    function highlightCode(src, hint) {
      var fn = HL_ENGINES[hlLangOf(hint)];
      return fn ? fn(String(src)) : escHtml(src);
    }

              // Shared Markdown → HTML renderer (portable JS: var/function, no template
    // literals). This file is inlined verbatim into the standalone page's
    // String.raw template and into the client bundle, so it must never contain a
    // literal backtick (written as \x60) or a dollar-followed-by-brace sequence.
    //
    // Supported flavours:
    //   - Fenced code blocks, highlighted via highlightCode (shared/highlight.js);
    //     mermaid fences are kept verbatim inside a .mermaid container so the
    //     diagram can be rendered by Mermaid afterwards; jsxgraph fences are kept
    //     inside a .jsxgraph container so the script can build an interactive
    //     board afterwards
    //   - TeX math $...$ (inline) / $$...$$ (display): kept as escaped literal
    //     text so MathJax can typeset it afterwards (placeholder tokens protect
    //     the formula internals from every other Markdown rule)
    //   - GFM tables:  | h1 | h2 |  +  delimiter  | :-- | :--: |  + body rows
    //   - Task lists:  - [ ] todo  /  - [x] done  (disabled checkbox)
    //   - Strikethrough ~~x~~, highlight ==x==, superscript ^x^, subscript ~x~
    //   - Bare http(s):// and www. URLs become links automatically
    //   - Whitelisted raw inline HTML: <kbd>, <br>, <sub>, <sup>, <b>, <strong>,
    //     <i>, <em>, <u>, <small>, <mark>, <del>, <ins>, <span>, <font>, <abbr>
    //     (sanitized: no on* handlers, no javascript: URLs)
    //   - Block-level raw HTML: <details>/<summary> (collapsible answers),
    //     <div>, <figure>, <figcaption>, <p>, <ul>/<ol>/<li>, <dl>/<dt>/<dd>,
    //     and raw HTML tables (<table>/<tr>/<th>/<td>…) — each block is
    //     sanitized and its inner Markdown is re-rendered, so content inside
    //     (lists, math, bold, nested blocks) renders too
    //   - Inline SVG: an <svg>…</svg> block is emitted as-is after stripping
    //     <script> and on*="" handlers; ![](local.svg) is resolved relative to the
    //     Markdown file through the /dsh-sidebar-frog/media route when the caller
    //     passes opts.path.
    function sanitizeSvg(raw) {
      var s = String(raw).replace(/<script[\s\S]*?<\/script>/gi, '');
      s = s.replace(/<\/?script[^>]*>/gi, '');
      s = s.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      s = s.replace(/javascript\s*:/gi, '');
      return s;
    }

    // ── Raw HTML sanitization (inline + block) ───────────────────────────────
    // Strip a value that is a script payload rather than ordinary attribute data:
    // javascript:, vbscript:, data:text/html, and expression()/url(javascript:)
    // (IE-era CSS injection). Everything else — colors, sizes, alignment, hrefs
    // to http(s)/relative targets — is kept.
    function sanitizeAttrValue(v) {
      var x = String(v).replace(/["'\x60]/g, '');
      if (/^\s*javascript\s*:/i.test(x) || /^\s*vbscript\s*:/i.test(x)) return '';
      if (/^data\s*:\s*text\/html/i.test(x)) return '';
      x = x.replace(/expression\s*\(/gi, 'x(');
      x = x.replace(/(url\s*\(\s*)(?:javascript\s*:)?/gi, '$1');
      x = x.replace(/behavior\s*:/gi, 'x:');
      return x;
    }
    // Rewrite one raw <tag ...> opener (no content): drops on* handlers and other
    // dangerous attributes, scrubs attribute values, and escapes what remains so
    // the tag cannot be reinterpreted. Returns the sanitized opener string.
    //
    // opts (dir/media, see mdMedia) additionally REBASES the URLs the tag carries:
    // a raw <img src="docs/logo/logo.svg"> in a Markdown file is relative to THAT
    // file, and left alone it resolved against the app's own URL — where it 404s, so
    // the image silently did not appear. ![alt](relative.svg) already went through
    // mdMedia; raw HTML images now do too. Omitted opts (no document path) keep the
    // old behavior: no rebasing.
    function sanitizeHtmlTag(open, opts) {
      var nm = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(open) || [];
      var name = nm[1] || '';
      var body = open.slice(1, -1).replace(/^[a-zA-Z][a-zA-Z0-9-]*/, '');
      var attrs = [];
      var re = /([a-zA-Z][a-zA-Z0-9-]*)((?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)/g;
      var m;
      while ((m = re.exec(body))) {
        var an = m[1];
        var val = m[2] || '';
        var eq = /^\s*=/.test(val);
        if (/^on/i.test(an) || /^(srcdoc|formaction|xlink:href)$/i.test(an)) continue;
        if (!eq) { attrs.push(an); continue; }
        var raw = val.replace(/^\s*=\s*/, '');
        var q = raw.charAt(0);
        if (q === '"' || q === '\'') raw = raw.slice(1, -1);
        var safe = sanitizeAttrValue(raw);
        if (opts) {
          if (/^(src|poster)$/i.test(an)) safe = mdMedia(safe, opts);
          else if (/^srcset$/i.test(an)) safe = mdRebaseSrcset(safe, opts);
        }
        attrs.push(an + '="' + safe.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"');
      }
      return '<' + name + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
    }
    // Block-level raw HTML elements recognized by mdToHtml. details (with
    // summary) is the collapsible "answer" convention used throughout the
    // courseware; the rest are ordinary layout / table containers. Anything not
    // in this set is escaped (the default behavior for unknown markup).
    var BLOCK_HTML_TAGS = {
      details: 1, div: 1, figure: 1, figcaption: 1, summary: 1, p: 1,
      ul: 1, ol: 1, li: 1, dl: 1, dt: 1, dd: 1,
      table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, th: 1, td: 1,
      // <picture> is the light/dark image switch GitHub READMEs use — a <source
      // media="(prefers-color-scheme: dark)"> beside a fallback <img>. It is
      // gathered as a block so a multi-line one survives (line-by-line paragraph
      // handling split it), and rendered by renderPicture.
      picture: 1,
    };
    // A <picture> element, rebuilt from its own children: the <source> elements and
    // the fallback <img> are sanitized and their URLs rebased (see sanitizeHtmlTag),
    // and the browser keeps making the light/dark choice itself — that IS the
    // element's contract, and re-implementing it here would only disagree with the
    // engine on the cases it already handles (width media queries, image formats).
    // Anything else inside is escaped: a <picture> holds sources and an image, so
    // stray text or markup is not silently swallowed.
    function renderPicture(block, opts, startLine, endLine) {
      var open = /<picture((?:\s[^>]*)?)\s*>/i.exec(block);
      var rawOpen = sanitizeHtmlTag('<picture' + (open ? (open[1] || '') : '') + '>', opts);
      var opener = startLine ? mdTag(opts, rawOpen, startLine, endLine) : rawOpen;
      var afterOpen = open ? block.slice(open.index + open[0].length) : block;
      var closeAt = afterOpen.toLowerCase().lastIndexOf('</picture');
      var inner = closeAt >= 0 ? afterOpen.slice(0, closeAt) : afterOpen;
      var out = [];
      var re = /<(?:source|img)\b[^>]*>/gi;
      var m;
      var last = 0;
      while ((m = re.exec(inner))) {
        if (m.index > last) {
          var gap = inner.slice(last, m.index);
          if (gap.trim()) out.push(htmlEscape(gap));
        }
        out.push(sanitizeHtmlTag(m[0], opts));
        last = m.index + m[0].length;
      }
      if (last < inner.length) {
        var tail = inner.slice(last);
        if (tail.trim()) out.push(htmlEscape(tail));
      }
      return opener + out.join('') + '</picture>';
    }
    // Collect the raw source of a block-level HTML element: starts at its opening
    // tag (already on the current line) and runs until the matching closing tag
    // (case-insensitive, closer-tag), counting nested openers so a nested
    // details inside details gathers to the OUTER closer. Unclosed elements
    // are terminated at end-of-document. Fences MAY appear inside — the inner
    // source is re-rendered by mdToHtml, whose fence rule consumes them.
    function gatherBlockHtml(line, i, lines, tag) {
      var reClose = new RegExp('</' + tag + '\\b[^>]*>', 'i');
      var reOpen = new RegExp('<' + tag + '\\b', 'i');
      var depth = (line.match(reOpen) || []).length - (line.match(reClose) || []).length;
      var buf = [line];
      while (depth > 0 && i + 1 < lines.length) {
        i += 1;
        var ln = lines[i];
        buf.push(ln);
        depth += (ln.match(reOpen) || []).length - (ln.match(reClose) || []).length;
      }
      return { block: buf.join('\n'), next: i + 1, closed: depth <= 0 };
    }
    // Inline-ish elements: content is ONE inline source line (whitespace
    // collapsed), not a mini document.
    var INLINE_BLOCK_TAGS = { summary: 1, p: 1, li: 1, dt: 1, dd: 1, figcaption: 1, th: 1, td: 1 };
    // <tr>: render each <th>/<td> cell separately (Markdown inside every cell),
    // keeping the row structure verbatim.
    function renderTr(block, opts, startLine) {
      var reClose = /<\/tr\b[^>]*>/i;
      var cIdx = block.lastIndexOf('</tr');
      var inner = cIdx >= 0 ? block.slice(0, cIdx) : block;
      var closeTag = (block.match(reClose) || ['</tr>'])[0];
      var out = [];
      // The row's own <tr> is emitted by renderBlockHtml, not here; the cells carry
      // the row's line so that a selection inside a cell still resolves to it.
      var cellLine = startLine || 0;
      var reCell = /<(th|td)((?:\s[^>]*)?)\s*>[\s\S]*?<\/\1\s*>/gi;
      var m;
      var last = 0;
      while ((m = reCell.exec(inner))) {
        if (m.index > last) out.push(htmlEscape(inner.slice(last, m.index)));
        var cellAttr = mdTag(opts, sanitizeHtmlTag('<' + m[1] + (m[2] || '') + '>'), cellLine);
        var cellText = m[0].slice(m[0].indexOf('>') + 1, m[0].lastIndexOf('</'));
        cellText = cellText.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        out.push(cellAttr + mdInline(mdEscape(cellText, opts), opts) + '</' + m[1] + '>');
        last = m.index + m[0].length;
      }
      if (last < inner.length) out.push(htmlEscape(inner.slice(last)));
      return out.join('') + closeTag;
    }
    // Turn a collected raw block into sanitized HTML. The opening tag is
    // re-emitted through sanitizeHtmlTag (on* handlers / script URLs dropped).
    // Inner rendering depends on the element:
    //   - <summary> / <p> / <li> / <dt> / <dd> / <figcaption> / <th> / <td>:
    //     one inline line (whitespace collapsed)
    //   - <tr>: cell-aware (see renderTr)
    //   - everything else (details, div, figure, ul, ol, dl, table, thead, tbody,
    //     tfoot): the inner source is a mini Markdown document, re-rendered via
    //     mdToHtml — lists, math, nested blocks, fences all work inside
    function renderBlockHtml(block, tag, opts, startLine, nextLine) {
      var m = new RegExp('<' + tag + '((?:\\s[^>]*)?)\\s*>', 'i').exec(block);
      var openTag = sanitizeHtmlTag(m ? ('<' + tag + (m[1] || '') + '>') : ('<' + tag + '>'));
      // The block's span is known to the caller (gatherBlockHtml counted the lines),
      // so the opener carries it; the INNER render only needs to know where the
      // source it was handed begins.
      var span = mdAnchor(opts, startLine || 0, nextLine || 0);
      if (span) openTag = openTag.slice(0, -1) + span + '>';
      var reClose = new RegExp('</' + tag + '\\b[^>]*>', 'i');
      var closeMatch = block.match(reClose);
      var closeTag = closeMatch ? closeMatch[0] : '</' + tag + '>';
      var inner = '';
      if (m) {
        var openLen = m[0].length;
        var cIdx = closeMatch ? block.lastIndexOf(closeTag) : -1;
        inner = cIdx >= openLen ? block.slice(openLen, cIdx) : block.slice(openLen);
      }
      if (tag === 'tr') return renderTr(block, opts, startLine);
      if (tag === 'picture') return renderPicture(block, opts, startLine, nextLine);
      if (INLINE_BLOCK_TAGS[tag]) {
        var text = inner.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        return openTag + mdInline(mdEscape(text, opts), opts) + closeTag;
      }
      // What follows the opening tag on its own line is inner line 1, so the offset
      // is the opener's line MINUS one: inner line k is source line startLine+k-1.
      var innerOpts = Object.assign({}, opts, { lineOffset: (opts.lineOffset || 0) + (startLine || 1) - 1 });
      return openTag + mdToHtml(inner, innerOpts) + closeTag;
    }

    function mdEscape(s, opts) {
      s = String(s);
      // Protect whitelisted raw inline HTML so the escaping below cannot turn it
      // into visible entity text. Whole elements (opener + content + closer) are
      // protected, mirroring the original kbd/sub/sup behavior:
      //   - paired: kbd/sub/sup, then the simple-markup whitelist — b, strong,
      //     i, em, u, s, small, mark, del, ins, q, span, font, abbr, a — with
      //     any attribute list (colors, sizes, href…); each opener is sanitized
      //     (on* handlers and script-ish URLs dropped, values scrubbed)
      //   - void: br, hr, wbr, and img — an image's src is REBASED onto the media
      //     route when opts carries one (see sanitizeHtmlTag), which is what makes a
      //     raw <img src="docs/logo/logo.svg"> in a README actually appear
      //   - picture: the whole element (sources + fallback image) is rebuilt by
      //     renderPicture, so a <picture> inside a paragraph renders as the image
      //     instead of as visible angle brackets
      //   - single-line svg (sanitized)
      var toks = [];
      s = s.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>|<(b|strong|i|em|u|s|small|mark|del|ins|q|span|font|abbr|a|figcaption)\b[^>]*>[\s\S]*?<\/\1>|<(kbd|sub|sup)>[\s\S]*?<\/\2>|<img\b[^>]*>|<wbr\s*\/?>|<br\s*\/?>|<hr\s*\/?>|<svg[\s\S]*?<\/svg>/gi, function (m) {
        if (/^<svg/i.test(m)) { m = sanitizeSvg(m); }
        else if (/^<picture/i.test(m)) { m = renderPicture(m, opts); }
        else if (/^<(kbd|sub|sup)>/i.test(m)) { /* content is plain text — keep as-is */ }
        else {
          var gi = m.indexOf('>');
          m = sanitizeHtmlTag(m.slice(0, gi + 1), opts) + m.slice(gi + 1);
        }
        toks.push(m);
        return '\x01K' + toks.length + '\x02';
      });
      s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return s.replace(/\x01K(\d+)\x02/g, function (m, d) { return toks[Number(d) - 1] || m; });
    }

    // Escape text for HTML element content WITHOUT mdEscape's token round-trip:
    // whitelisted raw tags (<br>, <kbd>, …) must NOT be reconstructed — the
    // escaped text is later read back verbatim via textContent (Mermaid source).
    function htmlEscape(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── GFM table helpers ───────────────────────────────────────────────────
    function tableCells(line) {
      var s = String(line).trim();
      if (!s) return [];
      if (s.charAt(0) === '|') s = s.slice(1);
      if (s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') s = s.slice(0, -1);
      if (s.indexOf('|') < 0) return [];
      // Split on pipes that are not backslash-escaped, then unescape the ones
      // inside cells. Splitting blindly on every '|' cut a cell in half the moment
      // its content had one — an escaped union type, a shell pipeline, a code span
      // — and shifted every column after it, which is worse than not rendering the
      // table at all because the result still looks like a table.
      var cells = [];
      var cur = '';
      for (var k = 0; k < s.length; k += 1) {
        var ch = s.charAt(k);
        if (ch === '\\' && s.charAt(k + 1) === '|') { cur += '|'; k += 1; continue; }
        if (ch === '|') { cells.push(cur); cur = ''; continue; }
        cur += ch;
      }
      cells.push(cur);
      return cells;
    }
    function isDelimRow(line) {
      var cells = tableCells(line);
      if (!cells || cells.length < 2) return false;
      for (var j = 0; j < cells.length; j += 1) {
        if (!/^\s*:?-+:?\s*$/.test(cells[j])) return false;
      }
      return true;
    }
    function isTableRow(line) {
      return String(line).indexOf('|') >= 0;
    }
    function cellAlign(cell) {
      var t = String(cell).trim();
      var left = t.charAt(0) === ':';
      var right = t.charAt(t.length - 1) === ':';
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    }
    // Resolve a Markdown image src against the hosting media route. Web-ish URLs
    // (scheme:, data:, #fragment, /absolute) are passed through untouched; relative
    // targets are rebased onto the Markdown file's directory. media is only set
    // when the caller supplied opts.path (i.e. a real document is being rendered).
    function mdMedia(url, opts) {
      var media = (opts && opts.media) || '';
      if (!media) return url;
      if (/^(?:[a-z][a-z0-9+.-]*:|data:|#|\/)/i.test(url)) return url;
      var out = media + encodeURIComponent(((opts && opts.dir) || '') + url);
      // The session the document is being read in. The media route resolves a
      // relative path against that session's workspace (see src/host/routes.js), so
      // without it a document-relative image resolves against whatever the sandbox
      // root happens to be — a 404, i.e. a silently broken image.
      if (opts && opts.sessionId) out += '&sessionId=' + encodeURIComponent(opts.sessionId);
      return out;
    }
    // srcset is a comma-separated list of "url [descriptor]" candidates, so each
    // candidate's URL is rebased on its own and its descriptor (2x, 640w) is
    // kept. A srcset carrying a data: URL is passed through untouched: those
    // contain commas of their own, and splitting them would corrupt the value —
    // and a data URL needs no rebasing anyway.
    function mdRebaseSrcset(value, opts) {
      var text = String(value);
      if (!(opts && opts.media) || /data\s*:/i.test(text)) return text;
      return text.split(',').map(function (part) {
        var m = /^(\s*)(\S+)([\s\S]*)$/.exec(part);
        if (!m) return part;
        return m[1] + mdMedia(m[2], opts) + m[3];
      }).join(',');
    }
    function mdCell(src, tag, align, opts, startLine) {
      var st = align ? ' style="text-align:' + align + '"' : '';
      return '<' + tag + st + mdAnchor(opts, startLine || 0) + '>' + mdInline(mdEscape(String(src).trim(), opts), opts) + '</' + tag + '>';
    }

    // ── Inline pass ─────────────────────────────────────────────────────────
    function mdInline(s, opts) {
      opts = opts || {};
      var math = [];
      var kept = [];
      // Protect display ($$...$$) first, then inline ($...$) math. Tokens carry no
      // characters the markup regexes act on, and the restore is verbatim.
      s = s.replace(/\$\$([^$\n]+)\$\$/g, function (m) { math.push(m); return '\x01M' + math.length + '\x02'; });
      s = s.replace(/\$([^$\n]+)\$/g, function (m) { math.push(m); return '\x01M' + math.length + '\x02'; });
      // Re-protect any raw single-line <svg> that mdEscape let through, so the
      // rules below (strong/em, auto-link on xmlns URLs, …) never touch its markup.
      s = s.replace(/<svg[\s\S]*?<\/svg>/gi, function (m) { kept.push(m); return '\x01A' + kept.length + '\x02'; });
      s = s.replace(/\x60([^\x60]+)\x60/g, function (m, c) { return '<code>' + c + '</code>'; });
      // Images and links are shelved as tokens while auto-linking runs, so a URL
      // inside a rendered href/src cannot be wrapped in a second anchor.
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
        kept.push('<img alt="' + alt + '" src="' + mdMedia(url, opts) + '">');
        return '\x01A' + kept.length + '\x02';
      });
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
        kept.push('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
        return '\x01A' + kept.length + '\x02';
      });
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
      s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
      s = s.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
      s = s.replace(/\^([^^\n]+)\^/g, '<sup>$1</sup>');
      s = s.replace(/~([^~\n]+)~/g, '<sub>$1</sub>');
      // Bare URLs. A URL directly after ( is skipped — that shape is a Markdown
      // link target handled above. Trailing punctuation is kept outside the link.
      s = s.replace(/(^|[\s([>])((?:https?:\/\/|www\.)[^\s<>"']+)/g, function (m, pre, url) {
        if (pre === '(') return m;
        var tail = /([.,;:!?)\]}>]+)$/.exec(url);
        var core = url;
        var suffix = '';
        if (tail) { suffix = tail[1]; core = url.slice(0, url.length - suffix.length); }
        if (!core) return m;
        var href = /^www\./i.test(core) ? 'http://' + core : core;
        return pre + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + core + '</a>' + suffix;
      });
      // Tokens can nest — a badge is [![alt](image)](link), so the link token's
      // replacement text CONTAINS the image token. String.replace never rescans
      // what it just wrote, so a single pass left the inner token in the output and
      // the badge rendered as the literal characters "A1" instead of the image.
      // Restoring repeatedly until nothing is left fixes every nesting depth, and the
      // bound is only there so a malformed token cannot spin.
      s = restoreTokens(s, kept, 'A');
      return restoreTokens(s, math, 'M');
    }

    // Replace the \x01<t>\x02 tokens with what they stand for, repeatedly: a token's
    // replacement text may hold another token (see the badge note above). An
    // out-of-range index is left as-is rather than dropped — a missing token must not
    // be able to delete text.
    function restoreTokens(s, list, letter) {
      var re = new RegExp('\\x01' + letter + '(\\d+)\\x02');
      var once = function (text) {
        return text.replace(new RegExp('\\x01' + letter + '(\\d+)\\x02', 'g'), function (m, d) {
          return list[Number(d) - 1] || m;
        });
      };
      for (var pass = 0; pass < 6 && re.test(s); pass += 1) s = once(s);
      return s;
    }

    // ── Lists ───────────────────────────────────────────────────────────────
    // One list, at any depth. The previous rule matched /^\s*[-*+]\s+/ for every
    // line and stripped the leading whitespace, so a nested list came out flat:
    // the structure the document expressed was simply gone. Walking the markers
    // with a stack of open levels keeps it — and gives a wrapped line somewhere to
    // go, where it used to fall out of the list as a stray paragraph still carrying
    // its indentation.
    function mdListMarker(line) {
      var m = /^([ \t]*)([-*+]|\d+\.)([ \t]+)([\s\S]*)$/.exec(String(line));
      if (!m) return null;
      var bullet = m[2].charAt(0);
      return {
        // Tabs count as four columns, the usual reading of a tab stop.
        indent: m[1].replace(/\t/g, '    ').length,
        ordered: !(bullet === '-' || bullet === '*' || bullet === '+'),
        number: parseInt(m[2], 10) || 1,
        body: m[4],
      };
    }

    function mdListBlock(lines, start, opts) {
      // One level. Deeper markers recurse WHILE the parent item is still open, so
      // the nested list is emitted inside the li it belongs to rather than beside
      // it — which is what separates a real nested list from markup a browser will
      // repair on its own and a stylesheet cannot target.
      var first = mdListMarker(lines[start]);
      var base = first.indent;
      var tag = first.ordered ? 'ol' : 'ul';
      // A list that does not start at 1 has to say so, or the browser renumbers it
      // and the document's own numbering is lost.
      var html = ['<' + tag + (tag === 'ol' && first.number !== 1 ? ' start="' + first.number + '"' : '') + '>'];
      var open = false;
      var i = start;
      // Where the open item started, so its <li> can carry a span once the item's
      // last line (a wrapped line, a nested list, a second block) is known. The
      // span is closed when the NEXT item opens, which is the only point at which
      // "the end of this item" is known at all.
      var itemLine = 0;
      var itemIndex = -1;
      var closeItem = function (endLine) {
        if (!open) return;
        var end = endLine || itemLine;
        if (end > itemLine && itemIndex >= 0 && typeof html[itemIndex] === 'string') {
          // The opener was pushed with data-line only (the end was unknown then), so
          // the full span replaces it: strip ALL THREE anchor attributes — the range
          // pair and the label — and splice in the pair. Stripping only the range
          // would leave the element with a stale label beside the new one, and the
          // browser reads the FIRST of two data-lineno attributes: the reader's gutter
          // would draw "6" for an item that spans 6-7.
          var span = mdAnchor(opts, itemLine, end);
          html[itemIndex] = html[itemIndex].replace(/ data-(?:line|line-end|lineno)="[^"]*"/g, '').replace('>', span + '>');
        }
        html.push('</li>');
        open = false;
      };
      var item = function (body, lineNo) {
        itemLine = lineNo;
        var task = /^\[([ xX])\][ \t]?([\s\S]*)$/.exec(body);
        // The mdEscape here used to be called WITHOUT opts, so a task item holding
        // an image kept a document-relative src that never got rebased onto the
        // media route (the plain item below always passed them).
        itemIndex = html.length;
        if (task) {
          html.push('<li class="task-list-item"' + mdAnchor(opts, lineNo) + '><input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + '> ' + mdInline(mdEscape(task[2], opts), opts));
        } else {
          html.push('<li' + mdAnchor(opts, lineNo) + '>' + mdInline(mdEscape(body, opts), opts));
        }
        open = true;
      };
      // An indented line that is not a marker: a wrapped line of the open item, or
      // a second block in it after a blank line. Both are item text — this renderer
      // has no indented-code rule, so that is the least surprising reading.
      var continuation = function (line) {
        html.push(' ' + mdInline(mdEscape(line.replace(/^[ \t]+/, ''), opts), opts));
      };
      while (i < lines.length) {
        var mark = mdListMarker(lines[i]);
        if (mark && mark.indent === base) {
          if ((mark.ordered ? 'ol' : 'ul') !== tag) break;
          if (open) closeItem(i);
          item(mark.body, i + 1);
          i += 1;
          continue;
        }
        if (mark && mark.indent > base) {
          var sub = mdListBlock(lines, i, opts);
          html.push(sub.html);
          i = sub.next;
          continue;
        }
        if (lines[i].trim() === '') {
          // A blank line inside a list is ordinary — spacing, or a paragraph in an
          // item. The list carries on only if something that belongs to it follows.
          var j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j += 1;
          if (j >= lines.length) break;
          var next = mdListMarker(lines[j]);
          if (next && next.indent >= base) { i = j; continue; }
          if (open && lines[j].search(/\S/) > base) { continuation(lines[j]); i = j + 1; continue; }
          break;
        }
        if (open && lines[i].search(/\S/) > base) { continuation(lines[i]); i += 1; continue; }
        break;
      }
      if (open) closeItem(i);
      html.push('</' + tag + '>');
      // The list element carries the whole list's span; each li carries its own, so
      // selecting one item resolves to that item and not to the list.
      var listSpan = mdAnchor(opts, start + 1, i);
      if (listSpan) html[0] = html[0].slice(0, -1) + listSpan + '>';
      return { html: html.join(''), next: i };
    }

    // ── Block pass ──────────────────────────────────────────────────────────
    function mdToHtml(src, opts) {
      opts = opts || {};
      var docPath = String(opts.path || '').replace(/\\/g, '/');
      var lastSlash = docPath.lastIndexOf('/');
      // dir/media can arrive precomputed (recursive block renders pass them
      // through) — only derive them from opts.path when not supplied.
      var mdOpts = {
        dir: opts.dir != null ? opts.dir : (lastSlash >= 0 ? docPath.slice(0, lastSlash + 1) : ''),
        media: opts.media != null ? opts.media : (opts.path ? '/dsh-sidebar-frog/media?path=' : ''),
        // Carried through to every media URL this render produces (see mdMedia).
        sessionId: opts.sessionId || '',
        // The chosen document skin (see src/shared/skins.js): the class the Markdown
        // root carries, so a skin is pure CSS and costs the renderer nothing.
        skin: opts.skin || '',
        // Source-line anchors are OPT-IN. The reader surfaces ask for them (the
        // panel, the shell's document tab, the popout page) because they are what
        // turns "the paragraph I selected" into "lines 12-14 of this file"; every
        // other caller keeps the plain shapes it has always produced, so nothing
        // about the rendered document moves for a caller that did not ask.
        lineAnchors: opts.lineAnchors === true,
        // Added to every anchored line number. Nested renders (a blockquote inside a
        // details, an item inside a list) are handed a slice of the source, so their
        // own line 1 is not the document's line 1.
        lineOffset: opts.lineOffset || 0,
      };
      var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
      var out = [];
      var i = 0;
      while (i < lines.length) {
        var line = lines[i];
        var fenceOpen = /^\s*(\x60{3,}|~{3,})([\w+-]*)/.exec(line);
        if (fenceOpen) {
          var fenceStart = i + 1;
          var fenceCh = fenceOpen[1].charAt(0);
          var langHint = fenceOpen[2];
          // Only the fence character that opened the block closes it: a tilde
          // fence inside a backtick block is content, and vice versa.
          var fenceClose = fenceCh === '~' ? /^\s*~{3,}/ : /^\s*\x60{3,}/;
          var buf = [];
          i += 1;
          while (i < lines.length && !fenceClose.test(lines[i])) { buf.push(lines[i]); i += 1; }
          var fenceEnd = (i < lines.length ? i : i - 1) + 1;
          i += 1;
          var codeText = buf.join('\n');
          // The whole fence is one anchored block. Its lines are NOT anchored
          // individually: the highlighted HTML is produced by highlightCode, whose
          // multi-line tokens would be cut in half by a per-line wrapper, and a
          // document that copies badly is worse than one that quotes a few lines too
          // many. Selecting inside a fence resolves to the fence.
          var fenceAnchor = mdAnchor(mdOpts, fenceStart, fenceEnd);
          if (langHint === 'mermaid') {
            // Keep the diagram source verbatim inside a .mermaid container; the
            // renderer replaces it with Mermaid's SVG. tex2jax_ignore keeps the
            // MathJax pass from reading '$'-looking text inside diagram labels.
            out.push('<div class="mermaid tex2jax_ignore"' + fenceAnchor + '>' + htmlEscape(codeText) + '</div>');
          } else if (langHint === 'jsxgraph') {
            // Keep the JSXGraph script verbatim inside a .jsxgraph container; the
            // renderer later runs it (with the generated board id in scope) to
            // build an interactive board. Same MathJax ignore rationale.
            out.push('<div class="jsxgraph tex2jax_ignore"' + fenceAnchor + '>' + htmlEscape(codeText) + '</div>');
          } else {
            out.push('<pre' + fenceAnchor + '><code>' + highlightCode(codeText, langHint) + '</code></pre>');
          }
          continue;
        }
        // Display math: a line starting with $$ (leading spaces allowed). If the
        // closer is not on the same line, keep reading until one appears (code
        // fences were consumed above, so this cannot steal fence content). The
        // whole formula is emitted as one .math-display element whose text node
        // MathJax can typeset as a single $$...$$ block. Newlines inside the
        // formula are collapsed to spaces — TeX treats them as whitespace.
        if (/^\s*\$\$/.test(line)) {
          var mathStart = i + 1;
          var rest = line.replace(/^\s*\$\$/, '');
          var closeIdx = rest.indexOf('$$');
          var parts = [];
          if (closeIdx >= 0) {
            parts.push(rest.slice(0, closeIdx));
            i += 1;
          } else {
            parts.push(rest);
            i += 1;
            while (i < lines.length) {
              var cur = lines[i];
              i += 1;
              var cj = cur.indexOf('$$');
              if (cj >= 0) { parts.push(cur.slice(0, cj)); break; }
              parts.push(cur);
            }
          }
          var mathBody = parts.join('\n').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
          out.push('<div class="math-display"' + mdAnchor(mdOpts, mathStart, i) + '>' + mdEscape('$$' + mathBody + '$$', mdOpts) + '</div>');
          continue;
        }
        // Standalone SVG block: gather until the closing tag, then emit sanitized.
        if (/^\s*<svg/i.test(line)) {
          var svgStart = i + 1;
          var svgBuf = [line];
          var closed = /<\/svg>/i.test(line);
          while (!closed && i + 1 < lines.length) {
            i += 1;
            svgBuf.push(lines[i]);
            closed = /<\/svg>/i.test(lines[i]);
          }
          var svgEnd = i + 1;
          // The sanitized SVG is emitted as-is; the anchor rides on a wrapper so the
          // svg element itself is untouched (a bare <svg> with an extra attribute
          // would be a second thing to sanitize).
          out.push(mdOpts.lineAnchors
            ? '<div class="artifacts-md-svgblock"' + mdAnchor(mdOpts, svgStart, svgEnd) + '>' + sanitizeSvg(svgBuf.join('\n')) + '</div>'
            : sanitizeSvg(svgBuf.join('\n')));
          i += 1;
          continue;
        }
        // Block-level raw HTML (whitelisted: details/div/figure/figcaption/
        // summary/p/ul/ol/li/dl/dt/dd). Gather through the matching closing tag,
        // sanitize the opener, and re-render the inner source as Markdown — so a
        // <details><summary>答案</summary> block shows collapsible, fully rendered
        // content (math, lists, bold…). Unknown tags on a line are escaped by the
        // paragraph rule, exactly as before.
        var bhMatch = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)\b/.exec(line);
        if (bhMatch && BLOCK_HTML_TAGS[bhMatch[1].toLowerCase()]) {
          var bhTag = bhMatch[1].toLowerCase();
          if (!(bhTag === 'summary' && /\/\s*>$/.test(line))) {
            var bhStart = i + 1;
            var bh = gatherBlockHtml(line, i, lines, bhTag);
            out.push(renderBlockHtml(bh.block, bhTag, mdOpts, bhStart, bh.next));
            i = bh.next;
            continue;
          }
        }
        // GFM table: header row + delimiter row (+ optional body rows).
        if (isTableRow(line) && i + 1 < lines.length && isDelimRow(lines[i + 1])) {
          var tblStart = i + 1;
          var headCells = tableCells(line);
          var delimCells = tableCells(lines[i + 1]);
          var aligns = [];
          for (var a = 0; a < headCells.length; a += 1) aligns.push(cellAlign(delimCells[a] || ''));
          var tbl = ['<table>'];
          tbl.push('<thead><tr' + mdAnchor(mdOpts, tblStart) + '>');
          for (var h = 0; h < headCells.length; h += 1) tbl.push(mdCell(headCells[h], 'th', aligns[h], mdOpts, tblStart));
          tbl.push('</tr></thead>');
          i += 2;
          var openedBody = false;
          while (i < lines.length && isTableRow(lines[i]) && !isDelimRow(lines[i])) {
            var cells = tableCells(lines[i]);
            if (!openedBody) { tbl.push('<tbody>'); openedBody = true; }
            tbl.push('<tr' + mdAnchor(mdOpts, i + 1) + '>');
            for (var c = 0; c < headCells.length; c += 1) tbl.push(mdCell(cells[c] == null ? '' : cells[c], 'td', aligns[c], mdOpts, i + 1));
            tbl.push('</tr>');
            i += 1;
          }
          if (openedBody) tbl.push('</tbody>');
          tbl.push('</table>');
          // The table element carries the whole span; its rows carry their own line,
          // so a selected ROW resolves to that row rather than to the whole table.
          // The opener is rewritten here rather than spliced into the finished HTML:
          // the end line is only known once the body rows have been read.
          var tableSpan = mdAnchor(mdOpts, tblStart, i);
          if (tableSpan) tbl[0] = '<table' + tableSpan + '>';
          out.push(tbl.join(''));
          continue;
        }
        var hd = /^(#{1,6})\s+(.*)$/.exec(line);
        if (hd) {
          var lv = hd[1].length;
          out.push('<h' + lv + mdAnchor(mdOpts, i + 1) + '>' + mdInline(mdEscape(hd[2], mdOpts), mdOpts) + '</h' + lv + '>');
          i += 1;
          continue;
        }
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr' + mdAnchor(mdOpts, i + 1) + '>'); i += 1; continue; }
        if (/^\s*>\s?/.test(line)) {
          var qStart = i + 1;
          var q = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
          var qEnd = i;
          // A quote holds BLOCKS, not a run of inline text. Stripping the marker and
          // running the remainder through mdInline — which is what this did — drew
          // a quoted "- a" as the literal characters "- a": every list, heading,
          // fence, table and nested quote inside a quote came out as text, which is
          // the marker showing up in the document rather than a subtle drift.
          // Re-entering the block renderer on the stripped lines fixes all of them
          // at once, and nesting needs no special handling because each level strips
          // exactly one marker before recursing.
          //
          // A quote whose body is a single paragraph keeps its previous shape (the
          // p wrapper is dropped), so nothing already written looks different. The
          // test is deliberately literal — starts with the p opener, ends with its
          // closer, and the first closer is the last four characters — because a
          // greedy /^<p>([\s\S]*)<\/p>$/ matches from the first opener to the LAST
          // closer and would tear the tags out of a two-paragraph quote.
          // Each stripped line is the next source line, so the inner render is offset
          // by one less than the quote's first line.
          var quoted = mdToHtml(q.join('\n'), Object.assign({}, mdOpts, { lineOffset: (mdOpts.lineOffset || 0) + qStart - 1 }));
          var oneParagraph = quoted.slice(0, 3) === '<p>' && quoted.slice(-4) === '</p>' &&
            quoted.indexOf('</p>') === quoted.length - 4;
          var quoteInner = oneParagraph ? quoted.slice(quoted.indexOf('>') + 1, -4) : quoted;
          out.push('<blockquote' + mdAnchor(mdOpts, qStart, qEnd) + '>' + quoteInner + '</blockquote>');
          continue;
        }
        if (mdListMarker(line)) {
          var list = mdListBlock(lines, i, mdOpts);
          out.push(list.html);
          i = list.next;
          continue;
        }
        // Setext heading: an underlined title. Only the '=' form is honoured here.
        // A '---' underline is also a horizontal rule, and this renderer has always
        // drawn it as one, so re-reading it as an h2 is a change nobody asked for.
        // '=====' cannot be anything but an underline, and today it renders as a
        // paragraph containing '=====', which is never what was meant.
        if (line.trim() !== '' && i + 1 < lines.length && /^\s*=+\s*$/.test(lines[i + 1])) {
          out.push('<h1' + mdAnchor(mdOpts, i + 1, i + 2) + '>' + mdInline(mdEscape(line.trim(), mdOpts), mdOpts) + '</h1>');
          i += 2;
          continue;
        }
        if (line.trim() === '') { i += 1; continue; }
        out.push('<p' + mdAnchor(mdOpts, i + 1) + '>' + mdInline(mdEscape(line, mdOpts), mdOpts) + '</p>');
        i += 1;
      }
      return out.join('\n');
    }

    // ── Source-line anchors ─────────────────────────────────────────────────────
    // The block pass stamps every element a reader can see with the 1-based SOURCE
    // line it came from, and with the last line it covers when that is more than
    // one. That attribute is the whole mechanism: a selection inside the rendered
    // document can be walked up to the nearest anchored element, and the reader gets
    // "lines 12-14 of this file" — precise enough to quote into a request, or to
    // send an editor straight to it — without the renderer having to keep a second,
    // parallel map of the document.
    //
    // It is opt-in (mdToHtml's lineAnchors) because these attributes are decoration:
    // a caller that asked for none must keep the exact markup it always produced.
    function mdAnchor(opts, start, end) {
      if (!opts || opts.lineAnchors !== true) return '';
      var base = opts.lineOffset || 0;
      var from = base + start;
      var to = base + (end == null ? start : end);
      if (!(from > 0)) return '';
      // data-lineno is the LABEL a reader displays, decided here beside the range it
      // describes so that "12" and "12–18" can never disagree with the data-line pair
      // the selection bar quotes (see .artifacts-markdown.is-lines in styles.js).
      var label = to > from ? from + '\u2013' + to : String(from);
      return ' data-line="' + from + '"' + (to > from ? ' data-line-end="' + to + '"' : '') +
        ' data-lineno="' + label + '"';
    }

    // Same anchor, spliced into an already-built opening tag: <p ...> becomes <p ... ...>.
    function mdTag(opts, tagHtml, start, end) {
      var a = mdAnchor(opts, start, end);
      return a && tagHtml.charAt(tagHtml.length - 1) === '>' ? tagHtml.slice(0, -1) + a + '>' : tagHtml;
    }

    // The source lines one rendered node stands for: the node itself when it is an
    // anchored element, otherwise its nearest anchored ancestor. Null when there is
    // no anchor above it (inline-only content, or a document rendered without them).
    function mdLinesOfNode(node) {
      var el = node;
      try {
        if (el && el.nodeType === 3) el = el.parentElement;
        if (el && typeof el.closest === 'function') el = el.closest('[data-line]');
        else { while (el && !(el.getAttribute && el.getAttribute('data-line'))) el = el.parentNode; }
      } catch (e) { return null; }
      if (!el || typeof el.getAttribute !== 'function') return null;
      var start = parseInt(el.getAttribute('data-line'), 10);
      if (!(start > 0)) return null;
      var endAttr = parseInt(el.getAttribute('data-line-end'), 10);
      return { start: start, end: endAttr > start ? endAttr : start };
    }

    // The range a live selection covers. Both ends are resolved and then ordered, so
    // a selection dragged upwards reads the same as one dragged down. Null when
    // either end is unanchored, or when the selection is not inside root — a
    // selection in the file tree must not be read as a line range of the document.
    function mdSelectionLines(root, sel) {
      if (!sel) return null;
      var a = mdLinesOfNode(sel.anchorNode);
      var b = mdLinesOfNode(sel.focusNode || sel.anchorNode);
      if (!a || !b) return null;
      if (root && typeof root.contains === 'function') {
        var node = sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
        if (node && !root.contains(node)) return null;
      }
      return a.start <= b.end ? { start: a.start, end: b.end } : { start: b.start, end: a.end };
    }

    // Lines [start, end] (1-based, inclusive) of a source text. Out-of-range values
    // are clamped rather than refused: a document that changed under the reader must
    // still produce a quote of what is there now.
    function mdSourceLines(text, start, end) {
      var all = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
      var from = Math.max(1, parseInt(start, 10) || 1);
      var to = Math.max(from, parseInt(end, 10) || from);
      if (from > all.length) return '';
      return all.slice(from - 1, Math.min(to, all.length)).join('\n');
    }

    // The info string of a fenced quote, from the file's own extension: a quote the
    // model reads should say what language it is, and guessing from the content is
    // how a shell transcript ends up highlighted as Python.
    function mdQuoteLang(path) {
      var m = /\.([A-Za-z0-9]+)$/.exec(String(path || ''));
      if (!m) return '';
      var ext = m[1].toLowerCase();
      var map = {
        md: 'md', markdown: 'md', js: 'js', mjs: 'js', cjs: 'js', ts: 'ts', tsx: 'tsx', jsx: 'jsx',
        py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c',
        cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', ps1: 'powershell',
        json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml',
        html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', sql: 'sql', txt: '',
      };
      return Object.prototype.hasOwnProperty.call(map, ext) ? map[ext] : ext;
    }

    // The payload a reader gets for one selected range: a locator the agent can act
    // on (path:12-14) followed by exactly those source lines in a fence.
    //
    // The line numbers stay OUT of the fence on purpose. A model handed
    // "12 | const a = 1" will happily write the numbers back into the file, and a
    // patch that corrupts the document is a worse failure than a quote that carries
    // one less hint. The locator above the fence is the only place they appear, and
    // it names the same range the fence holds.
    function mdLineQuote(path, start, end, text) {
      var p = String(path || '').replace(/\\/g, '/');
      var from = parseInt(start, 10) || 1;
      var to = Math.max(from, parseInt(end, 10) || from);
      var body = mdSourceLines(text, from, to);
      // A quote that contains its own closing fence would end early; the longer
      // fence is the standard answer and needs no escaping.
      var fence = /(^|\n)\s*\x60{3}/.test(body) ? '~~~~' : '\x60\x60\x60';
      var lang = mdQuoteLang(p);
      return '@' + p + ':' + from + (to > from ? '-' + to : '') + '\n' +
        fence + lang + '\n' + body + '\n' + fence + '\n';
    }

    // ── The selection bar ───────────────────────────────────────────────────────
    // One floating bar, positioned over the current selection of a RENDERED
    // document: it names the source range and offers the two things a reader wants
    // from it — quote those lines, or open them where they can be edited.
    //
    // Plain DOM and no framework, because the panel (React) and the popout page
    // (plain DOM) both need it; it is appended to <body> rather than into the
    // document, because the panel is a CSS containing block (container-type:
    // inline-size) and a fixed child of it would be positioned against the panel
    // instead of the viewport — the trap that once put the file tree's context menu
    // off screen entirely.
    //
    // opts:
    //   root     — the rendered container a selection must be inside
    //   path     — the document's path (the locator's left half)
    //   text     — the document's SOURCE (the quote is taken from here, not from
    //              the selection, so the reply names exactly the lines it shows)
    //   onQuote  — (payload, range) → void
    //   onLocate — optional (start, end) → void; when absent the 定位 button is not
    //              drawn at all (a button that cannot do anything is worse than none)
    function attachMarkdownSelectionBar(opts) {
      opts = opts || {};
      var root = opts.root;
      var doc = (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
      if (!doc || !root || typeof doc.createElement !== 'function') return function () {};

      var bar = doc.createElement('div');
      bar.className = 'artifacts-mdselbar';
      bar.setAttribute('role', 'toolbar');
      var label = doc.createElement('span');
      label.className = 'artifacts-mdselbar-label';
      bar.appendChild(label);
      var quoteBtn = doc.createElement('button');
      quoteBtn.type = 'button';
      quoteBtn.className = 'artifacts-mdselbar-btn';
      quoteBtn.textContent = '引用';
      quoteBtn.title = '把这部分（含文件路径与行号）放进输入框';
      bar.appendChild(quoteBtn);
      var locateBtn = null;
      if (typeof opts.onLocate === 'function') {
        locateBtn = doc.createElement('button');
        locateBtn.type = 'button';
        locateBtn.className = 'artifacts-mdselbar-btn';
        locateBtn.textContent = '定位';
        locateBtn.title = '在编辑器里打开并选中这几行';
        bar.appendChild(locateBtn);
      }
      bar.style.display = 'none';
      if (doc.body && doc.body.appendChild) doc.body.appendChild(bar);

      var current = null;
      var raf = null;
      var hide = function () {
        current = null;
        bar.style.display = 'none';
      };
      var show = function (range, rect) {
        current = range;
        label.textContent = range.start === range.end ? '第 ' + range.start + ' 行' : '第 ' + range.start + '–' + range.end + ' 行';
        bar.style.display = 'flex';
        // Measured after it is visible: a hidden element has no box to center on.
        var w = bar.offsetWidth || 180;
        var h = bar.offsetHeight || 28;
        var viewportW = (doc.documentElement && doc.documentElement.clientWidth) || 1024;
        var left = Math.max(8, Math.min((rect.left + rect.width / 2) - w / 2, viewportW - w - 8));
        var top = rect.top - h - 6;
        // A selection at the very top of the viewport gets the bar below it instead
        // of under the toolbar, where it would be unreachable.
        if (top < 8) top = Math.min(rect.bottom + 6, ((doc.documentElement && doc.documentElement.clientHeight) || 768) - h - 8);
        bar.style.left = Math.round(left) + 'px';
        bar.style.top = Math.round(top) + 'px';
      };
      var update = function () {
        raf = null;
        var sel = typeof doc.getSelection === 'function' ? doc.getSelection() : null;
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hide(); return; }
        var range = mdSelectionLines(root, sel);
        if (!range) { hide(); return; }
        var rect = null;
        try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) { rect = null; }
        if (!rect || (!rect.width && !rect.height)) { hide(); return; }
        show(range, rect);
      };
      var schedule = function () {
        if (raf !== null) return;
        // Deferred by a frame: selectionchange fires while the browser is still
        // moving the selection, and reading a rect mid-gesture is how a bar lands
        // one selection behind the pointer.
        raf = (typeof requestAnimationFrame === 'function')
          ? requestAnimationFrame(update)
          : setTimeout(update, 16);
      };
      var onKey = function (e) { if (e && (e.key === 'Escape' || e.key === 'Esc')) hide(); };
      var onQuote = function () {
        if (!current) return;
        var payload = mdLineQuote(opts.path, current.start, current.end, opts.text);
        var range = current;
        hide();
        try { opts.onQuote(payload, range); } catch (e) {}
      };
      var onLocateClick = function () {
        if (!current) return;
        var range = current;
        hide();
        try { opts.onLocate(range.start, range.end); } catch (e) {}
      };

      doc.addEventListener('selectionchange', schedule);
      doc.addEventListener('mouseup', schedule);
      doc.addEventListener('keyup', schedule);
      doc.addEventListener('keydown', onKey);
      // Capture, so a scroll inside the document pane counts: a fixed bar left over
      // a scrolled-away paragraph is worse than no bar.
      (doc.defaultView || (typeof window !== 'undefined' ? window : null) || doc).addEventListener('scroll', hide, true);
      quoteBtn.addEventListener('click', onQuote);
      if (locateBtn) locateBtn.addEventListener('click', onLocateClick);

      return function dispose() {
        doc.removeEventListener('selectionchange', schedule);
        doc.removeEventListener('mouseup', schedule);
        doc.removeEventListener('keyup', schedule);
        doc.removeEventListener('keydown', onKey);
        (doc.defaultView || (typeof window !== 'undefined' ? window : null) || doc).removeEventListener('scroll', hide, true);
        if (bar.parentNode) bar.parentNode.removeChild(bar);
        current = null;
      };
    }

              // ── Document skins for rendered Markdown ────────────────────────────────────
    // A skin is TYPOGRAPHY AND LAYOUT — heading rules, density, how a code block,
    // a quote, a table and an image sit on the page — so the same document reads
    // like the platform whose skin is chosen. It is deliberately NOT a color
    // scheme: every color comes from the app's own design tokens
    // (--dsw-alias-*), which is what lets one stylesheet serve the panel, the
    // shell's document tab and the standalone popout page in both light and dark
    // themes. A hardcoded light palette would look broken in a dark app, and the
    // platform's own palette is not what a reader inside DSH is looking at.
    //
    // Portable JS (var/function, no template literals, no closing script tag): this
    // file is inlined into the client bundle AND into the popout page's String.raw
    // template, and a backtick or a dollar-brace in it would end that template.
    //
    // Every rule is scoped by the class the Markdown ROOT carries (see
    // markdownSkinClass), so skins never reach anything else on the page.
    //
    // default is the shipped look (its rules live in the panel's stylesheet and
    // the popout page's), so it contributes no CSS at all.

    var MD_SKIN_DEFAULT = 'default';

    var MD_SKIN_LABELS = {
      default: '默认（跟随主题）',
      github: 'GitHub',
      wechat: '微信（公众号）',
      zhihu: '知乎',
    };

    // The order the settings panel lists them in: the shipped look first, then the
    // platforms by how often a Markdown document is written for one.
    var MD_SKIN_ORDER = ['default', 'github', 'wechat', 'zhihu'];

    var MD_SKIN_CSS = {
      github: [
        '.md-skin-github { font-size: 14px; line-height: 1.6; }',
        '.md-skin-github h1 { font-size: 1.75em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: .3em; }',
        '.md-skin-github h2 { font-size: 1.4em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: .3em; }',
        '.md-skin-github h3 { font-size: 1.2em; }',
        '.md-skin-github h4, .md-skin-github h5, .md-skin-github h6 { font-size: 1em; }',
        '.md-skin-github h1, .md-skin-github h2, .md-skin-github h3 { margin: 20px 0 12px; }',
        '.md-skin-github p { margin: 12px 0; }',
        '.md-skin-github ul, .md-skin-github ol { padding-left: 2em; }',
        '.md-skin-github li + li { margin-top: 4px; }',
        '.md-skin-github code { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: .2em .4em; font-size: .85em; }',
        '.md-skin-github pre { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: 16px; line-height: 1.45; }',
        '.md-skin-github pre code { background: transparent; padding: 0; font-size: .85em; }',
        '.md-skin-github blockquote { border-left: .25em solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); padding: 0 1em; margin: 12px 0; }',
        '.md-skin-github blockquote > :first-child { margin-top: 0; }',
        '.md-skin-github blockquote > :last-child { margin-bottom: 0; }',
        '.md-skin-github hr { border: 0; border-bottom: 1px solid var(--dsw-alias-border-l2); height: 0; margin: 24px 0; }',
        '.md-skin-github table { display: table; width: auto; max-width: 100%; }',
        '.md-skin-github th, .md-skin-github td { border: 1px solid var(--dsw-alias-border-l2); padding: 6px 13px; }',
        '.md-skin-github thead tr { background: var(--dsw-alias-bg-layer-1); }',
        '.md-skin-github img { max-width: 100%; box-sizing: content-box; }',
      ].join('\n'),
      wechat: [
        '.md-skin-wechat { font-size: 16px; line-height: 1.75; letter-spacing: .04em; }',
        '.md-skin-wechat h1, .md-skin-wechat h2, .md-skin-wechat h3, .md-skin-wechat h4 { border-bottom: 0; padding-bottom: 0; font-weight: 600; }',
        '.md-skin-wechat h1 { font-size: 1.4em; margin: 26px 0 14px; }',
        '.md-skin-wechat h2 { font-size: 1.25em; margin: 24px 0 12px; }',
        '.md-skin-wechat h3 { font-size: 1.1em; margin: 20px 0 10px; }',
        '.md-skin-wechat p { margin: 18px 0; }',
        '.md-skin-wechat ul, .md-skin-wechat ol { padding-left: 1.6em; }',
        '.md-skin-wechat li { margin: 8px 0; }',
        '.md-skin-wechat code { background: var(--dsw-alias-bg-layer-1); padding: .15em .4em; border-radius: 3px; font-size: .9em; }',
        '.md-skin-wechat pre { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: 14px 16px; line-height: 1.6; }',
        '.md-skin-wechat pre code { background: transparent; padding: 0; }',
        '.md-skin-wechat blockquote { border-left: 3px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); padding: 12px 14px; margin: 18px 0; }',
        '.md-skin-wechat a { text-decoration: none; border-bottom: 1px solid currentColor; }',
        // A 公众号 lays its images out as centered blocks, and separates sections
        // with a dashed rule rather than a solid one.
        '.md-skin-wechat img { display: block; margin: 18px auto; }',
        '.md-skin-wechat picture { display: block; text-align: center; }',
        '.md-skin-wechat hr { border: 0; border-top: 1px dashed var(--dsw-alias-border-l2); margin: 28px 0; }',
        '.md-skin-wechat table { display: table; width: 100%; font-size: .95em; }',
        '.md-skin-wechat th, .md-skin-wechat td { border: 1px solid var(--dsw-alias-border-l1); padding: 8px 10px; }',
      ].join('\n'),
      zhihu: [
        '.md-skin-zhihu { font-size: 15px; line-height: 1.7; }',
        '.md-skin-zhihu h1, .md-skin-zhihu h2, .md-skin-zhihu h3, .md-skin-zhihu h4 { border-bottom: 0; padding-bottom: 0; font-weight: 600; }',
        '.md-skin-zhihu h2 { font-size: 1.3em; margin: 26px 0 12px; }',
        '.md-skin-zhihu h3 { font-size: 1.15em; margin: 22px 0 10px; }',
        '.md-skin-zhihu p { margin: 14px 0; }',
        '.md-skin-zhihu code { background: var(--dsw-alias-bg-layer-1); border-radius: 3px; padding: .15em .35em; font-size: .9em; }',
        '.md-skin-zhihu pre { border-radius: 4px; padding: 12px 16px; }',
        '.md-skin-zhihu blockquote { border-left: 3px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); color: var(--dsw-alias-label-secondary); padding: 4px 16px; margin: 16px 0; }',
        '.md-skin-zhihu img { border-radius: 4px; }',
        '.md-skin-zhihu table { display: table; width: 100%; font-size: .95em; }',
        '.md-skin-zhihu th, .md-skin-zhihu td { border: 1px solid var(--dsw-alias-border-l1); padding: 7px 10px; }',
        '.md-skin-zhihu thead tr { background: var(--dsw-alias-bg-layer-1); }',
      ].join('\n'),
    };

    // The skin actually applied: an unknown or missing name is the shipped look, so
    // a hand-edited localStorage entry can never leave a document unstyled.
    function markdownSkinName(name) {
      return Object.prototype.hasOwnProperty.call(MD_SKIN_CSS, name) ? name : MD_SKIN_DEFAULT;
    }

    // The extra class the Markdown root carries. Empty for the default skin.
    function markdownSkinClass(name) {
      var n = markdownSkinName(name);
      return n === MD_SKIN_DEFAULT ? '' : ' md-skin-' + n;
    }

    // The CSS for one skin: '' for the default (its rules are the base stylesheet).
    function markdownSkinCss(name) {
      return MD_SKIN_CSS[markdownSkinName(name)] || '';
    }

    // [{ value, label }] for the settings control, in listing order.
    function markdownSkinOptions() {
      return MD_SKIN_ORDER.map(function (name) {
        return { value: name, label: MD_SKIN_LABELS[name] || name };
      });
    }

              // ── 编辑 (editing) — the shared half ────────────────────────────────────────
    //
    // Markdown and plain-text editing, used by BOTH faces of this plugin: the
    // sidebar mounts it from a React effect, the popout page mounts it from plain
    // DOM, and CodeMirror itself is identical either way. Keeping the editor core
    // here (rather than in the client bundle) is what lets the popout tab edit too
    // without a second implementation that drifts.
    //
    // CodeMirror 6 is VENDORED, not a dependency: 604 KB minified, served from
    // /dsh-sidebar-frog/codemirror/codemirror.min.js as an IIFE that publishes
    // window.DshFrogCM, and fetched lazily the first time an editor is actually
    // opened — the same contract as the vendored pdf.js / MathJax / Mermaid
    // bundles. The build and its exact package versions are in
    // src/vendor/codemirror/README.md.
    //
    // NOTE: no backticks and no dollar-brace anywhere in this file. It is inlined
    // into the popout page's single String.raw literal, where either one would end
    // the literal and take the whole page's script with it (scripts/check.js
    // enforces this for the same reason it does in src/shared/paths.js).

    var EDITOR_SCRIPT_URL = '/dsh-sidebar-frog/codemirror/codemirror.min.js'

    // Suffix → editor language. A suffix that is not here (or a file with no
    // suffix) is still editable: it opens as plain text with the same furniture —
    // line numbers, undo history, search, soft wrap. That is the honest default,
    // because a wrong grammar colours the text with confident nonsense.
    var EDITOR_LANGS = {
      md: 'markdown', markdown: 'markdown', mdx: 'markdown',
      js: 'javascript', mjs: 'javascript', cjs: 'javascript',
      jsx: 'jsx', ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
      json: 'json', jsonc: 'json', json5: 'json',
      py: 'python', pyw: 'python',
      yaml: 'yaml', yml: 'yaml',
      css: 'css', scss: 'css', less: 'css',
      html: 'html', htm: 'html', xhtml: 'html', vue: 'html', svg: 'html', xml: 'html',
    }

    // Fenced-code info strings inside a Markdown document, so a python block is
    // highlighted as Python instead of as Markdown prose. Only the languages this
    // bundle actually carries — anything else stays uncoloured rather than guessed.
    var EDITOR_FENCES = {
      js: 'javascript', javascript: 'javascript', mjs: 'javascript', cjs: 'javascript',
      jsx: 'jsx', ts: 'typescript', typescript: 'typescript', tsx: 'tsx',
      json: 'json', jsonc: 'json',
      py: 'python', python: 'python',
      yaml: 'yaml', yml: 'yaml',
      css: 'css', scss: 'css', less: 'css',
      html: 'html', xml: 'html', svg: 'html',
      md: 'markdown', markdown: 'markdown',
    }

    // The editor's own chrome, drawn by CodeMirror's theme API: a plugin cannot
    // restyle .cm-* rules from a stylesheet reliably (CodeMirror injects its own
    // sheets after ours and both are plain classes), so colours that must follow the
    // theme are declared here where they win by construction.
    function editorTheme(CM, dark) {
      var bg = dark ? '#1b1b1d' : '#ffffff'
      var fg = dark ? '#e4e4e7' : '#1f2328'
      var gutterBg = dark ? '#18181a' : '#f6f7f9'
      var gutterFg = dark ? '#5c6370' : '#9aa0a6'
      var activeBg = dark ? '#232326' : '#f2f4f7'
      var selBg = dark ? '#2f4f6f' : '#cfe3ff'
      var border = dark ? '#2c2c30' : '#e3e6ea'
      var accent = dark ? '#6cb2f7' : '#0b62d0'
      var panelBg = dark ? '#202024' : '#f6f7f9'
      return CM.EditorView.theme({
        '&': {
          color: fg,
          backgroundColor: bg,
          fontSize: '12.5px',
          height: '100%',
        },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          lineHeight: '1.65',
          overflow: 'auto',
        },
        '.cm-content': { caretColor: accent, padding: '6px 0' },
        '.cm-line': { padding: '0 8px' },
        '.cm-gutters': {
          backgroundColor: gutterBg,
          color: gutterFg,
          border: 'none',
          borderRight: '1px solid ' + border,
        },
        '.cm-activeLineGutter': { backgroundColor: activeBg, color: fg },
        '.cm-activeLine': { backgroundColor: activeBg },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent, borderLeftWidth: '2px' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: selBg,
        },
        '.cm-selectionMatch': { backgroundColor: dark ? '#3a3a1f' : '#fdf3c0' },
        '.cm-panels': { backgroundColor: panelBg, color: fg, borderBottom: '1px solid ' + border },
        '.cm-panels.cm-panels-bottom': { borderTop: '1px solid ' + border, borderBottom: 'none' },
        '.cm-searchMatch': { backgroundColor: dark ? '#4a4620' : '#ffe9a8', outline: '1px solid ' + border },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: dark ? '#6b5f1e' : '#ffd54f' },
        '.cm-panel input, .cm-panel button, .cm-panel select': {
          font: 'inherit',
          fontSize: '11.5px',
          color: fg,
          backgroundColor: dark ? '#2a2a2e' : '#ffffff',
          border: '1px solid ' + border,
          borderRadius: '4px',
          padding: '1px 5px',
          marginRight: '4px',
        },
        '.cm-panel label': { fontSize: '11.5px', marginRight: '8px' },
        '.cm-tooltip': { backgroundColor: panelBg, color: fg, border: '1px solid ' + border },
        '.cm-foldPlaceholder': { backgroundColor: dark ? '#33333a' : '#eceff3', color: gutterFg, border: 'none' },
        '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: dark ? '#3a4250' : '#dfe7f2' },
      }, { dark: !!dark })
    }

    // Token colours. CodeMirror's default style is a neutral baseline; a Markdown
    // author looks at headings, links, inline code and quotes, so those get the
    // contrast and everything else keeps the baseline.
    function editorHighlight(CM, dark) {
      var t = CM.highlightTags
      var heading = dark ? '#7cc4ff' : '#0b4fa8'
      var link = dark ? '#4fb3ff' : '#0550ae'
      var mono = dark ? '#e8b98a' : '#953800'
      var quote = dark ? '#8b949e' : '#6a737d'
      var strong = dark ? '#ffffff' : '#111111'
      return CM.HighlightStyle.define([
        { tag: t.heading1, color: heading, fontWeight: '700', fontSize: '1.35em' },
        { tag: t.heading2, color: heading, fontWeight: '700', fontSize: '1.2em' },
        { tag: t.heading3, color: heading, fontWeight: '700', fontSize: '1.1em' },
        { tag: [t.heading4, t.heading5, t.heading6], color: heading, fontWeight: '700' },
        { tag: t.strong, fontWeight: '700', color: strong },
        { tag: t.emphasis, fontStyle: 'italic' },
        { tag: t.strikethrough, textDecoration: 'line-through' },
        { tag: t.link, color: link, textDecoration: 'underline' },
        { tag: t.url, color: link },
        { tag: t.monospace, color: mono },
        { tag: t.quote, color: quote, fontStyle: 'italic' },
        { tag: t.list, color: dark ? '#d2a8ff' : '#8250df' },
        { tag: t.contentSeparator, color: quote },
        { tag: [t.keyword, t.operatorKeyword], color: dark ? '#ff7b72' : '#cf222e' },
        { tag: [t.string, t.special(t.string)], color: dark ? '#a5d6ff' : '#0a3069' },
        { tag: [t.number, t.bool, t.null], color: dark ? '#79c0ff' : '#0550ae' },
        { tag: t.comment, color: quote, fontStyle: 'italic' },
        { tag: [t.function(t.variableName), t.labelName], color: dark ? '#d2a8ff' : '#8250df' },
        { tag: [t.typeName, t.className, t.tagName], color: dark ? '#7ee787' : '#116329' },
        { tag: [t.attributeName, t.propertyName], color: dark ? '#79c0ff' : '#0550ae' },
        { tag: t.invalid, color: dark ? '#ffa198' : '#82071e' },
      ])
    }

    // One <script> per page, shared by every editor instance on it, and never
    // retried after a failure: a second attempt would only re-fetch the same 604 KB
    // and fail the same way. A null in the resolved value means "the bundle could
    // not be loaded", which the caller reports as a stated reason rather than
    // leaving an empty box.
    var editorLoadPromise = null
    function loadEditor() {
      if (typeof window === 'undefined') return Promise.resolve(null)
      if (window.DshFrogCM) return Promise.resolve(window.DshFrogCM)
      if (editorLoadPromise) return editorLoadPromise
      editorLoadPromise = new Promise(function (resolve) {
        var tag = document.createElement('script')
        tag.src = EDITOR_SCRIPT_URL
        tag.async = true
        tag.onload = function () {
          resolve(window.DshFrogCM || null)
        }
        tag.onerror = function () {
          editorLoadPromise = null
          resolve(null)
        }
        document.head.appendChild(tag)
      })
      return editorLoadPromise
    }

    function editorLanguageName(path) {
      var m = /\.([A-Za-z0-9]+)$/.exec(String(path == null ? '' : path))
      if (!m) return ''
      return EDITOR_LANGS[m[1].toLowerCase()] || ''
    }

    // The language support for one document. Markdown gets the fenced-code hook so
    // a python block is highlighted as Python; everything else is one grammar.
    function editorLanguageFor(CM, path) {
      var name = editorLanguageName(path)
      if (name === 'markdown') {
        return CM.markdown({
          base: CM.markdownLanguage,
          codeLanguages: function (info) {
            var key = String(info == null ? '' : info).trim().toLowerCase().split(/[\s,{]/)[0]
            var target = EDITOR_FENCES[key]
            if (!target) return null
            try { return editorLanguageFor(CM, 'x.' + target) } catch (e) { return null }
          },
        })
      }
      try {
        if (name === 'javascript') return CM.javascript()
        if (name === 'jsx') return CM.javascript({ jsx: true })
        if (name === 'typescript') return CM.javascript({ typescript: true })
        if (name === 'tsx') return CM.javascript({ typescript: true, jsx: true })
        if (name === 'json') return CM.json()
        if (name === 'python') return CM.python()
        if (name === 'yaml') return CM.yaml()
        if (name === 'css') return CM.css()
        if (name === 'html') return CM.html()
      } catch (e) {
        // A grammar that refuses its own input must not take the editor down: the
        // document opens as plain text instead.
      }
      return []
    }

    // ── The controller ─────────────────────────────────────────────────────────
    // createEditor is async because the bundle arrives over the network the first
    // time. The resolved value is the handle both faces drive:
    //
    //   .view            the CodeMirror EditorView (for anything not wrapped here)
    //   .getValue()      the document as text, LF-joined — exactly what the host's
    //                    save route expects (it restores the file's own endings)
    //   .isDirty()       changed since the last markClean()
    //   .markClean()     rebase the "saved" marker to the current document
    //   .setTheme(dark)  swap the theme without touching the text or the history
    //   .setLineNumbers(on)  show/hide the line-number column, same guarantee
    //   .focus() .undo() .redo() .destroy()
    //
    // opts.onChange fires on every document change — the draft keeper needs the
    // LATEST text, not the text as of the first keystroke. opts.onDirty fires only
    // when the dirty FLAG flips, so the UI re-renders once per save/unsave instead of
    // once per character.
    //
    // A "dirty" marker is a StateField holding the document as of the last save and
    // a comparison against the live one, which is the recipe CodeMirror itself
    // documents: a plain string comparison on every keystroke would be O(document)
    // per character typed.
    // Put one view on lines [start, end] (1-based, inclusive) and bring them into
    // view. Out-of-range lines are CLAMPED rather than refused: the file may have
    // changed under the reader since the preview was rendered, and "somewhere
    // sensible" beats throwing inside a scroll handler or selecting nothing.
    // Returns whether the view accepted it.
    function revealLinesIn(view, start, end) {
      if (!view || !view.state || !view.state.doc || typeof view.dispatch !== 'function') return false
      try {
        var docLines = view.state.doc.lines
        var clamp = function (n) { return Math.max(1, Math.min(parseInt(n, 10) || 1, docLines)) }
        var from = view.state.doc.line(clamp(start))
        var to = view.state.doc.line(clamp(end || start))
        view.dispatch({ selection: { anchor: from.from, head: to.to }, scrollIntoView: true })
        if (typeof view.focus === 'function') view.focus()
        return true
      } catch (e) { return false }
    }

    function createEditor(container, options) {
      var opts = options || {}
      return loadEditor().then(function (CM) {
        if (!CM) return null
        if (!container) return null
        var dark = !!opts.dark

        var markSaved = CM.StateEffect.define()
        var savedField = CM.StateField.define({
          create: function (state) { return state.doc },
          update: function (value, tr) {
            var i
            for (i = 0; i < tr.effects.length; i += 1) {
              if (tr.effects[i].is(markSaved)) return tr.state.doc
            }
            return value
          },
        })

        var themeSlot = new CM.Compartment()
        // The line-number column is a compartment for the same reason the theme is:
        // it is a PREFERENCE (设置 › 编辑器显示行号), and reconfiguring it must not
        // throw away the document, the cursor, the scroll position or an unsaved
        // draft. Remounting the view to hide a gutter would do all four.
        var lineNumberSlot = new CM.Compartment()
        // Absent means on: every caller that predates the setting keeps the gutter it
        // always had. Only an explicit false takes it away.
        var lineNumberExtensions = function (on) {
          return on === false ? [] : [CM.lineNumbers(), CM.highlightActiveLineGutter()]
        }

        var keymap = []
        if (editorLanguageName(opts.path) === 'markdown') {
          keymap = keymap.concat(CM.markdownKeymap)
        }
        keymap = keymap.concat([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: function () {
              if (typeof opts.onSave === 'function') opts.onSave()
              return true
            },
          },
        ]).concat(CM.defaultKeymap).concat(CM.searchKeymap).concat(CM.historyKeymap).concat(CM.foldKeymap).concat([CM.indentWithTab])

        var lastDirty = false
        var updateListener = CM.EditorView.updateListener.of(function (update) {
          if (update.docChanged && typeof opts.onChange === 'function') {
            try { opts.onChange() } catch (e) {}
          }
          if (!update.docChanged && !update.transactions.length) return
          var nowDirty = !update.state.field(savedField).eq(update.state.doc)
          if (nowDirty !== lastDirty) {
            lastDirty = nowDirty
            if (typeof opts.onDirty === 'function') {
              try { opts.onDirty(nowDirty) } catch (e) {}
            }
          }
        })

        var state = CM.EditorState.create({
          doc: String(opts.value == null ? '' : opts.value),
          extensions: [
            lineNumberSlot.of(lineNumberExtensions(opts.lineNumbers)),
            CM.highlightSpecialChars(),
            CM.highlightActiveLine(),
            CM.history(),
            CM.foldGutter(),
            CM.drawSelection(),
            CM.dropCursor(),
            CM.indentOnInput(),
            CM.bracketMatching(),
            CM.highlightSelectionMatches(),
            CM.search({ top: true }),
            CM.EditorView.lineWrapping,
            savedField,
            // The plugin's own token colours ride the theme compartment, because the
            // two swap together — and the product's neutral style is added LAST with
            // fallback: true, which is CodeMirror's contract for "only where the
            // style above said nothing". (Ranking them the other way round silently
            // wins the common tags and leaves the custom colours unused.)
            themeSlot.of([
              editorTheme(CM, dark),
              CM.syntaxHighlighting(editorHighlight(CM, dark)),
              CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
            ]),
            editorLanguageFor(CM, opts.path),
            CM.keymap.of(keymap),
            updateListener,
          ],
        })

        var view = new CM.EditorView({ state: state, parent: container })

        return {
          CM: CM,
          view: view,
          getValue: function () { return view.state.doc.toString() },
          isDirty: function () { return !view.state.field(savedField).eq(view.state.doc) },
          markClean: function () {
            view.dispatch({ effects: markSaved.of(null) })
            lastDirty = false
            if (typeof opts.onDirty === 'function') {
              try { opts.onDirty(false) } catch (e) {}
            }
          },
          setTheme: function (nextDark) {
            dark = !!nextDark
            view.dispatch({
              effects: [
                themeSlot.reconfigure([
                  editorTheme(CM, dark),
                  CM.syntaxHighlighting(editorHighlight(CM, dark)),
                  CM.syntaxHighlighting(CM.defaultHighlightStyle, { fallback: true }),
                ]),
              ],
            })
          },
          // Show or hide the line-number column in place (the caller drives this from
          // 设置 › 编辑器显示行号). Returns whether the view took it.
          setLineNumbers: function (on) {
            try {
              view.dispatch({ effects: lineNumberSlot.reconfigure(lineNumberExtensions(on)) })
              return true
            } catch (e) { return false }
          },
          focus: function () { try { view.focus() } catch (e) {} },
          // Select lines [start, end] (1-based, inclusive) and bring them into view.
          // This is what turns "the paragraph I selected in the preview" into the
          // same lines selected in the editor: one document, two views of it, and the
          // reader should not have to find the place twice. The math sits in
          // revealLinesIn, beside this module's other pure helpers, so it can be
          // asserted against a fake view (see scripts/check.js).
          revealLines: function (start, end) { return revealLinesIn(view, start, end) },
          undo: function () { CM.undo(view) },
          redo: function () { CM.redo(view) },
          openSearch: function () { try { CM.openSearchPanel(view) } catch (e) {} },
          destroy: function () { try { view.destroy() } catch (e) {} },
        }
      })
    }


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
    const quoteToComposer = (path) => quoteTextToComposer('@' + path)

    // The general form: whatever text a caller wants in the composer. A line
    // selection inserts a locator plus the quoted lines (see mdLineQuote), which
    // is the same operation the file tree performs with a bare path — the draft
    // is read first so an existing message is never overwritten.
    const quoteTextToComposer = (text) => {
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
        const body = String(text == null ? '' : text)
        if (!draft || draft.trim() === '') { input.setDraft(body); return true }
        const separator = body.indexOf('\n') >= 0 ? '\n\n' : ' '
        input.setDraft(draft.replace(/\s+$/, '') + separator + body)
        return true
      } catch (e) {
        return false
      }
    }

    // Copy text with the panel's own notice, or say that it could not be done.
    // Separate from the plain copy helper because the notice text differs per
    // caller and a silent failure here loses what the reader selected.
    const copyToClipboard = (text, okMessage) => {
      try {
        const ta = document.createElement('textarea')
        ta.value = String(text == null ? '' : text)
        ta.setAttribute('readonly', 'readonly')
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        noticeStore.flash(ok ? (okMessage || '已复制') : '复制失败：浏览器拒绝了剪贴板操作')
        return !!ok
      } catch (e) {
        noticeStore.flash('复制失败：' + (e && e.message ? e.message : '剪贴板不可用'))
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



          styles.insert(`/* Layout push: reserve space for the popout panel so the conversation column
   yields instead of being covered.
   --dsh-sidebar-frog-right is MEASURED from the shell's own right sidebar
   element (see watchShellRight in src/client/core.js) because the shell exposes
   no variable for it; --dsh-sidebar-width is the legacy better-sidebar variable
   and only remains as a fallback for an older host that still sets it.
   --dsh-sidebar-frog-width is our own live panel width. */
html #root {
  margin-right: calc(var(--dsh-sidebar-frog-right, var(--dsh-sidebar-width, 0px)) + var(--dsh-sidebar-frog-width, 0px));
  transition: margin-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
body[data-dsh-sidebar-frog-dragging] #root {
  transition: none;
}
/* Reserve right-side clearance in the conversation header so the corner
   trigger never overlaps its right-aligned utilities (e.g. "Session log").
   The clearance only applies while the popout panel is closed. */
header:has([data-slot="conversation.session.header.utilities"]) {
  padding-right: max(28px, calc(60px - var(--dsh-sidebar-frog-width, 0px)));
  transition: padding-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
@media(prefers-reduced-motion: reduce) {
  html #root { transition: none; }
  header:has([data-slot="conversation.session.header.utilities"]) { transition: none; }
}
/* Native tab surface: the shell's right sidebar draws the frame, owns the width
   and provides the scroll container, so the panel drops every part of the chrome
   that made it a floating window — no fixed position, no seam, no shadow, no
   reserved space. height:100% degrades to the content's own height when the
   seat's box is not definite, so nothing collapses if the frame changes. */
.artifacts-panel.artifacts-panel-native {
  position: static; width: auto; max-width: none; min-width: 0; height: 100%; min-height: 0;
  border-left: 0; box-shadow: none; z-index: auto;
}
.artifacts-panel {
  position: fixed; top: 0; right: var(--dsh-sidebar-frog-right, var(--dsh-sidebar-width, 0px)); bottom: 0; width: 30vw; max-width: calc(100vw - 24px); min-width: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto; z-index: 9999;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  /* ── Layout grid ──────────────────────────────────────────────────────
     One set of sizes for every band of chrome, so the header, the tab strip,
     the file-tree header and the list/tree rows line up with each other and
     stay aligned with the preview on the left. Rows are 30px, strips 32px. */
  --frog-h-head: 38px;      /* top bar — the Harness's own panel-header height */
  --frog-h-strip: 38px;     /* tab strip AND file-tree header (same 38px band) */
  --frog-h-row: 30px;       /* artifact list rows (two-line cards) */
  --frog-h-tree-row: 22px;  /* file-tree rows: IDE density (VS Code uses 22px) */
  --frog-tree-indent: 12px; /* one indent level per tree depth */
  --frog-pad-x: 10px;       /* horizontal padding of every strip/row */
  --frog-radius-row: 6px;
  /* Pane floors: the preview and the list/tree each keep a usable width. The
     percentages are the fallback for narrow panels (min() picks the smaller),
     which is what keeps the split from collapsing into slivers.
     The list/tree floor is what keeps file names readable: a row spends ~46px on
     its padding, twisty and icon plus 12px per indent level, so 280px still
     leaves a long name (dsh-sidebar-frog.config.json) its full width two levels
     deep. Mirrored by SPLIT_LIST_MIN / SPLIT_PREVIEW_MIN in
     src/client/components.js — scripts/check.js fails if they drift apart. */
  --frog-pane-min-list: min(280px, 38%);
  /* Container queries below react to the PANEL's width, not the window's. */
  container-type: inline-size;
}
/* Every band is measured border-box, so a 38px strip is 38px on screen even
   with its seam (the pop-out page does the same with a global reset).
   The top bar copies the Harness's own panel header (its 文件 / 文档预览 panels):
   38px tall, a .5px border-bottom in border-l3, 28px icon buttons. Same height,
   same hairline, same button box — the panel reads as part of the shell. */
.artifacts-head {
  position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 4px; height: var(--frog-h-head); padding: 0 6px; flex: none;
  border-bottom: .5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1);
}
.artifacts-head-left { display: flex; align-items: center; gap: 2px; flex: none; }
.artifacts-spacer { flex: 1; }
/* Panel actions in the top bar: 收起 (the overlay's own collapse) and 弹出到新标签页.
   A 28px icon-button box — the size and 6px radius the Harness uses for the
   buttons in its own panel headers. Under the native surface neither the shell's
   toggle nor ours is duplicated: 收起 exists only here, and only on the overlay. */
.artifacts-link, .artifacts-headbtn {
  display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; line-height: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; text-decoration: none;
  transition: color .15s, background .15s;
}
.artifacts-link:hover, .artifacts-headbtn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-link:focus-visible, .artifacts-headbtn:focus-visible, .artifacts-iconbtn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
/* Secondary button in the top bar (清除模式): the Harness's own outlined small
   button — 1px border-l2, label-secondary, 8px radius, text turning primary on
   hover. */
.artifacts-iconbtn {
  appearance: none; font: inherit; font-size: 12px; line-height: 1.5;
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 8px; padding: 3px 10px;
  cursor: pointer; transition: color .15s, border-color .15s, background .15s;
}
.artifacts-iconbtn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
/* Split area: preview on the LEFT, artifact list / file tree on the RIGHT
   (the pop-out tab uses the same left/right arrangement). Both panes carry a
   min-width, so neither can ever be squeezed into a sliver; the preview is the
   sized pane and the list/tree takes the rest. */
.artifacts-main { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: row; }
/* The tab panes share the panel: the visible one takes the space, the others keep
   their box but are made invisible (position: absolute + visibility: hidden).
   Unmounting them instead — the obvious way to write a tab strip — destroyed the
   file tree's loaded levels and its scroll offset, so every switch back to 文件树
   looked like a refresh that had lost the user's place. */
.artifacts-pane { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.artifacts-pane.is-hidden { position: absolute; inset: 0; visibility: hidden; pointer-events: none; }
/* The single pane: the artifact list or the file tree, full width. Its floor is
   what keeps file names readable — the panel's own width policy uses the same
   280px (scripts/check.js fails if the two drift apart). */
.artifacts-body { flex: 1 1 0; min-width: var(--frog-pane-min-list); min-height: 0; overflow-y: auto; overflow-x: hidden; }
.artifacts-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
/* 后台任务 tab: a read-only mirror of the shell's own job list. One row per job,
   a status dot in the status colour the shell uses, and the live ones tinted so
   "still running" is visible without reading. */
.artifacts-jobs-hint { padding: 10px 12px; font-size: 11px; color: var(--dsw-alias-label-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-job { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-job.is-live { background: var(--dsw-alias-bg-layer-1); }
.artifacts-job-main { min-width: 0; flex: 1 1 auto; }
.artifacts-job-dot { flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); }
.artifacts-job-dot-running { background: var(--dsw-alias-state-business-primary); }
.artifacts-job-dot-stopping { background: var(--dsw-alias-state-warn-label); }
.artifacts-job-dot-completed { background: var(--dsw-alias-state-success-primary); }
.artifacts-job-dot-failed { background: var(--dsw-alias-state-error-primary); }
.artifacts-job-dot-killed { background: var(--dsw-alias-label-dimmed); }
.artifacts-job-row { display: flex; align-items: baseline; gap: 8px; }
.artifacts-job-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.artifacts-job-time { flex: none; margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-job-sub { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-job-status { flex: none; }
.artifacts-job-detail { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-item {
  display: block; width: 100%; text-align: left; padding: 9px 12px;
  border: none; border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: inherit; cursor: pointer; font: inherit;
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-row { display: flex; align-items: center; gap: 8px; }
.artifacts-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
.artifacts-badge-create { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-badge-edit { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-item-base { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Last-touched age, pushed to the right edge (the same value the popout shows). */
.artifacts-item-time { flex: none; margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.artifacts-item-full {
  color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 2px; font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
/* Italic label = only previewed (an IDE's preview tab); upright once pinned. */
.artifacts-item-base.is-preview { font-style: italic; }
.artifacts-hint { padding: 24px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsh-font-mono, monospace); word-break: break-all; }
/* Closed-state switch, top-right: 打开/收起 + (while closed) 在新标签页弹出. One
   fixed group, so the two never drift apart.

   Its offset is MEASURED, not guessed. The shell keeps its own sidebar toggle in
   the session header's corner (28px in from the conversation column's right
   edge), and our panel narrows that column by exactly the width we claim — so a
   fixed "just left of the sidebars" offset puts our switch in the same 28px band
   as theirs and the two icons land on top of each other — which is exactly what
   the old fixed right: sidebarWidth + frogWidth + 12px did. CornerButton measures
   the shell's button and publishes --frog-corner-right as a px offset from the
   window's right edge, 8px clear of it; the fallback below is plain "left of the
   sidebars" for when no such button exists. */
.artifacts-corner {
  position: fixed; top: 10px; right: var(--frog-corner-right, calc(var(--dsh-sidebar-frog-right, var(--dsh-sidebar-width, 0px)) + var(--dsh-sidebar-frog-width, 0px) + 12px));
  z-index: 10000; display: flex; align-items: center; gap: 2px;
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
.artifacts-corner-btn {
  width: 34px; height: 34px; padding: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; align-items: center; justify-content: center; display: inline-flex;
  transition: color .15s, background .15s;
}
.artifacts-corner-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }

/* The left sidebar's footer entry point (sidebar.footer.action).
   It exists because the shell's column has exactly ONE control that can open it —
   its own button in the session header's corner — and the shell renders that
   header display:none while the session is still blank (a session that has never
   run a turn). The left sidebar's foot, by contrast, is rendered in every state
   including the hero screen, so this is where a standing "open the tree" control
   belongs. Sized like the shell's own footer occupants: a 36px round icon in the
   collapsed rail, a full-width 42px row in the expanded column (stacked above the
   shell's own Settings row).
   The seat holds ONE occupant (文件树, and under it the <a> to the popout page),
   so the rule carries text-decoration: none — the anchor form is deliberate (a
   real navigation cannot be swallowed by a popup blocker the way window.open
   can). */
/* Why that occupant is a COLUMN, and why it is one occupant at all. The shell
   renders this seat as a ROW in both fold states (dsh-client-ui-sidebar:
   ".footerActions{display:flex}", and in the rail
   ".collapsed .footerActions{justify-content:center;width:auto}"), so two
   registered entries are always laid out side by side. In the rail they do not
   fit: it is 56px wide (SIDEBAR_COLLAPSED, ui-layout) minus 10px of inline
   padding — a 36px content box — while one round button is 36px, so the second
   button hung outside the rail. That row is not ours to restyle (its class is a
   private CSS-module hash), so the direction lives here instead: two round icons
   stacked in the rail, two full-width rows in the expanded foot — the same
   rhythm as the shell's own Settings row right beneath them.
   NB: this file is embedded in a template literal by scripts/build.js, so no
   comment here may contain a backtick or a dollar-brace — either one ends the
   string and the bundle stops parsing. A guard in scripts/check.js says so. */
.artifacts-foot-stack {
  box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
  gap: 2px; min-width: 0;
}
.artifacts-foot-stack.is-wide { width: 100%; gap: 4px; align-items: stretch; }
.artifacts-foot-btn {
  box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; width: 36px; height: 36px; margin: 0; padding: 0;
  border: none; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font: inherit; font-size: 14px; line-height: 20px; text-decoration: none;
  transition: color .15s, background .15s;
}
.artifacts-foot-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-foot-btn.is-wide {
  flex: 1 1 auto; width: calc(100% + 4px); min-width: 0; height: 42px; margin: 0 -2px; padding: 0 10px 0 8px;
  border-radius: 12px; justify-content: flex-start;
}
.artifacts-foot-label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* Stretched by the column, not sized by the row rule above: "calc(100% + 4px)"
   with "margin: 0 -2px" was written for a flex ROW, where it bled into the row's
   own edge. In a column the parent stretches its children instead, so the row is
   exactly as wide as the stack and can never overhang the foot. */
.artifacts-foot-stack.is-wide .artifacts-foot-btn.is-wide { flex: none; width: auto; margin: 0; }

/* 「在新标签页弹出」 inside the SHELL's own tab menu
   (sidebar.right.tab.menu.item — the column's list seat for per-tab actions). The
   kit renders our node as a raw child of its menu portal: its own rows carry a
   private CSS-module class we cannot use, and the portal is a child of <body>,
   i.e. OUTSIDE the panel. So the row is styled here in the MENU's colours rather
   than the panel's — color: inherit (the menu sets it) and a hover wash mixed
   from currentColor — which is what keeps it looking like the kit's own items in
   both themes. The plain fallback above the color-mix line covers an engine
   without it. */
.artifacts-menuitem {
  box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%;
  margin: 0; padding: 7px 10px; border: none; border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer;
  font: inherit; font-size: 13px; line-height: 18px; text-align: left; text-decoration: none;
  white-space: nowrap;
}
.artifacts-menuitem svg { flex: none; }
.artifacts-menuitem:hover { background: rgba(127, 127, 127, .14); background: color-mix(in srgb, currentColor 14%, transparent); }
.artifacts-menuitem-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* 「@引用」 in the PRODUCT's document-preview toolbar
   (sidebar.right.tab.document.actions — declared by ui-sidebar-documentpreview
   and rendered in that preview's own header). It has to read as one of the
   product's tools, so it is styled from the SAME aliases its reload/wrap buttons
   use rather than from this panel's palette: a compact ghost button that borrows
   the surrounding label colour. */
.artifacts-doc-action {
  box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center;
  gap: 6px; height: 26px; margin: 0; padding: 0 8px;
  border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font: inherit; font-size: 12px; line-height: 18px;
  transition: color .15s, background .15s;
}
.artifacts-doc-action:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-doc-action-label { white-space: nowrap; }
.artifacts-item {
  position: relative; display: flex; align-items: stretch; width: 100%;
  padding: 0; cursor: default ; border-bottom: 1px solid var(--dsw-alias-border-l2);
  /* Background the floating actions fade into (see --frog-row-bg below). */
  --frog-row-bg: var(--dsw-alias-bg-base);
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); --frog-row-bg: var(--dsw-alias-interactive-bg-hover); }
/* Selected artifact: a left accent bar (list-item language) keeps it visually
   distinct from the file tree's rounded full-fill selection, so a lone selected
   artifact never reads as a file-tree row. */
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary); --frog-row-bg: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-main { flex: 1; min-width: 0; text-align: left; padding: 7px var(--frog-pad-x); border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
/* Row actions float above the row instead of taking layout space: the file name
   keeps its full width and never reflows (or collapses) when they appear. */
.artifacts-item-actions {
  position: absolute; top: 50%; right: 4px; transform: translateY(-50%);
  display: flex; align-items: center; gap: 2px; padding-left: 14px;
  background: linear-gradient(90deg, transparent, var(--frog-row-bg) 14px);
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.artifacts-item:hover .artifacts-item-actions,
.artifacts-item:focus-within .artifacts-item-actions,
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; pointer-events: auto; }
.artifacts-minibtn { border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; line-height: 1; }
.artifacts-minibtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-notice { color: var(--dsw-alias-state-business-primary); font-size: 12px; }
/* Transient feedback, rendered into the SHELL's frame-wide overlay layer (see
   NoticePill in src/client/components.js). The layer is click-through, so the
   pill stays non-interactive too — it only reports. */
.artifacts-notice-pill {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  pointer-events: none; max-width: min(420px, calc(100vw - 48px));
  padding: 6px 14px; border-radius: 999px;
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
  border: .5px solid var(--dsw-alias-border-l3); box-shadow: var(--dsw-shadow-lv2);
  font-size: 12px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 清除 rides the end of the view switcher on the native surface, where the
   shell's tab strip is the panel's only other header. Sticky so it stays at the
   strip's right edge however many file tabs are open — the strip scrolls. */
.artifacts-tab-action { position: sticky; right: 0; margin-left: auto; align-self: center; flex: none; background: var(--dsw-alias-bg-layer-1); }
/* Preview pane — the body of a FILE TAB. The panel shows one tab at a time
   (产物 / 文件树 / the files you opened), so the preview gets the panel's full
   width instead of sharing it with the tree: that is the whole reason tapping a
   file opens a tab rather than squeezing a second column into the sidebar. */
.artifacts-preview { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.artifacts-preview-body { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; position: relative; }
.artifacts-img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: 12px; }
/* iframe/embed are REPLACED elements: inset-0 without an explicit
   width/height keeps their intrinsic (small) size, so use width/height 100%
   instead. position:relative above is for the pdf.js renderer's absolute
   canvas container (a non-replaced div, which DOES stretch with inset-0). */
.artifacts-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
.artifacts-pdf { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; display: block; }
/* pdf.js renderer (sidebar): fills the preview area, no native toolbar. */
.artifacts-pdfview { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; background: #525659; }
.artifacts-pdfview-bar { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 6px; height: var(--frog-h-strip); padding: 0 8px; background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-pdfview-btn { min-width: 24px; height: 22px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 5px; cursor: pointer; font: inherit; font-size: 13px; line-height: 1; padding: 0 6px; }
.artifacts-pdfview-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-pdfview-btn:disabled { opacity: .4; cursor: default ; }
.artifacts-pdfview-zoom { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 40px; text-align: center; }
.artifacts-pdfview-page { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 44px; text-align: center; }
.artifacts-pdfview-spacer { flex: 1; }
.artifacts-pdfview-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.artifacts-pdfview-canvas { display: block; margin: 0 auto; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
.artifacts-markdown { padding: 12px 14px; line-height: 1.6; word-wrap: break-word; font-size: 13px; }
.artifacts-markdown h1, .artifacts-markdown h2, .artifacts-markdown h3, .artifacts-markdown h4, .artifacts-markdown h5, .artifacts-markdown h6 { margin: 14px 0 8px; line-height: 1.3; }
.artifacts-markdown h1 { font-size: 1.45em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: 6px; }
.artifacts-markdown h2 { font-size: 1.25em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 4px; }
.artifacts-markdown code { background: var(--dsw-alias-bg-layer-1); padding: 1px 5px; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); font-size: 0.9em; }
.artifacts-markdown pre { background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.artifacts-markdown pre code { background: transparent; padding: 0; }
.artifacts-markdown img { max-width: 100%; }
/* The selection bar for a rendered document (see attachMarkdownSelectionBar in
   src/shared/markdown.js). Appended to <body>, fixed to the viewport, so it is
   outside any panel scope and carries fallbacks for the theme tokens. */
.artifacts-mdselbar { position: fixed; z-index: 2147483000; display: flex; align-items: center; gap: 6px; padding: 3px 4px 3px 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.18)); background: var(--dsw-alias-bg-layer-2, rgba(28,28,30,.96)); color: var(--dsw-alias-label-primary, #fff); box-shadow: 0 6px 20px rgba(0,0,0,.24); font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; user-select: none; }
.artifacts-mdselbar-label { white-space: nowrap; color: var(--dsw-alias-label-secondary, rgba(255,255,255,.7)); }
.artifacts-mdselbar-btn { font: inherit; padding: 2px 9px; border-radius: 999px; border: 1px solid transparent; background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.12)); color: inherit; cursor: pointer; }
.artifacts-mdselbar-btn:hover { background: var(--dsw-alias-state-business-primary, #4b7bec); color: #fff; }
/* The raw-HTML shapes a README uses for its logo: <picture> (a light/dark
   <source> beside a fallback <img>) inside <p align="center">. Alignment comes
   from an obsolete presentational attribute, so it is stated here rather than
   trusted to the browser; the image keeps its aspect ratio when a width/height
   attribute pair is scaled down by max-width. */
/* ── source-line gutter (设置 › 预览显示行号) ─────────────────────────────────
   The reader's answer to "which line is this?". The numbers are NOT counted from
   what is drawn: they are the anchors the renderer already stamps on every block
   (data-lineno = the source line it starts on, with the range when it covers
   several — see mdAnchor in src/shared/markdown.js), so the gutter and the
   "引用/定位" bar can never disagree about which line a block is.

   Only DIRECT children of the document root carry a number. They all begin at the
   root's left edge, so one negative offset lines them up; a nested block (a list
   item, a table cell, a blockquote's inner paragraph) starts at a different x, so
   its number would sit at a different x too and read as a stray glyph rather than
   a column.

   The gutter is chrome this plugin adds, so it is opt-in and it is pure CSS on
   markup that is already there: no extra elements, nothing to keep in sync. */
.artifacts-markdown.is-lines { padding-left: 3.9em; }
.artifacts-markdown.is-lines > [data-lineno] { position: relative; }
.artifacts-markdown.is-lines > [data-lineno]::before {
  content: attr(data-lineno);
  position: absolute;
  left: -3.5em;
  width: 2.9em;
  text-align: right;
  font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: 11px;
  line-height: 1.75;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}
.artifacts-markdown picture { max-width: 100%; }
.artifacts-markdown picture > img { max-width: 100%; height: auto; }
.artifacts-markdown [align="center"] { text-align: center; }
.artifacts-markdown [align="right"] { text-align: right; }
.artifacts-markdown blockquote { border-left: 3px solid var(--dsw-alias-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--dsw-alias-label-secondary); }
.artifacts-markdown ul, .artifacts-markdown ol { padding-left: 24px; }
.artifacts-markdown a { color: var(--dsw-alias-state-business-primary); }
/* Math display blocks kept verbatim by mdToHtml for MathJax to typeset. */
.artifacts-markdown .math-display { margin: 8px 0; overflow-x: auto; }
.artifacts-markdown .math-display mjx-container { max-width: 100%; }
/* Tables, task lists and extra inline marks produced by mdToHtml. */
.artifacts-markdown table { border-collapse: collapse; margin: 8px 0; display: block; max-width: 100%; overflow-x: auto; font-size: 0.93em; }
.artifacts-markdown th, .artifacts-markdown td { border: 1px solid var(--dsw-alias-border-l2); padding: 4px 9px; }
.artifacts-markdown th { background: var(--dsw-alias-interactive-bg-hover); font-weight: 600; }
.artifacts-markdown li.task-list-item { list-style: none; margin-left: -20px; }
.artifacts-markdown li.task-list-item input[type="checkbox"] { margin-right: 6px; vertical-align: -1px; accent-color: var(--dsw-alias-state-business-primary); }
.artifacts-markdown mark { background: #ffe066; color: #241f00; border-radius: 3px; padding: 0 2px; }
body[data-ds-dark-theme] .artifacts-markdown mark { background: #6b5c12; color: #f6e7a1; }
.artifacts-markdown del { color: var(--dsw-alias-label-tertiary); }
.artifacts-markdown sup, .artifacts-markdown sub { line-height: 0; }
/* Raw HTML embedded in the document: collapsible answers (<details>/<summary>,
   the courseware's "答案" convention), layout containers and simple marks. */
.artifacts-markdown details { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; margin: 8px 0; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.artifacts-markdown details > summary { position: relative; cursor: pointer; padding: 6px 28px 6px 10px; font-weight: 600; list-style: none; user-select: none; }
.artifacts-markdown details > summary::-webkit-details-marker { display: none; }
.artifacts-markdown details > summary::after { content: '▸'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-tertiary); transition: transform .15s var(--ds-ease-in-out, ease); }
.artifacts-markdown details[open] > summary::after { transform: translateY(-50%) rotate(90deg); }
.artifacts-markdown details[open] > summary { border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-markdown details > *:first-child { margin-top: 0; }
.artifacts-markdown details > *:last-child { margin-bottom: 0; }
.artifacts-markdown kbd { background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1)); border: 1px solid var(--dsw-alias-border-l2); border-bottom-width: 2px; border-radius: 4px; padding: 1px 5px; font: 0.85em var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-markdown figure { margin: 8px 0; }
.artifacts-markdown figcaption { margin-top: 4px; font-size: 0.9em; color: var(--dsw-alias-label-tertiary); }
.artifacts-markdown svg { max-width: 100%; height: auto; }
/* Mermaid diagram containers (rendered SVG replaces the raw source). */
.artifacts-markdown .mermaid { margin: 10px 0; overflow-x: auto; text-align: center; }
.artifacts-markdown .mermaid svg { max-width: 100%; height: auto; }
.artifacts-markdown .mermaid-error { border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 8px; background: rgba(236, 19, 19, 0.05); }
.artifacts-markdown .mermaid-fallback { margin: 0; padding: 8px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); background: transparent; text-align: left; }
/* JSXGraph board containers (interactive boards replace the raw source). */
.artifacts-markdown .jsxgraph-box { width: 100%; min-height: 280px; }
.artifacts-markdown .jsxgraph-error { border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 8px; background: rgba(236, 19, 19, 0.05); }
.artifacts-markdown .jsxgraph-fallback { margin: 0; padding: 8px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); background: transparent; text-align: left; }
.artifacts-markdown .jsxgraph-fallback-error { margin: 0 0 6px; font-size: 12px; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.artifacts-diff { border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; padding: 5px 10px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-name { flex: none; }
.artifacts-diff-stat { flex: none; font-weight: 500; font-family: var(--dsh-font-mono, ui-monospace, monospace); color: var(--dsw-alias-label-tertiary); }
.artifacts-diff-note { flex: none; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
/* 撤销 sits at the end of the diff title: the review is "what changed, and do I
   want it" — one bar, one decision. Sized like the Harness's own small outlined
   buttons. */
.artifacts-undo {
  appearance: none; margin-left: auto; font: inherit; font-size: 11px; font-weight: 500;
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 2px 8px; cursor: pointer;
  transition: color .15s, border-color .15s, background .15s;
}
.artifacts-undo:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-undo:disabled { opacity: .6; cursor: default; }
/* One line per row, old/new line numbers in a fixed gutter so a removal and the
   insertion that replaced it can be read against each other. */
.artifacts-diff-rows { max-height: 45%; overflow: auto; font: 12px / 1.5 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.artifacts-diff-row { display: flex; align-items: flex-start; white-space: pre-wrap; word-break: break-word; }
.artifacts-diff-no { flex: none; width: 32px; padding-right: 6px; text-align: right; color: var(--dsw-alias-label-tertiary); user-select: none; }
.artifacts-diff-sign { flex: none; width: 12px; color: var(--dsw-alias-label-tertiary); user-select: none; }
.artifacts-diff-text { flex: 1 1 auto; min-width: 0; padding-right: 8px; }
.artifacts-diff-del { background: rgba(236, 19, 19, 0.07); }
.artifacts-diff-del .artifacts-diff-sign, .artifacts-diff-del .artifacts-diff-text { color: var(--dsw-alias-state-error-primary); }
.artifacts-diff-add { background: rgba(34, 197, 94, 0.08); }
.artifacts-diff-add .artifacts-diff-sign, .artifacts-diff-add .artifacts-diff-text { color: var(--dsw-alias-state-success-primary); }
/* Kept: other views still use the plain label form. */
.artifacts-diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
.artifacts-panel { transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease); }
.artifacts-panel.artifacts-resizing { transition: none; user-select: none; }

/* Resize handle on the panel's left edge */
.artifacts-resize { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; touch-action: none; }
.artifacts-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
.artifacts-resize:hover::after, .artifacts-resize:active::after { background: var(--dsw-alias-interactive-bg-hover-accent); }

/* Vertical divider between the preview (left) and the list/file tree (right):
   drag left/right to resize — POPOUT ONLY. The sidebar panel has no preview of
   its own any more (clicking a file opens it in the popout tab), so it keeps one
   full-width pane: no splitter, no preview-collapse control, nothing to overlap.
   The divider lives in the standalone page's own stylesheet. */

/* Tabs (产物 / 文件树) — the Harness's own tab strip, not a bespoke one: a .5px
   base rule in border-l2, 13px 20px labels in label-tertiary, and a 2px
   label-primary underline on the active tab (identical to the values the
   settings surface uses). The strip is the same 38px band as the header. */
.artifacts-tabs { box-sizing: border-box; flex: none; display: flex; align-items: flex-end; gap: 16px; height: var(--frog-h-strip); padding: 0 var(--frog-pad-x); border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.artifacts-tabs::-webkit-scrollbar { display: none; }
/* The left-hand fact a native view's band states about itself (the ledger's live
   record count), the way the product's files tab states its path. Muted and
   non-interactive: it is a label, not a control. */
.artifacts-tab-note { flex: none; align-self: center; color: var(--dsw-alias-label-tertiary); font-size: 12px; white-space: nowrap; }
.artifacts-tab { position: relative; flex: none; padding: 7px 1px 9px; border: 0; background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.artifacts-tab:hover, .artifacts-tab.is-active { color: var(--dsw-alias-label-primary); }
.artifacts-tab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary); }
.artifacts-tab:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: 2px; color: var(--dsw-alias-label-primary); }
/* File tabs (one per file you clicked): the same tab vocabulary, with the label
   inside a button so it can ellipsize and a ✕ beside it. */
.artifacts-tab-file { display: inline-flex; align-items: center; gap: 2px; max-width: 190px; padding-right: 0; }
.artifacts-tab-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; display: inline-flex; align-items: center; }
/* The file-type icon inside a file tab. inline-flex, because the label is a
   BUTTON: a plain inline box would drop the icon onto its own baseline and the
   tab would grow taller than its neighbours. flex:none keeps the 13px artwork
   at 13px while the name ellipsizes around it. */
.artifacts-tab-ico { flex: none; display: inline-flex; align-items: center; justify-content: center; margin-right: 4px; vertical-align: -2px; }
.artifacts-tab-ico > svg { display: block; }
.artifacts-tab-label:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: 2px; }
.artifacts-tab-close { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.artifacts-tab-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* The unsaved dot and the armed close button. A tab whose editor unmounts on
   every switch has to say which files still hold edits, and the click that
   throws them away has to be a decision — so the ✕ turns into 确认 first. */
.artifacts-tab-dirty { flex: none; margin-right: 3px; font-size: 9px; line-height: 1; color: var(--dsw-alias-state-business-primary); }
.artifacts-tab-close.is-armed { width: auto; padding: 0 5px; font-size: 11px; color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover); }

/* File tree (文件树) — IDE-style explorer (VS Code's explorer is the model):
   flat 22px rows, square-ish selection, disclosure chevrons, indent guides,
   per-type icon colours and always-visible A/M change letters. */
.artifacts-tree { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-tree-header { box-sizing: border-box; flex: none; justify-content: space-between; align-items: center; gap: 4px; height: var(--frog-h-strip); padding: 0 4px 0 var(--frog-pad-x); display: flex; }
/* Explorer section label: small, uppercase, tertiary — like「EXPLORER」. */
.artifacts-tree-root { flex: 1 1 auto; min-width: 0; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.artifacts-tree-tools { flex: none; display: flex; align-items: center; gap: 2px; }
.artifacts-tree-tool, .artifacts-tree-refresh { width: 22px; height: 22px; color: var(--dsw-alias-label-tertiary); cursor: pointer; background: transparent; border: none; border-radius: 4px; flex: none; justify-content: center; align-items: center; display: inline-flex; padding: 0; }
.artifacts-tree-tool:hover, .artifacts-tree-refresh:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-tool.is-on { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-active); }
/* Filter row (explorer filter box). */
.artifacts-tree-filter { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 var(--frog-pad-x); color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-tree-filter-input { flex: 1 1 auto; min-width: 0; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.artifacts-tree-filter-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-filter-clear { width: 18px; height: 18px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.artifacts-tree-filter-clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 2px 4px 8px; outline: none; }
.artifacts-tree-body:focus-visible { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
.artifacts-tree-row { position: relative; box-sizing: border-box; width: 100%; height: var(--frog-h-tree-row); font-family: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; white-space: nowrap; background: transparent; border: none; border-radius: 3px; align-items: center; gap: 4px; padding: 0 6px 0 4px; display: flex; --frog-row-bg: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* VS Code keeps folder labels in the normal weight — the icon + chevron carry
   the meaning, so the tree stays calm and dense. */
.artifacts-tree-dir { font-weight: 400; }
.artifacts-tree-hidden { opacity: .45; }
.artifacts-tree-name { flex: 1 1 auto; min-width: 0; text-overflow: ellipsis; overflow: hidden; }
/* Italic label = previewed but not pinned (an IDE's preview tab). */
.artifacts-tree-name.is-preview { font-style: italic; }
/* Keyboard cursor ring, distinct from the (mouse) selection fill. */
.artifacts-tree-row.is-cursor { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2); }
.artifacts-tree-row.is-selected { background: var(--dsw-alias-interactive-bg-active); --frog-row-bg: var(--dsw-alias-interactive-bg-active); }
/* Depth guides, drawn inside each row so they never leak across levels. */
.artifacts-tree-guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dsw-alias-border-l1); pointer-events: none; }
/* 新建: the inline name row. It is a tree row (same guides, icons, indentation)
   with an input where the label would be, so the new entry is visibly about to
   exist at that level. The row is not clickable — a click in it must land in the
   input, not open anything. */
.artifacts-tree-createrow { cursor: default; background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-createrow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-createrow.is-invalid { box-shadow: inset 0 0 0 1px var(--dsw-alias-state-error-primary, #e5484d); }
.artifacts-tree-create { flex: 1 1 auto; min-width: 0; height: calc(var(--frog-h-tree-row) - 6px); box-sizing: border-box; padding: 0 4px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-state-business-primary); border-radius: 3px; outline: none; }
.artifacts-tree-create::placeholder { color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-create-error { flex: none; max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-state-error-primary, #e5484d); }
.artifacts-tree-create-hint { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-twisty { flex: none; width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-twisty svg { transition: transform .1s var(--ds-ease-in-out, ease); }
.artifacts-tree-twisty.is-open svg { transform: rotate(90deg); }
.artifacts-tree-twisty.is-file { visibility: hidden; }
.artifacts-tree-ico { flex: none; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
/* File-type colours, copied from the primitives' FileTypeIcon.module.css so the
   plugin's tree tints a file exactly the way the shell's tree does. The kind
   class publishes '--dsh-file-type-default-color', which the card's body path
   fills with; the hex after each token is the fallback that keeps the popout
   page — a standalone document with no shell theme layer — correct even before
   its own tokens exist.
   Folder is the exception, and deliberately so: directory rows draw the built-in
   tree's outline folder (stroked with currentColor), which FilesBody tints
   'var(--dsw-alias-label-tertiary)' — not FileTypeIcon's amber 'folder' card,
   which is a different call site the tree never reaches. */
.artifacts-tree-ico-code { --dsh-file-type-default-color: var(--dsw-static-deepseek-500, #4176e6); }
.artifacts-tree-ico-html { --dsh-file-type-default-color: var(--dsw-static-deepseek-500, #4176e6); }
.artifacts-tree-ico-markdown { --dsh-file-type-default-color: var(--dsw-static-deepseek-500, #4176e6); }
.artifacts-tree-ico-excel { --dsh-file-type-default-color: var(--dsw-static-green-500, #22c55e); }
.artifacts-tree-ico-folder { color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-ico-image { --dsh-file-type-default-color: rgb(139, 118, 246); }
.artifacts-tree-ico-video { --dsh-file-type-default-color: rgb(139, 118, 246); }
.artifacts-tree-ico-other { --dsh-file-type-default-color: var(--dsw-static-neutral-bluish-300, #cfd3d6); }
.artifacts-tree-ico-pdf { --dsh-file-type-default-color: var(--dsw-static-red-600, #ec1313); }
.artifacts-tree-ico-ppt { --dsh-file-type-default-color: var(--dsw-static-amber-500, #f59e0b); }
.artifacts-tree-ico-word { --dsh-file-type-default-color: var(--dsw-static-deepseek-450, #5686fe); }
/* Change letters: A = created by the agent, M = edited (IDE git decorations). */
.artifacts-tree-status { flex: none; font-size: 11px; font-weight: 700; padding: 0 2px; }
.artifacts-tree-status-add { color: #3fb950; }
.artifacts-tree-status-mod { color: #d29922; }
/* Filter results: name first, the relative path dimmed after it. */
.artifacts-tree-sub { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-tertiary); font-size: 11px; padding-left: 4px; direction: rtl; text-align: left; }
.artifacts-tree-note { padding: 4px var(--frog-pad-x) 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
/* Row actions float above the row (fading the name out underneath) instead of
   taking layout space: a filename keeps its full width on hover instead of being
   squeezed to zero. */
.artifacts-tree-actions {
  position: absolute; top: 50%; right: 3px; transform: translateY(-50%);
  display: none; align-items: center; gap: 2px; padding-left: 14px;
  background: linear-gradient(90deg, transparent, var(--frog-row-bg) 14px);
}
.artifacts-tree-row:hover .artifacts-tree-actions,
.artifacts-tree-row:focus-within .artifacts-tree-actions,
.artifacts-tree-row.is-actions-open .artifacts-tree-actions { display: inline-flex; }
.artifacts-tree-ref { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); height: 18px; color: var(--dsw-alias-label-tertiary); font-size: 10.5px; font-weight: 600; line-height: 1; white-space: nowrap; cursor: pointer; border-radius: 999px; flex: none; align-items: center; justify-content: center; padding: 0 7px; display: inline-flex; }
.artifacts-tree-ref:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* Per-directory refresh: one level at a time, so a refresh never collapses
   the rest of the tree. Lives in the floating action cluster; pinned while the
   level is being re-read. */
.artifacts-tree-act { width: 18px; height: 18px; color: var(--dsw-alias-label-tertiary); cursor: pointer; background: transparent; border: none; border-radius: 4px; flex: none; justify-content: center; align-items: center; padding: 0; display: inline-flex; }
.artifacts-tree-act:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-act.is-busy { color: var(--dsw-alias-label-secondary); cursor: progress; }
.artifacts-tree-act.is-busy svg, .artifacts-tree-refresh.is-busy svg { animation: artifacts-spin .8s linear infinite; }
/* Brief pulse on the row that was just re-read, so a single-level refresh is
   visible without any list-wide reflow. */
.artifacts-tree-row.is-flashed { animation: artifacts-row-flash .9s var(--ds-ease-in-out, ease); }
.artifacts-tree-copied { font-size: 10.5px; line-height: 1; white-space: nowrap; color: var(--dsw-alias-label-tertiary); flex: none; }
/* Context menu (right-click on a row). */
.artifacts-tree-menu { position: fixed; z-index: 10001; min-width: 184px; padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1)); box-shadow: var(--dsw-shadow-lv2); outline: none; }
.artifacts-tree-menu-item { display: block; width: 100%; text-align: left; padding: 5px 10px; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.artifacts-tree-menu-item:hover, .artifacts-tree-menu-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2); }
/* The destructive item (删除). It reads as a warning, not a neighbour of the
   copy actions, so a right-click never hides it among the safe ones. */
.artifacts-tree-menu-item.is-danger { color: var(--dsw-alias-state-error-primary); }
.artifacts-tree-menu-item.is-danger:hover, .artifacts-tree-menu-item.is-danger.is-active { background: rgba(236, 19, 19, 0.12); }
/* Delete confirmation: the destructive action that must be answered. Drawn as a
   small fixed box (portaled to <body>, so it is measured from the viewport),
   above the menu's z-index so it wins even if both are briefly on screen. */
.artifacts-tree-confirm { position: fixed; z-index: 10002; width: 320px; padding: 14px 16px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1)); box-shadow: var(--dsw-shadow-lv3, var(--dsw-shadow-lv2)); outline: none; }
.artifacts-tree-confirm-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-state-error-primary); }
.artifacts-tree-confirm-body { margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-primary); word-break: break-all; }
.artifacts-tree-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.artifacts-tree-confirm-btn { padding: 5px 14px; font: inherit; font-size: 12px; cursor: pointer; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); }
.artifacts-tree-confirm-btn.is-danger { border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-state-error-primary); color: #fff; }
.artifacts-tree-confirm-btn.is-danger.is-busy { opacity: 0.7; cursor: default; }
.artifacts-tree-confirm-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: 1px; }
/* Transient "已删除 / 删除失败" note pinned above the tree body, so it survives
   the deleted row vanishing from under it. */
.artifacts-tree-flash-label { margin: 0 0 4px; padding: 4px 10px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236, 19, 19, 0.08); border-radius: 4px; }
/* Narrow panel: the「@引用」pill collapses to a compact '@' so the row's
   floating actions never overflow a cramped list/tree pane. */
@container (max-width: 460px) {
  .artifacts-tree-ref-text { display: none; }
  .artifacts-tree-ref { padding: 0 6px; }
}
/* Cramped panel: the tree header tightens instead of dropping controls.
   The bulk toolbar (展开全部 / 全部折叠) used to be hidden here — at the default
   panel width that is 20% of the window, i.e. under 400px on any screen
   narrower than 2000px, so those two buttons were *never* rendered as controls:
   the refresh button slid into their place and clicking there did nothing
   visible, which read as "全部折叠 点了没反应". Only the root label gives way
   now; it already ellipsizes, and 4 buttons fit in any usable panel. */
@container (max-width: 400px) {
  .artifacts-tree-header { padding-left: 6px; gap: 2px; }
  .artifacts-tree-tools { gap: 0; }
  .artifacts-tree-tool, .artifacts-tree-refresh { width: 20px; height: 20px; }
}
.artifacts-tree-loading { cursor: default ; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.artifacts-tree-error { cursor: default ; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
@keyframes artifacts-row-in { 0% { opacity: 0 } }
@keyframes artifacts-spin { to { transform: rotate(360deg) } }
@keyframes artifacts-row-flash { 0% { background: var(--dsw-alias-interactive-bg-active) } 100% { background: transparent } }

/* Renderer note (see rendererNote in src/client/preview.js): the file is one this
   panel can only show as plain text, while an installed renderer claims its
   suffix. A slim bar above the body, so it reads as an offer, not an error. */
.artifacts-renderer { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.artifacts-renderer-text { min-width: 0; flex: 1 1 auto; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-renderer-btn { flex: none; appearance: none; font: inherit; font-size: 12px; line-height: 1.5; background: transparent; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); border-radius: 8px; padding: 3px 10px; cursor: pointer; transition: color .15s, border-color .15s, background .15s; }
.artifacts-renderer-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
/* The pure-Markdown body rendered into the SHELL's document seat (see
   MarkdownDocumentBody in src/client/docpreview.js). It borrows the panel's own
   markdown styles wholesale — the two must not drift — and only adds the
   wrapper that keeps the owner's scroll container in charge. */
.artifacts-doc { min-width: 0; }
/* 用量 / 上下文 tab. The three composition tints are the product's own meter
   colours (ui-conversation's ContextMeter), so the same context reads the same
   way here as in the ring beside the composer. Figures are tabular so a column
   of them stays aligned. */
.artifacts-usage { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px var(--frog-pad-x) 20px; }
.artifacts-usage-head { display: flex; align-items: baseline; gap: 8px; }
.artifacts-usage-title { font-weight: 600; }
.artifacts-usage-percent { font-variant-numeric: tabular-nums; font-weight: 600; }
.artifacts-usage-figures { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.artifacts-usage-muted { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.artifacts-usage-block { margin-top: 14px; }
.artifacts-usage-label { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-bottom: 6px; }
.artifacts-usage-track { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--dsw-alias-border-l3); }
.artifacts-usage-seg { height: 100%; min-width: 2px; }
.artifacts-usage-tone-system { --frog-usage-tint: var(--dsw-static-neutral-bluish-400); }
.artifacts-usage-tone-tools { --frog-usage-tint: #a78bfa; }
.artifacts-usage-tone-messages { --frog-usage-tint: var(--dsw-static-blue-450); }
.artifacts-usage-seg.artifacts-usage-tone-system,
.artifacts-usage-seg.artifacts-usage-tone-tools,
.artifacts-usage-seg.artifacts-usage-tone-messages { background: var(--frog-usage-tint); }
.artifacts-usage-swatch { flex: none; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; display: inline-block; }
.artifacts-usage-swatch.artifacts-usage-tone-system,
.artifacts-usage-swatch.artifacts-usage-tone-tools,
.artifacts-usage-swatch.artifacts-usage-tone-messages { background: var(--frog-usage-tint); }
.artifacts-usage-legend { margin-top: 6px; }
.artifacts-usage-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.artifacts-usage-name { color: var(--dsw-alias-label-secondary); min-width: 0; }
.artifacts-usage-value { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
/* Git 只读切片 tab. The status letters use the product's own state tokens, so
   the same letters read the same way in both themes: added/renamed green,
   modified amber, deleted red, a conflict inverted (solid red, white letter).
   Rows are full-width buttons because the whole row opens its difference — the
   panel is far too narrow for a separate affordance column. */
.artifacts-git { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.artifacts-git-head { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px var(--frog-pad-x); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-git-branch { font-weight: 600; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-chip { flex: none; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 1px 7px; }
.artifacts-git-chip.is-warn { color: var(--dsw-alias-state-warn-label); border-color: var(--dsw-alias-state-warn-secondary); }
.artifacts-git-summary { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.artifacts-git-age { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.artifacts-git-upstream { flex: none; padding: 6px var(--frog-pad-x); font-size: 11px; color: var(--dsw-alias-label-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-upstream-note { color: var(--dsw-alias-label-secondary); }
.artifacts-git-truncated { flex: none; padding: 6px var(--frog-pad-x); font-size: 11px; color: var(--dsw-alias-state-warn-label); background: var(--dsw-alias-state-warn-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-git-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.artifacts-git-section { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-git-section-head { display: flex; align-items: baseline; gap: 8px; padding: 8px var(--frog-pad-x) 4px; }
.artifacts-git-section-title { font-size: 12px; font-weight: 600; }
.artifacts-git-section-count { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.artifacts-git-section-note { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-git-row { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; appearance: none; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 4px var(--frog-pad-x); cursor: pointer; }
.artifacts-git-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-git-row.is-open { background: var(--dsw-alias-interactive-bg-active); }
.artifacts-git-letter { flex: none; width: 16px; height: 16px; border-radius: 4px; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; font-family: var(--dsw-font-mono, ui-monospace, monospace); }
.artifacts-git-tone-add { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-secondary); }
.artifacts-git-tone-mod { color: var(--dsw-alias-state-warn-label); border-color: var(--dsw-alias-state-warn-secondary); }
.artifacts-git-tone-del { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-secondary); }
.artifacts-git-tone-ren { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-git-tone-new { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-git-tone-conflict { color: var(--dsw-alias-label-primary-foreground); background: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.artifacts-git-path { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-name { color: var(--dsw-alias-label-primary); }
.artifacts-git-dir { color: var(--dsw-alias-label-tertiary); }
.artifacts-git-dir:not(:empty) { margin-left: 6px; }
.artifacts-git-orig { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-git-diff { padding: 0 0 6px; }
.artifacts-git-empty { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 24px var(--frog-pad-x); text-align: center; }
.artifacts-git-empty-title { font-weight: 600; }
.artifacts-git-empty-note { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-tertiary); }
.artifacts-git-empty-path { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsw-font-mono, ui-monospace, monospace); word-break: break-all; opacity: .85; }
/* Settings section */
  .artifacts-settings { display: flex; flex-direction: column; gap: 14px; width: 100%; height: 100%; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
.artifacts-setintro { color: var(--dsw-alias-label-tertiary); margin: 0; padding: 0 2px; font-size: 13px; line-height: 20px; }
.artifacts-setbuild { color: var(--dsw-alias-label-tertiary); margin: 2px 0 0; padding: 0 2px; font-size: 11px; line-height: 16px; font-family: var(--dsw-font-mono, ui-monospace, monospace); opacity: .75; }
/* The two halves can legitimately be on different builds after a rebuild: the
   host is read once at process start, the client is fetched per page load. This
   line names the stale one instead of leaving a feature that "did nothing". */
.artifacts-setstale { color: var(--dsw-alias-state-warn-label); background: var(--dsw-alias-state-warn-tertiary); border: 1px solid var(--dsw-alias-state-warn-secondary); border-radius: 8px; margin: 6px 0 0; padding: 6px 9px; font-size: 12px; line-height: 18px; }
/* One line per lent renderer in the settings panel: the suffixes on the left,
   the live state on the right. A state that is not "live" is the interesting
   one, so the row colours it — that is the whole point of the block. */
.artifacts-setlendrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 4px 0 0; padding: 0 2px; font-size: 12px; line-height: 18px; }
.artifacts-setlendname { color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-mono, ui-monospace, monospace); }
.artifacts-setlendstate { color: var(--dsw-alias-label-tertiary); }
.artifacts-setlendstate.is-live { color: var(--dsw-alias-state-success-primary, #1a7f37); }
.artifacts-setlendstate.is-failed,
.artifacts-setlendstate.is-noregistry { color: var(--dsw-alias-state-error-primary); }
.artifacts-setlendstate.is-pending { color: var(--dsw-alias-state-warn-label); }
.artifacts-setlendwhy { flex: 1 1 100%; color: var(--dsw-alias-state-error-primary); font-size: 11px; word-break: break-word; }
/* Which surface the panel got (native tab vs the floating fallback). Worth a
   line of its own: it is what explains the absent width / 默认展开 preferences. */
.artifacts-setmode { color: var(--dsw-alias-label-secondary); margin: 2px 0 0; padding: 0 2px; font-size: 12px; line-height: 18px; }
.artifacts-setgroup { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); border-radius: 16px; padding: 6px 20px; display: flex; flex-direction: column; flex: none; }
.artifacts-setrow { border-bottom: 1px solid var(--dsw-alias-border-l2); justify-content: space-between; align-items: center; gap: 16px; padding: 12px 2px; display: flex; }
.artifacts-setrow:last-child { border-bottom: none; }
.artifacts-settext { flex-direction: column; gap: 4px; min-width: 0; display: flex; }
.artifacts-settitle { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.artifacts-setdesc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.artifacts-switch { cursor: pointer; flex: none; display: inline-flex; position: relative; }
  .artifacts-switch input { opacity: 0; width: 1px; height: 1px; margin: 0; position: absolute; }
.artifacts-switch-track { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; align-items: center; width: 36px; height: 20px; padding: 2px; transition: background .15s, border-color .15s; display: inline-flex; }
.artifacts-switch-thumb { background: var(--dsw-alias-label-secondary); border-radius: 50%; width: 14px; height: 14px; transition: transform .15s, background .15s; display: block; }
.artifacts-switch:hover .artifacts-switch-track { border-color: var(--dsw-alias-label-dimmed); }
.artifacts-switch input:checked + .artifacts-switch-track { border-color: var(--dsw-alias-button-primary-fill); background: var(--dsw-alias-button-primary-fill); }
.artifacts-switch input:checked + .artifacts-switch-track .artifacts-switch-thumb { background: var(--dsw-alias-bg-layer-3); transform: translate(16px); }
.artifacts-switch input:focus-visible + .artifacts-switch-track { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.artifacts-setcontrol { flex: none; align-items: center; gap: 6px; display: flex; }
/* A stacked settings row: the control sits UNDER its label rather than beside it.
   Four skin names do not fit the control column of a settings row, and squeezing
   them onto one line made the row unreadable — which is how an operable control
   starts looking like one that cannot be used. */
.artifacts-setrow.is-stacked { flex-direction: column; align-items: flex-start; gap: 8px; }
.artifacts-setchips { flex-wrap: wrap; gap: 6px; }
/* The skin chips: the same affordance as the panel's own chips, so a small closed
   choice reads the same wherever it appears. */
.artifacts-chip { padding: 4px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.artifacts-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, .12)); color: var(--dsw-alias-label-primary); }
.artifacts-chip.is-on { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.artifacts-widthinput { width: 76px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; border-radius: 6px; padding: 4px 8px; }
.artifacts-suffix { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }

/* Delete mode */
.artifacts-delete-hint { padding: 6px 12px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236, 19, 19, 0.08); border-bottom: 1px solid var(--dsw-alias-border-l2); flex: none; }
.artifacts-iconbtn.artifacts-delete-on { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: rgba(236, 19, 19, 0.08); }
.artifacts-item.is-delete-marked { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: -2px; background: rgba(236, 19, 19, 0.06); --frog-row-bg: rgba(236, 19, 19, 0.06); }
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; }
.artifacts-delete-x { color: var(--dsw-alias-state-error-primary); font-size: 16px; font-weight: 700; line-height: 1; }
.artifacts-delete-x:hover { background: rgba(236, 19, 19, 0.12); color: var(--dsw-alias-state-error-primary); }

/* Code preview (syntax-highlighted via DSH's Shiki — token colors come from
   the app's global--shiki-token-* palette, matching the rest of DSH) */
.artifacts-code { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-code-head { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 8px; height: var(--frog-h-strip); padding: 0 var(--frog-pad-x); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-code-lang { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); padding: 1px 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1)); }
.artifacts-code-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }
.artifacts-code-gutter { flex: none; min-width: 3em; margin: 0; padding: 12px 10px 12px 12px; text-align: right; color: var(--dsw-alias-label-tertiary); border-right: 1px solid var(--dsw-alias-border-l1); position: sticky; left: 0; user-select: none; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); font: 12px / 1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre { flex: 1; margin: 0; padding: 12px; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--shiki-foreground, var(--dsw-alias-label-primary)); font: 12px / 1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre code { font: inherit; color: inherit; }
.artifacts-code-line { display: block; }

/* Token colors for the shared self-contained highlighter (markdown fenced
   code blocks). Palette matches the standalone page + DSH's--shiki-* hues. */
.tok-comment { color: #868e96; }
.tok-string { color: #2f9e44; }
.tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
.tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
.tok-function, .tok-decorator { color: #6741d9; }
.tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
.tok-property { color: #495057; }
/* Dark theme: these four rules used to be written as body[data-ds-dark-theme]
   immediately followed by the token class (no space), so they never matched and
   markdown code blocks stayed on the light palette in dark mode. */
body[data-ds-dark-theme] .tok-comment { color: #adb5bd; }
body[data-ds-dark-theme] .tok-string { color: #69db7c; }
body[data-ds-dark-theme] .tok-number, body[data-ds-dark-theme] .tok-bool, body[data-ds-dark-theme] .tok-variable, body[data-ds-dark-theme] .tok-hex, body[data-ds-dark-theme] .tok-attr { color: #ffa94d; }
body[data-ds-dark-theme] .tok-keyword, body[data-ds-dark-theme] .tok-important, body[data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
body[data-ds-dark-theme] .tok-function, body[data-ds-dark-theme] .tok-decorator { color: #b197fc; }
body[data-ds-dark-theme] .tok-class, body[data-ds-dark-theme] .tok-builtin, body[data-ds-dark-theme] .tok-tag, body[data-ds-dark-theme] .tok-key { color: #74c0fc; }
body[data-ds-dark-theme] .tok-property { color: #ced4da; }


/* ── Table view (CSV / TSV) ────────────────────────────────────────────────
   A spreadsheet reads as a grid or it does not read at all: the header is
   sticky (a 500-row export is unusable otherwise), the numbers are right
   aligned with tabular figures so columns line up digit for digit, and the
   first column keeps a little more weight — the same affordance a spreadsheet
   gives its row labels. Colours are the shell's own tokens; there is nothing
   here an IDE theme would not already know how to paint. */
.artifacts-table-view { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.artifacts-table-status {
  flex: none; padding: 6px 10px;
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.artifacts-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.artifacts-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 12px; }
.artifacts-table-headrow { position: sticky; top: 0; z-index: 1; }
.artifacts-table-th {
  position: sticky; top: 0; z-index: 1;
  background: var(--dsw-alias-bg-layer-2);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 0; text-align: left; font-weight: 600; white-space: nowrap;
}
.artifacts-table-th.is-sorted { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-table-sortbtn {
  display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 5px 8px; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-weight: 600; color: var(--dsw-alias-label-secondary);
  text-align: left;
}
.artifacts-table-sortbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-table-sortbtn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.artifacts-table-headtext { overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.artifacts-table-arrow { flex: none; font-size: 9px; color: var(--dsw-alias-state-business-primary); }
.artifacts-table-td {
  padding: 4px 8px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  border-right: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.artifacts-table-td.is-number { text-align: right; font-variant-numeric: tabular-nums; }
.artifacts-table-td.is-first { color: var(--dsw-alias-label-primary); }
.artifacts-table-tr:hover .artifacts-table-td { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-table-empty { color: var(--dsw-alias-label-dimmed); }

/* ── Audio / video ────────────────────────────────────────────────────────
   The element brings its own controls: the shell's player is the browser's, and
   anything drawn on top of it would only be a second, worse transport. */
.artifacts-media { display: flex; flex-direction: column; gap: 10px; padding: 14px; min-height: 0; overflow: auto; }
.artifacts-media-frame { display: flex; justify-content: center; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px; }
.artifacts-media-frame.is-audio { padding: 16px 12px; }
.artifacts-video { max-width: 100%; max-height: 60vh; border-radius: 4px; background: #000; }
.artifacts-audio { width: 100%; max-width: 520px; }
.artifacts-media-meta { display: flex; align-items: baseline; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-media-kind { flex: none; padding: 1px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.artifacts-media-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-media-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-media-error { font-size: 12px; color: var(--dsw-alias-state-warn-label); line-height: 1.6; }

/* ── Binary document card ─────────────────────────────────────────────────
   Says what the file is and why it is not being decoded, then offers the two
   honest ways out. A card is the whole point: showing the bytes as text is the
   screen of mojibake this replaced. */
.artifacts-doc-card {
  display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
  margin: 14px; padding: 16px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
}
.artifacts-doc-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.artifacts-doc-text { margin: 0; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.artifacts-doc-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.artifacts-doc-btn {
  padding: 5px 12px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.artifacts-doc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-doc-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.artifacts-doc-btn:disabled { opacity: 0.6; cursor: default; }
.artifacts-doc-btn.is-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: #fff; }
.artifacts-doc-btn.is-primary:hover { background: var(--dsw-alias-button-primary-fill); opacity: 0.9; }
.artifacts-doc-note { padding: 6px 10px; font-size: 11px; color: var(--dsw-alias-state-warn-label); }

/* ── Office documents (docx / xlsx / pptx) ────────────────────────────────
   The widget itself is styled by the SHARED stylesheet (src/shared/office.css,
   appended to this file's stylesheet at build time) so the shell's sidebar and
   the popout tab cannot drift. What is here is only the box it is mounted in:
   the widget tries to fill it, and degrades to content height when the seat
   gives no definite height — a document that scrolls with the panel is a fine
   outcome, a collapsed one is not. */
.artifacts-office { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; }
.artifacts-office-host { flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden; }
/* …and the same box when the shell's document seat mounts it: the body wrapper
   has to be a flex column for the widget below it to get a height at all. */
.artifacts-doc.is-office { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* The lent PDF body (only on an engine whose own PDF renderer cannot run).
   The plugin's PdfView fills its parent ABSOLUTELY, so that parent must be
   positioned and have a height: the seat's own box can report zero height for
   a body that does not claim a scrollport, and a PDF drawn into a zero-height
   relative box is an invisible PDF. Hence the min-height floor. */
.artifacts-doc.is-pdf { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 320px; }
.artifacts-doc.is-pdf > .artifacts-pdfview { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }

/* ── 在弹出页打开 (open the file that is on screen in the popout tab) ────────
   ONE control per open file, and it never owns a row: the editor toolbar carries
   it where the file is editable (that toolbar exists anyway), and where it does
   not, the BAND carries it — the strip of file tabs, which is the row above the
   document. It reads as a quiet link rather than a primary action, because it
   LEAVES the sidebar and so must not compete with 保存. */
.artifacts-doclink-slot { display: inline-flex; align-items: center; flex: none; }
/* The band scrolls sideways and 清除 already sticks to its right edge: two sticky
   items in one row would overlap, so this one takes the free slot after it. */
.artifacts-tabs > .artifacts-doclink-slot { order: 90; }
.artifacts-doclink {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  padding: 2px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary);
  font-size: 11px; font-weight: 500; line-height: 1.4; text-decoration: none;
  transition: color .15s, border-color .15s, background .15s;
}
.artifacts-doclink:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); text-decoration: none; }
.artifacts-doclink:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.artifacts-doclink svg { flex: none; }
/* In a narrow column the two words cost the file tabs their width, and the tab
   names are the more useful of the two: the label goes, the icon, title and
   aria-label stay. */
.artifacts-doclink.is-compact .artifacts-doclink-label { display: none; }
.artifacts-doclink.is-compact { padding: 2px 6px; }

/* ── 编辑 (editing) ──────────────────────────────────────────────────────────
   The editor pane: a toolbar (预览/编辑 toggle, 重新载入, 保存), an optional
   conflict bar, and the CodeMirror mount. CodeMirror's own colours come from
   EditorView.theme in src/shared/editor.js — a plugin cannot reliably restyle
   .cm-* from here, because CodeMirror injects its sheets after this one and both
   are plain classes. What belongs here is the box: the mount must be a definite
   height inside a flex column, or the editor collapses to zero and shows
   nothing. */
.artifacts-editpane { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.artifacts-edbar {
  box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 8px;
  height: var(--frog-h-strip); padding: 0 var(--frog-pad-x);
  border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
}
.artifacts-edbar-group { display: flex; align-items: center; gap: 6px; min-width: 0; }
.artifacts-edbar-group:first-child { flex: none; }
/* The right-hand group carries the status and the two actions; it takes the
   remaining width so the buttons stay at the right edge however long the status
   text is. */
.artifacts-edbar-group:last-child { flex: 1 1 auto; justify-content: flex-end; }
.artifacts-edbtn {
  appearance: none; flex: none; font: inherit; font-size: 11px; font-weight: 500; line-height: 1.4;
  padding: 2px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary);
  transition: color .15s, border-color .15s, background .15s;
}
.artifacts-edbtn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-edbtn:disabled { opacity: .6; cursor: default; }
.artifacts-edbtn.is-on { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-active); border-color: var(--dsw-alias-label-dimmed); }
/* 保存 is the pane's one primary action. */
.artifacts-edbtn-save { font-weight: 600; }
.artifacts-edbtn-save:not(:disabled) { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-edbtn-save:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-accent); }
.artifacts-edbtn-force { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
/* The two-step confirm (重新载入 / closing a dirty tab). */
.artifacts-edbtn.is-armed { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-ednote { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.artifacts-edstatus { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-edstatus.is-dirty { color: var(--dsw-alias-state-business-primary); }
.artifacts-edstatus.is-bad { color: var(--dsw-alias-state-error-primary); }
/* The conflict bar: the file changed under the editor. It states the fact and
   offers the only two honest answers — take the disk version, or overwrite it. */
.artifacts-edconflict {
  box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 6px;
  padding: 4px var(--frog-pad-x); font-size: 11px;
  background: var(--dsw-alias-interactive-bg-hover); border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.artifacts-edconflict-ico { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; font-size: 10px; font-weight: 700; color: var(--dsw-alias-bg-layer-1); background: var(--dsw-alias-state-error-primary); }
.artifacts-edconflict-text { flex: 1 1 auto; min-width: 0; }
.artifacts-edconflict-actions { flex: none; display: flex; align-items: center; gap: 6px; }
/* The mount. A relative position gives the loading hint a box to sit in while
   the 604 KB CodeMirror bundle arrives, and the definite height is what makes
   the scroller scroll instead of growing the panel. */
.artifacts-edmount { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.artifacts-edcm { flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden; }
.artifacts-edcm .cm-editor { height: 100%; }
.artifacts-edcm .cm-editor.cm-focused { outline: none; }
.artifacts-edhint {
  position: absolute; inset: auto 0 0 0; padding: 6px var(--frog-pad-x);
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1); border-top: 1px solid var(--dsw-alias-border-l2);
}
/* Office widgets (src/shared/office.js) — one stylesheet for BOTH faces.
   Splice points: the client bundle's styles.insert(...) (src/client/body.js) and
   the popout page's <style> block (src/host/page.js), so the same .docx looks
   the same in the shell's preview and in the standalone tab.

   The palette is a fallback chain because the two faces sit in different design
   systems: inside the shell the DSH tokens (--dsw-alias-*) are defined, in the
   standalone page this plugin's own popout tokens (--p-*) are. Declaring the
   widget's colours ONCE here means neither face has to know which pair it is. */
.office-view,
.office-state {
  --office-bg: var(--dsw-alias-bg-base, var(--p-bg, transparent));
  --office-layer: var(--dsw-alias-bg-layer-1, var(--p-bg-layer-1, rgba(127, 127, 127, 0.08)));
  --office-border: var(--dsw-alias-border-l2, var(--p-border-l2, rgba(127, 127, 127, 0.32)));
  --office-text: var(--dsw-alias-label-primary, var(--p-text, inherit));
  --office-muted: var(--dsw-alias-label-tertiary, var(--p-text-tertiary, rgba(127, 127, 127, 0.95)));
  --office-hover: var(--dsw-alias-interactive-bg-hover, var(--p-hover, rgba(127, 127, 127, 0.14)));
  --office-accent: var(--dsw-alias-state-business-primary, var(--p-accent, #3b82f6));
  --office-error: var(--dsw-alias-state-error-primary, var(--p-error, #ef4444));
}

.office-view {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  color: var(--office-text);
  font-size: 13px;
  line-height: 1.5;
}
.office-view *,
.office-view *::before,
.office-view *::after { box-sizing: border-box; }

/* Loading / failure lines. Both faces draw these while a library is fetched and
   when one refuses the file, so "why is it blank" always has an answer. */
.office-state { padding: 14px 16px; color: var(--office-muted); font-size: 12px; line-height: 1.7; }
.office-state.is-error { color: var(--office-error); white-space: pre-wrap; }

/* Toolbar band: sheet tabs for a workbook, page navigation for a deck. */
.office-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--office-layer);
  border-bottom: 1px solid var(--office-border);
  overflow-x: auto;
}
.office-bar.is-empty { display: none; }
.office-tab {
  flex: none;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--office-muted);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.office-tab:hover { background: var(--office-hover); color: var(--office-text); }
.office-tab.is-active { background: var(--office-bg); border-color: var(--office-border); color: var(--office-text); font-weight: 600; }
.office-tab:focus-visible { outline: 2px solid var(--office-accent); outline-offset: 1px; }
.office-count { margin-left: auto; color: var(--office-muted); font-size: 12px; white-space: nowrap; }
.office-page { min-width: 58px; text-align: center; color: var(--office-muted); font-size: 12px; white-space: nowrap; }
.office-nav {
  flex: none;
  width: 26px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--office-border);
  background: var(--office-bg);
  color: var(--office-text);
  font: inherit;
  cursor: pointer;
}
.office-nav:hover:not(:disabled) { background: var(--office-hover); }
.office-nav:focus-visible { outline: 2px solid var(--office-accent); outline-offset: 1px; }
.office-nav:disabled { opacity: 0.45; cursor: default; }

.office-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.office-note { padding: 8px 10px; color: var(--office-muted); font-size: 12px; }

/* The box a widget is mounted in (the popout page's caller). The React face has
   its own equivalent in src/client/styles.js, where the surrounding panel owns
   the naming; this one exists so the page does not have to invent a height. */
.office-host { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.office-host > .office-view { flex: 1 1 auto; min-height: 0; }

/* ── Word: docx-preview draws stacked pages on a gray desk ─────────────────
   That IS what a document looks like, so only the palette is ours: the desk
   becomes the panel's layer colour and the pages stay paper-white (the
   renderer writes black-on-white inline styles; a dark page would hide them).
   !important because docx-preview injects its own <style> next to the pages. */
.office-view.office-docx { display: block; overflow: auto; }
.office-docx-page-wrapper {
  background: var(--office-layer) !important;
  padding: 16px !important;
  display: flex;
  flex-flow: column;
  align-items: center;
}
.office-docx-page-wrapper > section.office-docx-page {
  background: #fff;
  color: #111;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.3);
  margin-bottom: 16px;
}

/* ── Excel: a real grid, so column alignment means something ───────────────*/
.office-grid-wrap { display: inline-block; min-width: 100%; }
.office-grid { border-collapse: collapse; font-size: 12px; color: var(--office-text); }
.office-grid td {
  border: 1px solid var(--office-border);
  padding: 2px 8px;
  white-space: pre;
  vertical-align: top;
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.office-grid-head { position: sticky; top: 0; z-index: 1; background: var(--office-layer); font-weight: 600; }

/* ── PowerPoint: the renderer owns the slides, this is their desk ──────────*/
.office-pptx-stage { display: block; background: var(--office-layer); }
`)

              // ── Panel actions ───────────────────────────────────────────────────────
    // Three different actions, three different pictures. They used to share one
    // glyph (a panel box with a pop-out arrow) for "收起侧边栏" AND for the closed
    // state's trigger, while the actual pop-out was a bare「↖」— so the button
    // that closed the panel looked like the button that opened or popped it out.
    //
    // 「打开侧边栏」: the panel itself — a box with the divider on the right.
    const PanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2.4, stroke: 'currentColor', strokeWidth: 1.5 }),
      React.createElement('line', { x1: 10.2, y1: 3.4, x2: 10.2, y2: 12.6, stroke: 'currentColor', strokeWidth: 1.5 }),
      React.createElement('line', { x1: 12.4, y1: 6.4, x2: 12.4, y2: 9.6, stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
    )

    // 「收起侧边栏」: the panel's edge with both chevrons pointing into it — the
    // standard "collapse this panel" glyph (the mirror of how the main sidebar
    // toggle reads).
    const CollapsePanelIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('line', { x1: 13.2, y1: 3, x2: 13.2, y2: 13, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      React.createElement('path', { d: 'M3.2 5.4 L5.8 8 L3.2 10.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M7.4 5.4 L10 8 L7.4 10.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )

    // 「弹出到新标签页」: an arrow leaving a box — the window that opens is the
    // point, so the glyph is the gesture, not the panel.
    const PopoutIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', {
        d: 'M6.6 3.2H3.7A1.3 1.3 0 0 0 2.4 4.5v7.8a1.3 1.3 0 0 0 1.3 1.3h7.8a1.3 1.3 0 0 0 1.3-1.3V9.4',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round',
      }),
      React.createElement('path', { d: 'M9.8 2.4h3.8v3.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M13.4 2.6 L8 8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    )

    // Directory rows draw the SAME outline folder the built-in tree draws
    // (FolderCloseArtwork / IconFolderOpenArtwork, geometry generated from the
    // install, description shared through filetype.js folderGlyphParts). The
    // closed folder is two 1px strokes; the open one is three fills, the front
    // panel at 16% — copying the artwork is what makes a folder look like the
    // shell's own rather than merely folder-shaped.
    const FolderClosedIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      folderGlyphParts(false).map((part, i) => React.createElement('path', {
        key: i, d: part.d, stroke: part.stroke, strokeWidth: part.strokeWidth,
      })))

    const FolderOpenIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      folderGlyphParts(true).map((part, i) => React.createElement('path', {
        key: i, d: part.d, fill: part.fill, opacity: part.opacity,
      })))

    const FileCodeIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      fillRule: 'evenodd', clipRule: 'evenodd',
      d: 'M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z',
      fill: 'currentColor',
    }))

    const RefreshIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', { d: 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z', fill: 'currentColor' }))

    // ── File-type glyph (the shell's own `FileTypeIcon`) ────────────────
    // The picture a file row gets, described by src/shared/filetype.js so the
    // popout page's DOM tree draws byte-identical geometry from the same data:
    //
    //   * a CODE FILE gets its language's full-colour brand square — the 48
    //     20×20 glyphs the built-in tree shows (the JS logo, the Rust gear, the
    //     Node hexagon for `package.json`);
    //   * anything else gets the 28×28 file card whose mark names the kind
    //     (MD / PDF / a spreadsheet grid / a play triangle / the code chevrons),
    //     tinted by the kind class on the wrapping span.
    //
    // This replaces a generic stroked document outline that said only "this is
    // a file": the colour and the mark ARE the type signal, and a 48-icon brand
    // set is the thing the built-in tree was already reading.
    let iconInstanceSeq = 0
    const FileTypeGlyph = (props) => {
      const px = props.size || 16
      const glyph = iconGlyph(props.path)
      if (glyph.tier === 'code') {
        // Instance-scoped ids: 31 of the 48 glyphs carry <linearGradient> /
        // <clipPath> and their artwork references those ids. Two rows showing
        // the same brand — or one row repainted — would make the second copy
        // silently borrow the first one's paint, so every instance stamps its
        // own id into the token. `useId` is what the primitives' own
        // CodeFileIcon uses; the counter is the fallback for a React without it
        // (the call stays unconditional, so hook order never depends on state).
        const hasUseId = typeof React.useId === 'function'
        const rawId = hasUseId ? React.useId() : ''
        const instanceId = 'dsh-code-icon-' +
          (rawId ? String(rawId).replace(/:/g, '') : 'i' + (iconInstanceSeq += 1))
        return React.createElement('svg', {
          width: px, height: px, viewBox: '0 0 20 20', className: props.className,
          xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
          dangerouslySetInnerHTML: { __html: glyph.art.split(CODE_ICON_ID_TOKEN).join(instanceId) },
        })
      }
      // The card: body + folded corner, then the kind's mark inside the group
      // whose transform scales it (null for `code` / `excel`, exactly as the
      // built-in leaves those two untransformed).
      const bodyAndFold = glyph.parts.slice(0, 2)
      const marks = glyph.parts.slice(2)
      return React.createElement('svg', {
        width: px, height: px, viewBox: '0 0 28 28', fill: 'none', className: props.className,
        xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': true,
      },
        bodyAndFold.map((part, i) => React.createElement('path', {
          key: 'p' + i, d: part.d, fill: part.fill, fillOpacity: part.fillOpacity,
        })),
        glyph.mark
          ? React.createElement('g', { key: 'mark', transform: glyph.markTransform || undefined },
            marks.map((part, i) => React.createElement('path', {
              key: 'm' + i, d: part.d,
              fill: part.fill, fillRule: part.fillRule, clipRule: part.clipRule,
              stroke: part.stroke, strokeWidth: part.strokeWidth,
            })))
          : null,
      )
    }

    // Disclosure chevron for tree rows (CSS rotates it: right → down).
    const TreeChevronIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 10 10', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      d: 'M3.4 1.6 L6.8 5 L3.4 8.4',
      stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none',
    }))

    // Explorer toolbar: expand all / collapse all / filter.
    const ExpandAllIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M4 6.2 L8 2.6 L12 6.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M4 9.8 L8 13.4 L12 9.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )

    const CollapseAllIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M4 2.6 L8 6.2 L12 2.6', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      React.createElement('path', { d: 'M4 13.4 L8 9.8 L12 13.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    )

    const SearchIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('circle', { cx: 7, cy: 7, r: 4.2, stroke: 'currentColor', strokeWidth: 1.3 }),
      React.createElement('path', { d: 'M10.2 10.2 L13.6 13.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
    )

    // 新建: the tree header's plus. It opens the two create verbs rather than
    // guessing a kind, which is why it is a plus and not a "new file" glyph.
    const PlusIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    },
      React.createElement('path', { d: 'M8 3.2 V12.8 M3.2 8 H12.8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    )

    const CloseIcon = (size) => React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true,
    }, React.createElement('path', {
      d: 'M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5',
      stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
    }))


              // Change review: the ledger's before/after text rendered as one line-per-row
    // diff (shared line-diff module, so the popout page paints the identical
    // picture), plus the 撤销 affordance when the host kept a revertible
    // snapshot. `undo` is {can, kind, opId, reason} as the host described it, and
    // `onUndo` is the panel's own handler (absent in the popout tab, which talks
    // to the same route itself).
    const renderDiff = (diff, undo, onUndo, busy) => {
      const stats = diffLines(diff && diff.before, diff && diff.after)
      const counts = diffStats(stats.rows)
      const title = React.createElement('div', { key: 'title', className: 'artifacts-diff-title' },
        // The title names WHICH comparison this is. It defaults to the ledger's
        // own wording (this before/after pair came from a tracked edit), and the
        // callers that compare something else — the Git view, which shows the
        // worktree against HEAD and edited nothing itself — pass their own.
        React.createElement('span', { className: 'artifacts-diff-name' }, (diff && diff.title) || '编辑差异'),
        React.createElement('span', { className: 'artifacts-diff-stat' }, '+' + counts.add + '  −' + counts.del),
        diff && diff.truncated ? React.createElement('span', { className: 'artifacts-diff-note' }, '（已截断）') : null,
        undo && undo.can && onUndo ? React.createElement('button', {
          key: 'undo',
          type: 'button',
          className: 'artifacts-undo',
          disabled: !!busy,
          title: '把这次改动还原成改动前的内容',
          onClick: () => onUndo(undo.opId),
        }, busy ? '撤销中…' : '撤销') : null,
        undo && !undo.can && undo.reason ? React.createElement('span', { key: 'why', className: 'artifacts-diff-note', title: undo.reason }, '不可撤销') : null,
      )
      const rows = stats.rows.map((row, i) => React.createElement('div', {
        key: 'r' + i,
        className: 'artifacts-diff-row artifacts-diff-' + (row.t === 'add' ? 'add' : row.t === 'del' ? 'del' : 'ctx'),
      },
        React.createElement('span', { className: 'artifacts-diff-no' }, row.oldNo == null ? '' : String(row.oldNo)),
        React.createElement('span', { className: 'artifacts-diff-no' }, row.newNo == null ? '' : String(row.newNo)),
        React.createElement('span', { className: 'artifacts-diff-sign' }, row.t === 'add' ? '+' : row.t === 'del' ? '-' : ' '),
        React.createElement('span', { className: 'artifacts-diff-text' }, row.text === '' ? ' ' : row.text),
      ))
      return React.createElement('div', { className: 'artifacts-diff' }, [title,
        React.createElement('div', { key: 'rows', className: 'artifacts-diff-rows' }, rows.length ? rows : React.createElement('div', { className: 'artifacts-diff-row artifacts-diff-ctx' }, '（内容相同）')),
      ])
    }

    // Map file extensions to DSH's Shiki language ids (mirrors the client UI's
    // LANG_ALIASES so the Shiki-powered CodeBlock resolves the same grammars).
    const LANG_BY_EXT = {
      js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx', ts: 'ts', tsx: 'tsx', mts: 'ts', cts: 'ts',
      json: 'json', jsonc: 'jsonc', json5: 'js',
      py: 'py', pyw: 'py', rb: 'rb', ruby: 'rb', go: 'go', rs: 'rust', rust: 'rust',
      java: 'java', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'cs',
      kotlin: 'kotlin', kt: 'kotlin', swift: 'swift', php: 'php',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', conf: 'ini', properties: 'ini', env: 'ini',
      md: 'md', markdown: 'md', mdx: 'mdx', html: 'html', htm: 'html', xhtml: 'html', vue: 'html',
      css: 'css', scss: 'scss', less: 'less', sql: 'sql', xml: 'xml', svg: 'xml', lua: 'lua',
      sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', fish: 'sh',
    }
    const LANG_NAMES = {
      js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', json: 'JSON', jsonc: 'JSON',
      py: 'Python', rb: 'Ruby', go: 'Go', rust: 'Rust', java: 'Java', c: 'C', cpp: 'C++',
      cs: 'C#', kotlin: 'Kotlin', swift: 'Swift', php: 'PHP', yaml: 'YAML', toml: 'TOML',
      ini: 'INI', md: 'Markdown', mdx: 'MDX', html: 'HTML', css: 'CSS', scss: 'SCSS',
      less: 'Less', sql: 'SQL', xml: 'XML', lua: 'Lua', sh: 'Shell',
    }
    const langFromExt = (path) => LANG_BY_EXT[fileExt(path)] || ''

    // Code preview with syntax highlighting. Uses DSH's own Shiki `CodeBlock`
    // component when available (native look + copy button + language banner);
    // otherwise falls back to a plain code view with line numbers + label.
    const CodeView = (props) => {
      const hl = (typeof primitives !== 'undefined' && primitives) ? primitives : null
      const CodeBlockCmp = hl && typeof hl.CodeBlock === 'function' ? hl.CodeBlock : null
      const code = String(props.code || '')
      const lang = props.lang || ''
      if (CodeBlockCmp) {
        return React.createElement(CodeBlockCmp, { code, lang: lang || undefined })
      }
      const srcLines = code.replace(/\n$/, '').split('\n')
      const gutter = srcLines.map((_, i) => String(i + 1)).join('\n')
      return React.createElement('div', { className: 'artifacts-code' },
        React.createElement('div', { className: 'artifacts-code-head' },
          React.createElement('span', { className: 'artifacts-code-lang' }, LANG_NAMES[lang] || (lang || 'Text')),
        ),
        React.createElement('div', { className: 'artifacts-code-scroll' },
          React.createElement('pre', { className: 'artifacts-code-gutter', 'aria-hidden': true }, gutter),
          React.createElement('pre', { className: 'artifacts-code-pre' },
            React.createElement('code', null, code),
          ),
        ),
      )
    }

    // ── PDF preview (sidebar): custom pdf.js renderer ─────────────────────
    // No native viewer toolbar; fit-to-width by default with zoom / page
    // controls. Loads the vendored pdf.js served by the host (offline-safe).
    let _pdfjsPromise = null
    const loadPdfjs = () => {
      if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
      if (window.pdfjsLib) {
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/dsh-sidebar-frog/pdfjs/pdf.worker.min.js' } catch (e) {}
        return Promise.resolve(window.pdfjsLib)
      }
      if (_pdfjsPromise) return _pdfjsPromise
      _pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/dsh-sidebar-frog/pdfjs/pdf.min.js'
        s.async = true
        s.onload = () => {
          try {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/dsh-sidebar-frog/pdfjs/pdf.worker.min.js'
            resolve(window.pdfjsLib)
          } catch (e) { reject(e) }
        }
        s.onerror = () => { _pdfjsPromise = null; reject(new Error('pdf.js 加载失败')) }
        document.head.appendChild(s)
      })
      return _pdfjsPromise
    }

    // ── Math rendering for Markdown previews ─────────────────────────────
    // MathJax (v3, vendored) typesets the $...$ / $$...$$ left verbatim by the
    // shared mdToHtml renderer. It is loaded lazily — only once a Markdown
    // artifact is actually previewed — from the host-served copy (offline-safe).
    // startup.typeset is disabled so only our markdown containers are scanned.
    let _mathjaxPromise = null
    const loadMathJax = () => {
      if (typeof window === 'undefined') return Promise.resolve(null)
      const mj = window.MathJax
      if (mj && mj.startup && mj.startup.promise) {
        return mj.startup.promise.then(() => (window.MathJax && typeof window.MathJax.typesetPromise === 'function' ? window.MathJax : null)).catch(() => null)
      }
      if (mj && typeof mj.typesetPromise === 'function') return Promise.resolve(mj)
      if (_mathjaxPromise) return _mathjaxPromise
      if (!window.MathJax) {
        window.MathJax = {
          tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] },
          svg: { fontCache: 'local' },
          startup: { typeset: false },
        }
      }
      _mathjaxPromise = new Promise((resolve) => {
        const s = document.createElement('script')
        s.src = '/dsh-sidebar-frog/mathjax/tex-svg.js'
        s.async = true
        s.onload = () => {
          const j = window.MathJax
          if (j && j.startup && j.startup.promise) {
            j.startup.promise.then(() => resolve(j)).catch(() => resolve(j))
            return
          }
          resolve(j || null)
        }
        s.onerror = () => { _mathjaxPromise = null; resolve(null) }
        document.head.appendChild(s)
      })
      return _mathjaxPromise
    }

    // ── Mermaid rendering for Markdown previews ──────────────────────────
    // Mermaid (v11, vendored) renders the ```mermaid fences that mdToHtml
    // keeps verbatim inside .mermaid containers. Lazy-loaded from the
    // host-served copy only when a preview actually contains a diagram
    // (offline-safe). The theme follows the current app theme at render time.
    let _mermaidPromise = null
    let _mermaidSeq = 0
    const loadMermaid = () => {
      if (typeof window === 'undefined') return Promise.resolve(null)
      const mm = window.mermaid
      if (mm && typeof mm.render === 'function') return Promise.resolve(mm)
      if (_mermaidPromise) return _mermaidPromise
      _mermaidPromise = new Promise((resolve) => {
        const s = document.createElement('script')
        s.src = '/dsh-sidebar-frog/mermaid/mermaid.min.js'
        s.async = true
        s.onload = () => resolve(window.mermaid && typeof window.mermaid.render === 'function' ? window.mermaid : null)
        s.onerror = () => { _mermaidPromise = null; resolve(null) }
        document.head.appendChild(s)
      })
      return _mermaidPromise
    }
    const isDarkScheme = () => {
      try {
        const d = document.documentElement
        const b = document.body
        if (d && d.hasAttribute('data-ds-dark-theme')) return true
        if (b && b.hasAttribute('data-ds-dark-theme')) return true
      } catch (e) {}
      return false
    }
    // Replace every .mermaid block under `node` with its rendered SVG. A block
    // that fails to parse falls back to showing its raw source, so the preview
    // never silently loses content. `node` mutations are guarded by isConnected
    // so a stale async pass can never overwrite a newer preview.
    const renderMermaidIn = (node) => {
      if (!node || !node.querySelector) return
      const els = Array.prototype.slice.call(node.querySelectorAll('.mermaid'))
      if (!els.length) return
      loadMermaid().then((mm) => {
        if (!mm) return
        try {
          mm.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: isDarkScheme() ? 'dark' : 'default',
          })
        } catch (e) {}
        els.forEach((el) => {
          if (!el.isConnected) return
          const src = (el.textContent || '').replace(/^\s+|\s+$/g, '')
          if (!src) return
          _mermaidSeq += 1
          const id = 'dshfrog-mm-' + _mermaidSeq + '-' + Date.now()
          mm.render(id, src).then((res) => {
            if (!el.isConnected) return
            el.innerHTML = res && res.svg ? res.svg : ''
            el.setAttribute('data-processed', 'true')
          }).catch(() => {
            if (!el.isConnected) return
            el.classList.add('mermaid-error')
            el.textContent = ''
            const pre = document.createElement('pre')
            pre.className = 'mermaid-fallback'
            pre.textContent = src
            el.appendChild(pre)
            el.setAttribute('data-processed', 'true')
          })
        })
      })
    }

    // ── JSXGraph rendering for Markdown previews ─────────────────────────
    // JSXGraph (vendored) runs ```jsxgraph code blocks that mdToHtml keeps
    // verbatim inside .jsxgraph containers. Only loaded (script + stylesheet)
    // when a preview actually contains a block. The snippet runs with the
    // generated board container in scope: `JXG` (the library), `BOARDID`
    // (the container id, alias of `id`) and `container` (the element).
    // Blocks may create the board themselves — e.g.
    // JXG.JSXGraph.initBoard(BOARDID, {...}) — the same convention the
    // Orange courseware and the VS Code jsxgraph plugin use, so those blocks
    // render unchanged. A failing block falls back to showing its raw source
    // plus the error message.
    let _jsxgraphPromise = null
    let _jsxgraphSeq = 0
    const loadJSXGraph = () => {
      if (typeof window === 'undefined') return Promise.resolve(null)
      if (window.JXG && window.JXG.JSXGraph) return Promise.resolve(window.JXG)
      if (_jsxgraphPromise) return _jsxgraphPromise
      _jsxgraphPromise = new Promise((resolve) => {
        const cssId = 'dsh-sidebar-frog-jsxgraph-css'
        if (!document.getElementById(cssId)) {
          const l = document.createElement('link')
          l.id = cssId
          l.rel = 'stylesheet'
          l.href = '/dsh-sidebar-frog/jsxgraph/jsxgraph.css'
          document.head.appendChild(l)
        }
        const s = document.createElement('script')
        s.src = '/dsh-sidebar-frog/jsxgraph/jsxgraphcore.js'
        s.async = true
        s.onload = () => resolve(window.JXG && window.JXG.JSXGraph ? window.JXG : null)
        s.onerror = () => { _jsxgraphPromise = null; resolve(null) }
        document.head.appendChild(s)
      })
      return _jsxgraphPromise
    }
    const jsxgraphFallback = (el, src, err) => {
      el.classList.add('jsxgraph-error')
      el.textContent = ''
      if (err) {
        const msg = document.createElement('div')
        msg.className = 'jsxgraph-fallback-error'
        msg.textContent = 'JSXGraph 渲染失败: ' + (err && err.message ? err.message : String(err))
        el.appendChild(msg)
      }
      const pre = document.createElement('pre')
      pre.className = 'jsxgraph-fallback'
      pre.textContent = src
      el.appendChild(pre)
      el.setAttribute('data-processed', 'true')
    }
    const renderJSXGraphIn = (node) => {
      if (!node || !node.querySelector) return
      const els = Array.prototype.slice.call(node.querySelectorAll('.jsxgraph'))
      if (!els.length) return
      loadJSXGraph().then((JXG) => {
        els.forEach((el) => {
          if (!el.isConnected) return
          const src = (el.textContent || '').replace(/^\s+|\s+$/g, '')
          if (!src) { el.setAttribute('data-processed', 'true'); return }
          if (!JXG) { jsxgraphFallback(el, src); return }
          _jsxgraphSeq += 1
          const id = 'dshfrog-jxg-' + _jsxgraphSeq + '-' + Date.now()
          const box = document.createElement('div')
          box.id = id
          box.className = 'jsxgraph-box'
          el.textContent = ''
          el.appendChild(box)
          try {
            // The board code runs with the generated container id, the
            // container element and the library in scope. BOARDID aliases id —
            // the convention used by the Orange courseware and the VS Code
            // jsxgraph plugin (JXG.JSXGraph.initBoard(BOARDID, {...})), which
            // keeps those dual-environment snippets rendering unchanged.
            const fn = new Function('JXG', 'id', 'BOARDID', 'container', src)
            fn(JXG, id, id, box)
            el.setAttribute('data-processed', 'true')
          } catch (e) {
            try { if (box.parentNode) box.parentNode.removeChild(box) } catch (e2) {}
            jsxgraphFallback(el, src, e)
          }
        })
      })
    }

    // ── The document skin ───────────────────────────────────────────────────
    // Which platform typography rendered Markdown wears (see src/shared/skins.js
    // for the styles themselves and why they carry no colors). Only the SELECTED
    // skin's CSS is on the page, in one tag: a skin is a few dozen rules scoped by
    // the class the Markdown root carries, so switching skins is a textContent
    // write rather than a re-render of every open document.
    const SKIN_STYLE_ID = 'dsh-sidebar-frog-skin'
    const syncMarkdownSkin = () => {
      if (typeof document === 'undefined') return
      const css = markdownSkinCss(settingsStore.get().markdownSkin)
      const existing = document.getElementById(SKIN_STYLE_ID)
      if (!css) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing)
        return
      }
      if (existing) {
        if (existing.textContent !== css) existing.textContent = css
        return
      }
      const tag = document.createElement('style')
      tag.id = SKIN_STYLE_ID
      // The same attribute the panel's own stylesheet carries, so a hot-swapped
      // bundle replaces this one too instead of leaving a stale skin behind.
      tag.setAttribute('data-plugin', 'dsh-sidebar-frog')
      tag.textContent = css
      document.head.appendChild(tag)
    }

    const MarkdownView = (props) => {
      const ref = React.useRef(null)
      const content = props.content == null ? '' : String(props.content)
      const mdPath = props.path || ''
      // The session the document is read in. Its workspace is what the media
      // route resolves a document-relative image against (see mdMedia in
      // src/shared/markdown.js), so it travels with the render.
      const mdSession = props.sessionId || currentSessionId()
      // The chosen skin is a SETTING, and the view re-renders when it changes:
      // the class on the root is what selects its rules, so a switch repaints
      // immediately instead of needing a reload. The line-number gutter is the
      // same shape of thing — a class the stylesheet keys off — and it reads its
      // value out of data-lineno, which the render below already stamps on every
      // block (see mdAnchor and .artifacts-markdown.is-lines in styles.js).
      const st = useSettings()
      const skin = st.markdownSkin
      const showLines = !!st.previewLineNumbers
      React.useEffect(() => {
        const node = ref.current
        if (!node) return
        // opts.path lets relative image/svg links resolve next to the doc.
        // lineAnchors stamps every block with the source line it came from, which
        // is what the selection bar below reads (see mdAnchor in
        // src/shared/markdown.js). Only the reader surfaces ask for them.
        node.innerHTML = mdToHtml(content, { path: mdPath, sessionId: mdSession, lineAnchors: true })
        let alive = true
        renderMermaidIn(node)
        renderJSXGraphIn(node)
        loadMathJax().then((mj) => {
          if (!alive || !mj || typeof mj.typesetPromise !== 'function') return
          if (ref.current !== node) return
          mj.typesetPromise([node]).catch(() => {})
        })
        // Select text in the rendered document and this bar names the source
        // lines it came from, quotes them, or opens them in the editor beside it.
        const disposeBar = attachMarkdownSelectionBar({
          root: node,
          path: mdPath,
          // The quote is taken from the SOURCE, not from the selection: what the
          // request shows and what its locator claims must be the same lines.
          text: content,
          onQuote: (payload, range) => {
            const where = range.start === range.end ? range.start + ' 行' : range.start + '-' + range.end + ' 行'
            if (quoteTextToComposer(payload)) noticeStore.flash('已插入输入框（第 ' + where + '）')
            else copyToClipboard(payload, '已复制引用（第 ' + where + '，未能写入输入框）')
          },
          // Only when something can actually act on it: this file's editor
          // publishes itself in src/client/editor.js while it is mounted, and the
          // shell's read-only document tab never does — a 定位 button there would
          // do nothing at all.
          onLocate: editorLocator.path === mdPath && typeof editorLocator.locate === 'function'
            ? (start, end) => editorLocator.locate(start, end)
            : null,
        })
        return () => {
          alive = false
          disposeBar()
        }
        // editorLocator is a render-time registry, not a prop: if the editor for
        // this file mounts after the preview (or leaves), the dep below cannot
        // see it, so the bar is rebuilt on the next content/skin change and the
        // button set follows the editor within one interaction.
      }, [content, mdPath, mdSession, skin, showLines, props.editable])
      return React.createElement('div', { ref, className: 'artifacts-markdown' + markdownSkinClass(skin) + (showLines ? ' is-lines' : '') })
    }

    const PdfView = (props) => {
      const path = props.path || ''
      // Optional complete bytes. The panel's previews have only a path, so they
      // go through this plugin's own /media route; the SHELL's document seat
      // hands over the bytes it already read with the user's session (see
      // PdfDocumentBody in src/client/docpreview.js), which is both one fewer
      // request and the only way to draw a file that route would refuse.
      const bytes = React.useMemo(() => {
        const raw = props.bytes
        if (!raw) return null
        const view = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
        // pdf.js may TRANSFER the buffer it is given to its worker. Hand it a
        // copy so a transferred array cannot empty the seat's own content.
        return view.slice()
      }, [props.bytes])
      const [phase, setPhase] = React.useState('loading') // loading | ready | error
      const [error, setError] = React.useState(null)
      const [pageCount, setPageCount] = React.useState(0)
      const [pageNo, setPageNo] = React.useState(1)
      const [zoom, setZoom] = React.useState(1) // multiplier over fit-width
      const [fitScale, setFitScale] = React.useState(null)
      const scrollRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const docRef = React.useRef(null)
      const taskRef = React.useRef(null)

      // Load the document once per source (the seat's bytes, or the path).
      React.useEffect(() => {
        let alive = true
        setPhase('loading'); setError(null); setPageCount(0); setPageNo(1); setZoom(1); setFitScale(null)
        loadPdfjs().then((lib) => {
          const source = bytes
            ? { data: bytes }
            : { url: '/dsh-sidebar-frog/media?path=' + encodeURIComponent(path) }
          const task = lib.getDocument(source)
          taskRef.current = task
          return task.promise
        }).then((doc) => {
          if (!alive) { try { doc.destroy() } catch (e) {} return }
          docRef.current = doc
          setPageCount(doc.numPages || 0)
          setPhase('ready')
        }).catch((e) => {
          if (alive) { setError(String((e && e.message) ? e.message : e)); setPhase('error') }
        })
        return () => {
          alive = false
          if (taskRef.current) { try { taskRef.current.cancel() } catch (e) {} }
          if (docRef.current) { try { docRef.current.destroy() } catch (e) {} docRef.current = null }
        }
      }, [path, bytes])

      // Measure the scroll area once to derive the fit-to-width scale (so the
      // page exactly fills the visible width — no horizontal scrollbar).
      React.useEffect(() => {
        if (phase !== 'ready' || fitScale != null) return
        const scroll = scrollRef.current
        const doc = docRef.current
        if (!scroll || !doc) return
        let w = scroll.clientWidth
        if (typeof window.getComputedStyle === 'function') {
          try {
            const cs = window.getComputedStyle(scroll)
            w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
          } catch (e) {}
        }
        if (!w) return
        doc.getPage(1).then((pageObj) => {
          const vp = pageObj.getViewport({ scale: 1 })
          if (vp && vp.width > 0) setFitScale(w / vp.width)
        }).catch(() => {})
      }, [phase, fitScale])

      // Render the current page into the canvas.
      React.useEffect(() => {
        if (phase !== 'ready' || fitScale == null) return
        const canvas = canvasRef.current
        const doc = docRef.current
        if (!canvas || !doc) return
        let alive = true
        doc.getPage(pageNo).then((pageObj) => {
          if (!alive) return
          const scale = fitScale * zoom
          const viewport = pageObj.getViewport({ scale })
          const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = Math.floor(viewport.width) + 'px'
          canvas.style.height = Math.floor(viewport.height) + 'px'
          const ctx = canvas.getContext('2d')
          if (taskRef.current) { try { taskRef.current.cancel() } catch (e) {} }
          taskRef.current = pageObj.render({
            canvasContext: ctx,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
          })
        }).catch(() => {})
        return () => { alive = false }
      }, [phase, pageNo, zoom, fitScale])

      const clampPage = (n) => Math.max(1, Math.min(pageCount || 1, n))
      const goPage = (n) => setPageNo(clampPage(n))
      const zoomBy = (f) => setZoom((z) => Math.max(0.25, Math.min(4, Math.round(z * f * 100) / 100)))

      if (phase === 'loading') {
        return React.createElement('div', { className: 'artifacts-pdfview' },
          React.createElement('div', { className: 'artifacts-hint' }, '加载 PDF…'))
      }
      if (phase === 'error') {
        // Fall back to the browser's native viewer if pdf.js cannot load.
        return React.createElement('embed', {
          className: 'artifacts-pdf',
          src: '/dsh-sidebar-frog/media?path=' + encodeURIComponent(path),
          type: 'application/pdf', title: path,
        })
      }

      const disabled = pageCount <= 0
      return React.createElement('div', { className: 'artifacts-pdfview' },
        React.createElement('div', { className: 'artifacts-pdfview-bar' },
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '缩小', disabled, onClick: () => zoomBy(0.8) }, '−'),
          React.createElement('span', { className: 'artifacts-pdfview-zoom' }, Math.round(zoom * 100) + '%'),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '放大', disabled, onClick: () => zoomBy(1.25) }, '＋'),
          React.createElement('span', { className: 'artifacts-pdfview-spacer' }),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '上一页', disabled: disabled || pageNo <= 1, onClick: () => goPage(pageNo - 1) }, '‹'),
          React.createElement('span', { className: 'artifacts-pdfview-page' }, pageNo + ' / ' + pageCount),
          React.createElement('button', { type: 'button', className: 'artifacts-pdfview-btn', title: '下一页', disabled: disabled || pageNo >= pageCount, onClick: () => goPage(pageNo + 1) }, '›'),
        ),
        React.createElement('div', { className: 'artifacts-pdfview-scroll', ref: scrollRef },
          React.createElement('canvas', { ref: canvasRef, className: 'artifacts-pdfview-canvas' }),
        ),
      )
    }

    // ── Table preview (CSV / TSV / semicolon / pipe) ──────────────────────
    // The parser is the shared one (src/shared/table.js) — this is only its
    // React face, so the panel and the popout page can never disagree about what
    // a cell is. Three decisions worth naming:
    //   · the header is sticky: a 500-row export is unreadable without it;
    //   · clicking a header sorts, and a THIRD click returns the file's own
    //     order — a sort you cannot undo is a trap;
    //   · the row cap is stated in the status line, never applied silently.
    const TABLE_VIEW_ROWS = 500
    const TABLE_CELL_CHARS = 400
    const TableView = (props) => {
      const content = props.content == null ? '' : String(props.content)
      const [sort, setSort] = React.useState(null) // { col, dir } | null
      const parsed = React.useMemo(() => tableParse(content), [content])
      React.useEffect(() => { setSort(null) }, [content, props.path])
      const rows = React.useMemo(
        () => (sort ? tableSortRows(parsed.rows, sort.col, sort.dir) : parsed.rows),
        [parsed, sort]
      )
      const cycle = (col) => setSort((cur) => {
        if (!cur || cur.col !== col) return { col: col, dir: 'asc' }
        if (cur.dir === 'asc') return { col: col, dir: 'desc' }
        return null
      })
      if (!parsed.header.length && !parsed.rows.length) {
        return React.createElement('div', { className: 'artifacts-hint' }, '（空表格）')
      }
      const shown = rows.length > TABLE_VIEW_ROWS ? rows.slice(0, TABLE_VIEW_ROWS) : rows
      const status = [parsed.total + ' 行 × ' + parsed.columns + ' 列', '分隔符：' + tableDelimiterLabel(parsed.delimiter)]
      if (rows.length > TABLE_VIEW_ROWS) status.push('仅显示前 ' + TABLE_VIEW_ROWS + ' 行')
      const headCells = parsed.header.map((name, i) => React.createElement('th', {
        key: 'h' + i,
        scope: 'col',
        className: 'artifacts-table-th' + (sort && sort.col === i ? ' is-sorted' : ''),
        'aria-sort': sort && sort.col === i ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      }, React.createElement('button', {
        type: 'button',
        className: 'artifacts-table-sortbtn',
        title: '按此列排序（第三次点击恢复文件原有顺序）',
        onClick: () => cycle(i),
      },
        React.createElement('span', { className: 'artifacts-table-headtext' }, name || ('列 ' + (i + 1))),
        React.createElement('span', { className: 'artifacts-table-arrow', 'aria-hidden': true },
          sort && sort.col === i ? (sort.dir === 'asc' ? '▲' : '▼') : ''),
      )))
      const bodyRows = shown.map((row, r) => React.createElement('tr', { key: 'r' + r, className: 'artifacts-table-tr' },
        row.map((cell, c) => {
          const display = tableFormatCell(cell, TABLE_CELL_CHARS)
          const numeric = tableCellNumber(cell) != null
          return React.createElement('td', {
            key: 'c' + c,
            className: 'artifacts-table-td' + (numeric ? ' is-number' : '') + (c === 0 ? ' is-first' : ''),
            title: String(cell == null ? '' : cell).length > 60 ? String(cell) : undefined,
          }, display === '' ? React.createElement('span', { className: 'artifacts-table-empty' }, '·') : display)
        })))
      return React.createElement('div', { className: 'artifacts-table-view' },
        React.createElement('div', { className: 'artifacts-table-status' }, status.join(' · ')),
        React.createElement('div', { className: 'artifacts-table-scroll' },
          React.createElement('table', { className: 'artifacts-table' },
            React.createElement('thead', null, React.createElement('tr', { className: 'artifacts-table-headrow' }, headCells)),
            React.createElement('tbody', null, bodyRows),
          ),
        ),
      )
    }

    // ── Audio / video preview ─────────────────────────────────────────────
    // The host's /media route answers byte ranges now (src/shared/range.js),
    // which is what makes seeking work at all. Whether the ENGINE can decode a
    // given file is not knowable in advance, so the element's own error event is
    // surfaced instead of swallowed: a silent black rectangle is the worst
    // possible answer to "is this file playable?".
    const MediaView = (props) => {
      const kind = props.kind === 'video' ? 'video' : 'audio'
      const [phase, setPhase] = React.useState('probe') // probe | ready | failed
      React.useEffect(() => { setPhase('probe') }, [props.path])
      const src = '/dsh-sidebar-frog/media?path=' + encodeURIComponent(props.path || '')
      const shared = {
        className: kind === 'video' ? 'artifacts-video' : 'artifacts-audio',
        src: src,
        controls: true,
        preload: 'metadata',
        onError: () => setPhase('failed'),
        onLoadedMetadata: () => setPhase('ready'),
      }
      const media = kind === 'video'
        ? React.createElement('video', Object.assign({ playsInline: true }, shared))
        : React.createElement('audio', shared)
      return React.createElement('div', { className: 'artifacts-media' },
        React.createElement('div', { className: 'artifacts-media-frame' + (kind === 'video' ? '' : ' is-audio') }, media),
        React.createElement('div', { className: 'artifacts-media-meta' },
          React.createElement('span', { className: 'artifacts-media-kind' }, kind === 'video' ? '视频' : '音频'),
          React.createElement('span', { className: 'artifacts-media-name', title: props.path || '' }, props.path || ''),
        ),
        phase === 'failed' ? React.createElement('div', { className: 'artifacts-media-error' },
          '浏览器无法解码这个文件（该编码可能不在这台机器的解码器里）。可以下载后用本地播放器打开，或交给系统侧边栏里的渲染器。') : null,
        phase === 'probe' ? React.createElement('div', { className: 'artifacts-media-hint' }, '正在读取媒体信息…') : null,
      )
    }

    // ── Office documents (docx / xlsx / pptx), read offline ───────────────
    // ONE component with TWO byte sources, because the two faces of this plugin
    // are handed a document differently:
    //   · the shell's own document seat does not send content at all — it sends
    //     the file's COMPLETE BYTES (`loading: 'bytes-complete'`, see
    //     src/client/docpreview.js), so `props.bytes` is already here;
    //   · this plugin's panel and popout tab know only the path, so the bytes
    //     come from our own /media route.
    // Either way the reading and the drawing are the shared widgets in
    // src/shared/office.js — the very same code the standalone page mounts.
    //
    // The scroller is deliberately NOT reported through `scrollportRef`: it
    // exists for a renderer that owns the scrolling, and this one lays its
    // widget into the owner's box (exactly like the Markdown body).
    const fetchOfficeBytes = (path) => fetch(officeMediaUrl(path)).then((r) => {
      if (r.status === 401 || r.status === 403) throw new Error(UNAUTHORIZED)
      if (!r.ok) throw new Error('读取文件失败（HTTP ' + r.status + '）')
      return r.arrayBuffer()
    })

    const OfficeView = (props) => {
      const p = props || {}
      const path = p.path || ''
      const kind = p.kind || officeKind(path)
      const bytes = p.bytes || null
      const [phase, setPhase] = React.useState('loading') // loading | ready | error
      const [error, setError] = React.useState(null)
      const hostRef = React.useRef(null)
      React.useEffect(() => {
        let alive = true
        let handle = null
        const host = hostRef.current
        setError(null)
        setPhase('loading')
        if (!kind) {
          setError('这个后缀不在离线预览的支持范围里。')
          setPhase('error')
          return undefined
        }
        Promise.resolve()
          .then(() => (bytes ? bytes : fetchOfficeBytes(path)))
          .then((data) => (alive && host ? officeMount(host, kind, data) : null))
          .then((mounted) => {
            if (!mounted) return
            handle = mounted
            if (!alive) {
              // Mounted after the panel moved on: undo it here, because the
              // cleanup below has already run.
              try { mounted.destroy() } catch (e) {}
              handle = null
              return
            }
            setPhase('ready')
          })
          .catch((e) => {
            if (alive) {
              setError(String(e && e.message ? e.message : e))
              setPhase('error')
            }
          })
        return () => {
          alive = false
          if (handle) { try { handle.destroy() } catch (e) {} handle = null }
          // A widget that failed after putting part of itself on screen removes
          // its own node (officeFail); this is the belt for the same braces.
          if (host) { while (host.firstChild) host.removeChild(host.firstChild) }
        }
      }, [path, kind, bytes])
      return React.createElement('div', { className: 'artifacts-office' },
        React.createElement('div', { className: 'artifacts-office-host', ref: hostRef }),
        phase === 'ready' ? null : React.createElement('div', {
          className: 'office-state' + (phase === 'error' ? ' is-error' : ''),
        }, phase === 'error' ? (error || '预览失败') : ('正在读取 ' + officeKindLabel(kind) + '…')),
      )
    }

    // A suffix that is a BINARY CONTAINER, not text: .docx / .xlsx are ZIP
    // archives, so decoding one as UTF-8 is exactly the screen of mojibake this
    // view exists to prevent. The card says so plainly and offers the two honest
    // ways out — hand it to an installed renderer, or look at the bytes as text
    // on purpose.
    const DocumentView = (props) => {
      const [phase, setPhase] = React.useState('card') // card | text
      const [text, setText] = React.useState('')
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => { setPhase('card'); setText(''); setError(null); setBusy(false) }, [props.path])
      const ext = String(fileExt(props.path || '') || '').toUpperCase()
      const renderer = props.renderer
      const canHandOff = !!(renderer && !renderer.mine && props.onOpenInShell)
      const askText = () => {
        if (!props.onReadText) return
        setBusy(true)
        setError(null)
        Promise.resolve().then(() => props.onReadText()).then((res) => {
          setBusy(false)
          if (res && res.ok === false) { setError(res.error || '读取失败'); return }
          setText(res && res.content != null ? String(res.content) : '')
          setPhase('text')
        }).catch((e) => {
          setBusy(false)
          setError(String(e && e.message ? e.message : e))
        })
      }
      if (phase === 'text') {
        return React.createElement('div', { className: 'artifacts-doc' },
          React.createElement('div', { className: 'artifacts-doc-note' }, '以纯文本查看（二进制内容，多半不可读）'),
          React.createElement(CodeView, { code: text, lang: langFromExt(props.path) }),
        )
      }
      return React.createElement('div', { className: 'artifacts-doc-card' },
        React.createElement('div', { className: 'artifacts-doc-title' }, (ext ? ext + ' · ' : '') + '二进制文档'),
        React.createElement('p', { className: 'artifacts-doc-text' },
          '这类文件是压缩包 / 二进制容器，按文本解码只会得到乱码，所以本面板不解析它。'),
        canHandOff ? React.createElement('p', { className: 'artifacts-doc-text' },
          '系统渲染器「' + renderer.title + '」可以预览此文件。') : null,
        React.createElement('div', { className: 'artifacts-doc-actions' },
          canHandOff ? React.createElement('button', {
            type: 'button',
            className: 'artifacts-doc-btn is-primary',
            title: '在系统右侧边栏里用该渲染器打开',
            onClick: () => props.onOpenInShell(props.path),
          }, '在系统侧边栏打开') : null,
          props.onReadText ? React.createElement('button', {
            type: 'button',
            className: 'artifacts-doc-btn',
            disabled: busy,
            onClick: askText,
          }, busy ? '读取中…' : '以纯文本查看') : null,
        ),
        error ? React.createElement('div', { className: 'artifacts-error' }, error) : null,
      )
    }

    // A suffix this panel can only show as plain text, but the SHELL has a real
    // renderer for it (through the same `ctx.documentPreviews` registry this
    // plugin lends its Markdown renderer to). Saying so — and handing the file
    // over — beats a screen of mojibake for an Office document or a spreadsheet.
    const rendererNote = (p) => React.createElement('div', { className: 'artifacts-renderer' },
      React.createElement('span', { className: 'artifacts-renderer-text' },
        '系统渲染器「' + p.renderer.title + '」可以预览此文件'),
      React.createElement('button', {
        type: 'button',
        className: 'artifacts-renderer-btn',
        title: '在系统右侧边栏里用该渲染器打开',
        onClick: () => p.onOpenInShell(p.path),
      }, '在系统侧边栏打开'),
    )

    // The note a cut read must always carry, for EVERY type that carries text.
    // It used to be pushed only inside the code-view branch, so a Markdown
    // document that stopped mid-sentence — the exact shape of the 403 kB
    // textbook this was reported on — carried no mark at all: the reader could
    // not tell a short file from a truncated one. `chars` is the host's count of
    // the COMPLETE file, so the note can say how much is missing rather than
    // only that something is.
    const truncatedNote = (p) => React.createElement('div', { key: 'trunc', className: 'artifacts-diff-label' },
      '(truncated preview)' + (typeof p.chars === 'number' && p.chars > 0
        ? ' — ' + (p.content || '').length + ' / ' + p.chars + ' characters shown'
        : ''))

    const renderPreview = (p) => {
      if (p.loading) return React.createElement('div', { className: 'artifacts-hint' }, '加载中…')
      if (p.ok === false) return React.createElement('div', { className: 'artifacts-error' }, p.error || '读取失败')
      const type = p.type || 'text'
      const body = []
      if (type === 'image') {
        body.push(React.createElement('img', {
          key: 'img', className: 'artifacts-img',
          src: '/dsh-sidebar-frog/media?path=' + encodeURIComponent(p.path || ''),
          alt: p.path || '',
        }))
      } else if (type === 'html') {
        body.push(React.createElement('iframe', {
          key: 'iframe', className: 'artifacts-iframe',
          sandbox: 'allow-scripts', srcDoc: p.content || '', title: p.path || '',
        }))
      } else if (type === 'pdf') {
        body.push(React.createElement(PdfView, { key: 'pdf', path: p.path || '' }))
      } else if (type === 'markdown') {
        body.push(React.createElement(MarkdownView, { key: 'md', content: p.content, path: p.path || '', sessionId: p.sessionId || '' }))
      } else if (type === 'table') {
        body.push(React.createElement(TableView, { key: 'table', content: p.content, path: p.path || '' }))
      } else if (type === 'audio' || type === 'video') {
        body.push(React.createElement(MediaView, { key: 'media', kind: type, path: p.path || '' }))
      } else if (type === 'office') {
        // .docx / .xlsx / .pptx: this plugin reads them itself now (vendored
        // parsers, no network), so the panel shows the document instead of a
        // card that asks somebody else to. `p.content` is empty on the wire for
        // these (BINARY_TYPES in src/host/core.js) — the bytes are fetched from
        // /media by the view.
        body.push(React.createElement(OfficeView, { key: 'office', path: p.path || '' }))
      } else if (type === 'document') {
        // No content on the wire for these (see BINARY_TYPES in src/host/core.js):
        // the card fetches the bytes as text only if the user asks for them.
        body.push(React.createElement(DocumentView, {
          key: 'document',
          path: p.path || '',
          renderer: p.renderer,
          onOpenInShell: p.onOpenInShell,
          onReadText: p.onReadText,
        }))
      } else {
        body.push(React.createElement(CodeView, { key: 'code', code: p.content, lang: langFromExt(p.path) }))
      }
      // After the body, before the diff: it describes the content above it.
      if (p.truncated) body.push(truncatedNote(p))
      // The diff sits on top of the file body: the review question ("what did the
      // agent change?") is asked before the content one. `p.undo` / `p.onUndo` /
      // `p.undoBusy` come from the panel; the popout tab has its own handler.
      //
      // The renderer note only appears where it earns its space: a file this
      // panel can render properly (Markdown, images, PDF, HTML, code) never
      // shows it, so it is a signal rather than permanent chrome.
      if (type === 'text' && p.renderer && !p.renderer.mine && p.onOpenInShell) body.unshift(rendererNote(p))
      if (p.diff) body.unshift(renderDiff(p.diff, p.undo, p.onUndo, p.undoBusy))
      return React.createElement('div', { className: 'artifacts-preview-body' }, body)
    }

    // Inline SVG icons replicating the DSH primitives icons better-sidebar uses
    // (IconFolderClose16 / IconFolderOpen16 / IconCodeOutline16 /
    // IconRefreshOutline16), drawn with `currentColor` so they follow the theme.


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

  // ── Freshness without the product's live watcher ───────────────────────────
  // When this tree takes the product's 文件 tab over (`systemFileTree` off — see
  // src/shared/settings.js) the product's own body is not mounted, and its live
  // per-directory watcher lives INSIDE that body. Nothing pushes changes at us
  // any more. What we do have is the artifact list: the paths the agent created
  // or edited, re-polled every couple of seconds. Diffing that set covers the case
  // that actually happens here — a file appears, a file is gone — and it re-reads
  // ONLY the levels whose contents changed, so it is not a workspace-wide poll.
  //
  // It deliberately does not try to be a watcher: a file changed by another editor
  // still needs the manual refresh. Turning 「显示系统的文件树」on hands the
  // product's watcher back and this becomes a cheap no-op — the same entries come
  // back, so nothing in the tree moves.
  const artifactPaths = (Array.isArray(props.items) ? props.items : [])
    .map((it) => (it && typeof it.path === 'string' ? it.path : ''))
    .filter(Boolean)
  const artifactKey = artifactPaths.join('\n')
  const lastArtifactPaths = React.useRef(null)
  React.useEffect(() => {
    const previous = lastArtifactPaths.current
    lastArtifactPaths.current = artifactPaths
    // The first run records the baseline only: the tree has just mounted and reads
    // its levels on demand, so there is nothing to refresh yet.
    if (previous === null) return
    const had = new Set(previous)
    const has = new Set(artifactPaths)
    const changed = []
    for (const p of artifactPaths) if (!had.has(p)) changed.push(p)
    for (const p of previous) if (!has.has(p)) changed.push(p)
    if (!changed.length) return
    const dirs = new Set()
    let rootStale = false
    for (const p of changed) {
      const parent = parentDirOf(p)
      // The same distinction 新建 and 删除 have to make: a top-level entry's level
      // IS tree.root, which `loadRoot` re-reads; anything deeper is refreshDir's.
      if (parent && parent !== rootPath && pathRelativeTo(parent, rootPath) !== '') dirs.add(parent)
      else rootStale = true
    }
    if (rootStale) loadRoot(false)
    for (const dir of dirs) {
      // Only a level this tree has ALREADY read. refreshDir marks a path EXPANDED
      // as a side effect, and expanding folders the user had collapsed — to
      // announce a change somewhere inside them — is not a refresh, it is a
      // hijack of their layout.
      if (treeRef.current.children[dir]) refreshDir(dir)
    }
  }, [artifactKey])

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


              // ── 编辑 pane (React half) ──────────────────────────────────────────────
    // The panel's editor: a toolbar, the CodeMirror mount from the shared
    // module, and the three states a real save has to survive — writing,
    // saved, and "the file changed under you". The popout page mounts the SAME
    // CodeMirror core from plain DOM (see src/host/page.js), so the two faces
    // cannot disagree about what Ctrl+S does or when a document is dirty.
    //
    // What may be edited is decided here and nowhere else: the plugin's own
    // text-ish preview types, minus the two cases where saving would LOSE data:
    //
    //   · `editable === false` — the host's verdict that a save of what the
    //     browser holds cannot succeed (the file is past the save ceiling, or the
    //     read was cut). Its own rule, not one re-derived here: the panel used to
    //     infer it from `truncated`, which was right only while 预览 and 编辑
    //     shared a single 200000-character cap. They do not any more — a 2 MB
    //     Markdown file now previews IN FULL and is still refused an editor,
    //     because saving a prefix is the one failure worse than not editing.
    //   · a failed read (`ok === false`) — there is nothing to edit.
    //
    // Everything else (image / pdf / audio / video / office / document) has no
    // text to write and shows no toolbar at all, rather than a disabled one.

    const EDITABLE_TYPES = { markdown: 1, text: 1, table: 1 }

    // Which file currently has an editor, and how to put it on a line. One slot is
    // enough because one file is previewed at a time, and it exists because the
    // verb cannot ride props: the preview a pane renders is the CALLER's element
    // (wrapped in .artifacts-preview-body), so cloning it would decorate the
    // wrapper rather than the Markdown view inside it. The preview asks whether an
    // editor exists for its own path — that answer is what decides whether a 定位
    // button is drawn at all, instead of drawing one that can do nothing.
    const editorLocator = { path: '', locate: null }

    // A host that predates the `editable` field answers `truncated` only, and
    // that inference is the safe one to fall back to.
    const canEditRead = (p) => (p.editable === undefined ? !p.truncated : !!p.editable)

    const isEditablePreview = (p) => !!p && p.ok !== false && canEditRead(p) && EDITABLE_TYPES[p.type] === 1 && typeof p.content === 'string'

    // ── Drafts ──────────────────────────────────────────────────────────────
    // Unsaved text lives OUTSIDE the component, keyed by path. A file tab
    // unmounts when you switch to another one (and the 2 s ledger poll re-reads
    // the preview), so edits kept in component state would be lost by a click on
    // another tab — the classic way an editor eats somebody's paragraph. The
    // draft also survives 预览/编辑 toggles, which is what lets the toggle stay
    // cheap (it re-creates the editor instead of trying to keep a hidden one
    // measured correctly).
    const draftStore = {
      map: Object.create(null),
      listeners: [],
      get(path) { return this.map[path] || null },
      put(path, patch) {
        if (!path) return
        const prev = this.map[path] || { text: '', dirty: false }
        const next = Object.assign({}, prev, patch)
        this.map[path] = next
        this.notify()
      },
      isDirty(path) {
        const d = this.map[path]
        return !!(d && d.dirty)
      },
      drop(path) {
        if (!this.map[path]) return
        delete this.map[path]
        this.notify()
      },
      notify() {
        this.listeners.forEach((fn) => { try { fn() } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    // Re-render whoever shows a dirty marker (the file tabs) when a draft
    // changes. Cheap on purpose: it is a counter, not a snapshot.
    const useDraftTick = () => {
      const [tick, setTick] = React.useState(0)
      React.useEffect(() => draftStore.subscribe(() => setTick((n) => n + 1)), [])
      return tick
    }

    // The draft's text is written on a short debounce. `onChange` fires per
    // keystroke and the draft is the WHOLE document, so writing it per character
    // would build a fresh copy of the file for each one; a debounce that is
    // always flushed before the editor goes away (unmount, mode toggle, save) is
    // invisible and cannot lose the tail of what somebody typed.
    const makeDraftWriter = (path, getText) => {
      let timer = null
      const write = () => {
        timer = null
        draftStore.put(path, { text: getText(), dirty: true })
      }
      return {
        touch() {
          if (timer) clearTimeout(timer)
          timer = setTimeout(write, 200)
        },
        flush() {
          if (timer) { clearTimeout(timer); timer = null }
          write()
        },
        cancel() {
          if (timer) { clearTimeout(timer); timer = null }
        },
      }
    }

    // The editor pane. It owns the mode (预览 / 编辑), the draft, the save and the
    // conflict state, and it renders `props.children` — the panel's ordinary
    // read-only preview — whenever it is not editing. That is what makes the
    // toolbar appear only where it means something: a caller passes children for
    // every type and this component decides whether there is anything to do
    // with them.
    const EditorPane = (props) => {
      const path = props.path || ''
      const editable = props.editable === true
      // The session a save belongs to. It rides a prop because this pane is
      // mounted in TWO places: the panel (where the seat's own session is the
      // right one) and the shell's document tab, whose body is handed a
      // session-scoped address and nothing else — there `currentSessionId()` is a
      // guess, and a save fenced to the wrong workspace is refused with a
      // confusing reason.
      const sessionId = props.sessionId || ''
      // The editor's line-number column is a live preference (see the effect
      // below): reading it here keeps the hook call in the component body, and
      // the subscription is what re-renders when the switch moves.
      const settings = useSettings()
      // 新建文件 opens its editor straight away: a file that was just created is
      // empty, so a preview of it is a blank page. Only the INITIAL mode — the
      // 预览/编辑 toggle still belongs to the person, and an uneditable file falls
      // back to 预览 through the effect below.
      const [mode, setMode] = React.useState(props.initialMode === 'edit' ? 'edit' : 'view')
      const [boot, setBoot] = React.useState('idle')
      const [dirty, setDirty] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [status, setStatus] = React.useState('')
      const [conflict, setConflict] = React.useState(null)
      const [armedReload, setArmedReload] = React.useState(false)
      const [loaded, setLoaded] = React.useState(null)

      const mountRef = React.useRef(null)
      const ctrlRef = React.useRef(null)
      const writerRef = React.useRef(null)
      const dirtyRef = React.useRef(false)
      // The save handler is reached from CodeMirror's keymap, which captured the
      // closure at creation time. A ref is what keeps Ctrl+S pointing at the
      // CURRENT state (busy flag, latest loaded revision) instead of at whatever
      // those were when the editor was built.
      const saveRef = React.useRef(null)
      // Lines the preview asked us to open. The editor does not exist yet when
      // the request arrives (entering edit mode is what creates it), so the
      // request is parked here and applied once the controller is ready.
      const pendingReveal = React.useRef(null)

      // Leaving the file (or losing editability — a re-read that came back
      // un-editable, whether because it is too big to save or because the read
      // was cut) returns to 预览: an editor whose document is no longer the one
      // on screen must not stay mounted claiming to be it.
      React.useEffect(() => {
        if (!editable && mode === 'edit') setMode('view')
      }, [editable, mode])

      // 设置 › 编辑器显示行号, applied to a RUNNING editor through CodeMirror's
      // compartment: the document, the cursor, the undo history and any unsaved
      // draft all survive a flip, where a remount would lose the last two. `boot`
      // is in the deps because the controller does not exist until the CodeMirror
      // chunk has loaded — without it, a flip during that window would be lost.
      React.useEffect(() => {
        const ctrl = ctrlRef.current
        if (ctrl && typeof ctrl.setLineNumbers === 'function') {
          ctrl.setLineNumbers(settings.editorLineNumbers !== false)
        }
      }, [settings.editorLineNumbers, boot, mode])

      React.useEffect(() => {
        if (mode === 'view') return undefined
        if (!path || !mountRef.current) return undefined
        const draft = draftStore.get(path)
        const initial = draft && draft.dirty ? draft.text : (props.content == null ? '' : String(props.content))
        const base = { version: props.baseVersion || null, size: typeof props.baseSize === 'number' ? props.baseSize : null }
        setLoaded(base)
        setBoot('loading')
        let alive = true
        const writer = makeDraftWriter(path, () => (ctrlRef.current ? ctrlRef.current.getValue() : initial))
        writerRef.current = writer
        createEditor(mountRef.current, {
          path: path,
          value: initial,
          dark: isDarkScheme(),
          // 设置 › 编辑器显示行号, read at mount and re-applied below when it
          // changes. The panel and the popout mount this same controller, so the
          // preference reaches both faces from one place.
          lineNumbers: settings.editorLineNumbers !== false,
          onChange: () => { dirtyRef.current = true; writer.touch() },
          onDirty: (isDirty) => {
            dirtyRef.current = isDirty
            setDirty(isDirty)
            if (isDirty) writer.flush()
            else { writer.cancel(); draftStore.put(path, { dirty: false }) }
          },
          onSave: () => { if (saveRef.current) saveRef.current(false) },
        }).then((ctrl) => {
          if (!alive) {
            if (ctrl) ctrl.destroy()
            return
          }
          if (!ctrl) {
            setBoot('failed')
            return
          }
          ctrlRef.current = ctrl
          setBoot('ready')
          setDirty(ctrl.isDirty())
          ctrl.focus()
          // A 定位 that arrived while the editor was booting: the reader asked
          // for these lines, so arriving without them selected would look like
          // the button did nothing.
          if (pendingReveal.current) {
            const want = pendingReveal.current
            pendingReveal.current = null
            ctrl.revealLines(want.start, want.end)
          }
        })
        return () => {
          alive = false
          // The pending debounce is written BEFORE the controller goes away —
          // this is the one line that keeps switching tabs from losing the last
          // couple of hundred milliseconds of typing.
          if (dirtyRef.current) writer.flush()
          else writer.cancel()
          writerRef.current = null
          if (ctrlRef.current) {
            ctrlRef.current.destroy()
            ctrlRef.current = null
          }
        }
        // Deliberately keyed on the path and the mode only: a new `content` prop
        // (the 2 s ledger poll re-reading the file) must NOT rebuild the editor
        // and throw away what somebody is typing. Drift is surfaced as a conflict
        // instead — see the effect below and saveNow.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [path, mode])

      // The file moved on while there are unsaved edits. Saying so BEFORE the
      // save fails is the difference between "my work is safe, let me look at
      // what changed" and "保存 did nothing".
      const drifted = !!(mode === 'edit' && loaded && props.baseVersion && String(props.baseVersion) !== String(loaded.version))
      const conflictNow = conflict || (drifted && dirty
        ? { message: '磁盘上的文件已被改动，你正在编辑的是较早的版本', version: props.baseVersion, size: props.baseSize }
        : null)

      // 定位: enter edit mode and select those source lines. Called from the
      // rendered preview's selection bar, which is a CHILD of this pane — the
      // editor is the only thing that knows how to show a line, so it hands the
      // verb down rather than the preview reaching for it.
      React.useEffect(() => () => {
        if (editorLocator.locate === locateLines) { editorLocator.path = ''; editorLocator.locate = null }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [path])

      const locateLines = (start, end) => {
        if (!editable) return
        pendingReveal.current = { start: start, end: end }
        if (mode === 'edit' && ctrlRef.current) {
          pendingReveal.current = null
          ctrlRef.current.revealLines(start, end)
          return
        }
        setMode('edit')
      }

      const saveNow = (force) => {
        const ctrl = ctrlRef.current
        if (!ctrl || busy) return
        const text = ctrl.getValue()
        setBusy(true)
        setStatus('保存中…')
        setArmedReload(false)
        host.call('artifacts.save', {
          path: path,
          content: text,
          sessionId: sessionId || currentSessionId(),
          baseVersion: loaded && loaded.version ? loaded.version : undefined,
          baseSize: loaded && typeof loaded.size === 'number' ? loaded.size : undefined,
          force: !!force,
        }).then((res) => {
          setBusy(false)
          if (res && res.ok) {
            ctrl.markClean()
            setDirty(false)
            draftStore.drop(path)
            setConflict(null)
            setLoaded({ version: res.version || null, size: typeof res.size === 'number' ? res.size : null })
            const at = new Date()
            const hh = String(at.getHours()).padStart(2, '0')
            const mm = String(at.getMinutes()).padStart(2, '0')
            setStatus('已保存 ' + hh + ':' + mm + '（' + (res.eol === 'CRLF' ? 'CRLF' : 'LF') + (res.bom ? ' · BOM' : '') + '）')
            if (typeof props.onSaved === 'function') props.onSaved(res)
          } else if (res && res.stale) {
            setConflict({ message: res.error || '文件已被改动', version: res.version, size: res.size })
            setStatus('未保存')
          } else {
            setStatus((res && res.error) || '保存失败')
          }
        }).catch((e) => {
          setBusy(false)
          setStatus(e && e.message ? String(e.message) : '保存失败')
        })
      }
      saveRef.current = saveNow

      // 重新载入: throw the local text away and take what is on disk. The
      // two-step button is on purpose — this is the one action in the pane that
      // destroys work, and the product has no modal to fall back on.
      const reloadFromDisk = () => {
        const ctrl = ctrlRef.current
        if (!ctrl) return
        setBusy(true)
        setStatus('重新载入中…')
        host.call('artifacts.read', { path: path }).then((res) => {
          setBusy(false)
          if (!res || res.ok === false) {
            setStatus((res && res.error) || '重新载入失败')
            return
          }
          const view = ctrl.view
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(res.content == null ? '' : res.content) } })
          ctrl.markClean()
          setDirty(false)
          draftStore.drop(path)
          setConflict(null)
          setArmedReload(false)
          setLoaded({ version: res.version || null, size: typeof res.size === 'number' ? res.size : null })
          setStatus('已载入磁盘上的版本')
        }).catch((e) => {
          setBusy(false)
          setStatus(e && e.message ? String(e.message) : '重新载入失败')
        })
      }

      const onKeyDown = (ev) => {
        if (ev.key === 'Escape' && mode === 'edit' && !dirty) {
          setMode('view')
          ev.stopPropagation()
        }
      }

      // Not editable: the caller's read-only preview, untouched. No toolbar, no
      // disabled buttons — a control that cannot do anything is noise.
      if (!editable) return props.children || null

      // The preview is offered the 定位 verb through the registry: it is built by
      // the caller (src/client/components.js wraps it in .artifacts-preview-body),
      // so cloning the child here would decorate that wrapper and the Markdown
      // view inside it would never see it. Publishing during render is the same
      // pattern this component already uses for saveRef.
      editorLocator.path = path
      editorLocator.locate = locateLines
      const preview = props.children || null

      const bar = React.createElement('div', { className: 'artifacts-edbar' },
        React.createElement('div', { className: 'artifacts-edbar-group' },
          React.createElement('button', {
            key: 'mode',
            type: 'button',
            className: 'artifacts-edbtn artifacts-edbtn-mode' + (mode === 'edit' ? ' is-on' : ''),
            title: mode === 'edit' ? '回到只读预览（Esc）' : '用 CodeMirror 编辑这个文件（Ctrl+S 保存）',
            onClick: () => setMode(mode === 'edit' ? 'view' : 'edit'),
          }, mode === 'edit' ? '预览' : '编辑'),
          mode === 'edit' ? React.createElement('span', { key: 'kind', className: 'artifacts-ednote' }, editorLanguageName(path) ? 'CodeMirror · ' + editorLanguageName(path) : 'CodeMirror · 纯文本') : null,
        ),
        React.createElement('div', { className: 'artifacts-edbar-group' },
          // The caller's own extra action for this file, drawn first in this group.
          // It is a PROP rather than something this module imports because the one
          // action that uses it — 「在弹出页打开」— belongs to the panel's world, and
          // the editor has no business knowing the popout page exists: it is also
          // what lets this pane be mounted (and guarded) with nothing but the
          // shared editor, the way scripts/check.js mounts it.
          props.docAction || null,
          status ? React.createElement('span', {
            key: 'status',
            className: 'artifacts-edstatus' + (conflictNow ? ' is-bad' : (dirty ? ' is-dirty' : '')),
            title: status,
          }, status) : (mode === 'edit' && dirty ? React.createElement('span', { key: 'status', className: 'artifacts-edstatus is-dirty' }, '未保存') : null),
          mode === 'edit' ? React.createElement('button', {
            key: 'reload',
            type: 'button',
            className: 'artifacts-edbtn' + (armedReload ? ' is-armed' : ''),
            disabled: busy,
            title: armedReload ? '再点一次：丢弃你的修改，载入磁盘上的版本' : '丢弃你的修改，重新读取磁盘上的文件',
            onClick: () => { if (armedReload) reloadFromDisk(); else setArmedReload(true) },
          }, armedReload ? '确认丢弃并载入' : '重新载入') : null,
          mode === 'edit' ? React.createElement('button', {
            key: 'save',
            type: 'button',
            className: 'artifacts-edbtn artifacts-edbtn-save',
            disabled: busy || !dirty,
            title: dirty ? '保存（Ctrl+S）' : '没有未保存的修改',
            onClick: () => saveNow(!!conflict),
          }, busy ? '保存中…' : '保存') : null,
        ),
      )

      const conflictBar = (mode === 'edit' && conflictNow) ? React.createElement('div', { className: 'artifacts-edconflict', role: 'status' },
        React.createElement('span', { className: 'artifacts-edconflict-ico' }, '!'),
        React.createElement('span', { className: 'artifacts-edconflict-text' }, conflictNow.message || '文件已被改动'),
        React.createElement('span', { className: 'artifacts-edconflict-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-edbtn' + (armedReload ? ' is-armed' : ''),
            disabled: busy,
            onClick: () => { if (armedReload) reloadFromDisk(); else setArmedReload(true) },
          }, armedReload ? '确认丢弃并载入' : '载入磁盘版本'),
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-edbtn artifacts-edbtn-force',
            disabled: busy,
            title: '用你编辑器里的内容覆盖磁盘上的版本（写入仍是原子的，并再次校验版本）',
            onClick: () => saveNow(true),
          }, '仍然保存'),
        ),
      ) : null

      return React.createElement('div', { className: 'artifacts-editpane', onKeyDown: onKeyDown },
        bar,
        conflictBar,
        mode === 'edit'
          ? React.createElement('div', { className: 'artifacts-edmount' },
            React.createElement('div', { ref: mountRef, className: 'artifacts-edcm' }),
            boot === 'loading' ? React.createElement('div', { className: 'artifacts-edhint' }, '正在载入编辑器（CodeMirror 604 KB，仅首次）…') : null,
            boot === 'failed' ? React.createElement('div', { className: 'artifacts-error' }, '编辑器组件未能载入（/dsh-sidebar-frog/codemirror/codemirror.min.js）。请刷新页面重试，或改用系统编辑器打开。') : null,
          )
          : preview,
      )
    }


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

// The popout page's address for a session, composed in ONE place: five entry
// points across four files must never disagree about what 「弹出」 opens, and a
// session-scoped page opened without its `sessionId` would root its file tree at
// the wrong workspace. `path` is optional and asks the page to open THAT FILE
// (see openPathFromUrl in src/host/page.js) — 「在弹出页打开」for the document that
// is on screen, as opposed to the session-wide links.
const popoutHrefFor = (sid, path) => {
  const query = []
  if (sid) query.push('sessionId=' + encodeURIComponent(sid))
  if (path) query.push('path=' + encodeURIComponent(path))
  return '/dsh-sidebar-frog' + (query.length ? '?' + query.join('&') : '')
}

// The address of ONE file inside the popout, from the spelling the sidebar holds.
//
// The popout's `?path=` is resolved by the host against the session's workspace
// (same rule as /content and the page's own tree rows), so a BARE RELATIVE path
// is ambiguous the moment the page's idea of the workspace differs from the
// caller's — and it cannot be revealed in the page's tree, whose rows are
// absolute. The absolute form is therefore built HERE, where the session's cwd is
// still known, rather than guessed there.
const popoutFileHrefFor = (sid, path) => {
  const raw = String(path == null ? '' : path)
  if (!raw) return popoutHrefFor(sid)
  const normalized = raw.replace(/\\/g, '/')
  if (/^(?:[A-Za-z]:[\\/]|\/\/|\/)/.test(normalized)) return popoutHrefFor(sid, normalized)
  const root = (sid ? sessionCwd(sid) : '').replace(/\\/g, '/').replace(/\/+$/, '')
  if (!root) return popoutHrefFor(sid, normalized.replace(/^(?:\.\/)+/, ''))
  return popoutHrefFor(sid, root + '/' + normalized.replace(/^(?:\.\/)+/, ''))
}

// 后台任务 (background jobs). A READ-ONLY view of the shell's own job mirror:
// the panel never starts or stops anything — the jobs service is owner-scoped
// and the shell owns that lifecycle — it just shows the same array the shell's
// header button shows, in the same order (live first, then most recent), so a
// long-running command started by the agent is visible next to its artifacts.
// 「在弹出页打开」for the file that is open — the sidebar's shortcut to the SAME
// document in the popout tab.
//
// One control per open file, and deliberately ONE. It rides:
//   · the editor's own toolbar, where the file is editable and that toolbar
//     already exists (so it costs no row at all);
//   · the band — the strip of file tabs — where it does not. That strip IS the
//     row above the document, which is why the link lives at its right end
//     (sticky, like 清除 on the ledger) instead of on a bar of its own: a bar
//     holding one link is a whole row of chrome for one button.
// Which one is decided by the SAME predicate that decides whether the editor is
// offered at all (isEditablePreview / textEditability), because two independent
// conditions would sooner or later both answer true and put the button on screen
// twice — which is exactly what scripts/check.js pins ("exactly one popout
// control per open file").
//
// It is an <a>, not a button calling window.open: a real navigation cannot be
// eaten by a popup blocker (a blocked window.open returns null and the click
// looks dead), and the shared target name reuses ONE tab instead of piling up a
// new one per file.
const DocPopoutLink = (props) => {
  const p = props || {}
  const href = popoutFileHrefFor(p.sessionId, p.path)
  const name = basename(p.path || '')
  return React.createElement('a', {
    className: 'artifacts-doclink' + (p.compact ? ' is-compact' : ''),
    href,
    target: POPOUT_TARGET,
    rel: 'noreferrer noopener',
    'data-frog-doc-popout': p.place || 'doc',
    'data-frog-doc-path': p.path || '',
    title: name
      ? '在弹出页打开「' + name + '」（独立标签页，与侧边栏实时同步）'
      : '在弹出页打开（独立标签页，与侧边栏实时同步）',
    'aria-label': name ? '在弹出页打开 ' + name : '在弹出页打开',
  },
    PopoutIcon(p.compact ? 13 : 14),
    React.createElement('span', { className: 'artifacts-doclink-label' }, '在弹出页打开'),
  )
}

// The band's copy of the control: the same link as a sticky right-end action of
// the file-tab strip, so an open file that has no editor still has its way out
// without a second row above the document.
const DocPopoutBandAction = (props) => {
  const p = props || {}
  if (p.hidden) return null
  return React.createElement('span', { className: 'artifacts-tab-action artifacts-doclink-slot' },
    React.createElement(DocPopoutLink, { path: p.path, sessionId: p.sessionId, compact: true, place: 'band' }),
  )
}

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
  // floating panel. Both surfaces open on the FILE TREE when it is offered — the
  // tree is how a file is reached, and the ledger answers "what did the agent
  // change", which is the question you ask after that one. With the tree switched
  // off there is nothing to open on, so the ledger takes over. (A bare native
  // instance with no pin lands on the same default, and so does closing the last
  // file tab.)
  const defaultTab = fixedView || (settings.showFileTree ? 'tree' : 'artifacts')
  const [activeTab, setActiveTab] = React.useState(defaultTab) // 'artifacts' | 'tree' | 'jobs' | 'git' | 'file:<path>'
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
  // instance that IS the tree mounts it straight away — and so does one that
  // STARTS on the tree, which is every instance now that the tree is the default
  // view: without this the panel would open on an empty pane, because `treeReady`
  // used to be set only by a click on the band's 文件树 chip.
  const [treeReady, setTreeReady] = React.useState(fixedView ? fixedView === 'tree' : !!settings.showFileTree)
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
    // (the most recently opened other file), or to the view this surface opens
    // on — the file tree where it is offered, the ledger where it is not.
    if (activeTab === 'file:' + path) {
      setActiveTab(next.length ? 'file:' + next[next.length - 1].path : defaultTab)
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
          // The TYPE icon the tree and the product's own tabs both show, so a tab
          // and its row are recognisably the same file. It is the same
          // FileTypeGlyph the tree rows draw from src/shared/filetype.js — one
          // classifier, so a tab can never disagree with the row that opened it.
          // `aria-hidden` because the label right beside it already names the
          // file; the icon is the quick-glance channel, not a second name.
          React.createElement('span', { key: 'ico', className: 'artifacts-tab-ico', 'aria-hidden': true },
            React.createElement(FileTypeGlyph, { size: 13, path: f.path })),
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
      // The open file's way out to the popout tab, at this strip's right end —
      // the row above the document rather than a row of its own. Drawn only where
      // the editor's toolbar does NOT carry the same link, so a file never shows
      // two of them (see DocPopoutLink).
      activeFile && preview ? React.createElement(DocPopoutBandAction, {
        key: 'docpopout',
        path: activeFile,
        sessionId: sid,
        hidden: isEditablePreview(preview),
      }) : null,
    ) : null,
    React.createElement('div', { className: 'artifacts-main' },
      // ONE pane visible at a time, full width — but the two list views stay
      // MOUNTED and are only made invisible. Unmounting them was what made every
      // visit to 文件树 re-read the root level and jump back to the top: the
      // loaded levels, the expanded set and the scroll offset all live in the
      // component's own state, and a React unmount throws them away.
      activeFile
        ? React.createElement('div', { className: 'artifacts-preview' },
          // No bar above the document: the open file's way out to the popout tab
          // is either on the editor's toolbar (below) or at the right end of the
          // band a row up — never on a row of its own. See DocPopoutLink.
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
            // …and the open file's one-click way out to the popout tab, drawn in
            // the editor's own toolbar. The SAME condition as `editable` above, so
            // a file has either this control or the standalone bar above — never
            // both, never neither (scripts/check.js pins exactly that).
            docAction: isEditablePreview(preview)
              ? React.createElement(DocPopoutLink, { path: activeFile, sessionId: sid, compact: true, place: 'editor' })
              : null,
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
      // band between its views; the column's 文件树 tab, by contrast, always
      // exists, so honouring the preference here would leave the tab PRESENT AND
      // EMPTY — a blank column with nothing to click and nothing in any log. The
      // setting is not offered on the native surface for the same reason (see
      // SettingsSection).
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
        desc: '在浮动面板的带子上显示「文件树」视图，浏览工作区目录。原生形态下不显示这一项：系统的「文件」标签是系统自带的文件树，本插件的树是旁边的「文件树」标签，两者都在。',
        value: settings.showFileTree,
        onToggle: (v) => set('showFileTree', v),
      }),
      // Which surface the panel takes. The native one gives every view a real tab
      // in the shell's right column (expansion, fullscreen, drag-width and the tab
      // strip are the shell's); switching it off moves the panel back into its own
      // floating window.
      //
      // What it does NOT decide is which file trees are on that strip — that is
      // the 「显示系统的文件树」 switch right below it, and the two are separate
      // because they answer different questions: this one is "the floating window
      // or the column", that one is "one tree or two".
      React.createElement(SettingsToggle, {
        label: '用系统右侧边栏承载面板',
        desc: '把本插件的视图注册为系统右侧边栏的标签（展开/收起、全屏、拖宽、标签条由系统提供）。本插件的文件树带 @引用到输入框、右键菜单、新建/删除与 A/M 改动字母；@引用同时出现在系统文档预览的工具栏上。关闭则退回本插件的浮动窗口。修改后需刷新页面生效。',
        value: settings.nativeFileTree,
        onToggle: (v) => set('nativeFileTree', v),
      }),
      // One tree or two. Offered only on the column, because the product's 文件
      // tab does not exist anywhere else — the floating panel has its own band.
      //
      // Default OFF is the deliberate half: the two trees drew the same workspace
      // and only one of them carries @引用 / 右键菜单 / 新建删除, so showing both
      // said the same thing twice. Off puts this plugin's tree in the 文件 tab
      // (the position users already reach for) and there is exactly one file tree.
      //
      // The cost is stated rather than hidden: the product's live directory
      // watcher lives inside its own body, so taking that tab over stops it. This
      // plugin refreshes the directories its artifact data says changed, which
      // covers the agent's edits; another editor's changes need a manual refresh.
      // Turning this ON hands the watcher back and puts both trees on the strip.
      // Read once at load, like the switch above.
      frogNativeSurface ? React.createElement(SettingsToggle, {
        label: '显示系统的文件树',
        desc: '关闭（默认）：右侧边栏只有一棵文件树——本插件的树放在系统「文件」这个位置，开始页也只有一条文件树条目。开启：系统自己的「文件」标签回到它的树（自带实时目录监听与自动刷新），本插件的树是旁边的「文件树」标签，两棵都在。关闭系统那棵树会一并停用系统的实时监听，改由本插件在产物变化时刷新相应目录；另一个编辑器改动的文件需手动刷新。修改后需刷新页面生效。',
        value: settings.systemFileTree,
        onToggle: (v) => set('systemFileTree', v),
      }) : null,
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



              // ── 用量 / 上下文：一个系统的 Tab，读系统自己的投影 ──────────────────────
    // The shell's session projections already carry everything a usage view
    // needs: the HOST is the only computation site, and the client holds finished
    // whole values per key (`key → { value, seq }`, higher seq wins). Our tab body
    // receives the framework's own `useProjection` hook as a STANDARD PROP — the
    // `sidebar.right.pane.tab` seat declares it — so this view costs no host code,
    // no route and no ledger of our own, and it cannot disagree with the ring
    // beside the composer: both read the same `contextPressure` /
    // `contextBreakdown` keys, and occupancy is computed with the product's own
    // rule (see contextOccupancy below).
    //
    // It is registered as a PAGE TYPE (`ctx.sidebarRightTabs` + the keyed seat),
    // NOT as another view inside a strip of our own: its chip, its tab chrome and
    // its fullscreen / float controls are then the shell's, identical to every
    // other tab in that column. That is the rule for this plugin's surfaces.
    //
    // `undefined` from useProjection uniformly means "capability absent" — the
    // host unit is unmounted, or no baseline/frame has carried the key yet — so
    // every field is optional and the body says which part is missing rather than
    // rendering a figure nobody reported.
    const USAGE_TAB_ID = 'dsh-sidebar-frog/usage'
    const USAGE_TAB_TITLE = '用量'

    // The three keys token-meter registers when the composition provides
    // `ctx.sessionProjections`. Registered as a list so the set is stated once.
    const USAGE_KEYS = ['contextPressure', 'contextBreakdown', 'tokenUsage']

    // Called at the top of the tab body, never conditionally: the prop is injected
    // by the seat and is therefore fixed for the life of the mounted instance, so
    // the hook count cannot change between renders. `null` means the seat did not
    // give us the framework hook, and every block then reports itself as absent.
    const useUsageProjections = (useProjection) => {
      if (typeof useProjection !== 'function') return null
      const pressure = useProjection('contextPressure')
      const breakdown = useProjection('contextBreakdown')
      const tokens = useProjection('tokenUsage')
      return { pressure: pressure || null, breakdown: breakdown || null, tokens: tokens || null }
    }

    // The product's own bounded-occupancy rule (ui-conversation's
    // contextOccupancy, reproduced so the two agree to the percentage): the NEXT
    // request's prompt is the figure to show, the provider's last sample is the
    // fallback, and both a numerator and the route capacity must be known before
    // anything is shown at all.
    const contextOccupancy = (pressure) => {
      if (!pressure) return null
      const usedTokens = pressure.projectedTokens == null ? pressure.pressureTokens : pressure.projectedTokens
      if (usedTokens == null || pressure.contextWindow == null) return null
      return {
        percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
        usedTokens: usedTokens,
        contextWindow: pressure.contextWindow,
      }
    }

    // Whether the cumulative provider usage has anything to say yet.
    const usageTokensReported = (tokens) => !!tokens &&
      !!(tokens.uncachedInputTokens || tokens.outputTokens || tokens.cacheReadTokens || tokens.cacheWriteTokens)

    // Whether the session has any usage to show at all. The 用量 entry point is
    // hidden until this is true, following the product's own meter — which renders
    // nothing until a provider reports pressure and a route capacity: an entry that
    // opens onto three dashes is worse than no entry.
    const usageVisible = (usage) => {
      if (!usage) return false
      if (contextOccupancy(usage.pressure)) return true
      return usageTokensReported(usage.tokens)
    }

    // 1.2K / 3.4M — the compact form the product's meter uses (one decimal below
    // 100, none above, so a column of figures stays aligned).
    const formatTokens = (value) => {
      const n = typeof value === 'number' && isFinite(value) ? Math.max(0, value) : 0
      const scaled = (v) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
      if (n < 1000) return String(Math.round(n))
      if (n < 1e6) return scaled(n / 1e3) + 'K'
      return scaled(n / 1e6) + 'M'
    }

    // The tab's identity. The TYPE (kind, title, guide entry) is registered with
    // every other view in src/client/native.js's FROG_TABS — one place that knows
    // the whole set and the guide's order — so this module owns only what is
    // specific to the usage view: the projection readers below and its body.
    const USAGE_TAB_KIND = 'frog-usage'

    // The tab BODY — the only place `useProjection` may be called, since the seat
    // injects that hook as a standard prop of exactly this component.
    const UsageTabBody = (props) => {
      const usage = useUsageProjections(props && props.useProjection)
      return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
        React.createElement(UsagePane, { usage: usage }),
      )
    }

    // The context composition's three parts, in the product's own order, labels
    // and colours — a reader who knows the composer's meter reads this one the
    // same way. `tone` picks the stylesheet's tint class.
    const USAGE_SEGMENTS = [
      { key: 'systemTokens', label: '系统提示词', tone: 'system' },
      { key: 'toolsTokens', label: '工具定义', tone: 'tools' },
      { key: 'messageTokens', label: '对话消息', tone: 'messages' },
    ]

    // The cumulative four buckets, disjoint by the projection's own contract
    // (reasoning tokens are already inside output and are not counted twice).
    const USAGE_BUCKETS = [
      { key: 'uncachedInputTokens', label: '未缓存输入' },
      { key: 'cacheReadTokens', label: '缓存读取' },
      { key: 'cacheWriteTokens', label: '缓存写入' },
      { key: 'outputTokens', label: '输出' },
    ]

    const UsagePane = (props) => {
      const usage = (props && props.usage) || {}
      const occ = contextOccupancy(usage.pressure)
      const bd = usage.breakdown || null
      const compositionTotal = bd ? (bd.systemTokens || 0) + (bd.toolsTokens || 0) + (bd.messageTokens || 0) : 0

      const head = React.createElement('div', { className: 'artifacts-usage-head' },
        React.createElement('span', { className: 'artifacts-usage-title' }, '上下文已用'),
        occ
          ? React.createElement('span', { className: 'artifacts-usage-percent' }, occ.percent + '%')
          : React.createElement('span', { className: 'artifacts-usage-muted' }, '系统尚未上报'),
        occ
          ? React.createElement('span', { className: 'artifacts-usage-figures' },
            formatTokens(occ.usedTokens) + ' / ' + formatTokens(occ.contextWindow))
          : null,
      )

      // The composition bar. Segments are proportional to the heuristic
      // composition only — the projection's contract is explicit that these are
      // approximations of what the context is MADE OF, never the billed total.
      const segments = compositionTotal > 0
        ? USAGE_SEGMENTS.map((seg) => {
          const value = bd[seg.key] || 0
          if (value <= 0) return null
          return React.createElement('div', {
            key: seg.key,
            className: 'artifacts-usage-seg artifacts-usage-tone-' + seg.tone,
            style: { width: (value / compositionTotal * 100) + '%' },
            title: seg.label + ' ' + formatTokens(value),
          })
        })
        : null

      const composition = React.createElement('div', { className: 'artifacts-usage-block' },
        React.createElement('div', { className: 'artifacts-usage-label' }, '上下文构成（启发式，非计费值）'),
        React.createElement('div', { className: 'artifacts-usage-track' }, segments),
        React.createElement('div', { className: 'artifacts-usage-legend' },
          USAGE_SEGMENTS.map((seg) => React.createElement('div', { key: seg.key, className: 'artifacts-usage-row' },
            React.createElement('span', { className: 'artifacts-usage-swatch artifacts-usage-tone-' + seg.tone, 'aria-hidden': 'true' }),
            React.createElement('span', { className: 'artifacts-usage-name' }, seg.label),
            React.createElement('span', { className: 'artifacts-usage-value' }, bd ? formatTokens(bd[seg.key] || 0) : '—'),
          )),
        ),
      )

      const tokens = usage.tokens || null
      const totals = React.createElement('div', { className: 'artifacts-usage-block' },
        React.createElement('div', { className: 'artifacts-usage-label' }, '累计用量（提供方上报）'),
        React.createElement('div', { className: 'artifacts-usage-legend' },
          USAGE_BUCKETS.map((bucket) => React.createElement('div', { key: bucket.key, className: 'artifacts-usage-row' },
            React.createElement('span', { className: 'artifacts-usage-name' }, bucket.label),
            React.createElement('span', { className: 'artifacts-usage-value' }, tokens ? formatTokens(tokens[bucket.key] || 0) : '—'),
          )),
        ),
      )

      return React.createElement('div', { className: 'artifacts-usage' },
        head,
        // Pressure and breakdown come from different projections updated
        // independently, so a composition without an occupancy figure is a real
        // state (and vice versa) — each block says so on its own.
        compositionTotal > 0 ? composition : React.createElement('div', { className: 'artifacts-usage-block' },
          React.createElement('div', { className: 'artifacts-usage-label' }, '上下文构成（启发式，非计费值）'),
          React.createElement('div', { className: 'artifacts-usage-muted' }, '系统尚未上报上下文构成。'),
        ),
        usageTokensReported(tokens) ? totals : React.createElement('div', { className: 'artifacts-usage-block' },
          React.createElement('div', { className: 'artifacts-usage-label' }, '累计用量（提供方上报）'),
          React.createElement('div', { className: 'artifacts-usage-muted' }, '系统尚未上报累计用量。'),
        ),
      )
    }


              // ── Git 只读切片：一个系统的 Tab ────────────────────────────────────────
    // What this view is: the branch, ahead/behind, the changed and untracked
    // files, and one file's difference against HEAD. What it deliberately is NOT:
    // any way to change the repository. There is no stage, commit, discard,
    // checkout or stash anywhere in this plugin — a repository-wide write is the
    // one operation here that can destroy a user's work with no undo, and the
    // panel's own 撤销 already covers "put this one file back".
    //
    // It is a PAGE TYPE of the shell's column (registered with every other view
    // in src/client/native.js's FROG_TABS), so its chip, its chrome and its
    // fullscreen / float controls are the shell's, like every other tab there.
    //
    // ── One snapshot store, module-level ────────────────────────────────────
    // Every mount of this view reads ONE copy through `gitStore`, so two panels
    // (or a session switch and a remount) cannot disagree about the workspace's
    // state, and a request in flight is shared instead of duplicated.
    //
    // ── Why the refresh is throttled rather than polled ─────────────────────
    // `git status` walks the whole worktree: on a large repository it is not the
    // cheap 2-second poll the artifact ledger does. So the snapshot refreshes on
    // mount, when the ledger reports a change (i.e. the agent just wrote
    // something), on window focus / tab visibility, and on demand through the
    // header's ↻ — and never more often than GIT_REFRESH_MIN_MS. The header
    // states when it last read, so a stale view is visible as stale instead of
    // being quietly wrong.
    const GIT_TAB_ID = 'dsh-sidebar-frog/git'
    const GIT_TAB_KIND = 'frog-git'
    const GIT_TAB_TITLE = 'Git'
    const GIT_REFRESH_MIN_MS = 4000

    const gitStore = {
      data: null,        // the last snapshot for `sessionId`
      sessionId: '',
      loading: false,
      error: null,
      at: 0,             // when the last read finished (0 = never)
      listeners: [],
      get() {
        return { data: this.data, loading: this.loading, error: this.error, at: this.at, sessionId: this.sessionId }
      },
      emit() {
        const snap = this.get()
        this.listeners.forEach((fn) => { try { fn(snap) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
      // `force` bypasses the throttle (the header's ↻ and a session switch); a
      // soft refresh is skipped when one just happened, which is what keeps the
      // artifact poll from turning into a git-status loop.
      load(sessionId, force) {
        const sid = typeof sessionId === 'string' ? sessionId : ''
        const now = Date.now()
        if (!force && this.data && this.sessionId === sid && (now - this.at) < GIT_REFRESH_MIN_MS) {
          return Promise.resolve(this.data)
        }
        if (this.loading && this.sessionId === sid) return Promise.resolve(this.data)
        this.sessionId = sid
        this.loading = true
        this.emit()
        const url = '/dsh-sidebar-frog/git' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')
        return fetchJson(url).then((res) => {
          this.loading = false
          this.data = res && typeof res === 'object' ? res : null
          this.error = null
          this.at = Date.now()
          this.emit()
          return this.data
        }, (err) => {
          this.loading = false
          this.data = null
          this.error = err && err.message ? String(err.message) : String(err)
          this.at = Date.now()
          this.emit()
          return null
        })
      },
    }

    const useGit = (sessionId, artifactTick) => {
      const [state, setState] = React.useState(gitStore.get())
      React.useEffect(() => gitStore.subscribe(setState), [])
      // A session switch is a different workspace, so it is never throttled.
      React.useEffect(() => { gitStore.load(sessionId, true) }, [sessionId])
      // The ledger's list changed ⇒ the agent touched the workspace. `tick` is a
      // counter the panel bumps ONLY when its list actually differs, so this
      // fires on real activity rather than on every 2-second poll.
      React.useEffect(() => {
        if (artifactTick == null) return undefined
        gitStore.load(sessionId, false)
        return undefined
      }, [artifactTick])
      // The shell's session store emits as a conversation progresses, which is
      // the same "something is happening" signal when no ledger tick is handed
      // in (the native tab renders this pane on its own). The store's throttle in
      // `load` is what keeps that from becoming a git-status loop.
      React.useEffect(() => {
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return undefined
        return list.subscribe(() => { gitStore.load(sessionId, false) })
      }, [sessionId])
      React.useEffect(() => {
        const refresh = () => { gitStore.load(sessionId, false) }
        window.addEventListener('focus', refresh)
        document.addEventListener('visibilitychange', refresh)
        return () => {
          window.removeEventListener('focus', refresh)
          document.removeEventListener('visibilitychange', refresh)
        }
      }, [sessionId])
      return state
    }

    // Why the view has nothing to show. Each reason names the actual missing
    // thing, because "no repository" and "no git installed" look identical in an
    // empty panel and need completely different actions from the user.
    const GIT_ABSENT_TEXT = {
      'not-a-repo': '当前会话的工作目录不在 Git 仓库里。',
      'no-git': '系统里没有找到 git 可执行文件（PATH 上没有 git）。',
      'no-subprocess': '宿主没有提供子进程服务（ctx.subprocess），本插件不自己起进程，因此无法读取 Git 状态。',
      'bare': '这是一个裸仓库（bare）：没有工作区，也就没有可显示的改动。',
      'no-workspace': '工作区不可用：这个会话还没有可解析的工作目录。',
    }

    // The difference card for a mode that has no line-by-line content to show.
    const gitDiffNote = (compare) => {
      if (!compare) return ''
      if (compare.mode === 'binary') return '二进制文件：不显示逐行差异。'
      if (compare.mode === 'too-big') return '文件太大（' + Math.round((compare.size || 0) / 1024) + ' KB），不逐行比较。'
      if (compare.mode === 'same') return '与 HEAD 相同（可能只有权限位或换行的变化）。'
      return ''
    }

    // The status letter's tint, taken from the product's own state tokens so it
    // reads correctly in both themes: added/renamed are green, modified amber,
    // deleted red, a conflict inverts (solid red, white letter).
    const GIT_TONE_BY_LETTER = {
      A: 'add', C: 'add', M: 'mod', T: 'mod', D: 'del', R: 'ren', U: 'conflict', '?': 'new',
    }

    const GitPane = (props) => {
      // The native tab body is handed no props by the seat, so the pane reads the
      // active session itself — the same source the tree and the ledger use.
      const sessionId = props && props.sessionId ? props.sessionId : currentSessionId()
      const state = useGit(sessionId, props && props.artifactTick)
      const snap = state.data
      // The one open comparison, keyed by section + path: only one is ever shown,
      // because the panel is narrow and a nested accordion inside an accordion is
      // unreadable at this width.
      const [openKey, setOpenKey] = React.useState('')
      const [compare, setCompare] = React.useState(null)

      const toggle = (row, section) => {
        const key = section + ':' + row.path
        if (openKey === key) { setOpenKey(''); setCompare(null); return }
        setOpenKey(key)
        setCompare({ loading: true })
        const parts = ['path=' + encodeURIComponent(row.path)]
        if (sessionId) parts.push('sessionId=' + encodeURIComponent(sessionId))
        if (row.origPath) parts.push('origPath=' + encodeURIComponent(row.origPath))
        if (section === 'untracked') parts.push('untracked=1')
        fetchJson('/dsh-sidebar-frog/gitfile?' + parts.join('&')).then((res) => {
          setCompare(res && typeof res === 'object' ? res : { ok: false, error: '宿主没有返回内容' })
        }, (err) => {
          setCompare({ ok: false, error: err && err.message ? String(err.message) : String(err) })
        })
      }

      // ── Nothing loaded yet / the read failed ─────────────────────────────
      if (!snap) {
        if (state.error) {
          return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
            React.createElement('div', { className: 'artifacts-git-empty' },
              React.createElement('div', { className: 'artifacts-git-empty-title' }, '无法读取 Git 状态'),
              React.createElement('div', { className: 'artifacts-git-empty-note' }, state.error),
              React.createElement('button', {
                type: 'button', className: 'artifacts-iconbtn',
                onClick: () => gitStore.load(sessionId, true),
              }, '重试')))
        }
        return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
          React.createElement('div', { className: 'artifacts-git-empty' },
            React.createElement('div', { className: 'artifacts-git-empty-note' }, state.loading ? '正在读取 Git 状态…' : '尚无数据。')))
      }

      // ── Not a repository: say which reason, and stop ─────────────────────
      if (!snap.repo) {
        return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
          React.createElement('div', { className: 'artifacts-git-empty' },
            React.createElement('div', { className: 'artifacts-git-empty-title' }, '这里没有 Git 仓库'),
            React.createElement('div', { className: 'artifacts-git-empty-note' },
              GIT_ABSENT_TEXT[snap.reason] || '未检测到 Git 仓库。'),
            snap.cwd ? React.createElement('div', { className: 'artifacts-git-empty-path', title: snap.cwd }, snap.cwd) : null,
            React.createElement('button', {
              type: 'button', className: 'artifacts-iconbtn',
              onClick: () => gitStore.load(sessionId, true),
            }, '重新检测')))
      }

      const counts = snap.counts || gitCounts(snap.entries)
      const groups = gitSectionGroups(snap.entries)
      const ab = gitAheadBehindText(snap.ahead, snap.behind)

      const head = React.createElement('div', { className: 'artifacts-git-head' },
        React.createElement('span', { className: 'artifacts-git-branch', title: snap.root || '' }, gitHeadLabel(snap)),
        ab ? React.createElement('span', { className: 'artifacts-git-chip', title: '相对 ' + snap.upstream }, ab) : null,
        snap.detached ? React.createElement('span', { className: 'artifacts-git-chip is-warn' }, '游离') : null,
        React.createElement('span', { className: 'artifacts-git-summary' }, gitSummaryText(counts)),
        React.createElement('span', { className: 'artifacts-spacer' }),
        React.createElement('span', { className: 'artifacts-git-age', title: '上次读取 Git 状态的时间' },
          state.at ? relativeTime(state.at) : ''),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-iconbtn',
          title: '重新读取（git status）',
          'aria-label': '重新读取 Git 状态',
          disabled: !!state.loading,
          onClick: () => gitStore.load(sessionId, true),
        }, state.loading ? '读取中…' : '刷新'))

      // The upstream line is separate from the chips: a repository can be ahead,
      // behind, both or neither, and "which remote am I even comparing against"
      // deserves an answer that is not a tooltip.
      const upstreamLine = snap.upstream
        ? React.createElement('div', { className: 'artifacts-git-upstream' },
          '对照 ' + snap.upstream + (snap.remote ? '  ·  ' + snap.remote : ''),
          snap.ahead || snap.behind
            ? React.createElement('span', { className: 'artifacts-git-upstream-note' },
              '（' + (snap.ahead ? snap.ahead + ' 个提交未推送' : '') +
              (snap.ahead && snap.behind ? '，' : '') +
              (snap.behind ? snap.behind + ' 个提交未拉取' : '') + '）')
            : null)
        : React.createElement('div', { className: 'artifacts-git-upstream' }, '没有配置上游分支（@{upstream}）。')

      const body = groups.length
        ? groups.map((group) => React.createElement('div', { key: group.key, className: 'artifacts-git-section' },
          React.createElement('div', { className: 'artifacts-git-section-head' },
            React.createElement('span', { className: 'artifacts-git-section-title' }, group.title),
            React.createElement('span', { className: 'artifacts-git-section-count' }, group.rows.length),
            React.createElement('span', { className: 'artifacts-git-section-note' }, group.note)),
          group.rows.map((row) => {
            const key = group.key + ':' + row.path
            const letter = gitStatusLetter(row, group.key)
            const name = basename(row.path)
            const dir = row.path.slice(0, Math.max(0, row.path.length - name.length)).replace(/[\\/]+$/, '')
            const open = openKey === key
            return React.createElement('div', { key: key, className: 'artifacts-git-row-wrap' },
              React.createElement('button', {
                type: 'button',
                className: 'artifacts-git-row' + (open ? ' is-open' : ''),
                title: row.path + (row.origPath ? '  ←  ' + row.origPath : ''),
                'aria-expanded': open ? 'true' : 'false',
                onClick: () => toggle(row, group.key),
              },
                React.createElement('span', {
                  className: 'artifacts-git-letter artifacts-git-tone-' + (GIT_TONE_BY_LETTER[letter.letter] || 'mod'),
                  title: group.title + '：' + letter.label,
                }, letter.letter),
                React.createElement('span', { className: 'artifacts-git-path' },
                  React.createElement('span', { className: 'artifacts-git-name' }, name),
                  dir ? React.createElement('span', { className: 'artifacts-git-dir' }, dir) : null),
                row.origPath ? React.createElement('span', { className: 'artifacts-git-orig', title: '原路径 ' + row.origPath }, '← ' + basename(row.origPath)) : null,
              ),
              open ? React.createElement('div', { className: 'artifacts-git-diff' },
                compare && compare.loading ? React.createElement('div', { className: 'artifacts-git-empty-note' }, '正在读取差异…')
                  : !compare ? null
                    : compare.ok === false ? React.createElement('div', { className: 'artifacts-git-empty-note' }, compare.error || '读取差异失败')
                      : gitDiffNote(compare)
                        ? React.createElement('div', { className: 'artifacts-git-empty-note' }, gitDiffNote(compare))
                        // The SAME renderer the ledger uses, with its title naming
                        // this comparison: '编辑差异' would be a lie here, because
                        // nothing was edited by us — this is worktree vs HEAD.
                        : renderDiff({
                          before: compare.before, after: compare.after,
                          truncated: compare.truncated,
                          title: compare.mode === 'added' ? '新文件（未跟踪 / 未提交）' : compare.mode === 'deleted' ? '已删除（与 HEAD 相比）' : '与 HEAD 的差异',
                        })
              ) : null)
          })))
        : null

      return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native artifacts-git' },
        head,
        upstreamLine,
        snap.truncated ? React.createElement('div', { className: 'artifacts-git-truncated' },
          '改动文件过多，只列出前 ' + snap.entries.length + ' 项。') : null,
        React.createElement('div', { className: 'artifacts-git-list' },
          groups.length ? body : React.createElement('div', { className: 'artifacts-git-empty' },
            React.createElement('div', { className: 'artifacts-git-empty-title' }, '工作区干净'),
            React.createElement('div', { className: 'artifacts-git-empty-note' }, '没有已修改、已暂存或未跟踪的文件。'))),
      )
    }


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


              // ── Lending our renderer to the SHELL's document preview ───────────────
    // `ctx.documentPreviews` is the product's own renderer registry, keyed by
    // file extension, and it is explicitly two-sided: "External implementations
    // win over product implementations". That is the whole opportunity — the
    // product ships a solid Markdown renderer, but it has no math, no diagrams
    // and no interactive geometry, while this plugin has all three offline. So
    // registering here is a single investment that pays twice:
    //   · the official right sidebar's Markdown preview gains MathJax / Mermaid
    //     / JSXGraph for free — no second UI, no duplicated work;
    //   · our own panel keeps rendering the same files with the same code.
    //
    // Two stages again, and the second one hides a trap: the metadata goes into
    // the registry, and the BODY goes into the keyed `sidebar.right.tab.document`
    // seat under the same `id` — a seat the product's own preview declares as a
    // child, so it only exists once that registration is live and the
    // registration must therefore go through `slots.inject`.
    //
    // It is deliberately a SETTING rather than an unconditional takeover: the
    // built-in renderer has chrome ours does not (copy buttons, footnotes), so
    // "which Markdown renderer do you want in the shell's sidebar" is the user's
    // call, and switching it off retracts the registration so the built-in one
    // resumes winning. See 「nativeMarkdown」in src/shared/settings.js.
    const DOC_PREFIX = 'dsh-sidebar-frog/'
    // Live metadata registrations, by id: the disposer while it is live, null
    // while it is retracted. Registering one id twice throws, so this IS the state.
    const _docRegistrations = {}
    // Why a registration did not happen, by id, when it did not happen because
    // `register` threw (a duplicate left by a hot-swapped bundle is the usual
    // reason). Kept so the settings panel can SAY so instead of leaving a lent
    // renderer that is silently missing — see publishDocumentLend below.
    const _docFailures = {}

    // ── Can the PRODUCT's PDF renderer run in this engine? ─────────────────
    // Its pdf.js is 6.x, and version 6 calls the Map/WeakMap upsert methods
    // (`Map.prototype.getOrInsertComputed`). Those are Baseline *newly
    // available* only since February 2026 — Chromium 145, Firefox 147,
    // Safari 26.4 — and nothing can polyfill them for that renderer: the
    // product builds pdf.js's Worker from a Blob of its own, so the missing
    // method throws inside a realm this plugin cannot reach, on the FIRST
    // page request:
    //   this[#methodPromises].getOrInsertComputed is not a function
    // (Quark 7.1 is Chromium 144 — exactly such an engine.) This is a feature
    // test rather than a user-agent sniff, so a browser that later gains the
    // method hands the suffix straight back to the product.
    const productPdfRunnable = () => {
      try {
        return typeof Map.prototype.getOrInsertComputed === 'function'
          && typeof Map.prototype.getOrInsert === 'function'
      } catch (e) {
        // No Map at all: assume the product's renderer is the better bet and
        // do not take the suffix on a guess.
        return true
      }
    }

    // The renderers this plugin lends, built lazily on purpose: the bodies are
    // `const`s defined further down, and an array literal here would capture them
    // before they exist.
    const docRenderers = () => [
      {
        id: DOC_PREFIX + 'markdown',
        // Exactly the suffixes the product's own Markdown renderer claims. Taking
        // a suffix nobody claimed (say `mdx`) would be free but useless; the value
        // is in the ones that ARE claimed, because the extension band outranks them.
        extensions: ['md', 'markdown'],
        name: 'Markdown（数学 / 图表）',
        setting: 'nativeMarkdown',
        // The product's own Markdown renderer uses text-pages too: the owner
        // accumulates text and reads it out until `eof`. Byte delivery never
        // reaches a text renderer.
        loading: 'text-pages',
        // The built-in renderer declares `wrap: false` as well: prose wraps on its
        // own, and declaring it false keeps the toolbar from offering a
        // preference this renderer does not consume.
        wrap: false,
        body: MarkdownDocumentBody,
      },
      {
        // NOTHING in the product claims these suffixes — it registers
        // md/markdown, html/htm, pdf and a plain-text catch-all, and nothing else
        // — so this registration is pure gain: without it the official sidebar
        // shows a spreadsheet as one endless line.
        id: DOC_PREFIX + 'table',
        extensions: ['csv', 'tsv'],
        name: '表格（CSV / TSV · 可排序）',
        setting: 'nativeTable',
        loading: 'text-pages',
        wrap: false,
        body: TableDocumentBody,
      },
      {
        // NOTHING in the product claims these suffixes — it registers
        // md/markdown, html/htm, pdf and a plain-text catch-all, and nothing else
        // — so this registration is pure gain: without it the official sidebar
        // shows a .docx as「这类内容还没有可用的查看方式。」, and a spreadsheet
        // as one endless line.
        id: DOC_PREFIX + 'office',
        extensions: ['docx', 'xlsx', 'pptx'],
        name: 'Office 文档（离线）',
        setting: 'nativeOffice',
        // The COMPLETE-file delivery, not text pages: an Office document is a
        // ZIP container, so a window of decoded text is of no use to its parser.
        // This is the mode that hands the renderer the file's bytes — the reason
        // this registration exists at all.
        loading: 'bytes-complete',
        // We do not consume the document's wrap preference (nothing here wraps).
        wrap: false,
        body: OfficeDocumentBody,
      },
      {
        // The product DOES claim .pdf — with pdf.js 6, which calls
        // `Map.prototype.getOrInsertComputed` (see productPdfRunnable above).
        // On an engine that has that method its renderer is newer and better
        // than ours, so this entry registers NOTHING there: the capability gate
        // `when` below answers false and the product keeps the suffix.
        //
        // On an engine that lacks it the product's tab can only ever say
        // 「无法显示 PDF：this[#methodPromises].getOrInsertComputed is not a
        // function」, because the throw happens inside the Blob-built Worker
        // before any page is requested. There the extension band takes the
        // suffix (it outranks `builtin`) and the file is drawn by the SAME
        // PdfView the panel uses, over the vendored pdf.js 3.11.174.
        //
        // Deliberately NOT a user setting: one side of that choice is a tab
        // that cannot open a PDF at all, which is a capability fallback rather
        // than a preference. The settings panel still SHOWS which of the two
        // happened (see the 借出状态 row).
        id: DOC_PREFIX + 'pdf',
        extensions: ['pdf'],
        name: 'PDF（内置 pdf.js 3 · 兼容接管）',
        when: () => !productPdfRunnable(),
        // Same delivery contract as the product's own PDF definition:
        // complete bytes, no wrap preference consumed.
        loading: 'bytes-complete',
        wrap: false,
        body: PdfDocumentBody,
      },
    ]

    // Anything under this plugin's own id namespace is drawn by this plugin, so
    // the panel must not offer to "hand it over" to itself.
    const isOwnDocumentRenderer = (id) => String(id || '').indexOf(DOC_PREFIX) === 0

    const documentRegistry = () => {
      try {
        const reg = ctx.get('documentPreviews')
        return reg && typeof reg.register === 'function' ? reg : null
      } catch (e) { return null }
    }

    const docMetadata = (def) => ({
      id: def.id,
      extensions: def.extensions,
      priority: 'extension',
      title: () => def.name,
      loading: def.loading,
      wrap: def.wrap,
    })

    // ── File addresses ────────────────────────────────────────────────────
    // The seat hands the body a `dsh-resource://file/…` address, not a path.
    // These two helpers are the product's own address algebra, reproduced here
    // (it lives in a package this plugin must not import at runtime): the
    // composer is what lets the panel hand a file to the SHELL's renderers, and
    // the parser is what turns the address back into a path so relative links in
    // the Markdown still resolve.
    const encodeAddressSegment = (segment) =>
      encodeURIComponent(segment).replace(/%3A/gi, ':')

    // A path INSIDE the session's workspace becomes a session-relative address,
    // which is the only spelling the shell's document tab can read: it resolves a
    // session address against that session's workspace root. The product's own
    // tree does exactly this (`fileAddressFor` in ui-sidebar-files strips the
    // root off an absolute path before building the address).
    //
    // The tree hands us host-issued ABSOLUTE paths (the host answers with
    // `processPath`, not with the caller's spelling), so without this the address
    // asked the reader for `<root>/D:/…` — a path that cannot exist, in a tab that
    // otherwise opened fine. An absolute path OUTSIDE the workspace keeps its
    // absolute form, which is the product's own answer for that case too.
    const workspaceRelativePath = (sessionId, path) => {
      const root = sessionCwd(sessionId).replace(/\\/g, '/').replace(/\/+$/, '')
      if (!root) return path
      if (path === root) return ''
      if (path.indexOf(root + '/') === 0) return path.slice(root.length + 1)
      return path
    }

    const sessionFileAddress = (sessionId, path) => {
      const normalized = workspaceRelativePath(sessionId, String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, ''))
      const encoded = normalized.split('/').map(encodeAddressSegment).join('/')
      return 'dsh-resource://file/session/' + encodeAddressSegment(sessionId) + '/' + encoded
    }

    // The session a `file:` address carries. A session-scoped address is the only
    // place a seat hands this plugin an id it can act on (see
    // MarkdownDocumentBody), and a document-relative image in such a file needs
    // it: the media route resolves the path against that session's workspace.
    const sessionFromFileAddress = (address) => {
      try {
        const text = String(address || '')
        const prefix = 'dsh-resource://file/session/'
        if (text.indexOf(prefix) !== 0) return ''
        const end = text.search(/[?#]/)
        const id = text.slice(prefix.length, end === -1 ? undefined : end).split('/')[0]
        return id ? decodeURIComponent(id) : ''
      } catch (e) { return '' }
    }

    const pathFromFileAddress = (address) => {
      try {
        const text = String(address || '')
        if (text.indexOf('dsh-resource://file/') !== 0) return ''
        const end = text.search(/[?#]/)
        const parts = text.slice(20, end === -1 ? undefined : end).split('/')
        const scope = parts.shift()
        if (scope === 'session') {
          const id = parts.shift()
          if (!id || !parts.length) return ''
          return parts.map(decodeURIComponent).join('/')
        }
        if (scope === 'absolute') {
          const unc = parts[0] === '' && parts.length > 1
          const segments = (unc ? parts.slice(1) : parts).map(decodeURIComponent)
          if (!segments.length || segments[0] === '') return ''
          return unc ? '//' + segments.join('/') : (/^[A-Za-z]:$/.test(segments[0]) ? segments.join('/') : '/' + segments.join('/'))
        }
        return ''
      } catch (e) { return '' }
    }

    // A text payload the editor may safely write back.
    //
    // The owner hands PAGES, not a file. One page is one line window from the
    // seat — `{ offset, text, lines }` plus the file's `version` and complete
    // `bytes` from the stat that preceded it — and `eof` says whether the last
    // page includes the file's last line. Editing a WINDOW and saving it would
    // replace the whole file with that window, which is the one failure worse
    // than not offering an editor at all. So the gate is the whole file: exactly
    // one page, starting at line 1, with `eof` set. (The seat's page size is
    // 5000 lines, so every file up to that is editable and anything longer is
    // not — which is also why the popout page, with its own editor, stays the
    // way out for the long ones.)
    //
    // The version and byte count that ride the page are the save's conflict
    // basis. They are read from the PAGE (with the payload itself as a fallback
    // for an older shape) because that is where the seat puts them — the first
    // version of this function asked for `content.offset`, a field the owner's
    // memo does not carry at all, so `Number(undefined) !== 1` was true for every
    // payload and the shell's sidebar NEVER offered its editor. Nothing noticed
    // because the fixture in scripts/check.js invented the missing field.
    const textEditability = (content) => {
      if (!content || content.kind !== 'text') return null
      const pages = Array.isArray(content.pages) ? content.pages : null
      const first = pages && pages.length ? pages[0] : null
      const startsAtOne = first ? Number(first.offset) === 1 : Number(content.offset) === 1
      if (content.eof !== true || !startsAtOne) return null
      if (pages && pages.length > 1) return null
      const source = first || content
      const bytes = typeof source.bytes === 'number' && isFinite(source.bytes) ? source.bytes
        : (typeof content.bytes === 'number' && isFinite(content.bytes) ? content.bytes : null)
      // The host refuses a save past its own text ceiling; saying so here keeps
      // the toolbar from appearing on a file that could only fail on Ctrl+S.
      if (bytes !== null && bytes > 4 * 1024 * 1024) return null
      return {
        version: typeof source.version === 'string' && source.version ? source.version : null,
        size: bytes,
      }
    }

    // The body itself: whatever the owner accumulated, drawn by the SAME
    // MarkdownView the panel uses — math, diagrams and interactive geometry
    // included, since it is one renderer, not a second one that can drift.
    //
    // It is wrapped in the panel's EditorPane, so the shell's document tab has
    // the same 预览/编辑 toggle, the same drafts and the same save (with the same
    // conflict refusal) as the panel's own file tabs — the sidebar is where files
    // are actually opened, and a reader that can only look at a text file is half
    // a reader. A page-shaped payload gets no toolbar at all (see
    // textEditability).
    //
    // `scrollportRef` is deliberately NOT reported. It exists so a renderer that
    // owns a scroller can hand its own element over; this body lays its content
    // into the owner's scroller instead, and claiming a scrollport we do not
    // have would break both scrolling and the "jump to this line" navigation
    // that reads it.
    const MarkdownDocumentBody = (props) => {
      const p = props || {}
      const content = p.content && p.content.kind === 'text' ? String(p.content.text == null ? '' : p.content.text) : null
      if (content == null) {
        return React.createElement('div', { className: 'artifacts-hint' }, '此渲染器只处理文本内容。')
      }
      const path = pathFromFileAddress(p.resourceAddress)
      const session = sessionFromFileAddress(p.resourceAddress)
      const edit = textEditability(p.content)
      return React.createElement('div', { className: 'artifacts-doc' },
        // NO standalone bar here, on purpose. The one row of chrome a document
        // tab gets from this plugin is the editor's own toolbar, and it is drawn
        // because the file can be edited — so 「在弹出页打开」 rides it. Where
        // there is no editor (a payload too big to hold whole) the link is not
        // missing, it moved to the tab's own actions menu, one row up: the row
        // ABOVE this body belongs to the product's document header (path,
        // renderer picker, reload) and has no extension point, so a bar of ours
        // could only ever be a second, near-empty row — which is exactly what it
        // was, and what this removes. See PopoutMenuItem in src/client/native.js.
        React.createElement(EditorPane, {
          path: path,
          editable: !!edit,
          sessionId: session,
          content: content,
          baseVersion: edit ? edit.version : null,
          baseSize: edit ? edit.size : null,
          docAction: edit
            ? React.createElement(DocPopoutLink, {
              path: path,
              sessionId: session || currentSessionId(),
              compact: true,
              place: 'editor',
            })
            : null,
        },
          React.createElement(MarkdownView, {
            content,
            path: path,
            // The address IS session-scoped, so the session that owns the tab is
            // in the only thing this body was handed — and a document-relative
            // image in a file opened that way needs it (see mdMedia).
            sessionId: session,
          }),
        ),
      )
    }

    // The table body: the owner's accumulated text, drawn by the SAME TableView
    // the panel uses — one parser (src/shared/table.js) and one view, so the
    // shell's sidebar and this plugin's panel cannot disagree about a file. It
    // carries the editor for the same reason the Markdown body does.
    const TableDocumentBody = (props) => {
      const p = props || {}
      const content = p.content && p.content.kind === 'text' ? String(p.content.text == null ? '' : p.content.text) : null
      if (content == null) {
        return React.createElement('div', { className: 'artifacts-hint' }, '此渲染器只处理文本内容。')
      }
      const path = pathFromFileAddress(p.resourceAddress)
      const session = sessionFromFileAddress(p.resourceAddress)
      const edit = textEditability(p.content)
      return React.createElement('div', { className: 'artifacts-doc' },
        // No standalone bar: see the note on the Markdown body above. The same
        // link is on the editor's toolbar when the file is editable, and in the
        // tab's actions menu when it is not.
        React.createElement(EditorPane, {
          path: path,
          editable: !!edit,
          sessionId: session,
          content: content,
          baseVersion: edit ? edit.version : null,
          baseSize: edit ? edit.size : null,
          docAction: edit
            ? React.createElement(DocPopoutLink, {
              path: path,
              sessionId: session || currentSessionId(),
              compact: true,
              place: 'editor',
            })
            : null,
        },
          React.createElement(TableView, { content, path: path }),
        ),
      )
    }

    // The Office body: the seat's COMPLETE BYTES, drawn by the SAME widget the
    // panel and the popout page mount (src/shared/office.js), so a .docx cannot
    // look different depending on which of the plugin's three faces shows it.
    const OfficeDocumentBody = (props) => {
      const p = props || {}
      const address = p.resourceAddress
      const content = p.content
      if (!content || content.kind !== 'bytes') {
        return React.createElement('div', { className: 'artifacts-hint' }, '此渲染器只处理完整字节内容。')
      }
      const path = pathFromFileAddress(address)
      return React.createElement('div', { className: 'artifacts-doc is-office' },
        // No editor and no standalone bar: this body's 「在弹出页打开」 is the
        // tab's actions menu, which is the only chrome that costs no row (see
        // PopoutMenuItem in src/client/native.js).
        React.createElement(OfficeView, { bytes: content.data, path: path, kind: officeKind(path) }),
      )
    }

    // The PDF body, lent only on an engine whose own PDF renderer cannot run
    // (see the `pdf` entry above): the seat's COMPLETE BYTES, fed straight to
    // the SAME PdfView the panel mounts. The bytes are handed over instead of
    // re-fetched by path on purpose — the seat already read the file with the
    // user's own session, while this plugin's /media route may refuse a path it
    // does not consider readable (a file outside the session workspace).
    const PdfDocumentBody = (props) => {
      const p = props || {}
      const content = p.content
      if (!content || content.kind !== 'bytes') {
        return React.createElement('div', { className: 'artifacts-hint' }, '此渲染器只处理完整字节内容。')
      }
      return React.createElement('div', { className: 'artifacts-doc is-pdf' },
        // No bar. It used to sit here, with a z-index, only because the PDF view
        // fills its box absolutely; the tab's actions menu replaces it and the
        // row it claimed goes back to the document.
        React.createElement(PdfView, { bytes: content.data, path: pathFromFileAddress(p.resourceAddress) }),
      )
    }

    // Register the bodies once (they are inert while their metadata is
    // retracted), then let each setting decide whether its metadata is live.
    // `syncDocumentPreviews` is called from the settings subscription in body.js,
    // so flipping a switch takes effect immediately and hands that suffix back to
    // the built-in renderer.
    const applyDocumentPreviews = (slots) => {
      const registerBodies = () => {
        let ok = true
        docRenderers().forEach((def) => {
          try {
            slots.inject('sidebar.right.tab.document', () => slots.register({
              name: 'sidebar.right.tab.document',
              key: def.id,
            }, def.body))
          } catch (e) { ok = false }
        })
        return syncDocumentPreviews() && ok
      }
      if (documentRegistry()) return registerBodies()
      // The registry belongs to the shell's own document-preview pack. Load
      // order is graph-ordered by the manifest's `inject` list, but if this
      // bundle happens to apply before that service is announced, lending
      // nothing HERE and never looking again is silent and permanent: the shell
      // keeps drawing .md with its built-in renderer (which turns raw HTML into
      // TEXT, so an inline <svg> shows up as markup instead of a picture) and
      // has no renderer at all for .docx. So wait for the service, the way the
      // product's own carriers do.
      try {
        if (ctx && typeof ctx.inject === 'function') {
          ctx.inject(['documentPreviews'], () => {
            try { registerBodies() } catch (e) {}
            publishDocumentLend()
          })
        }
      } catch (e) {}
      publishDocumentLend()
      return false
    }

    // Is this lender wanted right now? A definition with a `setting` follows that
    // switch; a `when` predicate is a capability gate (the PDF entry above) and
    // is consulted on every sync, so an engine that gains the newer pdf.js API
    // hands the suffix back without a refresh.
    const isDocumentLendWanted = (def, current) => {
      if (def.setting && !current[def.setting]) return false
      if (typeof def.when === 'function') {
        try { return !!def.when() } catch (e) { return false }
      }
      return true
    }

    // ── What the shell is actually using this plugin for ───────────────────
    // A lent renderer can be absent for five different reasons — the switch is
    // off, the capability gate said "the product can do it", the registry is not
    // in this page yet, `register` threw (a duplicate from a hot-swapped bundle),
    // or it is live — and from the panel ALL of them look the same: the file
    // simply renders the product's way. That is how 「内联 SVG 变成了文本」 has no
    // obvious cause. So the state is published here and drawn by the settings
    // section: the difference between "the shell never got our renderer" and
    // "the shell got it and the file is the problem" becomes one glance.
    const documentLendStore = {
      value: { registry: false, rows: [] },
      listeners: [],
      publish(next) {
        this.value = next
        this.listeners.forEach((fn) => { try { fn(next) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    const documentLendState = (registry, wanted, live, def) => {
      if (!registry) return 'noregistry'
      if (live) return 'live'
      if (_docFailures[def.id]) return 'failed'
      if (wanted) return 'pending'
      // Not wanted: either the user switched it off, or the capability gate
      // decided the product's own renderer is the better one here.
      return def.when ? 'fallback' : 'off'
    }

    const publishDocumentLend = () => {
      const registry = documentRegistry()
      const current = settingsStore.get()
      documentLendStore.publish({
        registry: !!registry,
        // Whether the PRODUCT's renderer can run here at all. This is the one
        // fact that explains a PDF tab that cannot open a file, so it is shown
        // rather than left to be inferred from a stack trace.
        productPdf: productPdfRunnable(),
        rows: docRenderers().map((def) => {
          const wanted = isDocumentLendWanted(def, current)
          return {
            id: def.id,
            name: def.name,
            suffixes: def.extensions.join(' / '),
            state: documentLendState(registry, wanted, !!_docRegistrations[def.id], def),
            reason: _docFailures[def.id] || '',
          }
        }),
      })
    }

    // The settings section's reader. Subscribing here (rather than polling) keeps
    // it exact: every register/retract publishes.
    const useDocumentLend = () => {
      const [state, setState] = React.useState(documentLendStore.value)
      React.useEffect(() => documentLendStore.subscribe(setState), [])
      return state
    }

    // Live with the settings: register while on, retract while off. Each entry is
    // independent — the Markdown renderer's switch must not move the table one.
    const syncDocumentPreviews = () => {
      const registry = documentRegistry()
      if (!registry) { publishDocumentLend(); return false }
      const current = settingsStore.get()
      let anyLive = false
      docRenderers().forEach((def) => {
        const wanted = isDocumentLendWanted(def, current)
        const live = _docRegistrations[def.id]
        if (wanted && !live) {
          try {
            // Bound to this plugin's fiber: a hot-swapped bundle that left its
            // previous metadata registered would be refused as a duplicate and
            // the lent renderer would silently vanish (see bindLifecycle).
            _docRegistrations[def.id] = bindLifecycle(() => registry.register(docMetadata(def)))
            delete _docFailures[def.id]
          } catch (e) {
            _docRegistrations[def.id] = null
            _docFailures[def.id] = (e && e.message) ? String(e.message) : String(e)
          }
        } else if (!wanted && live) {
          try { if (typeof live === 'function') live() } catch (e) {}
          _docRegistrations[def.id] = null
          delete _docFailures[def.id]
        }
        if (wanted && _docRegistrations[def.id]) anyLive = true
      })
      publishDocumentLend()
      return anyLive
    }

    // ── Consuming the registry: who would draw this file? ──────────────────
    // Our panel can render text, Markdown, tables, media, images and PDFs by
    // itself; anything else (an Office document, say) it would only show as
    // mojibake. The registry knows whether some OTHER installed renderer claims
    // that suffix — and the sidebar's own `openResource` is the public way to
    // hand the file to it. So: ask, report honestly, offer the hand-off.
    const documentRendererFor = (path) => {
      const registry = documentRegistry()
      if (!registry || typeof registry.candidates !== 'function') return null
      try {
        const list = registry.candidates(path) || []
        const winner = list[0]
        if (!winner || !winner.id) return null
        return {
          id: String(winner.id),
          title: typeof winner.title === 'function' ? String(winner.title()) : String(winner.id),
          mine: isOwnDocumentRenderer(winner.id),
        }
      } catch (e) { return null }
    }

    // Hand a file to whichever renderer the shell would pick.
    //
    // It reports WHY when it cannot, instead of a bare `false`. The shell's
    // `openResource` throws for reasons the user can act on differently — no
    // right column in this build, no session to open into, or a column in which
    // no tab type claims the address — and it throws rather than reporting
    // absence because, from its side, an unclaimed address is a wiring mistake.
    // Swallowing that reason is what turned a real failure into the message
    // 「无法在系统侧边栏打开此文件」 with nothing to go on; the reason travels back
    // to the caller, which says it out loud (see openShellFailureText below).
    const openInShellSidebar = (path, sessionIdArg) => {
      let sidebar = null
      try { sidebar = ctx.get('sidebarRight') } catch (e) { sidebar = null }
      if (!sidebar || typeof sidebar.openResource !== 'function') {
        return { ok: false, reason: 'no-face' }
      }
      const sessionId = (typeof sessionIdArg === 'string' && sessionIdArg) || currentSessionId()
      if (!sessionId) return { ok: false, reason: 'no-session' }
      const address = sessionFileAddress(sessionId, path)
      try {
        sidebar.openResource(address)
      } catch (e) {
        return {
          ok: false,
          reason: 'refused',
          address,
          detail: (e && e.message) ? String(e.message) : String(e),
        }
      }
      return { ok: true, address }
    }

    // One sentence per refusal, because a message that names no cause cannot be
    // acted on: 收起/展开 and which kind this build registers are the user's own
    // levers, and the shell's own error text names the third case exactly.
    const openShellFailureText = (res) => {
      const reason = res && res.reason
      if (reason === 'no-face') return '无法在系统侧边栏打开：这个 DSH 没有可用的右侧边栏'
      if (reason === 'no-session') return '无法在系统侧边栏打开：还没有选中的会话'
      const detail = res && res.detail ? '（' + res.detail + '）' : ''
      return '无法在系统侧边栏打开此文件' + detail
    }


          slots.inject('settings.section', () => slots.register(
            { name: 'settings.section', id: 'dsh-sidebar-frog', order: 90, label: '可弹出式侧边栏' },
            SettingsSection,
          ))

          // Lend this plugin's Markdown and table renderers to the shell's own
          // document preview (metadata + keyed body), and keep each in step with
          // its setting: switching 「nativeMarkdown」/「nativeTable」off retracts
          // that registration so the product's renderer wins the suffix again.
          applyDocumentPreviews(slots)
          settingsStore.subscribe(() => { syncDocumentPreviews() })
          // The document skin's stylesheet, kept in step with the setting (see
          // syncMarkdownSkin in src/client/preview.js).
          syncMarkdownSkin()
          settingsStore.subscribe(() => { syncMarkdownSkin() })

          // The panel's surface, in order of preference. Every view registers as a
          // tab of the shell's column when its registry is there; when it takes,
          // the floating panel is NOT registered at all — that is what removes the
          // duplicate sidebar toggle from the header's share-button cluster (the
          // shell's own button is then the only one).
          //
          // The factory hands each tab the ONE view it draws (`fixedView`), so a
          // native tab never renders the self-drawn view switcher: the shell's tab
          // strip is what switches views, exactly as it does for the product's own
          // tabs. Two views are their own components rather than instances of the
          // shared panel:
          //   · 用量 reads `useProjection`, a standard prop only a registered body
          //     receives, so it forwards whatever the seat hands over;
          //   · Git owns its own store and reads the active session itself, so it
          //     takes no props at all.
          const VIEW_BODIES = {
            usage: (props) => React.createElement(UsageTabBody, props),
            git: () => React.createElement(GitPane),
          }
          frogNativeSurface = registerNativeTab(slots, (view) => VIEW_BODIES[view]
            || ((props) => React.createElement(ArtifactsContent, Object.assign({}, props, { surface: 'native', fixedView: view }))))

          // @引用 on the PRODUCT's own document preview, registered for BOTH
          // surfaces and for no panel at all. It is deliberately NOT inside
          // installColumnEntryPoints: that one is gated on this plugin owning the
          // column, while this is the capability that must survive the built-in
          // tree being the one on screen — it is what keeps 引用 working for
          // someone who never opens this plugin's own 文件树 tab. See
          // installDocumentActions in src/client/native.js.
          installDocumentActions(slots)


          // The column's own entry points, once that column is ours: the standing
          // 文件树 button in the left sidebar's foot (the shell's only expand
          // control sits in a header a BLANK session hides) and the
          // 「加载时展开」default the floating panel always honored — the shell's
          // own first page would be the chooser, because this plugin contributes
          // six guide entries. See installColumnEntryPoints in src/client/native.js.
          installColumnEntryPoints(slots)

          // Transient feedback rides the SHELL's frame-wide overlay layer — its
          // contract names a toast stack as exactly what belongs there — and it
          // is registered for BOTH surfaces, so no panel band has to reserve a
          // row for a notice (see NoticePill).
          slots.inject('shell.overlay', () => slots.register(
            { name: 'shell.overlay', id: 'dsh-sidebar-frog-notice', order: 60, label: 'Artifacts Notice' },
            NoticePill,
          ))

          if (!frogNativeSurface) {
            slots.inject('shell.overlay', () => slots.register(
              { name: 'shell.overlay', id: 'dsh-sidebar-frog-trigger', order: 40, label: 'Artifacts' },
              CornerButton,
            ))

            slots.inject('shell.overlay', () => slots.register(
              { name: 'shell.overlay', id: 'dsh-sidebar-frog-panel', order: 50, label: 'Artifacts Panel' },
              () => React.createElement(ArtifactsPanel),
            ))
          }
        },
      }
    })()
    exports.inject = plugin.inject
    exports.apply = plugin.apply
    return module.exports
  },
})
