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

    const MarkdownView = (props) => {
      const ref = React.useRef(null)
      const content = props.content == null ? '' : String(props.content)
      const mdPath = props.path || ''
      React.useEffect(() => {
        const node = ref.current
        if (!node) return
        // opts.path lets relative image/svg links resolve next to the doc.
        node.innerHTML = mdToHtml(content, { path: mdPath })
        let alive = true
        renderMermaidIn(node)
        renderJSXGraphIn(node)
        loadMathJax().then((mj) => {
          if (!alive || !mj || typeof mj.typesetPromise !== 'function') return
          if (ref.current !== node) return
          mj.typesetPromise([node]).catch(() => {})
        })
        return () => { alive = false }
      }, [content, mdPath])
      return React.createElement('div', { ref, className: 'artifacts-markdown' })
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
        body.push(React.createElement(MarkdownView, { key: 'md', content: p.content, path: p.path || '' }))
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
