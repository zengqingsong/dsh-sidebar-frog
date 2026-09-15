/**
 * sidebar-frog — the mark, in one place.
 *
 *   node scripts/logo.js              # write the SVG/HTML sources + PNG rasters
 *   node scripts/logo.js --no-raster  # sources only (no browser needed)
 *
 * WHY THE LOGO IS GENERATED
 * The repository's rule is that every artifact is reproducible from a source and
 * asserted against it (`scripts/build.js` → the two bundles; `scripts/check.js`
 * → the guards). A hand-edited SVG would be the one artifact nothing could
 * check, and its numbers would drift the first time someone nudged a radius.
 * So the geometry below is the single source of truth: the SVGs, the design
 * sheet and the favicon the popout page carries are all rendered from it, and
 * `check.js` re-renders them in memory and compares.
 *
 * THE MARK
 * A frog peeking over the top edge of a panel. It is deliberately built out of
 * one idea — the product is a *sidebar* (a wide, calm, rounded panel edge) that
 * a *frog* looks over — because a mark that encodes three ideas reads as none
 * of them at 16px, which is where a favicon actually lives:
 *
 *   - the head is the panel: flat top edge, straight sides, a 2:1 bar, so the
 *     silhouette doubles as the sidebar rail the plugin draws;
 *   - the two eyes are domes straddling that top edge, tangent-free with a
 *     9-unit gap. THE GAP IS THE DESIGN: at 16px it is 2px. If it closes, the
 *     mark becomes a blob with a bump, so `check.js` asserts two separate runs
 *     of opaque pixels at the eye row of the committed 16px raster — and the
 *     head's edge is kept 3 units BELOW the eye centres so that three of the
 *     sixteen rows show two eyes rather than one;
 *   - the pupils are rounded SQUARES, not circles: at 60px+ they read as two
 *     little panes (the document the sidebar is showing), and a square reads
 *     as a deliberate mark rather than a cartoon eyeball;
 *   - the mouth is a single quadratic arc, 17 wide, shallow, placed so the jade
 *     above the ink and the chin below it are within two units of each other.
 *     It is what makes the large sizes unambiguously a frog, and at 16px it is
 *     four dark pixels — it resolves as a mouth or it disappears, but it never
 *     turns into noise.
 *
 * Two colours, no gradients, no strokes on the silhouette (fill-only unions
 * survive downscaling far better than hairlines do). Details sit ON the jade,
 * so one file works on light and dark backgrounds — only the wordmark needs a
 * dark twin.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { alphaAt, colorAt, coverage, mirrorError, readPng, runsAt } from './png.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── The source of truth ────────────────────────────────────────────────────

/** Jade is the frog; ink is the detail drawn on it. Amber is reserved for the
 *  pop-out accent (the ↗ in the lockup and on the social card) so the mark
 *  itself stays two colours. */
export const PALETTE = Object.freeze({
  jade: '#12A06B',
  ink: '#0B1220',
  amber: '#F2B01E',
  paper: '#F6F7F5',
  muted: '#5A6570',
  night: '#0B1220',
  nightText: '#F2F5F7',
  nightMuted: '#8A94A0',
})

/** Mark geometry, in a 64×64 box. Every other number in this file is derived. */
export const MARK = Object.freeze({
  view: 64,
  // The head is a 2:1 bar so it doubles as the sidebar rail. Its top edge sits
  // 3 units BELOW the eye centres: that is what exposes 11.5 units of dome, and
  // it is the difference between "two eyes over a panel edge" (legible at 16px,
  // measured as three rows of separated eyes) and a bar with a 1px notch (the
  // first cut of this mark, where the head's own band bridged the gap).
  head: { x: 5, y: 25, w: 54, h: 27, r: 10 },
  eye: { r: 8.5, cy: 22, cx: [19, 45] },
  pupil: { w: 5.4, h: 5.4, r: 1.5, cy: 20 },
  // A shallow 7-unit smile, 17 wide (a third of the head), placed so the band
  // above the ink (8.6) and the chin below it (10.1) are within 2 units of each
  // other — an off-centre mouth is what made the first cut read bottom-heavy.
  mouth: { x1: 23.5, y1: 37, cx: 32, cy: 44, x2: 40.5, y2: 37, w: 2.8 },
  /** Empty margin the mark must keep around itself: 8 of 64 = one head radius. */
  clear: 8,
})

/** Monospace, because the product is a developer tool and a monospace wordmark
 *  is a stated choice rather than a fallback. `textLength` on every string pins
 *  the lockup's width, so the layout does not depend on which of these fonts a
 *  viewer's browser actually has. */
const MONO = "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, 'Liberation Mono', monospace"
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"

const num = (v) => String(Number(v.toFixed(2)))
const px = (v) => num(v) + 'px'

const headCentre = MARK.head.x + MARK.head.w / 2
const eyeGap = MARK.eye.cx[1] - MARK.eye.cx[0] - 2 * MARK.eye.r
const eyeTop = MARK.eye.cy - MARK.eye.r
const mouthLow = 0.25 * MARK.mouth.y1 + 0.5 * MARK.mouth.cy + 0.25 * MARK.mouth.y2
const pupilX = MARK.eye.cx.map((cx) => cx - MARK.pupil.w / 2)
const pupilY = MARK.pupil.cy - MARK.pupil.h / 2
const headBottom = MARK.head.y + MARK.head.h

