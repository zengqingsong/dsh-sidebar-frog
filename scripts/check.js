/**
 * Verification guard for the built bundles.
 *
 *   node scripts/check.js          # verify
 *   node scripts/check.js --fix    # rebuild the bundles when they are stale
 *
 * Three independent classes of failure are checked here, because all three have
 * happened in this repository:
 *
 *   1. 嵌入脆弱性 — the sources are spliced into template literals
 *      (`String.raw\`…\`` in the popout page, `styles.insert(\`…\`)` in the
 *      client body). A stray backtick ends the literal early, a `${` is
 *      interpolated at build time, and a literal `</script>` inside the page's
 *      inline script truncates the document in the browser. None of that is
 *      visible in Node, so it is checked before building.
 *   2. 产物过期 — `src/host.js` / `src/client.js` are the files DSH actually
 *      loads; editing `src/host/*.js` without rebuilding ships stale code.
 *      The bundles are assembled in memory and compared byte for byte.
 *   3. 无法加载 — both bundles are parsed and executed against a minimal stub
 *      of their runtime (the Cordis loader for the host, `__ModuleLoader__`
 *      plus React for the client), so a syntax error or a typo in the
 *      registration block fails here instead of in the browser.
 *
 * …and the file tree is driven twice more (section 5 with a stub DOM, section 6
 * in a real browser), because every bug that shipped from this plugin so far was
 * a *browser* bug that all of the above passed straight through.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBundles } from './build.js'
import { runPopoutTree, runSidebarTree, hiddenControlViolations } from './tree-tests.js'
import { createRenderer, settle } from './minireact.js'
import {
  MARK, PALETTE, PROBES, RASTERS, contrast, faviconDataUri, generatedAssets,
  geometryIssues, paletteIssues,
} from './logo.js'
import { alphaAt, colorAt, coverage, mirrorError, readPng, runsAt } from './png.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const fix = process.argv.includes('--fix')

let failed = 0
const ok = (label, detail) => console.log(`  \u2713 ${label}${detail ? ' — ' + detail : ''}`)
const bad = (label, detail) => { failed += 1; console.error(`  \u2717 ${label}${detail ? ' — ' + detail : ''}`) }
// Every className in a rendered tree, in order — for the failure messages where
// "nothing rendered" is otherwise indistinguishable from "the wrong thing did".
const classDump = (node, out) => {
  if (!node || typeof node !== 'object') return out
  const cn = node.props && node.props.className
  if (typeof cn === 'string' && cn) out.push(cn)
  const kids = (node.props && node.props.children) || []
  for (const kid of (Array.isArray(kids) ? kids : [kids])) classDump(kid, out)
  return out
}

// ── 1. embedding hazards ───────────────────────────────────────────────────
console.log('embedding hazards')

// Spliced into the popout page's inline <script>.
//
// The list is read off disk rather than hand-maintained: a new shared module is
// exactly the case this guard exists for, and a hand-written list silently keeps
// passing while the new file breaks the build (a backtick in a comment is enough
// — it ends the page's String.raw literal in src/host.js).
const SHARED_DIR = 'src/shared'
for (const file of readdirSync(join(root, SHARED_DIR)).filter((n) => n.endsWith('.js')).sort().map((n) => `${SHARED_DIR}/${n}`)) {
  const text = read(file)
  const hits = []
  if (text.includes('`')) hits.push('backtick')
  if (text.includes('${')) hits.push('${')
  if (text.includes('</script')) hits.push('</script')
  if (hits.length) bad(file, hits.join(', ') + ' would break the page embedding')
  else ok(file)
}

// Spliced into `styles.insert(\`…\`)` in src/client/body.js.
{
  const text = read('src/client/styles.js')
  const hits = []
  if (text.includes('`')) hits.push('backtick')
  if (text.includes('${')) hits.push('${')
  if (hits.length) bad('src/client/styles.js', hits.join(', ') + ' would break the styles template literal')
  else ok('src/client/styles.js')
}

// The page itself is one String.raw literal, so exactly its two delimiters.
{
  const text = read('src/host/page.js')
  const ticks = (text.match(/`/g) || []).length
  if (ticks !== 2) bad('src/host/page.js', `expected exactly 2 backticks (the String.raw delimiters), found ${ticks}`)
  else if (text.includes('${')) bad('src/host/page.js', 'contains ${ — it would be interpolated at build time')
  else ok('src/host/page.js', 'String.raw literal intact')
}

// ── 1b. the two README editions ────────────────────────────────────────────
// README.md (English) and README.zh-CN.md (Simplified Chinese) are two copies
// of ONE document. The failure guarded against here is editing only one of
// them: structural drift — a section, a table row or a code block that exists
// on one side only — is invisible in a diff, while the marketplace crawler and
// every reader install from whichever copy happens to be stale. Both files are
// also where the copyable install command lives, and that is one of the plugin
// marketplace's hard listing requirements, so it is asserted rather than
// assumed. The anchor check earns its keep: it caught a
// `#侧边栏-vs-弹出页--known-differences` link that had never once resolved,
// because the heading carries 已知差异 and the link did not.
console.log('readme (two editions)')
{
  const INSTALL = 'dsh plugin --profile web add github:zengqingsong/dsh-sidebar-frog'
  const cjk = /\p{Script=Han}/u
  const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').replace(/\s/g, '-')
  // Fenced blocks are skipped when reading structure: shell comments inside a
  // ```sh block start with '#' and would otherwise count as headings.
  const outsideFences = (text) => {
    const out = []
    let open = null
    for (const line of text.split('\n')) {
      const bare = line.replace(/^[>\s]+/, '')
      const m = bare.match(/^(`{3,})/)
      if (open) {
        if (m && m[1].length >= open.length) open = null
        continue
      }
      if (m) { open = m[1]; continue }
      out.push(line)
    }
    return out
  }
  const headings = (text) => outsideFences(text).filter((l) => /^#{1,4} /.test(l)).map((l) => l.replace(/^#+ /, ''))
  const rows = (text) => outsideFences(text).filter((l) => l.startsWith('|')).length
  const fences = (text) => text.split('\n').filter((l) => l.replace(/^[>\s]+/, '').startsWith('```')).length
  try {
    const en = read('README.md')
    const zh = read('README.zh-CN.md')
    for (const [name, text, other] of [['README.md', en, 'README.zh-CN.md'], ['README.zh-CN.md', zh, 'README.md']]) {
      if (!text.includes(`](./${other})`)) throw new Error(`${name} has no language switcher pointing at ${other}`)
      // The command must be a line of its own, the way it appears in a code
      // block. Merely mentioning it in prose — or quoting it in the guard list
      // at the bottom, which is how the first version of this check passed while
      // the copyable line was gone — is not something a reader can copy.
      if (!text.split('\n').some((l) => l.trim() === INSTALL)) throw new Error(`${name} no longer carries the install command on a line of its own — a README without a copyable install command cannot be listed`)
      const head = text.split('\n').slice(0, 20).join('\n')
      if (!/dsh-popout-sidebar/.test(head)) throw new Error(`${name} does not name the upstream fork in its opening block — a credit at the bottom of the file is no credit`)
      if (!/Qinyun Cai/.test(head)) throw new Error(`${name} drops the upstream copyright holder from its opening block — a fork has to say whose work it came from`)
    }
    const n = headings(en).length
    if (n !== headings(zh).length) throw new Error(`heading counts drifted: README.md has ${n}, README.zh-CN.md has ${headings(zh).length}`)
    if (rows(en) !== rows(zh)) throw new Error(`table row counts drifted: ${rows(en)} in README.md, ${rows(zh)} in README.zh-CN.md`)
    if (fences(en) !== fences(zh)) throw new Error(`code fence counts drifted: ${fences(en)} in README.md, ${fences(zh)} in README.zh-CN.md`)
    if (!headings(zh).some((h) => cjk.test(h))) throw new Error('README.zh-CN.md has no Chinese heading at all — is it really the Chinese edition?')
    if (headings(en).some((h) => cjk.test(h))) throw new Error('a heading in the English edition still carries CJK: ' + headings(en).filter((h) => cjk.test(h))[0])
    for (const [name, text] of [['README.md', en], ['README.zh-CN.md', zh]]) {
      const known = new Set(headings(text).map(slug))
      const dead = [...text.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]).filter((a) => !known.has(a))
      if (dead.length) throw new Error(`${name}: ${dead.length} in-document link(s) point at no heading — ${JSON.stringify(dead.slice(0, 3))}`)
    }
    // The English edition may carry CJK only where it quotes something verbatim
    // (a runtime string, an assertion message), in the language switcher, or as
    // the author's own name. A Chinese *explanation* added to it is what fails.
    const prose = en.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => cjk.test(l)).filter(([, l]) => !(l.includes('README.zh-CN.md') || /曾青松/.test(l) || /[`"「]/.test(l)))
    if (prose.length) throw new Error(`Chinese prose in the English edition, line ${prose[0][0]}: ${prose[0][1].trim().slice(0, 60)}`)
    ok('readme i18n', `two editions, ${n} headings / ${rows(en)} table rows / ${fences(en)} fences each, every anchor resolves, install command and upstream credit in both`)
  } catch (e) {
    bad('readme i18n', e && e.message ? e.message : String(e))
  }
}

// ── 1c. the package manifest the listing installs from ─────────────────────
// The listing page gives people exactly one command — `dsh plugin --profile web
// add github:zengqingsong/dsh-sidebar-frog` — and from there the CLI mounts this
// package by its manifest alone: `dsh.bundle.patch` becomes the profile layer,
// `exports["./client"]` becomes the browser bundle, and `dsh.client.inject` is
// carried into the client wire table. So every path the manifest promises has to
// exist in the tree; the patch has to name this package (a row naming anything
// else would mount a package that does not resolve); `files[]` has to cover what
// the runtime reads after a GIT install — pnpm packs the checkout by `files[]`
// (an installed copy really does contain `src`, `cordis.patch.yml`, both
// READMEs and nothing else), so `files[]` is the runtime manifest, not a
// formality: an `src/vendor` tree left untracked is a plugin that installs
// cleanly and then
// 404s on its first preview; and every client module named in `inject` has to
// exist in the DSH that will load it. That last one is how the stale
// `@deepseek-ai/dsh-client-runtime` is now caught: those edges are
// *informational* (the product's own client says so), so a name whose package
// disappeared from DSH never fails at runtime — it just keeps claiming a
// dependency that is not there.
console.log('package manifest')
{
  const pkg = JSON.parse(read('package.json'))
  try {
    if (pkg.name !== 'dsh-sidebar-frog') throw new Error(`package name is ${JSON.stringify(pkg.name)} — the README install command and everything downstream say dsh-sidebar-frog`)
    if (!/^\d+\.\d+\.\d+/.test(String(pkg.version))) throw new Error(`version ${JSON.stringify(pkg.version)} is not semver`)
    for (const [label, rel] of [['main', pkg.main], ['exports["."]', pkg.exports && pkg.exports['.']], ['exports["./client"]', pkg.exports && pkg.exports['./client']]]) {
      if (typeof rel !== 'string' || !existsSync(join(root, rel))) throw new Error(`${label} points at ${JSON.stringify(rel)}, which is not in the tree`)
    }
    const missingFiles = (pkg.files || []).filter((rel) => !existsSync(join(root, rel)))
    if (missingFiles.length) throw new Error(`files[] names ${missingFiles.join(', ')}, which are not in the tree — the packed/copied artifact would silently omit them`)
    if (!(pkg.files || []).includes('README.md')) throw new Error('files[] drops README.md — the listing page and the npm tarball both read it')
    // Existence is not coverage: `files[]` is what a pack would include, so a path
    // the runtime reads has to sit *under* one of its entries. Dropping `src` from
    // the list keeps every entry valid and still ships a package that cannot boot.
    const covered = (rel) => (pkg.files || []).some((f) => rel === f || rel.startsWith(f.replace(/\/$/, '') + '/'))
    for (const need of ['src/host.js', 'src/client.js', 'src/index.js', 'cordis.patch.yml', 'README.md', 'README.zh-CN.md']) {
      if (!covered(need)) throw new Error(`files[] does not cover ${need} — a packed install would omit a file the runtime reads`)
    }
    // Covering the runtime is only half of what `files[]` decides. The READMEs
    // are also rendered by consumers that have nothing but the tarball — mirrors,
    // private registries, offline installs — and those have no path back to the
    // repository, so an image a README shows has to be inside the package too.
    // It was not: `files[]` named no `docs/` entry at all, so all three logo
    // references shipped as broken images there while looking perfect on GitHub,
    // where the file is simply present. `.gitignore` ignoring `/docs` does not
    // save this — `files[]` is an allowlist that wins over it, which is exactly
    // why the omission was invisible from the repository side.
    for (const edition of ['README.md', 'README.zh-CN.md']) {
      const refs = new Set()
      for (const m of read(edition).matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) refs.add(m[1])
      for (const m of read(edition).matchAll(/(?:src|srcset)="([^"]+)"/g)) {
        for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/).pop())
      }
      for (const raw of refs) {
        if (/^(https?:|#|mailto:)/.test(raw)) continue
        const rel = raw.replace(/^\.\//, '').split('#')[0]
        if (!covered(rel)) throw new Error(`${edition} renders ${raw}, which files[] does not cover — a consumer reading the README out of the packed tarball would render it broken`)
      }
    }
    const patchRel = pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch
    if (typeof patchRel !== 'string') throw new Error('dsh.bundle.patch is missing — the CLI would install this as a plain dependency and never mount it as a profile layer')
    const patch = read(patchRel.replace(/^\.\//, ''))
    const rowName = (patch.match(/^\s*name:\s*'([^']+)'/m) || [])[1]
    if (rowName !== pkg.name) throw new Error(`${patchRel} mounts ${JSON.stringify(rowName)}, not ${JSON.stringify(pkg.name)} — the profile layer would load a package name that does not resolve`)
    const platform = pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform
    if (platform !== 'web') throw new Error(`dsh.client.platform is ${JSON.stringify(platform)} — the web profile would not discover the client half`)
    const inject = (pkg.dsh && pkg.dsh.client && pkg.dsh.client.inject) || []
    if (!Array.isArray(inject) || !inject.length || inject.some((n) => typeof n !== 'string')) throw new Error('dsh.client.inject must be a non-empty string array')
    // Resolve them against whatever DSH this machine has: each profile's own
    // node_modules, its module fallback, and the global CLI install. With none of
    // those present the check is skipped rather than failed — it is a guard about
    // manifest drift, not about the machine it runs on.
    const roots = [join(dirname(process.execPath), 'node_modules', '@deepseek-ai', 'dsh', 'node_modules')]
    if (process.env.APPDATA) roots.push(join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'))
    const profilesDir = join(homedir(), '.dsh', 'profiles')
    if (existsSync(profilesDir)) {
      for (const p of readdirSync(profilesDir)) {
        roots.push(join(profilesDir, p, 'node_modules'), join(profilesDir, p, '.dsh-module-fallback', 'node_modules'))
      }
    }
    const at = (r, n) => existsSync(join(r, ...n.split('/')))
    const haveDsh = roots.some((r) => existsSync(join(r, '@deepseek-ai')))
    if (!haveDsh) {
      ok('package manifest', `${pkg.name}@${pkg.version} — manifest and patch agree; client inject resolution skipped (no DSH install found here)`)
    } else {
      const dead = inject.filter((n) => !roots.some((r) => at(r, n)))
      if (dead.length) throw new Error(`dsh.client.inject names ${dead.join(', ')}, which the installed DSH does not provide — the edge never fails at runtime (they are informational), it just claims a dependency that is gone`)
      ok('package manifest', `${pkg.name}@${pkg.version} — name, main, exports, files[], the patch row and ${inject.length} client inject edge(s) all resolve`)
    }
  } catch (e) {
    bad('package manifest', e && e.message ? e.message : String(e))
  }
}

// ── 2. assemble once, for the checks that need the built text ──────────────
let built
try {
  built = buildBundles()
} catch (e) {
  bad('assemble bundles', e && e.message ? e.message : String(e))
}

// ── 2b. shared modules: drift + behaviour ──────────────────────────────────
// The two halves of the plugin (sidebar and popout tab) are separate documents
// that talk through localStorage. A key or payload field that only one of them
// knows about fails *silently* — no error anywhere, just a feature that never
// works — so the shared modules are loaded and exercised directly, and the key
// literals are only allowed to exist in one place.
console.log('shared modules')

const SHARED_SOURCES = ['src/shared/bridge.js', 'src/shared/settings.js', 'src/shared/format.js', 'src/shared/paths.js', 'src/shared/linediff.js', 'src/shared/ext.js', 'src/shared/office.js', 'src/shared/table.js', 'src/shared/range.js', 'src/shared/gitslice.js']
const SHARED_EXPORTS = [
  'BRIDGE', 'BRIDGE_QUOTE_TTL_MS', 'BRIDGE_ACK_TIMEOUT_MS', 'bridgeNonce', 'bridgeEncodeQuote',
  'bridgeDecodeQuote', 'bridgeEncodeAck', 'bridgeDecodeAck', 'bridgeQuoteIsFresh', 'bridgeParseWidth',
  'DEFAULT_SETTINGS', 'SETTINGS_RANGES', 'clampSetting', 'normalizeSettings', 'parseSettings', 'serializeSettings',
  'panelMinWidthPx', 'panelDefaultWidthPx', 'panelWidthPx',
  'relativeTime',
  'pathUnder', 'pathRelativeTo', 'pathAncestorsOf',
  'diffLines', 'diffStats',
  'extType', 'fileExt', 'fileIconKind',
  'OFFICE_KINDS', 'officeKind', 'officeKindLabel', 'OFFICE_ASSETS', 'OFFICE_MAX_FILE', 'OFFICE_MAX_EXPANDED',
  'officeZipTotals', 'officeBytesVerdict', 'officeSizeText', 'officeMount', 'officeMediaUrl',
  'tableParse', 'tableSniffDelimiter', 'tableDelimiterLabel', 'tableSortRows', 'tableCompare',
  'tableCellNumber', 'tableFormatCell',
  'parseByteRange', 'formatContentRange', 'formatUnsatisfiedRange',
  'GIT_ENTRY_CAP', 'GIT_SECTION_LIST', 'parsePorcelainZ', 'gitEntryConflicted', 'gitEntryUntracked',
  'gitSectionsOf', 'gitStatusLetter', 'gitSectionGroups', 'gitCounts', 'gitSummaryText',
  'gitAheadBehindText', 'redactRemote', 'gitHeadLabel',
]
let shared = null
try {
  // eslint-disable-next-line no-new-func
  shared = new Function(SHARED_SOURCES.map(read).join('\n') + '\nreturn {' + SHARED_EXPORTS.join(', ') + '}')()
  if (!shared || !shared.BRIDGE) throw new Error('shared modules did not evaluate')
  ok('evaluate', `${SHARED_SOURCES.length} module(s), ${SHARED_EXPORTS.length} exports`)
} catch (e) {
  bad('evaluate', e && e.message ? e.message : String(e))
}

// Every cross-window key is defined once, in bridge.js. A second literal
// anywhere else is how the two halves drift apart.
if (shared) {
  const sources = {
    'src/host/page.js': read('src/host/page.js'),
    'src/client/core.js': read('src/client/core.js'),
    'src/client/components.js': read('src/client/components.js'),
    'src/client/filetree.js': read('src/client/filetree.js'),
    'src/shared/settings.js': read('src/shared/settings.js'),
  }
  const duplicated = []
  for (const key of Object.values(shared.BRIDGE)) {
    for (const [file, text] of Object.entries(sources)) {
      if (text.includes(key)) duplicated.push(`${key} in ${file}`)
    }
  }
  if (duplicated.length) bad('key literals', 'must live only in src/shared/bridge.js: ' + duplicated.join(', '))
  else ok('key literals', 'all cross-window keys come from src/shared/bridge.js')
}

if (shared) {
  try {
    const { BRIDGE, bridgeEncodeQuote, bridgeDecodeQuote, bridgeEncodeAck, bridgeDecodeAck, bridgeQuoteIsFresh, bridgeParseWidth } = shared
    // Round trip.
    const raw = bridgeEncodeQuote('D:\\ws\\a.txt', 'n1', 1700000000000)
    const quote = bridgeDecodeQuote(raw)
    if (!quote || quote.path !== 'D:\\ws\\a.txt' || quote.nonce !== 'n1' || quote.ts !== 1700000000000) {
      throw new Error('quote round trip failed: ' + JSON.stringify(quote))
    }
    // Garbage that must be rejected, not thrown on, and not acted upon.
    for (const badInput of ['', 'null', '{oops', '[]', '5', '{"v":2,"path":"a","nonce":"n","ts":1}', '{"v":1,"path":"","nonce":"n","ts":1}', '{"v":1,"path":"a","nonce":"n"}']) {
      if (bridgeDecodeQuote(badInput) !== null) throw new Error('accepted malformed quote: ' + JSON.stringify(badInput))
    }
    const ack = bridgeDecodeAck(bridgeEncodeAck('n1', true))
    if (!ack || ack.nonce !== 'n1' || ack.ok !== true) throw new Error('ack round trip failed')
    // The decoder requires a real boolean: anything else means "not inserted",
    // so a malformed ack can never be mistaken for success.
    if (bridgeDecodeAck('{"v":1,"nonce":"n1","ok":"yes"}').ok !== false) throw new Error('a non-boolean ok was accepted')
    if (bridgeDecodeAck('{oops') !== null) throw new Error('accepted malformed ack')
    // Freshness: the composer must not be touched by a payload left in storage.
    const now = 1700000000000
    if (!bridgeQuoteIsFresh(quote, now, 10000)) throw new Error('a fresh quote was treated as stale')
    if (bridgeQuoteIsFresh(quote, now + 60000, 10000)) throw new Error('a stale quote was treated as fresh')
    if (bridgeQuoteIsFresh(null, now, 10000)) throw new Error('a missing quote was treated as fresh')
    if (bridgeParseWidth('340') !== 340 || bridgeParseWidth('') !== null || bridgeParseWidth('abc') !== null || bridgeParseWidth('-5') !== null) {
      throw new Error('divider width parsing is wrong')
    }
    ok('bridge protocol', 'quote/ack round trip, malformed payloads rejected, stale quotes ignored')
  } catch (e) {
    bad('bridge protocol', e && e.message ? e.message : String(e))
  }

  try {
    const { parseSettings, serializeSettings, normalizeSettings, DEFAULT_SETTINGS } = shared
    const defaults = parseSettings(null)
    if (JSON.stringify(defaults) !== JSON.stringify(DEFAULT_SETTINGS)) throw new Error('parseSettings(null) is not the defaults')
    if (parseSettings('{oops').autoRefresh !== true) throw new Error('corrupt JSON did not fall back to defaults')
    if (parseSettings('5').showFileTree !== true) throw new Error('a non-object entry did not fall back to defaults')
    const clamped = parseSettings('{"minPanelWidth":500,"previewHeight":"abc","showFileTree":0,"nonsense":1}')
    if (clamped.minPanelWidth !== 60) throw new Error('minPanelWidth was not clamped to its range: ' + clamped.minPanelWidth)
    if (clamped.previewHeight !== DEFAULT_SETTINGS.previewHeight) throw new Error('a non-numeric previewHeight did not fall back')
    if (clamped.showFileTree !== false) throw new Error('showFileTree was not coerced to a boolean')
    if ('nonsense' in clamped) throw new Error('an unknown key survived normalisation')
    // What the sidebar writes is what the popout reads.
    const roundTrip = parseSettings(serializeSettings(normalizeSettings({ previewHeight: 42 })))
    if (roundTrip.previewHeight !== 42) throw new Error('setting round trip lost previewHeight')
    ok('settings shape', 'defaults, clamping, boolean coercion and round trip')
  } catch (e) {
    bad('settings shape', e && e.message ? e.message : String(e))
  }

  // The panel's opening width is what a user sees first, and a regression to
  // "opens at the minimum again" breaks nothing else in this file — so the rule
  // is a pure function in src/shared/settings.js and is driven here.
  try {
    const { panelMinWidthPx, panelDefaultWidthPx, panelWidthPx, parseSettings, DEFAULT_SETTINGS } = shared
    const floor = 280 + 2   // list/tree floor + borders (see the pane-floor check)
    const def = parseSettings(null)
    const pct = (win, p) => Math.round(win * p / 100)
    // 默认面板宽度 is the headline. It came DOWN from 65% when the preview moved out
    // of the panel and into the popout tab: the panel holds one pane now, so a
    // two-thirds-wide sidebar would be mostly empty.
    if (DEFAULT_SETTINGS.defaultPanelWidth > 40) {
      throw new Error('the default panel width (' + DEFAULT_SETTINGS.defaultPanelWidth + '%) is still sized for a two-pane panel')
    }
    for (const win of [1920, 1280, 800]) {
      const got = panelWidthPx(win, def, null, floor)
      const want = Math.max(pct(win, DEFAULT_SETTINGS.defaultPanelWidth), panelMinWidthPx(win, def, floor))
      if (got !== want) throw new Error(`a ${win}px window opens ${got}px wide, want ${want}`)
    }
    // The panel is never narrower than the list floor lets it be.
    if (panelWidthPx(1920, def, null, floor) < floor) throw new Error('the panel opened below the list floor')
    // A drag wins — but never below the floor.
    if (panelWidthPx(1920, def, 700, floor) !== 700) throw new Error('a wide drag was not honoured')
    if (panelWidthPx(1920, def, 100, floor) !== panelMinWidthPx(1920, def, floor)) {
      throw new Error('a narrow drag was not clamped to the floor')
    }
    // The floor still wins when the configured minimum is raised past the default.
    const wide = parseSettings('{"minPanelWidth":60}')
    const floorWide = panelMinWidthPx(1920, wide, floor)
    if (floorWide !== pct(1920, 60)) throw new Error('a raised minimum is not the floor: ' + floorWide)
    if (panelWidthPx(1920, wide, 600, floor) !== floorWide) throw new Error('a drag below a raised minimum was not clamped')
    // Clamping applies to the default width too, and missing settings degrade to defaults.
    if (panelDefaultWidthPx(1920, parseSettings('{"defaultPanelWidth":500}'), floor) !== pct(1920, 85)) {
      throw new Error('defaultPanelWidth was not clamped to 20–85')
    }
    if (panelDefaultWidthPx(1920, parseSettings('{"defaultPanelWidth":"abc"}'), floor) !== panelDefaultWidthPx(1920, def, floor)) {
      throw new Error('a non-numeric defaultPanelWidth did not fall back')
    }
    ok('panel width', DEFAULT_SETTINGS.defaultPanelWidth + '% by default, drag wins, the list floor clamps')
  } catch (e) {
    bad('panel width', e && e.message ? e.message : String(e))
  }

  // The file-tree floor lives in THREE places: the panel's stylesheet, the
  // panel's width policy (the caller passes it), and the popout's stylesheet +
  // drag clamp. Neither CSS nor the popout's String.raw literal can interpolate a
  // constant, so the number is repeated — and a drift between them is invisible:
  // one half quietly starts ellipsizing file names while the other stays right.
  // The requirement ("a long name must survive two levels deep") is exactly this
  // number, so it is asserted, not assumed.
  try {
    const SITES = [
      ['src/client/styles.js', /--frog-pane-min-list:\s*min\((\d+)px,\s*(\d+)%\)/],
      ['src/host/page.js', /--f-pane-min-list:\s*min\((\d+)px,\s*(\d+)%\)/],
    ]
    const found = {}
    for (const [file, re] of SITES) {
      const m = re.exec(read(file))
      if (!m) throw new Error(file + ': no --*-pane-min-list floor')
      found[file] = { px: Number(m[1]), pct: Number(m[2]) }
    }
    const popoutCss = built ? (built.page.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1] : ''
    if (popoutCss) {
      const m = /--f-pane-min-list:\s*min\((\d+)px,\s*(\d+)%\)/.exec(popoutCss)
      if (!m) throw new Error('the popout <style> lost its list floor')
      found['popout <style>'] = { px: Number(m[1]), pct: Number(m[2]) }
    }
    const first = found['src/client/styles.js']
    // Both drag clamps, each with an explicit px constant AND a percentage
    // fallback so the clamp can never invert on a narrow window. The panel has no
    // splitter any more (one pane), so only the POPOUT still drags a divider.
    const popoutSrc = read('src/host/page.js')
    const popoutPx = /\bSPLIT_LIST_MIN\s*=\s*(\d+)/.exec(popoutSrc)
    const popoutPct = /Math\.min\(SPLIT_LIST_MIN,\s*avail \* ([0-9.]+)\)/.exec(popoutSrc)
    if (!popoutPx || !popoutPct) throw new Error('src/host/page.js: no SPLIT_LIST_MIN clamp (px and percentage fallback must both exist)')
    found['src/host/page.js'] = { px: Number(popoutPx[1]), pct: Math.round(Number(popoutPct[1]) * 100) }
    const panelConst = /\bSPLIT_LIST_MIN\s*=\s*(\d+)/.exec(read('src/client/components.js'))
    if (!panelConst) throw new Error('src/client/components.js: no SPLIT_LIST_MIN constant')
    found['src/client/components.js'] = { px: Number(panelConst[1]), pct: first.pct }
    // The panel no longer splits, so its "pane floor" is the list floor itself:
    // it must equal the CSS var it mirrors.
    const panelSrc = read('src/client/components.js')
    const panelFloor = /paneFloorPx\s*=\s*SPLIT_LIST_MIN\s*\+\s*(\d+)/.exec(panelSrc)
    if (!panelFloor) throw new Error('the panel no longer derives its width floor from SPLIT_LIST_MIN')
    const drift = []
    for (const [where, out] of Object.entries(found)) {
      if (out.px !== first.px || out.pct !== first.pct) {
        drift.push(`${where} = ${out.px}px/${out.pct}% vs src/client/styles.js ${first.px}px/${first.pct}%`)
      }
    }
    if (drift.length) throw new Error('the file-tree floor disagrees: ' + drift.join('; '))
    // A row spends ~46px on padding/twisty/icon plus 12px per indent level, so a
    // long file name (dsh-sidebar-frog.config.json) needs the better part of
    // 250px. Anything under 240 would truncate it two levels deep.
    if (first.px < 240) throw new Error('the file tree floor is only ' + first.px + 'px — file names truncate')
    ok('pane floors', `list ${first.px}px/${first.pct}% — identical in all ${Object.keys(found).length} places, panel floor = list + ${panelFloor[1]}px`)
  } catch (e) {
    bad('pane floors', e && e.message ? e.message : String(e))
  }

  // 弹出页预览区宽度 (80%) is where the popout's divider starts. The panel has no
  // preview at all any more, so this setting is popout-only — which is exactly
  // the sort of thing that rots silently if nothing watches it. Note the default
  // sits ON the ceiling: the clamp is 20–80, so the shipped starting point is the
  // widest the setting itself allows (a stored value or a drag can still differ).
  try {
    const { parseSettings, DEFAULT_SETTINGS } = shared
    // A default OUTSIDE its own clamp is the quiet kind of broken: nothing
    // throws, the value is simply rewritten on the first read, so the setting
    // opens at something other than what it says it defaults to. Checked BEFORE
    // the exact value, so raising the default past the ceiling reports the real
    // reason instead of "no longer defaults to 80%".
    const range = shared.SETTINGS_RANGES && shared.SETTINGS_RANGES.previewHeight
    if (!range) throw new Error('previewHeight no longer declares a range — nothing would keep a default honest')
    if (range[0] !== 20 || range[1] !== 80) throw new Error('the preview clamp moved to ' + range[0] + '–' + range[1] + ', so every expected value below is stale')
    if (DEFAULT_SETTINGS.previewHeight < range[0] || DEFAULT_SETTINGS.previewHeight > range[1]) {
      throw new Error('the default (' + DEFAULT_SETTINGS.previewHeight + '%) falls outside its own clamp ' + range[0] + '–' + range[1] + ' — it would be rewritten on the first read')
    }
    if (DEFAULT_SETTINGS.previewHeight !== 80) throw new Error('the preview no longer defaults to 80%: ' + DEFAULT_SETTINGS.previewHeight)
    const popout = read('src/host/page.js')
    if (!/previewHeight === 'number' \? SETTINGS\.previewHeight : 80/.test(popout)) throw new Error('the popout does not fall back to 80% for the divider')
    if (!/\.preview \{ flex: 0 1 auto; width: 80%/.test(popout)) throw new Error('the popout stylesheet does not pre-size the preview at 80%')
    if (parseSettings('{"previewHeight":500}').previewHeight !== 80) throw new Error('previewHeight is no longer clamped to 20–80')
    if (parseSettings('{"previewHeight":5}').previewHeight !== 20) throw new Error('previewHeight is no longer clamped to 20–80 (low end)')
    ok('popout preview', '80% of the split area (the ceiling of the 20–80 clamp, and inside it), and the popout stylesheet pre-sizes it identically')
  } catch (e) {
    bad('popout preview', e && e.message ? e.message : String(e))
  }

  try {
    const { relativeTime } = shared
    const t0 = 1700000000000
    const cases = [
      [0, ''],
      [null, ''],
      ['nonsense', ''],
      [t0, '刚刚'],
      [t0 - 90 * 1000, '1m'],
      [t0 - 3 * 3600 * 1000, '3h'],
      [t0 - 2 * 86400 * 1000, '2d'],
      // Clock skew (the browser is behind the host) must not read as the future.
      [t0 + 60000, '刚刚'],
    ]
    for (const [ts, want] of cases) {
      const got = relativeTime(ts, t0)
      if (got !== want) throw new Error(`relativeTime(${JSON.stringify(ts)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
    }
    ok('relative time', `${cases.length} cases (empty input, minute/hour/day, clock skew)`)
  } catch (e) {
    bad('relative time', e && e.message ? e.message : String(e))
  }

  // Containment is what the file trees key everything on, and the host can hand
  // out the same directory spelled two ways: a level's own path (a session cwd)
  // and the realpath'd entries below it. When those failed to match, the tree
  // painted fine and then silently forgot its expansion, lost the reveal walk and
  // printed absolute paths where relative ones belonged.
  try {
    const { pathUnder, pathRelativeTo, pathAncestorsOf } = shared
    const under = [
      ['D:\\ws\\src', 'D:\\ws', true],
      ['D:/ws/src', 'D:\\ws', true],          // separator differs
      ['d:\\ws\\src', 'D:\\ws', true],        // drive-letter case differs
      ['D:\\ws\\src', 'd:/ws', true],
      ['D:\\ws', 'D:\\ws', true],
      ['D:\\ws\\', 'D:\\ws', true],           // trailing separator
      ['D:\\wsx', 'D:\\ws', false],           // prefix of the NAME, not the path
      ['D:\\ws', 'D:\\ws\\src', false],
      ['D:\\ws\\src', '', false],
      ['/home/u/ws/src', '/home/u/ws', true],
      ['/home/u/ws', '/home/u/ws', true],
      ['/home/u/wsx', '/home/u/ws', false],
      // Case matters on POSIX, where it is a legal filename difference.
      ['/home/u/WS/src', '/home/u/ws', false],
      ['\\\\srv\\share\\a', '\\\\srv\\share', true],
    ]
    for (const [candidate, prefix, want] of under) {
      const got = pathUnder(candidate, prefix)
      if (got !== want) throw new Error(`pathUnder(${JSON.stringify(candidate)}, ${JSON.stringify(prefix)}) = ${got}, want ${want}`)
    }
    const rel = [
      ['D:\\ws\\src\\a.js', 'D:\\ws', 'src\\a.js'],
      ['D:\\ws\\src\\a.js', 'D:/ws', 'src\\a.js'],
      ['D:\\ws\\src\\a.js', 'D:\\ws\\', 'src\\a.js'],
      ['D:\\ws', 'D:\\ws', ''],
      ['C:\\other\\a.js', 'D:\\ws', 'C:\\other\\a.js'],   // not inside: label keeps it whole
      ['D:\\ws\\src\\a.js', '', 'D:\\ws\\src\\a.js'],
    ]
    for (const [full, root, want] of rel) {
      const got = pathRelativeTo(full, root)
      if (got !== want) throw new Error(`pathRelativeTo(${JSON.stringify(full)}, ${JSON.stringify(root)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
    }
    const ancestors = [
      ['D:\\ws\\src\\deep\\a.js', 'D:\\ws', ['D:\\ws\\src', 'D:\\ws\\src\\deep']],
      ['D:/ws/src/a.js', 'D:\\ws', ['D:/ws/src']],   // keeps the host's separators
      ['D:\\ws\\a.js', 'D:\\ws', []],                // top level: nothing to open
      ['D:\\ws', 'D:\\ws', []],
    ]
    for (const [full, root, want] of ancestors) {
      const got = pathAncestorsOf(full, root)
      if (got.join('|') !== want.join('|')) throw new Error(`pathAncestorsOf(${JSON.stringify(full)}, ${JSON.stringify(root)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
    }
    ok('path comparison', `${under.length + rel.length + ancestors.length} cases (separator, case, trailing separator, drive root)`)
  } catch (e) {
    bad('path comparison', e && e.message ? e.message : String(e))
  }
}

// The change review renders one row per line from this diff. It is shared by the
// panel and the popout page, so a wrong line number or a dropped context line
// shows up in both at once — and both are only visible in a browser.
if (shared) {
  try {
    const { diffLines, diffStats } = shared
    const same = diffLines('a\nb\n', 'a\nb\n')
    if (same.rows.length !== 2 || same.rows.some((r) => r.t !== 'ctx')) throw new Error('identical text produced changes: ' + JSON.stringify(same.rows))
    const changed = diffLines('a\nb\nc\n', 'a\nB\nc\n')
    if (changed.rows.length !== 4) throw new Error('a one-line change should keep its context: ' + JSON.stringify(changed.rows))
    const kinds = changed.rows.map((r) => r.t).join(',')
    if (kinds !== 'ctx,del,add,ctx') throw new Error('unexpected row kinds: ' + kinds)
    const del = changed.rows.find((r) => r.t === 'del')
    const add = changed.rows.find((r) => r.t === 'add')
    if (del.text !== 'b' || del.oldNo !== 2 || del.newNo !== null) throw new Error('the removed line is mislabelled: ' + JSON.stringify(del))
    if (add.text !== 'B' || add.newNo !== 2 || add.oldNo !== null) throw new Error('the added line is mislabelled: ' + JSON.stringify(add))
    const counts = diffStats(changed.rows)
    if (counts.add !== 1 || counts.del !== 1) throw new Error('stats are wrong: ' + JSON.stringify(counts))
    // A create has no "before": every line reads as an addition.
    const created = diffLines('', 'x\ny\n')
    if (created.rows.length !== 2 || created.rows.some((r) => r.t !== 'add')) throw new Error('a created file should read as all additions: ' + JSON.stringify(created.rows))
    // Newline shape must not invent a line (a trailing \n means "ends here").
    const trailing = diffLines('x\n', 'x\ny\n')
    if (trailing.rows.length !== 2 || trailing.rows[1].t !== 'add') throw new Error('the trailing newline produced a phantom row: ' + JSON.stringify(trailing.rows))
    // Beyond the exact-diff budget it degrades to replace-all instead of hanging.
    const bigA = new Array(3000).fill('a').join('\n')
    const bigB = new Array(3000).fill('b').join('\n')
    const huge = diffLines(bigA, bigB)
    if (!huge.truncated || huge.rows.length !== 6000) throw new Error('a huge rewrite did not degrade to a replace-all block: ' + huge.rows.length + ' rows, truncated=' + huge.truncated)
    ok('line diff', 'context kept, add/remove counted, create reads as additions, huge input bounded')
  } catch (e) {
    bad('line diff', e && e.message ? e.message : String(e))
  }
}

// A quote is a container for BLOCKS, and the renderer used to treat it as a run
// of inline text: it stripped the `>` and sent the remainder through the inline
// pass, so `> - a` painted the literal characters "- a". Every list, heading,
// fence, table and nested quote inside a quote came out as text, which is not a
// subtle drift — it is the marker showing up in the document.
//
// Loaded with `highlight.js` beside it, because a fenced block inside a quote
// reaches for `highlightCode`, which lives there rather than in markdown.js.
{
  try {
    const md = new Function(
      read('src/shared/highlight.js') + '\n' + read('src/shared/markdown.js') + '\nreturn { mdToHtml }',
    )()
    const cases = [
      ['a bullet list', '> - a\n> - b', (h) => h === '<blockquote><ul><li>a</li><li>b</li></ul></blockquote>'],
      ['an ordered list', '> 1. a\n> 2. b', (h) => h === '<blockquote><ol><li>a</li><li>b</li></ol></blockquote>'],
      ['a task list', '> - [x] done', (h) => h.includes('task-list-item') && h.includes('checked')],
      ['a heading', '> # Title', (h) => h === '<blockquote><h1>Title</h1></blockquote>'],
      ['a nested quote', '> > inner', (h) => h === '<blockquote><blockquote>inner</blockquote></blockquote>'],
      ['a table', '> | a | b |\n> |---|---|\n> | 1 | 2 |', (h) => h.startsWith('<blockquote><table>') && h.endsWith('</table></blockquote>')],
      ['a fenced block', '> ```js\n> const a = 1\n> ```', (h) => h.startsWith('<blockquote><pre><code>') && h.endsWith('</code></pre></blockquote>')],
      // The shape a plain quote already had must not move: no wrapper <p>, and
      // inline formatting still applied.
      ['a plain quote', '> hello', (h) => h === '<blockquote>hello</blockquote>'],
      ['inline inside a quote', '> **b** and `c`', (h) => h === '<blockquote><strong>b</strong> and <code>c</code></blockquote>'],
      // Two source lines are two paragraphs, exactly as they are outside a quote
      // — and the `</p>` must not be torn out of the middle of the run.
      ['two lines', '> one\n> two', (h) => h === '<blockquote><p>one</p>\n<p>two</p></blockquote>'],
    ]
    const wrong = cases
      .filter(([, src, want]) => !want(md.mdToHtml(src)))
      .map(([name, src]) => `${name} rendered as ${JSON.stringify(md.mdToHtml(src))}`)
    if (wrong.length) throw new Error(wrong.join(' | '))
    ok('markdown in blockquotes', `${cases.length} shapes: ${cases.map(([n]) => n).join(', ')}`)
  } catch (e) {
    bad('markdown in blockquotes', e && e.message ? e.message : String(e))
  }
}

// A list is a tree and a table cell is one cell. Both used to be read as flat
// text: every marker matched /^\s*[-*+]\s+/ with the indentation thrown away, so
// `- a` / `  - b` came out as two siblings and the structure the document
// expressed was simply gone; `tableCells` split on every `|`, so a cell holding
// an escaped pipe — a union type, a shell pipeline, a code span — was cut in
// half and every column after it shifted, which is worse than not rendering the
// table at all, because the result still looks like a table.
console.log('markdown lists and tables')
{
  try {
    const md = new Function(
      read('src/shared/highlight.js') + '\n' + read('src/shared/markdown.js') + '\nreturn { mdToHtml }',
    )()
    const cases = [
      // The nested list has to sit INSIDE the li it belongs to. Emitted as a
      // sibling the browser repairs it on its own, and no stylesheet can target
      // it — which is how the first version of this fix "passed" by eye.
      ['a nested bullet list', '- a\n  - b\n  - c\n- d', (h) => h === '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>'],
      ['a nested ordered list', '1. a\n   1. b\n2. c', (h) => h === '<ol><li>a<ol><li>b</li></ol></li><li>c</li></ol>'],
      ['mixed nesting', '- a\n  1. b\n  2. c', (h) => h === '<ul><li>a<ol><li>b</li><li>c</li></ol></li></ul>'],
      ['three levels', '- a\n  - b\n    - c', (h) => h === '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>'],
      ['a wrapped item', '- a long item\n  continued here\n- second', (h) => h === '<ul><li>a long item continued here</li><li>second</li></ul>'],
      ['a blank line between items', '- a\n\n- b', (h) => h === '<ul><li>a</li><li>b</li></ul>'],
      ['a second block in an item', '- a\n\n  more\n- b', (h) => h === '<ul><li>a more</li><li>b</li></ul>'],
      ['a list that starts at 3', '3. a\n4. b', (h) => h === '<ol start="3"><li>a</li><li>b</li></ol>'],
      ['a nested task list', '- [ ] a\n  - [x] b', (h) => h.includes('</li></ul></li></ul>') && h.includes('disabled checked')],
      ['a list inside a quote', '> - a\n>   - b', (h) => h === '<blockquote><ul><li>a<ul><li>b</li></ul></li></ul></blockquote>'],
      // The escaped pipe is the whole reason this check exists.
      ['an escaped pipe in a cell', '| k | v |\n|---|---|\n| `a \\| b` | union |', (h) => h.includes('<td><code>a | b</code></td><td>union</td>')],
      ['a cell that ends with an escaped pipe', '| k | v |\n|---|---|\n| x | a \\| |', (h) => h.includes('<td>a |</td>')],
      ['a setext title', 'Title\n=====', (h) => h === '<h1>Title</h1>'],
      // The flat shapes that were already right must not move.
      ['a flat bullet list', '- a\n- b', (h) => h === '<ul><li>a</li><li>b</li></ul>'],
      ['a flat ordered list', '1. a\n2. b', (h) => h === '<ol><li>a</li><li>b</li></ol>'],
      ['a task list', '- [x] done', (h) => h === '<ul><li class="task-list-item"><input type="checkbox" disabled checked> done</li></ul>'],
      ['an unescaped pipe still splits', '| a | b |\n|---|---|\n| 1 | 2 |', (h) => h.includes('<td>1</td><td>2</td>')],
    ]
    const wrong = cases
      .filter(([, src, want]) => !want(md.mdToHtml(src)))
      .map(([name, src]) => `${name} rendered as ${JSON.stringify(md.mdToHtml(src))}`)
    if (wrong.length) throw new Error(wrong.join(' | '))
    ok('markdown lists and tables', `${cases.length} shapes: ${cases.map(([n]) => n).join(', ')}`)
  } catch (e) {
    bad('markdown lists and tables', e && e.message ? e.message : String(e))
  }
}

// ── 3. popout page inline scripts ──────────────────────────────────────────
// The popout page is a String.raw template holding HTML with inline <script>
// blocks. As far as the host bundle is concerned that inline JS is just text
// inside a template literal, so a typo in it survives every parse of host.js and
// only shows up as a dead popout tab. Parse each block the way a browser would.
console.log('popout page inline scripts')
if (built) {
  const open = built.page.indexOf('`')
  const close = built.page.lastIndexOf('`')
  const html = open >= 0 && close > open ? built.page.slice(open + 1, close) : ''
  const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc=/.test(m[1]))
  if (!blocks.length) bad('popout page', 'no inline <script> block found')
  let parsed = 0
  for (const block of blocks) {
    const body = block[2]
    if (!body.trim()) continue
    try {
      // eslint-disable-next-line no-new-func
      new Function(body)
      parsed += 1
    } catch (e) {
      const line = (html.slice(0, block.index).match(/\n/g) || []).length + 1
      bad('popout page inline script', `does not parse (around page line ${line}): ${e && e.message ? e.message : e}`)
    }
  }
  if (parsed === blocks.filter((b) => b[2].trim()).length) ok('popout page', `${parsed} inline script block(s) parse`)

  // The popout tab is a separate document: it only reaches the main window
  // through the shared bridge. Assert every leg is wired, because a missing one
  // is invisible (the tab just quietly stops talking to the app).
  if (shared) {
    const legs = {
      'BRIDGE.session': 'follows the active workspace',
      'BRIDGE.settings': 'reads the shared settings',
      'BRIDGE.previewWidth': 'shares the divider position',
      'BRIDGE.quote': 'asks the main window to quote',
      'BRIDGE.ack': 'waits for the answer',
    }
    const missing = Object.entries(legs).filter(([token]) => !html.includes(token)).map(([token, why]) => `${token} (${why})`)
    if (missing.length) bad('popout page bridge', 'not wired: ' + missing.join(', '))
    else ok('popout page bridge', `${Object.keys(legs).length} legs wired (session, settings, divider, quote, ack)`)
  }
}

// ── 4. bundle freshness ────────────────────────────────────────────────────
console.log('bundle freshness')
if (built) {
  // Printed so it can be compared against a RUNNING process: the host logs
  // "[artifacts] dsh-sidebar-frog build <id>" at startup and the served page
  // carries <meta name="dsh-sidebar-frog-build" content="<id>">. A mismatch
  // means `dsh web` is still on an older build — or was only half restarted,
  // which breaks the cross-window bridge in ways that look like UI bugs.
  ok('build id', built.build + ' (host 启动日志 / 弹出页 <meta> 应一致)')
  const stale = []
  for (const [file, text] of [['src/host.js', built.host], ['src/client.js', built.client]]) {
    let onDisk = null
    try { onDisk = read(file) } catch (e) { onDisk = null }
    // The assembly is LF by construction (scripts/build.js normalises its
    // inputs), so a CRLF working tree — `core.autocrlf=true` on the machine this
    // is developed on — is the same artifact with different line endings, not a
    // stale one. Comparing raw text here reported "stale" on every Windows
    // checkout that had not been rebuilt in place, which is every fresh clone.
    if (onDisk !== null && onDisk.replace(/\r\n/g, '\n') === text) { ok(file, `${text.length} bytes, current`); continue }
    stale.push(file)
    if (fix) {
      writeFileSync(join(root, file), text)
      ok(file, onDisk === null ? 'written' : `rebuilt (was ${onDisk.length} bytes, now ${text.length})`)
    } else {
      bad(file, onDisk === null ? 'missing' : `stale: sources build ${text.length} bytes, file has ${onDisk.length}`)
    }
  }
  if (stale.length && !fix) console.error('    → run `npm run build` (or `node scripts/check.js --fix`) and re-run')
}

// ── 3. loadability ─────────────────────────────────────────────────────────
console.log('loadability')

{
  const src = built ? built.host : read('src/host.js')
  try {
    const plugin = new Function(src)()
    if (!plugin || typeof plugin.apply !== 'function') throw new Error('no apply export')
    // The host half must declare NO static service dependency. Cordis gates the
    // WHOLE `apply` on `inject`, and `webServer` exists only in the web profile —
    // naming it there is what kept this plugin from activating at all in a
    // headless assembly, taking the artifact waterfalls down with the HTTP half.
    // The web half is registered through `ctx.inject` instead; the headless and
    // web boots below drive both cases rather than trusting this shape.
    if (!Array.isArray(plugin.inject)) throw new Error('inject must be an array')
    if (plugin.inject.length) {
      throw new Error(`the host half must declare no static service dependency, found ${JSON.stringify(plugin.inject)} — a static inject gates the whole apply, so the artifact waterfalls go down with the HTTP half`)
    }
    ok('src/host.js', 'apply + inject [] (no static gate; webServer is injected dynamically)')
  } catch (e) {
    bad('src/host.js', e && e.message ? e.message : String(e))
  }
}

// Boots the client bundle against a minimal runtime. Returns the handles the
// checks below need — the registered slots, the window listeners the plugin
// installed (so the cross-window bridge can be driven), and the composer draft
// the quote path writes into.
const bootClient = (options) => {
  const opts = options || {}
  const src = built ? built.client : read('src/client.js')
  let config = null
  const registered = []
  const registrations = []
  // Every registration the client half made OUTSIDE an effect callback. The shell
  // hot-swaps a rebuilt client plugin by disposing its fiber and applying the new
  // module (dsh-client-hmr's reload), so a registration that never reached the
  // fiber outlives its module — see the hot-swap section at the end of this file.
  const unbound = []
  // Whether `ctx.effect(fn)` is currently running `fn`: the slot service binds
  // itself (its own `inject` calls `ctx.effect` internally), so only DIRECT
  // registry calls are the plugin's own responsibility.
  let effectDepth = 0
  // What `ctx.effect` collected, in order. `dispose()` runs them the way the
  // shell does when it swaps a bundle out.
  const fiberDisposers = []
  // Each seat the client half injected into. A keyed seat that only exists while
  // a session view is mounted (`sidebar.right.pane.tab` is a child of
  // `rightbar.session`) must be registered THROUGH inject, not before it.
  const injectedSeats = []
  // Every tab TYPE the client half registered into the shell's registry. Empty
  // unless the stub provides the service (opts.sidebarRight).
  const tabs = []
  const listeners = {}
  const store = Object.assign({}, opts.storage)
  const draft = { value: opts.draft || '' }
  // The sessions-list subscribers the plugin installed for its default page, so a
  // check can drive a session switch (and assert the subscription is released).
  let sessionSubs = []
  const React = opts.react || {
    createElement: (type, elProps, ...children) => ({ type, props: Object.assign({}, elProps || {}, { children }) }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useMemo: (fn) => (typeof fn === 'function' ? fn() : fn),
    useCallback: (fn) => fn,
  }
  const slots = {
    inject: (name, fn) => {
      injectedSeats.push(name)
      // The real service wraps this callback in `ctx.effect` itself (see
      // dsh-client-ui-renderer's slots service: `inject(key, callback)` opens with
      // `ctx.effect(...)`), so a registration made inside an inject callback has
      // reached the fiber and must not be reported as unbound.
      effectDepth += 1
      let out
      try {
        out = fn()
      } finally {
        effectDepth -= 1
      }
      // The seat's own idiom allows a callback that RETURNS a disposer
      // (ui-sidebar-documentpreview) or a GENERATOR that yields one per
      // registration (ui-sidebar-right). A generator body does not run until it
      // is iterated, so the stub must iterate or every registration inside it
      // would silently vanish — exactly the bug this stub exists to catch.
      if (out && typeof out[Symbol.iterator] === 'function') {
        for (const disposer of out) void disposer
      }
      return () => {}
    },
    register: (def, component) => {
      const name = def && (def.id || def.name)
      registered.push(name)
      registrations.push({ def: def || {}, name, key: def && def.key, component })
      return () => {}
    },
  }
  const sidebarRightTabs = {
    register: (def) => {
      // A registration that never reached the plugin's fiber is the bug the hot
      // swap section drives: it survives the swap and collides with the fresh
      // one, so it is recorded here as well as refused.
      if (effectDepth === 0) unbound.push('sidebarRightTabs.register(' + (def && def.id) + ')')
      // A registry refuses an id it already holds, or a kind it cannot coexist
      // with; `sidebarRightRejects` stands in for that refusal.
      if (opts.sidebarRightRejects) throw new Error('the tab id is already registered')
      // Faithful to the product: an id already in the registry THROWS, which is
      // exactly what a leaked registration from a hot-swapped bundle causes.
      if (tabs.some((t) => t.id === (def && def.id))) throw new Error('the tab id is already registered: ' + (def && def.id))
      tabs.push(def)
      return () => {
        const at = tabs.indexOf(def)
        if (at >= 0) tabs.splice(at, 1)
      }
    },
  }
  // The shell's document-preview registry. Faithful where it matters: extension
  // matching, the extension-beats-builtin band rule, longest-suffix ordering, and
  // a duplicate live id throwing. The product's own Markdown renderer is seeded
  // only when a check asks for it (`shellMarkdown`), because taking that suffix
  // over is exactly what the plugin does and what has to be observable.
  const documents = []
  let docDisposals = 0
  const longestSuffix = (def, name) => Math.max.apply(null, (def.extensions || []).map((e) => (name.slice(-(e.length + 1)) === '.' + e ? e.length : 0)))
  const bandOf = (def) => (def.priority === 'extension' ? 0 : def.priority === 'fallback' ? 2 : 1)
  const documentPreviews = {
    definitions: documents,
    get disposals() { return docDisposals },
    register(def) {
      if (effectDepth === 0) unbound.push('documentPreviews.register(' + def.id + ')')
      if (documents.some((d) => d.id === def.id)) throw new Error('duplicate live implementation name: ' + def.id)
      documents.push(def)
      let live = true
      return () => {
        if (!live) return
        live = false
        const at = documents.indexOf(def)
        if (at >= 0) documents.splice(at, 1)
        docDisposals += 1
      }
    },
    candidates(path) {
      const name = String(path || '').toLowerCase()
      return documents
        .filter((d) => longestSuffix(d, name) > 0)
        .slice()
        .sort((a, b) => (bandOf(a) - bandOf(b)) || (longestSuffix(b, name) - longestSuffix(a, name)))
    },
  }
  if (opts.shellMarkdown) {
    documents.push({
      id: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/markdown',
      extensions: ['md', 'markdown'],
      priority: 'builtin',
      title: () => 'Markdown',
      loading: 'text-pages',
      wrap: false,
    })
  }
  for (const extra of opts.extraDocumentPreviews || []) documents.push(extra)
  // The shell's navigation face, as our code uses it: `openTab(kind)` for the
  // system tabs this plugin opens itself, `openResource(address)` for handing a
  // file to whichever renderer the shell would pick. Both are recorded so a check
  // can assert what a click actually asked the shell to do.
  //
  // `column.activeTab` stands in for the mounted column's active tab — the shell's
  // `ISidebarRight.active()`. `undefined` is the state that matters most: a
  // session's surface starts with NO tab at all, which is the only state the
  // plugin's default page (see native.js) is allowed to fill. An open fills it, so
  // a second attempt in the same session sees a used column, exactly as the real
  // one would.
  const column = { activeTab: opts.columnTab }
  const openedTabs = []
  const openedResources = []
  const sidebarRight = {
    openTab: (kind) => { openedTabs.push(kind); column.activeTab = kind },
    openResource: (address) => { openedResources.push(address); column.activeTab = address },
    active: () => column.activeTab,
    isExpanded: () => column.activeTab !== undefined,
  }
  const ctx = {
    get: (name) => {
      if (name === 'slots') return slots
      if (name === 'sidebarRightTabs') return opts.sidebarRight ? sidebarRightTabs : undefined
      if (name === 'sidebarRight') return opts.sidebarRight ? sidebarRight : undefined
      if (name === 'documentPreviews') return opts.noDocumentPreviews ? undefined : documentPreviews
      if (opts.noComposer) return undefined
      if (name === 'sessions') {
        return {
          // The product's own shape: a list snapshot with the current id and the
          // per-session summaries. `blank` is the flag the shell itself uses for
          // "never ran a turn" (ui-workspace reuses exactly those for 新建会话),
          // and it is what the plugin's default page keys on — so it is opt-in
          // here, and every other check boots a session that has been used.
          list: {
            getSnapshot: () => ({
              current: 's1',
              ids: ['s1'],
              byId: { s1: { id: 's1', blank: opts.blankSession === true } },
            }),
            subscribe: (fn) => {
              sessionSubs.push(fn)
              return () => { sessionSubs = sessionSubs.filter((f) => f !== fn) }
            },
          },
          scope: () => ({}),
        }
      }
      if (name === 'conversation') {
        return {
          input: {
            for: () => ({
              state: { getSnapshot: () => ({ draft: draft.value }) },
              setDraft: (v) => { draft.value = v },
            }),
          },
        }
      }
      return undefined
    },
    interval: () => () => {},
    on: () => {},
    // Faithful to cordis: `effect(cb)` runs cb NOW and keeps its disposer for the
    // fiber. Everything the client half registers outside of one is recorded as
    // unbound and asserted against.
    effect: (fn) => {
      effectDepth += 1
      let dispose
      try {
        dispose = fn()
      } finally {
        effectDepth -= 1
      }
      if (typeof dispose === 'function') fiberDisposers.push(dispose)
      else if (dispose && typeof dispose[Symbol.iterator] === 'function') for (const d of dispose) fiberDisposers.push(d)
      return () => { if (typeof dispose === 'function') { try { dispose() } catch (e) {} } }
    },
  }
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  }
  const window = {
    __ModuleLoader__: { load: (cfg) => { config = cfg } },
    innerWidth: 1440,
    innerHeight: 900,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn) },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn) },
  }
  // `document` is deliberately not passed by default: the plugin must survive
  // without one (that is the documented `typeof document === 'undefined'`
  // guard). A test that wants to RENDER a component passes a stub instead.
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', 'setTimeout', 'clearTimeout', 'document', 'fetch', 'setInterval', 'clearInterval', src)(
    window, localStorage, () => 0, () => {},
    opts.document, opts.fetch || fetch, opts.setInterval || setInterval, opts.clearInterval || clearInterval,
  )
  if (!config) throw new Error('never called window.__ModuleLoader__.load')
  if (config.id !== 'dsh-sidebar-frog') throw new Error(`loader id is ${JSON.stringify(config.id)}`)
  const mod = config.factory((name) => {
    if (name === 'react') return React
    throw new Error('module unavailable: ' + name)
  })
  if (typeof mod.apply !== 'function') throw new Error('no apply export')
  mod.apply(ctx)
  return {
    registered,
    registrations,
    injectedSeats,
    tabs,
    unbound,
    documentPreviews,
    openedTabs,
    openedResources,
    column,
    sessionSubs: () => sessionSubs.slice(),
    listeners,
    store,
    draft,
    emit: (type, event) => { (listeners[type] || []).forEach((fn) => fn(event)) },
    // The two halves of a HOT SWAP, driven separately on purpose: the shell
    // disposes the old fiber's effects, then applies the rebuilt module. Calling
    // them in this order is what reproduces "the panel fell back to the original
    // interface after a rebuild, and only a restart brought the tabs back".
    dispose: () => {
      while (fiberDisposers.length) {
        const dispose = fiberDisposers.pop()
        try { dispose() } catch (e) {}
      }
    },
    apply: () => mod.apply(ctx),
  }
}

// ── The panel's two surfaces ────────────────────────────────────────────────
// The panel is a NATIVE tab of the shell's own right sidebar when that registry
// is available, and the floating overlay when it is not. Both paths ship, and
// every way they can go wrong is silent: a tab type registered without its body
// leaves the seat's "nothing can view this" notice, and keeping the overlay
// alive next to it puts the duplicated sidebar toggle back in the header's
// share-button cluster. So each path — and the refusal that must fall back — is
// driven here.
{
  try {
    const { registered, listeners, tabs } = bootClient()
    const want = ['dsh-sidebar-frog-trigger', 'dsh-sidebar-frog-panel', 'dsh-sidebar-frog']
    const missing = want.filter((id) => !registered.includes(id))
    if (missing.length) throw new Error('slots not registered: ' + missing.join(', '))
    if (!(listeners.storage || []).length) throw new Error('the cross-window bridge installed no storage listener')
    if (tabs.length) throw new Error('a native tab was registered with no registry to register into')
    ok('src/client.js', `factory runs, overlay fallback, slots ${registered.join(' + ')}`)
  } catch (e) {
    bad('src/client.js', e && e.message ? e.message : String(e))
  }
}

{
  try {
    const { registered, tabs, registrations, injectedSeats } = bootClient({ sidebarRight: true })
    // Every VIEW is its own system tab, so the assertion is against the exact set
    // the plugin is supposed to occupy — not against a count that goes stale the
    // moment a view is added or removed.
    const WANT = [
      { id: 'dsh-sidebar-frog/files', kind: 'files' },
      { id: 'dsh-sidebar-frog/artifacts', kind: 'frog-artifacts' },
      { id: 'dsh-sidebar-frog/jobs', kind: 'frog-jobs' },
      { id: 'dsh-sidebar-frog/usage', kind: 'frog-usage' },
      { id: 'dsh-sidebar-frog/git', kind: 'frog-git' },
    ]
    const gotIds = tabs.map((t) => t.id)
    if (JSON.stringify(gotIds) !== JSON.stringify(WANT.map((w) => w.id))) {
      throw new Error('registered tab types are ' + JSON.stringify(gotIds) + ', expected ' + JSON.stringify(WANT.map((w) => w.id)))
    }
    for (const want of WANT) {
      const def = tabs.find((t) => t.id === want.id)
      if (def.kind !== want.kind) throw new Error(want.id + ' registers kind ' + JSON.stringify(def.kind) + ', expected ' + JSON.stringify(want.kind))
      if (def.priority !== 'extension') {
        throw new Error(want.id + ' must declare the extension band (got ' + JSON.stringify(def.priority) + ')')
      }
      if (def.patterns) throw new Error(want.id + ' is a page type — it must not claim resource addresses')
      if (typeof def.title !== 'function' || !def.title('sidebar://' + want.kind)) {
        throw new Error(want.id + ' has no usable title')
      }
      // One guide entry per type, so the chooser page lists every view. Each row
      // must carry its OWN entry: entries are what the guide renders, and an
      // entry-less view would be unreachable from the chooser.
      if (!Array.isArray(def.guide) || def.guide.length !== 1) {
        throw new Error(want.id + ' must contribute exactly one guide entry (got ' + ((def.guide || []).length) + ')')
      }
      const entry = def.guide[0]
      if (typeof entry.title !== 'function' || !entry.title()) throw new Error(want.id + '\'s guide entry has no title')
      if (typeof entry.description !== 'function' || !entry.description()) throw new Error(want.id + '\'s guide entry has no description')
      if (typeof entry.order !== 'number') throw new Error(want.id + '\'s guide entry has no order')
    }
    // Distinct orders, or the guide's own ordering is arbitrary between them.
    const orders = tabs.map((t) => t.guide[0].order)
    if (new Set(orders).size !== orders.length) throw new Error('two views share a guide order: ' + JSON.stringify(orders))
    // The tree occupies the product's own kind: the column's 文件 tab must BE this
    // plugin's tree (the product's tree carries no @引用 and no right-click menu at
    // all), and the extension band is what makes that takeover legal — "an
    // extension may register a kind a builtin already holds".
    const files = tabs.find((t) => t.id === 'dsh-sidebar-frog/files')
    if (files.kind !== 'files') {
      throw new Error('the tree must occupy the column\'s 文件 kind, not a kind of its own')
    }
    // Every type has a body, keyed by its OWN id — the seat looks a body up by
    // `entryKey`, which is the definition's id, never the kind.
    const bodies = registrations.filter((r) => r.def.name === 'sidebar.right.pane.tab')
    for (const want of WANT) {
      const body = bodies.find((r) => r.def.key === want.id)
      if (!body) throw new Error('no body registered for ' + want.id + ' (keys: ' + JSON.stringify(bodies.map((r) => r.def.key)) + ')')
      if (typeof body.component !== 'function') throw new Error(want.id + '\'s body is not a component')
    }
    if (!injectedSeats.includes('sidebar.right.pane.tab')) {
      throw new Error('the bodies were registered without injecting into the seat — the seat only exists once a session view is mounted')
    }
    if (registered.includes('dsh-sidebar-frog-trigger') || registered.includes('dsh-sidebar-frog-panel')) {
      throw new Error('the floating panel is still registered next to the native tabs — that is the duplicate sidebar toggle')
    }
    if (!registered.includes('dsh-sidebar-frog')) throw new Error('the settings section disappeared')
    ok('native tabs', `one system tab per view (${gotIds.length}), each with its own guide entry and its own keyed body`)
  } catch (e) {
    bad('native tabs', e && e.message ? e.message : String(e))
  }
}

// Handing the kind back: with 『用系统右侧边栏承载面板』off the column must get the
// product's own tree again and this plugin must go back to its floating window —
// that is the escape hatch for anyone who prefers the builtin, and the reason the
// takeover is safe to ship at all.
{
  try {
    const off = shared.serializeSettings(shared.normalizeSettings({ nativeFileTree: false }))
    const { registered, tabs, registrations, injectedSeats } = bootClient({ sidebarRight: true, storage: { [shared.BRIDGE.settings]: off } })
    if (tabs.length) throw new Error('the files kind was taken over while the setting was off')
    if (registrations.some((r) => r.def.name === 'sidebar.right.pane.tab')) {
      throw new Error('a tab body was registered for a kind we do not occupy')
    }
    if (injectedSeats.includes('sidebar.right.pane.tab')) throw new Error('the seat was injected into with nothing to put in it')
    if (!registered.includes('dsh-sidebar-frog-panel')) {
      throw new Error('the floating panel did not come back — switching the surface off would leave no panel at all')
    }
    ok('native tab (handed back)', 'switched off, the column keeps the product\'s own file tree and the panel floats again')
  } catch (e) {
    bad('native tab (handed back)', e && e.message ? e.message : String(e))
  }
}

// A registry that refuses us (the id is taken, or the contract moved on) must
// cost the user the native surface, never the panel itself.
{
  try {
    const { registered, tabs } = bootClient({ sidebarRight: true, sidebarRightRejects: true })
    if (tabs.length) throw new Error('a refused registration was kept')
    if (!registered.includes('dsh-sidebar-frog-panel')) throw new Error('the panel vanished instead of falling back')
    if (registered.some((id) => id === 'sidebar.right.pane.tab')) {
      throw new Error('a body was registered for a type the registry refused')
    }
    ok('native tab (refused)', 'a rejecting registry falls back to the floating panel')
  } catch (e) {
    bad('native tab (refused)', e && e.message ? e.message : String(e))
  }
}

// ── The column's own entry points ───────────────────────────────────────────
// Two product behaviours leave this plugin's tree out of reach in native mode,
// and both are silent (no error, no fallback — just a column the user cannot
// open, or one that opens on something else):
//
//   · a BLANK session hides the conversation header, and the shell's ONLY expand
//     control is registered into that header's corner — so before the first
//     message there is nothing to click at all;
//   · when the column can be opened, `defaultSeed` resolves to the chooser page
//     whenever more than one guide entry exists (this plugin registers five).
//
// So the plugin registers a standing 文件树 button in the LEFT sidebar's footer
// (rendered in every state, hero screen included) and opens 文件 itself for a
// blank session whose column holds no tab yet. Both are asserted here, together
// with the rules that keep the default page from ever taking over a column the
// user is using.
//
// The seat's occupant is ONE stack holding BOTH controls (文件树 + 弹出页), so a
// control is reached through the stack by its own `data-frog-footer` identity
// rather than by being the occupant itself — see the layout guard below for why
// there is exactly one of each.
const footKid = (stack, id) => {
  const kids = (stack && stack.props && stack.props.children) || []
  const found = kids.filter((c) => c && c.props && c.props['data-frog-footer'] === id)
  if (found.length !== 1) {
    throw new Error('the footer seat holds ' + found.length + ' ' + JSON.stringify(id) + ' control(s), want exactly 1 (stack children: '
      + JSON.stringify(kids.map((c) => (c && c.props && c.props['data-frog-footer']) || (c && c.type))) + ')')
  }
  return found[0]
}
{
  try {
    const boot = bootClient({ sidebarRight: true })
    const entry = boot.registrations.find((r) => r.def.name === 'sidebar.footer.action')
    if (!entry) throw new Error('no footer entry point was registered — a blank session would have no way to open the column')
    if (entry.def.id !== 'dsh-sidebar-frog-foot') throw new Error('the footer entry is registered as ' + JSON.stringify(entry.def.id))
    if (typeof entry.def.order !== 'number') throw new Error('the footer entry has no order')
    if (!boot.injectedSeats.includes('sidebar.footer.action')) {
      throw new Error('the footer entry was registered without injecting into the shell\'s seat')
    }
    if (typeof entry.component !== 'function') throw new Error('the footer entry is not a component')
    // Rendered through the harness's React stub: the descriptor is what a click
    // would reach, so the button's identity and its one action are both checkable.
    const wide = footKid(entry.component({ wide: true }), 'files')
    if (wide.type !== 'button') throw new Error('the footer 文件树 control is a <' + wide.type + '>, want a real button')
    if (wide.props['aria-label'] !== '打开文件树') throw new Error('the footer button has no accessible name')
    const labels = (wide.props.children || []).filter((c) => c && c.type === 'span').map((c) => c.props.children)
    if (labels.join('') !== '文件树') throw new Error('the expanded footer button does not say 文件树: ' + JSON.stringify(labels))
    const rail = footKid(entry.component({ wide: false }), 'files')
    const railLabels = (rail.props.children || []).filter((c) => c && c.type === 'span')
    if (railLabels.length) throw new Error('the rail button still draws a label — it is a 36px round icon there')
    wide.props.onClick()
    if (String(boot.openedTabs) !== 'files') {
      throw new Error('the footer button opened ' + JSON.stringify(boot.openedTabs) + ', not the 文件 page')
    }
    ok('column entry point', 'a standing 文件树 button in the left sidebar\'s foot opens the column\'s 文件 page (present in every state, hero screen included)')
  } catch (e) {
    bad('column entry point', e && e.message ? e.message : String(e))
  }
}

// ── 底栏那两颗按钮必须竖着排，而且必须同属一个席位 ──────────────────────────
// The seat is laid out by the SHELL, as a ROW, in both fold states
// (`dsh-client-ui-sidebar`: `.footerActions{display:flex}`; in the rail
// `justify-content:center;width:auto`). Two registered entries therefore always
// land side by side — and in the rail they do not even fit: 56px
// (`SIDEBAR_COLLAPSED`, ui-layout) minus 10px of inline padding is a 36px content
// box for a 36px button, so the second one hung outside the rail. That is what
// shipped, and this suite said nothing, because every guard around it asked only
// whether a control EXISTS.
//
// The fix is one occupant that owns its own direction, and three things make it
// hold — all asserted here: the seat holds exactly ONE registration; that
// occupant is a column; and both controls are inside it, in order.
{
  try {
    const boot = bootClient({ sidebarRight: true })
    const seat = boot.registrations.filter((r) => r.def.name === 'sidebar.footer.action')
    if (seat.length !== 1) {
      throw new Error('the footer seat holds ' + seat.length + ' registration(s) — the shell lays that seat out as a ROW, so a second one sits beside the first instead of under it')
    }
    const wide = seat[0].component({ wide: true })
    if (wide.type !== 'div') {
      throw new Error('the footer occupant is a <' + wide.type + '>, not an element that can own a direction')
    }
    if (!/(^|\s)artifacts-foot-stack(\s|$)/.test(String(wide.props.className))) {
      throw new Error('the footer occupant does not carry the stacking class (' + JSON.stringify(wide.props.className) + ')')
    }
    if (!/(^|\s)is-wide(\s|$)/.test(String(wide.props.className))) {
      throw new Error('the expanded footer occupant does not carry is-wide, so the stack would draw rail-sized icons in the wide column')
    }
    const kids = (wide.props.children || []).map((c) => (c && c.props && c.props['data-frog-footer']) || (c && c.type))
    if (kids.join('/') !== 'files/popout') {
      throw new Error('the footer stack holds ' + JSON.stringify(kids) + ', want 文件树 above 弹出页')
    }
    const rail = seat[0].component({ wide: false })
    if (/(^|\s)is-wide(\s|$)/.test(String(rail.props.className))) {
      throw new Error('the collapsed footer stack claims is-wide — its rows would try to fill a 36px rail')
    }
    // The direction itself, matched as a RULE DECLARATION (selector list first)
    // rather than as a mention of the name — the lesson from the menu-row guard,
    // where a rule that merely mentioned the class kept passing after the real one
    // was deleted.
    const css = read('src/client/styles.js')
    if (!/(^|\n)\.artifacts-foot-stack \{[^}]*flex-direction: column[^}]*\}/.test(css)) {
      throw new Error('no .artifacts-foot-stack rule declares flex-direction: column — the shell\'s own footer row would put the two controls back side by side')
    }
    if (!/\.artifacts-foot-stack\.is-wide \{[^}]*align-items: stretch/.test(css)) {
      throw new Error('the wide stack does not stretch its rows, so the 42px rows would not fill the foot')
    }
    // …and the row rule that predates the column must not win back the size: its
    // `calc(100% + 4px)` with `margin: 0 -2px` was written for a flex ROW, and in
    // this column it would bleed the rows 2px past the foot on both sides.
    if (!/\.artifacts-foot-stack\.is-wide \.artifacts-foot-btn\.is-wide \{[^}]*width: auto[^}]*margin: 0;/.test(css)) {
      throw new Error('the wide rows are still sized by the old flex-ROW rule (calc(100% + 4px) with a negative margin), so they overhang the foot')
    }
    ok('footer actions stacked', 'ONE occupant in the shell\'s footer seat drawing 文件树 above 弹出页 as a column (two round icons in the 36px rail, two full-width rows above Settings when expanded)')
  } catch (e) {
    bad('footer actions stacked', e && e.message ? e.message : String(e))
  }
}

// The overlay fallback must NOT take this over: there the panel is ours, its own
// corner button already exists, and a second entry point in the shell's foot
// would be a duplicate control for a column that is not even ours.
{
  try {
    const boot = bootClient()
    if (boot.registrations.some((r) => r.def.name === 'sidebar.footer.action')) {
      throw new Error('the footer entry point is registered on the floating surface, where the corner button already opens the panel')
    }
    if (boot.injectedSeats.includes('sidebar.footer.action')) {
      throw new Error('the shell\'s footer seat was injected into on the floating surface')
    }
    ok('column entry point (floating surface)', 'no second entry point beside the overlay\'s own corner button')
  } catch (e) {
    bad('column entry point (floating surface)', e && e.message ? e.message : String(e))
  }
}

// ── 弹出页在原生形态下的入口 ────────────────────────────────────────────────
// The floating panel owns two links to the popout page — its own top bar while it
// is open, the corner switch while it is closed — and NEITHER of them is
// registered when the column carries the panel (src/client/body.js registers both
// only `if (!frogNativeSurface)`). A native surface that brings no entry of its
// own therefore leaves 「一键弹出到独立标签页」 with no way in at all, while the
// README keeps promising it. That is not hypothetical: it is what shipped, and
// nothing in this suite noticed, because every check above asks about the overlay.
//
// So both native entries are driven here, plus the rule that keeps the per-tab one
// off other people's tabs, plus the shared browsing context all four links use.
{
  try {
    const boot = bootClient({ sidebarRight: true })
    // One browsing-context name for all four links: a second one would pile up a
    // second browser tab, and the two halves would drift apart silently.
    const named = /POPOUT_TARGET = '([^']+)'/.exec(read('src/client/components.js'))
    if (!named) throw new Error('the popout browsing-context name is gone')
    const target = named[1]

    // (1) The VISIBLE entry: a standing link in the left sidebar's foot, in the
    // same seat and the same stack as 文件树 (the only seat that exists while the
    // column is collapsed, and in a blank session's hero screen).
    const foot = boot.registrations.filter((r) => r.def.name === 'sidebar.footer.action')
    const link = foot.find((r) => r.def.id === 'dsh-sidebar-frog-foot')
    if (!link) {
      throw new Error('the native surface offers no 弹出 entry in the shell\'s footer (footer ids: '
        + JSON.stringify(foot.map((r) => r.def.id)) + ') — the panel\'s own two links are not registered on this surface, so the popout page has no way in')
    }
    if (typeof link.def.order !== 'number') throw new Error('the footer 弹出 entry has no order')
    if (typeof link.component !== 'function') throw new Error('the footer 弹出 entry is not a component')
    const wide = footKid(link.component({ wide: true }), 'popout')
    // An ANCHOR, not a button calling window.open: a blocked popup would make the
    // click look dead, and only a real navigation gives the browser's own
    // "open in new tab" affordances.
    if (wide.type !== 'a') throw new Error('the footer 弹出 entry is a <' + wide.type + '> — a blocked window.open is exactly the failure the anchor form avoids')
    if (String(wide.props.href).indexOf('/dsh-sidebar-frog') !== 0) {
      throw new Error('the footer 弹出 entry points at ' + JSON.stringify(wide.props.href))
    }
    if (String(wide.props.href).indexOf('sessionId=') < 0) {
      throw new Error('the footer 弹出 entry does not carry the session: ' + JSON.stringify(wide.props.href) + ' — the popout page would root its tree at the wrong workspace')
    }
    if (wide.props.target !== target) {
      throw new Error('the footer 弹出 entry opens ' + JSON.stringify(wide.props.target) + ', want the shared ' + JSON.stringify(target))
    }
    if (wide.props['aria-label'] !== '弹出到独立标签页') throw new Error('the footer 弹出 entry has no accessible name')
    const wideLabels = (wide.props.children || []).filter((c) => c && c.type === 'span').map((c) => c.props.children)
    if (wideLabels.join('') !== '弹出页') throw new Error('the expanded footer entry does not say 弹出页: ' + JSON.stringify(wideLabels))
    const rail = footKid(link.component({ wide: false }), 'popout')
    if ((rail.props.children || []).filter((c) => c && c.type === 'span').length) {
      throw new Error('the rail 弹出 entry still draws a label — it is a 36px round icon there')
    }

    // (2) The per-tab entry, in the column's own actions menu. Worth knowing while
    // reading this: that menu opens on RIGHT-CLICK of a tab chip (the kit's chip
    // has no visible trigger), which is why it is the secondary way out.
    if (!boot.injectedSeats.includes('sidebar.right.tab.menu.item')) {
      throw new Error('the column\'s tab-menu seat was never injected into — the per-tab 弹出 item cannot be registered without it')
    }
    const item = boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.menu.item')
    if (!item) throw new Error('no per-tab 弹出 item was registered')
    // Looked up by the seat name, so the ID is pinned here as well: a renamed one
    // still lands in the menu (the shell only needs it to be unique), which means
    // a check that stops at the seat name would keep passing while the item's
    // identity drifted. (Found by mutation: renaming the id survived the first
    // version of this guard.)
    if (item.def.id !== 'dsh-sidebar-frog-popout-tab') {
      throw new Error('the per-tab 弹出 item is registered as ' + JSON.stringify(item.def.id))
    }
    if (typeof item.def.order !== 'number') throw new Error('the per-tab 弹出 item has no order')
    if (typeof item.component !== 'function') throw new Error('the per-tab 弹出 item is not a component')
    // Answered for THIS plugin's tabs — current kinds and every retired name a
    // restored tab can still carry — and for nothing else.
    const ours = ['files', 'frog-artifacts', 'frog-jobs', 'frog-usage', 'frog-git', 'frog', 'frog-browser']
    for (const kind of ours) {
      const rendered = item.component({ tab: { kind, id: 't1' }, dismiss: () => {} })
      if (!rendered || rendered.type !== 'a') {
        throw new Error('the per-tab 弹出 item draws nothing on this plugin\'s own ' + JSON.stringify(kind) + ' tab')
      }
      if (rendered.props.target !== target) {
        throw new Error('the per-tab 弹出 item opens ' + JSON.stringify(rendered.props.target) + ', want the shared ' + JSON.stringify(target))
      }
      if (rendered.props.role !== 'menuitem') throw new Error('the per-tab 弹出 item is not a menu item (role: ' + JSON.stringify(rendered.props.role) + ')')
      if (String(rendered.props.href).indexOf('sessionId=') < 0) {
        throw new Error('the per-tab 弹出 item does not carry the session: ' + JSON.stringify(rendered.props.href))
      }
    }
    // The dismiss contract, driven: the menu is the kit's and closes only on its
    // own actions, so an item that acts must dismiss it.
    let dismissed = 0
    item.component({ tab: { kind: 'files', id: 't1' }, dismiss: () => { dismissed += 1 } }).props.onClick()
    if (dismissed !== 1) throw new Error('the per-tab 弹出 item did not dismiss the menu it acted from (' + dismissed + ' dismissals)')
    // Somebody else's tab: the product's chooser, another plugin's panel.
    for (const kind of ['guide', 'files-other-plugin', 'frog-unknown']) {
      const foreign = item.component({ tab: { kind, id: 't2' }, dismiss: () => {} })
      if (foreign !== null && foreign !== undefined) {
        throw new Error('the per-tab 弹出 item appears on a foreign ' + JSON.stringify(kind) + ' tab — it would offer this plugin\'s page from somebody else\'s panel')
      }
    }
    if (item.component({}) !== null && item.component({}) !== undefined) {
      throw new Error('the per-tab 弹出 item draws itself with no tab handed to it')
    }
    ok('popout entry (native)', 'two entries where the overlay\'s two do not exist: a standing 弹出页 link in the shell\'s footer and 「在新标签页弹出」 on this plugin\'s own tabs only')
  } catch (e) {
    bad('popout entry (native)', e && e.message ? e.message : String(e))
  }
}

// …and neither native entry may appear on the floating surface, for the same
// reason the footer 文件树 button may not: there the panel is ours, its own top
// bar and corner switch already carry the popout link, and the column is not ours
// to put items into.
{
  try {
    const boot = bootClient()
    if (boot.injectedSeats.includes('sidebar.right.tab.menu.item')) {
      throw new Error('the column\'s tab-menu seat was injected into while the panel floats — that menu belongs to a column we do not own')
    }
    for (const name of ['sidebar.right.tab.menu.item', 'dsh-sidebar-frog-foot']) {
      if (boot.registrations.some((r) => r.def.name === name || r.def.id === name)) {
        throw new Error('the native popout entry ' + JSON.stringify(name) + ' is registered on the floating surface, where the panel\'s own two links already exist')
      }
    }
    ok('popout entry (floating surface)', 'no native popout entry beside the overlay\'s own two links')
  } catch (e) {
    bad('popout entry (floating surface)', e && e.message ? e.message : String(e))
  }
}

// The default page. A blank session is the ONLY one considered, an already-used
// column is never seeded, and 「加载时展开」/「用系统右侧边栏承载面板」both gate it.
{
  try {
    const blank = bootClient({ sidebarRight: true, blankSession: true })
    if (String(blank.openedTabs) !== 'files') {
      throw new Error('a blank session with an empty column opened ' + JSON.stringify(blank.openedTabs) + ' — the shell\'s own first page is the chooser, so the tree would not be there')
    }
    if (blank.column.activeTab !== 'files') throw new Error('the open did not land in the column')
    if (!blank.sessionSubs().length) throw new Error('no session subscription was installed, so a session switch could never be served')

    const used = bootClient({ sidebarRight: true })
    if (used.openedTabs.length) throw new Error('a session that has run a turn was seeded anyway: ' + JSON.stringify(used.openedTabs))

    const seeded = bootClient({ sidebarRight: true, blankSession: true, columnTab: 'guide' })
    if (seeded.openedTabs.length) throw new Error('a column that already shows something was taken over: ' + JSON.stringify(seeded.openedTabs))

    const off = shared.serializeSettings(shared.normalizeSettings({ defaultOpen: false }))
    const closed = bootClient({ sidebarRight: true, blankSession: true, storage: { [shared.BRIDGE.settings]: off } })
    if (closed.openedTabs.length) throw new Error('「加载时展开」switched off, yet the column was opened: ' + JSON.stringify(closed.openedTabs))

    const handedBack = bootClient({ sidebarRight: true, blankSession: true, storage: { [shared.BRIDGE.settings]: shared.serializeSettings(shared.normalizeSettings({ nativeFileTree: false })) } })
    if (handedBack.openedTabs.length) throw new Error('the column was opened with the takeover switched off')

    // The subscription is the plugin's, and a hot swap must not leave it behind:
    // a stale one would keep seeding sessions from a bundle that is gone.
    blank.dispose()
    if (blank.sessionSubs().length) throw new Error('the session subscription outlived the module that installed it')
    ok('column default page', 'a blank session lands on the tree; a used session, a used column, 「加载时展开」off, or the takeover handed back all leave it alone; the subscription is fiber-owned')
  } catch (e) {
    bad('column default page', e && e.message ? e.message : String(e))
  }
}

// The main-window half of the @reference bridge: a popout tab writes a quote
// request into shared localStorage, which arrives here as a `storage` event and
// must (a) land in the composer through the same API the panel's「@」button uses
// and (b) be answered with an ack, so the popout knows whether to fall back to
// the clipboard.
if (shared) {
  const { BRIDGE, bridgeEncodeQuote, bridgeDecodeAck } = shared
  try {
    const client = bootClient({ draft: '看看这个' })
    const nonce = 'nonce-1'
    const payload = bridgeEncodeQuote('D:/ws/chart.png', nonce, Date.now())
    client.store[BRIDGE.quote] = payload
    client.emit('storage', { key: BRIDGE.quote, newValue: payload })
    const ack = bridgeDecodeAck(client.store[BRIDGE.ack])
    if (!ack || ack.nonce !== nonce || ack.ok !== true) throw new Error('no successful ack was written: ' + JSON.stringify(ack))
    if (client.draft.value !== '看看这个 @D:/ws/chart.png') throw new Error('composer draft is ' + JSON.stringify(client.draft.value))
    ok('@reference bridge', 'inserted into the composer and acked the popout')
  } catch (e) {
    bad('@reference bridge', e && e.message ? e.message : String(e))
  }

  try {
    // A stale payload (left in storage by an earlier popout, then this window
    // reloaded) must never pop text into the composer.
    const client = bootClient({ draft: '' })
    const payload = bridgeEncodeQuote('D:/ws/old.txt', 'nonce-old', Date.now() - 60000)
    client.store[BRIDGE.quote] = payload
    client.emit('storage', { key: BRIDGE.quote, newValue: payload })
    if (client.draft.value !== '') throw new Error('a stale quote was inserted: ' + JSON.stringify(client.draft.value))
    if (client.store[BRIDGE.ack]) throw new Error('a stale quote was acked')
    ok('@reference bridge (stale)', 'a stale request is ignored')
  } catch (e) {
    bad('@reference bridge (stale)', e && e.message ? e.message : String(e))
  }

  try {
    // No composer (no session / no conversation service): the popout must be
    // told "no", so it copies instead of pretending it worked.
    const client = bootClient({ noComposer: true })
    const payload = bridgeEncodeQuote('D:/ws/a.txt', 'nonce-2', Date.now())
    client.store[BRIDGE.quote] = payload
    client.emit('storage', { key: BRIDGE.quote, newValue: payload })
    const ack = bridgeDecodeAck(client.store[BRIDGE.ack])
    if (!ack || ack.nonce !== 'nonce-2' || ack.ok !== false) throw new Error('expected a negative ack: ' + JSON.stringify(ack))
    ok('@reference bridge (no composer)', 'answers "not inserted" so the popout copies instead')
  } catch (e) {
    bad('@reference bridge (no composer)', e && e.message ? e.message : String(e))
  }

  // ── 点文件 → 侧边栏新增一个文件 Tab ──────────────────────────────────────
  // A file is opened as a TAB inside the panel (not a second column, and not a
  // new browser window): the tab owns the panel's full width, which is the only
  // way a preview fits in a sidebar. The wiring is asserted here because every
  // half-failure looks the same in the UI — clicking a file appears to do nothing.
  try {
    const panel = read('src/client/components.js')
    if (!/openFileTab\(/.test(panel)) throw new Error('the panel has no openFileTab — a file click has nowhere to go')
    if (!/closeFileTab\(/.test(panel)) throw new Error('a file tab cannot be closed')
    if (!/renderPreview\(/.test(panel)) throw new Error('the panel does not render the preview of an open file tab')
    if (!/artifacts-tab-file/.test(panel) || !/artifacts-tab-close/.test(panel)) {
      throw new Error('file tabs are not rendered in the tab strip with a close control')
    }
    if (/\bwindow\.open\(/.test(panel)) {
      throw new Error('the panel opens a browser window on a file click — files belong in a panel tab')
    }
    // A file tab owns the whole panel: the preview pane must not be sized by the
    // popout's divider percentage, or the file would be squeezed again.
    const css = read('src/client/styles.js')
    if (!/\.artifacts-preview \{ flex: 1 1 auto; min-width: 0;/.test(css)) {
      throw new Error('the file tab\'s preview is not full-width in the panel stylesheet')
    }
    ok('file tabs', 'clicking a file adds/activates a full-width tab in the panel, with a close ✕')
  } catch (e) {
    bad('file tabs', e && e.message ? e.message : String(e))
  }

  // ── 标签切换不得重建文件树 ───────────────────────────────────────────────
  // The obvious way to write this tab strip is to render the active pane only.
  // That unmounts the tree every time you leave the tab — throwing away the
  // loaded directory levels and the scroll offset, so every return to 文件树
  // looked like a refresh that had lost your place. The panes are therefore
  // persistent and toggled by CSS, which is what this asserts.
  try {
    const panel = read('src/client/components.js')
    if (/\(activeTab === 'tree'\)/.test(panel)) {
      throw new Error('the tree is rendered only while its tab is active — switching tabs would rebuild it')
    }
    if (!/artifacts-pane/.test(panel) || !/is-hidden/.test(panel)) {
      throw new Error('the tab panes are not persistent (no hidden pane)')
    }
    const css = read('src/client/styles.js')
    if (!/\.artifacts-pane\.is-hidden \{ position: absolute; inset: 0; visibility: hidden;/.test(css)) {
      throw new Error('a hidden pane is not kept in the layout — its scroll position would be lost anyway')
    }
    if (!/\.artifacts-main \{ position: relative;/.test(css)) {
      throw new Error('the pane host is not positioned, so an absolutely placed hidden pane would escape the panel')
    }
    ok('tree pane', 'panes stay mounted and are hidden in place: tab switches keep the tree\'s levels and scroll offset')
  } catch (e) {
    bad('tree pane', e && e.message ? e.message : String(e))
  }

  // ── 右上角开关不得压在系统自己的侧边栏开关上 ─────────────────────────────
  // The shell's sidebar toggle lives in the session header's corner; our panel
  // narrows that column by the width it claims, so any FIXED offset lands our
  // switch in the same band as theirs and the two icons overlap. The offset is
  // therefore measured from the shell's button and published as a CSS variable —
  // both halves of that contract are asserted here.
  try {
    const panel = read('src/client/components.js')
    const css = read('src/client/styles.js')
    if (!/\[data-sidebar-right-expand\]/.test(panel)) {
      throw new Error('the corner switch no longer measures the shell\'s own sidebar toggle — the two will overlap')
    }
    if (!/--frog-corner-right/.test(panel)) throw new Error('the measured corner offset is never published')
    if (!/var\(--frog-corner-right, calc\(/.test(css)) {
      throw new Error('the stylesheet ignores the measured corner offset (or lost its fallback)')
    }
    if (!/removeProperty\('--frog-corner-right'\)/.test(panel)) {
      throw new Error('the measured offset is never cleared, so it would stick once the shell\'s button goes away')
    }
    ok('corner switch', 'placed clear of the shell\'s sidebar toggle (measured, with a fixed fallback)')
  } catch (e) {
    bad('corner switch', e && e.message ? e.message : String(e))
  }

  // ── 删除重复的「收起侧边栏」按钮 ──────────────────────────────────────────
  // 收起 used to be drawn by the corner entry — which sits in the session
  // header's share-button cluster, in the same 28px band as the shell's own
  // sidebar toggle, so the two read as one feature shipped twice. The rule now:
  // the corner entry draws NOTHING while the panel is open, and 收起 lives in
  // the panel's own header (overlay surface only; the native surface leaves the
  // shell's toggle as the single control).
  try {
    const panel = read('src/client/components.js')
    if (!/if \(open\) return null/.test(panel)) {
      throw new Error('the corner entry still draws itself while the panel is open — that is the duplicated collapse control')
    }
    if (!/artifacts-headbtn/.test(panel)) throw new Error('the panel header has no 收起 control of its own')
    if (!/artifacts-headbtn/.test(read('src/client/styles.js'))) {
      throw new Error('the header\'s 收起 control has no button box in the stylesheet')
    }
    if (/'aria-expanded': true/.test(panel)) {
      throw new Error('the corner entry can still report an expanded panel it no longer controls')
    }
    ok('no duplicate collapse', '收起 lives in the panel header; the corner entry is a closed-state entry only')
  } catch (e) {
    bad('no duplicate collapse', e && e.message ? e.message : String(e))
  }

  // ── 原生 Tab 面板不再自己让位、不再自带窗框 ───────────────────────────────
  // Under the native surface the shell lays the column out around its own
  // sidebar, so the overlay's layout push must not run at all (it would push the
  // conversation off what the shell already reserved) and the floating window's
  // chrome must be dropped by CSS.
  try {
    const panel = read('src/client/components.js')
    const css = read('src/client/styles.js')
    if (!/if \(!overlay\) return undefined/.test(panel)) {
      throw new Error('the layout push is not gated to the overlay surface — a native tab would push the conversation twice')
    }
    if (!/overlay \? panelMinWidthPx/.test(panel)) {
      throw new Error('the panel geometry is computed for the native surface too (the shell owns its width)')
    }
    if (!/\.artifacts-panel\.artifacts-panel-native \{/.test(css)) {
      throw new Error('the native surface keeps the floating window\'s frame (fixed position / shadow / seam)')
    }
    if (!/artifacts-panel-native/.test(panel)) throw new Error('no element ever carries the native surface class')
    ok('native surface chrome', 'no layout push and no floating frame under the shell\'s own sidebar')
  } catch (e) {
    bad('native surface chrome', e && e.message ? e.message : String(e))
  }

  // ── 复用系统能力：右侧边栏宽度必须"量"，不能靠一个没人写的变量 ────────────
  // The plugin used to lay out against --dsh-sidebar-width, which the community
  // better-sidebar plugin stopped setting when it gave its right column back to
  // the shell (v0.19): every offset silently evaluated to 0 and the "make room"
  // behaviour degraded to "make none" without anything failing. The width now
  // comes from measuring the shell's own panel element.
  try {
    const core = read('src/client/core.js')
    const css = read('src/client/styles.js')
    if (!/data-sidebar-right-panel/.test(core)) {
      throw new Error('the shell\'s right-sidebar panel is never measured — the layout would fall back to a variable nobody writes')
    }
    if (!/--dsh-sidebar-frog-right/.test(core)) throw new Error('the measured sidebar offset is never published')
    const uses = (css.match(/var\(--dsh-sidebar-frog-right,/g) || []).length
    if (uses < 3) throw new Error('only ' + uses + ' stylesheet rules read the measured sidebar offset (expected the frame, the panel and the corner fallback)')
    if (/margin-right: calc\(var\(--dsh-sidebar-width/.test(css)) {
      throw new Error('the frame still pushes off the legacy --dsh-sidebar-width instead of the measured value')
    }
    if (!/ResizeObserver/.test(core)) throw new Error('nothing follows the shell panel while it is dragged or animated')
    const clearsMeasured = /removeProperty\('--dsh-sidebar-frog-right'\)/.test(core) || /removeProperty\(SHELL_RIGHT_VAR\)/.test(core)
    if (!clearsMeasured) {
      throw new Error('the measured offset is never cleared, so it would stick after the shell panel closes')
    }
    ok('shell sidebar offset', 'measured from the shell panel, published, followed and cleared')
  } catch (e) {
    bad('shell sidebar offset', e && e.message ? e.message : String(e))
  }

  // ── 复用系统能力：后台任务只读镜像，不自建 runner ─────────────────────────
  // The session list store already mirrors every session's background jobs
  // (the shell's header button renders that very array). A second source of truth
  // would disagree with it, so the tab must read jobsBySession and must not grow
  // its own job lifecycle.
  try {
    const core = read('src/client/core.js')
    const panel = read('src/client/components.js')
    if (!/jobsBySession/.test(core)) throw new Error('the jobs tab does not read the shell\'s job mirror')
    if (!/useJobs\(/.test(panel)) throw new Error('the panel never subscribes to the job mirror')
    if (!/JobsPane/.test(panel)) throw new Error('the jobs pane is not rendered')
    if (/\b(spawn|kill|start)\s*\(/.test(core.replace(/\/\/[^\n]*/g, ''))) {
      throw new Error('the client half looks like it starts or stops jobs — that lifecycle belongs to the shell')
    }
    ok('background jobs', 'read-only mirror of the shell\'s jobsBySession, no parallel runner')
  } catch (e) {
    bad('background jobs', e && e.message ? e.message : String(e))
  }
}

