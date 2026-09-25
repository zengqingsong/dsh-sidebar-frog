/**
 * Regenerate the artwork block of `src/shared/filetype.js` from the DSH build
 * installed on this machine.
 *
 *   node scripts/gen-filetype-icons.js            # write the block
 *   node scripts/gen-filetype-icons.js --check    # verify, exit 1 on drift
 *
 * WHY A GENERATOR AND NOT HAND-TYPED SVG
 * --------------------------------------
 * The built-in file tree draws 48 full-colour brand glyphs. That set is ~59 KB
 * of validated markup living in the install:
 *
 *   node_modules/@deepseek-ai/dsh-client-ui-primitives/
 *     lib/types/code-file-icon-artwork.d.ts   ← the artwork, as string literals
 *     lib/types/code-file-types.d.ts          ← the 48 category names, in order
 *
 * Copying that by hand is how you get 47 right and one wrong — and the wrong one
 * is always a glyph nobody looks at. So the artwork is *sourced*, and this script
 * is the only thing allowed to produce it. `--check` re-derives the same text
 * from the install, so drift between the shipped module and the installed
 * primitives fails a check instead of diverging quietly.
 *
 * The emitted block is one icon per line on purpose: a reviewer auditing "is
 * `rust` really the Rust logo?" needs the category labels visible, and a
 * minified blob hides exactly that.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = 'src/shared/filetype.js'

/** The artwork lives between these two markers; nothing else may edit it. */
const BEGIN = '// ── BEGIN GENERATED ARTWORK · scripts/gen-filetype-icons.js ───────────'
const END = '// ── END GENERATED ARTWORK ─────────────────────────────────────────────'

/**
 * Absolute path of the installed primitives package, or null when absent.
 *
 * The plugin does not depend on the client primitives — it CANNOT: a plugin is
 * loaded by the shell and the shell does not hand its own client modules to one
 * — so there is no resolvable specifier to import. The package is found the same
 * way `scripts/check.js` finds its `inject` targets: walk the node_modules that
 * hold the running DSH install. Absence is a skip and not a failure, so a
 * contributor without DSH installed can still build and run the other checks.
 */
function resolvePrimitives() {
  // Same install roots `scripts/check.js` searches when it resolves the client
  // `inject` edges, so both scripts agree about which DSH "this machine has".
  const roots = [join(dirname(process.execPath), 'node_modules')]
  if (process.env.APPDATA) roots.push(join(process.env.APPDATA, 'npm', 'node_modules'))
  const rel = ['@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives']
  for (const r of roots) {
    const candidate = join(r, ...rel)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return null
}

/** The escapes a TypeScript/JSON string literal can carry, decoded to meaning. */
const STRING_ESCAPES = {
  '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
}
const HAS_OWN = Object.prototype.hasOwnProperty

/**
 * Read one quoted string literal starting at `i`, which must hold its quote.
 * Returns the decoded text and the offset just past the closing quote.
 *
 * Escapes are decoded here and ONLY here, because "inside a string literal" is
 * the only place a backslash means anything: outside one, `\` is not a character
 * to step over two at a time, and treating it as one is how a scanner loses its
 * place in the file.
 */
function readQuoted(text, i, label, what) {
  const quote = text[i]
  i += 1
  let value = ''
  while (i < text.length && text[i] !== quote) {
    if (text[i] !== '\\') { value += text[i++]; continue }
    // Decode the escape to what the literal MEANS. The emitter writes `\"` for
    // the attribute quotes (1700 of them) and `\n` for the five line breaks the
    // YAML glyph is layered with — and a `\n` that is not decoded to a newline
    // ships as a stray character in the markup. Dropping the backslash turned it
    // into a bare `n` inside the SVG (`>n<polygon`); keeping the pair as text
    // ships a literal backslash instead. Both are wrong, in different ways.
    const esc = text[i + 1]
    if (HAS_OWN.call(STRING_ESCAPES, esc)) {
      value += STRING_ESCAPES[esc]
      i += 2
      continue
    }
    if (esc === 'u') {
      const hex = text.slice(i + 2, i + 6)
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`${label}: malformed \\u escape in ${what}`)
      value += String.fromCharCode(parseInt(hex, 16))
      i += 6
      continue
    }
    // An escape outside the table is a new emitter (or a scanner that lost its
    // place). Failing here is the whole point: silently guessing is how a glyph
    // ships with a bite taken out of it and no test notices.
    throw new Error(`${label}: unknown escape \\${esc} in ${what} — extend STRING_ESCAPES`)
  }
  if (i >= text.length) throw new Error(`${label}: unterminated ${what}`)
  return { value, end: i + 1 }
}