/**
 * The two rows the raster guard samples, both DERIVED so a geometry change moves
 * them instead of leaving the probe pointing at the wrong part of the mark:
 *
 *  - eyeRow: the middle of the exposed dome band — above the head's top edge, so
 *    nothing but the two eyes is painted there. At 16px the gap must still show
 *    up as a hole between two runs of opaque pixels. Probing at the eye centres
 *    (eye.cy) instead would land ON the head edge, where the head's own band
 *    bridges the gap and the check would pass on a mark whose eyes had merged.
 *  - headRow: three quarters down the head — one unbroken mass, with the mouth
 *    painted inside it (ink is opaque too, so the run must not break there).
 */
export const PROBES = Object.freeze({
  eyeRow: (eyeTop + MARK.head.y) / 2,
  headRow: MARK.head.y + MARK.head.h * 0.72,
  // The arc's lowest point — a quadratic's midpoint, not a linear blend of its
  // ends. The colour probe below samples here.
  mouthLow,
  // The last 16px pixel row whose whole 4-unit band sits ABOVE the head's top
  // edge (rows sample at y = 4r + 2). The domes must still read as two separate
  // shapes here — one row before the head's band begins. This is the raster form
  // of "the eyes clear the head edge", and it is the probe that catches a raster
  // rendered from the first cut of this mark, where the head's edge sat at the
  // eye centres and swallowed the gap one row earlier.
  domeEdgeRow: 4 * (Math.floor(MARK.head.y / 4) - 1) + 2,
})

// ── Colour maths (WCAG relative luminance) ─────────────────────────────────

const channel = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const luminance = (hex) => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}
export const contrast = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ── Invariants ─────────────────────────────────────────────────────────────
// Pure functions of the constants, called by check.js. They encode the *design
// rules*, not the current numbers: "the mark is mirror-symmetric", "the eyes do
// not touch", "the pupils sit inside their eyes with room to spare", "nothing
// leaves the box". A tweak that breaks one of these is a design change, and it
// should have to be argued for rather than slip in.

export function geometryIssues() {
  const bad = []
  const { head, eye, pupil, mouth, view, clear } = MARK

  if (Math.abs(headCentre - (eye.cx[0] + eye.cx[1]) / 2) > 0.001) {
    bad.push(`eyes are off-centre on the head (eye axis ${(eye.cx[0] + eye.cx[1]) / 2}, head centre ${headCentre})`)
  }
  if (Math.abs(head.x - (view - (head.x + head.w))) > 0.001) {
    bad.push(`head is not centred in the box (left ${head.x}, right ${view - (head.x + head.w)})`)
  }
  if (eyeGap < 8) bad.push(`eye gap is ${num(eyeGap)} — under 8 units it welds shut at 16px`)
  if (eye.r * 2 * (16 / view) < 2) bad.push(`eyes are thinner than 2px at 16px (${num(eye.r * 2 * 16 / view)}px)`)
  if (eye.cy - head.y > -2) bad.push(`the head edge is only ${num(head.y - eye.cy)} below the eye centres — the domes need to clear it to stay separate at 16px`)
  if (head.y - eyeTop < 4) bad.push(`eye dome rises only ${num(head.y - eyeTop)} units above the head`)
  if (eye.cx[0] - eye.r < head.x + 3) bad.push('left eye hangs over the head edge')
  if (eye.cx[1] + eye.r > head.x + head.w - 3) bad.push('right eye hangs over the head edge')
  for (const [i, cx] of eye.cx.entries()) {
    const half = Math.hypot(pupil.w, pupil.h) / 2
    const away = Math.hypot(cx - cx, pupil.cy - eye.cy) + half
    if (away > eye.r - 1.5) bad.push(`pupil ${i + 1} is not safely inside its eye (${num(away)} of ${num(eye.r - 1.5)})`)
  }
  if (mouth.x1 < head.x + 6 || mouth.x2 > head.x + head.w - 6) bad.push('mouth is wider than the head it sits on')
  if (Math.abs((mouth.x1 + mouth.x2) / 2 - headCentre) > 0.001) bad.push('mouth is off-centre')
  if (mouthLow + mouth.w / 2 > headBottom - 4) bad.push(`mouth is ${num(headBottom - mouthLow - mouth.w / 2)} units off the chin — too tight`)
  const extents = { left: head.x, right: head.x + head.w, top: eyeTop, bottom: headBottom }
  for (const [side, value] of Object.entries(extents)) {
    const margin = side === 'left' || side === 'top' ? value : view - value
    if (margin < 2) bad.push(`mark touches the ${side} edge of the box (${num(margin)} units of margin)`)
  }
  if (clear > view / 4) bad.push(`declared clear space (${clear}) is more than a quarter of the box`)
  return bad
}

export function paletteIssues() {
  const bad = []
  const inkOnJade = contrast(PALETTE.ink, PALETTE.jade)
  const jadeOnPaper = contrast(PALETTE.jade, '#FFFFFF')
  const jadeOnNight = contrast(PALETTE.jade, PALETTE.night)
  if (inkOnJade < 4.5) bad.push(`ink on jade is ${inkOnJade.toFixed(2)}:1 — the pupils and mouth need 4.5:1 to read as detail`)
  if (jadeOnPaper < 3) bad.push(`jade on white is ${jadeOnPaper.toFixed(2)}:1 — under 3:1 the silhouette dissolves on a light tab strip`)
  if (jadeOnNight < 3) bad.push(`jade on the dark background is ${jadeOnNight.toFixed(2)}:1`)
  return bad
}

