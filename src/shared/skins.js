// ── Document skins for rendered Markdown ────────────────────────────────────
// A skin is TYPOGRAPHY AND LAYOUT — heading rules, density, how a code block,
// a quote, a table and an image sit on the page — so the same document reads
// like the platform whose skin is chosen. It is deliberately NOT a color
// scheme: every color comes from the app's own design tokens
// (--dsw-alias-*), which is what lets one stylesheet serve the panel, the
// shell's document tab and the standalone popout page in both light and dark
// themes. A hardcoded light palette would look broken in a dark app, and the
// platform's own palette is not what a reader inside DSH is looking at.
//
// Portable JS (var/function, no template literals, no closing script tag): this
// file is inlined into the client bundle AND into the popout page's String.raw
// template, and a backtick or a dollar-brace in it would end that template.
//
// Every rule is scoped by the class the Markdown ROOT carries (see
// markdownSkinClass), so skins never reach anything else on the page.
//
// default is the shipped look (its rules live in the panel's stylesheet and
// the popout page's), so it contributes no CSS at all.

var MD_SKIN_DEFAULT = 'default';

var MD_SKIN_LABELS = {
  default: '默认（跟随主题）',
  github: 'GitHub',
  wechat: '微信（公众号）',
  zhihu: '知乎',
};

// The order the settings panel lists them in: the shipped look first, then the
// platforms by how often a Markdown document is written for one.
var MD_SKIN_ORDER = ['default', 'github', 'wechat', 'zhihu'];