/**
 * Pull `CODE_FILE_ARTWORK` out of the generated `.d.ts`.
 *
 * The declaration is an object literal whose values are TypeScript string
 * literals — `angular: "<rect …/>";` — 48 of them. A scanner reads it rather
 * than a regex, because it only has to know where a string starts and ends, so
 * a `;`, `:`, `{` or quote inside an SVG path can never be mistaken for
 * structure. Three earlier attempts to do this textually were wrong, and each
 * was a different mistake worth recording, since all three still LOOK right:
 *
 *   1. entries here are separated by `;`, not `,`, so a skip set of
 *      `/[\s,]/` stops dead on the separator and the next key reads as empty;
 *   2. `objective-c` is the one key that is not a bare identifier — it is
 *      single-quoted — so a scanner that only understands `"`-quoted keys
 *      silently ate it;
 *   3. `CODE_FILE_TYPES` is declared as `: readonly [...]` with no `=`, so a
 *      regex anchored on `=` never matches that file at all.
 *
 * Hence: a walker that knows the grammar, and assertions on the result. Keys may
 * be bare or quoted (either quote character); values must be double-quoted.
 */
function parseArtwork(dts, label) {
  const start = dts.indexOf('CODE_FILE_ARTWORK')
  if (start < 0) throw new Error(`${label}: CODE_FILE_ARTWORK not found`)
  const open = dts.indexOf('{', start)
  if (open < 0) throw new Error(`${label}: no object literal`)
  const isIdent = (ch) => /[A-Za-z0-9_$-]/.test(ch)
  const artwork = {}
  const order = []
  let i = open + 1
  for (;;) {
    // The separator run is whitespace plus EITHER punctuation. A `;` here can
    // only ever be a separator: this loop resumes right after a value's closing
    // quote (or after `{`), and that is the only place a separator can appear.
    while (i < dts.length && /[\s,;]/.test(dts[i])) i++
    if (i >= dts.length) throw new Error(`${label}: unbalanced braces`)
    if (dts[i] === '}') return { artwork, order }
    let key
    if (dts[i] === '"' || dts[i] === "'") {
      const read = readQuoted(dts, i, label, `key at offset ${i}`)
      key = read.value
      i = read.end
    } else {
      const keyStart = i
      while (i < dts.length && isIdent(dts[i])) i++
      key = dts.slice(keyStart, i)
    }
    if (!key) throw new Error(`${label}: empty key at offset ${i}: ${JSON.stringify(dts.slice(i, i + 24))}`)
    if (Object.prototype.hasOwnProperty.call(artwork, key)) throw new Error(`${label}: duplicate key ${key}`)
    while (i < dts.length && /\s/.test(dts[i])) i++
    if (dts[i] === '?') i++ // optional property
    while (i < dts.length && /\s/.test(dts[i])) i++
    if (dts[i] !== ':') {
      throw new Error(`${label}: key ${key} is not followed by ':': ${JSON.stringify(dts.slice(i, i + 24))}`)
    }
    i += 1
    while (i < dts.length && /\s/.test(dts[i])) i++
    if (dts[i] !== '"') throw new Error(`${label}: the value of ${key} is not a string literal`)
    const read = readQuoted(dts, i, label, `value of ${key}`)
    i = read.end
    artwork[key] = read.value
    order.push(key)
  }
}

/**
 * The 48 category names, in the order the primitives declare them.
 *
 * `export declare const CODE_FILE_TYPES: readonly ["angular", …]` is a TYPE-only
 * declaration, so there is no `=` to anchor on — the list is sliced between the
 * brackets and then checked, rather than regex-matched into existence.
 */