/** The numbers the design sheet prints. Generated, so the sheet cannot lie. */
export function facts() {
  return [
    ['head', `${num(MARK.head.w)} × ${num(MARK.head.h)} · rx ${num(MARK.head.r)}`],
    ['eyes', `⌀${num(MARK.eye.r * 2)} at x = ${MARK.eye.cx.join(' / ')}`],
    ['eye gap', `${num(eyeGap)} units (${num((eyeGap * 16) / MARK.view)}px at 16px)`],
    ['domes', `${num(MARK.head.y - eyeTop)} units above the head edge`],
    ['pupils', `${num(MARK.pupil.w)}² · rx ${num(MARK.pupil.r)} · cy ${num(MARK.pupil.cy)}`],
    ['mouth', `${num(MARK.mouth.x2 - MARK.mouth.x1)} wide · ${num(MARK.mouth.w)} thick · ${num(headBottom - mouthLow)} off the chin`],
    ['clear space', `${MARK.clear} of ${MARK.view} (12.5%)`],
    ['ink on jade', `${contrast(PALETTE.ink, PALETTE.jade).toFixed(2)}:1`],
    ['jade on white', `${contrast(PALETTE.jade, '#FFFFFF').toFixed(2)}:1`],
    ['jade on night', `${contrast(PALETTE.jade, PALETTE.night).toFixed(2)}:1`],
  ]
}

// ── SVG ────────────────────────────────────────────────────────────────────

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n'

/** The silhouette: head + both eye domes as one fill (their union is seamless
 *  because they share a colour — no seam to misalign at any size). */
const silhouette = () => [
  `    <rect x="${num(MARK.head.x)}" y="${num(MARK.head.y)}" width="${num(MARK.head.w)}" height="${num(MARK.head.h)}" rx="${num(MARK.head.r)}"/>`,
  ...MARK.eye.cx.map((cx) => `    <circle cx="${num(cx)}" cy="${num(MARK.eye.cy)}" r="${num(MARK.eye.r)}"/>`),
].join('\n')

const pupils = () => MARK.eye.cx
  .map((cx) => `    <rect x="${num(cx - MARK.pupil.w / 2)}" y="${num(pupilY)}" width="${num(MARK.pupil.w)}" height="${num(MARK.pupil.h)}" rx="${num(MARK.pupil.r)}"/>`)
  .join('\n')

const mouth = () => `    <path d="M${num(MARK.mouth.x1)} ${num(MARK.mouth.y1)} Q${num(MARK.mouth.cx)} ${num(MARK.mouth.cy)} ${num(MARK.mouth.x2)} ${num(MARK.mouth.y2)}" fill="none" stroke-width="${num(MARK.mouth.w)}" stroke-linecap="round"/>`

/** The mark as painted art: jade silhouette, ink detail on top. */
export function markSvg() {
  const v = MARK.view
  return HEADER + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" width="${v}" height="${v}" role="img">
  <title>sidebar-frog</title>
  <g fill="${PALETTE.jade}">
${silhouette()}
  </g>
  <g fill="${PALETTE.ink}">
${pupils()}
  </g>
  <g stroke="${PALETTE.ink}">
${mouth()}
  </g>
</svg>
`
}

/** One-colour knockout for the app's own icon language (`currentColor`, the
 *  pupils and mouth are holes rather than paint, so it drops onto any colour). */
export function markMonoSvg() {
  const v = MARK.view
  return HEADER + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${v} ${v}" width="${v}" height="${v}" role="img">
  <title>sidebar-frog</title>
  <mask id="sf-knockout" maskUnits="userSpaceOnUse" x="0" y="0" width="${v}" height="${v}">
    <g fill="#000">
      <rect x="0" y="0" width="${v}" height="${v}"/>
    </g>
    <g fill="#fff">
${silhouette()}
    </g>
    <g fill="#000">
${pupils()}
    </g>
    <g stroke="#000">
${mouth()}
    </g>
  </mask>
  <rect x="0" y="0" width="${v}" height="${v}" fill="currentColor" mask="url(#sf-knockout)"/>
</svg>
`
}

/** The tab icon: same geometry, cropped tight. A browser pads a favicon itself,
 *  so shipping the 64-box (with its 13 units of air) would waste half the tab.
 *  The intrinsic size is stated rather than left to the SVG default: without it
 *  Chrome reports the decoded image as 214×150, a size no tab strip asked for. */
export function faviconSvg() {
  const left = MARK.head.x - 3
  const right = MARK.head.x + MARK.head.w + 3
  const top = eyeTop - 2.5
  const bottom = headBottom + 1
  const w = right - left
  const h = bottom - top
  return HEADER + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(left)} ${num(top)} ${num(w)} ${num(h)}" width="${num(w)}" height="${num(h)}" role="img">
  <title>sidebar-frog</title>
  <g fill="${PALETTE.jade}">
${silhouette()}
  </g>
  <g fill="${PALETTE.ink}">
${pupils()}
  </g>
  <g stroke="${PALETTE.ink}">
${mouth()}
  </g>
</svg>
`
}

/** Data URI for the popout page's <link rel="icon">. `#` MUST be encoded or the
 *  URI parser treats the colour as a fragment and truncates the file. */
export function faviconDataUri() {
  return 'data:image/svg+xml,' + encodeURIComponent(faviconSvg().replace(HEADER, '').replace(/\n\s*/g, ' ').trim())
}