// ── 4. host routes ─────────────────────────────────────────────────────────
// Boot the host half against a stub Cordis context and drive the registered
// routes directly: this is the only way to verify route behaviour (the query
// parsing, the auth guard, the shape of each payload) without restarting a live
// `dsh web`.
console.log('host routes')

const DATA_ROUTES = [
  '/dsh-sidebar-frog/data',
  '/dsh-sidebar-frog/content',
  '/dsh-sidebar-frog/media',
  '/dsh-sidebar-frog/remove',
  '/dsh-sidebar-frog/revert',
  // 保存 writes the workspace, so it belongs on this list twice over: it opens
  // with the same cookie guard as every other data route, and the 401 sweep
  // below is what proves it (a route whose guard is only read off the source is
  // a claim nobody drives).
  '/dsh-sidebar-frog/save',
  '/dsh-sidebar-frog/listdir',
  '/dsh-sidebar-frog/search',
  // The Git slice's two routes belong on this list for the same reason as the
  // rest: the README's claim is that EVERY data route opens with
  // `requestRejection`, and a route whose guard is only checked by reading its
  // source is a claim nobody drives. Listing them here is what makes the 401
  // sweep actually call them.
  '/dsh-sidebar-frog/git',
  '/dsh-sidebar-frog/gitfile',
]
const ASSET_ROUTES = [
  '/dsh-sidebar-frog',
  '/dsh-sidebar-frog/pdfjs/pdf.min.js',
  '/dsh-sidebar-frog/pdfjs/pdf.worker.min.js',
  '/dsh-sidebar-frog/mathjax/tex-svg.js',
  '/dsh-sidebar-frog/mermaid/mermaid.min.js',
  '/dsh-sidebar-frog/jsxgraph/jsxgraphcore.js',
  '/dsh-sidebar-frog/jsxgraph/jsxgraph.css',
  '/dsh-sidebar-frog/office/jszip.min.js',
  '/dsh-sidebar-frog/office/docx-preview.min.js',
  '/dsh-sidebar-frog/office/xlsx.full.min.js',
  '/dsh-sidebar-frog/office/pptx-renderer.es.js',
  // The editor's engine, loaded lazily by both faces the first time somebody
  // clicks 编辑 — the same public-asset contract as the readers above.
  '/dsh-sidebar-frog/codemirror/codemirror.min.js',
]

