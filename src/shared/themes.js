// ── Document themes for rendered Markdown ──────────────────────────────────
// A SKIN (src/shared/skins.js) decides TYPOGRAPHY: heading sizes, density, the
// reading font, and how a code block, a quote and a table SIT on the page. A
// THEME decides the document's PALETTE — the classic handful of reader palettes
// a courseware or a textbook is written for: 橙, 绿, 书本蓝, 墨, 暖纸.
// The two compose: a theme is a row of buttons next to the skin picker, and
// 微信 × 书本蓝 is as valid as 默认 × 默认. A theme may also restate one of the
// typography properties below when the palette itself calls for it — 墨 is ink
// on rice paper and asks for a serif's leading — which is the only reason the
// two axes are not strictly disjoint.
//
// HOW IT WORKS (and why it is variables rather than rules)
// -------------------------------------------------------
// Every theme paints through ONE contract of CSS custom properties, and the
// base stylesheets read them with their own token as the fallback:
//
//     .artifacts-markdown a { color: var(--md-link, var(--dsw-alias-state-business-primary)); }
//
// When no theme is chosen the property is UNDEFINED and the fallback is used, so
// the shipped look is bit-for-bit what it was before themes existed. A theme
// only sets the properties it wants to change, on the Markdown root itself,
// from where they inherit to every block.
//
// The fallback form is not a style preference, it is a correctness requirement.
// Declaring the DEFAULTS once on a container (":root { --md-link: var(--dsw-...) }")
// would compute the alias where it is DECLARED — and the shell flips dark by
// re-declaring tokens on <body>, not on <html>, so a value computed at :root
// would keep the light palette in a dark app. Reading a var() with a fallback
// resolves the token at the point of USE, which is why nothing here has to know
// about light and dark beyond overriding its own properties.
//
// The properties, and what each one paints:
//
//   --md-page             the document's own background (paper-like themes)
//
//   TYPOGRAPHY — read by the base stylesheets AND by every skin, each of which
//   supplies its own fallback, so an unchosen theme leaves the chosen skin's
//   rhythm exactly as it was:
//
//   --md-font             the document's body font-family
//   --md-font-size        the root font-size
//   --md-line-height      leading
//   --md-letter-spacing   tracking (a little of it reads better in CJK)
//   --md-para-gap         the space between paragraphs
//   --md-heading-gap      the space above a heading
//   --md-block-gap        the space around a code block, table, quote or rule
//
//   COLOUR:
//
//   --md-heading-font     h1–h6 font-family      (defaults to --md-font)
//   --md-heading          h1–h6 colour
//   --md-heading-weight   h1–h6 font-weight
//   --md-heading-rule     the rule under h1 (and the skin's own heading rules)
//   --md-h1-rule-w        its thickness
//   --md-rule             <hr>
//   --md-link             links
//   --md-marker           list markers
//   --md-accent           checkboxes and other accent-coloured controls
//   --md-inline-code-bg   inline code background
//   --md-code-bg          fenced code background
//   --md-code-border      the border around code and inline code
//   --md-quote-bar        the blockquote's left bar
//   --md-quote-bg         the blockquote's background
//   --md-quote-fg         the blockquote's text
//   --md-table-border     table cell borders
//   --md-table-head-bg    the header row's background
//   --md-table-head-fg    the header row's text
//   --md-table-stripe-bg  the zebra rows of a table (the GitHub skin's)
//   --md-mark-bg          <mark> background
//   --md-mark-fg          <mark> text
//
// Portable JS (var/function, no template literals, no closing script tag): this
// file is inlined into the client bundle AND into the popout page's String.raw
// template, and a backtick or a dollar-brace in it would end that template.
//
// Every rule is scoped by the class the Markdown ROOT carries (see
// markdownThemeClass), so a theme never reaches anything else on the page. The
// dark block is written as "[data-ds-dark-theme] .md-theme-x" because BOTH
// carriers of the dark marker match it: the shell puts it on <body>, the popout
// page puts it on <html>.
//
// default is the shipped look (no theme properties at all), so it contributes
// no CSS.

var MD_THEME_DEFAULT = 'default';

var MD_THEME_LABELS = {
  default: '默认（跟随主题）',
  orange: '橙色',
  green: '绿色',
  bookblue: '书本蓝',
  ink: '墨（宋体）',
  paper: '暖纸',
};

// The swatch the picker draws beside each name: the theme's own accent, so the
// row reads as a palette and not as six words. Two values because a document
// palette has two — a near-black ink or a navy is invisible as a dot on a dark
// settings page, so the dark swatch is the palette's own dark accent. null for
// the light swatch means "no accent of its own": the picker draws the two-tone
// disc for 默认 instead.
var MD_THEME_SWATCH = {
  default: null,
  orange: '#e07b1f',
  green: '#2f9e44',
  bookblue: '#1f4e79',
  ink: '#2b2b28',
  paper: '#c08a3e',
};

var MD_THEME_SWATCH_DARK = {
  default: null,
  orange: '#f5b662',
  green: '#8ce99a',
  bookblue: '#9dc3e6',
  ink: '#d9d2c2',
  paper: '#e8c98a',
};

