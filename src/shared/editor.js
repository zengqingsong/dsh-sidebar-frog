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
        CM.lineNumbers(),
        CM.highlightActiveLineGutter(),
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
      focus: function () { try { view.focus() } catch (e) {} },
      undo: function () { CM.undo(view) },
      redo: function () { CM.redo(view) },
      openSearch: function () { try { CM.openSearchPanel(view) } catch (e) {} },
      destroy: function () { try { view.destroy() } catch (e) {} },
    }
  })
}