function parseTypes(dts, label) {
  const start = dts.indexOf('CODE_FILE_TYPES')
  if (start < 0) throw new Error(`${label}: CODE_FILE_TYPES not found`)
  const open = dts.indexOf('[', start)
  const close = open < 0 ? -1 : dts.indexOf(']', open)
  if (close < 0) throw new Error(`${label}: CODE_FILE_TYPES is not a tuple literal`)
  const types = dts.slice(open + 1, close).split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  const bad = types.filter((t) => !/^[a-z0-9-]+$/.test(t))
  if (bad.length) throw new Error(`${label}: unexpected category names ${bad.join(', ')}`)
  const seen = new Set(types)
  if (seen.size !== types.length) throw new Error(`${label}: duplicate category names`)
  return types
}

/**
 * The two facts that make the generated table trustworthy: it covers exactly
 * the declared categories, and every entry is actually drawable markup. Both
 * are assertions on the PARSED data, so a scanner that silently drops an entry
 * fails here instead of shipping 47 icons and one blank square.
 */
function assertArtwork(artwork, types, label) {
  const missing = types.filter((t) => !Object.prototype.hasOwnProperty.call(artwork, t))
  const extra = Object.keys(artwork).filter((k) => !types.includes(k))
  if (missing.length || extra.length) {
    throw new Error(`${label}: artwork keys are not CODE_FILE_TYPES`
      + (missing.length ? ` — missing ${missing.join(', ')}` : '')
      + (extra.length ? ` — undeclared ${extra.join(', ')}` : ''))
  }
  const stray = []
  const undecoded = []
  const seen = new Map()
  for (const t of types) {
    const v = artwork[t]
    if (typeof v !== 'string' || !v.startsWith('<') || v.length <= 20) {
      throw new Error(`${label}: CODE_FILE_ARTWORK.${t} is not drawable markup`
        + ` (${typeof v === 'string' ? `length ${v.length}, starts ${JSON.stringify(v.slice(0, 12))}` : typeof v})`)
    }
    // Nothing between tags but whitespace — outside a <text> element, which is
    // where four of these glyphs draw their literal label (CSS / .ENV / INI /
    // OC). A decoded escape that dropped its backslash lands as a bare letter
    // elsewhere: `yaml` shipped with `>n<polygon` exactly that way, and the
    // markup still "looked" like SVG in a diff. A real newline is whitespace, so
    // the correct decode passes and the mangled one does not.
    const textless = v.replace(/<text[\s\S]*?<\/text>/g, '')
    if (textless.replace(/<[^>]*>/g, '').trim() !== '') stray.push(t)
    // A backslash+letter pair surviving into the value means an escape reached
    // the data undecoded (in either direction: dropped, or kept as text).
    if (/\\[A-Za-z]/.test(v)) undecoded.push(t)
    // One glyph copied 48 times passes every per-glyph check there is.
    if (seen.has(v)) throw new Error(`${label}: ${t} and ${seen.get(v)} carry the identical glyph`)
    seen.set(v, t)
  }
  if (stray.length) throw new Error(`${label}: text outside the tags in ${stray.join(', ')} — an escape was mangled`)
  if (undecoded.length) throw new Error(`${label}: an escape survived decoding in ${undecoded.join(', ')}`)
}

/**
 * One readable `"name": '<svg…>',` line per icon, in the declared order.
 *
 * Emitting in the DECLARED order rather than in parse order is deliberate: the
 * order of the .d.ts object is not part of the contract, so `--check` must be
 * insensitive to it — the text is a function of the category list and the
 * artwork, never of how the vendor happened to lay the object out.
 */
function emitArtwork(artwork, types) {
  return types.map((t) => `  ${JSON.stringify(t)}: ${JSON.stringify(artwork[t])},`).join('\n')
}

/**
 * The install's own directory glyphs, out of the bundled primitives.
 *
 * `FolderCloseArtwork` / `IconFolderOpenArtwork` are functions in lib/index.js, not
 * entries in a .d.ts, so they are read the only way a bundled function can be:
 * slice the declaration up to its closing `});` and take the `d:` strings in
 * order. The counts are asserted (2 and 3) so a re-bundled or renamed function
 * fails here instead of quietly emitting an empty folder.
 */
