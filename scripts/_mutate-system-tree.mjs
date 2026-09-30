/**
 * Mutation tests for 「显示系统的文件树」 — the one-tree / two-tree switch.
 *
 *   node scripts/_mutate-system-tree.mjs
 *
 * What this is for: the switch is decided ONCE at registration and then read back
 * from `frogTreeKind` by three other places (the footer button, the tab's popout
 * item, the default page). A guard that only checks "a type was registered" would
 * stay green while any of those pointed at a kind nothing draws — and the failure
 * a user sees is a click that goes nowhere, which no text assertion notices. Each
 * mutation below breaks exactly one of those agreements; every one must make
 * `scripts/check.js` fail.
 *
 * `--no-browser` on purpose: everything this covers is decided in the registry and
 * the stub-DOM tree suite, so the real-browser suite would only add minutes. The
 * layout mutations (which DO need the browser) live in _mutate-layout.mjs.
 *
 * Crash safety: every touched file is backed up to `<file>.mutbak` before the
 * first write and restored from it on exit, including on a thrown error. An
 * earlier session lost a mutated source into a bundle by force-killing a run
 * exactly like this one.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = {
  settings: join(ROOT, 'src', 'shared', 'settings.js'),
  native: join(ROOT, 'src', 'client', 'native.js'),
  filetree: join(ROOT, 'src', 'client', 'filetree.js'),
}

/** label, which file, the exact text to replace, and what to replace it with. */
const MUTATIONS = [
  // ── The default, which is what every user gets on upgrade ────────────────
  ['the default flips back to two trees', 'settings', 'systemFileTree: false,', 'systemFileTree: true,'],

  // ── The takeover itself ─────────────────────────────────────────────────
  ['the takeover type is never registered (the tree keeps its own kind)', 'native',
    'if (takeover) dropTypes.push(bindLifecycle(() => tabs.register(systemFilesDefinition())))', ''],
  ['the takeover tab loses the product\'s name', 'native',
    'title: () => SYSTEM_FILES_TITLE,', "title: () => '文件树XYZ',"],
  ['the takeover entry drops the product\'s commandId (⌘/Ctrl+P stops opening it)', 'native',
    "        commandId: 'workspace.files',\n", ''],
  ['the takeover entry stops reusing the product\'s entry id', 'native',
    "        id: 'workspace',\n", "        id: 'frog-takeover',\n"],
  ['a restored 文件树 tab loses its body in takeover mode', 'native',
    "            yield slots.register({ name: 'sidebar.right.pane.tab', key: FROG_FILES_KIND }, renderView('tree'))\n", ''],

  // ── The two places that must name the kind that was registered ──────────
  // (The footer button and the 「加载时展开」default both go through the one
  // `openFrogFilesTab`, so one mutation covers both callers.)
  ['the tree is opened by the retired kind instead of the one in force', 'native',
    'sidebar.openTab(frogTreeKind)', 'sidebar.openTab(FROG_FILES_KIND)'],
  ['the popout menu item treats the product\'s tab as somebody else\'s', 'native',
    'if (FROG_TAB_KINDS.has(tab.kind) || tab.kind === frogTreeKind) {', 'if (FROG_TAB_KINDS.has(tab.kind)) {'],

  // ── The refresh that replaces the product's live watcher ────────────────
  ['the changed level is never re-read (a new file never appears)', 'filetree',
    '      if (treeRef.current.children[dir]) refreshDir(dir, true)', '      if (false && treeRef.current.children[dir]) refreshDir(dir, true)'],
  ['the refresh reads (and expands) a level the user was not looking at', 'filetree',
    '      if (treeRef.current.children[dir]) refreshDir(dir, true)', '      refreshDir(dir, true)'],
  ['a top-level change never re-reads the root', 'filetree',
    '    if (rootStale) loadRoot(false, true)', ''],
]

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function build() {
  run(process.execPath, ['scripts/build.js'])
}

/** `{ passed, failedNames, output }` — `passed` is the suite's own verdict. */
function checkSuite() {
  let out = ''
  try {
    out = run(process.execPath, ['scripts/check.js', '--no-browser'])
  } catch (e) {
    // A failing check exits non-zero; that is the expected outcome for a caught
    // mutation, not an error of this script.
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
    console.error(`  SKIPPED (anchor not found): ${label}`)
    holes.push(label + ' — anchor not found (the source moved)')
    continue
  }
  if (!backupsMade.includes(path)) { copyFileSync(path, path + '.mutbak'); backupsMade.push(path) }
  // Only the FIRST occurrence: several of these anchors appear twice, and each
  // pair is covered by its own mutation above.
  writeFileSync(path, before.replace(find, replace))
  build()
  const r = checkSuite()
  if (r.passed) {
    console.log(`  SURVIVED ${label}`)
    holes.push(label + ' — the guards did not notice')
  } else {
    caught += 1
    console.log(`  caught  ${label}`)
    for (const name of r.failedNames.slice(0, 4)) console.log('      ✗ ' + name)
  }
  writeFileSync(path, before)
  build()
}

restore()
console.log('')
if (holes.length) {
  console.log(`_mutate-system-tree: ${caught}/${MUTATIONS.length} caught — ${holes.length} PROBLEM(S):`)
  for (const h of holes) console.log('  · ' + h)
  process.exit(1)
}
console.log(`_mutate-system-tree: all ${MUTATIONS.length} mutations caught`)
