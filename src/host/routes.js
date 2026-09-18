      // ── Routes ────────────────────────────────────────────────────────────
      // Two classes of route live here.
      //
      // DATA routes (/data /content /media /remove /delete /listdir /search /revert /git
      // /gitfile) expose the workspace, so each one opens with `rejectRequest`:
      // the same Host/Origin fence + browser-cookie authentication DSH applies to
      // its own /api transport (see the helper in core.js). Both the sidebar and
      // the popout tab call them from the authenticated origin, so they are
      // unaffected, while an unauthenticated probe now gets 401 instead of the
      // workspace.
      //
      // PAGE and ASSET routes stay open on purpose: the popout tab is reached by
      // plain navigation and the vendored renderer bundles are public library
      // code. Neither reveals anything about the workspace — the page reads its
      // data through the guarded routes above.
      //
      // There is no third class any more. The 内置浏览器 tab used to add one — a
      // PREFIX route serving workspace files to an embedded preview frame, which
      // could not use the cookie (that frame is sandboxed without
      // allow-same-origin, so its requests are cross-site) and therefore carried a
      // capability token in the path instead. Both that route and the tab are
      // gone: the product's own document preview already renders a workspace .html
      // live, so the only thing the route bought was a dev-server preview — at the
      // price of the one data route in this plugin that answered without the
      // browser cookie.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(page)
        },
      }), 'artifacts: page route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/data',
        handler(req, res) {
          if (rejectRequest(req, res)) return
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          // `build` is this PROCESS's digest. The client half is fetched per page
          // load (and can be hot-swapped), so the two can legitimately differ
          // after a rebuild — and saying so in the panel is what turns "restart
          // it, I guess" into a stated fact.
          res.end(JSON.stringify({ artifacts: snapshot(), build: BUILD }))
        },
      }), 'artifacts: data route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/content',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          const path = parseQuery(req.url).path || ''
          const out = await readFile(path, { forceText: parseQuery(req.url).text === '1' })
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: content route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/media',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          const query = parseQuery(req.url)
          const path = query.path || ''
          const fs = ctx.get('fs')
          if (!fs || !path) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('bad request')
            return
          }
          try {
            // A relative path is resolved against the WORKSPACE of the session
            // that is showing it, not against the sandbox root: a Markdown
            // document's own images arrive here document-relative
            // (`docs/logo/logo.svg` for a README at the workspace root), and the
            // sandbox root is not necessarily that workspace — resolving against
            // it answered 404 for every local image in the document, which reads
            // as a broken image rather than as a routing mistake.
            //
            // `sessionId` is what the client already knows: it is on every host
            // call (see host.call in src/client/body.js) and the popout page reads
            // it from localStorage. An unnamed request still resolves the same way
            // (resolveCwd falls back to the most recent session's workspace), and
            // an absolute path ignores the root entirely.
            const policy = ctx.get('sandboxPolicy')
            const fallback = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
            const cwd = (await resolveCwd(query.sessionId || '')) || fallback
            const target = await fs.resolve(path, cwd ? { cwd: cwd } : undefined)
            const info = await fs.stat(target)
            if (!info || info.type !== 'file') {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
              res.end('not found')
              return
            }
            const ext = (() => { const m = /\.([^.]+)$/.exec(String(path || '')); return m ? m[1].toLowerCase() : '' })()
            const mime = MIME[ext] || 'application/octet-stream'
            const size = typeof info.size === 'number' && isFinite(info.size) ? info.size : 0
            // A player asks twice before it plays anything: a HEAD or GET for
            // the head of the container, then a tail request for the index. With
            // no byte-range support both answers were the same whole-file 200,
            // which is why audio and video simply never started.
            const head = req.method === 'HEAD'
            const range = parseByteRange(req.headers ? req.headers.range : undefined, size)
            if (range === 'invalid') {
              res.writeHead(416, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Accept-Ranges': 'bytes',
                'Content-Range': formatUnsatisfiedRange(size),
                'Cache-Control': 'no-store',
              })
              res.end(head ? undefined : 'range not satisfiable')
              return
            }
            if (range) {
              // One response is capped: a client may ask for megabytes it will
              // seek past, and reading all of it into memory to hand over is how
              // a 2 GB video becomes a 2 GB allocation. Serving a SHORTER window
              // than asked for is legal (the Content-Range describes what was
              // actually sent), and the player asks again for the rest.
              const served = Math.min(range.length, 8 * 1024 * 1024)
              const bytes = await fs.readByteRange(target, { offset: range.start, length: served })
              res.writeHead(206, {
                'Content-Type': mime,
                'Cache-Control': 'no-store',
                'Accept-Ranges': 'bytes',
                'Content-Range': formatContentRange(range.start, range.start + bytes.byteLength - 1, size),
                'Content-Length': bytes.byteLength,
              })
              res.end(head ? undefined : Buffer.from(bytes))
              return
            }
            const bytes = await fs.readBytes(target, undefined, 25 * 1024 * 1024)
            res.writeHead(200, {
              'Content-Type': mime,
              'Cache-Control': 'no-store',
              // Advertised even on the whole-file answer: this is the header a
              // player reads to decide it is allowed to seek at all.
              'Accept-Ranges': 'bytes',
              'Content-Length': bytes.byteLength,
            })
            res.end(head ? undefined : Buffer.from(bytes))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(e && e.message ? String(e.message) : 'read failed')
          }
        },
      }), 'artifacts: media route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/remove',
        handler(req, res) {
          if (rejectRequest(req, res)) return
          const path = parseQuery(req.url).path || ''
          const out = removeFile(path)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: remove route')
      // Delete a file or folder from DISK (the file tree's 删除). POST with a JSON
      // body {path, sessionId} — a mutation, so the parameters travel in a body
      // rather than in a URL that ends up in logs, and the route sits behind the
      // identical cookie guard as every other data route. The response is always
      // JSON: a refusal (a path outside the workspace, the workspace root, a
      // locked file) comes back with a reason the tree shows the user.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/delete',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
            return
          }
          let body
          try { body = await readJsonBody(req) } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: e && e.message ? String(e.message) : 'bad request' }))
            return
          }
          const out = await deletePath(body && body.path, body && body.sessionId)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: delete route')
      // Put one captured change back (撤销). POST with a JSON body, because the
      // path/opId pair is a mutation rather than a query, and guarded like every
      // other data route. The response is always JSON: the client shows the
      // reason when the revert was refused (file moved on, no snapshot, …).
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/revert',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
            return
          }
          let body
          try { body = await readJsonBody(req) } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: e && e.message ? String(e.message) : 'bad request' }))
            return
          }
          const out = await revertFile(body && body.path, body && body.opId)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: revert route')
      // 保存: write an edited text file back. POST with a JSON body
      // {path, content, sessionId, baseVersion, baseSize, force} — the same shape
      // as 撤销 and for the same reason: this mutates the workspace, so the
      // parameters travel in a body rather than in a URL that ends up in logs,
      // and the route is behind the identical cookie guard.
      //
      // The body cap is this route's own: `content` is the file's text, which the
      // 64 KB default could never carry. `saveFile` enforces the real limit (4 MB
      // of TEXT) and answers every refusal as JSON with a reason, so the editor
      // can say what happened instead of showing a parse error.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/save',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: 'method not allowed' }))
            return
          }
          let body
          try { body = await readJsonBody(req, SAVE_BODY_MAX) } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify({ ok: false, error: e && e.message ? String(e.message) : 'bad request' }))
            return
          }
          const out = await saveFile(body && body.path, body && body.content, body)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: save route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/listdir',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          const q = parseQuery(req.url)
          const out = await listDir(q.path || undefined, q.sessionId || undefined)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: listdir route')
      // Bounded recursive name search for the tree's filter box.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/search',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          const q = parseQuery(req.url)
          const out = await searchFiles(q.q, q.sessionId || undefined, parseInt(q.limit, 10) || undefined)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: search route')
      // pdf.js assets for the sidebar's custom PDF renderer. Served from the
      // embedded (vendored) copies so the plugin works fully offline. Long
      // cache lifetime: the bytes are versioned with the plugin itself.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/pdfjs/pdf.min.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(PDFJS_LIB)
        },
      }), 'artifacts: pdf.js lib route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/pdfjs/pdf.worker.min.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(PDFJS_WORKER)
        },
      }), 'artifacts: pdf.js worker route')
      // MathJax (vendored) for Markdown math in the sidebar preview and the
      // standalone page. Same offline embedding pattern as the pdf.js assets.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/mathjax/tex-svg.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(MATHJAX_LIB)
        },
      }), 'artifacts: mathjax lib route')
      // Mermaid (vendored) for ```mermaid code blocks inside Markdown previews
      // (sidebar + standalone page). Same offline embedding pattern as the
      // pdf.js / MathJax assets.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/mermaid/mermaid.min.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(MERMAID_LIB)
        },
      }), 'artifacts: mermaid lib route')
      // JSXGraph (vendored) for ```jsxgraph code blocks inside Markdown
      // previews (sidebar + standalone page). Same offline embedding pattern.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/jsxgraph/jsxgraphcore.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(JSXGRAPH_LIB)
        },
      }), 'artifacts: jsxgraph core route')
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/jsxgraph/jsxgraph.css',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(JSXGRAPH_CSS)
        },
      }), 'artifacts: jsxgraph css route')
      // Office readers (vendored: JSZip, docx-preview, SheetJS, pptx-renderer).
      // Same public-asset contract as the renderer bundles above: library code,
      // nothing about the workspace, long cache because the bytes are versioned
      // with the plugin. The pptx build is an ES module — it is the one asset
      // here that must be served with a JavaScript MIME type a module loader
      // accepts, which is what the `text/javascript` answer is for.
      const OFFICE_ASSETS = [
        ['/dsh-sidebar-frog/office/jszip.min.js', JSZIP_LIB, 'artifacts: office jszip route'],
        ['/dsh-sidebar-frog/office/docx-preview.min.js', DOCX_LIB, 'artifacts: office docx route'],
        ['/dsh-sidebar-frog/office/xlsx.full.min.js', XLSX_LIB, 'artifacts: office xlsx route'],
        ['/dsh-sidebar-frog/office/pptx-renderer.es.js', PPTX_LIB, 'artifacts: office pptx route'],
      ]
      OFFICE_ASSETS.forEach(([path, body, label]) => {
        ctx.effect(() => webServer.register({
          kind: 'exact',
          path: path,
          handler(req, res) {
            res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
            res.end(body)
          },
        }), label)
      })
      // CodeMirror 6 (vendored, MIT) — the 编辑 mode's editor, loaded lazily by
      // both faces (the panel and the popout page) the first time someone opens
      // it. Same public-asset contract as the readers above: library code,
      // nothing about the workspace, long cache because the bytes are versioned
      // with the plugin. It is an IIFE that publishes `window.DshFrogCM`.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/codemirror/codemirror.min.js',
        handler(req, res) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=31536000' })
          res.end(CODEMIRROR_LIB)
        },
      }), 'artifacts: codemirror lib route')

      // ── Git 只读切片 (P1-9) ────────────────────────────────────────────────
      // The snapshot: branch, upstream, ahead/behind, the changed/untracked
      // entries and their counts. Not being a repository is a NORMAL answer
      // (`repo: false` with a reason) rather than an error, because the view has
      // to hide itself cleanly in a workspace that is not one.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/git',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          const out = await gitSnapshot(parseQuery(req.url).sessionId || '')
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: git snapshot route')
      // One file's difference against HEAD. `path` is a repository-relative path
      // that came from git itself; it is still validated (contained, no `..`)
      // before a byte is read, because a request is a request.
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path: '/dsh-sidebar-frog/gitfile',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          const q = parseQuery(req.url)
          const out = await gitFileCompare(q.sessionId || '', q.path || '', q.origPath || '', q.untracked === '1')
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'close' })
          res.end(JSON.stringify(out))
        },
      }), 'artifacts: git file route')