// Wordmark metrics. `textLength` is what makes the lockup font-independent: the
// string is forced to exactly this width whatever monospace the viewer has.
const WORD = 'sidebar-frog'
const WORD_SIZE = 44
const WORD_LEN = 318
const TAG = 'FOR DEEPSEEK HARNESS'
const TAG_SIZE = 12.5
const TAG_LEN = 190
const LOCK = { markX: 16, markY: 32, textX: 104, wordBase: 70, tagBase: 92, w: 448, h: 128 }

/** Mark + wordmark. `dark` only recolours the text: every detail of the mark
 *  sits on the jade, so the mark itself is background-independent. */
export function logoSvg({ dark = false } = {}) {
  const text = dark ? PALETTE.nightText : PALETTE.ink
  const sub = dark ? PALETTE.nightMuted : PALETTE.muted
  return HEADER + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOCK.w} ${LOCK.h}" width="${LOCK.w}" height="${LOCK.h}" role="img">
  <title>sidebar-frog — a pop-out sidebar for DeepSeek Harness</title>
  <g transform="translate(${LOCK.markX} ${LOCK.markY})">
    <g fill="${PALETTE.jade}">
${silhouette()}
    </g>
    <g fill="${PALETTE.ink}">
${pupils()}
    </g>
    <g stroke="${PALETTE.ink}">
${mouth()}
    </g>
  </g>
  <text x="${LOCK.textX}" y="${LOCK.wordBase}" font-family="${MONO}" font-size="${WORD_SIZE}" font-weight="600"
        letter-spacing="-0.5" fill="${text}" textLength="${WORD_LEN}" lengthAdjust="spacing">${WORD}</text>
  <text x="${LOCK.textX}" y="${LOCK.tagBase}" font-family="${MONO}" font-size="${TAG_SIZE}" font-weight="500"
        letter-spacing="2.2" fill="${sub}" textLength="${TAG_LEN}" lengthAdjust="spacing">${TAG}</text>
</svg>
`
}

// ── The social card (1280×640, for the repository's GitHub preview) ─────────

const VALUE_LINE = 'Artifacts, an IDE file tree and offline previews — Markdown, PDF, Office, media — in your right sidebar. One click pops it out into its own browser tab for a second monitor.'
const CHIPS = ['POP-OUT TAB', 'FILE TREE', 'OFFLINE PREVIEWS', 'MULTI-TAB', '@REFERENCE']

export function socialHtml() {
  const uri = faviconDataUri().replace(/^data:image\/svg\+xml,/, '')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>sidebar-frog — social preview</title>
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: 1280px; height: 640px; overflow: hidden; position: relative;
    background: ${PALETTE.night}; color: ${PALETTE.nightText};
    font-family: ${MONO};
    background-image: radial-gradient(rgba(255,255,255,.055) 1px, transparent 1px);
    background-size: 26px 26px;
  }
  /* Depth without competing with the mark: two off-canvas panel silhouettes. */
  .ghost { position: absolute; right: -120px; top: -60px; width: 420px; height: 760px; border: 1px solid rgba(18,160,107,.30); border-radius: 28px; }
  .ghost.two { right: -60px; top: 40px; width: 300px; height: 560px; border-color: rgba(18,160,107,.16); }
  .glow { position: absolute; left: -90px; top: -160px; width: 720px; height: 720px; background: radial-gradient(circle, rgba(18,160,107,.30), rgba(18,160,107,0) 62%); }
  .body { position: absolute; inset: 0; padding: 88px 96px; box-sizing: border-box; }
  .head { display: flex; align-items: center; gap: 34px; }
  .head img { display: block; width: 132px; height: 132px; flex: none; }
  h1 { margin: 0; font-size: 78px; line-height: 1; font-weight: 600; letter-spacing: -2.5px; }
  h1 .pop { color: ${PALETTE.amber}; font-weight: 400; }
  .tag { margin: 16px 0 0; font-size: 18px; letter-spacing: 4.6px; color: ${PALETTE.nightMuted}; }
  .value { margin: 44px 0 0; max-width: 1020px; font-family: ${SERIF}; font-size: 21px; line-height: 1.6; color: #B9C2CE; }
  .rule { margin: 42px 0 0; height: 1px; background: rgba(255,255,255,.10); }
  .chips { margin: 34px 0 0; display: flex; gap: 12px; }
  .chip { border: 1px solid rgba(18,160,107,.55); color: ${PALETTE.jade}; border-radius: 999px; padding: 9px 18px; font-size: 13px; letter-spacing: 2.4px; }
  .foot { position: absolute; left: 96px; right: 96px; bottom: 40px; display: flex; justify-content: space-between; font-size: 15px; color: #6E7783; letter-spacing: .6px; }
</style>
</head>
<body>
  <div class="ghost"></div><div class="ghost two"></div><div class="glow"></div>
  <div class="body">
    <div class="head">
      <img src="data:image/svg+xml,${uri}" alt="sidebar-frog" />
      <div>
        <h1>sidebar-frog <span class="pop">&#8599;</span></h1>
        <p class="tag">A POP-OUT SIDEBAR FOR DEEPSEEK HARNESS</p>
      </div>
    </div>
    <p class="value">${VALUE_LINE}</p>
    <div class="rule"></div>
    <div class="chips">${CHIPS.map((c) => `<span class="chip">${c}</span>`).join('')}</div>
  </div>
  <div class="foot">
    <span>github.com/zengqingsong/dsh-sidebar-frog</span>
    <span>Unofficial community plugin &middot; MIT</span>
  </div>
</body>
</html>
`
}