function parseFolderArtwork(indexJs, label) {
  const grab = (fnName, expected) => {
    const at = indexJs.indexOf(`const ${fnName} = `)
    if (at < 0) throw new Error(`${label}: ${fnName} not found`)
    const end = indexJs.indexOf('\n});', at)
    if (end < 0) throw new Error(`${label}: ${fnName} is not a closed arrow function`)
    const body = indexJs.slice(at, end)
    const ds = [...body.matchAll(/\bd:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'))
    if (ds.length !== expected) throw new Error(`${label}: ${fnName} has ${ds.length} path(s), expected ${expected}`)
    for (const d of ds) {
      if (!d.startsWith('M') || d.length <= 20) throw new Error(`${label}: ${fnName} has a path that is not geometry`)
    }
    return ds
  }
  return { close: grab('FolderCloseArtwork', 2), open: grab('IconFolderOpenArtwork', 3) }
}

function generatedBlock(artwork, types, folders) {
  const emitDs = (ds) => ds.map((d) => `  ${JSON.stringify(d)},`).join('\n')
  return [
    BEGIN,
    '',
    '// 48 full-colour brand glyphs, in the primitives declared order. Sourced',
    '// verbatim from the install — see the generator header for why.',
    'var CODE_ICON_TYPES = [',
    types.map((t) => `  ${JSON.stringify(t)},`).join('\n'),
    ']',
    '',
    '// Instance-scoped ids: several glyphs carry <linearGradient>/<clipPath> and',
    '// their artwork references those ids. Two copies of one glyph on screen with',
    '// the same id means the second silently borrows the first one\u2019s paint, so',
    '// every render stamps its OWN id into the token below.',
    'var CODE_ICON_ID_TOKEN = "__DSH_CODE_ICON_INSTANCE__"',
    '',
    'var CODE_ICON_ART = {',
    emitArtwork(artwork, types),
    '}',
    '',
    '// The directory glyphs. The built-in file tree does NOT draw a folder through',
    '// FileTypeIcon (whose folder kind is the amber card): FilesBody renders the',
    '// product\u2019s own outline folder — IconFolderCloseRegular / IconFolderOpenRegular',
    '// — so those two artworks are sourced here as well. Paths only; the stroke /',
    '// fill / opacity semantics live in the module below the markers.',
    'var FOLDER_CLOSE_D = [',
    emitDs(folders.close),
    ']',
    '',
    'var FOLDER_OPEN_D = [',
    emitDs(folders.open),
    ']',
    '',
    END,
  ].join('\n')
}

/** Swap the generated region in place; refuse to guess when markers are gone. */
function applyBlock(source, block) {
  const b = source.indexOf(BEGIN)
  const e = source.indexOf(END)
  if (b < 0 || e < 0) {
    throw new Error(`${TARGET}: artwork markers missing — restore them around CODE_ICON_ART`)
  }
  return source.slice(0, b) + block + source.slice(e + END.length)
}

export function generateFiletype() {
  const primitives = resolvePrimitives()
  if (!primitives) {
    return { skipped: true, reason: '@deepseek-ai/dsh-client-ui-primitives is not installed' }
  }
  const label = 'code-file-icon-artwork.d.ts'
  const { artwork } = parseArtwork(readFileSync(join(primitives, 'lib', 'types', label), 'utf8'), label)
  const types = parseTypes(readFileSync(join(primitives, 'lib', 'types', 'code-file-types.d.ts'), 'utf8'),
    'code-file-types.d.ts')
  if (types.length !== 48) throw new Error(`expected 48 code icon types, got ${types.length}`)
  assertArtwork(artwork, types, label)
  const indexLabel = 'lib/index.js'
  const folders = parseFolderArtwork(readFileSync(join(primitives, indexLabel), 'utf8'), indexLabel)
  const source = readFileSync(join(root, TARGET), 'utf8')
  return { skipped: false, next: applyBlock(source, generatedBlock(artwork, types, folders)), types, folders }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isCli) {
  const check = process.argv.includes('--check')
  const res = generateFiletype()
  if (res.skipped) {
    console.log('gen-filetype-icons: skipped — ' + res.reason)
    process.exit(0)
  }
  const path = join(root, TARGET)
  const current = readFileSync(path, 'utf8')
  if (current === res.next) {
    console.log(`gen-filetype-icons: ${TARGET} is current (${res.types.length} code icons)`)
  } else if (check) {
    console.error(`gen-filetype-icons: ${TARGET} has drifted from the installed primitives.`)
    console.error('  Fix with: node scripts/gen-filetype-icons.js')
    process.exit(1)
  } else {
    writeFileSync(path, res.next)
    console.log(`gen-filetype-icons: wrote ${TARGET} (${res.types.length} code icons)`)
  }
}
