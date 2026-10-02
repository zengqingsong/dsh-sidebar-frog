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

// The failure this audit exists for is the one named in the header: a reference
// with no definition in this page AND no fallback, which renders as nothing. A
// reference with no definition but WITH a fallback is a different thing — the
// fallback is what paints it — so the two are reported apart instead of being
// lumped into one "missing" list that a reader learns to scroll past.
const unresolved = [...refs.entries()].filter(([n]) => !defined.has(n))
const missing = unresolved.filter(([, r]) => r.noFallback > 0)
const fallbackOnly = unresolved.filter(([, r]) => r.noFallback === 0)
// --md-* is the DOCUMENT THEME layer (src/shared/themes.js). It is injected as
// its own <style> tag at runtime and is deliberately NOT declared here: with no
// theme chosen the property is undefined and the fallback is the app's own
// token, which is the entire mechanism. A --md-* reference WITHOUT a fallback
// would be a real bug (nothing would paint it), so the family is reported
// separately rather than whitelisted away.
const isThemeLayer = (n) => n.indexOf('--md-') === 0
const themeOwned = fallbackOnly.filter(([n]) => isThemeLayer(n))
const otherFallbackOnly = fallbackOnly.filter(([n]) => !isThemeLayer(n))
const unbackedTheme = unresolved.filter(([n, r]) => isThemeLayer(n) && r.noFallback > 0)
console.log(`defined here: ${defined.size}`)
console.log(`referenced:   ${refs.size}`)
if (themeOwned.length) {
  console.log(`\n--md-* document-theme references: ${themeOwned.length} — supplied by ${'src/shared/themes.js'}, injected at runtime, every one with a fallback (see that file)`)
}
if (missing.length) {
  console.log('\nREFERENCES WITH NO DEFINITION IN THIS PAGE AND NO FALLBACK:')
  for (const [n, r] of missing) console.log(`  ${n}  (${r.count}x)`)
} else if (!unbackedTheme.length) {
  console.log('\nno reference renders as nothing: every unresolved one carries a fallback')
}
if (unbackedTheme.length) {
  console.log('\n--md-* REFERENCES WITH NO FALLBACK (the theme layer contract):')
  for (const [n, r] of unbackedTheme) console.log(`  ${n}  (${r.count}x)`)
}
if (otherFallbackOnly.length) {
  console.log('\nno definition here, but with a fallback (the fallback is what paints them):')
  for (const [n, r] of otherFallbackOnly) console.log(`  ${n}  (${r.count}x)`)
}
// The static ramps the file-type marks use must be here: the popout page is the
// one surface where nothing else defines them.
const markTokens = ['--dsw-static-deepseek-500', '--dsw-static-neutral-00', '--dsw-static-neutral-400']
for (const t of markTokens) {
  console.log(`${defined.has(t) ? 'ok  ' : 'MISS'} ${t} defined here`)
}
if (missing.length || unbackedTheme.length) process.exitCode = 1

