/**
 * Assembles the single-file bundles the DSH loader actually consumes
 * (`src/host.js` and `src/client.js`) from the modular source under
 * `src/shared/`, `src/host/` and `src/client/`.
 *
 *   node scripts/build.js          # write the bundles
 *   node scripts/check.js          # verify they are current and loadable
 *
 * The `@@name@@` markers in the body skeletons are replaced with the module
 * contents. Shared modules (`src/shared/*.js`) are written in portable JS (no
 * template literals) and are indented to match each insertion point; the
 * host/client modules already carry their own indentation and are inlined
 * verbatim. No transpilation — plain string assembly.
 *
 * `buildBundles()` is exported so the checker can assemble the same text in
 * memory and compare it against what is on disk, instead of trusting that
 * whoever last edited `src/` remembered to rebuild.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { faviconDataUri } from './logo.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Every input is read with its line endings normalised to LF, and that is a
// correctness requirement, not tidiness. Both bundles embed their inputs
// verbatim — the vendored libraries go in as `JSON.stringify`'d string literals,
// and `indent()` decides "is this line empty?" from `line.length` — so a CRLF
// checkout produced a *different artifact* from an LF one: `\r\n` escapes inside
// the embedded vendor strings, and four spaces of indentation on every line that
// was blank. The committed bundle is LF, so a Linux checkout assembled something
// that could never equal it, `npm run check` failed in `bundle freshness`, and
// the publish workflow's own gate would have refused to publish. Normalising here
// makes the artifact a function of the sources rather than of the machine that
// built them; `.gitattributes` pins the committed form to match.
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')
const write = (p, s) => writeFileSync(join(root, p), s)

const indent = (text, n) => {
  const pad = ' '.repeat(n)
  return text.split('\n').map((line) => (line.length ? pad + line : line)).join('\n')
}

// Tolerant marker replacement: `@@name@@` may have picked up surrounding
// whitespace from an editor auto-format (e.g. `@@name @@`), so match the
// marker name with optional whitespace on both sides. A function replacer is
// used on purpose: vendored bundles contain `$&` / `$'` / `$$`… sequences that
// a string replacement would expand into marker text (or the match itself).
const replaceAll = (text, marker, content) => {
  const name = marker.slice(2, -2)
  return text.replace(new RegExp('@@\\s*' + name + '\\s*@@', 'g'), () => content)
}

const assertNoMarkers = (text, label) => {
  const leftover = text.match(/@@\s*[A-Za-z]+\s*@@/g)
  if (leftover) throw new Error(`${label}: unresolved markers ${[...new Set(leftover)].join(', ')}`)
}

/** Assemble both bundles in memory (nothing is written). */
export function buildBundles() {
  // ── Shared (portable) ───────────────────────────────────────────────────
  const ext = read('src/shared/ext.js')
  // The file tree's icon classifier + the 48 brand glyphs it resolves to. Shared
  // because BOTH faces draw file icons — the panel from React, the popout page
  // from plain DOM — and one artwork table is the only way the two windows can
  // be guaranteed to show the same picture for the same file.
  const filetype = read('src/shared/filetype.js')
  const markdown = read('src/shared/markdown.js')
  const skins = read('src/shared/skins.js')
  const highlight = read('src/shared/highlight.js')
  // Cross-window protocol + the settings shape. Both halves of the plugin get
  // the same text, which is what keeps them from drifting apart.
  const bridge = read('src/shared/bridge.js')
  const settings = read('src/shared/settings.js')
  const format = read('src/shared/format.js')
  // Line-level diff for the change review (both the panel and the popout page
  // render the ledger's before/after text with it).
  const linediff = read('src/shared/linediff.js')
  // Path comparison for the two file trees. Shared for the same reason as the
  // bridge: both halves decide "what lives under this workspace root" from the
  // same host-issued strings, and a drift between them is invisible.
  const paths = read('src/shared/paths.js')
  // Delimited-text parsing (CSV/TSV) for the table view. Shared by the sidebar's
  // React table and the popout page's DOM table so a quoted field containing a
  // newline cannot mean two different things in the two windows.
  const table = read('src/shared/table.js')
  // HTTP byte-range parsing for the host's /media route (audio/video seeking).
  // Host-only, but pure — and scripts/check.js drives it directly.
  const range = read('src/shared/range.js')
  // Git 只读切片: porcelain -z parsing, section grouping and the redaction of a
  // remote URL. Both halves read it — the host decides what an entry IS, the
  // client decides how to group and label it — so they cannot disagree.
  const gitslice = read('src/shared/gitslice.js')
  // 编辑: the CodeMirror mount, loaded lazily and used by BOTH faces. Shared for
  // the same reason as the office widgets: the sidebar edits from React, the
  // popout page edits from plain DOM, and one implementation means the two
  // cannot drift about what Ctrl+S does or when a document counts as dirty.
  const editor = read('src/shared/editor.js')

  // ── Build stamp ─────────────────────────────────────────────────────────
  // A short digest of the sources, carried by every artifact. The plugin ships
  // as generated bundles that a long-running `dsh web` loads ONCE at startup, so
  // "I restarted, didn't I?" is otherwise unanswerable — and a half-restarted
  // process (new client bundle, old popout page) breaks the cross-window bridge
  // in ways that look like unrelated UI bugs. The host prints it at apply time,
  // the popout page carries it as a <meta>, the sidebar shows it in settings,
  // and scripts/check.js prints it too. Same digest everywhere ⇒ everything on
  // the same build.
  const hostBody = read('src/host/body.js')
  const core = read('src/host/core.js')
  const pageSrc = read('src/host/page.js')
  const routes = read('src/host/routes.js')
  const clientBody = read('src/client/body.js')
  const clientCore = read('src/client/core.js')
  const styles = read('src/client/styles.js')
  const icons = read('src/client/icons.js')
  const preview = read('src/client/preview.js')
  const filetree = read('src/client/filetree.js')
  const components = read('src/client/components.js')
  // The shell's own right-sidebar tab registry: register our panel there and
  // the system owns 展开/收起/全屏/拖宽 — see src/client/native.js.
  const native = read('src/client/native.js')
  // The renderer this plugin LENDS to the shell's own document preview (math /
  // diagrams for its Markdown) — see src/client/docpreview.js.
  const docpreview = read('src/client/docpreview.js')
  // Office documents: the widgets both faces mount (docx / xlsx / pptx), plus
  // the stylesheet they share. Portable JS + plain CSS on purpose — the client
  // bundle and the popout page's inline script get the same text.
  const office = read('src/shared/office.js')
  const officeCss = read('src/shared/office.css')
  // 用量 / 上下文, built from the shell's OWN session projections (the tab seat's
  // standard prop `useProjection`) — see src/client/usage.js.
  const usage = read('src/client/usage.js')
  // Git 只读切片 (branch / ahead-behind / changes / one file's difference against
  // HEAD) — one more view, its own system tab. See src/client/git.js.
  const git = read('src/client/git.js')
  // 编辑: the React half of the editor — the toolbar, the preview/编辑 toggle,
  // the conflict bar and the draft store. Its CodeMirror mount lives in the
  // shared module above, so the popout page edits with the same engine.
  const editorUi = read('src/client/editor.js')
  // scripts/logo.js is an input even though it is not under src/: the popout
  // page's favicon is generated from it, so a change to the mark IS a change to
  // the host bundle and the build id has to move with it. (Reading it here also
  // keeps `buildBundles()` the single place that decides what a build contains.)
  const logo = read('scripts/logo.js')
  const build = createHash('sha1')
    .update([ext, filetype, markdown, highlight, bridge, settings, format, paths, linediff, table, range, gitslice,
      editor, office, officeCss,
      hostBody, core, pageSrc, routes,
      clientBody, clientCore, styles, icons, preview, filetree, editorUi, components, native, docpreview, usage, git, logo].join('\u0000'))
    .digest('hex')
    .slice(0, 8)

  // ── pdf.js + MathJax + Mermaid (vendored, served to the browser for the
  //    sidebar's custom PDF renderer and Markdown math/diagrams). Embedded into
  //    the host bundle as string literals so the single-file plugin stays
  //    self-contained (no CDN / network dependency).
  const pdfjsLib = read('src/vendor/pdfjs/pdf.min.js')
  const pdfjsWorker = read('src/vendor/pdfjs/pdf.worker.min.js')
  const mathjaxLib = read('src/vendor/mathjax/tex-svg.js')
  const mermaidLib = read('src/vendor/mermaid/mermaid.min.js')
  const jsxgraphLib = read('src/vendor/jsxgraph/jsxgraphcore.js')
  const jsxgraphCss = read('src/vendor/jsxgraph/jsxgraph.css')
  // Office readers. JSZip is docx-preview's own ZIP layer (its UMD build expects
  // the JSZip global), so both are served together.
  const jszipLib = read('src/vendor/jszip/jszip.min.js')
  const docxLib = read('src/vendor/docx-preview/docx-preview.min.js')
  const xlsxLib = read('src/vendor/xlsx/xlsx.full.min.js')
  const pptxLib = read('src/vendor/pptx/pptx-renderer.browser.es.js')
  // CodeMirror 6 (vendored, MIT) — the 编辑 mode's editor, served as a lazy
  // <script> from this embedded copy. Its build and exact package versions are
  // recorded in src/vendor/codemirror/README.md.
  const codemirrorLib = read('src/vendor/codemirror/codemirror.min.js')

  // ── Host ────────────────────────────────────────────────────────────────
  let host = hostBody
  let page = pageSrc

  // The page's inline script references the same shared helpers. bridge and
  // settings go in first, before the page's own key/URL constants: the page
  // reads BRIDGE.session at the top of its script.
  page = replaceAll(page, '@@bridge@@', indent(bridge, 4))
  page = replaceAll(page, '@@settings@@', indent(settings, 4))
  page = replaceAll(page, '@@format@@', indent(format, 4))
  page = replaceAll(page, '@@paths@@', indent(paths, 4))
  page = replaceAll(page, '@@linediff@@', indent(linediff, 4))
  page = replaceAll(page, '@@ext@@', indent(ext, 4))
  // After `ext`: the popout page's icon renderer classifies with this module.
  page = replaceAll(page, '@@filetype@@', indent(filetype, 4))
  page = replaceAll(page, '@@office@@', indent(office, 4))
  page = replaceAll(page, '@@table@@', indent(table, 4))
  page = replaceAll(page, '@@highlight@@', indent(highlight, 4))
  page = replaceAll(page, '@@markdown@@', indent(markdown, 4))
  page = replaceAll(page, '@@skins@@', indent(skins, 4))
  page = replaceAll(page, '@@editor@@', indent(editor, 4))
  // The office stylesheet goes INSIDE the page's <style> block, at its own
  // indentation (the block is written at column 0).
  page = replaceAll(page, '@@office_css@@', officeCss)
  page = replaceAll(page, '@@build@@', build)
  // The favicon is a generated data URI (scripts/logo.js). Inlined rather than
  // routed: a favicon request from a cold tab must not depend on the auth guard
  // or on the host having finished booting.
  page = replaceAll(page, '@@favicon@@', faviconDataUri())

  host = replaceAll(host, '@@build@@', build)
  host = replaceAll(host, '@@ext@@', indent(ext, 4))
  host = replaceAll(host, '@@paths@@', indent(paths, 4))
  host = replaceAll(host, '@@gitslice@@', indent(gitslice, 4))
  host = replaceAll(host, '@@range@@', indent(range, 4))
  host = replaceAll(host, '@@core@@', core)
  host = replaceAll(host, '@@page@@', page)
  host = replaceAll(host, '@@routes@@', routes)
  host = replaceAll(host, '@@PDFJS_LIB@@', JSON.stringify(pdfjsLib))
  host = replaceAll(host, '@@PDFJS_WORKER@@', JSON.stringify(pdfjsWorker))
  host = replaceAll(host, '@@MATHJAX_LIB@@', JSON.stringify(mathjaxLib))
  host = replaceAll(host, '@@MERMAID_LIB@@', JSON.stringify(mermaidLib))
  host = replaceAll(host, '@@JSXGRAPH_LIB@@', JSON.stringify(jsxgraphLib))
  host = replaceAll(host, '@@JSXGRAPH_CSS@@', JSON.stringify(jsxgraphCss))
  host = replaceAll(host, '@@JSZIP_LIB@@', JSON.stringify(jszipLib))
  host = replaceAll(host, '@@DOCX_LIB@@', JSON.stringify(docxLib))
  host = replaceAll(host, '@@XLSX_LIB@@', JSON.stringify(xlsxLib))
  host = replaceAll(host, '@@PPTX_LIB@@', JSON.stringify(pptxLib))
  host = replaceAll(host, '@@CODEMIRROR_LIB@@', JSON.stringify(codemirrorLib))
  assertNoMarkers(host, 'host.js')

  // ── Client ──────────────────────────────────────────────────────────────
  let client = clientBody
  client = replaceAll(client, '@@build@@', build)
  client = replaceAll(client, '@@bridge@@', indent(bridge, 4))
  client = replaceAll(client, '@@settings@@', indent(settings, 4))
  client = replaceAll(client, '@@format@@', indent(format, 4))
  client = replaceAll(client, '@@paths@@', indent(paths, 4))
  client = replaceAll(client, '@@linediff@@', indent(linediff, 4))
  client = replaceAll(client, '@@ext@@', indent(ext, 4))
  // Before `icons`: FileTypeGlyph reads iconGlyph/CODE_ICON_* from this module.
  client = replaceAll(client, '@@filetype@@', indent(filetype, 4))
  client = replaceAll(client, '@@office@@', indent(office, 4))
  client = replaceAll(client, '@@table@@', indent(table, 4))
  client = replaceAll(client, '@@gitslice@@', indent(gitslice, 4))
  client = replaceAll(client, '@@highlight@@', indent(highlight, 4))
  client = replaceAll(client, '@@markdown@@', indent(markdown, 4))
  client = replaceAll(client, '@@skins@@', indent(skins, 4))
  // After core: the editor core reads the theme helpers core declares, and the
  // React half below mounts it.
  client = replaceAll(client, '@@editor@@', indent(editor, 4))
  client = replaceAll(client, '@@core@@', clientCore)
  client = replaceAll(client, '@@styles@@', styles)
  // The office stylesheet rides the client's stylesheet: `styles.insert` writes
  // ONE <style> for the whole plugin, so the widgets and the panel cannot end up
  // in two files that disagree about which one is loaded.
  client = replaceAll(client, '@@office_css@@', officeCss)
  client = replaceAll(client, '@@icons@@', icons)
  client = replaceAll(client, '@@preview@@', preview)
  client = replaceAll(client, '@@filetree@@', filetree)
  client = replaceAll(client, '@@editorui@@', editorUi)
  client = replaceAll(client, '@@components@@', components)
  client = replaceAll(client, '@@native@@', native)
  client = replaceAll(client, '@@docpreview@@', docpreview)
  client = replaceAll(client, '@@usage@@', usage)
  client = replaceAll(client, '@@git@@', git)
  assertNoMarkers(client, 'client.js')

  return { host, client, page, build }
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isCli) {
  const { host, client, build } = buildBundles()
  write('src/host.js', host)
  write('src/client.js', client)
  console.log('built src/host.js and src/client.js · build ' + build)
}
