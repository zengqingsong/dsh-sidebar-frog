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

    const sessionFileAddress = (sessionId, path) => {
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      const encoded = normalized.split('/').map(encodeAddressSegment).join('/')
      return 'dsh-resource://file/session/' + encodeAddressSegment(sessionId) + '/' + encoded
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

    // The body itself: whatever the owner accumulated, drawn by the SAME
    // MarkdownView the panel uses — math, diagrams and interactive geometry
    // included, since it is one renderer, not a second one that can drift.
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
      return React.createElement('div', { className: 'artifacts-doc' },
        React.createElement(MarkdownView, { content, path: pathFromFileAddress(p.resourceAddress) }),
      )
    }

    // The table body: the owner's accumulated text, drawn by the SAME TableView
    // the panel uses — one parser (src/shared/table.js) and one view, so the
    // shell's sidebar and this plugin's panel cannot disagree about a file.
    const TableDocumentBody = (props) => {
      const p = props || {}
      const content = p.content && p.content.kind === 'text' ? String(p.content.text == null ? '' : p.content.text) : null
      if (content == null) {
        return React.createElement('div', { className: 'artifacts-hint' }, '此渲染器只处理文本内容。')
      }
      return React.createElement('div', { className: 'artifacts-doc' },
        React.createElement(TableView, { content, path: pathFromFileAddress(p.resourceAddress) }),
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

    // Hand a file to whichever renderer the shell would pick. Returns false (and
    // the caller says so) when the shell has no sidebar face or refuses the
    // address — `openResource` throws rather than no-ops when nothing can open
    // it, which is exactly the case the caller is checking for.
    const openInShellSidebar = (path) => {
      try {
        const sidebar = ctx.get('sidebarRight')
        if (!sidebar || typeof sidebar.openResource !== 'function') return false
        const sessionId = currentSessionId()
        if (!sessionId) return false
        sidebar.openResource(sessionFileAddress(sessionId, path))
        return true
      } catch (e) { return false }
    }