// Start the host plugin with a stub context; `rejection` stands in for
// Connection's Host/Origin fence + browser-cookie verdict for one route call.
const bootHost = (rejection, options) => {
  const headless = !!(options && options.headless)
  const hostSrc = built ? built.host : read('src/host.js')
  const routes = {}
  const calls = []
  const handlers = {}
  // How many times the dynamic injection actually ran, and which statically
  // declared services a real Cordis loader would have failed to resolve. Both are
  // asserted by the activation checks below.
  let injectRuns = 0
  let staticMissing = []
  // One mutable file stands in for the workspace. Its version token is what the
  // revert's freshness guard compares against, so the tests can move the file
  // under the plugin's feet exactly like a second edit would.
  const file = { text: 'old\n', version: 'v1' }
  const fs = {
    resolve: async (p) => { calls.push(['resolve', p]); return p },
    // `gone` is the save route's "not an existing regular file" case: the stub
    // answers for one mutable file, so a path that must NOT exist is spelled
    // rather than probed.
    stat: async (t) => (String(t).indexOf('gone') >= 0 ? undefined : { type: 'file', size: file.text.length, version: file.version }),
    listDir: async (target) => [
      { name: 'b.txt', type: 'file', target: target + '/b.txt', size: 3, version: 'v1' },
      { name: 'a', type: 'directory', target: target + '/a' },
    ],
    processPath: (t) => String(t).replace(/\//g, '\\'),
    readText: async () => {
      // The filesystem service decodes strictly (TextDecoder with fatal:true), so
      // a file that is not UTF-8 throws out of the read instead of arriving as
      // mojibake. `file.notUtf8` drives that path; the message is V8's own, which
      // is the point — the host has to recognise it.
      if (file.notUtf8) throw new TypeError('The encoded data was not valid for encoding utf-8')
      return file.text
    },
    readBytes: async () => new Uint8Array([1, 2, 3]),
    // The media route's byte-range path. The stub answers with exactly the window
    // it was asked for, so the route's Content-Range/Length maths is what is
    // under test rather than the stub's.
    //
    // `file.bom` is the save route's own probe: it asks for the first three bytes
    // to find a UTF-8 BOM (readText decodes it away), so a test that wants a BOM
    // to exist toggles this flag rather than the route being told about it.
    readByteRange: async (target, range) => {
      calls.push(['readByteRange', range.offset, range.length])
      if (file.bom && range.offset === 0) return new Uint8Array([0xef, 0xbb, 0xbf])
      return new Uint8Array(range.length)
    },
    writeText: async (target, content, expected) => {
      calls.push(['writeText', content, expected ? expected.kind : null, expected ? String(expected.version) : null])
      if (expected && expected.kind === 'replaceIfVersion' && String(expected.version) !== String(file.version)) {
        throw new Error('FS_STALE_VERSION: the file changed since the snapshot')
      }
      file.text = content
      const n = parseInt(String(file.version).replace(/[^0-9]/g, ''), 10) || 0
      file.version = 'v' + (n + 1)
      return { operation: 'update', version: file.version, before: content, after: content }
    },
  }
  let rejectionCalls = 0
  const connection = rejection === null ? undefined : {
    requestRejection() { rejectionCalls += 1; return rejection },
  }
  const ctx = {
    get: (name) => {
      // A headless assembly has no web server. That absence is the entire point of
      // the headless boot below, so it is switched off rather than stubbed away.
      if (name === 'webServer') return headless ? undefined : { register: (route) => { routes[route.path] = route; return () => {} } }
      if (name === 'connection') return connection
      if (name === 'sessions') return { get: (id) => (id === 's1' ? { header: { cwd: 'D:/ws' } } : undefined), list: () => [] }
      if (name === 'fs') return fs
      if (name === 'sandboxPolicy') return { workspaceRoot: 'D:/ws' }
      return undefined
    },
    on: (name, fn) => { handlers[name] = fn },
    effect: (fn) => { fn(); return () => {} },
    interval: () => () => {},
    // `ctx.inject(deps, cb)` is shorthand for `ctx.plugin({ inject: deps, apply:
    // cb })`: the callback runs once every named service resolves, in a child
    // context, and is unloaded and re-run when one of them changes. The stub has
    // to model the RESOLUTION GATE, or a headless boot looks healthy while the
    // real loader defers the HTTP half forever.
    inject: (deps, cb) => {
      const names = Array.isArray(deps) ? deps : Object.keys(deps || {})
      if (!names.every((n) => ctx.get(n) !== undefined)) return () => {}
      injectRuns += 1
      return cb(ctx)
    },
  }
  // The host announces its build at startup; capture that instead of letting it
  // scroll past, so the banner itself can be asserted.
  const logs = []
  const realLog = console.log
  console.log = (...args) => { logs.push(args.map(String).join(' ')) }
  try {
    const plugin = new Function(hostSrc)()
    // Cordis does NOT call `apply` unless every statically declared dependency
    // resolves. The stub used to call it unconditionally — which is exactly why a
    // static `inject: ['webServer', …]` read as healthy through 120 checks while
    // the real loader skipped the plugin in every headless assembly.
    const declared = Array.isArray(plugin.inject) ? plugin.inject : []
    staticMissing = declared.filter((n) => ctx.get(n) === undefined)
    if (!staticMissing.length) plugin.apply(ctx)
  } finally {
    console.log = realLog
  }
  return {
    routes, calls, logs, handlers, file,
    rejections: () => rejectionCalls,
    applied: staticMissing.length === 0,
    staticMissing,
    injectRuns,
  }
}

const call = async (route, url) => {
  const out = { status: 0, headers: null, body: '' }
  const res = {
    writeHead(status, headers) { out.status = status; out.headers = headers },
    end(body) { out.body = body == null ? '' : String(body) },
  }
  await route.handler({ url, headers: { host: '127.0.0.1:3080' } }, res)
  return out
}

// A request stub for the routes that read headers or the method: the media route
// answers byte ranges, and a player probes with HEAD before it plays.
const callRaw = async (route, url, headers, method) => {
  const out = { status: 0, headers: null, body: '' }
  const res = {
    writeHead(status, h) { out.status = status; out.headers = h },
    end(body) { out.body = body == null ? '' : String(body) },
  }
  await route.handler({
    url,
    method: method || 'GET',
    headers: Object.assign({ host: '127.0.0.1:3080' }, headers || {}),
  }, res)
  return out
}

// The revert route is the one call that carries a body, so it needs a request
// stub that can emit one. `raw` lets a test send a deliberately broken payload.
const callPost = async (route, url, obj, raw) => {
  const out = { status: 0, headers: null, body: '' }
  const res = {
    writeHead(status, headers) { out.status = status; out.headers = headers },
    end(body) { out.body = body == null ? '' : String(body) },
  }
  const listeners = {}
  const req = {
    url,
    method: 'POST',
    headers: { host: '127.0.0.1:3080' },
    on(name, fn) { listeners[name] = fn; return req },
    destroy() {},
  }
  const promise = route.handler(req, res)
  const payload = raw !== undefined ? raw : JSON.stringify(obj || {})
  if (listeners.data) listeners.data(Buffer.from(payload, 'utf8'))
  if (listeners.end) listeners.end()
  await promise
  return out
}

try {
  const { routes, calls, logs, file } = bootHost(undefined)
  const missing = [...DATA_ROUTES, ...ASSET_ROUTES].filter((p) => !routes[p])
  if (missing.length) throw new Error('routes not registered: ' + missing.join(', '))
  ok('route inventory', `${Object.keys(routes).length} routes`)

  // ── the host half must come up BOTH ways ──────────────────────────────────
  // `dsh plugin-verify` and any non-web profile boot the plugin headless. What
  // has to survive there is the artifact tracking; what must not happen is a
  // crash or a route table built with no server behind it. And in the web profile
  // the injection must run exactly once, or two servers' worth of routes land in
  // one table.
  {
    const bare = bootHost(undefined, { headless: true })
    if (!bare.applied) {
      throw new Error(`the host half is never applied without webServer (unresolved static inject ${JSON.stringify(bare.staticMissing)}) — a static inject gates the whole apply, so a headless assembly loses the artifact waterfalls too`)
    }
    if (bare.injectRuns !== 0) throw new Error(`the HTTP half ran ${bare.injectRuns} time(s) with no web server`)
    if (Object.keys(bare.routes).length) {
      throw new Error('routes were registered with no web server: ' + Object.keys(bare.routes).join(', '))
    }
    for (const name of ['tools/result', 'tools/execute']) {
      if (typeof bare.handlers[name] !== 'function') {
        throw new Error(`the artifact waterfall ${name} was not installed in a headless assembly`)
      }
    }
    ok('host · headless boot', 'applies with no webServer, keeps both artifact waterfalls, registers no route')

    const served = bootHost(undefined)
    if (!served.applied) throw new Error('the host half did not apply with webServer present')
    if (served.injectRuns !== 1) throw new Error(`the HTTP half must run exactly once, ran ${served.injectRuns}`)
    if (!Object.keys(served.routes).length) throw new Error('no route was registered with webServer present')
    ok('host · web boot', `applies and registers ${Object.keys(served.routes).length} routes through ctx.inject`)
  }

  // ── the media route's byte-range contract ────────────────────────────────
  // A player asks up to four different questions before it plays anything, and a
  // route that answers all of them with one whole-file 200 is exactly why audio
  // and video never started. The file in this stub is 4 bytes ('old\n'), so every
  // header below is checkable by hand.
  // An ISOLATED boot: these checks drive the same routes, and the shared
  // instance's call log is asserted by position (calls[0]) further down, so the
  // extra reads below would otherwise be read as somebody else's.
  const iso = bootHost(undefined)
  {
    const media = iso.routes['/dsh-sidebar-frog/media']
    const url = '/dsh-sidebar-frog/media?path=D:/ws/clip.mp4'
    const whole = await callRaw(media, url)
    if (whole.status !== 200) throw new Error('a plain media read answered ' + whole.status)
    if (whole.headers['Accept-Ranges'] !== 'bytes') throw new Error('a plain media read does not advertise ranges')
    if (whole.headers['Content-Type'] !== 'video/mp4') throw new Error('a .mp4 was served as ' + whole.headers['Content-Type'])
    const part = await callRaw(media, url, { range: 'bytes=0-1' })
    if (part.status !== 206) throw new Error('a range read answered ' + part.status)
    if (part.headers['Content-Range'] !== 'bytes 0-1/4') throw new Error('Content-Range is ' + part.headers['Content-Range'])
    if (Number(part.headers['Content-Length']) !== 2) throw new Error('Content-Length is ' + part.headers['Content-Length'])
    const tail = await callRaw(media, url, { range: 'bytes=-2' })
    if (tail.headers['Content-Range'] !== 'bytes 2-3/4') throw new Error('the suffix form answered ' + tail.headers['Content-Range'])
    const past = await callRaw(media, url, { range: 'bytes=9-' })
    if (past.status !== 416) throw new Error('a range starting past EOF answered ' + past.status)
    if (past.headers['Content-Range'] !== 'bytes */4') throw new Error('the 416 Content-Range is ' + past.headers['Content-Range'])
    const multi = await callRaw(media, url, { range: 'bytes=0-1,2-3' })
    if (multi.status !== 200) throw new Error('a multipart range answered ' + multi.status + ' instead of the whole file')
    const head = await callRaw(media, url, undefined, 'HEAD')
    if (head.status !== 200 || head.body !== '') throw new Error('HEAD answered ' + head.status + ' with body ' + JSON.stringify(head.body))
    // …and a .csv is named as text, so opening the URL in a browser shows it
    // instead of downloading it.
    const csv = await callRaw(media, '/dsh-sidebar-frog/media?path=D:/ws/data.csv')
    if (String(csv.headers['Content-Type']).indexOf('text/csv') !== 0) throw new Error('a .csv was served as ' + csv.headers['Content-Type'])
    ok('media byte ranges', '200 + Accept-Ranges, 206 with Content-Range, suffix windows, 416 past EOF, multipart falls back, HEAD body-less')
  }

  // ── a binary container is never decoded as text ──────────────────────────
  // The honest-wire half of the document card: the panel is told what the file
  // IS, and the bytes only travel when a person asks for them by name. This
  // holds for the Office documents the panel now READS itself, too — the type is
  // more specific (`office`), but the wire behaviour is the same: no bytes, and
  // no text, until someone asks.
  //
  // Its own try/catch, not the enclosing route block's: a failure here is a
  // different promise ("the wire stays honest") from "the route is wired", and a
  // generic label would send a reader looking at the wrong thing. (The mutation
  // run is what surfaced that: this assertion fired correctly, but under the
  // enclosing label, which reads as if the route inventory had broken.)
  try {
    const content = iso.routes['/dsh-sidebar-frog/content']
    const doc = JSON.parse((await call(content, '/dsh-sidebar-frog/content?path=D:/ws/report.docx')).body)
    if (doc.ok !== true) throw new Error('reading a .docx failed: ' + JSON.stringify(doc))
    if (doc.type !== 'office') throw new Error('a .docx was typed ' + doc.type)
    if (doc.content !== '') throw new Error('a binary document was decoded as text anyway (' + doc.content.length + ' chars)')
    const legacy = JSON.parse((await call(content, '/dsh-sidebar-frog/content?path=D:/ws/legacy.odt')).body)
    if (legacy.type !== 'document') throw new Error('a .odt (no reader here) was typed ' + legacy.type)
    const forced = JSON.parse((await call(content, '/dsh-sidebar-frog/content?path=D:/ws/report.docx&text=1')).body)
    if (!forced.content) throw new Error('the text=1 escape hatch returned nothing')
    const table = JSON.parse((await call(content, '/dsh-sidebar-frog/content?path=D:/ws/data.csv')).body)
    if (table.type !== 'table') throw new Error('a .csv was typed ' + table.type)
    if (!table.content) throw new Error('a .csv came back with no text to parse')
    ok('binary documents', 'typed as binaries with no bytes on the wire, .csv typed as a table, text only on request')
  } catch (e) {
    bad('binary documents', e && e.message ? e.message : String(e))
  }

  // The banner is how a human tells which build a long-running `dsh web` is
  // actually serving; it must name the build that was just assembled.
  const banner = logs.find((line) => line.indexOf('dsh-sidebar-frog build') >= 0)
  if (!banner) throw new Error('the host did not announce its build: ' + JSON.stringify(logs))
  if (built && banner.indexOf(built.build) < 0) throw new Error('the announced build is not the assembled one: ' + banner)
  ok('startup banner', banner.trim())

  // A trusted, authenticated caller reaches the data.
  const data = await call(routes['/dsh-sidebar-frog/data'], '/dsh-sidebar-frog/data')
  if (data.status !== 200) throw new Error('/data answered ' + data.status)
  const payload = JSON.parse(data.body)
  if (!Array.isArray(payload.artifacts)) throw new Error('/data payload has no artifacts array')
  ok('/data', `200 + { artifacts: [...] }`)

  // The query parsing that used to be copy-pasted per route.
  const listed = await call(routes['/dsh-sidebar-frog/listdir'], '/dsh-sidebar-frog/listdir?path=D%3A%2Fsub&sessionId=s1')
  if (listed.status !== 200) throw new Error('/listdir answered ' + listed.status)
  const listedBody = JSON.parse(listed.body)
  const entries = listedBody.entries
  if (!entries.length || !entries[0].isDir) throw new Error('/listdir did not sort the directory first')
  if (entries[1].name !== 'b.txt') throw new Error('/listdir entries look wrong: ' + JSON.stringify(entries))
  if (calls[0][1] !== 'D:/sub') throw new Error('the percent-encoded path did not decode: ' + calls[0][1])
  // The level's own path must come back in the SAME spelling as its entries —
  // here the stub's processPath is the realpath (backslashes) while the request
  // said "D:/sub". Echoing the request back made the client's containment tests
  // ("is this entry under my root?") fail, which silently killed the remembered
  // expansion, the reveal walk and the relative-path labels.
  if (listedBody.path !== 'D:\\sub') throw new Error('level path was not normalised to the entries\' spelling: ' + JSON.stringify(listedBody.path))
  if (!entries.every((e) => e.path.indexOf('D:\\sub\\') === 0)) throw new Error('entry paths are not in the level\'s spelling: ' + JSON.stringify(entries.map((e) => e.path)))
  ok('/listdir', 'decoded path + sessionId, directories first, one spelling for root and entries')

  // A malformed percent escape must not throw out of the route.
  //
  // Named `badEscape`, NOT `bad`: a block-scoped `const bad` here would put the
  // reporter itself in the temporal dead zone for the whole block, so any
  // `bad(...)` in an inner catch above would throw "Cannot access 'bad' before
  // initialization" instead of reporting — the failure would be attributed to
  // this block's own catch, with a message about the reporter. (Found by the
  // mutation run: a guard that was firing correctly looked like it had survived.)
  const badEscape = await call(routes['/dsh-sidebar-frog/content'], '/dsh-sidebar-frog/content?path=%E0%A4%A')
  if (badEscape.status !== 200) throw new Error('malformed escape answered ' + badEscape.status)
  ok('/content', 'malformed percent escape tolerated')

  // A file that is not UTF-8 comes back as a decode failure, and what the reader
  // is told is the whole assertion: the raw TypeError names an encoding they
  // never chose and says nothing about their file, and a Chinese workspace still
  // holds plenty of GBK documents. The answer must name the likely cause and make
  // clear that nothing was rewritten.
  file.notUtf8 = true
  const notUtf8 = JSON.parse((await call(routes['/dsh-sidebar-frog/content'], '/dsh-sidebar-frog/content?path=D:/ws/legacy.txt')).body)
  file.notUtf8 = false
  if (notUtf8.ok !== false) throw new Error('a non-UTF-8 file was answered as ok: ' + JSON.stringify(notUtf8))
  if (!/UTF-8/.test(notUtf8.error)) throw new Error('the decode failure does not say what is wrong: ' + JSON.stringify(notUtf8.error))
  if (!/GBK|GB18030/.test(notUtf8.error)) throw new Error('the decode failure does not name the likely encoding: ' + JSON.stringify(notUtf8.error))
  if (!/left alone/.test(notUtf8.error)) throw new Error('the decode failure does not say the file was not touched: ' + JSON.stringify(notUtf8.error))
  // …and a plain read failure must NOT be relabelled as an encoding problem.
  const plain = await call(routes['/dsh-sidebar-frog/content'], '/dsh-sidebar-frog/content?path=D:/ws/gone.txt')
  const plainBody = JSON.parse(plain.body)
  if (plainBody.ok === true) throw new Error('a missing file was answered as ok')
  if (/GBK|UTF-8/.test(plainBody.error)) throw new Error('an ordinary read failure was mislabelled as an encoding problem: ' + JSON.stringify(plainBody.error))
  ok('/content (not UTF-8)', notUtf8.error)

  const search = await call(routes['/dsh-sidebar-frog/search'], '/dsh-sidebar-frog/search?q=zz&limit=5')
  if (search.status !== 200 || !Array.isArray(JSON.parse(search.body).results)) throw new Error('/search payload malformed')
  ok('/search', 'bounded search answers a result list')
} catch (e) {
  bad('host routes (authenticated)', e && e.message ? e.message : String(e))
}

// ── 4b. change review / revert ─────────────────────────────────────────────
// The ledger's create-vs-edit label and the undo history both come from the LIVE
// tool execution value (the durable session log drops it), so the only way to
// verify them is to drive the `tools/execute` wrapper the way the real
// dispatcher does and then look at what the routes serve.
console.log('change review')
try {
  const { routes, calls, handlers, file } = bootHost(undefined)
  const exec = (name, path) => ({
    name,
    arguments: { file_path: path },
    agent: { session: { id: 's1', header: { cwd: 'D:/ws' } } },
  })
  const drive = async (name, path, value) => handlers['tools/execute'](exec(name, path), async () => ({ value }))
  const readRow = async (path) => {
    const res = await call(routes['/dsh-sidebar-frog/data'], '/dsh-sidebar-frog/data')
    const body = JSON.parse(res.body)
    return body.artifacts.find((a) => a.path === path)
  }

  const p = 'D:/ws/a.txt'
  // An OVERWRITE must be labelled "edit". Before the execution value was read,
  // every write was recorded as "create" — which only mislabelled a row then, but
  // would make an undo delete a file the user already had.
  await drive('write', p, { path: p, operation: 'update', before: 'old\n', after: 'new\n', version: 'v2' })
  // The stub file must now look the way it does after that write, version token
  // included: the revert's freshness guard compares against it.
  file.text = 'new\n'
  file.version = 'v2'
  let row = await readRow(p)
  if (!row) throw new Error('the write was not recorded')
  if (row.kind !== 'edit') throw new Error('an overwrite was labelled "' + row.kind + '"')
  if (!row.undo || row.undo.can !== true) throw new Error('the change was not revertible: ' + JSON.stringify(row.undo))
  if (!row.diff || row.diff.before !== 'old\n' || row.diff.after !== 'new\n') throw new Error('the diff did not carry the real before/after: ' + JSON.stringify(row.diff))
  ok('write → edit', 'overwrite labelled edit, snapshot revertible, diff carries both sides')

  // 撤销 puts the previous content back under a version guard.
  const rev = await callPost(routes['/dsh-sidebar-frog/revert'], '/dsh-sidebar-frog/revert', { path: p, opId: row.undo.opId })
  if (rev.status !== 200) throw new Error('/revert answered ' + rev.status)
  const revBody = JSON.parse(rev.body)
  if (!revBody.ok) throw new Error('/revert refused a valid undo: ' + rev.body)
  const wrote = calls.filter((c) => c[0] === 'writeText')
  if (!wrote.length) throw new Error('/revert never wrote the file back')
  if (wrote[0][1] !== 'old\n') throw new Error('the wrong content was restored: ' + JSON.stringify(wrote[0][1]))
  if (wrote[0][2] !== 'replaceIfVersion' || wrote[0][3] !== 'v2') throw new Error('the restore was not guarded by the write version: ' + JSON.stringify(wrote[0]))
  row = await readRow(p)
  if (row.undo) throw new Error('the reverted change is still offered as an undo')
  ok('/revert', 'restored the snapshot with a replaceIfVersion guard, undo consumed')

  // A file that moved on must be refused, not overwritten.
  file.version = 'v9'
  await drive('write', p, { path: p, operation: 'update', before: 'second\n', after: 'third\n', version: 'v3' })
  file.version = 'v9'
  const stale = await callPost(routes['/dsh-sidebar-frog/revert'], '/dsh-sidebar-frog/revert', { path: p })
  const staleBody = JSON.parse(stale.body)
  if (staleBody.ok) throw new Error('a stale revert was allowed to overwrite the file')
  if (!/改动|修改/.test(String(staleBody.error))) throw new Error('the refusal did not explain itself: ' + stale.body)
  if (calls.filter((c) => c[0] === 'writeText').length !== 1) throw new Error('a refused revert still wrote to the file')
  ok('/revert (stale)', 'refused with a reason, no write performed')

  // A file the agent CREATED cannot be undone with the filesystem service this
  // host exposes (no delete), and the row says so instead of pretending.
  const created = 'D:/ws/new.txt'
  await drive('write', created, { path: created, operation: 'create', before: null, after: 'fresh\n', version: 'v1' })
  const newRow = await readRow(created)
  if (newRow.kind !== 'create') throw new Error('a create was labelled "' + newRow.kind + '"')
  if (!newRow.undo || newRow.undo.can !== false || !newRow.undo.reason) throw new Error('a create must expose why it cannot be undone: ' + JSON.stringify(newRow.undo))
  ok('create', 'labelled create and marked non-revertible (no delete seam)')

  // The argument-only fallback (an older host without the execution value) must
  // never claim "create" for a path the ledger already knows.
  handlers['tools/result']({ name: 'write', arguments: { file_path: p }, agent: { session: { id: 's1' } } }, { isError: false })
  row = await readRow(p)
  if (row.kind !== 'edit') throw new Error('the fallback labelled a known path "' + row.kind + '"')
  ok('fallback label', 'a known path stays edit when only the arguments are available')

  const wrongMethod = await call(routes['/dsh-sidebar-frog/revert'], '/dsh-sidebar-frog/revert')
  if (wrongMethod.status !== 405) throw new Error('GET /revert answered ' + wrongMethod.status)
  const brokenBody = await callPost(routes['/dsh-sidebar-frog/revert'], '/dsh-sidebar-frog/revert', null, '{not json')
  if (brokenBody.status !== 400) throw new Error('a malformed body answered ' + brokenBody.status)
  ok('/revert (protocol)', 'GET → 405, malformed JSON → 400')
} catch (e) {
  bad('change review', e && e.message ? e.message : String(e))
}

// ── 4c. 编辑与保存 (editing / saving) ─────────────────────────────────────────
// The first feature in this plugin that changes the workspace on a person's
// behalf, so every guard here stands for a failure that is either destructive or
// silent:
//
//   · a save that overwrites a change somebody else made (the version guard),
//   · a save that rewrites every line of a CRLF file, or drops a UTF-8 BOM,
//   · a path outside the session's workspace being writable at all,
//   · a save that never reaches the ledger — 撤销 could then not put it back,
//   · a preview that was TRUNCATED by the read being edited and saved back
//     (which shortens the file rather than editing it).
//
// All of it is driven through the real route against the stub filesystem, the
// same way the revert tests are.
console.log('editing')
try {
  const { routes, calls, handlers, file } = bootHost(undefined)
  const saveRoute = routes['/dsh-sidebar-frog/save']
  if (!saveRoute) throw new Error('the save route is not registered')
  const post = (obj) => callPost(saveRoute, '/dsh-sidebar-frog/save', obj)
  const writes = () => calls.filter((c) => c[0] === 'writeText')
  const readRow = async (path) => {
    const res = await call(routes['/dsh-sidebar-frog/data'], '/dsh-sidebar-frog/data')
    return JSON.parse(res.body).artifacts.find((a) => a.path === path)
  }

  const p = 'D:/ws/doc.md'
  file.text = '# t\n'
  file.version = 'v1'
  file.bom = false

  // 1. A clean save: the text goes in under a guard naming the revision the
  //    editor was opened on, and the answer carries the revision it produced.
  let res = await post({ path: p, content: '# T\n', sessionId: 's1', baseVersion: 'v1', baseSize: 4 })
  let body = JSON.parse(res.body)
  if (!body.ok) throw new Error('a clean save was refused: ' + res.body)
  if (writes().length !== 1) throw new Error('expected exactly one write, saw ' + writes().length)
  if (writes()[0][1] !== '# T\n') throw new Error('the wrong text was written: ' + JSON.stringify(writes()[0][1]))
  if (writes()[0][2] !== 'replaceIfVersion' || writes()[0][3] !== 'v1') {
    throw new Error('the save was not guarded by the revision it read: ' + JSON.stringify(writes()[0]))
  }
  if (body.version !== 'v2') throw new Error('the answer did not carry the new revision: ' + res.body)
  ok('/save', 'wrote the edited text under a replaceIfVersion guard and answered the new revision')

  // 2. It lands in the ledger as THIS PERSON's edit, with a revertible snapshot
  //    — the whole point of routing a save through the same history the agent's
  //    changes use: 撤销 can put your own change back.
  let row = await readRow(p)
  if (!row) throw new Error('the save never reached the ledger — 撤销 could not put it back')
  if (row.by !== 'user') throw new Error('the save was not attributed to the person: ' + JSON.stringify(row.by))
  if (row.kind !== 'edit') throw new Error('a save of an existing file was labelled "' + row.kind + '"')
  if (!row.undo || row.undo.can !== true) throw new Error('the save is not revertible: ' + JSON.stringify(row.undo))
  if (!row.diff || row.diff.before !== '# t\n' || row.diff.after !== '# T\n') {
    throw new Error('the ledger diff is not the save: ' + JSON.stringify(row.diff))
  }
  const undo = await callPost(routes['/dsh-sidebar-frog/revert'], '/dsh-sidebar-frog/revert', { path: p })
  const undoBody = JSON.parse(undo.body)
  if (!undoBody.ok) throw new Error('撤销 refused a person\'s own save: ' + undo.body)
  if (file.text !== '# t\n') throw new Error('撤销 did not restore what the save replaced: ' + JSON.stringify(file.text))
  ok('/save → ledger', 'recorded as the person\'s edit with a real diff, and 撤销 puts it back')

  // 3. A save over somebody else's change is REFUSED, and refuses in the one way
  //    the UI can act on: `stale: true` plus a reason. No write happens.
  file.text = '# external\n'
  file.version = 'v7'
  const writesBefore = writes().length
  res = await post({ path: p, content: '# mine\n', sessionId: 's1', baseVersion: 'v2', baseSize: 4 })
  body = JSON.parse(res.body)
  if (body.ok) throw new Error('a save over a newer revision was allowed')
  if (body.stale !== true) throw new Error('a stale save must say so: ' + res.body)
  if (!/改动|修改/.test(String(body.error))) throw new Error('the refusal did not explain itself: ' + res.body)
  if (writes().length !== writesBefore) throw new Error('a refused save still wrote to the file')
  ok('/save (stale)', 'refused with stale:true and a reason, and wrote nothing')

  // 4. 「仍然保存」 (force) goes through — and is STILL guarded, because the guard
  //    is the revision read moments earlier rather than the one the editor held.
  res = await post({ path: p, content: '# mine\n', sessionId: 's1', baseVersion: 'v2', force: true })
  body = JSON.parse(res.body)
  if (!body.ok) throw new Error('「仍然保存」 was refused: ' + res.body)
  if (writes().pop()[3] !== 'v7') throw new Error('the forced save did not guard on the fresh revision: ' + JSON.stringify(writes().pop()))
  ok('/save (force)', 'allowed on request, still written against the freshly read revision')

  // 5. Writes are fenced to the session's workspace. A read may resolve any path
  //    the filesystem service accepts; a write may not.
  const outside = await post({ path: 'D:/other/x.md', content: 'x', sessionId: 's1' })
  const outsideBody = JSON.parse(outside.body)
  if (outsideBody.ok) throw new Error('a path outside the workspace was writable')
  if (!/工作区/.test(String(outsideBody.error))) throw new Error('the fence did not name its reason: ' + outside.body)
  ok('/save (fence)', 'a path outside the session workspace is refused with a reason')

  // 6. Byte fidelity. CodeMirror normalizes a document to LF, and `readText`
  //    decodes a BOM away — so the host has to put both back, or saving one
  //    paragraph of a CRLF file rewrites every line of it.
  file.text = 'a\r\nb\r\n'
  file.version = 'v1'
  file.bom = true
  res = await post({ path: p, content: 'a\nB\n', sessionId: 's1', baseVersion: 'v1', baseSize: 6 })
  body = JSON.parse(res.body)
  if (!body.ok) throw new Error('the CRLF save was refused: ' + res.body)
  const lastWrite = writes().pop()
  if (lastWrite[1] !== '\uFEFFa\r\nB\r\n') {
    throw new Error('line endings and the BOM were not restored: ' + JSON.stringify(lastWrite[1]))
  }
  if (body.eol !== 'CRLF' || body.bom !== true) throw new Error('the answer did not state what was restored: ' + res.body)
  ok('/save (byte fidelity)', 'the file\'s own CRLF and its UTF-8 BOM are put back, and the answer says which')

  // 7. Protocol and bounds: GET is not a save, a malformed body is not a save,
  //    and an oversized text is refused BEFORE the file is touched.
  const wrong = await call(saveRoute, '/dsh-sidebar-frog/save?path=' + encodeURIComponent(p))
  if (wrong.status !== 405) throw new Error('GET /save answered ' + wrong.status)
  const broken = await callPost(saveRoute, '/dsh-sidebar-frog/save', null, '{not json')
  if (broken.status !== 400) throw new Error('a malformed body answered ' + broken.status)
  const writesBeforeHuge = writes().length
  const huge = await post({ path: p, content: new Array(4 * 1024 * 1024 + 2).join('x'), sessionId: 's1' })
  const hugeBody = JSON.parse(huge.body)
  if (hugeBody.ok) throw new Error('an oversized save was accepted')
  if (writes().length !== writesBeforeHuge) throw new Error('an oversized save still wrote')
  ok('/save (protocol)', 'GET → 405, malformed JSON → 400, oversized text refused without a write')

  // 8. A file that is not a text file is not editable either — the read says so
  //    and the panel offers no toolbar (see the rendered guard below).
  const missing = await post({ path: 'D:/ws/gone.md', content: 'x', sessionId: 's1' })
  if (JSON.parse(missing.body).ok) throw new Error('a save of a path that is not a regular file was accepted')
  ok('/save (target)', 'a path that is not an existing regular file is refused (the panel never creates)')
} catch (e) {
  bad('editing', e && e.message ? e.message : String(e))
}

// ── 4d. the editor's own asset ───────────────────────────────────────────────
// The editor is a 604 KB vendored library, so the same three questions the
// Office readers are asked apply here: is it served, is it really the library,
// and does its licence travel with it?
try {
  const { routes } = bootHost(undefined)
  const url = '/dsh-sidebar-frog/codemirror/codemirror.min.js'
  const out = await call(routes[url], url)
  if (out.status !== 200) throw new Error('answered ' + out.status)
  if (String(out.headers['Content-Type']).indexOf('javascript') < 0) {
    throw new Error('served as ' + out.headers['Content-Type'] + ' — a <script> needs JavaScript')
  }
  if (out.body.length < 200000) throw new Error('served ' + out.body.length + ' bytes — that is not CodeMirror')
  // The API the shared mount reads off the global, plus the global itself.
  for (const token of ['DshFrogCM', 'markdownKeymap', 'openSearchPanel', 'insertNewlineContinueMarkup']) {
    if (out.body.indexOf(token) < 0) throw new Error('the bundle does not carry ' + token)
  }
  if (!/MIT License/.test(read('src/vendor/codemirror/LICENSE'))) {
    throw new Error('the vendored CodeMirror has no MIT licence text beside it')
  }
  const provenance = read('src/vendor/codemirror/README.md')
  for (const pkg of ['@codemirror/state', '@codemirror/view', '@codemirror/lang-markdown', 'esbuild']) {
    if (provenance.indexOf(pkg) < 0) {
      throw new Error('the vendored bundle does not record ' + pkg + ' — a rebuild would have nothing to reproduce')
    }
  }
  // Both faces mount it, and each refuses to offer 编辑 for a truncated read:
  // that preview is a prefix of the file, and saving it back would shorten it.
  const client = built ? built.client : read('src/client.js')
  const pageText = built ? built.page : read('src/host/page.js')
  for (const [label, text] of [['client bundle', client], ['popout page', pageText]]) {
    if (text.indexOf('function createEditor(container, options)') < 0) {
      throw new Error('the ' + label + ' carries no editor mount — one of the two faces cannot edit')
    }
    if (text.indexOf('/dsh-sidebar-frog/codemirror/codemirror.min.js') < 0) {
      throw new Error('the ' + label + ' does not name the editor asset it loads')
    }
    if (text.indexOf('/dsh-sidebar-frog/save') < 0) {
      throw new Error('the ' + label + ' never calls the save route')
    }
  }
  if (!/truncated/.test(client.slice(client.indexOf('const isEditablePreview'), client.indexOf('const isEditablePreview') + 400))) {
    throw new Error('the panel does not exclude a truncated preview from 编辑')
  }
  if (!/EDITABLE\[type\] === 1 && !data\.truncated/.test(pageText)) {
    throw new Error('the popout page does not exclude a truncated preview from 编辑')
  }
  ok('editor asset', 'the vendored CodeMirror (real bundle, MIT licence, versions recorded) is served as JavaScript and mounted by both faces, which both refuse to edit a truncated read')
} catch (e) {
  bad('editor asset', e && e.message ? e.message : String(e))
}

try {
  // Connection is present and refuses: every data route must answer 401 and
  // must not reach the filesystem.
  const { routes, calls, rejections } = bootHost(401)
  const reached = []
  for (const path of DATA_ROUTES) {
    const res = await call(routes[path], path + '?path=D%3A%2Fws%2Fsecret.txt&q=x')
    if (res.status !== 401) reached.push(`${path} → ${res.status}`)
  }
  if (reached.length) throw new Error('not rejected: ' + reached.join(', '))
  if (calls.length) throw new Error('a rejected request still touched the filesystem: ' + JSON.stringify(calls))
  if (rejections() !== DATA_ROUTES.length) throw new Error('guard not consulted on every data route')
  ok('auth guard', `${DATA_ROUTES.length} data routes answer 401 without credentials, assets stay open`)
} catch (e) {
  bad('auth guard', e && e.message ? e.message : String(e))
}

try {
  // Graceful degradation: no Connection service (an older host, or a carrier
  // without one) keeps the previous open behaviour instead of breaking.
  const { routes } = bootHost(null)
  const res = await call(routes['/dsh-sidebar-frog/data'], '/dsh-sidebar-frog/data')
  if (res.status !== 200) throw new Error('without Connection /data answered ' + res.status)
  ok('no Connection service', 'routes still serve (guard skipped)')
} catch (e) {
  bad('no Connection service', e && e.message ? e.message : String(e))
}

// ── 5. file tree behaviour (both halves) ───────────────────────────────────
// The tree is the one part of the plugin React/browser-only enough that a
// parse-and-load check proves nothing about it, and it has shipped two bugs
// that every other check here passed straight through: the sidebar's bulk
// expand/collapse buttons were hidden by a responsive rule at the panel's
// default width (so 全部折叠 appeared to do nothing), and its right-click menu —
// `position: fixed` inside a `container-type: inline-size` panel, which makes
// the panel the containing block — was placed with viewport coordinates and
// landed off-screen, so right-clicking appeared to do nothing either.
// Both halves are now actually driven: the page's inline script runs against the
// fake DOM in domstub.js, and FileTree mounts against the miniature hook runtime
// in minireact.js. See scripts/tree-tests.js for the scenarios.
console.log('file tree')
{
  // No responsive rule may remove a *control*: hiding a label is a layout
  // decision, hiding a button silently deletes a feature for narrow windows.
  const sheets = [
    ['src/client/styles.js', read('src/client/styles.js')],
    ['popout <style>', built ? (built.page.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1] : ''],
  ]
  let violations = 0
  for (const [name, css] of sheets) {
    const hidden = hiddenControlViolations(css)
    if (hidden.length) {
      violations += hidden.length
      bad(name + ' responsive rules', 'hides a control: ' + hidden.map((h) => `${h.query} → ${h.selector}`).join('; '))
    } else {
      ok(name + ' responsive rules', 'no control is hidden at any width')
    }
  }
  if (!violations) ok('hidden controls', 'expand/collapse-all stay reachable at every width')
}

if (built) {
  try {
    const results = await runPopoutTree(built.page)
    for (const r of results) (r.error ? bad : ok)(r.label, r.error || r.detail)
  } catch (e) {
    bad('popout tree', e && e.message ? e.message : String(e))
  }
  try {
    const results = await runSidebarTree()
    for (const r of results) (r.error ? bad : ok)(r.label, r.error || r.detail)
  } catch (e) {
    bad('sidebar tree', e && e.message ? e.message : String(e))
  }
}

// Mounts the components the plugin actually REGISTERED, with the miniature hook
// runtime — so the two panel surfaces can be inspected as rendered element trees
// instead of only as source text. The registered body is a one-line arrow that
// renders `ArtifactsContent`; minireact does not render child components, so the
// helper unwraps that element and mounts the content function itself, which is
// the component under test. Returns the renderer, the boot handles, and the CSS
// properties the component wrote onto <html>.
const mountPanel = async (override) => {
  const r = createRenderer(() => null, {})
  const styleProps = {}
  const intervals = []
  const panelEl = { getAttribute: () => '', getBoundingClientRect: () => ({ left: 1200, width: 720 }) }
  const documentStub = {
    documentElement: {
      style: {
        setProperty: (k, v) => { styleProps[k] = String(v) },
        removeProperty: (k) => { delete styleProps[k] },
      },
    },
    body: { setAttribute: () => {}, removeAttribute: () => {} },
    // `styles.insert` appends the plugin's <style> to <head>.
    head: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    // A shell panel that measures as present keeps watchShellRight from
    // installing its fallback poll.
    querySelector: (sel) => (sel === '[data-sidebar-right-panel]' ? panelEl : null),
    getElementById: () => null,
    createElement: () => ({ style: {}, select() {}, appendChild() {}, removeChild() {}, setAttribute() {} }),
  }
  const boot = bootClient(Object.assign({
    react: r.React,
    document: documentStub,
    fetch: () => Promise.reject(new Error('no host in checks')),
    setInterval: (fn) => { intervals.push(fn); return intervals.length },
    clearInterval: () => {},
  }, override))
  const flush = async () => { r.flush(); await settle(6); r.flush() }
  // Mount the component a registration carries. The registered body is a
  // one-line arrow (`() => createElement(ArtifactsContent, {surface:'native'})`),
  // and minireact does not render child components — so call the arrow, then
  // mount the component it names, and hand the arrow's element back so a caller
  // can reuse it for the other surface.
  const mount = async (registered) => {
    const el = registered.component()
    r.setComponent(el.type)
    r.setProps(el.props)
    await flush()
    return el
  }
  return { r, boot, styleProps, intervals, flush, mount }
}

// The tab id each view's body is registered under. The seat looks a body up by
// `entryKey` (= the definition's id), so the checks look them up the same way the
// shell does, rather than by position.
const VIEW_TAB_IDS = {
  tree: 'dsh-sidebar-frog/files',
  artifacts: 'dsh-sidebar-frog/artifacts',
  jobs: 'dsh-sidebar-frog/jobs',
  usage: 'dsh-sidebar-frog/usage',
  git: 'dsh-sidebar-frog/git',
}

// The content component every native view body wraps. minireact renders no child
// components, so a body's one-line arrow has to be unwrapped by hand to reach the
// component under test.
const contentComponentOf = (boot) => {
  const reg = boot.registrations.find((r) => r.def.key === VIEW_TAB_IDS.tree)
  return reg ? reg.component().type : null
}

// Mount the floating panel's content. Its registration is a one-line wrapper
// (`() => createElement(ArtifactsPanel)`) and ArtifactsPanel itself unwraps its own
// open state and renders the content — two levels, unwrapped by hand because
// minireact renders no child components. Deliberately NOT matched by component
// identity: every `bootClient` call evaluates the bundle afresh, so the same
// component has a different function object in each boot.
const mountOverlayContent = async (panel) => {
  const reg = panel.boot.registrations.find((r) => r.def.id === 'dsh-sidebar-frog-panel')
  if (!reg) throw new Error('the floating panel was not registered')
  panel.r.setComponent(reg.component)
  panel.r.setProps({})
  for (let i = 0; i < 2; i += 1) {
    await panel.flush()
    const el = panel.r.element
    if (!el || typeof el.type !== 'function') throw new Error('the floating panel rendered nothing while open')
    panel.r.setComponent(el.type)
    panel.r.setProps(el.props || {})
  }
  await panel.flush()
  return panel.r.element
}

// The body registered for one view, mounted exactly as the shell's seat renders
// it. Each native tab draws ONE view, so every per-view assertion starts here.
const mountView = async (view) => {
  const panel = await mountPanel({ sidebarRight: true })
  const body = panel.boot.registrations.find((r) => r.def.key === VIEW_TAB_IDS[view])
  if (!body) throw new Error('no body registered for the ' + view + ' view')
  await panel.mount(body)
  return panel
}

// ── 7. 两种面板形态真的画出来了 ─────────────────────────────────────────────
// The registration checks above prove the wiring; they do not prove the body the
// shell will actually render is a working panel. This mounts it. Two failures
// are silent in a browser and are asserted here: the native surface must NOT
// carry the floating window's chrome (resize handle, inline width, the layout
// push) and must NOT draw a collapse control of its own, while the overlay must
// do all three — the 收起 that moved out of the header's share-button cluster
// has to exist *somewhere*, and the panel's own header is where it went.
if (shared) {
  const { BRIDGE, serializeSettings, normalizeSettings } = shared
  try {
    // ── The bare views: one band, no chrome of the floating window ──────────
    for (const view of ['tree', 'jobs', 'git']) {
      const panel = await mountView(view)
      const natives = panel.r.findAll('artifacts-panel-native')
      if (natives.length !== 1) throw new Error('the ' + view + ' body did not render a native panel (' + natives.length + ' found)')
      if (panel.r.findAll('artifacts-resize').length) {
        throw new Error('the ' + view + ' view still renders the resize handle — the shell owns the width')
      }
      if (natives[0].props.style !== undefined) {
        throw new Error('the ' + view + ' view still carries an inline width: ' + JSON.stringify(natives[0].props.style))
      }
      if (panel.styleProps['--dsh-sidebar-frog-width']) {
        throw new Error('the ' + view + ' view still pushes the conversation column (' + panel.styleProps['--dsh-sidebar-frog-width'] + ')')
      }
      if (panel.r.findByTitle('收起侧边栏').length) {
        throw new Error('the ' + view + ' view draws a collapse control next to the shell\'s own toggle')
      }
      if (panel.r.findAll('artifacts-head').length) {
        throw new Error('the ' + view + ' view draws the floating panel\'s top bar — the shell\'s tab strip is the header there')
      }
      // No self-drawn view switcher: the shell's tab strip is what switches views,
      // so a native view must not offer one (that is the duplication this design
      // removes). The band itself is absent when it would hold nothing.
      if (panel.r.findAll('artifacts-tab').length) {
        throw new Error('the ' + view + ' view draws view-switcher chips of its own')
      }
    }
    // The tree view must actually BE the tree, not the ledger wearing a tab name.
    const treePanel = await mountView('tree')
    if (!treePanel.r.findAll('artifacts-pane').length) throw new Error('the tree view rendered no pane')
    if (treePanel.r.findAll('artifacts-item').length) {
      throw new Error('the tree view rendered the artifact ledger — the two views are not separated')
    }

    // ── The ledger view: the ONLY native view with a band of its own ────────
    // It holds the open document tabs and 清除, and it states a fact about itself
    // on the left so it reads as a header rather than an almost-empty strip — the
    // shape the product's own files tab uses (a fact on the left, tools on the
    // right). What it must NOT hold is a view switcher.
    const ledger = await mountView('artifacts')
    const bands = ledger.r.findAll('artifacts-tabs')
    if (bands.length !== 1) throw new Error('the ledger view drew ' + bands.length + ' bands')
    const clearBtn = ledger.r.findByTitle('清除模式')[0]
    if (!clearBtn) throw new Error('the ledger lost 清除')
    if (!/\bartifacts-tab-action\b/.test(String(clearBtn.props.className))) {
      throw new Error('清除 did not land on the ledger\'s own band: ' + JSON.stringify(clearBtn.props.className))
    }
    if (ledger.r.findAll('artifacts-tab').length) {
      throw new Error('the ledger draws view-switcher chips of its own — the shell\'s tab strip already names the view')
    }
    if (!ledger.r.findAll('artifacts-tab-note').length) {
      throw new Error('the ledger\'s band states nothing about the view, so it reads as an empty bar')
    }

    // ── The floating fallback keeps everything the native tabs gave up ──────
    // There is no shell strip above a floating panel, so IT must still draw the
    // view switcher, its own top bar (where 收起 and 弹出 live) and the resize
    // handle, and still reserve layout space for itself.
    const overlay = await mountPanel({})
    await mountOverlayContent(overlay)
    const roots = overlay.r.findAll('artifacts-panel').filter((el) => !/\bartifacts-panel-native\b/.test(el.props.className))
    if (roots.length !== 1) throw new Error('the overlay surface did not render the panel (' + roots.length + ' found)')
    if (!overlay.r.findAll('artifacts-resize').length) throw new Error('the overlay lost its resize handle')
    if (typeof roots[0].props.style !== 'object' || typeof roots[0].props.style.width !== 'number') {
      throw new Error('the overlay no longer sizes itself: ' + JSON.stringify(roots[0].props.style))
    }
    if (!overlay.r.findByTitle('收起侧边栏').length) {
      throw new Error('the overlay has no 收起 control — removing it from the corner left the panel with no way to collapse')
    }
    if (!overlay.r.findAll('artifacts-head').length) {
      throw new Error('the overlay lost its own top bar — the floating panel has no shell chrome to fall back on')
    }
    if (!overlay.styleProps['--dsh-sidebar-frog-width']) {
      throw new Error('the overlay no longer reserves layout space for itself')
    }
    const chips = overlay.r.findAll('artifacts-tab').map((el) => overlay.r.textOf(el))
    for (const name of ['产物', '文件树']) {
      if (!chips.includes(name)) throw new Error('the floating panel lost its ' + name + ' switcher chip (chips: ' + JSON.stringify(chips) + ')')
    }
    ok('native views (rendered)', 'each native view draws one view and one band at most: no handle, no width, no layout push, no collapse control, no switcher chips')
    ok('ledger band (rendered)', 'the only native band holds the document tabs + 清除 and a count, never a view switcher')
    ok('floating fallback (rendered)', 'keeps its own top bar, switcher chips, resize handle and layout push')
  } catch (e) {
    bad('panel surfaces', e && e.message ? e.message : String(e))
  }

  // Where a file click in the TREE goes. A native view holds one view and has no
  // file tabs of its own, so the click must hand the file to the shell
  // (`sidebarRight.openResource`), which opens it as a document tab in the same
  // column — the way the product's own file links work. The floating panel has no
  // such strip to land in when the column itself is what is missing, so it keeps
  // its internal file tabs. Both are driven here by calling the tree's own
  // `onOpen` prop, which is the same function the row's click handler calls.
  try {
    const treeElement = (mounted) => {
      let found = null
      const walk = (node) => {
        if (!node || typeof node !== 'object' || found) return
        if (typeof node.type === 'function' && node.props && typeof node.props.onOpen === 'function' && node.props.items) {
          found = node
          return
        }
        for (const child of (node.props && node.props.children) || []) walk(child)
      }
      walk(mounted.r.element)
      if (!found) throw new Error('the tree element was not rendered')
      return found
    }

    const nativeTree = await mountView('tree')
    treeElement(nativeTree).props.onOpen('D:/ws/notes.md')
    await nativeTree.flush()
    const opened = nativeTree.boot.openedResources
    if (opened.length !== 1) {
      throw new Error('a click in the native tree did not hand the file to the shell (' + opened.length + ' opens)')
    }
    if (opened[0] !== 'dsh-resource://file/session/s1/D:/ws/notes.md') {
      throw new Error('the handed-over address is ' + JSON.stringify(opened[0]))
    }

    // The floating panel with the shell face AVAILABLE (only the takeover is off):
    // it must still open its own file tab, because its file tabs are a feature of
    // the panel, not a substitute for a shell strip.
    const overlay = await mountPanel({
      sidebarRight: true,
      storage: { [BRIDGE.settings]: serializeSettings(normalizeSettings({ nativeFileTree: false })) },
    })
    await mountOverlayContent(overlay)
    await overlay.flush()
    // Exactly ONE 清除: it belongs to the ledger band, so the floating panel must
    // show it once and only once — and only while the ledger is the view on screen.
    const clears = overlay.r.findByTitle('清除模式')
    if (clears.length !== 1) {
      throw new Error('the floating panel should show exactly one 清除, got ' + clears.length)
    }
    // The floating panel mounts the tree lazily (it is not the view it opens on),
    // so switch to it the way a user would before asking for its rows.
    const treeChip = overlay.r.findAll('artifacts-tab').find((el) => overlay.r.textOf(el) === '文件树')
    if (!treeChip) throw new Error('the floating panel has no 文件树 chip to switch to')
    treeChip.props.onClick()
    await overlay.flush()
    treeElement(overlay).props.onOpen('D:/ws/notes.md')
    await overlay.flush()
    if (overlay.boot.openedResources.length) {
      throw new Error('the floating panel handed a file to the shell instead of opening its own file tab')
    }
    if (!overlay.r.findAll('artifacts-tab-file').length) {
      throw new Error('the floating panel did not open an internal file tab')
    }
    ok('file click routing', 'native tree hands the file to the shell as a dsh-resource address; the floating panel opens its own tab')
  } catch (e) {
    bad('file click routing', e && e.message ? e.message : String(e))
  }

  // The duplicated control itself. 收起 used to be drawn by the corner entry —
  // in the session header's share-button cluster, in the same 28px band as the
  // shell's own toggle. Rendered here, not grepped: open it must draw NOTHING,
  // closed it must offer 打开 and never 收起.
  try {
    const openCorner = await mountPanel()
    const trigger = openCorner.boot.registrations.find((x) => x.def.id === 'dsh-sidebar-frog-trigger')
    if (!trigger) throw new Error('the overlay trigger was not registered')
    openCorner.r.setComponent(trigger.component)
    await openCorner.flush()
    if (openCorner.r.element !== null) throw new Error('the corner entry still draws itself while the panel is open')

    const shutCorner = await mountPanel({
      storage: { [BRIDGE.settings]: serializeSettings(normalizeSettings({ defaultOpen: false })) },
    })
    const shutTrigger = shutCorner.boot.registrations.find((x) => x.def.id === 'dsh-sidebar-frog-trigger')
    shutCorner.r.setComponent(shutTrigger.component)
    await shutCorner.flush()
    if (shutCorner.r.element === null) throw new Error('a closed panel has no way back in')
    if (shutCorner.r.findByTitle('收起侧边栏').length) throw new Error('the corner entry still offers 收起侧边栏')
    if (!shutCorner.r.findByTitle('打开侧边栏').length) throw new Error('the corner entry does not offer 打开侧边栏')
    ok('no duplicate collapse (rendered)', 'open ⇒ the corner entry draws nothing; closed ⇒ only 打开 / 弹出')
  } catch (e) {
    bad('no duplicate collapse (rendered)', e && e.message ? e.message : String(e))
  }
}

// ── 8. 借给系统的 Markdown 渲染器（ctx.documentPreviews） ───────────────────
// The renderer this plugin registers into the SHELL's own document preview. What
// can go wrong here is silent in a browser: a definition with no body renders the
// seat's "nothing can view this" notice for every .md in the system sidebar, and
// a definition left live after the setting is switched off means the built-in
// renderer never resumes. Both are driven here.
if (shared) {
  const { BRIDGE, serializeSettings, normalizeSettings } = shared
  const offStorage = () => ({ [BRIDGE.settings]: serializeSettings(normalizeSettings({ nativeMarkdown: false })) })
  try {
    const boot = bootClient({ shellMarkdown: true })
    const defs = boot.documentPreviews.definitions.filter((d) => d.id === 'dsh-sidebar-frog/markdown')
    if (defs.length !== 1) throw new Error('expected one lent renderer registration, got ' + defs.length)
    const def = defs[0]
    if (def.priority !== 'extension') {
      throw new Error('the lent renderer must declare the extension band or the product\'s own renderer keeps winning, got ' + JSON.stringify(def.priority))
    }
    if (String(def.extensions) !== 'md,markdown') {
      throw new Error('the lent renderer claims ' + JSON.stringify(def.extensions) + ' — it must claim exactly the suffixes the product\'s Markdown renderer claims')
    }
    if (def.loading !== 'text-pages') throw new Error('the lent renderer must take the text-pages delivery, got ' + JSON.stringify(def.loading))
    if (typeof def.title !== 'function' || !def.title()) throw new Error('the lent renderer has no usable title')
    const body = boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.document')
    if (!body) throw new Error('the lent renderer registered no body into sidebar.right.tab.document')
    if (body.def.key !== def.id) {
      throw new Error('the document body is keyed ' + JSON.stringify(body.def.key) + ' but the renderer id is ' + JSON.stringify(def.id))
    }
    if (!boot.injectedSeats.includes('sidebar.right.tab.document')) {
      throw new Error('the document body was registered without injecting into the seat')
    }
    // The band really decides it: with the product's own renderer registered too,
    // ours must be the one the registry hands back.
    const winner = boot.documentPreviews.candidates('D:/ws/notes.md')[0]
    if (!winner || winner.id !== def.id) {
      throw new Error('the product\'s Markdown renderer still wins for .md (winner: ' + (winner && winner.id) + ')')
    }
    ok('lent markdown renderer', 'claims md/markdown in the extension band, with a body keyed by the same id')
  } catch (e) {
    bad('lent markdown renderer', e && e.message ? e.message : String(e))
  }

  // The switch is a real retraction, not a hidden flag: the product's renderer
  // must win again, and registering twice must never happen.
  try {
    const boot = bootClient({ shellMarkdown: true, storage: offStorage() })
    if (boot.documentPreviews.definitions.some((d) => d.id === 'dsh-sidebar-frog/markdown')) {
      throw new Error('the lent renderer registered itself while the setting was off')
    }
    const winner = boot.documentPreviews.candidates('D:/ws/notes.md')[0]
    if (!winner || winner.priority !== 'builtin') {
      throw new Error('.md did not fall back to the product\'s renderer (winner: ' + (winner && winner.id) + ')')
    }
    ok('lent markdown renderer (off)', 'switched off, .md goes back to the product\'s own renderer')
  } catch (e) {
    bad('lent markdown renderer (off)', e && e.message ? e.message : String(e))
  }

  // …and it is LIVE: the switch is thrown through the same cross-window settings
  // channel two app windows share, so a toggle in either window must retract or
  // restore the registration immediately.
  try {
    const boot = bootClient({ shellMarkdown: true })
    const live = () => boot.documentPreviews.definitions.filter((d) => d.id === 'dsh-sidebar-frog/markdown').length
    if (live() !== 1) throw new Error('the renderer was not live to begin with')
    const off = serializeSettings(normalizeSettings({ nativeMarkdown: false }))
    boot.store[BRIDGE.settings] = off
    boot.emit('storage', { key: BRIDGE.settings, newValue: off })
    if (live() !== 0) throw new Error('switching the setting off left the renderer registered — the built-in one would never resume')
    const back = serializeSettings(normalizeSettings({ nativeMarkdown: true }))
    boot.emit('storage', { key: BRIDGE.settings, newValue: back })
    if (live() !== 1) throw new Error('switching the setting back on did not re-register the renderer')
    if (boot.documentPreviews.disposals !== 1) {
      throw new Error('expected exactly one retraction, got ' + boot.documentPreviews.disposals)
    }
    ok('lent markdown renderer (live)', 'the setting retracts and restores the registration, once each way')
  } catch (e) {
    bad('lent markdown renderer (live)', e && e.message ? e.message : String(e))
  }

  // With no registry at all (an older shell) the plugin must simply not lend
  // anything — and must still register its own panel.
  try {
    const boot = bootClient({ noDocumentPreviews: true })
    if (boot.registrations.some((r) => r.def.name === 'sidebar.right.tab.document')) {
      throw new Error('a document body was registered with no registry to use it')
    }
    if (!boot.registered.includes('dsh-sidebar-frog')) throw new Error('the settings section disappeared')
    ok('lent markdown renderer (absent)', 'no registry ⇒ nothing is lent, the rest of the plugin is unaffected')
  } catch (e) {
    bad('lent markdown renderer (absent)', e && e.message ? e.message : String(e))
  }

  // The body the shell will actually mount, rendered: it hands the accumulated
  // text to the SAME MarkdownView the panel uses (one renderer, not two that can
  // drift), and a non-text payload degrades to a hint instead of throwing.
  try {
    const mounted = await mountPanel({ shellMarkdown: true })
    const bodyReg = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.document')
    if (!bodyReg) throw new Error('no document body was registered to mount')
    mounted.r.setComponent(bodyReg.component)
    mounted.r.setProps({
      resourceAddress: 'dsh-resource://file/absolute/D:/ws/notes.md',
      content: { kind: 'text', text: '# 标题', pages: [], eof: true },
      wrap: false,
    })
    await mounted.flush()
    const wrappers = mounted.r.findAll('artifacts-doc')
    if (wrappers.length !== 1) throw new Error('the document body rendered no markdown wrapper (' + wrappers.length + ' found)')
    const inner = (wrappers[0].props.children || [])[0]
    if (!inner || typeof inner.type !== 'function') {
      throw new Error('the document body did not delegate to the shared MarkdownView')
    }
    mounted.r.setProps({ content: { kind: 'bytes', data: new Uint8Array([1, 2, 3]) } })
    await mounted.flush()
    if (!mounted.r.texts('artifacts-hint').length) {
      throw new Error('a byte payload did not degrade to a hint')
    }
    ok('lent markdown body (rendered)', 'delegates to the panel\'s own MarkdownView; byte payloads degrade to a hint')
  } catch (e) {
    bad('lent markdown body (rendered)', e && e.message ? e.message : String(e))
  }

  // Consuming the registry: the panel asks who the SHELL would draw a file with,
  // and offers the hand-off exactly where it earns its space — a suffix this
  // panel can only show as plain text while an installed renderer claims it.
  // Driven through a real mount with a working host stub, because the condition
  // (which file is open, what its suffix maps to) is the whole feature.
  try {
    const articles = [
      { path: 'D:/ws/report.odt', kind: 'create', at: Date.now() },
      { path: 'D:/ws/report.docx', kind: 'create', at: Date.now() },
      { path: 'D:/ws/notes.md', kind: 'edit', at: Date.now() },
    ]
    // The host answers /content with `type: extType(path)` (see readArtifact in
    // src/host/core.js) and the panel merges that over its own guess — so the
    // stub has to answer the same way, or the .md would arrive labelled `text`
    // and the check would pass for the wrong reason.
    const hostStub = (url) => {
      const u = String(url)
      if (u.indexOf('/dsh-sidebar-frog/data') === 0) return { artifacts: articles }
      const path = decodeURIComponent((u.split('path=')[1] || ''))
      return { ok: true, content: '', type: shared.extType(path), truncated: false }
    }
    const mounted = await mountPanel({
      sidebarRight: true,
      shellMarkdown: true,
      extraDocumentPreviews: [{
        id: 'other/office-viewer', extensions: ['odt'], priority: 'extension',
        title: () => 'Office 查看器', loading: 'bytes-complete',
      }],
      fetch: (url) => Promise.resolve({ status: 200, json: () => Promise.resolve(hostStub(url)) }),
    })
    // Rows render in ledger order, so index 0 is the .odt, 1 the .docx and 2 the
    // .md. The registered tab body unwraps to the panel content component.
    const content = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.pane.tab')
    if (!content) throw new Error('no panel content was registered to mount')
    await mounted.mount(content)
    const row = (i) => mounted.r.findAll('artifacts-item-main')[i]
    if (mounted.r.findAll('artifacts-item-main').length !== 3) {
      const errs = mounted.r.errors.map((e) => (e && e.message) || String(e))
      throw new Error('the stubbed artifact list did not render (' + mounted.r.findAll('artifacts-item-main').length + ' rows); errors=' + JSON.stringify(errs) + ' root=' + JSON.stringify(mounted.r.element && mounted.r.element.props && mounted.r.element.props.className))
    }
    // The .odt: a BINARY container nobody here can read. The panel refuses to
    // decode it — the host does not even send its bytes (BINARY_TYPES in
    // src/host/core.js) — so what it draws is the document card: the renderer
    // that CAN draw the file is named, the hand-off is offered, and the
    // plain-text view stays an escape hatch rather than the default.
    row(0).props.onClick()
    await mounted.flush()
    // minireact does not expand child components, so the card is asserted on the
    // element the preview body produced: which component, and with which props.
    const bodyEl = mounted.r.findAll('artifacts-preview-body')[0]
    const card = bodyEl && (bodyEl.props.children || [])[0]
    if (!card || typeof card.type !== 'function' || card.type.name !== 'DocumentView') {
      throw new Error('the .odt was not handed to the binary-document card; tree=' + JSON.stringify(classDump(mounted.r.element, [])))
    }
    if (!card.props.renderer || card.props.renderer.title !== 'Office 查看器') {
      throw new Error('the card was not told which shell renderer claims the file: ' + JSON.stringify(card.props.renderer))
    }
    if (card.props.renderer.mine !== false) throw new Error('a shell renderer was mistaken for one of this plugin\'s own')
    if (typeof card.props.onOpenInShell !== 'function') throw new Error('the card has no hand-off to offer')
    if (typeof card.props.onReadText !== 'function') throw new Error('the card has no plain-text escape hatch')
    if (mounted.r.findAll('artifacts-code').length) {
      throw new Error('the binary document was decoded as text without anyone asking')
    }
    // The .docx: the panel now READS this one itself, so it must draw the office
    // view (its own bytes, a rendered document) rather than a card that asks
    // somebody else to. The element is asserted rather than the paint: the bytes
    // come from /media, which this stub does not answer.
    row(1).props.onClick()
    await mounted.flush()
    const officeEl = (mounted.r.findAll('artifacts-preview-body')[0].props.children || [])[0]
    if (!officeEl || typeof officeEl.type !== 'function' || officeEl.type.name !== 'OfficeView') {
      throw new Error('the .docx was not drawn by the panel\'s own OfficeView (got ' + (officeEl && officeEl.type && officeEl.type.name) + ')')
    }
    if (officeEl.props.path !== 'D:/ws/report.docx') {
      throw new Error('the office view was handed the wrong path: ' + JSON.stringify(officeEl.props.path))
    }
    // The .md: this panel renders it properly, so neither note nor card may appear.
    row(2).props.onClick()
    await mounted.flush()
    const mdView = (mounted.r.findAll('artifacts-preview-body')[0].props.children || [])[0]
    if (!mdView || mdView.type.name !== 'MarkdownView') {
      throw new Error('the .md was not drawn by the panel\'s own MarkdownView (got ' + (mdView && mdView.type && mdView.type.name) + ')')
    }
    if (mounted.r.findAll('artifacts-renderer').length) {
      throw new Error('a hand-off note appeared for a file this panel renders itself')
    }

    // …and the same .md with the LENDING switched off. The shell's built-in
    // Markdown renderer wins the suffix then and it is not ours — but this panel
    // still draws Markdown itself, so the note must stay away. This is the case
    // that proves the note is about what THIS PANEL cannot draw, not about who
    // happens to win in the shell.
    const lentOff = await mountPanel({
      sidebarRight: true,
      shellMarkdown: true,
      storage: { [BRIDGE.settings]: serializeSettings(normalizeSettings({ nativeMarkdown: false })) },
      fetch: (url) => Promise.resolve({ status: 200, json: () => Promise.resolve(hostStub(url)) }),
    })
    const contentOff = lentOff.boot.registrations.find((r) => r.def.name === 'sidebar.right.pane.tab')
    if (!contentOff) throw new Error('no panel content was registered to mount (lending off)')
    await lentOff.mount(contentOff)
    if (lentOff.r.findAll('artifacts-item-main').length !== 3) {
      throw new Error('the stubbed artifact list did not render with the lending off')
    }
    lentOff.r.findAll('artifacts-item-main')[2].props.onClick()
    await lentOff.flush()
    if (lentOff.r.findAll('artifacts-renderer').length) {
      throw new Error('the note appeared for a Markdown file this panel draws itself, only because the shell\'s built-in renderer won it')
    }
    ok('renderer hand-off', 'offered for a binary container (named, with a plain-text escape hatch), withheld for the Office files and Markdown this panel draws itself')
  } catch (e) {
    bad('renderer hand-off', e && e.message ? e.message : String(e))
  }
}

// ── 8b. Office 文档（docx / xlsx / pptx）：离线读，借给系统也用同一份 ──────────
// Three separate promises, each with its own way of going silently wrong:
//
//   · the REGISTRATION — an Office renderer with no body leaves the shell's seat
//     saying "no way to view this content", and one that takes the wrong
//     loading mode is handed text pages for a ZIP container (nothing renders);
//   · the EXPANSION GUARD — a .docx is a ZIP, so without a ceiling a 200 KB file
//     can inflate until the tab dies. That refusal is the only security claim in
//     this feature, so it is driven with a real archive whose central directory
//     declares 3 GB;
//   · the ASSETS — four vendored libraries behind four routes. A URL in
//     src/shared/office.js that no route serves is a 404 that shows up only in a
//     browser, as a document that never finishes loading.
console.log('office documents')

if (shared) {
  // A minimal ZIP writer: local headers + data, the central directory, the EOCD.
  // Only what the reader parses is written (stored entries, no data descriptor),
  // so a check can DECLARE a huge uncompressed size without allocating it —
  // which is exactly the shape a ZIP bomb has on disk.
  const makeZip = (entries) => {
    const chunks = []
    const central = []
    let offset = 0
    for (const e of entries) {
      const name = Buffer.from(e.name, 'utf8')
      const data = Buffer.from(e.data || '', 'utf8')
      const declared = e.uncompressed == null ? data.length : e.uncompressed
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(20, 4)
      local.writeUInt16LE(0, 8) // stored: no compression
      local.writeUInt32LE(data.length, 18)
      local.writeUInt32LE(declared, 22)
      local.writeUInt16LE(name.length, 26)
      chunks.push(local, name, data)
      const cd = Buffer.alloc(46)
      cd.writeUInt32LE(0x02014b50, 0)
      cd.writeUInt16LE(20, 4)
      cd.writeUInt16LE(20, 6)
      cd.writeUInt32LE(data.length, 20)
      cd.writeUInt32LE(declared, 24)
      cd.writeUInt16LE(name.length, 28)
      cd.writeUInt32LE(offset, 42)
      central.push(cd, name)
      offset += local.length + name.length + data.length
    }
    const cdBuf = Buffer.concat(central)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(entries.length, 8)
    eocd.writeUInt16LE(entries.length, 10)
    eocd.writeUInt32LE(cdBuf.length, 12)
    eocd.writeUInt32LE(offset, 16)
    return new Uint8Array(Buffer.concat([...chunks, cdBuf, eocd]))
  }

  try {
    const { officeKind, officeKindLabel, OFFICE_MAX_FILE, OFFICE_MAX_EXPANDED, officeZipTotals, officeBytesVerdict, officeSizeText } = shared
    // Which suffixes are ours, and which stay a container for the card.
    const kinds = [['a.docx', 'docx'], ['a.XLSX', 'xlsx'], ['a.pptx', 'pptx']]
    const notOurs = ['a.doc', 'a.xls', 'a.ppt', 'a.odt', 'a.epub', 'a.txt', 'noext']
    const wrong = kinds.filter(([p, want]) => officeKind(p) !== want).map(([p]) => p + ' => ' + JSON.stringify(officeKind(p)))
    const leaked = notOurs.filter((p) => officeKind(p)).map((p) => p + ' => ' + officeKind(p))
    if (wrong.length || leaked.length) throw new Error('suffix table: ' + wrong.concat(leaked).join('; '))
    if (!officeKindLabel('docx') || !officeKindLabel('xlsx') || !officeKindLabel('pptx')) throw new Error('a kind has no label')
    // The reader itself.
    const small = makeZip([{ name: 'word/document.xml', data: '<w:document/>' }])
    const smallSize = Buffer.byteLength('<w:document/>')
    const totals = officeZipTotals(small)
    if (!totals || totals.entries !== 1 || totals.uncompressed !== smallSize) {
      throw new Error('reading a ZIP central directory gave ' + JSON.stringify(totals))
    }
    if (totals.compressed !== smallSize) throw new Error('the compressed total is ' + totals.compressed)
    if (officeZipTotals(new Uint8Array([1, 2, 3, 4, 5]))) throw new Error('garbage was read as a ZIP')
    if (officeZipTotals(new Uint8Array(0))) throw new Error('an empty buffer was read as a ZIP')
    if (!officeBytesVerdict(small).ok) throw new Error('a normal archive was refused: ' + JSON.stringify(officeBytesVerdict(small)))
    if (officeBytesVerdict(new Uint8Array(0)).code !== 'empty') throw new Error('an empty file was not refused as empty')
    const big = new Uint8Array(OFFICE_MAX_FILE + 1)
    const overFile = officeBytesVerdict(big)
    if (overFile.ok || overFile.code !== 'too-big') throw new Error('a file over the ceiling was accepted: ' + JSON.stringify(overFile))
    if (overFile.message.indexOf('MB') < 0) throw new Error('the size refusal names no size: ' + overFile.message)
    // THE BOMB: 3 GB declared behind a few hundred bytes, which is what a
    // malicious (or merely enormous) document looks like from the outside.
    const bomb = makeZip([{ name: 'word/document.xml', data: 'x'.repeat(64), uncompressed: 3 * 1024 * 1024 * 1024 }])
    if (bomb.length > OFFICE_MAX_FILE) throw new Error('the fixture is not the shape under test (the FILE is over the ceiling)')
    const verdict = officeBytesVerdict(bomb)
    if (verdict.ok || verdict.code !== 'too-expanded') {
      throw new Error('a 3 GB expansion was accepted: ' + JSON.stringify(verdict))
    }
    if (verdict.message.indexOf('GB') >= 0 && officeSizeText(3 * 1024 * 1024 * 1024).indexOf('GB') < 0) {
      throw new Error('the expansion refusal formats size as ' + officeSizeText(3 * 1024 * 1024 * 1024))
    }
    if (verdict.message.indexOf('3 GB') < 0) throw new Error('the expansion refusal hides the size: ' + verdict.message)
    ok('office kinds + expansion guard', 'docx/xlsx/pptx are ours, .doc/.odt stay containers; a declared 3 GB expansion is refused (ceiling ' + officeSizeText(OFFICE_MAX_EXPANDED) + '), a normal archive and a non-ZIP are not')
  } catch (e) {
    bad('office kinds + expansion guard', e && e.message ? e.message : String(e))
  }

  // The lend itself: metadata + a body keyed by the same id, in the extension
  // band, taking the COMPLETE-BYTE delivery.
  try {
    const boot = bootClient({ shellMarkdown: true })
    const defs = boot.documentPreviews.definitions.filter((d) => d.id === 'dsh-sidebar-frog/office')
    if (defs.length !== 1) throw new Error('expected one office renderer registration, got ' + defs.length)
    const def = defs[0]
    if (def.priority !== 'extension') throw new Error('lent outside the extension band: ' + def.priority)
    if (String(def.extensions) !== 'docx,xlsx,pptx') throw new Error('claims ' + JSON.stringify(def.extensions))
    if (def.loading !== 'bytes-complete') {
      throw new Error('the office renderer takes ' + JSON.stringify(def.loading) + ' — an Office file is a ZIP container, so it needs the complete bytes, not pages of text')
    }
    if (def.wrap !== false) throw new Error('the office renderer claims a wrap preference it does not consume')
    if (typeof def.title !== 'function' || !def.title()) throw new Error('the office renderer has no usable title')
    const body = boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.document' && r.def.key === def.id)
    if (!body) throw new Error('the office renderer registered no body into sidebar.right.tab.document')
    if (!boot.injectedSeats.includes('sidebar.right.tab.document')) {
      throw new Error('the office body was registered without injecting into the seat')
    }
    for (const path of ['D:/ws/report.docx', 'D:/ws/book.xlsx', 'D:/ws/deck.pptx']) {
      const winner = boot.documentPreviews.candidates(path)[0]
      if (!winner || winner.id !== def.id) throw new Error(path + ' would be drawn by ' + (winner && winner.id))
    }
    // …and it must NOT reach past its suffixes: a .doc has no reader here.
    if (boot.documentPreviews.candidates('D:/ws/legacy.doc').some((d) => d.id === def.id)) {
      throw new Error('the office renderer claims .doc, which it cannot read')
    }
    ok('lent office renderer', 'docx/xlsx/pptx in the extension band with bytes-complete delivery and a body keyed by the same id')
  } catch (e) {
    bad('lent office renderer', e && e.message ? e.message : String(e))
  }

  // The PDF lend, which is a CAPABILITY fallback rather than a switch. The
  // product's own PDF renderer is pdf.js 6, and version 6 calls the Map/WeakMap
  // upsert methods — Baseline "newly available" only since February 2026
  // (Chromium 145). Nothing can polyfill them for it either: the product builds
  // the Worker from a Blob of its own, so the throw happens in a realm this
  // plugin cannot reach, on the FIRST page request:
  //   this[#methodPromises].getOrInsertComputed is not a function
  // (Quark 7.1 is Chromium 144 — exactly that engine.) There the .pdf suffix
  // MUST become ours; where the product's renderer can run, we must stay out of
  // its way. Both directions are driven here, because the check box may or may
  // not have the method itself.
  try {
    const savedUpsert = Map.prototype.getOrInsert
    const savedComputed = Map.prototype.getOrInsertComputed
    // The box running the check may itself lack the methods (Node 22 does), so
    // the "capable engine" direction installs stand-ins; 'restore' puts the
    // process back EXACTLY as it was found, because every later check reads the
    // same Map (a leaked stub would make the plugin look like it should not take
    // the suffix over).
    const setMethods = (mode) => {
      try {
        if (mode === 'off') {
          delete Map.prototype.getOrInsert
          delete Map.prototype.getOrInsertComputed
        } else if (mode === 'stub') {
          Map.prototype.getOrInsert = savedUpsert || function (key, value) {
            if (!this.has(key)) this.set(key, value)
            return this.get(key)
          }
          Map.prototype.getOrInsertComputed = savedComputed || function (key, compute) {
            if (!this.has(key)) this.set(key, compute(key))
            return this.get(key)
          }
        } else {
          if (savedUpsert) Map.prototype.getOrInsert = savedUpsert
          else delete Map.prototype.getOrInsert
          if (savedComputed) Map.prototype.getOrInsertComputed = savedComputed
          else delete Map.prototype.getOrInsertComputed
        }
      } catch (e) { /* a frozen Map.prototype would make the box untestable */ }
    }
    try {
      setMethods('off')
      const weak = bootClient({ shellMarkdown: true })
      const weakDefs = weak.documentPreviews.definitions.filter((d) => d.id === 'dsh-sidebar-frog/pdf')
      if (weakDefs.length !== 1) {
        throw new Error('an engine without Map.prototype.getOrInsertComputed lent the pdf suffix ' + weakDefs.length + ' time(s): the product\'s PDF renderer cannot open a file there')
      }
      const def = weakDefs[0]
      if (def.priority !== 'extension') throw new Error('the pdf lender sits outside the extension band: ' + def.priority)
      if (String(def.extensions) !== 'pdf') throw new Error('the pdf lender claims ' + JSON.stringify(def.extensions))
      if (def.loading !== 'bytes-complete') throw new Error('the pdf lender takes ' + JSON.stringify(def.loading) + ', but it is handed the complete bytes')
      if (def.wrap !== false) throw new Error('the pdf lender claims a wrap preference it does not consume')
      const winner = weak.documentPreviews.candidates('D:/ws/report.pdf')[0]
      if (!winner || winner.id !== def.id) throw new Error('.pdf would still be drawn by ' + (winner && winner.id))
      const body = weak.registrations.find((r) => r.def.name === 'sidebar.right.tab.document' && r.def.key === def.id)
      if (!body) throw new Error('the pdf lender registered no body into sidebar.right.tab.document')
      if (weak.documentPreviews.candidates('D:/ws/report.docx').some((d) => d.id === def.id)) {
        throw new Error('the pdf lender claims a suffix it does not draw')
      }
      // The other direction, on a stand-in-capable Map.
      setMethods('stub')
      const strong = bootClient({ shellMarkdown: true })
      if (strong.documentPreviews.definitions.some((d) => d.id === 'dsh-sidebar-frog/pdf')) {
        throw new Error('this engine CAN run the product\'s pdf.js 6, so .pdf must be left to it — the plugin registered anyway')
      }
    } finally {
      // Put the process back EXACTLY as it was found: every later check reads the
      // same Map, and a leaked stand-in would make the plugin look like it must
      // not take the suffix over.
      setMethods('restore')
    }
    ok('lent pdf renderer', 'takes .pdf only where the product\'s pdf.js 6 cannot run (no Map upsert methods), and hands it back where it can')
  } catch (e) {
    bad('lent pdf renderer', e && e.message ? e.message : String(e))
  }

  // The switch, and the trap two switches on one registry create: turning the
  // OFFICE lend off must move the office suffixes only. A regression here is
  // invisible in the shell — the Markdown renderer just stops being ours.
  try {
    const { BRIDGE, serializeSettings, normalizeSettings } = shared
    const boot = bootClient({ sidebarRight: true, shellMarkdown: true })
    const ids = () => boot.documentPreviews.definitions.map((d) => d.id).filter((id) => id.indexOf('dsh-sidebar-frog/') === 0)
    // The three SWITCH-driven lenders. The pdf one is deliberately not in this
    // list: it is a capability fallback (see 'lent pdf renderer' below), so
    // whether it is registered depends on the ENGINE, not on a setting.
    const SWITCHED = ['dsh-sidebar-frog/markdown', 'dsh-sidebar-frog/table', 'dsh-sidebar-frog/office']
    const absent = () => SWITCHED.filter((id) => ids().indexOf(id) < 0)
    if (absent().length) throw new Error('started without ' + JSON.stringify(absent()) + ' (got ' + JSON.stringify(ids()) + ')')
    const off = serializeSettings(normalizeSettings({ nativeOffice: false }))
    boot.store[BRIDGE.settings] = off
    boot.emit('storage', { key: BRIDGE.settings, newValue: off })
    const after = ids()
    if (after.indexOf('dsh-sidebar-frog/office') >= 0) {
      throw new Error('switching the office lend off left it registered — the shell would keep using it')
    }
    if (after.indexOf('dsh-sidebar-frog/markdown') < 0 || after.indexOf('dsh-sidebar-frog/table') < 0) {
      throw new Error('switching the office lend off also retracted ' + JSON.stringify(after))
    }
    if (boot.documentPreviews.candidates('D:/ws/report.docx').some((d) => d.id === 'dsh-sidebar-frog/office')) {
      throw new Error('.docx still matched the retracted renderer')
    }
    const back = serializeSettings(normalizeSettings({ nativeOffice: true }))
    boot.store[BRIDGE.settings] = back
    boot.emit('storage', { key: BRIDGE.settings, newValue: back })
    if (absent().length) throw new Error('switching it back on lost ' + JSON.stringify(absent()))
    if (boot.documentPreviews.disposals !== 1) throw new Error('expected exactly one retraction, got ' + boot.documentPreviews.disposals)
    ok('office lend (live)', 'the office switch retracts and restores only its own renderer, and the .docx suffix goes with it')
  } catch (e) {
    bad('office lend (live)', e && e.message ? e.message : String(e))
  }

  // The body the shell will mount: a byte payload is handed to the shared
  // OfficeView, a payload of the wrong SHAPE degrades to a hint, and a suffix
  // nobody registered a reader for is not the office body's business.
  try {
    const mounted = await mountPanel({ shellMarkdown: true })
    const bodyReg = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.document' && r.def.key === 'dsh-sidebar-frog/office')
    if (!bodyReg) throw new Error('no office document body was registered to mount')
    mounted.r.setComponent(bodyReg.component)
    mounted.r.setProps({
      resourceAddress: 'dsh-resource://file/absolute/D:/ws/report.docx',
      content: { kind: 'bytes', data: new Uint8Array([0x50, 0x4b, 3, 4]) },
      wrap: false,
    })
    await mounted.flush()
    const wrappers = mounted.r.findAll('artifacts-doc')
    if (wrappers.length !== 1) throw new Error('the office body rendered no wrapper (' + wrappers.length + ' found)')
    if (!wrappers[0].props.className.includes('is-office')) {
      throw new Error('the office wrapper carries no is-office class, so the widget gets no height: ' + JSON.stringify(wrappers[0].props.className))
    }
    const inner = (wrappers[0].props.children || [])[0]
    if (!inner || typeof inner.type !== 'function' || inner.type.name !== 'OfficeView') {
      throw new Error('the office body did not delegate to the shared OfficeView (got ' + (inner && inner.type && inner.type.name) + ')')
    }
    if (!inner.props.bytes || inner.props.kind !== 'docx') {
      throw new Error('the office body handed over ' + JSON.stringify({ kind: inner.props.kind, bytes: !!inner.props.bytes }))
    }
    mounted.r.setProps({ content: { kind: 'text', text: 'PK…', pages: [], eof: true } })
    await mounted.flush()
    if (!mounted.r.texts('artifacts-hint').length) throw new Error('a text payload did not degrade to a hint')
    ok('office document body (rendered)', 'hands the seat\'s complete bytes to the shared OfficeView; a text payload degrades to a hint')
  } catch (e) {
    bad('office document body (rendered)', e && e.message ? e.message : String(e))
  }

  // The body that draws a PDF here: the seat's complete bytes go to the SAME
  // PdfView the panel mounts (never re-read through this plugin's own /media
  // route, which may refuse a path it does not consider readable), the wrapper
  // carries the class that gives the absolutely positioned viewer a box, and a
  // payload of the wrong shape degrades to a hint instead of an empty pane.
  try {
    const mounted = await mountPanel({ shellMarkdown: true })
    const bodyReg = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.document' && r.def.key === 'dsh-sidebar-frog/pdf')
    if (!bodyReg) throw new Error('no pdf document body was registered to mount')
    mounted.r.setComponent(bodyReg.component)
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    mounted.r.setProps({
      resourceAddress: 'dsh-resource://file/absolute/D:/ws/report.pdf',
      content: { kind: 'bytes', data: bytes },
      wrap: false,
    })
    await mounted.flush()
    const wrappers = mounted.r.findAll('artifacts-doc')
    if (wrappers.length !== 1) throw new Error('the pdf body rendered no wrapper (' + wrappers.length + ' found)')
    if (!wrappers[0].props.className.includes('is-pdf')) {
      throw new Error('the pdf wrapper carries no is-pdf class, so the absolutely positioned viewer has no box: ' + JSON.stringify(wrappers[0].props.className))
    }
    const inner = (wrappers[0].props.children || [])[0]
    if (!inner || typeof inner.type !== 'function' || inner.type.name !== 'PdfView') {
      throw new Error('the pdf body did not delegate to the panel\'s PdfView (got ' + (inner && inner.type && inner.type.name) + ')')
    }
    if (!inner.props.bytes || inner.props.bytes.length !== bytes.length) {
      throw new Error('the pdf body did not hand the seat\'s bytes over: ' + JSON.stringify({ bytes: !!inner.props.bytes }))
    }
    mounted.r.setProps({ content: { kind: 'text', text: '%PDF-1.7', pages: [], eof: true } })
    await mounted.flush()
    if (!mounted.r.texts('artifacts-hint').length) throw new Error('a text payload did not degrade to a hint')
    ok('pdf document body (rendered)', 'hands the seat\'s complete bytes to the panel\'s own PdfView; a text payload degrades to a hint')
  } catch (e) {
    bad('pdf document body (rendered)', e && e.message ? e.message : String(e))
  }

  // The panel's own route to the same widget: the bytes come from THIS plugin's
  // /media route (the panel is handed a path, not content), and a read that fails
  // says so instead of leaving an empty box.
  try {
    const asked = []
    const answer = (ok) => (url) => {
      asked.push(String(url))
      return Promise.resolve(ok
        ? { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }
        : { ok: false, status: 500, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
    }
    const mounted = await mountPanel({
      sidebarRight: true,
      fetch: (url) => {
        const u = String(url)
        if (u.indexOf('/dsh-sidebar-frog/data') === 0) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ artifacts: [{ path: 'D:/ws/report.xlsx', kind: 'create', at: Date.now() }] }) })
        }
        if (u.indexOf('/dsh-sidebar-frog/content') === 0) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, content: '', type: 'office', truncated: false }) })
        }
        return answer(false)(url)
      },
    })
    const content = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.pane.tab')
    await mounted.mount(content)
    mounted.r.findAll('artifacts-item-main')[0].props.onClick()
    await mounted.flush()
    const officeEl = (mounted.r.findAll('artifacts-preview-body')[0].props.children || [])[0]
    mounted.r.setComponent(officeEl.type)
    mounted.r.setProps(officeEl.props)
    await mounted.flush()
    const media = asked.filter((u) => u.indexOf('/dsh-sidebar-frog/media') === 0)
    if (media.length !== 1) throw new Error('the office view asked for bytes ' + media.length + ' time(s): ' + JSON.stringify(asked))
    if (media[0].indexOf(encodeURIComponent('D:/ws/report.xlsx')) < 0) {
      throw new Error('the office view asked for the wrong path: ' + media[0])
    }
    const state = mounted.r.findAll('office-state')
    if (!state.length || !state[0].props.className.includes('is-error')) {
      throw new Error('a failed byte read drew no error state (' + JSON.stringify(mounted.r.texts('office-state')) + ')')
    }
    const said = mounted.r.texts('office-state').join(' ')
    if (said.indexOf('500') < 0) throw new Error('the failure does not name the reason: ' + JSON.stringify(said))
    ok('office view (panel)', 'reads the bytes from this plugin\'s own /media route and states the reason when the read fails')
  } catch (e) {
    bad('office view (panel)', e && e.message ? e.message : String(e))
  }

  // The four assets: every URL src/shared/office.js will ask for must be served
  // by a route of this plugin, with the vendored bytes behind it. A drift here is
  // a 404 that only ever shows in a browser.
  try {
    const { routes } = bootHost(undefined)
    const wanted = Object.entries(shared.OFFICE_ASSETS)
    if (wanted.length !== 4) throw new Error('expected four office assets, got ' + wanted.length)
    const missing = []
    const misTyped = []
    for (const [name, url] of wanted) {
      const route = routes[url]
      if (!route) { missing.push(name + ' → ' + url); continue }
      const out = await call(route, url)
      if (out.status !== 200) { misTyped.push(url + ' answered ' + out.status); continue }
      if (String(out.headers['Content-Type']).indexOf('javascript') < 0) {
        misTyped.push(url + ' is served as ' + out.headers['Content-Type'] + ' — a module loader and a <script> both need JavaScript')
      }
      if (!out.body || out.body.length < 1000) misTyped.push(url + ' served ' + (out.body ? out.body.length : 0) + ' bytes')
    }
    if (missing.length || misTyped.length) throw new Error(missing.concat(misTyped).join('; '))
    // …and they really are the libraries, not a placeholder: each vendored file
    // is checked for the string that names it, and for the global the loader
    // reads. Replacing a vendor file with a stub would otherwise pass silently
    // until a document failed to render.
    const signatures = [
      ['src/vendor/jszip/jszip.min.js', /JSZip/],
      ['src/vendor/docx-preview/docx-preview.min.js', /docx-preview/],
      ['src/vendor/xlsx/xlsx.full.min.js', /SheetJS/],
      ['src/vendor/pptx/pptx-renderer.browser.es.js', /PptxViewer/],
    ]
    for (const [file, re] of signatures) {
      const text = read(file)
      if (!re.test(text)) throw new Error(file + ' does not name its library — is it really the vendored build?')
    }
    if (!/window\.XLSX=XLSX|make_xlsx_lib\(XLSX\)/.test(read('src/vendor/xlsx/xlsx.full.min.js'))) {
      throw new Error('the vendored SheetJS does not expose the XLSX global the loader reads')
    }
    // Licences travel with the code (Apache-2.0 for three, MIT-or-GPLv3 for
    // JSZip, of which this plugin takes the MIT branch).
    for (const dir of ['jszip', 'docx-preview', 'xlsx', 'pptx']) {
      const licence = read('src/vendor/' + dir + '/LICENSE')
      if (licence.length < 500) throw new Error('src/vendor/' + dir + '/LICENSE is not a licence text')
    }
    if (!/Apache License/.test(read('src/vendor/docx-preview/LICENSE'))) throw new Error('docx-preview\'s licence is not Apache-2.0')
    if (!/MIT License/.test(read('src/vendor/jszip/LICENSE'))) throw new Error('JSZip\'s dual licence does not offer the MIT branch')
    ok('office assets', 'four routes serve the vendored readers (JavaScript, real library, licence included) at exactly the URLs the shared module asks for')
  } catch (e) {
    bad('office assets', e && e.message ? e.message : String(e))
  }

  // Both faces: the shared module and the shared stylesheet must reach the client
  // bundle AND the popout page, or one of the two windows silently cannot draw an
  // Office file. The page is asserted through the assembled text, since that is
  // what the browser receives.
  try {
    const client = built ? built.client : read('src/client.js')
    const pageText = built ? built.page : read('src/host/page.js')
    for (const [label, text] of [['client bundle', client], ['popout page', pageText]]) {
      if (text.indexOf('function officeMount(container, kind, bytes, options)') < 0) {
        throw new Error('the ' + label + ' carries no officeMount — Office documents would not render there')
      }
      if (text.indexOf('.office-view') < 0) throw new Error('the ' + label + ' carries none of the shared office CSS')
    }
    const pageCss = (pageText.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1]
    if (pageCss.indexOf('.office-grid') < 0 || pageCss.indexOf('.office-docx-page-wrapper') < 0) {
      throw new Error('the popout <style> is missing the shared office rules (the Word/Excel widgets would be unstyled)')
    }
    if (client.indexOf('.office-view') < 0 || client.indexOf('.office-grid') < 0) {
      throw new Error('the panel stylesheet is missing the shared office rules')
    }
    ok('office in both faces', 'the shared widget and stylesheet reach the panel and the popout page alike')
  } catch (e) {
    bad('office in both faces', e && e.message ? e.message : String(e))
  }
}

