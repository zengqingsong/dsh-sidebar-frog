/**
 * Mutation tests for the popout page's merged top row.
 *
 *   node scripts/_mutate-layout.mjs
 *
 * What this is for: `scripts/check.js` greps the bundled client, and the popout
 * page's layout lives in the host bundle's inline <style>/<script> — so a guard
 * that only reads text cannot tell whether the bar still lines up with the pane
 * it labels. The real-browser suite can (it measures boxes), and this script
 * proves that suite actually FAILS when each part of the merge is broken, rather
 * than passing for an unrelated reason.
 *
 * Each mutation is applied to `src/host/page.js`, the bundles are rebuilt, the
 * browser suite runs, and the file is restored. A mutation that survives (the
 * suite still passes) is reported as a hole in the guards — that is the whole
 * point of running this.
 *
 * There are THREE outcomes, not two. `caught`, `SURVIVED` (a real hole) and
 * `UNKNOWN` (the suite neither printed its summary nor failed a single test — a
 * flake or a hang). UNKNOWN is not evidence of anything and is reported as a
 * problem, because a mutation whose effect was never measured must not be counted
 * as caught. A suite that fails named tests and THEN aborts counts as `caught`,
 * with the abort reported separately: the failure is real evidence, the missing
 * summary is a separate defect, and neither is passed off as the other.
 *
 * Crash safety: every touched file is backed up to `<file>.mutbak` before the
 * first write and restored from it on exit, including on a thrown error, so an
 * interrupted run cannot leave a mutated source behind. (An earlier session lost
 * a mutated `src/client/docpreview.js` into a bundle exactly this way.)
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = join(ROOT, 'src', 'host', 'page.js')
const BAK = PAGE + '.mutbak'

/** label, and a function that edits the page source. */
const MUTATIONS = [
  // ── The bar/chips row ───────────────────────────────────────────────────
  // The row's geometry is what the browser suite measures, and every mutation
  // below is a way of getting it wrong that a TEXT assertion cannot see.
  ['the bar is put back inside the chips\' box', (s) =>
    s.replace('if (bar.parentNode !== row) row.insertBefore(bar, tabs);', 'if (bar.parentNode !== tabs) tabs.appendChild(bar);')],

  ['the bar is left at the default width instead of the preview\'s', (s) =>
    s.replace("if (w > 0) bar.style.width = w + 'px';", '')],

  ['the bar is sized from the stylesheet default rather than the preview (no inline width)', (s) =>
    s.replace("if (w > 0) bar.style.width = w + 'px';", "if (w > 0) row.style.setProperty('--f-bar-w', '240px');")],

  ['the chips are not a flex sibling of the bar (bar is absolute again)', (s) =>
    s.replace('  #bar { flex: none; width: var(--f-bar-w, 240px);', '  #bar { position: absolute; left: 0; top: 0; bottom: 0; width: var(--f-bar-w, 240px);')],

  ['the row no longer spans the window (tabs back in the sidebar column)', (s) =>
    s.replace('<div class="toprow">', '<div class="toprow" style="display:none">')],

  ['the row separator becomes a border, eating a pixel off every child', (s) =>
    s.replace('box-shadow: inset 0 -1px 0 var(--p-border-l2);', 'border-bottom: 1px solid var(--p-border-l2);')],

  // ── The heights the user asked for ──────────────────────────────────────
  ['the header grows back to 40px', (s) =>
    s.replace('--f-h-head: 30px;', '--f-h-head: 40px;')],

  ['the tab strip grows back to 32px', (s) =>
    s.replace('--f-h-strip: 30px;', '--f-h-strip: 32px;')],

  // ── The fullscreen guard ────────────────────────────────────────────────
  ['the fullscreen guard is dropped (a fullscreen measure poisons the bar width)', (s) =>
    s.replace('if (inElementFullscreen() || inFallbackFullscreen()) return;', "if (inElementFullscreen() || inFallbackFullscreen()) { bar.style.width = preview.getBoundingClientRect().width + 'px'; return; }")],
]

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function build() {
  run(process.execPath, ['scripts/build.js'])
}

const SUMMARY = /browser-tests: (\d+) passed(?:, (\d+) FAILED)?/
const SKIPPED = /browser-tests: (?:no Chrome\/Edge found|could not launch a browser)/

/**
 * Runs the browser suite. Returns `{ ran, passed, failed, why, output }`.
 *
 * `ran: false` means the suite never reached its summary line — a browser that
 * would not launch, or a page that wedged and hit the 20s CDP timeout. That is
 * NOT the same claim as "the guards missed this mutation", and conflating the
 * two is what this script did until it invented two holes that do not exist:
 * parsing only `N passed` made a run that died mid-flight look like a survivor,
 * while the layout assertion had in fact already failed inside it
 * (`bar.right=240 preview.right=1096`). A mutation that cannot be classified
 * must be reported as UNKNOWN, never as caught and never as survived.
 */
