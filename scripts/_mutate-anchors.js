import { execFileSync } from 'node:child_process'
import { recover, mutate as writeMutant, unmutate } from './_mutate-lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
const cases = [
  { name: 'anchors are always on (the opt-in default is lost)',
    file: 'src/shared/markdown.js',
    from: `  if (!opts || opts.lineAnchors !== true) return '';`,
    to: `  if (!opts) return '';` },
  { name: 'the inner render of a quote loses its line offset',
    file: 'src/shared/markdown.js',
    from: `      var quoted = mdToHtml(q.join('\\n'), Object.assign({}, mdOpts, { lineOffset: (mdOpts.lineOffset || 0) + qStart - 1 }));`,
    to: `      var quoted = mdToHtml(q.join('\\n'), mdOpts);` },
  { name: 'a block end line is one short (the off-by-one the browser caught)',
    file: 'src/shared/markdown.js',
    from: `  var span = mdAnchor(opts, startLine || 0, nextLine || 0);`,
    to: `  var span = mdAnchor(opts, startLine || 0, (nextLine || 0) - 1);` },
  { name: 'a selection outside the document is accepted',
    file: 'src/shared/markdown.js',
    from: `    if (node && !root.contains(node)) return null;`,
    to: `    if (false) return null;` },
  { name: 'the quote is fenced with backticks even when it contains a fence',
    file: 'src/shared/markdown.js',
    from: `  var fence = /(^|\\n)\\s*\\x60{3}/.test(body) ? '~~~~' : '\\x60\\x60\\x60';`,
    to: `  var fence = '\\x60\\x60\\x60';` },
  { name: 'the bar offers 定位 with no editor to act on it',
    file: 'src/shared/markdown.js',
    from: `  if (typeof opts.onLocate === 'function') {`,
    to: `  if (true) {` },
  { name: 'the preview never publishes its editor (定位 can never appear)',
    file: 'src/client/editor.js',
    from: `      editorLocator.path = path
      editorLocator.locate = locateLines`,
    to: `      editorLocator.path = ''
      editorLocator.locate = null` },
  { name: 'the reveal drops the requested lines',
    file: 'src/shared/editor.js',
    from: `          view.dispatch({ selection: { anchor: from.from, head: to.to }, scrollIntoView: true })`,
    to: `          view.dispatch({ selection: { anchor: 0, head: 0 }, scrollIntoView: true })` },
]
let caught = 0
// A previous run may have been KILLED while holding a mutant (that is exactly how
// an `if (false)` once survived into a built bundle). Restore stale mutants FIRST,
// or this run would read a mutated file as its own original.
recover(['src/shared/markdown.js', 'src/client/editor.js', 'src/shared/editor.js'])

for (const c of cases) {
  const original = readFileSync(c.file, 'utf8')
  const crlf = original.includes('\r\n')
  const adapt = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t)
  if (!original.includes(adapt(c.from))) { console.log('MISS     ' + c.name); continue }
  writeMutant(c.file, original.replace(adapt(c.from), adapt(c.to)))
  let verdict
  try {
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
    execFileSync('node', ['scripts/check.js', '--no-browser'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    verdict = 'SURVIVED'
  } catch (e) {
    const out = String(e.stdout || '')
    const failed = out.split('\n').map((l) => l.trim()).filter((l) => l.indexOf('\u2717') === 0)
    verdict = 'CAUGHT   ' + (failed.slice(0, 2).join(' | ') || '(see output)')
    caught += 1
  } finally {
    unmutate(c.file)
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
  }
  console.log(verdict + '  [' + c.name + ']')
}
console.log(caught + '/' + cases.length + ' caught')