// ── 9. 自己改过名字的 kind：老会话里的 Tab 必须还能画出面板 ──────────────────
// The column's layout is DURABLE — it rides the session log — and this plugin
// renamed the kind it occupies (its own `frog` → the product's `files`). Every
// session that already had the panel open kept a tab whose kind no longer
// resolves, and the seat — dispatching by `definition?.id ?? tab.kind` — found
// no body under the bare OLD kind and drew the shell's「这类内容还没有可用的查看
// 方式。」exactly where the panel used to be. A retired kind therefore keeps a
// body, and these assertions are what keep it that way.
{
  try {
    const { registrations, tabs } = bootClient({ sidebarRight: true })
    // What matters is not how many types the plugin registers (it registers one per
    // view) but that no RETIRED name came back as a TYPE — retired names get BODIES
    // only — and that every view still carries its guide entry.
    const retiredTypes = tabs.filter((t) => t.kind === 'frog' || t.id === 'dsh-sidebar-frog').map((t) => t.kind)
    if (retiredTypes.length) {
      throw new Error('a retired kind was registered as a TAB TYPE: ' + JSON.stringify(retiredTypes))
    }
    const guideCount = tabs.reduce((n, t) => n + ((t.guide && t.guide.length) || 0), 0)
    if (guideCount !== tabs.length) {
      throw new Error('this plugin contributes ' + guideCount + ' guide entries for ' + tabs.length + ' views — every view must be reachable from the chooser')
    }
    const bodyKeys = registrations.filter((r) => r.def.name === 'sidebar.right.pane.tab').map((r) => r.def.key)
    if (bodyKeys.indexOf('dsh-sidebar-frog/files') < 0) {
      throw new Error('the current tab body is missing: ' + JSON.stringify(bodyKeys))
    }
    // Every retired name keeps a body — `frog` (the round-3 rename) and
    // `frog-browser` (the view removed in this round) alike: a session that was
    // restored with either tab must not come back to the shell's "nothing can
    // view this" notice.
    for (const retired of ['frog', 'frog-browser']) {
      if (bodyKeys.indexOf(retired) < 0) {
        throw new Error('no body is registered for the RETIRED kind "' + retired + '" — a session that already had that tab open comes back to the shell\'s "nothing can view this" notice (keys: ' + JSON.stringify(bodyKeys) + ')')
      }
    }
    if (new Set(bodyKeys).size !== bodyKeys.length) {
      throw new Error('a body key is registered twice: ' + JSON.stringify(bodyKeys))
    }

    // …and the retired key really draws the panel, on the LEDGER that tab was.
    const mounted = await mountPanel({ sidebarRight: true })
    const legacyReg = mounted.boot.registrations.find((r) => r.def.key === 'frog')
    if (!legacyReg) throw new Error('the retired kind has no body to mount')
    await mounted.mount(legacyReg)
    if (mounted.r.findAll('artifacts-panel-native').length !== 1) {
      throw new Error('the retired kind\'s body did not render the panel')
    }
    // That tab meant the ledger when it was opened, so it must come back on the
    // ledger — not on whichever view happens to be the plugin's first tab now. The
    // ledger is the only view whose band states a count, and the only one that
    // mounts the artifact list at all.
    if (mounted.r.findAll('artifacts-tab-note').length !== 1) {
      throw new Error('a restored 产物 tab did not come back on the ledger (no ledger band)')
    }
    if (!mounted.r.findAll('artifacts-body').length) {
      throw new Error('a restored 产物 tab rendered no ledger list')
    }
    if (mounted.r.findAll('artifacts-tree').length) {
      throw new Error('a restored 产物 tab came back as the file tree')
    }
    ok('retired tab kind', 'every retired name (frog, frog-browser) keeps a body and comes back on the ledger it used to be')
  } catch (e) {
    bad('retired tab kind', e && e.message ? e.message : String(e))
  }
}

