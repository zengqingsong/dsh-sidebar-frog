# The mark — `sidebar-frog`

> Everything here is generated from `scripts/logo.js`. Do not edit the SVGs or
> the sheet by hand: `npm run check` re-renders them from the source and rejects
> the commit when they differ (root README checklist item 40).

## The idea

**A frog peeking over the top edge of a panel.** The panel is the product — a
right sidebar; the frog is the name. One idea, because a mark that encodes three
ideas reads as none of them at 16px, which is where a favicon actually lives.

| | |
|---|---|
| head | the panel: a 2:1 bar, flat top edge, straight sides, `rx 10` |
| eyes | two domes straddling that top edge, 9 units apart, pupils inside |
| pupils | rounded **squares** — at 60px+ they read as two little panes, i.e. the document the sidebar is showing |
| mouth | one shallow quadratic arc, 17 wide, placed so the jade above the ink and the chin below it are within two units of each other |

Two colours, fill-only, no strokes on the silhouette: a union of filled shapes
survives downscaling, hairlines do not. Every detail is painted **on** the jade,
which is why a single file works on light and dark backgrounds and only the
wordmark needs a dark twin.

**The eye gap is the design.** At 16px it is 2px wide and the head's top edge
sits 3 units below the eye centres — so three of the sixteen rows show two
separate eyes. The first cut of this mark had the eyes centred on the edge
instead: the head's own band bridged the gap on all but one row, and the mark
became a bar with a notch. That is not a matter of taste, it is measurable, and
`check.js` measures it.

## Files

| file | what it is | where it is used |
|---|---|---|
| `mark.svg` | the mark, jade + ink, transparent, 64×64 box | anywhere at 24px and up |
| `mark-mono.svg` | one-colour knockout: painted in `currentColor`, with the pupils and mouth cut out by a mask | the app's own icon language: a tab, a button, a jade field |
| `logo.svg` / `logo-dark.svg` | 448×128 lockup (mark + `sidebar-frog` + tagline) | the two READMEs (`<picture>`, so GitHub swaps by theme) |
| `mark-16/32/128/512.png`, `mark-mono-16/128.png` | rasters | favicon fallbacks, listings, slides, anywhere SVG is not accepted |
| `social-preview.png` | 1280×640 | the repository's GitHub social preview (Settings → General → Social preview; upload it by hand — there is no API for it) |
| `social-preview.html` | that card as source | if you would rather edit the card than regenerate it |
| `preview.html` | **the design sheet** — construction grid, size ladder, variants, lockups, clear space, in-context mocks, palette with measured contrast, the rules | open it in a browser; this is the page to look at |

## Palette

| role | hex | measured |
|---|---|---|
| jade | `#12A06B` | on white **3.35:1**, on the night background **5.59:1** — over the 3:1 floor a graphical object needs |
| ink | `#0B1220` | on jade **5.59:1** — the pupils and mouth stay legible as detail |
| amber | `#F2B01E` | the pop-out accent (the ↗), **never** inside the mark |
| paper | `#F6F7F5` | the design sheet's background |

Amber is deliberately outside the silhouette: the mark is two colours so that it
cannot drift into a "brand gradient".

## Regenerating

```sh
node scripts/logo.js              # SVGs + sheet + social card + the PNG rasters
node scripts/logo.js --no-raster  # sources only (no browser needed)
node scripts/logo.js --ascii      # …and print the rendered mark as characters
```

Rasters are captured through the machine's real Chrome/Edge (`scripts/cdp.js`),
so `mark-16.png` is what a browser **actually** produces at 16px, antialiasing
included — that is the artifact people judge, and the one where the eye gap can
silently weld shut. The browser pass also refuses to write a card whose text
blocks overlap (it measures the boxes) and fails on a broken image in the sheet.

## How this was verified without eyes on it

This mark was designed in a session that **could not open images at all**. So the
things a designer would normally check by looking are asserted instead:

- **source rules** — mirror symmetry, the eyes cannot touch, the pupils fit
  inside their eyes with room to spare, nothing leaves the box, the mouth is
  centred and clears the chin, the palette keeps its contrast (`geometryIssues`,
  `paletteIssues`);
- **generated == committed** — the SVGs and the sheet on disk must equal what the
  generator produces, so a hand tweak cannot become the brand;
- **the rasters themselves**, decoded with a zero-dependency PNG reader
  (`scripts/png.js`): transparent corners, a solid chin, coverage inside 25–60%,
  mirror Δ under 6, **two separate runs at the eye row and one at the head row at
  16px**, ink pupils on jade at 512px, and real knockout holes (alpha 0) in the
  mono variant;
- **the favicon the popout page actually serves** — compared against the
  generator, and separately loaded in Chrome to confirm the data URI decodes;
- **shape, as text** — `--ascii` prints the rendered alpha as characters (`#` ink,
  `o` jade, blank transparent). This is how the proportions were judged, and how
  the "one row of eyes" defect above was found.

None of that proves the mark is beautiful. It proves it is the mark that was
designed, at every size, in every place it is used. The one judgement left to a
human is aesthetic — open `preview.html`.

## Rules

1. **Minimum size 16px** for the mark alone (below that the eye gap closes).
2. **Clear space** = the head's corner radius (8 of 64 units) on every side.
3. **Do not recolour, outline, shadow or stretch it.** Scale the whole 64-box.
4. **Amber never enters the silhouette.**
5. The lockup's width is pinned with `textLength`, so changing the font stack does
   not reflow it — keep it that way.
6. Not affiliated with DeepSeek: this is an unofficial community plugin, and the
   mark must not be combined with DeepSeek's own logo or wordmark.