var MD_SKIN_CSS = {
  github: [
    '.md-skin-github { font-size: 14px; line-height: 1.6; }',
    '.md-skin-github h1 { font-size: 1.75em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: .3em; }',
    '.md-skin-github h2 { font-size: 1.4em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: .3em; }',
    '.md-skin-github h3 { font-size: 1.2em; }',
    '.md-skin-github h4, .md-skin-github h5, .md-skin-github h6 { font-size: 1em; }',
    '.md-skin-github h1, .md-skin-github h2, .md-skin-github h3 { margin: 20px 0 12px; }',
    '.md-skin-github p { margin: 12px 0; }',
    '.md-skin-github ul, .md-skin-github ol { padding-left: 2em; }',
    '.md-skin-github li + li { margin-top: 4px; }',
    '.md-skin-github code { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: .2em .4em; font-size: .85em; }',
    '.md-skin-github pre { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: 16px; line-height: 1.45; }',
    '.md-skin-github pre code { background: transparent; padding: 0; font-size: .85em; }',
    '.md-skin-github blockquote { border-left: .25em solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); padding: 0 1em; margin: 12px 0; }',
    '.md-skin-github blockquote > :first-child { margin-top: 0; }',
    '.md-skin-github blockquote > :last-child { margin-bottom: 0; }',
    '.md-skin-github hr { border: 0; border-bottom: 1px solid var(--dsw-alias-border-l2); height: 0; margin: 24px 0; }',
    '.md-skin-github table { display: table; width: auto; max-width: 100%; }',
    '.md-skin-github th, .md-skin-github td { border: 1px solid var(--dsw-alias-border-l2); padding: 6px 13px; }',
    '.md-skin-github thead tr { background: var(--dsw-alias-bg-layer-1); }',
    '.md-skin-github img { max-width: 100%; box-sizing: content-box; }',
  ].join('\n'),
  wechat: [
    '.md-skin-wechat { font-size: 16px; line-height: 1.75; letter-spacing: .04em; }',
    '.md-skin-wechat h1, .md-skin-wechat h2, .md-skin-wechat h3, .md-skin-wechat h4 { border-bottom: 0; padding-bottom: 0; font-weight: 600; }',
    '.md-skin-wechat h1 { font-size: 1.4em; margin: 26px 0 14px; }',
    '.md-skin-wechat h2 { font-size: 1.25em; margin: 24px 0 12px; }',
    '.md-skin-wechat h3 { font-size: 1.1em; margin: 20px 0 10px; }',
    '.md-skin-wechat p { margin: 18px 0; }',
    '.md-skin-wechat ul, .md-skin-wechat ol { padding-left: 1.6em; }',
    '.md-skin-wechat li { margin: 8px 0; }',
    '.md-skin-wechat code { background: var(--dsw-alias-bg-layer-1); padding: .15em .4em; border-radius: 3px; font-size: .9em; }',
    '.md-skin-wechat pre { background: var(--dsw-alias-bg-layer-1); border-radius: 6px; padding: 14px 16px; line-height: 1.6; }',
    '.md-skin-wechat pre code { background: transparent; padding: 0; }',
    '.md-skin-wechat blockquote { border-left: 3px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); padding: 12px 14px; margin: 18px 0; }',
    '.md-skin-wechat a { text-decoration: none; border-bottom: 1px solid currentColor; }',
    // A 公众号 lays its images out as centered blocks, and separates sections
    // with a dashed rule rather than a solid one.
    '.md-skin-wechat img { display: block; margin: 18px auto; }',
    '.md-skin-wechat picture { display: block; text-align: center; }',
    '.md-skin-wechat hr { border: 0; border-top: 1px dashed var(--dsw-alias-border-l2); margin: 28px 0; }',
    '.md-skin-wechat table { display: table; width: 100%; font-size: .95em; }',
    '.md-skin-wechat th, .md-skin-wechat td { border: 1px solid var(--dsw-alias-border-l1); padding: 8px 10px; }',
  ].join('\n'),
  zhihu: [
    '.md-skin-zhihu { font-size: 15px; line-height: 1.7; }',
    '.md-skin-zhihu h1, .md-skin-zhihu h2, .md-skin-zhihu h3, .md-skin-zhihu h4 { border-bottom: 0; padding-bottom: 0; font-weight: 600; }',
    '.md-skin-zhihu h2 { font-size: 1.3em; margin: 26px 0 12px; }',
    '.md-skin-zhihu h3 { font-size: 1.15em; margin: 22px 0 10px; }',
    '.md-skin-zhihu p { margin: 14px 0; }',
    '.md-skin-zhihu code { background: var(--dsw-alias-bg-layer-1); border-radius: 3px; padding: .15em .35em; font-size: .9em; }',
    '.md-skin-zhihu pre { border-radius: 4px; padding: 12px 16px; }',
    '.md-skin-zhihu blockquote { border-left: 3px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); color: var(--dsw-alias-label-secondary); padding: 4px 16px; margin: 16px 0; }',
    '.md-skin-zhihu img { border-radius: 4px; }',
    '.md-skin-zhihu table { display: table; width: 100%; font-size: .95em; }',
    '.md-skin-zhihu th, .md-skin-zhihu td { border: 1px solid var(--dsw-alias-border-l1); padding: 7px 10px; }',
    '.md-skin-zhihu thead tr { background: var(--dsw-alias-bg-layer-1); }',
  ].join('\n'),
};

// The skin actually applied: an unknown or missing name is the shipped look, so
// a hand-edited localStorage entry can never leave a document unstyled.
function markdownSkinName(name) {
  return Object.prototype.hasOwnProperty.call(MD_SKIN_CSS, name) ? name : MD_SKIN_DEFAULT;
}

// The extra class the Markdown root carries. Empty for the default skin.
function markdownSkinClass(name) {
  var n = markdownSkinName(name);
  return n === MD_SKIN_DEFAULT ? '' : ' md-skin-' + n;
}

// The CSS for one skin: '' for the default (its rules are the base stylesheet).
function markdownSkinCss(name) {
  return MD_SKIN_CSS[markdownSkinName(name)] || '';
}

// [{ value, label }] for the settings control, in listing order.
function markdownSkinOptions() {
  return MD_SKIN_ORDER.map(function (name) {
    return { value: name, label: MD_SKIN_LABELS[name] || name };
  });
}