// ── 10. 反馈走系统自己的浮层，而不是面板里的一行 ─────────────────────────────
// `shell.overlay` is the shell's frame-wide, click-through layer, and its
// contract names a toast stack as exactly what belongs there. The panel's
// transient feedback therefore renders there instead of inside a band of ours —
// which is what let the native surface drop to a single row of chrome. Driven
// end to end: a real action (the popout asking this window for an @reference)
// must make the pill appear in that layer, and it must cost the layer nothing
// while idle.
if (shared) {
  const { BRIDGE, bridgeEncodeQuote } = shared
  try {
    const mounted = await mountPanel({ sidebarRight: true })
    const pill = mounted.boot.registrations.find((r) => r.def.id === 'dsh-sidebar-frog-notice')
    if (!pill) throw new Error('the notice was not registered anywhere')
    if (pill.def.name !== 'shell.overlay') {
      throw new Error('the notice registered into ' + JSON.stringify(pill.def.name) + ' — the frame-wide layer is shell.overlay')
    }
    mounted.r.setComponent(pill.component)
    await mounted.flush()
    if (mounted.r.element !== null) throw new Error('the notice pill draws something while there is no notice')

    // The cross-window bridge writes a notice when the popout asks this window to
    // put an @reference in the composer (an existing, already-covered path).
    const payload = bridgeEncodeQuote('D:/ws/chart.png', 'nonce-pill', Date.now())
    mounted.boot.store[BRIDGE.quote] = payload
    mounted.boot.emit('storage', { key: BRIDGE.quote, newValue: payload })
    await mounted.flush()
    const pills = mounted.r.findAll('artifacts-notice-pill')
    if (pills.length !== 1) throw new Error('a real notice did not reach the shell\'s overlay layer (' + pills.length + ' pills)')
    const text = mounted.r.textOf(pills[0])
    if (text.indexOf('已从弹出页插入') < 0) throw new Error('the pill shows ' + JSON.stringify(text))
    ok('notice pill', 'idle costs the shell\'s overlay layer nothing; a real notice renders in it')
  } catch (e) {
    bad('notice pill', e && e.message ? e.message : String(e))
  }
}

