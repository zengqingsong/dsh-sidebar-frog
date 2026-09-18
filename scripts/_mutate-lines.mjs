/**
 * Scratch mutation harness for the line-number pair (设置 › 预览显示行号 /
 * 编辑器显示行号). Every case is a plausible way to break the feature; the point is
 * that the suite FAILS for each one.
 *
 *   node scripts/_mutate-lines.mjs [--browser] [nameSubstring]
 *
 * `--browser` runs scripts/check.js WITH the real-engine suite (slow, ~4 min per
 * case) — needed for the cases whose only honest assertion is behavioural (a live
 * CodeMirror reconfiguration). Without it the run is the fast static+harness suite.
 *
 * Crash-safe: mutating happens through scripts/_mutate-lib.mjs, so a killed run
 * leaves a `.mutbak` beside the file and the next run restores it first.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { recover, mutate as writeMutant, unmutate } from './_mutate-lib.mjs'

const withBrowser = process.argv.includes('--browser')
const only = process.argv.filter((a) => !a.startsWith('--') && !a.endsWith('.mjs') && !a.endsWith('node'))[2]

const cases = [
  // ── the preview gutter ────────────────────────────────────────────────────
  { name: 'the panel preview never adds the gutter class (setting on)',
    file: 'src/client/preview.js',
    from: `      return React.createElement('div', { ref, className: 'artifacts-markdown' + markdownSkinClass(skin) + (showLines ? ' is-lines' : '') })`,
    to: `      return React.createElement('div', { ref, className: 'artifacts-markdown' + markdownSkinClass(skin) })` },
  { name: 'the gutter class is unconditional (setting off is ignored)',
    file: 'src/client/preview.js',
    from: `      const showLines = !!st.previewLineNumbers`,
    to: `      const showLines = true` },
  { name: 'the gutter reads a literal instead of the setting',
    file: 'src/client/preview.js',
    from: `      const st = useSettings()`,
    to: `      const st = { markdownSkin: 'default', previewLineNumbers: true }` },
  { name: 'the renderer stops labelling blocks (the CSS then draws nothing)',
    file: 'src/shared/markdown.js',
    from: `  var label = to > from ? from + '\\u2013' + to : String(from);
  return ' data-line="' + from + '"' + (to > from ? ' data-line-end="' + to + '"' : '') +
    ' data-lineno="' + label + '"'`,
    to: `  return ' data-line="' + from + '"' + (to > from ? ' data-line-end="' + to + '"' : '')` },
  { name: 'the label lies about a multi-line block (shows only its first line)',
    file: 'src/shared/markdown.js',
    from: `  var label = to > from ? from + '\\u2013' + to : String(from)`,
    to: `  var label = String(from)` },
  { name: 'the list-item splice leaves a stale label beside the new one',
    file: 'src/shared/markdown.js',
    from: `      html[itemIndex] = html[itemIndex].replace(/ data-(?:line|line-end|lineno)="[^"]*"/g, '').replace('>', span + '>');`,
    to: `      html[itemIndex] = html[itemIndex].replace(/ data-(?:line|line-end)="[^"]*"/g, '').replace('>', span + '>');` },
  { name: 'the panel stylesheet loses its gutter rule',
    file: 'src/client/styles.js',
    from: `.artifacts-markdown.is-lines > [data-lineno]::before {`,
    to: `.artifacts-markdown.is-lines > [data-lineno]::after {` },
  { name: 'the gutter draws a counter instead of the renderer label',
    file: 'src/client/styles.js',
    from: `  content: attr(data-lineno);`,
    to: `  content: counter(mdline);` },
  // ── the popout's half ────────────────────────────────────────────────────
  { name: 'the popout preview never adds the gutter class',
    file: 'src/host/page.js',
    from: `          md.className = 'markdown' + markdownSkinClass(SETTINGS.markdownSkin) +
            (SETTINGS.previewLineNumbers === true ? ' is-lines' : '');`,
    to: `          md.className = 'markdown' + markdownSkinClass(SETTINGS.markdownSkin);` },
  { name: 'the popout stylesheet loses its gutter rule',
    file: 'src/host/page.js',
    from: `  .markdown.is-lines > [data-lineno]::before {`,
    to: `  .markdown.is-lines > [data-lineno]::after {` },
  { name: 'a live settings change does not repaint the open document',
    file: 'src/host/page.js',
    from: `      var roots = document.querySelectorAll('.markdown');
      for (var ri = 0; ri < roots.length; ri += 1) {
        roots[ri].classList.toggle('is-lines', SETTINGS.previewLineNumbers === true);
      }`,
    to: `` },
  // ── the editor's column ──────────────────────────────────────────────────
  { name: 'the editor ignores the setting at mount (always on)',
    file: 'src/client/editor.js',
    from: `          lineNumbers: settings.editorLineNumbers !== false,`,
    to: `          lineNumbers: true,` },
  { name: 'the panel editor never reconfigures a running editor',
    file: 'src/client/editor.js',
    from: `        if (ctrl && typeof ctrl.setLineNumbers === 'function') {
          ctrl.setLineNumbers(settings.editorLineNumbers !== false)
        }`,
    to: `        void ctrl` },
  { name: 'the popout editor ignores the setting',
    file: 'src/host/page.js',
    from: `        lineNumbers: SETTINGS.editorLineNumbers !== false,`,
    to: `        lineNumbers: true,` },
  { name: 'the popout never reconfigures a running editor',
    file: 'src/host/page.js',
    from: `      if (editorCtl && typeof editorCtl.setLineNumbers === 'function') {
        editorCtl.setLineNumbers(SETTINGS.editorLineNumbers !== false);
      }`,
    to: `` },
  { name: 'the controller has no setLineNumbers (the switch becomes a no-op)',
    file: 'src/shared/editor.js',
    from: `      setLineNumbers: function (on) {
        try {
          view.dispatch({ effects: lineNumberSlot.reconfigure(lineNumberExtensions(on)) })
          return true
        } catch (e) { return false }
      },`,
    to: `      setLineNumbers: function (on) { return false },` },
  { name: 'the gutter is added unconditionally again (off is impossible)',
    file: 'src/shared/editor.js',
    from: `        lineNumberSlot.of(lineNumberExtensions(opts.lineNumbers)),`,
    to: `        CM.lineNumbers(),
        CM.highlightActiveLineGutter(),
        lineNumberSlot.of(lineNumberExtensions(opts.lineNumbers)),` },
  // ── the settings themselves ──────────────────────────────────────────────
  { name: 'the preview gutter ships ON (the default flips)',
    file: 'src/shared/settings.js',
    from: `  previewLineNumbers: false,`,
    to: `  previewLineNumbers: true,` },
  { name: 'the editor gutter ships OFF (the default flips)',
    file: 'src/shared/settings.js',
    from: `  editorLineNumbers: true,`,
    to: `  editorLineNumbers: false,` },
  { name: 'one of the two settings disappears from the shape',
    file: 'src/shared/settings.js',
    from: `  editorLineNumbers: true,`,
    to: `` },
]

let survived = 0
let caught = 0
let skipped = 0
for (const c of cases) {
  if (only && c.name.indexOf(only) < 0) { skipped += 1; continue }
  const original = readFileSync(c.file, 'utf8')
  const crlf = original.includes('\r\n')
  const adapt = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t)
  if (!original.includes(adapt(c.from))) { console.log('MISS  ' + c.name); skipped += 1; continue }
  writeMutant(c.file, original.replace(adapt(c.from), adapt(c.to)))
  let verdict
  try {
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
    const args = ['scripts/check.js'].concat(withBrowser ? [] : ['--no-browser'])
    execFileSync('node', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    verdict = 'SURVIVED'
    survived += 1
  } catch (e) {
    // Name the guard that failed: without it every line of the report reads the
    // same, and a mutation that is caught by the WRONG check looks identical to one
    // caught by the right one.
    const raw = String(e.stdout || '') + String(e.stderr || '')
    const failed = raw.replace(/\u001b\[[0-9;]*m/g, '').split('\n')
      .map((l) => l.trim()).filter((l) => l.indexOf('\u2717') === 0)
      .map((l) => l.replace(/^\u2717\s*/, '').split(' \u2014 ')[0].slice(0, 70))
    verdict = 'caught   by: ' + (failed.join(' | ') || 'a check failed')
    caught += 1
  } finally {
    unmutate(c.file)
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
  }
  console.log(verdict + '  ← ' + c.name)
}
console.log('\n' + caught + ' caught, ' + survived + ' survived, ' + skipped + ' skipped' + (withBrowser ? ' [with browser suite]' : ' [static/harness only]'))
