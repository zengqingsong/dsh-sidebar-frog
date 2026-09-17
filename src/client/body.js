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
        inject: ['timer'],
        apply(ctx) {
          const slots = ctx.get('slots')
          if (slots === undefined) return

          // Which build this browser half is. The host prints the same digest at
          // startup and the popout page carries it as a <meta>; settings shows
          // this one, so a half-restarted process is visible instead of looking
          // like an unrelated UI bug.
          const BUILD = '@@build@@'

          @@bridge@@
          @@settings@@
          @@format@@
          @@paths@@
          @@linediff@@
          @@ext@@
          @@office@@
          @@table@@
          @@gitslice@@
          @@highlight@@
          @@markdown@@
          @@editor@@

          @@core@@

          styles.insert(`@@styles@@
@@office_css@@`)

          @@icons@@

          @@preview@@

          @@filetree@@

          @@editorui@@

          @@components@@

          @@usage@@

          @@git@@

          @@native@@

          @@docpreview@@

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