// ── 9. 用量 tab：一个系统的 Tab，读系统自己的会话投影 ────────────────────────
// The view is built entirely from the framework's `useProjection`, which the tab
// seat injects as a STANDARD PROP. Three silent failures are driven here:
//   · the type registered without a body (the seat's「这类内容还没有可用的查看方式」);
//   · the body not reading the prop (every figure reads as "not reported");
//   · the occupancy figure disagreeing with the product's own rule — the ring
//     beside the composer must show the same number, so the rule is asserted
//     against the product's formula rather than against a copy of itself.
// Plus the invariant that makes every view findable: each contributes exactly one
// guide entry, so the chooser page lists them all.
{
  try {
    const { tabs, registrations, injectedSeats } = bootClient({ sidebarRight: true })
    const usageDef = tabs.find((t) => t.id === 'dsh-sidebar-frog/usage')
    if (!usageDef) throw new Error('the 用量 page type was not registered')
    if (usageDef.kind !== 'frog-usage') throw new Error('the 用量 kind is ' + JSON.stringify(usageDef.kind))
    if (usageDef.priority !== 'extension') {
      throw new Error('a type from outside the product declares the extension band, got ' + JSON.stringify(usageDef.priority))
    }
    if (usageDef.patterns) throw new Error('the 用量 tab is a page type — it must not claim resource addresses')
    if (!usageDef.guide || usageDef.guide.length !== 1) {
      throw new Error('the 用量 view must carry its own guide entry (got ' + ((usageDef.guide || []).length) + ')')
    }
    if (typeof usageDef.guide[0].title !== 'function' || !usageDef.guide[0].title()) {
      throw new Error('the 用量 guide entry has no title')
    }
    const guideCount = tabs.reduce((n, t) => n + ((t.guide && t.guide.length) || 0), 0)
    if (guideCount !== tabs.length) {
      throw new Error('the plugin contributes ' + guideCount + ' guide entries for ' + tabs.length + ' views')
    }
    const usageBody = registrations.find((r) => r.def.key === 'dsh-sidebar-frog/usage')
    if (!usageBody) throw new Error('the 用量 type registered no body into sidebar.right.pane.tab')
    if (usageBody.def.name !== 'sidebar.right.pane.tab') throw new Error('the 用量 body went into ' + usageBody.def.name)
    if (!injectedSeats.includes('sidebar.right.pane.tab')) throw new Error('the 用量 body was registered without injecting into the seat')
    ok('usage tab type', 'a system page type with its own keyed body and its own guide entry')
  } catch (e) {
    bad('usage tab type', e && e.message ? e.message : String(e))
  }

  // `UsageTabBody` wraps the pane, and minireact does not render child components
  // — so call the body, then mount the pane element it produced. The wrapper is
  // what calls the projection hooks, so this drives the spy too.
  const mountUsageView = async (mounted, useProjection) => {
    const usageBody = mounted.boot.registrations.find((r) => r.def.key === 'dsh-sidebar-frog/usage')
    if (!usageBody) throw new Error('the 用量 type registered no body')
    const outer = usageBody.component({ useProjection })
    if (!outer || typeof outer.type !== 'function') throw new Error('the 用量 body rendered nothing')
    const rendered = outer.type(outer.props)
    const pane = ((rendered && rendered.props && rendered.props.children) || [])
      .find((child) => child && typeof child.type === 'function' && child.props && 'usage' in child.props)
    if (!pane) throw new Error('the 用量 body did not delegate to the usage pane')
    mounted.r.setComponent(pane.type)
    mounted.r.setProps(pane.props)
    await mounted.flush()
    return outer
  }

  // The rendered view, from the projections the seat would inject.
  try {
    const mounted = await mountPanel({ sidebarRight: true })
    const asked = []
    const projections = {
      // projectedTokens (what the NEXT request would cost) must win over
      // pressureTokens (the provider's last sample): 120000/200000 = 60%.
      contextPressure: { pressureTokens: 100000, projectedTokens: 120000, contextWindow: 200000 },
      contextBreakdown: { systemTokens: 10000, toolsTokens: 5000, messageTokens: 15000 },
      tokenUsage: { uncachedInputTokens: 1200000, outputTokens: 45000, cacheReadTokens: 3400000, cacheWriteTokens: 500000 },
    }
    await mountUsageView(mounted, (key) => { asked.push(key); return projections[key] })
    await mounted.flush()
    // Every render calls the three hooks again, so compare the DISTINCT keys in
    // first-seen order.
    if (String(Array.from(new Set(asked))) !== 'contextPressure,contextBreakdown,tokenUsage') {
      throw new Error('the body asked for ' + JSON.stringify(Array.from(new Set(asked))) + ' — the usage view reads exactly the three token-meter keys')
    }
    if (mounted.r.findAll('artifacts-usage').length !== 1) throw new Error('the 用量 view did not render')
    const percent = mounted.r.texts('artifacts-usage-percent')[0]
    if (percent !== '60%') {
      throw new Error('occupancy is ' + JSON.stringify(percent) + ' — expected 60% (projectedTokens/window, the product\'s own rule)')
    }
    const figures = mounted.r.texts('artifacts-usage-figures')[0]
    if (figures !== '120K / 200K') throw new Error('the used/capacity figures are ' + JSON.stringify(figures))
    if (!mounted.r.texts('artifacts-usage-value').includes('1.2M')) {
      throw new Error('the cumulative buckets did not render compactly: ' + JSON.stringify(mounted.r.texts('artifacts-usage-value')))
    }
    if (!mounted.r.texts('artifacts-usage-name').includes('系统提示词')) {
      throw new Error('the composition legend does not use the product\'s own labels')
    }
    // The composition bar must be proportional to the three parts, and only the
    // parts that are non-zero.
    const segs = mounted.r.findAll('artifacts-usage-seg')
    if (segs.length !== 3) throw new Error('the composition bar has ' + segs.length + ' segments (expected 3)')
    const widths = segs.map((s) => s.props.style.width)
    if (String(widths) !== '33.33333333333333%,16.666666666666664%,50%') {
      throw new Error('the composition bar is not proportional: ' + JSON.stringify(widths))
    }
    ok('usage tab rendered', 'three token-meter keys, the product\'s occupancy rule (60%) and a proportional composition bar')
  } catch (e) {
    bad('usage tab rendered', e && e.message ? e.message : String(e))
  }

  // Nothing reported: every block says so instead of drawing a figure nobody
  // reported (following the product's own meter, which draws nothing until a
  // provider reports pressure and a capacity).
  try {
    const mounted = await mountPanel({ sidebarRight: true })
    await mountUsageView(mounted, () => undefined)
    await mounted.flush()
    if (!mounted.r.findAll('artifacts-usage-muted').length) {
      throw new Error('an unreported projection rendered no explanation')
    }
    if (mounted.r.texts('artifacts-usage-percent').length) {
      throw new Error('a percentage was drawn with no provider sample')
    }
    // …and the view has NO entry point of its own: where a tab can be found must
    // not depend on which view is open, so there is no 用量 button in our bands —
    // the chooser page is the one place that lists every view.
    for (const view of ['artifacts', 'tree']) {
      const viewMount = await mountView(view)
      if (viewMount.r.findAll('artifacts-tab').some((el) => viewMount.r.textOf(el) === '用量')) {
        throw new Error('the ' + view + ' band carries a second 用量 entry point')
      }
    }
    ok('usage tab (absent)', 'unreported projections explain themselves, and no view carries an entry point of its own')
  } catch (e) {
    bad('usage tab (absent)', e && e.message ? e.message : String(e))
  }

  // The clamping edge, and the fact that the chooser page is what offers the view.
  // A projected prompt larger than the route's capacity must read 100%, never more.
  try {
    const mounted = await mountPanel({ sidebarRight: true })
    const usageBody = mounted.boot.registrations.find((r) => r.def.key === 'dsh-sidebar-frog/usage')
    if (!usageBody) throw new Error('the 用量 type registered no body')
    await mountUsageView(mounted, (key) => (key === 'contextPressure' ? { projectedTokens: 500000, contextWindow: 200000 } : undefined))
    await mounted.flush()
    if (mounted.r.texts('artifacts-usage-percent')[0] !== '100%') {
      throw new Error('a projected prompt beyond capacity reads ' + JSON.stringify(mounted.r.texts('artifacts-usage-percent')[0]))
    }
    const def = mounted.boot.tabs.find((t) => t.id === 'dsh-sidebar-frog/usage')
    const entry = def.guide[0]
    if (entry.order !== 40) throw new Error('the 用量 guide entry sits at order ' + entry.order)
    if (!String(entry.description()).length) throw new Error('the 用量 guide entry has no description for the chooser')
    ok('usage entry point', 'offered by the chooser page, and pressure beyond capacity clamps to 100%')
  } catch (e) {
    bad('usage entry point', e && e.message ? e.message : String(e))
  }
}
// ── 11. 新的预览类型：表格 / 音视频 / 二进制文档 ──────────────────────────────
// Each of these fails differently in the product, which is why they are separate
// promises rather than one:
//   · the TYPE TABLE decides everything downstream — a .csv classified as text is
//     the mojibake this work removes, and a .docx classified as text puts 200 kB
//     of ZIP bytes on the wire;
//   · the PARSER decides what a cell is (a quoted separator, a CRLF, a ragged
//     row, an escaped quote);
//   · the RANGE parser decides whether a video can seek at all, and an off-by-one
//     there yields a player that stutters rather than an error.
console.log('preview types')

if (shared) {
  try {
    const cases = [
      ['a.csv', 'table'], ['a.TSV', 'table'], ['a.psv', 'table'],
      ['a.mp3', 'audio'], ['a.WAV', 'audio'], ['a.m4a', 'audio'], ['a.flac', 'audio'], ['a.opus', 'audio'],
      ['a.mp4', 'video'], ['a.webm', 'video'], ['a.mov', 'video'], ['a.mkv', 'video'],
      ['a.docx', 'office'], ['a.xlsx', 'office'], ['a.pptx', 'office'], ['a.DOCX', 'office'],
      // The containers nobody here can read stay containers: .doc/.xls/.ppt and
      // the ODF/RTF/EPUB family get the card that says so plus the hand-off.
      ['a.doc', 'document'], ['a.xls', 'document'], ['a.ppt', 'document'],
      ['a.odt', 'document'], ['a.ods', 'document'], ['a.epub', 'document'], ['a.rtf', 'document'],
      // An SVG stays an image ON PURPOSE: <img> never runs the scripts a
      // standalone SVG may carry, which is the whole safety argument for it.
      ['a.svg', 'image'],
      ['a.md', 'markdown'], ['a.html', 'html'], ['a.pdf', 'pdf'], ['a.png', 'image'],
      ['a.json', 'text'], ['a.py', 'text'], ['noext', 'text'], ['a.unknown', 'text'],
    ]
    const wrong = cases.filter((pair) => shared.extType(pair[0]) !== pair[1])
      .map((pair) => pair[0] + ' => ' + shared.extType(pair[0]) + ' (want ' + pair[1] + ')')
    if (wrong.length) throw new Error(wrong.join('; '))
    ok('preview types', cases.length + ' suffixes classified — svg stays script-safe as an image, binaries never as text')
  } catch (e) {
    bad('preview types', e && e.message ? e.message : String(e))
  }
}

