// Vendored-entry for dsh-sidebar-frog's CodeMirror bundle — kept here as the
// record of exactly what src/vendor/codemirror/codemirror.min.js exports.
// See src/vendor/codemirror/README.md for the build commands and the versions.
//
// `--global-name=DshFrogCM` is what makes the bundle usable from the client
// plugin and from the popout page's inline script alike: both read
// `window.DshFrogCM`. `--target=es2020` keeps the output loadable in the older
// Chromium builds this plugin supports.

// ── Core state / view ────────────────────────────────────────────────────
export { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state'
export {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  keymap,
  placeholder,
} from '@codemirror/view'

// ── Editing behaviour ────────────────────────────────────────────────────
export {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
  undo,
  redo,
} from '@codemirror/commands'
export {
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  bracketMatching,
  foldGutter,
  foldKeymap,
  LanguageDescription,
} from '@codemirror/language'
export { search, searchKeymap, openSearchPanel, highlightSelectionMatches } from '@codemirror/search'

// Tags for the plugin's own highlight styles (see src/shared/editor.js).
export { tags as highlightTags } from '@lezer/highlight'

// ── Markdown (+ the fenced-code languages) ───────────────────────────────
export { markdown, markdownLanguage, markdownKeymap, insertNewlineContinueMarkup, deleteMarkupBackward } from '@codemirror/lang-markdown'
export { javascript } from '@codemirror/lang-javascript'
export { json } from '@codemirror/lang-json'
export { python } from '@codemirror/lang-python'
export { yaml } from '@codemirror/lang-yaml'
export { css } from '@codemirror/lang-css'
export { html } from '@codemirror/lang-html'
