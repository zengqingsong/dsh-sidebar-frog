/**
 * 可弹出式侧边栏 · dsh-sidebar-frog — Host body
 *
 * Assembled by `scripts/build.js` into `src/host.js`. This is the plain-JS
 * function body consumed by DeepSeek Harness's Cordis plugin loader — the very
 * same text you can pass to `cordis_define` as `code.host`.
 *
 * The placeholder tokens in this skeleton are replaced at build time by:
 *   ext      → src/shared/ext.js (shared preview-type helpers)
 *   paths    → src/shared/paths.js (workspace path comparison, for containment)
 *   gitslice → src/shared/gitslice.js (porcelain -z parsing + the read-only view's rules)
 *   core     → src/host/core.js   (constants + artifact tracking + file ops)
 *   page     → src/host/page.js   (standalone web tab HTML)
 *   routes   → src/host/routes.js (the /dsh-sidebar-frog/* HTTP routes)
 */
return {
  // NO static (hard) service dependency, on purpose.
  //
  // A static `inject` is a gate on the ENTIRE plugin: Cordis never calls `apply`
  // until every name in it resolves. `webServer` exists only in the web profile,
  // so naming it here also switched off this half's artifact-tracking waterfalls
  // (`tools/result` / `tools/execute`) in every headless assembly — code that has
  // nothing to do with HTTP and that a headless run is exactly where you want it
  // live. Cordis does not fail loudly either: the plugin is simply never applied.
  //
  // The HTTP half is registered under a dynamic injection instead, so it appears
  // when the server does. `sessionQuery` is not declared at all: both places that
  // want it read it lazily through `ctx.get` and already handle its absence.
  inject: [],
  apply(ctx) {
    // Which build this process actually loaded. `dsh web` reads this bundle once
    // at startup, so a page that was edited and rebuilt but not restarted keeps
    // serving the old text — and a HALF-restarted process (fresh client bundle,
    // stale popout page) breaks the cross-window bridge in ways that look like
    // unrelated UI bugs. Compare against `npm run check` / the page's
    // <meta name="dsh-sidebar-frog-build">.
    const BUILD = '@@build@@'
    try { console.log('[artifacts] dsh-sidebar-frog build ' + BUILD) } catch (e) {}

    @@ext@@
      @@paths@@
      @@gitslice@@
      @@range@@
      @@core@@

    // Routes and the popout page only exist where there is an HTTP server.
    //
    // `ctx.inject(deps, cb)` is shorthand for `ctx.plugin({ inject: deps, apply:
    // cb })`: the callback runs once every named service resolves, and Cordis
    // unloads and re-runs it if that service is ever replaced. The parameter
    // deliberately shadows the outer `ctx` — the registrations inside must ride
    // the INJECTION's fiber, not this plugin's, or a replaced `webServer` would
    // leave the previous route table behind.
    ctx.inject(['webServer'], (ctx) => {
      const webServer = ctx.get('webServer')
      if (!webServer) return
      @@page@@
      @@routes@@
    })
  },
}