if (shared) {
  try {
    // A real export: a BOM, CRLF endings, a quoted field containing the
    // separator, an escaped quote, and a row with a missing value.
    const csv = '\ufeffname,qty,note\r\nbanana,10,"round, yellow"\r\napple,2,"says ""hi"""\r\ncherry,,\r\n'
    const parsed = shared.tableParse(csv)
    if (parsed.delimiter !== ',') throw new Error('a comma file sniffed as ' + JSON.stringify(parsed.delimiter))
    if (parsed.header.join('|') !== 'name|qty|note') throw new Error('header read as ' + JSON.stringify(parsed.header))
    if (parsed.total !== 3 || parsed.columns !== 3) throw new Error('grid read as ' + parsed.total + ' rows x ' + parsed.columns + ' columns')
    if (parsed.rows[0][2] !== 'round, yellow') throw new Error('a quoted separator was split: ' + JSON.stringify(parsed.rows[0]))
    if (parsed.rows[1][2] !== 'says "hi"') throw new Error('an escaped quote came through as ' + JSON.stringify(parsed.rows[1][2]))
    if (parsed.rows[2].length !== 3) throw new Error('a ragged row was not padded: ' + JSON.stringify(parsed.rows[2]))
    // A trailing newline must not invent a row, and CR alone is a line ending too.
    if (shared.tableParse('a,b\n1,2\n').total !== 1) throw new Error('a trailing newline invented a row')
    if (shared.tableParse('a,b\r1,2').total !== 1) throw new Error('a lone CR did not end a record')
    // Delimiter sniffing, including the honest default when nothing matches.
    if (shared.tableParse('a\tb\n1\t2').delimiter !== '\t') throw new Error('a TSV was not sniffed as tab-separated')
    if (shared.tableParse('a;b\n1;2').delimiter !== ';') throw new Error('a semicolon file was not sniffed')
    if (shared.tableParse('a|b\n1|2').delimiter !== '|') throw new Error('a pipe file was not sniffed')
    if (shared.tableParse('one\ntwo').columns !== 1) throw new Error('a single-column file was split anyway')
    if (shared.tableDelimiterLabel('\t') !== '制表符' || shared.tableDelimiterLabel(',') !== '逗号') {
      throw new Error('delimiter labels are wrong')
    }
    // Sorting: numeric-aware (2 before 10 — a text sort puts 10 first), blanks
    // pinned to the bottom in BOTH directions, and ties keeping the file's order.
    const grid = shared.tableParse('n,v\nb,10\na,2\nc,\n')
    const asc = shared.tableSortRows(grid.rows, 1, 'asc').map((r) => r[0]).join(',')
    if (asc !== 'a,b,c') throw new Error('ascending gave ' + asc + ' (want a,b,c — numeric, blanks last)')
    const desc = shared.tableSortRows(grid.rows, 1, 'desc').map((r) => r[0]).join(',')
    if (desc !== 'b,a,c') throw new Error('descending gave ' + desc + ' (want b,a,c — blanks stay last)')
    const ties = shared.tableParse('k,v\nx,1\ny,1\nz,1\n')
    if (shared.tableSortRows(ties.rows, 1, 'asc').map((r) => r[0]).join(',') !== 'x,y,z') {
      throw new Error('equal cells did not keep the file order')
    }
    if (shared.tableCellNumber('1,234') !== null) throw new Error('a thousands separator was read as a number')
    if (shared.tableCellNumber('2026-01-02') !== null) throw new Error('a date was read as a number')
    if (shared.tableCellNumber(' -3.5e2 ') !== -350) throw new Error('a signed exponent was not read as a number')
    if (shared.tableFormatCell('abcdef', 4) !== 'abc…') throw new Error('cell truncation is ' + shared.tableFormatCell('abcdef', 4))
    ok('table parsing', 'BOM/CRLF/quoted separators/escaped quotes/ragged rows, 4 delimiters sniffed, numeric sort with blanks last')
  } catch (e) {
    bad('table parsing', e && e.message ? e.message : String(e))
  }
}

if (shared) {
  try {
    const want = (header, size, expected) => {
      const got = shared.parseByteRange(header, size)
      const a = JSON.stringify(got)
      const b = JSON.stringify(expected)
      if (a !== b) throw new Error(JSON.stringify(header) + ' @' + size + ' => ' + a + ' (want ' + b + ')')
    }
    want('bytes=0-99', 1000, { start: 0, end: 99, length: 100 })
    want('bytes=100-', 1000, { start: 100, end: 999, length: 900 })   // to the end
    want('bytes=-50', 1000, { start: 950, end: 999, length: 50 })     // the tail probe a player opens with
    want('bytes=990-5000', 1000, { start: 990, end: 999, length: 10 }) // end past EOF is clamped
    want('bytes=999-', 1000, { start: 999, end: 999, length: 1 })     // exactly the last byte
    want('bytes=1000-', 1000, 'invalid')  // starts past EOF: 416
    want('bytes=9-1', 1000, 'invalid')    // reversed
    want('bytes=-0', 1000, 'invalid')
    want('bytes=0-', 0, 'invalid')        // an empty file has no satisfiable range
    want('bytes=0-1,5-9', 1000, null)     // multipart: answer the whole file instead
    want('bytes=abc', 1000, 'invalid')
    want('items=0-1', 1000, null)         // not a byte range at all
    want(undefined, 1000, null)           // no header
    if (shared.formatContentRange(0, 99, 1000) !== 'bytes 0-99/1000') throw new Error('Content-Range is wrong')
    if (shared.formatUnsatisfiedRange(1000) !== 'bytes */1000') throw new Error('the 416 Content-Range is wrong')
    ok('byte ranges', 'inclusive windows, suffix + open-ended forms, clamping, 416 and multipart fallbacks')
  } catch (e) {
    bad('byte ranges', e && e.message ? e.message : String(e))
  }
}

// (A) The panel's ROUTING. The type table is only half the promise — a .csv that
// classifies correctly but still draws as code is the old bug. minireact does not
// expand child components, so what is asserted here is the element the preview
// body produced: which component, and with which props.
try {
  const articles = [
    { path: 'D:/ws/data.csv', kind: 'create', at: Date.now() },
    { path: 'D:/ws/clip.mp3', kind: 'create', at: Date.now() },
    { path: 'D:/ws/movie.mp4', kind: 'edit', at: Date.now() },
  ]
  const mounted = await mountPanel({
    sidebarRight: true,
    fetch: (url) => {
      const u = String(url)
      if (u.indexOf('/dsh-sidebar-frog/data') === 0) return Promise.resolve({ status: 200, json: () => Promise.resolve({ artifacts: articles }) })
      const path = decodeURIComponent((u.split('path=')[1] || ''))
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, content: 'name,qty\nbanana,10\n', type: shared.extType(path), truncated: false }) })
    },
  })
  const content = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.pane.tab')
  if (!content) throw new Error('no panel content was registered to mount')
  await mounted.mount(content)
  const rows = mounted.r.findAll('artifacts-item-main')
  if (rows.length !== 3) throw new Error('the stubbed artifact list did not render (' + rows.length + ' rows)')
  const viewFor = async (index) => {
    rows[index].props.onClick()
    await mounted.flush()
    const bodyEl = mounted.r.findAll('artifacts-preview-body')[0]
    const view = bodyEl && (bodyEl.props.children || [])[0]
    if (!view || typeof view.type !== 'function') {
      throw new Error('row ' + index + ' produced no view component; tree=' + JSON.stringify(classDump(mounted.r.element, [])))
    }
    return view
  }
  const table = await viewFor(0)
  if (table.type.name !== 'TableView') throw new Error('a .csv was drawn by ' + table.type.name)
  if (String(table.props.content).indexOf('banana') < 0) throw new Error('the table view was handed no content')
  const audio = await viewFor(1)
  if (audio.type.name !== 'MediaView' || audio.props.kind !== 'audio') {
    throw new Error('the .mp3 went to ' + audio.type.name + ' as ' + audio.props.kind)
  }
  const video = await viewFor(2)
  if (video.type.name !== 'MediaView' || video.props.kind !== 'video') {
    throw new Error('the .mp4 went to ' + video.type.name + ' as ' + video.props.kind)
  }
  if (mounted.r.findAll('artifacts-code').length) throw new Error('a media file was decoded as text')
  ok('preview routing (rendered)', 'csv ⇒ TableView, mp3 ⇒ MediaView(audio), mp4 ⇒ MediaView(video) — never the code view')
} catch (e) {
  bad('preview routing (rendered)', e && e.message ? e.message : String(e))
}

// (A2) 编辑 is OFFERED exactly where saving it back is safe. The panel decides
// that in ONE place (`isEditablePreview`) and hands the answer to the editor pane,
// so what is driven here is the prop the pane actually received — through a real
// mount, a real row click and the real fetch path. The case that matters is the
// truncated read: that content is the file's first 200000 characters, so an
// editor built on it holds a PREFIX and saving it would shorten the file.
try {
  const walkFor = (node, name, out) => {
    if (!node || typeof node !== 'object') return out
    if (typeof node.type === 'function' && node.type.name === name) out.push(node)
    for (const c of (node.props && node.props.children) || []) walkFor(c, name, out)
    return out
  }
  const paneFor = async (article, read) => {
    const mounted = await mountPanel({
      sidebarRight: true,
      fetch: (url) => {
        const u = String(url)
        if (u.indexOf('/dsh-sidebar-frog/data') === 0) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ artifacts: [article] }) })
        }
        return Promise.resolve({ status: 200, json: () => Promise.resolve(Object.assign({ ok: true }, read)) })
      },
    })
    const registration = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.pane.tab')
    if (!registration) throw new Error('no panel content was registered to mount')
    await mounted.mount(registration)
    const row = mounted.r.findAll('artifacts-item-main')[0]
    if (!row) throw new Error('the stubbed artifact list did not render')
    row.props.onClick()
    await mounted.flush()
    const panes = walkFor(mounted.r.element, 'EditorPane', [])
    if (panes.length !== 1) throw new Error('the preview is not wrapped by exactly one editor pane (' + panes.length + ')')
    return panes[0].props
  }

  const md = { path: 'D:/ws/notes.md', kind: 'create', at: Date.now() }
  const editable = await paneFor(md, { type: 'markdown', content: '# n\n', truncated: false, size: 4, version: 'v1' })
  if (editable.editable !== true) throw new Error('a plain Markdown preview was not offered for 编辑')
  if (editable.baseVersion !== 'v1') throw new Error('the editor was not handed the revision the preview read: ' + JSON.stringify(editable.baseVersion))
  if (editable.baseSize !== 4) throw new Error('the editor was not handed the size the preview read: ' + JSON.stringify(editable.baseSize))
  if (!editable.children) throw new Error('the read-only preview was not handed to the editor pane as its fallback body')

  const cut = await paneFor(md, { type: 'markdown', content: '# n\n', truncated: true, size: 900000, version: 'v1' })
  if (cut.editable !== false) throw new Error('a TRUNCATED preview was offered for 编辑 — saving it back would shorten the file')

  const img = await paneFor({ path: 'D:/ws/pic.png', kind: 'create', at: Date.now() }, { type: 'image', content: '', truncated: false })
  if (img.editable !== false) throw new Error('an image was offered for text editing')

  // The Ctrl+S binding lives in the shared mount, which both faces call — so a
  // save that only works by clicking the button is not a supported state.
  const sharedEditor = read('src/shared/editor.js')
  if (!/key: 'Mod-s'/.test(sharedEditor) || !/preventDefault: true/.test(sharedEditor)) {
    throw new Error('the shared editor has no Ctrl+S binding (or it lets the browser swallow the key)')
  }
  ok('编辑 offered (rendered)', 'Markdown is editable with the revision it read; a truncated read, an image and every other non-text type are not — and Ctrl+S is bound in the shared mount both faces use')
} catch (e) {
  bad('编辑 offered (rendered)', e && e.message ? e.message : String(e))
}

// (B) The table's BEHAVIOUR, driven through the very component both the panel and
// the shell's sidebar draw. The seat body has no hooks of its own, so mounting it
// first leaves the renderer's hook slots empty and the table can then be mounted
// as a root — which is what makes its state (the sort) observable at all.
try {
  const mounted = await mountPanel({ shellMarkdown: true })
  const body = mounted.boot.registrations.find((r) => r.def.name === 'sidebar.right.tab.document' && r.def.key === 'dsh-sidebar-frog/table')
  if (!body) throw new Error('the table seat body was not registered')
  mounted.r.setComponent(body.component)
  mounted.r.setProps({
    resourceAddress: 'dsh-resource://file/absolute/D:/ws/data.csv',
    content: { kind: 'text', text: 'name,qty\nbanana,10\napple,2\ncherry,\n', pages: [], eof: true },
  })
  await mounted.flush()
  const inner = (mounted.r.findAll('artifacts-doc')[0].props.children || [])[0]
  if (!inner || typeof inner.type !== 'function') throw new Error('the lent body did not delegate to the shared table view')
  mounted.r.setComponent(inner.type)
  mounted.r.setProps(inner.props)
  await mounted.flush()

  if (mounted.r.findAll('artifacts-table').length !== 1) throw new Error('the table view drew no grid')
  if (mounted.r.texts('artifacts-table-headtext').join('|') !== 'name|qty') {
    throw new Error('header cells: ' + JSON.stringify(mounted.r.texts('artifacts-table-headtext')))
  }
  const status = mounted.r.texts('artifacts-table-status')[0] || ''
  if (status.indexOf('3 行 × 2 列') < 0 || status.indexOf('分隔符：逗号') < 0) {
    throw new Error('the status line does not state the grid: ' + JSON.stringify(status))
  }
  const col = (n) => mounted.r.texts('artifacts-table-td').filter((_, i) => i % 2 === n)
  const before = mounted.r.texts('artifacts-table-td').join('|')
  if (before !== 'banana|10|apple|2|cherry|') throw new Error('cells in file order: ' + JSON.stringify(before))
  const sortBtn = (i) => mounted.r.findAll('artifacts-table-sortbtn')[i]
  const sortState = () => mounted.r.findAll('artifacts-table-th')[1].props['aria-sort']
  if (mounted.r.findAll('artifacts-table-sortbtn').length !== 2) throw new Error('header buttons are not both there')
  // Numeric, not lexical: 2 before 10. Blank qty stays last.
  sortBtn(1).props.onClick()
  await mounted.flush()
  if (col(0).join(',') !== 'apple,banana,cherry') {
    throw new Error('ascending by the numeric column gave ' + col(0).join(',') + ' (want apple,banana,cherry)')
  }
  if (sortState() !== 'ascending') throw new Error('aria-sort after the first click is ' + JSON.stringify(sortState()))
  sortBtn(1).props.onClick()
  await mounted.flush()
  if (col(0).join(',') !== 'banana,apple,cherry') {
    throw new Error('descending gave ' + col(0).join(',') + ' (want banana,apple,cherry — the blank stays last)')
  }
  if (sortState() !== 'descending') throw new Error('aria-sort after the second click is ' + JSON.stringify(sortState()))
  // A THIRD click restores the file's own order: a sort you cannot undo is a trap.
  sortBtn(1).props.onClick()
  await mounted.flush()
  if (sortState() !== 'none') throw new Error('aria-sort after the third click is ' + JSON.stringify(sortState()))
  if (mounted.r.texts('artifacts-table-td').join('|') !== before) {
    throw new Error('the third click did not restore the file order')
  }
  ok('table view (rendered)', 'numeric-aware sort with blanks pinned last, and the third click back to the file order')
} catch (e) {
  bad('table view (rendered)', e && e.message ? e.message : String(e))
}

// Lending the table renderer to the shell, and the thing that is easy to get
// wrong with two switches on one registry: they must be independent.
try {
  const mounted = await mountPanel({ shellMarkdown: true })
  const defs = mounted.boot.documentPreviews.definitions
  const lent = defs.find((d) => d.id === 'dsh-sidebar-frog/table')
  if (!lent) throw new Error('the table renderer was not lent to the shell')
  if (lent.priority !== 'extension') throw new Error('lent outside the extension band: ' + lent.priority)
  if (lent.extensions.join(',') !== 'csv,tsv') throw new Error('claims: ' + lent.extensions.join(','))
  if (typeof lent.title !== 'function' || !String(lent.title()).length) throw new Error('the lent title is not a function')
  const winner = mounted.boot.documentPreviews.candidates('D:/ws/data.csv')[0]
  if (!winner || winner.id !== 'dsh-sidebar-frog/table') {
    throw new Error('the shell would draw a .csv with ' + (winner && winner.id))
  }
  const bodies = mounted.boot.registrations.filter((r) => r.def.name === 'sidebar.right.tab.document')
  const tableBody = bodies.find((r) => r.def.key === 'dsh-sidebar-frog/table')
  if (!tableBody) throw new Error('the table seat body is not keyed by its renderer id')
  if (!bodies.some((r) => r.def.key === 'dsh-sidebar-frog/markdown')) {
    throw new Error('lending the table dropped the Markdown seat body')
  }
  // …and it delegates to the SAME view the panel draws, not a lookalike. (That
  // view's own behaviour is driven in the "table view (rendered)" check above; the
  // renderer here cannot expand a child component, so identity is what is read.)
  mounted.r.setComponent(tableBody.component)
  mounted.r.setProps({
    resourceAddress: 'dsh-resource://file/absolute/D:/ws/data.csv',
    content: { kind: 'text', text: 'a,b\n1,2\n', pages: [], eof: true },
  })
  await mounted.flush()
  const wrapper = mounted.r.findAll('artifacts-doc')
  if (wrapper.length !== 1) throw new Error('the lent table body drew no document wrapper')
  const innerView = (wrapper[0].props.children || [])[0]
  if (!innerView || typeof innerView.type !== 'function' || innerView.type.name !== 'TableView') {
    throw new Error('the lent table body did not delegate to the shared TableView (got ' + (innerView && innerView.type && innerView.type.name) + ')')
  }
  mounted.r.setProps({ content: { kind: 'bytes', data: new Uint8Array([1, 2, 3]) } })
  await mounted.flush()
  if (!mounted.r.texts('artifacts-hint').length) throw new Error('a byte payload did not degrade to a hint')

  // Independence: one switch must not move the other renderer.
  const mdOff = await mountPanel({
    shellMarkdown: true,
    storage: { [shared.BRIDGE.settings]: shared.serializeSettings(shared.normalizeSettings({ nativeMarkdown: false })) },
  })
  const ids = mdOff.boot.documentPreviews.definitions.map((d) => d.id)
  if (ids.indexOf('dsh-sidebar-frog/markdown') >= 0) throw new Error('Markdown stayed lent with its own switch off')
  if (ids.indexOf('dsh-sidebar-frog/table') < 0) throw new Error('turning the Markdown switch off retracted the TABLE renderer too')
  const bothOff = await mountPanel({
    shellMarkdown: true,
    storage: { [shared.BRIDGE.settings]: shared.serializeSettings(shared.normalizeSettings({ nativeMarkdown: false, nativeTable: false })) },
  })
  const bothIds = bothOff.boot.documentPreviews.definitions.map((d) => d.id)
  if (bothIds.indexOf('dsh-sidebar-frog/table') >= 0) throw new Error('the table stayed lent with its own switch off')
  const fallback = bothOff.boot.documentPreviews.candidates('D:/ws/data.csv')[0]
  if (fallback && fallback.id === 'dsh-sidebar-frog/table') {
    throw new Error('a retracted table renderer still won the suffix')
  }
  ok('lent table renderer', 'claims csv/tsv in the extension band, draws the panel\'s own table, and moves only with its own switch')
} catch (e) {
  bad('lent table renderer', e && e.message ? e.message : String(e))
}

// ── 样式表会被嵌进模板字符串，所以里面不能有反引号 ──────────────────────────
// scripts/build.js substitutes styles.js into a template literal in the client
// bundle (the `styles.insert(...)` call), so ONE backtick or dollar-brace
// anywhere in that file — a CSS comment included — ends the string early and the
// whole bundle stops parsing. The failure is spectacular and useless as a
// message: every guard that boots the client dies with "missing ) after argument
// list", pointing at the top of a 2 MB file instead of at the comment that did
// it. (Found exactly that way while writing the footer stack's comment.)
{
  try {
    const panelCss = read('src/client/styles.js')
    const tick = panelCss.indexOf('`')
    if (tick >= 0) {
      const line = panelCss.slice(0, tick).split('\n').length
      throw new Error('a backtick in src/client/styles.js (line ' + line + ') closes the template literal the stylesheet is embedded in — the client bundle would not parse')
    }
    if (/\$\{/.test(panelCss)) {
      throw new Error('a dollar-brace in src/client/styles.js would be INTERPOLATED by the template literal it is embedded in')
    }
    ok('stylesheet embedding', 'no backtick and no dollar-brace in the panel stylesheet, so the template literal it is substituted into survives')
  } catch (e) {
    bad('stylesheet embedding', e && e.message ? e.message : String(e))
  }
}

// Views are class-driven, and a class with no rule renders unstyled — which is
// invisible to every other check here (the table still draws, just wrong) and
// invisible to a reader of the diff (the markup looks complete). Each half carries
// its own stylesheet — the panel's styles.insert() and the popout page's <style>
// — so both are inventoried.
{
  const panelCss = read('src/client/styles.js')
  const pageCss = read('src/host/page.js')
  const panelClasses = [
    'artifacts-table-view', 'artifacts-table-status', 'artifacts-table-scroll', 'artifacts-table',
    'artifacts-table-th', 'artifacts-table-sortbtn', 'artifacts-table-headtext', 'artifacts-table-td',
    'artifacts-table-empty', 'artifacts-media', 'artifacts-media-frame', 'artifacts-video', 'artifacts-audio',
    'artifacts-media-error', 'artifacts-doc-card', 'artifacts-doc-title', 'artifacts-doc-text',
    'artifacts-doc-actions', 'artifacts-doc-btn', 'artifacts-tree-ico-media',
    // The two entries on the NATIVE surface's shell chrome: the standing 弹出页
    // link in the left footer (styled by `.artifacts-foot-btn`, above) and the
    // per-tab menu row, which lives in the SHELL's menu portal and therefore has
    // to be styled by this plugin.
    'artifacts-menuitem', 'artifacts-menuitem-label',
    // Git 只读切片 (P1-9) — the branch header, the sectioned change list, its
    // status letters, and the "why is there nothing here" card.
    'artifacts-git', 'artifacts-git-head', 'artifacts-git-branch', 'artifacts-git-chip',
    'artifacts-git-summary', 'artifacts-git-age', 'artifacts-git-upstream', 'artifacts-git-truncated',
    'artifacts-git-list', 'artifacts-git-section', 'artifacts-git-section-head', 'artifacts-git-section-title',
    'artifacts-git-section-count', 'artifacts-git-section-note', 'artifacts-git-row', 'artifacts-git-letter',
    'artifacts-git-tone-add', 'artifacts-git-tone-mod', 'artifacts-git-tone-del', 'artifacts-git-tone-ren',
    'artifacts-git-tone-new', 'artifacts-git-tone-conflict', 'artifacts-git-path', 'artifacts-git-name',
    'artifacts-git-dir', 'artifacts-git-orig', 'artifacts-git-diff', 'artifacts-git-empty',
    'artifacts-git-empty-title', 'artifacts-git-empty-note', 'artifacts-git-empty-path',
    // 编辑 (P1-10) — the tab's unsaved dot and armed close button, the toolbar,
    // the status line, the conflict bar and the CodeMirror mount.
    'artifacts-tab-dirty', 'artifacts-editpane', 'artifacts-edbar', 'artifacts-edbar-group',
    'artifacts-edbtn', 'artifacts-edbtn-save', 'artifacts-edbtn-force', 'artifacts-ednote',
    'artifacts-edstatus', 'artifacts-edconflict', 'artifacts-edconflict-ico',
    'artifacts-edconflict-text', 'artifacts-edconflict-actions', 'artifacts-edmount',
    'artifacts-edcm', 'artifacts-edhint',
  ]
  const pageClasses = [
    'tableview', 'tablestatus', 'tablescroll', 'datatable', 'tableth', 'tablesortbtn', 'tableheadtext',
    'tabletd', 'tableempty', 'preview-media', 'preview-video', 'preview-audio', 'media-error',
    'doccard', 'doctitle', 'doctext', 'docactions', 'docbtn', 'tree-ico-media',
    // 编辑 (popout) — the toolbar riding the preview bar, the status line and the
    // CodeMirror mount.
    'edittools', 'editbtn', 'editstatus', 'editmount', 'editcm', 'edithint',
  ]
  // A MENTION is not a RULE: `.artifacts-table-td.is-number` and
  // `.artifacts-table-tr:hover .artifacts-table-td` both contain the class name, so
  // a substring test still passes after the base rule is deleted (found by
  // mutation, not by reading). What is required is a rule the class OPENS — which
  // is also why the leading whitespace is allowed: the popout page's stylesheet is
  // indented, the panel's is not.
  const opensRule = (css, cls) => new RegExp('^\\s*\\.' + cls + '\\s*[,{]', 'm').test(css)
  const missingPanel = panelClasses.filter((c) => !opensRule(panelCss, c))
  const missingPage = pageClasses.filter((c) => !opensRule(pageCss, c))
  if (missingPanel.length) bad('view styles (panel)', 'no rule for ' + missingPanel.join(', '))
  else ok('view styles (panel)', panelClasses.length + ' classes styled')
  if (missingPage.length) bad('view styles (page)', 'no rule for ' + missingPage.join(', '))
  else ok('view styles (page)', pageClasses.length + ' classes styled')
}

// ── 26. 原生形态的每个视图都得自己画出东西，且不提供假开关 ────────────────────
// This plugin TAKES THE PRODUCT'S `files` KIND OVER, so the column ALWAYS has a
// 文件 tab and that tab is ours. 「文件树」 therefore only configures the floating
// panel's own band — it must not be able to blank the column's tab. The failure
// is perfectly silent (tab present, body empty, nothing in any log), which is
// why it is driven through the really-registered body and not read off source.
{
  try {
    const off = await mountPanel({
      sidebarRight: true,
      storage: { [shared.BRIDGE.settings]: shared.serializeSettings(shared.normalizeSettings({ showFileTree: false })) },
    })
    const reg = off.boot.registrations.find((r) => r.def.key === VIEW_TAB_IDS.tree)
    if (!reg) throw new Error('the 文件 tab body was not registered')
    await off.mount(reg)
    // The pane is an inline div, but the tree itself is a CHILD component
    // (`<FileTree/>`) and minireact renders no child components — so the rendered
    // `artifacts-tree` root can never appear here. What is observable is the pane:
    // exactly one VISIBLE pane, and the component inside it must be the tree. The
    // tree is identified by the props only it receives (an `onOpen` callback plus
    // the selection/pin/ledger props), which survives being a different function
    // object in every boot.
    const panes = off.r.findAll('artifacts-pane')
    const visible = panes.filter((p) => String(p.props.className).indexOf('is-hidden') < 0)
    if (visible.length !== 1) {
      throw new Error('with 「文件树」 switched off the column\'s 文件 tab shows ' + visible.length + ' panes (want exactly the tree) — the shell\'s 文件 kind is this plugin\'s tab, so the tab is simply blank')
    }
    const inside = [].concat(visible[0].props.children || [])[0]
    if (!inside || typeof inside.type !== 'function' || typeof inside.props.onOpen !== 'function' || !('selectedPath' in inside.props)) {
      throw new Error('the visible pane of the column\'s 文件 tab is not the file tree')
    }
    ok('native tree tab', 'the column\'s 文件 tab draws the tree even with the floating panel\'s 「文件树」 view switched off')
  } catch (e) {
    bad('native tree tab', e && e.message ? e.message : String(e))
  }

  // Settings must offer only what the CURRENT surface can honour: 展开 / 宽度 are
  // the shell's on the native surface, and the 文件树 view switcher belongs to the
  // floating panel's band. A toggle that changes nothing is exactly the fake
  // switch this section already refuses for the width preferences.
  // minireact renders no child components, and every toggle IS one
  // (`<SettingsToggle label=…/>`), so their labels are read off the ELEMENTS —
  // walking for a function-typed node carrying a `label` prop — while the width
  // rows are inline divs whose text the renderer can report directly. Reading
  // only the rendered text made the native half of this check pass vacuously
  // (nothing rendered ⇒ nothing named 文件树), which is how the first version of
  // this guard lied.
  const toggleLabels = (el, out = []) => {
    if (!el || typeof el !== 'object') return out
    if (typeof el.type === 'function' && el.props && typeof el.props.label === 'string') out.push(el.props.label)
    for (const c of (el.props && el.props.children) || []) toggleLabels(c, out)
    return out
  }
  // The same walk for the toggles' copy: a SettingsToggle's `desc` never reaches
  // the renderer (it is a child component, and minireact renders none), so the
  // only place that text exists is the element's props.
  const toggleDescs = (el, out = []) => {
    if (!el || typeof el !== 'object') return out
    if (typeof el.type === 'function' && el.props && typeof el.props.desc === 'string') out.push(el.props.desc)
    for (const c of (el.props && el.props.children) || []) toggleDescs(c, out)
    return out
  }
  const settingsCopy = async (override) => {
    const panel = await mountPanel(override)
    const reg = panel.boot.registrations.find((r) => r.def.name === 'settings.section')
    if (!reg) throw new Error('the settings section was not registered')
    panel.r.setComponent(reg.component)
    await panel.flush()
    return {
      labels: toggleLabels(panel.r.element),
      descs: toggleDescs(panel.r.element).concat(panel.r.texts('artifacts-setdesc')),
      titles: panel.r.texts('artifacts-settitle'),
      lendNames: panel.r.texts('artifacts-setlendname'),
      lendStates: panel.r.texts('artifacts-setlendstate'),
    }
  }
  try {
    const nativeForm = await settingsCopy({ sidebarRight: true })
    if (nativeForm.labels.some((t) => t === '文件树')) {
      throw new Error('the settings still offer 「文件树」 on the native surface, where that preference can only blank the column\'s 文件 tab (labels ' + JSON.stringify(nativeForm.labels) + ')')
    }
    // …while 「默认展开」must BE offered there: under the column it is the default
    // PAGE (a blank session gets 文件 opened for it), so hiding it would leave the
    // plugin's own entry points — the footer button and that default — with no
    // explanation anywhere a user can read.
    if (!nativeForm.labels.some((t) => t === '默认展开')) {
      throw new Error('the native surface hides 「默认展开」although it now decides the column\'s default page (labels ' + JSON.stringify(nativeForm.labels) + ')')
    }
    const defaultDesc = nativeForm.descs.filter((d) => d.indexOf('新建会话') >= 0).join('')
    if (defaultDesc.indexOf('右侧边栏') < 0) {
      throw new Error('the native 「默认展开」 copy does not say what it does there: ' + JSON.stringify(defaultDesc))
    }
    const floatingForm = await settingsCopy({})
    if (!floatingForm.labels.some((t) => t === '文件树')) {
      throw new Error('the floating panel lost its 「文件树」 preference — that is the only surface it configures (labels ' + JSON.stringify(floatingForm.labels) + ')')
    }
    // The in-app copy is documentation too, and it is the only documentation a
    // user reads without opening the repo: it claimed a 65% default long after
    // the default became 26%, which no other check in this file can see.
    const want = '默认 ' + shared.DEFAULT_SETTINGS.defaultPanelWidth + '%'
    const widthDesc = floatingForm.descs.filter((d) => d.indexOf('面板展开时的宽度') >= 0).join('')
    if (widthDesc.indexOf(want) < 0) {
      throw new Error('the 「默认面板宽度」 copy does not state the real default (' + want + '): ' + JSON.stringify(widthDesc))
    }
    // …and the other direction: a boolean setting with NO control anywhere is
    // unreachable — the feature ships, the switch does not — which is exactly how
    // a newly added setting (nativeOffice, say) can be dead on arrival while
    // every check above still passes.
    const panelSrc = read('src/client/components.js')
    const booleans = Object.keys(shared.DEFAULT_SETTINGS).filter((k) => typeof shared.DEFAULT_SETTINGS[k] === 'boolean')
    const unreachable = booleans.filter((k) => !new RegExp('settings\\.' + k + '\\b').test(panelSrc))
    if (unreachable.length) {
      throw new Error('these settings exist but nothing in the settings UI reads them: ' + JSON.stringify(unreachable))
    }
    if (!booleans.length) throw new Error('no boolean settings were found — this guard has stopped testing anything')
    // The lending status block. A lent renderer that silently vanished is the one
    // failure this plugin cannot otherwise show anywhere — the file just renders
    // the product's way, which is exactly how 「Markdown 里的内联 SVG 变成了文本」
    // arrives with no visible cause. So the block must be rendered, it must list
    // every lender, and it must name the browser-capability fact behind a taken
    // over .pdf rather than leaving that to a stack trace.
    if (!nativeForm.titles.some((t) => t.indexOf('借出状态') >= 0)) {
      throw new Error('the settings render no 借出状态 block, so a lent renderer that silently vanished stays invisible (titles ' + JSON.stringify(nativeForm.titles) + ')')
    }
    if (nativeForm.descs.join(' ').indexOf('getOrInsertComputed') < 0 && nativeForm.descs.join(' ').indexOf('不接管') < 0) {
      throw new Error('the settings never say which side of the PDF capability fallback this browser is on, so 「PDF 为什么被接管 / 为什么不接管」 has no answer inside the product')
    }
    for (const suffixes of ['md / markdown', 'csv / tsv', 'docx / xlsx / pptx', 'pdf']) {
      if (!nativeForm.lendNames.some((t) => t === suffixes)) {
        throw new Error('the 借出状态 block does not list ' + JSON.stringify(suffixes) + ' (listed ' + JSON.stringify(nativeForm.lendNames) + ')')
      }
    }
    if (!nativeForm.lendStates.length || nativeForm.lendStates.some((t) => !t)) {
      throw new Error('a 借出状态 row rendered without a state: ' + JSON.stringify(nativeForm.lendStates))
    }
    ok('settings honesty', booleans.length + ' switches, every one reachable from the settings UI, no fake switches on the native surface, the width copy states the real default, and the lending state lists all four suffixes')
  } catch (e) {
    bad('settings honesty', e && e.message ? e.message : String(e))
  }
}

// ── 27. Git 只读切片 (P1-9) ─────────────────────────────────────────────────
// Two classes of silent failure are driven here.
//
// The PARSER ones: a rename is the only porcelain record that is not
// self-contained (its source path rides the NEXT NUL-separated record), and
// consuming that record as an entry of its own shows a phantom file while
// stealing the next entry's slot. Nothing about that is visible in the UI — the
// list still draws, just wrong — so the parse is asserted against text captured
// from real git output, including a path with a space.
//
// The SAFETY one: this plugin must never be able to write to a repository. That
// is not a property of the UI, it is a property of the argv vectors, so the
// guard reads every `gitRun(cwd, [...])` out of the built host bundle and
// refuses any verb outside the read-only whitelist — a mutation that turns
// `status` into `commit` or adds a `checkout` fails here.
{
  console.log('git slice')
  const hostText = built ? built.host : read('src/host.js')
  const porcelain = [
    '?? new file.txt', ' M src/a.js', 'MM src/b.js', 'R  src/c.js', 'src/old.js',
    'D  gone.js', 'UU conflict.js', 'A  added.md', ' M docs/中文 名称.md',
  ].join('\u0000') + '\u0000'
  try {
    const g = shared
    const entries = g.parsePorcelainZ(porcelain)
    if (entries.length !== 8) throw new Error('parsed ' + entries.length + ' entries from 8 records (a rename source is not an entry)')
    if (entries[0].path !== 'new file.txt') throw new Error('a path containing a space was cut: ' + JSON.stringify(entries[0].path))
    if (entries[3].x !== 'R' || entries[3].path !== 'src/c.js' || entries[3].origPath !== 'src/old.js') {
      throw new Error('the rename did not carry its source path: ' + JSON.stringify(entries[3]))
    }
    if (entries[4].path !== 'gone.js') throw new Error('the rename consumed the NEXT entry: expected gone.js, got ' + JSON.stringify(entries[4].path))
    if (entries[7].path !== 'docs/中文 名称.md') throw new Error('a non-ASCII path was mangled: ' + JSON.stringify(entries[7].path))
    if (String(g.gitSectionsOf(entries[2])) !== 'staged,unstaged') {
      throw new Error('MM must appear in BOTH sections (staged and unstaged edits), got ' + JSON.stringify(g.gitSectionsOf(entries[2])))
    }
    if (String(g.gitSectionsOf(entries[5])) !== 'conflicted') throw new Error('UU was not read as a conflict')
    if (String(g.gitSectionsOf(entries[7])) !== 'unstaged') throw new Error('a worktree-only modification is not read as unstaged')
    const groups = g.gitSectionGroups(entries)
    if (String(groups.map((x) => x.key)) !== 'conflicted,staged,unstaged,untracked') {
      throw new Error('section order is ' + JSON.stringify(groups.map((x) => x.key)))
    }
    const counts = g.gitCounts(entries)
    if (counts.total !== 8 || counts.conflicted !== 1 || counts.untracked !== 1) {
      throw new Error('counts are wrong: ' + JSON.stringify(counts) + ' (a file in two sections counts once in total)')
    }
    if (g.gitSummaryText(counts).indexOf('8 个文件有改动') !== 0) throw new Error('the summary line is ' + JSON.stringify(g.gitSummaryText(counts)))
    if (g.gitSummaryText({ total: 0 }) !== '工作区干净') throw new Error('a clean tree does not say so')
    if (g.gitStatusLetter(entries[4], 'staged').letter !== 'D') throw new Error('the staged letter is not the INDEX column')
    if (g.gitStatusLetter(entries[1], 'unstaged').letter !== 'M') throw new Error('the unstaged letter is not the WORKTREE column')
    if (g.gitAheadBehindText(2, 1) !== '↑2 ↓1') throw new Error('ahead/behind renders as ' + JSON.stringify(g.gitAheadBehindText(2, 1)))
    if (g.gitAheadBehindText(0, 0) !== '') throw new Error('no upstream must print no chips, not ↑0 ↓0')
    if (g.gitHeadLabel({ detached: true, head: 'abc1234' }) !== 'HEAD 分离 @ abc1234') throw new Error('a detached HEAD is not labelled')
    // The remote URL is shown to a user, so its credentials must not survive.
    const redactions = [
      ['https://user:tok@github.com/o/r.git', 'https://github.com/o/r.git'],
      ['git@github.com:o/r.git', 'github.com:o/r.git'],
      ['https://host/o/r.git?access_token=xyz', 'https://host/o/r.git'],
      ['ssh://git@host:22/o/r.git', 'ssh://host:22/o/r.git'],
    ]
    for (const [input, want] of redactions) {
      const got = g.redactRemote(input)
      if (got !== want) throw new Error('redactRemote(' + JSON.stringify(input) + ') = ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want))
    }
    ok('git porcelain', 'rename source, spaced and non-ASCII paths, both columns, section order, counts and URL redaction')
  } catch (e) {
    bad('git porcelain', e && e.message ? e.message : String(e))
  }

  // ── The boundary that makes this feature safe to ship ────────────────────
  // Read straight out of the BUILT host bundle, because that is the text the
  // process actually loads — a source file that is not assembled proves nothing.
  try {
    const ALLOWED = ['rev-parse', 'status', 'rev-list', 'config', 'show', 'log', 'diff', 'cat-file', 'ls-files']
    const FORBIDDEN = ['add', 'commit', 'push', 'pull', 'fetch', 'checkout', 'switch', 'reset', 'restore',
      'stash', 'clean', 'rm', 'mv', 'apply', 'rebase', 'merge', 'cherry-pick', 'revert', 'tag', 'init',
      'gc', 'prune', 'update-index', 'update-ref', 'commit-tree', 'worktree', 'filter-branch']
    const verbs = []
    const re = /gitRun\([^,]+,\s*\[\s*'([^']+)'/g
    let m
    while ((m = re.exec(hostText)) !== null) verbs.push(m[1])
    if (verbs.length < 4) throw new Error('only ' + verbs.length + ' git invocations found in the built host bundle — the guard is not looking at the real code')
    const illegal = verbs.filter((v) => ALLOWED.indexOf(v) < 0)
    if (illegal.length) throw new Error('a git invocation outside the read-only whitelist: ' + JSON.stringify(illegal))
    // Every git invocation must pass a LITERAL vector: one matched verb per call
    // site. A call handing over a computed array (`gitRun(cwd, args)`) would be
    // invisible to the whitelist above, so the counts are compared.
    const callSites = (hostText.match(/gitRun\(/g) || []).length
    if (callSites !== verbs.length) {
      throw new Error(callSites + ' gitRun call site(s) but ' + verbs.length + ' literal argv vector(s) — every git call must build its argv as a literal here')
    }
    // One process-spawning site, and no direct child-process import anywhere: a
    // second spawn would bypass the deadline, the scrubbed environment and this
    // whitelist all at once.
    const spawnSites = (hostText.match(/sub\.spawn\(/g) || []).length
    if (spawnSites !== 1) throw new Error(spawnSites + ' spawn sites in the host bundle (expected exactly one, inside gitRun)')
    if (/node:child_process|require\('child_process'\)|execFile|spawnSync/.test(hostText)) {
      throw new Error('the host reached for node\'s own process APIs instead of the subprocess service')
    }
    if (!/resolveExecutable\('git'\)/.test(hostText)) throw new Error('git is not resolved through the subprocess service')
    // The "no shell" assertions are scoped to the RUNNER, not the whole bundle:
    // the host bundle also carries the vendored renderer libraries as string
    // literals, and one of them containing `exec(` says nothing about this code.
    const runnerAt = hostText.indexOf('const gitRun =')
    const runner = runnerAt < 0 ? '' : hostText.slice(runnerAt, hostText.indexOf('const gitSnapshot ='))
    if (!runner) throw new Error('the git runner is gone from the host bundle')
    if (!/argv: \[exe\]\.concat\(argv\)/.test(runner)) {
      throw new Error('the git runner does not pass a literal argv vector to the service')
    }
    if (/'git '\s*\+|shell:\s*true|\bexec\(|execSync\(/.test(runner)) {
      throw new Error('a shell string or a raw exec is present in the git runner — git must run as a literal argv vector')
    }
    if (!/GIT_TIMEOUT_MS/.test(runner) || !/controller\.abort\(\)/.test(runner)) {
      throw new Error('a git call can outlive its request: no abort deadline is wired')
    }
    ok('git is read-only', verbs.length + ' argv vectors, all in the read-only whitelist; argv is a literal vector, never a shell string')
  } catch (e) {
    bad('git is read-only', e && e.message ? e.message : String(e))
  }

  // The route: a NORMAL answer when the workspace is not a repository (the view
  // has to hide itself cleanly), and the cookie guard on the read itself.
  try {
    const block = hostText.slice(hostText.indexOf("path: '/dsh-sidebar-frog/git'"), hostText.indexOf("path: '/dsh-sidebar-frog/gitfile'"))
    if (!block) throw new Error('the git snapshot route is gone from the host bundle')
    if (!/rejectRequest\(req, res\)/.test(block)) throw new Error('the git route answers without the cookie guard')
    if (!/repo: false/.test(hostText)) throw new Error('not being a repository is not a normal answer — the view would break instead of hiding')
    if (!/'not-a-repo'/.test(hostText) || !/'no-git'/.test(hostText) || !/'bare'/.test(hostText)) {
      throw new Error('a missing repository, a missing git and a bare repository must be distinguished')
    }
    ok('git route', 'cookie-guarded, and "not a repository" is a normal answer with a reason')
  } catch (e) {
    bad('git route', e && e.message ? e.message : String(e))
  }

  // The rendered view, through the body the seat actually registered.
  try {
    const snapshot = {
      ok: true, repo: true, reason: '', at: Date.now(), cwd: 'D:/ws', root: 'D:/ws',
      branch: 'main', detached: false, head: '', upstream: 'origin/main', remote: 'https://github.com/o/r.git',
      remoteName: 'origin', ahead: 2, behind: 1,
      entries: shared.parsePorcelainZ(porcelain), truncated: false, counts: shared.gitCounts(shared.parsePorcelainZ(porcelain)),
    }
    const asked = []
    const mounted = await mountPanel({
      sidebarRight: true,
      fetch: (url) => {
        asked.push(String(url))
        if (String(url).indexOf('/dsh-sidebar-frog/gitfile') === 0) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, mode: 'diff', path: 'src/a.js', before: 'one\ntwo\n', after: 'one\nTWO\n', truncated: false }) })
        }
        return Promise.resolve({ status: 200, json: () => Promise.resolve(snapshot) })
      },
    })
    const reg = mounted.boot.registrations.find((r) => r.def.key === VIEW_TAB_IDS.git)
    if (!reg) throw new Error('the Git tab body was not registered')
    await mounted.mount(reg)
    await mounted.flush()
    await mounted.flush()
    if (!mounted.r.findAll('artifacts-git').length) throw new Error('the Git tab drew nothing')
    const branch = mounted.r.texts('artifacts-git-branch')[0]
    if (branch !== 'main') throw new Error('the branch is ' + JSON.stringify(branch))
    const chips = mounted.r.texts('artifacts-git-chip').join(' ')
    if (chips.indexOf('↑2') < 0 || chips.indexOf('↓1') < 0) throw new Error('ahead/behind chips are ' + JSON.stringify(chips))
    const upstream = mounted.r.texts('artifacts-git-upstream')[0] || ''
    if (upstream.indexOf('origin/main') < 0) throw new Error('the upstream is not named: ' + JSON.stringify(upstream))
    if (upstream.indexOf('token') >= 0 || upstream.indexOf('@github') >= 0) {
      throw new Error('a credential survived into the rendered upstream line: ' + JSON.stringify(upstream))
    }
    const sections = mounted.r.texts('artifacts-git-section-title')
    if (String(sections) !== '冲突,已暂存,未暂存,未跟踪') throw new Error('sections rendered as ' + JSON.stringify(sections))
    const rows = mounted.r.findAll('artifacts-git-row')
    if (rows.length !== 9) throw new Error('the list drew ' + rows.length + ' rows for 8 files in 4 sections (a staged+unstaged file is listed twice on purpose)')
    // Clicking a row reads THAT file's difference and renders it with the panel's
    // own diff renderer — under a title that names this comparison, because
    // 「编辑差异」 would claim we edited something.
    rows[1].props.onClick()
    await mounted.flush()
    await mounted.flush()
    const diffCall = asked.filter((u) => u.indexOf('/dsh-sidebar-frog/gitfile') === 0)[0]
    if (!diffCall) throw new Error('clicking a changed file asked the host for nothing')
    if (diffCall.indexOf('untracked=1') >= 0) throw new Error('a tracked row asked for the untracked comparison')
    if (!/path=src%2F[ab]\.js/.test(diffCall)) throw new Error('the diff request names the wrong path: ' + diffCall)
    const diffRows = mounted.r.findAll('artifacts-diff-row')
    if (!diffRows.length) throw new Error('the difference did not render with the panel\'s own diff renderer')
    const title = mounted.r.texts('artifacts-diff-name')[0]
    if (title !== '与 HEAD 的差异') throw new Error('the difference is titled ' + JSON.stringify(title) + ' — it is worktree vs HEAD, not an edit of ours')
    ok('git tab rendered', 'branch + ahead/behind + upstream (redacted), four sections, and a lazy per-file diff titled 与 HEAD 的差异')
  } catch (e) {
    bad('git tab rendered', e && e.message ? e.message : String(e))
  }

  // Not a repository: the reason must be stated, not an empty panel. Each reason
  // is a different user action, which is why they are not collapsed into one.
  try {
    for (const [reason, needle] of [['not-a-repo', '不在 Git 仓库里'], ['no-git', '没有找到 git'], ['no-subprocess', '子进程服务'], ['bare', '裸仓库']]) {
      const mounted = await mountPanel({
        sidebarRight: true,
        fetch: () => Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true, repo: false, reason, at: Date.now(), cwd: 'D:/ws' }) }),
      })
      const reg = mounted.boot.registrations.find((r) => r.def.key === VIEW_TAB_IDS.git)
      await mounted.mount(reg)
      await mounted.flush()
      await mounted.flush()
      const note = mounted.r.texts('artifacts-git-empty-note').join(' ')
      if (note.indexOf(needle) < 0) throw new Error('reason ' + reason + ' rendered ' + JSON.stringify(note))
      if (mounted.r.findAll('artifacts-git-section').length) throw new Error('reason ' + reason + ' still drew a change list')
    }
    ok('git absent', 'each absent-repository reason names the real cause and draws no list')
  } catch (e) {
    bad('git absent', e && e.message ? e.message : String(e))
  }
}

