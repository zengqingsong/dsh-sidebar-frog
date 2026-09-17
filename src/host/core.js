    let artifacts = []
    let seq = 0
    let lastCwd // the most recently seen session working directory (workspace)

    const MIME = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
      pdf: 'application/pdf',
      // Playable media. These are the ones that MUST be right: a wrong or generic
      // Content-Type is why a <video> shows a spinner and never starts, and the
      // /media route answers byte ranges only for what it can name.
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4',
      aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg', weba: 'audio/webm',
      mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
      mkv: 'video/x-matroska', ogv: 'video/ogg',
      // Delimited text the panel parses into a table. Named so a browser opening
      // the same URL renders it as text instead of downloading it.
      csv: 'text/csv; charset=utf-8', tsv: 'text/tab-separated-values; charset=utf-8',
      psv: 'text/plain; charset=utf-8',
    }
    // Vendored pdf.js (Mozilla, Apache-2.0) — embedded by scripts/build.js and
    // served to the browser for the sidebar's custom PDF renderer. The standalone
    // popout tab keeps the browser's native viewer instead.
    const PDFJS_LIB = @@PDFJS_LIB@@
    const PDFJS_WORKER = @@PDFJS_WORKER@@
    // Vendored MathJax 3 (Apache-2.0) — embedded by scripts/build.js and served
    // to the browser for rendering $...$ / $$...$$ math inside Markdown previews.
    const MATHJAX_LIB = @@MATHJAX_LIB@@
    // Vendored Mermaid (MIT) — embedded by scripts/build.js and served to the
    // browser for rendering ```mermaid blocks inside Markdown previews.
    const MERMAID_LIB = @@MERMAID_LIB@@
    // Vendored JSXGraph (MIT) — embedded by scripts/build.js and served to the
    // browser for rendering ```jsxgraph blocks inside Markdown previews.
    const JSXGRAPH_LIB = @@JSXGRAPH_LIB@@
    const JSXGRAPH_CSS = @@JSXGRAPH_CSS@@
    // Vendored Office readers (all Apache-2.0 except JSZip, which is MIT or
    // GPLv3 — this plugin takes the MIT branch): docx-preview + JSZip read
    // WordprocessingML, SheetJS reads SpreadsheetML, @aiden0z/pptx-renderer
    // reads PresentationML. Served to the browser from these embedded copies so
    // a document is read fully offline — see src/shared/office.js.
    const JSZIP_LIB = @@JSZIP_LIB@@
    const DOCX_LIB = @@DOCX_LIB@@
    const XLSX_LIB = @@XLSX_LIB@@
    const PPTX_LIB = @@PPTX_LIB@@
    // Vendored CodeMirror 6 (MIT) — embedded by scripts/build.js and served to
    // the browser for the 编辑 mode (Markdown and plain text). Not inlined into
    // src/client.js: the editor is a lazy <script> the same way pdf.js and
    // MathJax are, so the panel pays for it only when someone edits. The build
    // and its exact package versions are recorded in
    // src/vendor/codemirror/README.md.
    const CODEMIRROR_LIB = @@CODEMIRROR_LIB@@
    // Shell executors whose filesystem side effects are NOT visible as a
    // `write`/`edit` result. Snapshot-diff the workspace around these tools so
    // files they create or overwrite (e.g. `python3 make_chart.py` emitting a
    // PNG) still land in the artifact list.
    const WATCH_TOOLS = { bash: 1, pwsh: 1 }
    // Directories never walked during a snapshot: VCS / cache / dependency
    // trees that are huge and never contain the artifacts the agent cares about.
    const SKIP_DIRS = new Set([
      'node_modules', 'venv', '.venv', 'env', '__pycache__', '.pytest_cache',
      '.mypy_cache', '.ruff_cache', '.tox', '.cache', '.next', '.nuxt',
      'dist', 'build', 'out', 'target', '.git', '.svn', '.hg', '.idea',
      '.vscode', '.dsh', '.workbuddy',
    ])
    const SNAPSHOT_MAX_FILES = 5000
    const SNAPSHOT_MAX_DEPTH = 16

    // Clip a diff snippet so the list payload stays bounded even when the
    // agent replaces a huge region in one edit.
    const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n…' : s)

    // Same bound, but without the ellipsis: a diff payload is now rendered line
    // by line, and an appended "…" would show up as a line of its own.
    const clipPlain = (s, n) => (s.length > n ? s.slice(0, n) : String(s == null ? '' : s))

    // ── Undo history ────────────────────────────────────────────────────────
    // A revert needs the file's text BEFORE the agent touched it, and that text
    // exists only in the LIVE tool result: `write`/`edit` hand over
    // `{ operation, before, after }` inside the execution value, and that value
    // is "deliberately omitted from durable events" — the session log keeps only
    // hunk-level diffs. So the ledger keeps its own bounded per-path history of
    // those snapshots, and the revert route puts one back.
    //
    // Bounds matter: a snapshot is full file text. Ten per path, 256 KB a side,
    // and a whole-ledger budget that evicts the oldest snapshot first — the
    // newest one is the one an undo actually uses.
    const HISTORY_PER_PATH = 10
    const HISTORY_TEXT_MAX = 262144
    const HISTORY_TOTAL_MAX = 33554432
    let historyChars = 0

    const changeSize = (h) => (h && typeof h.before === 'string' ? h.before.length : 0) + (h && typeof h.after === 'string' ? h.after.length : 0)

    const dropChange = (list, idx) => {
      if (!list || idx < 0 || idx >= list.length) return
      historyChars -= changeSize(list[idx])
      if (historyChars < 0) historyChars = 0
      list.splice(idx, 1)
    }

    // Keep the ledger inside its budget by dropping the OLDEST snapshot across
    // every path, so the most recent undo targets survive.
    const trimHistory = () => {
      while (historyChars > HISTORY_TOTAL_MAX) {
        let best = null
        for (const a of artifacts) {
          const list = a.history
          if (!list || !list.length) continue
          if (!best || list[0].seq < best.list[0].seq) best = { list: list }
        }
        if (!best) { historyChars = 0; return }
        dropChange(best.list, 0)
      }
    }

    // One entry per (path, opId): the two handlers that can see the same write —
    // tools/execute carries the content, tools/result carries the arguments —
    // update one snapshot instead of recording the change twice.
    const pushHistory = (entry, change) => {
      if (!entry.history) entry.history = []
      const at = entry.history.findIndex((h) => h.opId === change.opId)
      if (at >= 0) dropChange(entry.history, at)
      entry.history.push(change)
      historyChars += changeSize(change)
      while (entry.history.length > HISTORY_PER_PATH) dropChange(entry.history, 0)
      trimHistory()
    }

    // What a change looks like on the wire. The snapshot text itself never
    // travels: the list is polled every 2 s and a file's worth of text per row
    // would dwarf the ledger.
    const publicEntry = (a) => {
      const out = {
        id: a.id, path: a.path, kind: a.kind, type: a.type,
        sessionId: a.sessionId, at: a.at, seq: a.seq,
      }
      if (a.diff) out.diff = a.diff
      const list = a.history
      if (list && list.length) {
        const last = list[list.length - 1]
        out.changes = list.length
        // Whose change the newest revision is. The panel labels the row with it
        // (「你的保存」 vs the agent's edit) instead of pretending every entry in
        // the ledger came from the model.
        if (last.by) out.by = last.by
        if (last.before === null) {
          out.undo = { kind: 'create', can: false, reason: '宿主未提供删除接口，无法撤销新建的文件' }
        } else if (last.truncated) {
          out.undo = { kind: 'edit', can: false, reason: '改动过大，未保存完整快照' }
        } else {
          out.undo = { kind: 'edit', can: true, opId: last.opId }
        }
      }
      return out
    }

    // Parse a route's query string into a plain object. Shared by every data
    // route: each one used to carry its own copy of this loop. Decoding is
    // tolerant on purpose — a malformed percent escape falls back to the raw
    // text instead of throwing, so a bad URL can never take a route down — and
    // a repeated key keeps its last value, like URLSearchParams.
    const parseQuery = (url) => {
      const out = {}
      const text = String(url == null ? '' : url)
      const at = text.indexOf('?')
      if (at < 0) return out
      const decode = (s) => {
        try { return decodeURIComponent(s) } catch (e) { return s }
      }
      const parts = text.slice(at + 1).split('&')
      for (let i = 0; i < parts.length; i += 1) {
        const pair = parts[i]
        if (!pair) continue
        const eq = pair.indexOf('=')
        const key = decode(eq < 0 ? pair : pair.slice(0, eq))
        if (key) out[key] = decode(eq < 0 ? '' : pair.slice(eq + 1))
      }
      return out
    }

    // Route guard for the data routes. `/dsh-sidebar-frog/*` is mounted on the
    // raw web server, which knows nothing about sessions, so without this every
    // process on the machine (and, on an all-interfaces bind, every device on
    // the network) can read the workspace through /content and /media —
    // verified: they answered 200 with no credentials while DSH's own /api
    // answered 401.
    //
    // Connection exposes exactly the right hook: `requestRejection` applies the
    // same Host/Origin trust fence and the same authority-bound browser cookie
    // check it uses for /api, without moving the route. The popout tab and the
    // sidebar both call these routes from the authenticated origin, so they keep
    // working unchanged. The lookup is per request and tolerant: a missing (or
    // older) Connection service just skips the guard and the routes behave as
    // before, so this can never make the plugin unroutable.
    const rejectRequest = (req, res) => {
      let connection
      try { connection = ctx.get('connection') } catch (e) { connection = undefined }
      if (!connection || typeof connection.requestRejection !== 'function') return false
      let status
      try { status = connection.requestRejection({ headers: (req && req.headers) || {} }) } catch (e) { return false }
      if (!status) return false
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(status === 401 ? 'unauthorized' : 'forbidden')
      return true
    }

    // Bounded JSON body reader for the mutating routes (the revert route). The
    // handler owns a raw IncomingMessage, so a hostile caller could otherwise
    // make the host buffer an unbounded payload: 64 KB is far more than the
    // {path, opId} pair needs, and anything larger is refused outright.
    //
    // The SAVE route is the one caller that needs more, because its body carries
    // the file's text: it passes its own ceiling, derived from SAVE_TEXT_MAX plus
    // room for JSON escaping. The cap is per route on purpose — raising it for
    // every mutating route would let a `{path, opId}` request buffer megabytes
    // for nothing.
    const BODY_MAX_BYTES = 65536
    const readJsonBody = (req, maxBytes) => new Promise((resolve, reject) => {
      const cap = typeof maxBytes === 'number' && maxBytes > 0 ? maxBytes : BODY_MAX_BYTES
      const chunks = []
      let size = 0
      let settled = false
      const fail = (err) => {
        if (settled) return
        settled = true
        reject(err)
      }
      req.on('data', (chunk) => {
        if (settled) return
        size += chunk.length
        if (size > cap) {
          fail(new Error('body too large'))
          try { req.destroy() } catch (e) {}
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (settled) return
        settled = true
        const text = Buffer.concat(chunks).toString('utf8')
        if (!text) { resolve({}); return }
        try { resolve(JSON.parse(text)) } catch (e) { reject(new Error('invalid JSON body')) }
      })
      req.on('error', (e) => fail(e))
    })

    const snapshot = () => artifacts.slice().sort((a, b) => b.seq - a.seq).map(publicEntry)

    // `change` (optional) is one captured edit snapshot — see captureFileChange.
    // It carries the opId, so a path touched twice in one execution (or seen by
    // both event handlers) still yields exactly one history entry.
    const recordFile = (path, kind, sessionId, diff, change) => {
      seq += 1
      const at = Date.now()
      const existing = artifacts.find((a) => a.path === path)
      let entry
      if (existing) {
        existing.kind = kind
        existing.sessionId = sessionId
        existing.at = at
        existing.seq = seq
        existing.type = extType(path)
        if (diff) existing.diff = diff
        entry = existing
      } else {
        entry = { id: 'a' + seq, path: path, kind: kind, type: extType(path), sessionId: sessionId, at: at, seq: seq }
        if (diff) entry.diff = diff
        artifacts.push(entry)
        if (artifacts.length > 1000) {
          // Dropping the oldest rows must drop the memory they were holding,
          // otherwise a long session's snapshots outlive their artifacts.
          const dropped = artifacts.slice(0, artifacts.length - 1000)
          for (const old of dropped) {
            if (old.history) for (const h of old.history) historyChars -= changeSize(h)
            if (historyChars < 0) historyChars = 0
          }
          artifacts = artifacts.slice(-1000)
        }
      }
      if (change) {
        change.seq = seq
        change.at = at
        pushHistory(entry, change)
      }
      return entry
    }

    // The session a tool execution belongs to (used to root reverts at the same
    // workspace the change came from).
    const sessionIdOf = (exec) => {
      try {
        const agent = exec && exec.agent
        if (agent && agent.session && agent.session.id != null) return String(agent.session.id)
      } catch (e) {}
      return undefined
    }

    // One op id per tool execution: tools/execute (content) and tools/result
    // (arguments) both fire for one write, and this is what keeps them from
    // recording the same change twice.
    const opIds = new WeakMap()
    let opSeq = 0
    const opIdOf = (exec) => {
      let id = opIds.get(exec)
      if (!id) {
        opSeq += 1
        id = 'op' + opSeq
        opIds.set(exec, id)
      }
      return id
    }

    // A change is only revertible when both sides were kept whole: an oversized
    // snapshot is dropped rather than truncated, because writing a truncated
    // "before" back would corrupt the file.
    //
    // `by` records WHO made the change ('user' for a save from the panel, empty
    // for the agent). The two go into one history on purpose — 撤销 walks
    // backwards through the file's actual revisions, and which of them came from
    // a person is a label on the row, not a different mechanism.
    const snapshotOf = (opId, before, after, afterVersion, by) => {
      const fits = (s) => s === null || (typeof s === 'string' && s.length <= HISTORY_TEXT_MAX)
      const truncated = !fits(before) || !fits(after)
      const change = {
        opId: opId,
        before: truncated ? null : before,
        after: truncated ? null : after,
        afterVersion: typeof afterVersion === 'string' ? afterVersion : null,
        truncated: truncated,
      }
      if (by) change.by = by
      return change
    }

    const snapshotChange = (exec, before, after, afterVersion) => snapshotOf(opIdOf(exec), before, after, afterVersion, '')

    const diffPayload = (before, after) => {
      const b = before === null || before === undefined ? '' : String(before)
      const a = String(after == null ? '' : after)
      if (b === a) return undefined
      const cut = b.length > 8000 || a.length > 8000
      const out = { before: clipPlain(b, 8000), after: clipPlain(a, 8000) }
      if (cut) out.truncated = true
      return out
    }

    // Read one file change off a live execution value. This is the only place
    // the previous content still exists, which is what makes reverting an
    // overwrite possible at all — and the reason the artifact ledger can label a
    // write as create or update from the filesystem's own answer instead of
    // guessing from the tool name.
    const captureFileChange = (exec, outcome) => {
      const value = outcome && outcome.value
      if (!value || typeof value !== 'object') return
      const path = typeof value.path === 'string' ? value.path : ''
      if (!path) return
      const rawBefore = value.before
      if (rawBefore !== null && typeof rawBefore !== 'string') return
      const before = rawBefore
      const after = typeof value.after === 'string' ? value.after : ''
      const created = value.operation === 'create' || before === null
      recordFile(path, created ? 'create' : 'edit', sessionIdOf(exec), diffPayload(before, after), snapshotChange(exec, before, after, value.version))
    }


    // Resolve the workspace root for a specific tool execution: the agent's
    // session cwd wins, then the last-seen cwd, then the sandbox root.
    const execCwd = (exec) => {
      try {
        const agent = exec && exec.agent
        const c = agent && agent.session && agent.session.header && typeof agent.session.header.cwd === 'string' ? agent.session.header.cwd : ''
        if (c) return c
      } catch (e) {}
      if (typeof lastCwd === 'string' && lastCwd) return lastCwd
      try {
        const policy = ctx.get('sandboxPolicy')
        return policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
      } catch (e) {}
      return undefined
    }

    // Recursively walk the workspace into a `path -> fingerprint` map. The
    // fingerprint is the fs backend's opaque version token (dev:ino:size:
    // mtime:ctime on the local backend), so any content/metadata change changes
    // the value. Returns null when the filesystem or root is unavailable.
    const snapshotWorkspace = async (cwd) => {
      const fs = ctx.get('fs')
      if (!fs || typeof fs.listDir !== 'function' || typeof fs.resolve !== 'function') return null
      if (typeof cwd !== 'string' || !cwd) return null
      const childPath = (target, parent, name) => (typeof fs.processPath === 'function' ? fs.processPath(target) : parent.replace(/\/+$/, '') + '/' + name)
      const map = new Map()
      let count = 0
      const walk = async (dirPath, depth) => {
        if (count >= SNAPSHOT_MAX_FILES || depth > SNAPSHOT_MAX_DEPTH) return
        let entries
        try {
          const target = await fs.resolve(dirPath)
          entries = await fs.listDir(target)
        } catch (e) {
          return // unreadable directory — skip it, never fatal
        }
        if (!entries) return
        for (const e of entries) {
          if (count >= SNAPSHOT_MAX_FILES) return
          if (e.type === 'directory') {
            if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
            await walk(childPath(e.target, dirPath, e.name), depth + 1)
          } else if (e.type === 'file') {
            count += 1
            map.set(childPath(e.target, dirPath, e.name), e.version !== undefined ? String(e.version) : 'size:' + (e.size ?? ''))
          }
        }
      }
      await walk(cwd, 0)
      return map
    }

    // New or changed files between two snapshots (deletions are irrelevant to
    // an artifact list).
    const diffSnapshot = (before, after) => {
      const changes = []
      for (const [path, fp] of after) {
        const prev = before.get(path)
        if (prev === undefined) changes.push({ path, kind: 'create' })
        else if (prev !== fp) changes.push({ path, kind: 'edit' })
      }
      return changes
    }

    const recordSnapshotDiff = (before, after, exec) => {
      let sessionId
      try {
        const agent = exec && exec.agent
        if (agent && agent.session && agent.session.id != null) sessionId = String(agent.session.id)
      } catch (e) {}
      const changes = diffSnapshot(before, after)
      for (const ch of changes) {
        try { recordFile(ch.path, ch.kind, sessionId, undefined) } catch (e) {}
      }
    }

    ctx.on('tools/result', (exec, result) => {
      try {
        if (!exec || !result || result.isError === true) return
        // Capture the session working directory on ANY successful tool result,
        // so the file tree roots at the real workspace (not the process cwd).
        const agent = exec.agent
        if (agent && agent.session && agent.session.header && typeof agent.session.header.cwd === 'string' && agent.session.header.cwd) {
          lastCwd = agent.session.header.cwd
        }
        const name = exec.name
        if (name !== 'write' && name !== 'edit') return
        const args = exec.arguments
        const path = args && typeof args.file_path === 'string' ? args.file_path : ''
        if (!path) return
        // The tools/execute handler below already recorded this change from the
        // live execution value, which carries the full before/after text and the
        // real create-vs-update answer. Only fall back here when that value was
        // unavailable (an older DSH build, or a result arriving outside the
        // execution wrapper).
        if (opIds.has(exec)) return
        let diff
        if (name === 'edit') {
          const oldString = args && typeof args.old_string === 'string' ? args.old_string : ''
          const newString = args && typeof args.new_string === 'string' ? args.new_string : ''
          if (oldString !== '' && oldString !== newString) {
            diff = { before: clipPlain(oldString, 8000), after: clipPlain(newString, 8000) }
          }
        }
        // Without the execution value the operation is unknowable. Claim "edit"
        // for a path already in the ledger and "create" only for a new one: a
        // wrong "create" used to make every overwrite look like a new file, and
        // an undo driven by that label would delete the user's own file.
        const known = artifacts.some((a) => a.path === path)
        recordFile(path, known ? 'edit' : 'create', sessionIdOf(exec), diff)
      } catch (e) {
        console.error('[artifacts] track failed', e)
      }
    })

    // Fill the gap the `tools/result` whitelist leaves open: `bash`/`pwsh` write
    // files as a side effect of the shell command, never through a `write`/`edit`
    // result. Snapshot the workspace before and after the body and record the
    // new/changed files. `tools/execute` is the around-dispatch wrapper, so
    // `next()` runs the body — the "before" is taken pre-body, "after" post-body.
    //
    // The same wrapper is where a `write`/`edit` change is captured: the value it
    // resolves to carries the file's PREVIOUS content, which the durable event
    // log deliberately omits. Reading it here costs no extra I/O and is what
    // makes 撤销 possible for an overwrite.
    ctx.on('tools/execute', async (exec, next) => {
      if (!exec) return next()
      if (exec.name === 'write' || exec.name === 'edit') {
        const outcome = await next()
        try { captureFileChange(exec, outcome) } catch (e) { console.error('[artifacts] capture failed', e) }
        return outcome
      }
      if (!WATCH_TOOLS[exec.name]) return next()
      const cwd = execCwd(exec)
      const before = await snapshotWorkspace(cwd)
      let outcome
      try {
        outcome = await next()
        return outcome
      } finally {
        if (before && outcome && outcome.isError !== true) {
          try {
            const after = await snapshotWorkspace(cwd)
            if (after) recordSnapshotDiff(before, after, exec)
          } catch (e) {
            console.error('[artifacts] snapshot diff failed', e)
          }
        }
      }
    })

    // Types whose bytes are NOT text: a media URL or a card is what the client
    // shows, so there is nothing to decode. Keeping this list here (rather than
    // in the view) is what makes the wire honest — .docx and .xlsx are ZIP
    // archives, and reading one as UTF-8 shipped 200 kB of mojibake.
    const BINARY_TYPES = { image: 1, pdf: 1, audio: 1, video: 1, office: 1, document: 1 }

    // ── The two ceilings, declared together because they are two questions ───
    // A file meets both, in this order, and conflating them is what made the
    // popout show two thirds of a document:
    //
    //   · PREVIEW_TEXT_MAX — what the wire will carry and the DOM will render.
    //     This is a browser-survival bound, NOT a document policy: nothing real
    //     is anywhere near it, and a file that trips it is one whose rendering
    //     would take the tab down anyway. It is deliberately loose (40× the
    //     200000 it replaced), because the popout is the window a person opens
    //     precisely when they want to read the whole file.
    //   · SAVE_TEXT_MAX — what a save may write back, and therefore the largest
    //     document the 编辑 pane may offer to open. An editor built on a prefix
    //     would TRUNCATE the file on save, so this is the one that must stay a
    //     real limit. `readFile` reports it as `editable`; `saveFile` enforces it
    //     independently (never trust the client's reading of the rule).
    const PREVIEW_TEXT_MAX = 8 * 1024 * 1024
    const SAVE_TEXT_MAX = 4 * 1024 * 1024

    const readFile = async (path, opts) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      try {
        const policy = ctx.get('sandboxPolicy')
        const cwd = policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
        const target = await fs.resolve(path, cwd ? { cwd: cwd } : undefined)
        const info = await fs.stat(target)
        if (!info || info.type !== 'file') return { ok: false, error: 'not a readable file' }
        const type = extType(path)
        // The revision this read observed, on the wire. The 编辑 mode sends it
        // back on save as `baseVersion`, which is what turns "somebody changed
        // this while you were typing" into a refusal instead of a silent
        // overwrite (see saveFile). A null token means the backend has none —
        // the size check still guards the save.
        const version = info.version !== undefined ? String(info.version) : null
        // `forceText` is a person explicitly asking for the bytes as text — the
        // 「以纯文本查看」escape hatch on a binary document's card. It is the only
        // way past this rule, and it is a request rather than the default path.
        const forceText = !!(opts && opts.forceText)
        if (BINARY_TYPES[type] && !forceText) return { ok: true, type: type, content: '', truncated: false, size: info.size, version: version }
        const text = await fs.readText(target)
        // ── What arrives on the wire, and what that costs the reader ─────────
        // This used to be a flat `text.slice(0, 200000)` — one number doing two
        // jobs, and it did the wrong one for both:
        //
        //   · 预览. The popout exists to show a file COMPLETE: it is the window
        //     you open when the panel is too narrow to read from. A 403 kB
        //     student textbook (77% of it three inline base64 images) was cut at
        //     character 200000 — mid-way through the base64 of the third one —
        //     so the page ended at an unrenderable `<image>` and the rest of the
        //     book simply was not there, with nothing on screen saying so. The
        //     shell's OWN document preview (the sidebar's default path) pages by
        //     lines and accumulates until eof, i.e. it has no total limit at all;
        //     the popout is now consistent with it rather than 400× stricter.
        //   · 编辑. The cap was doing honest work here: an editor holding a
        //     PREFIX would truncate the file on save. But that is the SAVE
        //     path's own ceiling (SAVE_TEXT_MAX, below), and it is what decides
        //     `editable` now — the preview limit and the edit limit are no longer
        //     the same question, and a file too big to save is refused as
        //     un-editable instead of being shown to nobody.
        //
        // The ceiling that remains is a browser-survival bound, not a document
        // policy: past it the DOM, not the wire, is what fails. `chars` rides
        // along so the client can say how much of the file it is showing — the
        // cut must never be silent, which is the actual bug this replaced.
        const truncated = text.length > PREVIEW_TEXT_MAX
        return {
          ok: true,
          type: type,
          content: truncated ? text.slice(0, PREVIEW_TEXT_MAX) : text,
          truncated: truncated,
          // Exactly when a save of what the browser holds can succeed. Named
          // separately from `truncated` on purpose: they are the same value today
          // for a small file and different answers the moment a file is bigger
          // than the save ceiling but small enough to read.
          editable: !truncated && text.length <= SAVE_TEXT_MAX,
          chars: text.length,
          size: info.size,
          version: version,
        }
      } catch (e) {
        // A file that is not UTF-8 throws out of the read rather than coming back
        // as replacement characters: the filesystem service decodes strictly
        // (TextDecoder with fatal:true), so the reader ends up looking at
        // "The encoded data was not valid for encoding utf-8" — a sentence about
        // an encoding they never chose, and nothing about the file they opened.
        // Chinese workspaces still hold plenty of GBK/GB18030 documents, so name
        // the likely cause instead of forwarding the codec's complaint.
        const msg = e && e.message ? String(e.message) : ''
        if (/not valid for encoding|invalid.*utf-?8|encoded data/i.test(msg)) {
          return { ok: false, error: 'not valid UTF-8 — this file is probably GBK/GB18030 or another legacy encoding, and the preview cannot decode it (the bytes are left alone)' }
        }
        return { ok: false, error: msg || 'read failed' }
      }
    }

    // Remove a single tracked artifact entry (metadata only — never touches the
    // file on disk).
    const removeFile = (path) => {
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      const idx = artifacts.findIndex((a) => a.path === path)
      if (idx < 0) return { ok: false, error: 'not found' }
      const gone = artifacts[idx]
      if (gone.history) for (const h of gone.history) historyChars -= changeSize(h)
      if (historyChars < 0) historyChars = 0
      artifacts.splice(idx, 1)
      return { ok: true }
    }

    // Restore the line endings the file itself used. The stored snapshot is
    // LF-normalized (that is the diff basis the filesystem service hands over),
    // so writing it back verbatim into a CRLF file would silently rewrite every
    // line of a file the user only wanted one edit undone from.
    const restoreNewlines = (current, text) => {
      if (current.indexOf('\r\n') < 0) return text
      return text.replace(/\r?\n/g, '\r\n')
    }

    // Put one captured change back: the newest by default, or a named opId.
    // Refuses rather than guesses when the file moved on — the version token the
    // filesystem returned for the write is the guard, so a revert can never
    // clobber an edit the agent made afterwards.
    const revertFile = async (path, opId) => {
      if (typeof path !== 'string' || !path) return { ok: false, error: 'missing path' }
      const entry = artifacts.find((a) => a.path === path)
      if (!entry) return { ok: false, error: 'not found' }
      const list = entry.history || []
      if (!list.length) return { ok: false, error: '这条产物没有可撤销的改动' }
      const idx = opId ? list.findIndex((h) => h.opId === opId) : list.length - 1
      if (idx < 0) return { ok: false, error: '该改动已不在历史中' }
      const change = list[idx]
      if (change.truncated) return { ok: false, error: '改动过大，未保存完整快照，无法撤销' }
      const fs = ctx.get('fs')
      if (!fs || typeof fs.resolve !== 'function') return { ok: false, error: 'filesystem unavailable' }
      let cwd
      try { cwd = await resolveCwd(entry.sessionId) } catch (e) { cwd = undefined }
      let target
      try {
        target = await fs.resolve(path, cwd ? { cwd: cwd } : undefined)
      } catch (e) {
        return { ok: false, error: '无法解析该路径：' + (e && e.message ? String(e.message) : 'resolve failed') }
      }

      if (change.before === null) {
        // The agent CREATED this file (or its previous content was not kept).
        // Undoing a create means deleting the file, and the filesystem service
        // exposes no delete: say so instead of leaving an empty file behind that
        // looks like a successful undo.
        return { ok: false, error: '宿主未提供删除接口，无法撤销新建的文件（可手动删除）' }
      }

      let info
      try { info = await fs.stat(target) } catch (e) { info = undefined }
      if (!info || info.type !== 'file') return { ok: false, error: '文件已不存在，无法撤销' }
      const currentVersion = info.version !== undefined ? String(info.version) : null
      if (change.afterVersion && currentVersion && currentVersion !== String(change.afterVersion)) {
        return { ok: false, error: '文件在此之后又被改动过，已中止撤销（先确认内容再重试）' }
      }
      let current = ''
      try { current = await fs.readText(target) } catch (e) { current = '' }
      const text = restoreNewlines(current, change.before)
      const intent = currentVersion ? { kind: 'replaceIfVersion', version: info.version } : undefined
      try {
        await fs.writeText(target, text, intent)
      } catch (e) {
        const msg = e && e.message ? String(e.message) : 'write failed'
        return { ok: false, error: msg.indexOf('FS_STALE_VERSION') >= 0 ? '文件已被再次修改，撤销已取消' : '写入失败：' + msg }
      }
      // Undo walks backwards: the reverted change and everything recorded after
      // it describe content that is no longer on disk.
      while (list.length > idx) dropChange(list, list.length - 1)
      // The row stays in the ledger — the agent did touch this file, and the next
      // tool run refreshes it. Only the undo affordance disappears.
      entry.seq = ++seq
      entry.at = Date.now()
      return { ok: true, path: path, opId: change.opId, reverted: 'content' }
    }

    // ── Save: the panel writing a file back ─────────────────────────────────
    // The first operation in this plugin that changes the workspace on a
    // person's behalf. (撤销 only puts back a snapshot somebody else's write
    // produced.) Three guards carry it, and each is a fact about the host rather
    // than a convention the client is trusted to respect:
    //
    //   · CONTAINMENT. `readFile` resolves any path the fs service accepts, and
    //     that is fine for a read. A WRITE must not: the route is reachable from
    //     the authenticated browser, so `..`, an absolute path or a symlink
    //     would otherwise let a page write anywhere this process can. The
    //     resolved target must live under the session's workspace root —
    //     `pathUnder`, the same helper the Git view uses for the same reason.
    //   · CAS. The revision the editor was opened on comes back as
    //     `baseVersion`/`baseSize` and the write itself is guarded by
    //     `replaceIfVersion`, so a save can never silently clobber a change the
    //     agent (or another window) made in between: it is refused with
    //     FS_STALE_VERSION and the client offers 重新载入 / 覆盖. The guard is
    //     the version we just read, so even 覆盖 stays atomic.
    //   · BYTE FIDELITY. Two things the browser cannot preserve are put back
    //     here, both of them cases where saving one paragraph would otherwise
    //     rewrite the whole file: the line-ending style (CodeMirror normalizes
    //     edits to LF — and an HTML `<textarea>` does too) and a UTF-8 BOM
    //     (decoded away by `readText`; the fs contract is "byte-for-byte, no
    //     normalization", so what is missing is the BOM itself). The write
    //     service preserves the file's mode.
    //
    // SAVE_TEXT_MAX is declared with PREVIEW_TEXT_MAX, above `readFile`, because
    // the two only make sense read together: the preview ceiling decides what you
    // may SEE, this one decides what you may WRITE. The client hides the editor
    // wherever the host said `editable: false`; this refuses such a save
    // independently.
    // What the SAVE route lets the request body reach: the text ceiling plus
    // JSON escaping headroom (a control character or a quote becomes two or six
    // bytes on the wire). The real limit is still the TEXT one above — this only
    // bounds what the host will buffer before it parses.
    const SAVE_BODY_MAX = 12 * 1024 * 1024
    let userSaveSeq = 0

    const saveFile = async (path, content, opts) => {
      if (typeof path !== 'string' || !path) return { ok: false, error: '缺少路径' }
      if (typeof content !== 'string') return { ok: false, error: '缺少内容' }
      if (content.length > SAVE_TEXT_MAX) {
        return { ok: false, error: '内容过大（上限 ' + (SAVE_TEXT_MAX / 1024 / 1024) + ' MB），未保存' }
      }
      const fs = ctx.get('fs')
      if (!fs || typeof fs.writeText !== 'function') return { ok: false, error: '宿主未提供写入接口' }
      let cwd
      try { cwd = await resolveCwd(opts && opts.sessionId) } catch (e) { cwd = undefined }
      if (!cwd) return { ok: false, error: '工作区不可用，未保存' }
      let target
      try {
        target = await fs.resolve(path, { cwd: cwd })
      } catch (e) {
        return { ok: false, error: '无法解析该路径：' + (e && e.message ? String(e.message) : 'resolve failed') }
      }
      // Canonical spelling from the service (`processPath`), so the fence sees
      // the real location: separators, case and symlink targets folded the way
      // the workspace root is.
      const abs = typeof fs.processPath === 'function' ? fs.processPath(target) : String(target)
      if (!pathUnder(abs, cwd)) return { ok: false, error: '该文件在工作区之外，面板不发写操作' }
      let info
      try { info = await fs.stat(target) } catch (e) { info = undefined }
      if (!info || info.type !== 'file') return { ok: false, error: '文件已不存在，未保存' }
      const currentVersion = info.version !== undefined ? String(info.version) : null
      const currentSize = typeof info.size === 'number' && isFinite(info.size) ? info.size : null
      const force = !!(opts && opts.force)
      // The caller says which revision it edited. A mismatch is "somebody else
      // changed this while you were typing" — a refusal with a reason, not a
      // best-effort merge.
      if (!force) {
        if (opts && opts.baseVersion && currentVersion && String(opts.baseVersion) !== currentVersion) {
          return { ok: false, stale: true, error: '文件在编辑期间被改动过', version: currentVersion, size: currentSize }
        }
        if (opts && opts.baseSize && currentSize !== null && Number(opts.baseSize) !== currentSize) {
          return { ok: false, stale: true, error: '文件大小已变化，可能在编辑期间被改动', version: currentVersion, size: currentSize }
        }
      }
      let current = ''
      try {
        current = await fs.readText(target)
      } catch (e) {
        return { ok: false, error: '无法读取当前内容：' + (e && e.message ? String(e.message) : 'read failed') }
      }
      // A UTF-8 BOM is dropped by `readText` (TextDecoder's default strips it),
      // so ask the bytes: three bytes at offset 0 is the whole test, and it is
      // one small ranged read rather than a second full copy of the file.
      let bom = false
      try {
        if (typeof fs.readByteRange === 'function') {
          const head = await fs.readByteRange(target, { offset: 0, length: 3 })
          bom = !!(head && head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf)
        }
      } catch (e) { bom = false }
      const eol = current.indexOf('\r\n') >= 0 ? 'CRLF' : 'LF'
      const text = (bom ? '\uFEFF' : '') + restoreNewlines(current, content)
      const intent = currentVersion ? { kind: 'replaceIfVersion', version: info.version } : undefined
      let outcome
      try {
        outcome = await fs.writeText(target, text, intent)
      } catch (e) {
        const msg = e && e.message ? String(e.message) : 'write failed'
        if (msg.indexOf('FS_STALE_VERSION') >= 0) {
          return { ok: false, stale: true, error: '文件已被再次修改，保存已取消', version: currentVersion, size: currentSize }
        }
        return { ok: false, error: '写入失败：' + msg }
      }
      const newVersion = outcome && outcome.version !== undefined ? String(outcome.version) : currentVersion
      // The ledger records the save exactly like an agent edit — that is what
      // makes 撤销 cover it too: the newest revision of this path is now YOURS.
      // Both sides go in LF-normalized, the diff basis every other snapshot in
      // this ledger uses.
      const normBefore = current.replace(/\r\n/g, '\n')
      const normAfter = content.replace(/\r\n/g, '\n')
      const diff = diffPayload(normBefore, normAfter)
      userSaveSeq += 1
      try {
        const change = snapshotOf('user' + userSaveSeq, normBefore, normAfter, newVersion, 'user')
        recordFile(path, 'edit', opts && opts.sessionId ? String(opts.sessionId) : undefined, diff, change)
      } catch (e) {
        // The file IS saved; a ledger failure must not report a failed save.
        console.error('[artifacts] save not recorded', e)
      }
      return {
        ok: true, path: path, version: newVersion,
        size: Buffer.byteLength(text, 'utf8'),
        eol: eol, bom: bom,
        revision: userSaveSeq,
      }
    }


    // Resolve the authoritative working directory for a session (the real
    // workspace). The client passes its current session id; we look it up in the
    // live session store so the tree roots correctly even before any tool runs.
    const sessionCwd = (sessionId) => {
      try {
        const sessions = ctx.get('sessions')
        if (sessions && typeof sessions.get === 'function' && typeof sessionId === 'string' && sessionId) {
          const s = sessions.get(sessionId)
          const c = s && s.header && typeof s.header.cwd === 'string' && s.header.cwd ? s.header.cwd : undefined
          if (c) return c
        }
      } catch (e) {}
      return undefined
    }

    // When the client does not supply a session id (the standalone tab is a
    // separate page with no client store), pick the most recently created live
    // session's working directory.
    const defaultSessionCwd = async () => {
      try {
        const sessions = ctx.get('sessions')
        if (!sessions || typeof sessions.list !== 'function') return undefined
        const live = sessions.list()
        const cands = []
        for (let i = 0; i < live.length; i += 1) {
          const s = live[i]
          const c = s && s.header && typeof s.header.cwd === 'string' && s.header.cwd ? s.header.cwd : undefined
          const at = s && s.header && typeof s.header.createdAt === 'number' ? s.header.createdAt : 0
          if (c) cands.push({ cwd: c, at: at })
        }
        cands.sort((a, b) => b.at - a.at)
        const fs = ctx.get('fs')
        for (let i = 0; i < cands.length; i += 1) {
          const c = cands[i].cwd
          if (!fs || typeof fs.stat !== 'function' || typeof fs.resolve !== 'function') return c
          try {
            const target = await fs.resolve(c)
            const info = await fs.stat(target)
            if (info && info.type === 'directory') return c
          } catch (e) {
            // Directory missing (e.g. the workspace was renamed or deleted);
            // skip this stale candidate and fall through to the next one.
          }
        }
      } catch (e) {}
      return undefined
    }

    // Resolve the workspace root for a list request. A named session must
    // resolve to ITS OWN workspace: a freshly switched-to workspace may not be
    // live in the server's session store yet, so we also consult the persisted
    // corpus (sessionQuery) — and never substitute an unrelated "most recent"
    // workspace when the caller named a session. Only an unnamed request (the
    // standalone tab's first load, before its localStorage syncs) falls back to
    // a best-effort default.
    const resolveCwd = async (sessionId) => {
      const live = sessionCwd(sessionId)
      if (live) return live
      if (typeof sessionId === 'string' && sessionId) {
        try {
          const query = ctx.get('sessionQuery')
          if (query && typeof query.listSessions === 'function') {
            const records = await query.listSessions()
            if (records) {
              for (const rec of records) {
                const h = rec && rec.header
                if (h && h.id === sessionId && typeof h.cwd === 'string' && h.cwd) return h.cwd
              }
            }
          }
        } catch (e) {}
        return undefined // named but unresolvable — never substitute another workspace
      }
      const def = await defaultSessionCwd()
      if (def) return def
      if (typeof lastCwd === 'string' && lastCwd) return lastCwd
      try {
        const policy = ctx.get('sandboxPolicy')
        return policy && typeof policy.workspaceRoot === 'string' ? policy.workspaceRoot : undefined
      } catch (e) {}
      return undefined
    }

    // Delete a file or a folder the person asked for from the file tree.
    //
    // The filesystem service has NO delete: `fs` exposes readText / listDir /
    // writeText / editText and nothing that removes a path — which is exactly
    // why 撤销 of a created file is refused further down (revertFile), because
    // undoing a create means deleting a file the host cannot delete. This route
    // is the one place a deletion is INTENDED, so it reaches the host's own
    // node:fs directly. The plugin's host half runs inside the `dsh web` process
    // (a Node process), loaded once at startup through src/index.js's
    // `new Function(host.js)`, where a dynamic import of the built-in resolves —
    // that is verified, not assumed. (A dynamic `cordis_define` package runs in a
    // vm sandbox that traps `require` and has no node:fs; this is a static
    // bundle, so it never takes that path.) The import is cached once per
    // process so a repeated delete costs nothing.
    let nodeFsPromises = null
    const nodeFsMod = async () => {
      if (!nodeFsPromises) nodeFsPromises = await import('node:fs/promises')
      return nodeFsPromises
    }

    // Three guards carry it, each a fact about the host rather than a convention
    // the client is trusted to respect — the same shape saveFile's fence uses:
    //
    //   · CONTAINMENT. The path resolves against the session's workspace, and the
    //     resolved target must stay under it. The backend's own `contains`
    //     answers that (both targets are realpaths, so a symlink or a `..` that
    //     would escape is folded away before the test); a backend without it
    //     falls back to the string `pathUnder` on the canonical spellings.
    //   · ROOT. The workspace root itself is never a target: deleting it takes
    //     the WHOLE workspace. `contains` is true for the root (a place is under
    //     itself), so the root is refused explicitly. The tree's root row IS the
    //     workspace and cannot even be right-clicked for delete, but the route
    //     must not rely on the UI.
    //   · TYPE. What is deleted is what the tree showed — a regular file or a
    //     directory. `other` (a socket, a FIFO) is refused rather than unlinked.
    const deletePath = async (path, sessionId) => {
      if (typeof path !== 'string' || !path) return { ok: false, error: '缺少路径' }
      const fs = ctx.get('fs')
      if (!fs || typeof fs.resolve !== 'function' || typeof fs.processPath !== 'function') {
        return { ok: false, error: '宿主未提供文件系统接口' }
      }
      let cwd
      try { cwd = await resolveCwd(sessionId) } catch (e) { cwd = undefined }
      if (!cwd) return { ok: false, error: '工作区不可用，未删除' }
      // Resolve BOTH the target and the workspace root, so the fence compares
      // two canonical (realpath) spellings the backend handed us, not the
      // caller's text.
      let target
      let rootTarget
      try {
        target = await fs.resolve(path, { cwd: cwd })
        rootTarget = await fs.resolve(cwd, { cwd: cwd })
      } catch (e) {
        return { ok: false, error: '无法解析该路径：' + (e && e.message ? String(e.message) : 'resolve failed') }
      }
      let outside = false
      let isRoot = false
      if (typeof fs.contains === 'function') {
        outside = !fs.contains(rootTarget, target)
        isRoot = String(fs.processPath(rootTarget)) === String(fs.processPath(target))
      } else {
        // A backend without `contains`: the string fence on the canonical
        // spellings. processPath folds separators and (on a local backend) case.
        const abs = fs.processPath(target)
        const root = fs.processPath(rootTarget)
        outside = !pathUnder(abs, root)
        isRoot = abs === root
      }
      if (outside) return { ok: false, error: '该路径在工作区之外，不能删除' }
      if (isRoot) return { ok: false, error: '不能删除工作区根目录' }
      let info
      try { info = await fs.stat(target) } catch (e) { info = undefined }
      if (!info) return { ok: false, error: '文件已不存在' }
      if (info.type !== 'file' && info.type !== 'directory') {
        return { ok: false, error: '只能删除文件或文件夹' }
      }
      const isDir = info.type === 'directory'
      // A directory is removed recursively (the person right-clicked the folder,
      // so everything under it goes); a file is a plain remove. `force` makes a
      // path that vanished between the stat and the rm a clean "gone" rather
      // than a crash.
      let out
      try {
        const nodeFs = await nodeFsMod()
        await nodeFs.rm(fs.processPath(target), { recursive: isDir, force: true })
        out = { ok: true, kind: isDir ? 'directory' : 'file' }
      } catch (e) {
        const code = e && e.code
        if (code === 'ENOENT') return { ok: false, error: '文件已不存在' }
        if (code === 'EPERM' || code === 'EACCES') {
          return { ok: false, error: '没有删除权限（文件可能正被另一个程序占用）' }
        }
        return { ok: false, error: e && e.message ? String(e.message) : '删除失败' }
      }
      // The ledger's change letters (A/M) and any in-memory record point at a
      // path that no longer exists; dropping them keeps the 产物 list from
      // advertising a file the tree no longer shows. This is a best-effort
      // cleanup, not the deletion itself.
      for (let i = artifacts.length - 1; i >= 0; i -= 1) {
        const a = artifacts[i]
        if (!a || !a.path) continue
        if (a.path === path || pathUnder(a.path, path)) {
          if (a.history) for (const h of a.history) historyChars -= changeSize(h)
          if (historyChars < 0) historyChars = 0
          artifacts.splice(i, 1)
        }
      }
      return out
    }

    // List one directory level for the file-tree (文件树) view: directories
    // first, then files, case-insensitive name order.
    const listDir = async (path, sessionId) => {
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      try {
        const cwd = await resolveCwd(sessionId)
        let p = path
        if (typeof p !== 'string' || !p) {
          if (!cwd) return { ok: false, error: 'workspace unavailable' }
          p = cwd
        }
        const target = await fs.resolve(p, cwd ? { cwd: cwd } : undefined)
        const entries = await fs.listDir(target)
        const rows = entries
          .map((e) => ({
            name: e.name,
            path: typeof fs.processPath === 'function' ? fs.processPath(e.target) : p.replace(/\/+$/, '') + '/' + e.name,
            isDir: e.type === 'directory',
            hidden: e.name.startsWith('.'),
          }))
          .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : (a.isDir ? -1 : 1)))
        // Answer with the RESOLVED spelling of this level, not the caller's own
        // text. The client keys its cache and its remembered expansion on these
        // strings and tests containment between them, so a root echoed back as
        // typed ("D:/ws", or a lower-case drive letter) while every entry below
        // it is a realpath ("D:\ws\src") made every one of those tests fail —
        // the tree painted fine and then forgot where it had been. Both trees
        // now get one spelling. Only ever used as a key: `resolve` still accepts
        // whatever absolute form the client sends back.
        const self = typeof fs.processPath === 'function' ? fs.processPath(target) : p
        return { ok: true, path: self, entries: rows }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'list failed' }
      }
    }

    // Bounded recursive name search for the file tree's filter box. Breadth
    // first (shallow matches first), skipping the same heavy directories the
    // workspace snapshot skips, with hard caps on visited entries, depth and
    // results so a huge workspace can never turn this into a stall.
    const SEARCH_MAX_VISITED = 20000
    const SEARCH_MAX_DEPTH = 8
    const SEARCH_MAX_RESULTS = 200
    const searchFiles = async (query, sessionId, limit) => {
      const fs = ctx.get('fs')
      if (!fs || typeof fs.listDir !== 'function' || typeof fs.resolve !== 'function') {
        return { ok: false, error: 'filesystem unavailable' }
      }
      const q = String(query == null ? '' : query).trim().toLowerCase()
      if (!q) return { ok: true, results: [], truncated: false }
      const max = Math.max(1, Math.min(SEARCH_MAX_RESULTS, Number(limit) || SEARCH_MAX_RESULTS))
      try {
        const cwd = await resolveCwd(sessionId)
        if (!cwd) return { ok: false, error: 'workspace unavailable' }
        const childPath = (target, parent, name) => (typeof fs.processPath === 'function' ? fs.processPath(target) : parent.replace(/\/+$/, '') + '/' + name)
        const results = []
        let visited = 0
        let truncated = false
        let queue = [{ dir: cwd, depth: 0 }]
        while (queue.length && results.length < max && visited < SEARCH_MAX_VISITED) {
          const deeper = []
          for (const item of queue) {
            if (results.length >= max || visited >= SEARCH_MAX_VISITED) { truncated = true; break }
            let entries
            try {
              const target = await fs.resolve(item.dir)
              entries = await fs.listDir(target)
            } catch (e) { continue }
            if (!entries) continue
            for (const e of entries) {
              visited += 1
              if (visited > SEARCH_MAX_VISITED) { truncated = true; break }
              const isDir = e.type === 'directory'
              const p = childPath(e.target, item.dir, e.name)
              if (e.name.toLowerCase().indexOf(q) >= 0) {
                results.push({ name: e.name, path: p, isDir: isDir, hidden: e.name.startsWith('.') })
                if (results.length >= max) { truncated = true; break }
              }
              if (isDir && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name) && item.depth < SEARCH_MAX_DEPTH) {
                deeper.push({ dir: p, depth: item.depth + 1 })
              }
            }
          }
          queue = deeper
        }
        return { ok: true, results: results, truncated: truncated }
      } catch (e) {
        return { ok: false, error: e && e.message ? String(e.message) : 'search failed' }
      }
    }

    // ── Git 只读切片（P1-9）───────────────────────────────────────────────
    // Everything here READS. There is no stage, commit, checkout, reset, stash,
    // clean or discard anywhere in this plugin, and there will not be: the panel
    // already offers exactly one write (撤销 one artifact's last change, with a
    // version guard), and a repository-wide write is the operation that can
    // destroy work with no undo. The view is a slice — branch, ahead/behind,
    // what changed, and one file's difference against HEAD.
    //
    // ── Why the product's own subprocess service ────────────────────────────
    // `ctx.subprocess` is the harness's managed-process seam: it resolves the
    // executable, owns the process range, and terminates the whole tree on a
    // timeout or an abort. Shelling out through node's child_process would mean
    // re-implementing that (and this bundle has no `require` to reach it with).
    // It is also the reason a hung git cannot wedge a route open: every call
    // carries an AbortController deadline, and the service enforces it.
    //
    // Capability-absent is a first-class answer: no subprocess service (or no
    // git on PATH) yields `repo: false` with a reason, and the view says which
    // one instead of rendering an empty panel that looks like a clean tree.
    const GIT_TIMEOUT_MS = 6000
    const GIT_OUT_MAX = 512 * 1024
    const GIT_FILE_MAX = 256 * 1024

    const subprocessService = () => {
      try {
        const sub = ctx.get('subprocess')
        return sub && typeof sub.spawn === 'function' && typeof sub.resolveExecutable === 'function' ? sub : null
      } catch (e) { return null }
    }

    // One git invocation. `argv` is a LITERAL vector built at the call site in
    // this file — never a string, never assembled from a request — and the
    // program is appended to a resolved executable path, so no shell exists
    // anywhere in this path. Every argv vector in this file is read-only:
    // rev-parse, status, rev-list, config --get, show.
    const gitRun = async (cwd, argv, maxBytes) => {
      const sub = subprocessService()
      if (!sub) return { ok: false, reason: 'no-subprocess', stdout: '', stderr: '', truncated: false }
      let exe
      try { exe = await sub.resolveExecutable('git') } catch (e) {
        return { ok: false, reason: 'no-git', stdout: '', stderr: '', truncated: false }
      }
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      let timer = null
      if (controller) timer = setTimeout(() => { try { controller.abort() } catch (e) {} }, GIT_TIMEOUT_MS)
      try {
        const handle = sub.spawn({
          argv: [exe].concat(argv),
          cwd: cwd,
          // stdout bounded (a status of a huge tree, or a blob, must not be read
          // without limit); stderr small, because its only job is to explain a
          // failure. No `inherit`: nothing may print into the server's console.
          stdio: { stdin: 'ignore', stdout: { maxBytes: Math.max(4096, maxBytes || GIT_OUT_MAX) }, stderr: { maxBytes: 8192 } },
          graceMs: 1500,
          signal: controller ? controller.signal : undefined,
          // Reading a local repository needs no credential, and git must never
          // sit on a credential prompt inside a request: GIT_TERMINAL_PROMPT=0
          // turns that into an immediate failure. Optional locks are off because
          // a background status refresh must not touch the user's index.lock.
          env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
        })
        const outcome = await handle.done
        const read = (name) => {
          try {
            const stream = handle.collected && handle.collected[name]
            const got = stream && typeof stream.readFrom === 'function' ? stream.readFrom(0) : null
            return { text: got && typeof got.text === 'string' ? got.text : '', truncated: !!(got && got.truncated) }
          } catch (e) { return { text: '', truncated: false } }
        }
        const out = read('stdout')
        const err = read('stderr')
        const code = outcome ? outcome.exitCode : null
        return { ok: code === 0, code: code, stdout: out.text, stderr: err.text, truncated: out.truncated, reason: '' }
      } catch (e) {
        return { ok: false, reason: 'error', error: e && e.message ? String(e.message) : 'git failed', stdout: '', stderr: '', truncated: false }
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    const gitSnapshot = async (sessionId) => {
      const at = Date.now()
      if (!subprocessService()) return { ok: true, repo: false, reason: 'no-subprocess', at: at }
      let cwd
      try { cwd = await resolveCwd(sessionId) } catch (e) { cwd = undefined }
      if (!cwd) return { ok: true, repo: false, reason: 'no-workspace', at: at }
      const inside = await gitRun(cwd, ['rev-parse', '--is-inside-work-tree'])
      if (!inside.ok) {
        const why = inside.reason === 'no-git' || inside.reason === 'no-subprocess' ? inside.reason : 'not-a-repo'
        return { ok: true, repo: false, reason: why, at: at, cwd: cwd }
      }
      // A bare repository has no worktree to show changes from.
      if (String(inside.stdout).trim() !== 'true') return { ok: true, repo: false, reason: 'bare', at: at, cwd: cwd }
      // One parallel batch: four independent reads, so the view costs one round
      // trip rather than four.
      const batch = await Promise.all([
        gitRun(cwd, ['rev-parse', '--show-toplevel']),
        gitRun(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
        gitRun(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
        gitRun(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
      ])
      const topR = batch[0]
      const branchR = batch[1]
      const statusR = batch[2]
      const upstreamR = batch[3]
      const root = topR.ok && String(topR.stdout).trim() ? String(topR.stdout).trim() : cwd
      const branch = branchR.ok ? String(branchR.stdout).trim() : ''
      const detached = !branch || branch === 'HEAD'
      const all = parsePorcelainZ(statusR.ok ? String(statusR.stdout) : '')
      const entries = all.slice(0, GIT_ENTRY_CAP)
      const upstream = upstreamR.ok ? String(upstreamR.stdout).trim() : ''
      let ahead = null
      let behind = null
      if (upstream) {
        // `--left-right --count A...HEAD` prints "<left>\t<right>": left is what
        // only the upstream has (we are BEHIND), right is what only HEAD has.
        const ab = await gitRun(cwd, ['rev-list', '--left-right', '--count', upstream + '...HEAD'])
        if (ab.ok) {
          const m = /^(\d+)\s+(\d+)/.exec(String(ab.stdout).trim())
          if (m) { behind = parseInt(m[1], 10); ahead = parseInt(m[2], 10) }
        }
      }
      let head = ''
      if (detached) {
        const sha = await gitRun(cwd, ['rev-parse', '--short', 'HEAD'])
        if (sha.ok) head = String(sha.stdout).trim()
      }
      // The remote URL is shown, so it is redacted before it leaves this
      // function: a remote that carries a token in its userinfo or query is
      // common on CI mirrors, and a panel is a screenshot waiting to happen.
      let remote = ''
      let remoteName = ''
      if (upstream) {
        const slash = upstream.indexOf('/')
        remoteName = slash > 0 ? upstream.slice(0, slash) : upstream
        const url = await gitRun(cwd, ['config', '--get', 'remote.' + remoteName + '.url'])
        if (url.ok) remote = redactRemote(String(url.stdout).trim())
      }
      return {
        ok: true, repo: true, reason: '', at: at, cwd: cwd, root: root,
        branch: branch, detached: detached, head: head,
        upstream: upstream, remote: remote, remoteName: remoteName,
        ahead: ahead, behind: behind,
        entries: entries, truncated: all.length > entries.length || !!statusR.truncated,
        counts: gitCounts(entries),
      }
    }

    // One file's difference against HEAD: the committed blob on one side, the
    // worktree file on the other. That is `git diff HEAD`'s comparison, stated
    // in the view as such — the index is deliberately not a third side, because
    // showing a staged file as "unchanged" would be worse than showing the
    // whole change.
    const gitFileCompare = async (sessionId, path, origPath, untracked) => {
      if (!subprocessService()) return { ok: false, error: '宿主未提供子进程服务' }
      let cwd
      try { cwd = await resolveCwd(sessionId) } catch (e) { cwd = undefined }
      if (!cwd) return { ok: false, error: '工作区不可用' }
      const top = await gitRun(cwd, ['rev-parse', '--show-toplevel'])
      const root = top.ok && String(top.stdout).trim() ? String(top.stdout).trim() : cwd
      const safe = safeRelativePath(path)
      if (!safe.ok) return { ok: false, error: safe.error }
      const rel = safe.path
      const abs = root.replace(/[\\/]+$/, '') + '/' + rel
      if (!pathUnder(abs, root)) return { ok: false, error: '路径越出仓库' }
      const fs = ctx.get('fs')
      if (!fs) return { ok: false, error: 'filesystem unavailable' }
      // The worktree side. A missing file is a deletion, not an error.
      let after = ''
      let exists = false
      let size = 0
      try {
        const info = await fs.stat(abs)
        if (info && info.type === 'file') {
          exists = true
          size = typeof info.size === 'number' && isFinite(info.size) ? info.size : 0
          if (size > GIT_FILE_MAX) return { ok: true, mode: 'too-big', size: size, path: rel, before: '', after: '', truncated: true }
          after = await fs.readText(abs)
        }
      } catch (e) { exists = false }
      // The committed side. A rename compares against its OLD name, which is
      // what makes a rename render as a rename instead of as a whole new file.
      let before = ''
      if (!untracked) {
        const source = origPath && typeof origPath === 'string' ? origPath : rel
        const show = await gitRun(cwd, ['show', 'HEAD:' + source], GIT_FILE_MAX + 4096)
        if (show.ok) before = show.stdout
      }
      // Binary detection from the bytes we already hold: a NUL byte in either
      // side is the classic tell, and a line diff of a PNG is noise either way.
      if (before.indexOf('\u0000') >= 0 || after.indexOf('\u0000') >= 0) {
        return { ok: true, mode: 'binary', path: rel, before: '', after: '', truncated: false }
      }
      const cap = 200000
      const truncated = before.length > cap || after.length > cap
      let mode = 'diff'
      if (!exists && before) mode = 'deleted'
      else if (!before) mode = 'added'
      else if (before === after) mode = 'same'
      return {
        ok: true, mode: mode, path: rel, truncated: truncated,
        before: before.slice(0, cap), after: after.slice(0, cap),
      }
    }

    // ── A relative path, contained ──────────────────────────────────────────
    // Used by the Git view: `/gitfile` carries a repository-relative path that
    // came from git itself, but a request is a request — so `..`, an absolute
    // spelling and a NUL are refused outright rather than normalized away, and
    // the caller still checks the joined result with `pathUnder`.
    const safeRelativePath = (rel) => {
      const text = String(rel == null ? '' : rel).trim()
      if (!text) return { ok: false, error: '缺少路径' }
      if (text.indexOf('\u0000') >= 0) return { ok: false, error: '路径包含非法字符' }
      const t = text.replace(/\\/g, '/')
      if (t.slice(0, 2) === '//') return { ok: false, error: '不接受网络路径' }
      if (t.charAt(0) === '/' || /^[A-Za-z]:\//.test(t)) return { ok: false, error: '不接受绝对路径' }
      const out = []
      for (const seg of t.split('/')) {
        if (seg === '..') return { ok: false, error: '路径不能包含 ..' }
        if (seg === '.' || seg === '') continue
        out.push(seg)
      }
      if (!out.length) return { ok: false, error: '缺少路径' }
      return { ok: true, path: out.join('/') }
    }

    // Package-private RPC (dynamic-plugin transport). Guarded so the same body
    // also runs as a static bundle (no `harness` global there); the static
    // client talks to the /dsh-sidebar-frog/* HTTP routes below instead.
    if (typeof harness !== 'undefined') {
      harness.handle('artifacts.list', () => ({ artifacts: snapshot() }))
      harness.handle('artifacts.remove', (args) => removeFile(args && args.path))
      harness.handle('artifacts.delete', (args) => deletePath(args && args.path, args && args.sessionId))
      harness.handle('artifacts.revert', (args) => revertFile(args && args.path, args && args.opId))
      harness.handle('artifacts.save', (args) => saveFile(args && args.path, args && args.content, args))
      harness.handle('artifacts.read', (args) => readFile(args && args.path, args))
      harness.handle('artifacts.listDir', (args) => listDir(args && args.path, args && args.sessionId))
      harness.handle('artifacts.search', (args) => searchFiles(args && args.q, args && args.sessionId, args && args.limit))
    }