// ── The design sheet ───────────────────────────────────────────────────────

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function previewHtml() {
  const sizes = [512, 128, 64, 32, 16]
  const factsRows = facts().map(([k, v]) => `        <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')
  const swatches = [
    ['jade', PALETTE.jade, 'the frog', `on white ${contrast(PALETTE.jade, '#FFFFFF').toFixed(2)}:1 · on night ${contrast(PALETTE.jade, PALETTE.night).toFixed(2)}:1`],
    ['ink', PALETTE.ink, 'pupils, mouth, wordmark', `on jade ${contrast(PALETTE.ink, PALETTE.jade).toFixed(2)}:1`],
    ['amber', PALETTE.amber, 'the pop-out accent only', 'never used inside the mark'],
    ['paper', PALETTE.paper, 'sheet background', '—'],
  ].map(([name, hex, role, note]) => `        <tr><th>${name}</th><td><span class="chip" style="background:${hex}"></span><code>${hex}</code></td><td>${role}</td><td class="note">${note}</td></tr>`).join('\n')
  const rules = [
    ['Minimum size', '16px for the mark alone. The eye gap is 2px there; below that it closes and the mark becomes a blob.'],
    ['Clear space', `${MARK.clear} of ${MARK.view} units (12.5%) on every side — the head\'s own corner radius.`],
    ['Backgrounds', 'One file works on light and dark: every detail is painted on the jade. Only the wordmark has a dark twin.'],
    ['Do not recolour', 'Jade + ink are the mark. Amber is the pop-out accent; it never enters the silhouette.'],
    ['Do not outline or add effects', 'Fill-only unions survive downscaling; strokes and shadows do not.'],
    ['Do not stretch', 'Scale the whole 64-box. Never rescale one axis.'],
    ['Wordmark', 'Monospace, 600 weight, forced to a fixed width with textLength so the lockup cannot reflow.'],
    ['Alignment', 'The mark and the wordmark share a baseline; the tagline starts at the same x as the wordmark.'],
  ].map(([k, v]) => `        <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>sidebar-frog — mark &amp; lockup</title>
<style>
  :root { --paper:${PALETTE.paper}; --ink:${PALETTE.ink}; --jade:${PALETTE.jade}; --amber:${PALETTE.amber}; --muted:${PALETTE.muted}; --rule:rgba(11,18,32,.14); --rule2:rgba(11,18,32,.07); }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: ${MONO}; font-size: 13px; line-height: 1.55; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 64px 40px 96px; }
  header.mast { border-bottom: 2px solid var(--ink); padding-bottom: 22px; }
  h1 { font-family: ${SERIF}; font-size: 54px; line-height: 1; margin: 0; font-weight: 400; letter-spacing: -.5px; }
  h1 span { color: var(--jade); }
  .sub { margin: 14px 0 0; color: var(--muted); max-width: 62ch; }
  .meta { margin: 16px 0 0; font-size: 11.5px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--muted); }
  h2 { font-size: 11.5px; letter-spacing: 2.6px; text-transform: uppercase; color: var(--muted); font-weight: 500;
       margin: 64px 0 18px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
  h2 b { color: var(--ink); font-weight: 600; }
  .row { display: flex; gap: 32px; flex-wrap: wrap; align-items: flex-start; }
  .mark-big { width: 240px; height: 240px; }
  .construct { position: relative; width: 240px; height: 240px; border: 1px solid var(--rule); }
  .construct .grid { position: absolute; inset: 0; background-image: linear-gradient(var(--rule2) 1px, transparent 1px), linear-gradient(90deg, var(--rule2) 1px, transparent 1px); background-size: 30px 30px; }
  .construct img { position: absolute; inset: 0; width: 240px; height: 240px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 9px 14px 9px 0; border-bottom: 1px solid var(--rule2); vertical-align: top; }
  th { font-weight: 500; color: var(--muted); white-space: nowrap; width: 1%; }
  td.note { color: var(--muted); }
  code { font-family: ${MONO}; }
  .ladder { display: flex; align-items: flex-end; gap: 30px; flex-wrap: wrap; }
  .step { text-align: center; }
  .step .label { font-size: 11px; letter-spacing: 1.4px; color: var(--muted); margin-top: 10px; }
  .step .box { display: flex; align-items: flex-end; justify-content: center; height: 132px; }
  .tabs { display: inline-flex; align-items: flex-end; gap: 2px; background: #E8EAE6; border-radius: 10px 10px 0 0; padding: 8px 8px 0; }
  .tab { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--rule); border-bottom: 0; border-radius: 8px 8px 0 0; padding: 8px 14px 10px; font-size: 12px; }
  .tab img { width: 16px; height: 16px; display: block; }
  .tab.idle { background: #F2F3F0; color: var(--muted); }
  .night { background: var(--ink); color: ${PALETTE.nightText}; border-radius: 10px; padding: 28px 30px; }
  .night .sub, .night .label { color: ${PALETTE.nightMuted}; }
  .night table th { color: ${PALETTE.nightMuted}; }
  .night th, .night td { border-bottom-color: rgba(255,255,255,.10); }
  .panel { width: 236px; background: #101826; border: 1px solid rgba(255,255,255,.10); border-radius: 10px; overflow: hidden; }
  .panel .head { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.10); font-size: 12px; }
  .panel .head img { width: 18px; height: 18px; }
  .panel .row2 { padding: 9px 12px; color: ${PALETTE.nightMuted}; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .clear { position: relative; display: inline-block; padding: ${MARK.clear * 3}px; }
  .clear .box { position: absolute; inset: 0; border: 1px dashed var(--jade); }
  .clear img { display: block; width: 192px; height: 192px; }
  .swatch { display: inline-block; width: 34px; height: 14px; border: 1px solid var(--rule); vertical-align: -2px; margin-right: 9px; }
  ul.files { padding-left: 18px; }
  footer { margin-top: 72px; padding-top: 18px; border-top: 1px solid var(--rule); color: var(--muted); font-size: 12px; }
  .mono-note { color: var(--muted); font-size: 12px; margin-top: 10px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="mast">
    <h1>sidebar-frog <span>&#8599;</span></h1>
    <p class="sub">A frog peeking over the top edge of a panel. The panel is the product (a right sidebar); the frog is the name. One idea, so it survives at 16px.</p>
    <p class="meta">Mark &amp; lockup · generated by scripts/logo.js · ${PALETTE.jade} + ${PALETTE.ink}</p>
  </header>

  <h2><b>01</b> — the mark, and how it is built</h2>
  <div class="row">
    <img class="mark-big" src="mark.svg" alt="the mark" />
    <div class="construct"><div class="grid"></div><img src="mark.svg" alt="construction grid" /></div>
    <table style="flex:1; min-width:300px">
${factsRows}
    </table>
  </div>
  <p class="mono-note">Grid: 64 units, drawn above at 30px per 8 units. Every measurement on this page is read from the generator, not typed by hand.</p>

  <h2><b>02</b> — size ladder</h2>
  <div class="ladder">
${sizes.map((s) => `    <div class="step"><div class="box"><img src="mark.svg" width="${s}" height="${s}" alt="${s}px" /></div><div class="label">${s}px</div></div>`).join('\n')}
  </div>

  <h2><b>03</b> — variants</h2>
  <div class="row">
    <div class="step"><img src="mark.svg" width="128" height="128" alt="primary" /><div class="label">primary · jade + ink</div></div>
    <div class="step" style="background:var(--ink); padding:14px; border-radius:8px"><img src="mark-mono.svg" width="128" height="128" alt="mono" style="color:${PALETTE.nightText}" /><div class="label">mono knockout · currentColor</div></div>
    <div class="step" style="background:${PALETTE.jade}; padding:14px; border-radius:8px"><img src="mark-mono.svg" width="128" height="128" alt="mono on jade" style="color:${PALETTE.nightText}" /><div class="label">mono on jade</div></div>
    <div class="step"><img src="mark-mono.svg" width="128" height="128" alt="mono on paper" style="color:var(--ink)" /><div class="label">mono on paper · in-app icon</div></div>
  </div>
  <p class="mono-note">The mono variant paints nothing but <code>currentColor</code>: the pupils and mouth are holes cut by a mask, so it drops onto a tab, a button or a jade field without a second file.</p>

  <h2><b>04</b> — lockups and clear space</h2>
  <div class="row">
    <div>
      <img src="logo.svg" width="448" height="128" alt="light lockup" />
      <div class="label" style="color:var(--muted); font-size:11px; letter-spacing:1.4px">LIGHT · logo.svg</div>
    </div>
    <div class="night">
      <img src="logo-dark.svg" width="448" height="128" alt="dark lockup" />
      <div class="label" style="font-size:11px; letter-spacing:1.4px">DARK · logo-dark.svg</div>
    </div>
  </div>
  <div class="row" style="margin-top:28px; align-items:center">
    <div class="clear"><div class="box"></div><img src="mark.svg" alt="clear space" /></div>
    <p class="mono-note" style="max-width:34ch">Clear space equals the head's corner radius (${MARK.clear} of ${MARK.view} units). Nothing else enters that margin — not text, not a badge, not a panel edge.</p>
  </div>

  <h2><b>05</b> — in context</h2>
  <div class="row">
    <div class="step">
      <div class="tabs">
        <span class="tab idle">Overview</span>
        <span class="tab"><img src="mark.svg" alt="" />sidebar-frog</span>
        <span class="tab idle">Files</span>
      </div>
      <div class="label">the popout tab on a second monitor</div>
    </div>
    <div class="step" style="text-align:left">
      <div class="panel">
        <div class="head"><img src="mark.svg" alt="" /> <span>可弹出式侧边栏</span></div>
        <div class="row2">docs/logo/mark.svg</div>
        <div class="row2">src/client/styles.js</div>
        <div class="row2">scripts/check.js</div>
      </div>
      <div class="label">panel header (dark)</div>
    </div>
    <div class="step" style="text-align:left; max-width:330px">
      <img src="logo.svg" width="300" alt="README header" />
      <div class="label" style="text-align:left">README header · both editions</div>
    </div>
  </div>

  <h2><b>06</b> — palette</h2>
  <table>
${swatches}
  </table>

  <h2><b>07</b> — rules</h2>
  <table>
${rules}
  </table>

  <h2><b>08</b> — files</h2>
  <ul class="files">
    <li><code>mark.svg</code> — the mark, ${PALETTE.jade} + ${PALETTE.ink}, transparent, 64×64 box</li>
    <li><code>mark-mono.svg</code> — one-colour knockout for in-app use</li>
    <li><code>logo.svg</code> / <code>logo-dark.svg</code> — 448×128 lockups</li>
    <li><code>mark-16/32/128/512.png</code>, <code>mark-mono-16/128.png</code> — rasters (favicon fallback, listings, slides)</li>
    <li><code>social-preview.png</code> — 1280×640, for the repository's GitHub preview</li>
    <li><code>social-preview.html</code> — that card as a source file, if you would rather edit it than regenerate it</li>
  </ul>
  <p class="mono-note">Regenerate everything: <code>node scripts/logo.js</code>. The SVG and HTML sources are generated, so editing them by hand is the one change <code>npm run check</code> will reject.</p>

  <footer>
    Not affiliated with DeepSeek. An unofficial community plugin for DeepSeek Harness (DSH) · MIT · the mark is a frog, the panel is the product.
  </footer>
</div>
</body>
</html>
`
}

// ── Generated text assets ──────────────────────────────────────────────────

/** Every text asset, keyed by repository-relative path. check.js re-renders
 *  this map and compares it against the working tree, so an SVG edited by hand
 *  (or left behind by an earlier geometry) fails the build instead of shipping. */
export function generatedAssets() {
  const dir = 'docs/logo/'
  return {
    [dir + 'mark.svg']: markSvg(),
    [dir + 'mark-mono.svg']: markMonoSvg(),
    [dir + 'logo.svg']: logoSvg({ dark: false }),
    [dir + 'logo-dark.svg']: logoSvg({ dark: true }),
    [dir + 'preview.html']: previewHtml(),
    [dir + 'social-preview.html']: socialHtml(),
  }
}

/** Rasters, written by the browser pass. `svg` names the source; `size` is the
 *  exact PNG pixel size the guard asserts. */
export const RASTERS = [
  { file: 'docs/logo/mark-16.png', svg: 'mark', width: 16, height: 16 },
  { file: 'docs/logo/mark-32.png', svg: 'mark', width: 32, height: 32 },
  { file: 'docs/logo/mark-128.png', svg: 'mark', width: 128, height: 128 },
  { file: 'docs/logo/mark-512.png', svg: 'mark', width: 512, height: 512 },
  { file: 'docs/logo/mark-mono-16.png', svg: 'mono', width: 16, height: 16 },
  { file: 'docs/logo/mark-mono-128.png', svg: 'mono', width: 128, height: 128 },
  { file: 'docs/logo/social-preview.png', svg: 'social', width: 1280, height: 640 },
]

// ── Browser pass ───────────────────────────────────────────────────────────

const rasterPage = (svg, width, height) => `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  img { display: block; width: ${width}px; height: ${height}px; }
</style></head>
<body><img src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="" /></body></html>
`

/**
 * Render the mark at real pixel sizes through a real engine. Nothing here draws
 * anything itself: the point is that `mark-16.png` is what a browser REALLY
 * produces at 16px, antialiasing and all, because that is the artefact (favicon,
 * listing thumbnail) people will judge — and the one place the eye gap can
 * silently weld shut. Returns a one-line note when no browser is installed.
 */
export async function rasterize() {
  const { launch } = await import('./cdp.js')
  const session = await launch({ width: 1400, height: 900 })
  if (!session) return { skipped: 'no Chromium-family browser installed' }
  // Alpha, two ways that do NOT work and one that does:
  //   - `Page.captureScreenshot({omitBackground})` alone: every pixel comes back
  //     opaque, because this headless build paints the base canvas white. A mark
  //     that is secretly a white square is invisible on a light sheet and a
  //     glaring box on a dark one.
  //   - launching with `--default-background-color=00000000` (the Puppeteer
  //     trick): the browser dies on the first `file://` navigation — reproduced,
  //     and `about:blank` masks it, so it looks like it works until the first
  //     real page load.
  //   - `Emulation.setDefaultBackgroundColorOverride` (below): the documented
  //     CDP switch for exactly this, works with the capture taken from a real
  //     file:// page.
  await session.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  const tmp = mkdtempSync(join(tmpdir(), 'dsf-logo-'))
  const written = []
  try {
    for (const [i, r] of RASTERS.entries()) {
      const target = join(root, r.file)
      const social = r.svg === 'social'
      const html = social ? socialHtml() : rasterPage(r.svg === 'mono' ? markMonoSvg() : markSvg(), r.width, r.height)
      const page = join(tmp, 'r' + i + '.html')
      writeFileSync(page, html)
      await session.navigate(pathToFileURL(page).href)
      if (!social) {
        await session.waitFor('(() => { var i = document.querySelector("img"); return !!i && i.complete && i.naturalWidth > 0 })()', { label: r.file })
      }
      await session.send('Emulation.setDeviceMetricsOverride', { width: r.width, height: r.height, deviceScaleFactor: 1, mobile: false })
      await session.wait(120)
      // The card is typed, not drawn: its one real failure mode is text that
      // grows into the block below it (a longer tagline, a wider font). Measure
      // the boxes and refuse to write a PNG whose blocks overlap.
      if (social) {
        const boxes = JSON.parse(await session.evaluate(`JSON.stringify((() => {
          const box = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } }
          return { h1: box('h1'), tag: box('.tag'), value: box('.value'), chips: box('.chips'), foot: box('.foot') }
        })())`))
        const problems = []
        for (const [name, b] of Object.entries(boxes)) {
          if (!b) { problems.push(`${name} is missing`); continue }
          if (b.left < 0 || b.right > r.width || b.top < 0 || b.bottom > r.height) problems.push(`${name} leaves the card (${JSON.stringify(b)})`)
        }
        if (boxes.value && boxes.chips && boxes.value.bottom > boxes.chips.top - 8) problems.push('the value line runs into the chips')
        if (boxes.chips && boxes.foot && boxes.chips.bottom > boxes.foot.top - 8) problems.push('the chips run into the footer')
        if (problems.length) throw new Error('social card layout: ' + problems.join('; '))
      }
      const shot = await session.send('Page.captureScreenshot', { format: 'png', omitBackground: true })
      writeFileSync(target, Buffer.from(shot.data, 'base64'))
      const png = readPng(target)
      if (png.width !== r.width || png.height !== r.height) {
        throw new Error(`${r.file}: asked for ${r.width}×${r.height}, the browser produced ${png.width}×${png.height}`)
      }
      written.push({ ...r, png })
    }

    // The sheet references five files by relative path; a rename would leave a
    // broken image on the one page whose whole job is to be looked at.
    await session.navigate(pathToFileURL(join(root, 'docs/logo/preview.html')).href)
    await session.waitFor('Array.prototype.every.call(document.images, function (i) { return i.complete })', { label: 'design sheet images' })
    const broken = JSON.parse(await session.evaluate(`JSON.stringify(Array.prototype.filter.call(document.images, function (i) { return !i.naturalWidth }).map(function (i) { return i.getAttribute('src') }))`))
    if (broken.length) throw new Error('design sheet has broken images: ' + broken.join(', '))
    const sheetImages = await session.evaluate('document.images.length')
    written.sheet = { images: sheetImages }
  } finally {
    await session.close()
    try { rmSync(tmp, { recursive: true, force: true }) } catch (e) { /* leave it */ }
  }
  return { written }
}

/**
 * The mark as text, read back from a committed raster.
 *
 * This exists because the one thing a geometry guard cannot see is the SHAPE:
 * the numbers can all satisfy their invariants while the result reads as a
 * toaster. Printing the rendered alpha as characters makes the artwork reviewable
 * in a terminal — by a person without an image viewer, and by an agent that
 * cannot open images at all (which is how this file was checked: `#` is ink,
 * `o` is jade, a space is transparent).
 */
export function asciiFromPng(png, cols = 64) {
  const rows = Math.max(1, Math.round(((cols * png.height) / png.width) * 0.5))
  const out = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < cols; c++) {
      const x = Math.min(png.width - 1, Math.floor(((c + 0.5) / cols) * png.width))
      const y = Math.min(png.height - 1, Math.floor(((r + 0.5) / rows) * png.height))
      const [pr, pg, pb, pa] = png.pixel(x, y)
      if (pa < 128) { line += ' '; continue }
      line += 0.2126 * pr + 0.7152 * pg + 0.0722 * pb < 90 ? '#' : 'o'
    }
    out.push(line.replace(/\s+$/, ''))
  }
  return out
}