// The order the settings panel lists them in: the shipped look first, then the
// classic reader palettes, in the order the palettes show up in the wild — the
// two warm papers (橙 / 暖纸) last, after the cool and the neutral inks.
var MD_THEME_ORDER = ['default', 'bookblue', 'green', 'ink', 'orange', 'paper'];

var MD_THEME_CSS = {
  // 橙 — the warm amber a classroom deck and a highlight marker share. Paper is
  // kept very slightly warm so the tint reads as a tint and not as a stain.
  orange: [
    '.md-theme-orange { --md-heading: #b45309; --md-heading-rule: #f0c48a; --md-h1-rule-w: 2px; --md-heading-weight: 600; --md-link: #c2410c; --md-marker: #d97706; --md-accent: #ea7c1f; --md-rule: #f0dcc2; --md-inline-code-bg: #fbf0e2; --md-code-bg: #fdf8f1; --md-code-border: #f2ddc2; --md-quote-bar: #f0a34d; --md-quote-bg: #fdf5ea; --md-quote-fg: #7c4a12; --md-table-border: #efdcc3; --md-table-head-bg: #fbefdd; --md-table-stripe-bg: #fdf7ee; --md-table-head-fg: #8a5312; }',
    '[data-ds-dark-theme] .md-theme-orange { --md-heading: #f5b662; --md-heading-rule: #6b4a1f; --md-link: #ffb566; --md-marker: #f0a34d; --md-accent: #f59e0b; --md-rule: #3d2f1f; --md-inline-code-bg: #2b2119; --md-code-bg: #241d16; --md-code-border: #3d2f1f; --md-quote-bar: #b5762a; --md-quote-bg: #2a2119; --md-quote-fg: #e6c9a3; --md-table-border: #3d2f1f; --md-table-head-bg: #2b2119; --md-table-stripe-bg: #211a12; --md-table-head-fg: #f2cf9b; }',
  ].join('\n'),
  // 绿 — the cool, calm green of a biology plate; the lightest of the five, so
  // its paper stays white.
  green: [
    '.md-theme-green { --md-heading: #1f7a3a; --md-heading-rule: #a9d9b6; --md-h1-rule-w: 2px; --md-heading-weight: 600; --md-link: #1e7a4a; --md-marker: #37b24d; --md-accent: #2f9e44; --md-rule: #cfe8d6; --md-inline-code-bg: #e9f6ec; --md-code-bg: #f4faf5; --md-code-border: #cfe8d6; --md-quote-bar: #74c98a; --md-quote-bg: #f1faf3; --md-quote-fg: #23613a; --md-table-border: #d3ead9; --md-table-head-bg: #e9f6ec; --md-table-stripe-bg: #f7fcf8; --md-table-head-fg: #1f6b36; }',
    '[data-ds-dark-theme] .md-theme-green { --md-heading: #8ce99a; --md-heading-rule: #2c4a33; --md-link: #6ee7a0; --md-marker: #51cf66; --md-accent: #40c057; --md-rule: #2c4a33; --md-inline-code-bg: #1c2b20; --md-code-bg: #16211a; --md-code-border: #2c4a33; --md-quote-bar: #4b9e63; --md-quote-bg: #1c2b20; --md-quote-fg: #b7e4c7; --md-table-border: #2c4a33; --md-table-head-bg: #1c2b20; --md-table-stripe-bg: #131c17; --md-table-head-fg: #b7e4c7; }',
  ].join('\n'),
  // 书本蓝 — the deep indigo of a printed textbook cover. Cool paper, a heavier
  // heading, and a rule under the first-level heading that reads like a printed
  // section break.
  bookblue: [
    '.md-theme-bookblue { --md-heading: #1f4e79; --md-heading-rule: #a8c4e0; --md-h1-rule-w: 2px; --md-heading-weight: 700; --md-link: #1c5aa8; --md-marker: #3b7dd8; --md-accent: #2b6cb0; --md-rule: #cfdcec; --md-inline-code-bg: #eaf1f9; --md-code-bg: #f5f8fc; --md-code-border: #d3e0ef; --md-quote-bar: #6f9fd0; --md-quote-bg: #f2f6fb; --md-quote-fg: #2c4a6b; --md-table-border: #d3e0ef; --md-table-head-bg: #e8f0f9; --md-table-stripe-bg: #f8fbfe; --md-table-head-fg: #1f4e79; }',
    '[data-ds-dark-theme] .md-theme-bookblue { --md-heading: #9dc3e6; --md-heading-rule: #2b3d52; --md-link: #8ab8f0; --md-marker: #74a9e8; --md-accent: #5b9bd5; --md-rule: #2b3d52; --md-inline-code-bg: #1d2734; --md-code-bg: #181f2a; --md-code-border: #2b3d52; --md-quote-bar: #4a7099; --md-quote-bg: #1d2734; --md-quote-fg: #bcd4ea; --md-table-border: #2b3d52; --md-table-head-bg: #1d2734; --md-table-stripe-bg: #151b24; --md-table-head-fg: #bcd4ea; }',
  ].join('\n'),
  // 墨 — ink on rice paper: a serif body, an off-white page and almost no hue.
  // The one theme that changes the TYPE, not just the colour, which is why it
  // is named after the ink rather than after a colour.
  ink: [
    '.md-theme-ink { --md-page: #fbf9f4; --md-font: Georgia, "Songti SC", "SimSun", "Noto Serif SC", serif; --md-heading-font: var(--md-font); --md-line-height: 1.92; --md-letter-spacing: .02em; --md-para-gap: 1em; --md-block-gap: 1.25em; --md-heading: #1c1c1a; --md-heading-weight: 700; --md-heading-rule: #c9c2b4; --md-h1-rule-w: 2px; --md-link: #9c5a3c; --md-marker: #a89b7f; --md-accent: #8c7a5b; --md-rule: #d8d1bf; --md-inline-code-bg: #efeade; --md-code-bg: #f4f1e9; --md-code-border: #ddd6c4; --md-quote-bar: #b8ad96; --md-quote-bg: #f6f3ec; --md-quote-fg: #4a463c; --md-table-border: #ddd6c4; --md-table-head-bg: #efeade; --md-table-stripe-bg: #f8f5ee; --md-table-head-fg: #3a3630; --md-mark-bg: #f2e2a8; --md-mark-fg: #3a3020; }',
    '[data-ds-dark-theme] .md-theme-ink { --md-page: #1a1a18; --md-heading: #ece7db; --md-heading-rule: #4a453a; --md-link: #d8ab7f; --md-marker: #b0a184; --md-accent: #b0a184; --md-rule: #3a382f; --md-inline-code-bg: #26251f; --md-code-bg: #201f1c; --md-code-border: #3a382f; --md-quote-bar: #6b6455; --md-quote-bg: #24231f; --md-quote-fg: #cfc9ba; --md-table-border: #3a382f; --md-table-head-bg: #26251f; --md-table-stripe-bg: #1d1c19; --md-table-head-fg: #ddd6c4; --md-mark-bg: #5c4a1c; --md-mark-fg: #f6e7a1; }',
  ].join('\n'),
  // 暖纸 — the eye-comfort sepia of a paperback (and of every 护眼模式): a
  // cream page, brown ink, no serif change, so it can be worn all day.
  paper: [
    '.md-theme-paper { --md-page: #fdf6e3; --md-heading: #8a5a1e; --md-heading-rule: #e6d3a8; --md-h1-rule-w: 2px; --md-heading-weight: 600; --md-link: #a05a1b; --md-marker: #b8860b; --md-accent: #c08a3e; --md-rule: #e6d6ae; --md-inline-code-bg: #f3e8cd; --md-code-bg: #f7efdb; --md-code-border: #e6d6ae; --md-quote-bar: #d8b978; --md-quote-bg: #f8efd8; --md-quote-fg: #6b5325; --md-table-border: #e6d6ae; --md-table-head-bg: #f4e9cd; --md-table-stripe-bg: #fbf4e2; --md-table-head-fg: #7a5520; --md-mark-bg: #f0dfa8; --md-mark-fg: #4a3a12; }',
    '[data-ds-dark-theme] .md-theme-paper { --md-page: #211f1a; --md-heading: #e8c98a; --md-heading-rule: #4a4130; --md-link: #e0b070; --md-marker: #cbb37a; --md-accent: #c9a15c; --md-rule: #3a3428; --md-inline-code-bg: #2b271e; --md-code-bg: #262218; --md-code-border: #3a3428; --md-quote-bar: #8a7444; --md-quote-bg: #2b271e; --md-quote-fg: #ddc9a0; --md-table-border: #3a3428; --md-table-head-bg: #2b271e; --md-table-stripe-bg: #201d15; --md-table-head-fg: #e3d2ab; --md-mark-bg: #5c4a1c; --md-mark-fg: #f6e7a1; }',
  ].join('\n'),
};

// The theme actually applied: an unknown or missing name is the shipped look, so
// a hand-edited localStorage entry can never leave a document unpainted.
function markdownThemeName(name) {
  return Object.prototype.hasOwnProperty.call(MD_THEME_CSS, name) ? name : MD_THEME_DEFAULT;
}

// The extra class the Markdown root carries. Empty for the default theme.
function markdownThemeClass(name) {
  var n = markdownThemeName(name);
  return n === MD_THEME_DEFAULT ? '' : ' md-theme-' + n;
}

// The CSS for one theme: '' for the default (it sets no properties at all).
function markdownThemeCss(name) {
  return MD_THEME_CSS[markdownThemeName(name)] || '';
}

// [{ value, label, swatch, swatchDark }] for the settings control, in listing
// order. swatch is '' for 默认 (it has no accent of its own); swatchDark falls
// back to swatch, so a caller never has to know whether a palette needed a
// second value.
function markdownThemeOptions() {
  return MD_THEME_ORDER.map(function (name) {
    var light = MD_THEME_SWATCH[name] || '';
    return {
      value: name,
      label: MD_THEME_LABELS[name] || name,
      swatch: light,
      swatchDark: MD_THEME_SWATCH_DARK[name] || light,
    };
  });
}
