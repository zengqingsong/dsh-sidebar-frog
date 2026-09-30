/**
 * Mutation tests for 「文件树自动刷新」 — the manual/automatic split.
 *
 *   node scripts/_mutate-tree-refresh.mjs
 *
 * Why this exists: the reported bug was "the tree keeps refreshing by itself".
 * The fix has two halves that are easy to get half-right, and a half-right fix
 * still LOOKS fine — the tree still renders, the switch still moves:
 *
 *   · the tree must stop following the artifact poll unless the setting is on;
 *   · the poll must stop repainting the panel when its answer did not change;
 *   · a manual refresh must read BOTH halves (directories AND the ledger);
 *   · the switch must exist, default OFF, and reach the tree as a value.
 *
 * Each mutation below breaks exactly one of those and must make
 * "scripts/check.js --no-browser" fail. --no-browser on purpose: everything
 * covered here is decided in the rendered panel (minireact) or the stub-DOM
 * popout script, so the real-engine suite would only add minutes.
 *
 * Crash safety: every touched file is backed up to <file>.mutbak before the
 * first write and restored from it on exit, including on a thrown error.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = {
  settings: join(ROOT, 'src', 'shared', 'settings.js'),
  filetree: join(ROOT, 'src', 'client', 'filetree.js'),
  components: join(ROOT, 'src', 'client', 'components.js'),
  page: join(ROOT, 'src', 'host', 'page.js'),
}

/** label, which file, the exact text to replace, and what to replace it with. */
const MUTATIONS = [
  // ── The default every user gets ─────────────────────────────────────────
  ['the tree follows the poll again by default', 'settings', 'treeAutoRefresh: false,', 'treeAutoRefresh: true,'],

  // ── The tree's own gate ─────────────────────────────────────────────────
  ['the tree keeps following the ledger with the setting off', 'filetree',
    'const autoFollow = props.autoRefresh === true', 'const autoFollow = true'],
  ['the tree is handed a literal instead of the switch', 'components',
    '          autoRefresh: settings.treeAutoRefresh,', '          autoRefresh: true,'],

  // ── The poll must not repaint an unchanged answer ───────────────────────
  // The "|| true" form keeps the first load working, so the mutation stays
  // surgical: it must be the POLL guard that speaks, not a panel that never
  // rendered at all.
  ['the panel writes state on every poll, changed or not', 'components',
    '      if (sig !== ledgerSig.current) {', '      if (sig !== ledgerSig.current || true) {'],
  ['the popout repaints on every poll, changed or not', 'page',
    '          if (changed) {', '          if (changed || true) {'],
  ['the popout tree follows the ledger even with the setting off', 'page',
    '            if (treeRoot && SETTINGS.treeAutoRefresh !== false) renderTree();',
    '            if (treeRoot) renderTree();'],

  // ── A manual refresh reads both halves ──────────────────────────────────
  ['the sidebar manual refresh stops reloading the ledger', 'filetree',
    "    if (typeof props.onRefresh === 'function') props.onRefresh()",
    "    if (typeof props.onRefresh !== 'function') props.onRefresh()"],
  ['the popout manual refresh stops reloading the ledger', 'page',
    '        else refreshTreeExpanded();', '        else loadTreeRoot(false);'],

  // ── The switch itself ───────────────────────────────────────────────────
  ['the setting loses its control', 'components', "        label: '文件树自动刷新',", "        label: '文件树自动刷新XX',"],
]

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function build() {
  run(process.execPath, ['scripts/build.js'])
}

/** passed is the suite's own verdict; failedNames names the guards that spoke. */
function checkSuite() {
  let out = ''
  try {
    out = run(process.execPath, ['scripts/check.js', '--no-browser'])
  } catch (e) {
    out = String((e.stdout || '') + (e.stderr || ''))
  }
  const passed = out.includes('all checks passed')
  const failedNames = out.split('\n')
    .filter((l) => /^\s*\u2717\s+/.test(l))
    .map((l) => l.replace(/^\s*\u2717\s+/, '').trim())
  return { passed, failedNames, output: out }
}

const original = {}
for (const [key, path] of Object.entries(SOURCES)) original[key] = readFileSync(path, 'utf8')
const backupsMade = []
let restored = false
function restore() {
  if (restored) return
  restored = true
  for (const key of Object.keys(SOURCES)) {
    const bak = SOURCES[key] + '.mutbak'
    if (existsSync(bak)) {
      writeFileSync(SOURCES[key], readFileSync(bak, 'utf8'))
      rmSync(bak, { force: true })
    } else if (original[key] !== readFileSync(SOURCES[key], 'utf8')) {
      writeFileSync(SOURCES[key], original[key])
    }
  }
  try { build() } catch (e) { console.error('restore rebuild failed: ' + e.message) }
}
process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit(130) })
process.on('SIGTERM', () => { restore(); process.exit(143) })

console.log('baseline: building and running check.js --no-browser')
build()
const base = checkSuite()
if (!base.passed) {
  console.error('the suite is already failing — fix that before mutating')
  console.error(base.failedNames.join('\n'))
  process.exit(1)
}
console.log('  baseline: all checks passed')

let caught = 0
const holes = []
for (const [label, key, find, replace] of MUTATIONS) {
  const path = SOURCES[key]
  const before = readFileSync(path, 'utf8')
  if (!before.includes(find)) {
    console.error('  SKIPPED (anchor not found): ' + label)
    holes.push(label + ' — anchor not found (the source moved)')
    continue
  }
  if (!backupsMade.includes(path)) { copyFileSync(path, path + '.mutbak'); backupsMade.push(path) }
  writeFileSync(path, before.replace(find, replace))
  build()
  const r = checkSuite()
  if (r.passed) {
    console.log('  SURVIVED ' + label)
    holes.push(label + ' — the guards did not notice')
  } else {
    caught += 1
    console.log('  caught  ' + label)
    for (const name of r.failedNames.slice(0, 4)) console.log('      x ' + name)
  }
  writeFileSync(path, before)
  build()
}

restore()
console.log('')
if (holes.length) {
  console.log('_mutate-tree-refresh: ' + caught + '/' + MUTATIONS.length + ' caught — ' + holes.length + ' PROBLEM(S):')
  for (const h of holes) console.log('  · ' + h)
  process.exit(1)
}
console.log('_mutate-tree-refresh: all ' + MUTATIONS.length + ' mutations caught')