function browserSuite() {
  let out = ''
  try {
    out = run(process.execPath, ['scripts/browser-tests.js'])
  } catch (e) {
    // A failing suite exits non-zero; that is the expected outcome for a caught
    // mutation, not an error of this script. The summary line is still printed.
    out = String((e.stdout || '') + (e.stderr || ''))
  }
  if (SKIPPED.test(out)) return { ran: false, why: 'the suite skipped (no browser)', output: out }
  const m = SUMMARY.exec(out)
  if (!m) return { ran: false, why: 'the suite printed no summary (it crashed or timed out)', output: out }
  return { ran: true, passed: Number(m[1]), failed: m[2] ? Number(m[2]) : 0, output: out }
}

/**
 * The browser suite occasionally wedges on this machine (heavy Office/media
 * fixtures, a 20s CDP timeout, no summary line). Retry once before declaring the
 * mutation unclassifiable, so a flake does not masquerade as an unexplainable
 * hole and a real hang still surfaces loudly.
 */
function browserSuiteRetry() {
  let r = browserSuite()
  if (!r.ran) {
    console.log('    (suite did not finish — retrying once)')
    r = browserSuite()
  }
  return r
}

/**
 * The names of the tests that failed in a run. A mutation being "caught" is only
 * meaningful if the test that caught it is the guard for THAT mutation — this is
 * printed for every catch so the reader can check that, instead of trusting a
 * bare "(3 failed)".
 */
function failingTests(output) {
  return String(output).split('\n')
    .filter((l) => /^\s*\u2717\s+/.test(l))
    .map((l) => l.replace(/^\s*\u2717\s+/, '').trim())
}

const original = readFileSync(PAGE, 'utf8')
copyFileSync(PAGE, BAK)
let restored = false
function restore() {
  if (restored) return
  restored = true
  if (existsSync(BAK)) {
    writeFileSync(PAGE, readFileSync(BAK, 'utf8'))
    rmSync(BAK, { force: true })
  }
  try { build() } catch (e) { console.error('restore rebuild failed: ' + e.message) }
}
process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit(130) })
process.on('SIGTERM', () => { restore(); process.exit(143) })

console.log('baseline: building and running the browser suite')
build()
let base = browserSuite()
if (!base.ran) {
  console.error('the baseline suite did not finish: ' + base.why)
  process.exit(1)
}
if (base.failed !== 0) {
  // This suite is occasionally flaky on a loaded machine (one test fails in an
  // otherwise clean run, and the same build passes on an immediate re-run). Say
  // so out loud and re-measure once rather than either ignoring it or aborting a
  // 10-minute sweep on a coin flip.
  console.log(`  baseline ${base.passed} passed, ${base.failed} FAILED (${failingTests(base.output).join(' | ')})`)
  console.log('    (re-measuring once — a clean run means the first was a flake)')
  base = browserSuite()
  if (!base.ran || base.failed !== 0) {
    console.error('the suite is already failing — fix that before mutating')
    process.exit(1)
  }
  console.log('    flake confirmed: the same build passes on the second run')
}
console.log(`  baseline ${base.passed} passed, ${base.failed} FAILED`)

let caught = 0
let aborted = 0
const holes = []
for (const [label, mutate] of MUTATIONS) {
  const next = mutate(original)
  if (next === original) {
    // A mutation that no longer matches its anchor is a stale test, and silently
    // skipping it would look like a pass.
    console.error(`  SKIPPED (anchor not found): ${label}`)
    holes.push(label + ' — anchor not found (the source moved)')
    continue
  }
  writeFileSync(PAGE, next)
  build()
  const r = browserSuiteRetry()
  const failed = failingTests(r.output)
  if (!r.ran && failed.length) {
    // The suite FAILED tests and then died before its summary (a wedged renderer).
    // The failures are real evidence the guard fired; the missing summary is a
    // separate defect in the suite, so both are reported rather than one being
    // silently taken for the other.
    caught += 1
    aborted += 1
    console.log(`  caught  ${label} — but the suite aborted before its summary`)
    for (const name of failed) console.log('      ✗ ' + name)
  } else if (!r.ran) {
    console.log(`  UNKNOWN ${label} — ${r.why}`)
    holes.push(label + ' — the suite never finished and failed nothing (' + r.why + ')')
  } else if (r.failed > 0) {
    caught += 1
    console.log(`  caught  ${label}`)
    for (const name of failed) console.log('      ✗ ' + name)
  } else {
    console.log(`  SURVIVED ${label}`)
    holes.push(label + ' — the guards did not notice')
  }
  writeFileSync(PAGE, original)
  build()
}

restore()
console.log('')
if (aborted) {
  console.log(`note: ${aborted} mutation(s) were caught only after the suite aborted mid-run.`)
  console.log('      The guards fired (the failing tests are named above), but the suite')
  console.log('      not finishing is its own defect — see the confirm()/dialog handling in cdp.js.')
  console.log('')
}
if (holes.length) {
  console.log(`_mutate-layout: ${caught}/${MUTATIONS.length} caught — ${holes.length} PROBLEM(S):`)
  for (const h of holes) console.log('  · ' + h)
  process.exit(1)
}
console.log(`_mutate-layout: all ${MUTATIONS.length} mutations caught`)
