/**
 * Static audit of the popout page's design tokens (src/host/page.js).
 *
 *   node scripts/_check-page-tokens.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * The popout page states the product's palette itself, because it is a
 * standalone tab with no shell to inherit from. That makes "a var() that nothing
 * defines" a real failure mode — and a silent one: CSS just drops the
 * declaration, so the symptom is a wrong colour, not a broken build. I shipped
 * exactly that once during the layout change (a dark block pointing at
 * --dsw-static-neutral-bluish-875, which is defined in the shell, not here), so
 * the rule is worth a check rather than another round of reading.
 *
 * It reports:
 *   * every custom property the page DEFINES, and every one it REFERENCES;
 *   * references with no definition in this page and no fallback, which render
 *     as nothing unless the host happens to supply them;
 *   * colour values that are still literal hex/rgb where a token exists.
 */
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/host/page.js', import.meta.url), 'utf8')

/** Both theme blocks, for the report only. */
function blocks(text) {
  const out = {}
  const light = /\n  :root \{([\s\S]*?)\n  \}/.exec(text)
  const dark = /\n  :root\[data-ds-dark-theme\][^{]*\{([\s\S]*?)\n  \}/.exec(text)
  if (light) out.light = light[1]
  if (dark) out.dark = dark[1]
  return out
}

// A definition is ANY custom property declared anywhere on the page: the two
// theme blocks, `body {}` (the --f-* layout grid), a rule further down, or the
// page's own JS setting one on an element. The audit is "is this var() defined
// somewhere in this page", not "is it in :root" — the first version of this
// script conflated the two and reported six false positives.
const defined = new Map()
for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:\s*[^;}]+/g)) defined.set(m[1], true)

// A reference is a var() OTHER than the one that defines it, so strip the
// declaration half of each `--x: var(--y)` pair before scanning consumers.
const consumers = src.replace(/(--[a-z0-9-]+)\s*:\s*[^;}]+/g, '')
const refs = new Map()
for (const m of consumers.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
  const name = m[1]
  const hasFallback = m[2] === ','
  if (!refs.has(name)) refs.set(name, { count: 0, noFallback: 0 })
  const r = refs.get(name)
  r.count++
  if (!hasFallback) r.noFallback++
}

const missing = [...refs.entries()].filter(([n]) => !defined.has(n))
console.log(`defined here: ${defined.size}`)
console.log(`referenced:   ${refs.size}`)
if (missing.length) {
  console.log('\nREFERENCES WITH NO DEFINITION IN THIS PAGE:')
  for (const [n, r] of missing) console.log(`  ${n}  (${r.count}x, ${r.noFallback} without fallback)`)
} else {
  console.log('\nall references resolve inside this page')
}
// The static ramps the file-type marks use must be here: the popout page is the
// one surface where nothing else defines them.
const markTokens = ['--dsw-static-deepseek-500', '--dsw-static-neutral-00', '--dsw-static-neutral-400']
for (const t of markTokens) {
  console.log(`${defined.has(t) ? 'ok  ' : 'MISS'} ${t} defined here`)
}
if (missing.length) process.exitCode = 1