// ── 28. 视图的入口：浮动形态的标签栏 ─────────────────────────────────────────
// The floating band is the fallback surface, and it must offer every view the
// native column does — to the user the two are one product. This is also where
// the removal of the 内置浏览器 tab is held: the view and its `/site` route are
// gone (the product's own document preview already renders a workspace .html
// live, so the pane only ever earned its keep for a dev server, and it cost the
// one data route in this plugin that answered without the browser cookie). A view
// that no longer exists must not be advertised, and the route
// must not quietly come back.
{
  console.log('view entry points')
  try {
    const panel = await mountPanel({})
    await mountOverlayContent(panel)
    const chips = panel.r.findAll('artifacts-tab').map((el) => panel.r.textOf(el))
    if (chips.indexOf('Git') < 0) {
      throw new Error('the floating band does not offer Git (chips: ' + JSON.stringify(chips) + ')')
    }
    if (chips.some((chip) => chip.indexOf('浏览器') >= 0)) {
      throw new Error('the floating band still offers 浏览器 after the view was removed: ' + JSON.stringify(chips))
    }
    ok('view entry points', 'the floating panel band offers ' + JSON.stringify(chips.filter((c) => c.indexOf('file:') !== 0)))
  } catch (e) {
    bad('view entry points', e && e.message ? e.message : String(e))
  }

  // The removal itself, asserted on the built host: the route, the token and the
  // served-file reader are all gone, so putting any of them back is a decision
  // someone has to make on purpose (with the guards that made it safe the first
  // time) instead of a merge that silently restores a cookie-less data route.
  try {
    const hostText = built ? built.host : read('src/host.js')
    if (hostText.indexOf("'/dsh-sidebar-frog/site") >= 0) {
      throw new Error('the /site route (or its token route) is back in the host bundle — it was removed because it served workspace files without the browser cookie, so restoring it is a security decision that needs its own guard')
    }
    for (const leftover of ['siteToken', 'randomSiteToken', 'splitSiteRequest', 'readSiteFile', 'peerIsLoopback', 'SITE_MIME']) {
      if (hostText.indexOf(leftover) >= 0) {
        throw new Error('"' + leftover + '" outlived the route it served — dead code that reads like a live security boundary')
      }
    }
    ok('browser view removed', 'no /site route, no capability token, no served-file reader: the workspace HTML case is the product\'s own preview again')
  } catch (e) {
    bad('browser view removed', e && e.message ? e.message : String(e))
  }
}

// ── 29. 热重载：换掉旧 fiber 之后再挂一次，必须仍然落在原生 Tab 上 ──────────────
// This is the 「总是回退到原始的界面，每次都要重启才能启用系统风格的界面」 bug,
// driven end to end instead of described.
//
// What the shell does when a client bundle is rebuilt (dsh-client-hmr's `reload`):
// it invalidates the module, deletes the loader entry's FIBER, waits for that
// fiber's disposers, removes the plugin's `<style data-plugin>` tags, and applies
// the freshly fetched bundle again — all WITHOUT reloading the page. A
// registration whose disposer never reached the fiber therefore outlives its own
// module, the rebuilt module's `register` is refused as a duplicate, and the
// plugin's rollback drops the panel to the floating window. Only a process
// restart cleared it, because that is what finally gave the page a single apply.
{
  console.log('hot swap (client rebuild)')
  try {
    const boot = bootClient({ sidebarRight: true })
    const want = ['dsh-sidebar-frog/files', 'dsh-sidebar-frog/artifacts', 'dsh-sidebar-frog/jobs',
      'dsh-sidebar-frog/usage', 'dsh-sidebar-frog/git']
    if (String(boot.tabs.map((t) => t.id)) !== String(want)) {
      throw new Error('the first apply registered ' + JSON.stringify(boot.tabs.map((t) => t.id)))
    }
    // Every registration reached the fiber. This is the general form of the rule:
    // a registration made outside `ctx.effect` is one the shell cannot dispose.
    if (boot.unbound.length) {
      throw new Error('these registrations never reached the plugin\'s fiber, so they survive a hot swap: ' + JSON.stringify(boot.unbound))
    }
    boot.dispose()
    if (boot.tabs.length) {
      throw new Error('after the old fiber was disposed ' + boot.tabs.length + ' tab type(s) were still registered — they outlive their module')
    }
    // The rebuilt module applies into the same registries.
    boot.apply()
    if (String(boot.tabs.map((t) => t.id)) !== String(want)) {
      throw new Error('after a hot swap the plugin holds ' + JSON.stringify(boot.tabs.map((t) => t.id)) + ' — the fresh registration was refused and rolled back')
    }
    if (boot.registered.indexOf('dsh-sidebar-frog-panel') >= 0 || boot.registered.indexOf('dsh-sidebar-frog-trigger') >= 0) {
      throw new Error('a hot swap fell back to the floating panel: that is the 「原始的界面」 the user sees until a restart')
    }
    if (boot.unbound.length) throw new Error('the rebuilt apply left unbound registrations: ' + JSON.stringify(boot.unbound))

    // The WINDOW outlives a hot-swapped module just as the registries do: the
    // cross-window bridge adds three `storage` listeners per apply, so listeners
    // left behind mean a single @引用 from the popout is inserted once per past
    // reload (and every settings change applied that many times).
    const storage = () => (boot.listeners.storage || []).length
    if (storage() !== 3) throw new Error('the first apply installed ' + storage() + ' storage listeners (expected 3)')
    boot.dispose()
    if (storage() !== 0) throw new Error(storage() + ' storage listener(s) outlived the module that installed them — a hot swap would multiply every cross-window message')
    boot.apply()
    if (storage() !== 3) throw new Error('after a hot swap the bridge holds ' + storage() + ' storage listeners (expected 3)')
    ok('cross-window listeners', 'the bridge\'s three storage listeners are disposed with the module and reinstalled once, so a hot swap cannot multiply @引用')

    // The lent renderers ride the same rule: a duplicate there is refused too,
    // and the failure is quieter still — the suffix just stops being ours.
    const lent = bootClient({ sidebarRight: true, shellMarkdown: true })
    const beforeIds = lent.documentPreviews.definitions.map((d) => d.id).filter((id) => id.indexOf('dsh-sidebar-frog/') === 0)
    const missingLent = ['dsh-sidebar-frog/markdown', 'dsh-sidebar-frog/table', 'dsh-sidebar-frog/office']
      .filter((id) => beforeIds.indexOf(id) < 0)
    if (missingLent.length) throw new Error('expected our switch-driven renderers to be lent, missing ' + JSON.stringify(missingLent))
    lent.dispose()
    lent.apply()
    const afterIds = lent.documentPreviews.definitions.map((d) => d.id).filter((id) => id.indexOf('dsh-sidebar-frog/') === 0)
    if (String(afterIds) !== String(beforeIds)) {
      throw new Error('after a hot swap the lent renderers are ' + JSON.stringify(afterIds) + ', expected ' + JSON.stringify(beforeIds))
    }
    ok('hot swap', 'a rebuilt bundle re-registers cleanly: same five tabs, no fallback to the floating panel, every lent renderer still live')
  } catch (e) {
    bad('hot swap', e && e.message ? e.message : String(e))
  }

  // The stylesheet must be replaceable by the swap: the shell removes
  // `<style data-plugin="<id>">` before re-applying, and a tag it cannot find is
  // a tag it cannot remove — the panel then keeps the previous CSS for the life
  // of the page.
  try {
    const src = read('src/client/body.js')
    if (!/setAttribute\('data-plugin', 'dsh-sidebar-frog'\)/.test(src)) {
      throw new Error('the injected stylesheet carries no data-plugin attribute, so a hot swap cannot remove it (CSS changes would need a full reload)')
    }
    if (!/existing\.textContent = css/.test(src)) {
      throw new Error('styles.insert skips an existing tag, so a rebuilt bundle keeps the OLD stylesheet')
    }
    ok('stylesheet is swappable', 'the style tag is tagged for the shell\'s own removal and re-insertion replaces it')
  } catch (e) {
    bad('stylesheet is swappable', e && e.message ? e.message : String(e))
  }

  // The asymmetry that makes a restart necessary SOMETIMES must be stated by the
  // product, not inferred by the user: the host half is read once at process
  // start, the client half per page load, and the host now reports its digest so
  // settings can name the stale half.
  try {
    const routes = read('src/host/routes.js')
    if (!/build: BUILD/.test(routes)) throw new Error('the host does not report its build id, so the panel cannot tell which half is stale')
    const panel = read('src/client/components.js')
    if (!/useHostBuild\(\)/.test(panel)) throw new Error('settings does not read the host build id')
    if (!/artifacts-setstale/.test(panel)) throw new Error('a build mismatch is not surfaced anywhere')
    const mounted = await mountPanel({ sidebarRight: true })
    const reg = mounted.boot.registrations.find((r) => r.def.name === 'settings.section')
    if (!reg) throw new Error('the settings section was not registered')
    mounted.r.setComponent(reg.component)
    await mounted.flush()
    const build = mounted.r.texts('artifacts-setbuild').join('')
    if (build.indexOf('客户端 build') < 0) throw new Error('settings states no build at all: ' + JSON.stringify(build))
    ok('build mismatch is stated', 'the panel shows both halves\' digests and flags a stale host half')
  } catch (e) {
    bad('build mismatch is stated', e && e.message ? e.message : String(e))
  }
}

// ── 30. 品牌资产：LOGO 是生成出来的，而且必须长成它说的样子 ────────────────────
// The mark is the one artifact in this repository that no Node test can "run",
// and the one a reviewer is least likely to re-measure by hand. Three things are
// therefore asserted instead of trusted:
//
//   a. the design rules hold in the SOURCE (mirror symmetry, the eyes cannot
//      touch, the pupils fit inside their eyes, nothing leaves the box, the
//      palette keeps its contrast) — so a nudge has to be argued for;
//   b. the committed files are the ones the source produces, so a hand-edited
//      SVG cannot quietly become the brand;
//   c. the committed RASTERS really look like the mark — decoded and sampled:
//      two separate eyes at 16px, ink pupils on jade at 512px, transparent
//      knockout holes in the mono variant. That is the part a human would
//      otherwise have to eyeball, and the part that silently rots (a font
//      change, a rounding change, a "helpful" white background).
console.log('brand assets (LOGO)')

{
  const geometry = geometryIssues()
  const palette = paletteIssues()
  if (geometry.length) bad('logo geometry', geometry.join('; '))
  else ok('logo geometry', `mirror-symmetric, ${MARK.eye.cx.length} eyes ${(MARK.eye.cx[1] - MARK.eye.cx[0] - 2 * MARK.eye.r)} apart, pupils inside their eyes, nothing outside the ${MARK.view} box`)

  if (palette.length) bad('logo palette', palette.join('; '))
  else ok('logo palette', `ink on jade ${contrast(PALETTE.ink, PALETTE.jade).toFixed(2)}:1 · jade on white ${contrast(PALETTE.jade, '#FFFFFF').toFixed(2)}:1 · jade on night ${contrast(PALETTE.jade, PALETTE.night).toFixed(2)}:1`)

  // (b) generated == committed
  const stale = []
  for (const [file, text] of Object.entries(generatedAssets())) {
    let onDisk = null
    try { onDisk = read(file) } catch (e) { onDisk = null }
    if (onDisk === text) continue
    stale.push(file)
    if (fix) {
      writeFileSync(join(root, file), text)
      ok(file, onDisk === null ? 'written' : 'regenerated')
    }
  }
  if (stale.length && !fix) {
    bad('logo sources', `${stale.join(', ')} differ from what scripts/logo.js generates — run \`node scripts/logo.js\``)
  } else if (!stale.length) {
    ok('logo sources', `${Object.keys(generatedAssets()).length} files match scripts/logo.js byte for byte`)
  }

  // (c) the rasters
  try {
    const problems = []
    for (const r of RASTERS) {
      const png = readPng(join(root, r.file))
      if (png.width !== r.width || png.height !== r.height) {
        problems.push(`${r.file} is ${png.width}×${png.height}, the sheet says ${r.width}×${r.height}`)
        continue
      }
      const mono = r.svg === 'mono'
      const opaque = r.svg === 'social'
      if (r.svg !== 'social' && alphaAt(png, 2, 2) !== 0) problems.push(`${r.file} has no transparent corner — the mark would sit on a white box`)
      if (r.svg !== 'social' && alphaAt(png, MARK.head.x + 27, MARK.head.y + MARK.head.h - 3) < 0.9) problems.push(`${r.file} lost the chin (the head is not a solid mass)`)
      if (r.svg !== 'social') {
        const cov = coverage(png)
        if (cov < 0.25 || cov > 0.6) problems.push(`${r.file} covers ${(cov * 100).toFixed(1)}% of its box — the mark is either starved or spilling`)
        const mirror = mirrorError(png)
        if (mirror > 6) problems.push(`${r.file} is asymmetric (mirror Δ${mirror.toFixed(2)})`)
      }
      if (r.width === 16) {
        const eyes = runsAt(png, PROBES.eyeRow).length
        const head = runsAt(png, PROBES.headRow).length
        // The whole reason the head edge sits below the eye centres: at the size
        // a favicon actually renders, the two eyes must still be two shapes.
        if (eyes < 2) problems.push(`${r.file}: the eyes merged into ${eyes} shape(s) at the eye row — the gap between them is gone`)
        if (head !== 1) problems.push(`${r.file}: the head is broken into ${head} runs at the head row`)
        // …and they must still be separate on the LAST row that sits entirely
        // above the head's edge. Sampling a single arbitrary row is not enough:
        // a raster rendered from the first cut of this mark (eyes centred ON the
        // head's edge) still shows two shapes one row higher up, because that row
        // happens to sit above where the head now starts — but not on this one.
        const edge = runsAt(png, PROBES.domeEdgeRow).length
        if (edge < 2) problems.push(`${r.file}: the two domes are already merged (${edge} shape) on the row just above the head's edge — the head is burying the gap between the eyes`)
      }
      if (r.width === 512 && !mono) {
        const pupil = colorAt(png, MARK.eye.cx[0], MARK.pupil.cy)
        const dome = colorAt(png, MARK.eye.cx[0], MARK.eye.cy - 6)
        const chin = colorAt(png, MARK.head.x + 27, MARK.head.y + MARK.head.h - 3)
        // The arc's lowest point is 0.25·y1 + 0.5·cy + 0.25·y2, NOT a linear
        // blend of y1 and cy: sampling a "75% of the way down" guess lands beside
        // the stroke and reports the mouth as missing (which is how this probe
        // was written the first time).
        const mouth = colorAt(png, 32, PROBES.mouthLow)
        const hex = ([r2, g, b]) => '#' + [r2, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
        if (hex(pupil) !== PALETTE.ink.toUpperCase()) problems.push(`${r.file}: the pupil renders as ${hex(pupil)}, not ink`)
        if (hex(dome) !== PALETTE.jade.toUpperCase()) problems.push(`${r.file}: the eye dome renders as ${hex(dome)}, not jade`)
        if (hex(chin) !== PALETTE.jade.toUpperCase()) problems.push(`${r.file}: the chin renders as ${hex(chin)}, not jade`)
        if (hex(mouth) !== PALETTE.ink.toUpperCase()) problems.push(`${r.file}: the mouth renders as ${hex(mouth)}, not ink`)
      }
      if (r.width === 128 && mono) {
        if (alphaAt(png, MARK.eye.cx[0], MARK.pupil.cy) !== 0) problems.push(`${r.file}: the pupil is not a hole — the knockout mask is not being applied`)
        if (alphaAt(png, MARK.eye.cx[0], MARK.eye.cy - 6) < 0.9) problems.push(`${r.file}: the eye dome is not painted`)
      }
      if (opaque && coverage(png) < 0.98) problems.push(`${r.file} has holes in it (coverage ${(coverage(png) * 100).toFixed(1)}%)`)
    }
    if (problems.length) bad('logo rasters', problems.join('; '))
    else ok('logo rasters', `${RASTERS.length} PNGs decoded: 2 eyes at 16px, ink pupils and jade on the 512px mark, knockout holes in the mono variant`)
  } catch (e) {
    bad('logo rasters', e && e.message ? e.message : String(e))
  }

  // The popout tab is the flagship surface and it lives on a second monitor next
  // to a dozen other tabs: without its own icon it is the one that cannot be
  // found. The favicon is generated, not typed into the page, so this compares
  // the page's copy against the generator rather than looking for a filename.
  try {
    const want = faviconDataUri()
    const page = built ? built.page : read('src/host.js')
    if (!/rel="icon"/.test(page)) throw new Error('the popout page declares no <link rel="icon">')
    if (page.indexOf(want) < 0) throw new Error('the page\'s favicon is not the SVG scripts/logo.js generates (a hand-edited copy?)')
    ok('popout favicon', `inline data URI, ${want.length} bytes — no extra route, no request, works offline`)
  } catch (e) {
    bad('popout favicon', e && e.message ? e.message : String(e))
  }

  // The README is the listing's source of truth on dsh-plugin.org: a logo whose
  // path does not resolve is a broken image on the page people judge first.
  try {
    const problems = []
    for (const file of ['README.md', 'README.zh-CN.md']) {
      const text = read(file)
      // Markdown link OR html attribute — the README uses <picture>/<img> for the
      // dark-mode swap, and a check that only understood `](…)` reported "shows
      // no logo" on a README that had just gained one.
      const refs = [...new Set([...text.matchAll(/docs\/logo\/[A-Za-z0-9._-]+/g)].map((m) => m[0]))]
      if (!refs.length) { problems.push(`${file} shows no logo`); continue }
      for (const ref of refs) {
        if (!existsSync(join(root, ref))) problems.push(`${file} points at a missing file: ${ref}`)
      }
      // Both halves of the theme swap, in BOTH editions. GitHub renders a README
      // <picture> by media query, so dropping the dark <source> is not "a smaller
      // logo" — it is an ink-coloured wordmark on a dark page, i.e. no wordmark.
      // (A mutation that removed only the dark source survived the first version
      // of this check, which was satisfied by the light one.)
      for (const need of ['docs/logo/logo.svg', 'docs/logo/logo-dark.svg', 'prefers-color-scheme: dark']) {
        if (text.indexOf(need) < 0) problems.push(`${file} is missing ${need} — the light/dark lockup swap is incomplete`)
      }
    }
    if (problems.length) bad('README logo', problems.join('; '))
    else ok('README logo', 'both editions reference an existing file under docs/logo/')
  } catch (e) {
    bad('README logo', e && e.message ? e.message : String(e))
  }

  // Existing on disk is not existing on GitHub. `.gitignore` carries `/docs`, so
  // the brand assets have to be added with `-f` — and a README image that only
  // exists in the working tree is exactly the "the repo is not the plugin" trap
  // this project already fell into once (34 uncommitted paths, including five
  // vendored libraries). Tracked-ness is a property only git can answer, so ask
  // it, and skip silently where there is no repository to ask.
  try {
    // The university mark in the License section is supplied artwork rather
    // than something scripts/logo.js generates, so it is named here instead of
    // arriving through RASTERS. It is the one brand asset a reader sees on the
    // copyright line, and a JPEG that only exists in the working tree is a
    // broken image on the listing page.
    const needs = [...Object.keys(generatedAssets()), ...RASTERS.map((r) => r.file), 'docs/logo/gzpu.jpg']
    const probe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' })
    if (probe.status !== 0) {
      ok('brand assets tracked', 'skipped (not a git work tree)')
    } else {
      const listed = spawnSync('git', ['ls-files', 'docs/logo'], { cwd: root, encoding: 'utf8' })
      const tracked = new Set(String(listed.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean))
      const missing = needs.filter((f) => !tracked.has(f))
      if (missing.length) {
        bad('brand assets tracked', `${missing.join(', ')} exist on disk but are NOT in the index — docs/ is gitignored, so add them with \`git add -f docs/logo\` or GitHub shows a broken image`)
      } else {
        ok('brand assets tracked', `${needs.length} files committed (docs/ is gitignored, so these are force-added)`)
      }
    }
  } catch (e) {
    bad('brand assets tracked', e && e.message ? e.message : String(e))
  }
}

// ── 6. the popout page in a REAL browser ───────────────────────────────────
// The stub above can drive the page's logic, but not its rendering or its input
// pipeline — which is exactly where the next bug lived. The context menu
// rebuilt every item on `mouseenter`, so Chrome kept re-entering the freshly
// created button under the cursor: the node that received mousedown was gone by
// mouseup, the click was dispatched to their common ancestor, and no item ever
// ran ("right-clicking the menu does nothing"). scripts/browser-tests.js drives
// real Chrome/Edge over the DevTools protocol — launch, real mouse/keyboard
// input, geometry, exception capture — and asserts what the user sees. It skips
// without failing where no Chromium browser is installed, or with --no-browser.
console.log('browser (real engine)')
if (process.argv.includes('--no-browser')) {
  ok('browser suite', 'skipped (--no-browser)')
} else {
  const run = spawnSync(process.execPath, [join(root, 'scripts', 'browser-tests.js')], { stdio: 'inherit' })
  if (run.status === 0) ok('browser suite', 'the popout page driven in a real engine')
  else bad('browser suite', 'the output above is from scripts/browser-tests.js (exit ' + run.status + ')')
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