/** Read the committed rasters back and report what they actually look like. */
export function describeRasters() {
  const lines = []
  for (const r of RASTERS) {
    const file = join(root, r.file)
    if (!existsSync(file)) { lines.push(`${r.file}: MISSING`); continue }
    const png = readPng(file)
    const mono = r.svg === 'mono'
    const bits = [`${png.width}×${png.height}`, `coverage ${(coverage(png) * 100).toFixed(1)}%`]
    if (png.width === png.height) bits.push(`mirror Δ${mirrorError(png).toFixed(2)}`)
    if (png.width === 16) bits.push(`eye row runs ${runsAt(png, PROBES.eyeRow).length}`, `head row runs ${runsAt(png, PROBES.headRow).length}`)
    if (png.width === 512) {
      const [ , , , a] = colorAt(png, MARK.eye.cx[0], MARK.pupil.cy)
      bits.push('pupil ' + (mono ? `alpha ${(a / 255).toFixed(2)}` : `${rgbHex(colorAt(png, MARK.eye.cx[0], MARK.pupil.cy))} on ${rgbHex(colorAt(png, MARK.eye.cx[0], 15.5))}`))
    }
    lines.push(`${r.file}: ${bits.join(' · ')}`)
  }
  return lines
}

const rgbHex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()

// ── CLI ────────────────────────────────────────────────────────────────────

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isCli) {
  const noRaster = process.argv.includes('--no-raster')
  mkdirSync(join(root, 'docs/logo'), { recursive: true })
  for (const [file, text] of Object.entries(generatedAssets())) {
    writeFileSync(join(root, file), text)
    console.log('wrote ' + file + ' (' + text.length + ' bytes)')
  }
  for (const issue of [...geometryIssues(), ...paletteIssues()]) console.error('GEOMETRY/PALETTE: ' + issue)

  if (noRaster) {
    console.log('skipped rasters (--no-raster)')
  } else {
    const result = await rasterize()
    if (result.skipped) console.log('skipped rasters: ' + result.skipped)
    else for (const w of result.written) console.log('wrote ' + w.file + ' (' + w.width + '×' + w.height + ')')
  }
  console.log('--- what the rasters look like ---')
  for (const line of describeRasters()) console.log(line)

  if (process.argv.includes('--ascii')) {
    for (const f of ['docs/logo/mark-512.png', 'docs/logo/mark-mono-128.png', 'docs/logo/mark-16.png']) {
      const png = readPng(join(root, f))
      console.log('--- ' + f + ' (' + png.width + 'px, # ink / o jade) ---')
      console.log(asciiFromPng(png, f.endsWith('16.png') ? 16 : 64).join('\n'))
    }
  }
}
