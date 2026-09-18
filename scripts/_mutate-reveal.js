import { execFileSync } from 'node:child_process'
import { recover, mutate as writeMutant, unmutate } from './_mutate-lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
const cases = [
  { name: 'the reveal drops the requested lines',
    file: 'src/shared/editor.js',
    from: `    view.dispatch({ selection: { anchor: from.from, head: to.to }, scrollIntoView: true })`,
    to: `    view.dispatch({ selection: { anchor: 0, head: 0 }, scrollIntoView: true })` },
  { name: 'the reveal stops bringing the lines into view',
    file: 'src/shared/editor.js',
    from: `    view.dispatch({ selection: { anchor: from.from, head: to.to }, scrollIntoView: true })`,
    to: `    view.dispatch({ selection: { anchor: from.from, head: to.to } })` },
  { name: 'the end of a range is ignored',
    file: 'src/shared/editor.js',
    from: `    var to = view.state.doc.line(clamp(end || start))`,
    to: `    var to = view.state.doc.line(clamp(start))` },
]
let caught = 0
// A previous run may have been KILLED while holding a mutant (that is exactly how
// an `if (false)` once survived into a built bundle). Restore stale mutants FIRST,
// or this run would read a mutated file as its own original.
recover(['src/shared/editor.js'])

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
    const failed = String(e.stdout || '').split('\n').map((l) => l.trim()).filter((l) => l.indexOf('\u2717') === 0)
    verdict = 'CAUGHT   ' + (failed.slice(0, 1).join('') || '(see output)')
    caught += 1
  } finally {
    unmutate(c.file)
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
  }
  console.log(verdict + '  [' + c.name + ']')
}
console.log(caught + '/' + cases.length + ' caught')
