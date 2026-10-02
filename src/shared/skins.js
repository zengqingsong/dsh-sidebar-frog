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
// COLOR is a separate axis: src/shared/themes.js gives the reader the classic
// document palettes (橙 / 绿 / 书本蓝 / 墨 / 暖纸) as a --md-* variable layer, and
// the color-bearing declarations below read those variables with their own
// token as the fallback — so a skin still paints exactly the token colour when
// no theme is chosen, and a chosen theme repaints the skin too.
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
    '.md-skin-github { font-size: var(--md-font-size, 14px); line-height: var(--md-line-height, 1.62); letter-spacing: var(--md-letter-spacing, normal); font-family: var(--md-font, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", Helvetica, Arial, sans-serif); }',
    '.md-skin-github > :first-child { margin-top: 0; }',
    '.md-skin-github > :last-child { margin-bottom: 0; }',
    '.md-skin-github p { margin: 0 0 var(--md-para-gap, 16px); }',
    '.md-skin-github h1, .md-skin-github h2, .md-skin-github h3, .md-skin-github h4, .md-skin-github h5, .md-skin-github h6 { margin: var(--md-heading-gap, 24px) 0 16px; font-weight: 600; line-height: 1.25; }',
    '.md-skin-github h1 { font-size: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--md-heading-rule, var(--dsw-alias-border-l2)); }',
    '.md-skin-github h2 { font-size: 1.5em; padding-bottom: .3em; border-bottom: 1px solid var(--md-heading-rule, var(--dsw-alias-border-l2)); }',
    '.md-skin-github h3 { font-size: 1.25em; }',
    '.md-skin-github h4 { font-size: 1em; }',
    '.md-skin-github h5 { font-size: .875em; }',
    '.md-skin-github h6 { font-size: .85em; color: var(--dsw-alias-label-secondary); }',
    '.md-skin-github ul, .md-skin-github ol { margin: 0 0 var(--md-block-gap, 16px); padding-left: 2em; }',
    '.md-skin-github li + li { margin-top: .25em; }',
    '.md-skin-github li > p { margin-top: 16px; }',
    '.md-skin-github code { padding: .2em .4em; border: 0; border-radius: 6px; font-size: 85%; background: var(--md-inline-code-bg, var(--dsw-alias-markdown-inline-code, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-github pre { margin: 0 0 var(--md-block-gap, 16px); padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45; border: 0; border-radius: 6px; background: var(--md-code-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-github pre code { padding: 0; font-size: 100%; background: transparent; }',
    '.md-skin-github blockquote { margin: 0 0 var(--md-block-gap, 16px); padding: 0 1em; border-left: .25em solid var(--md-quote-bar, var(--dsw-alias-border-l3)); border-radius: 0; background: var(--md-quote-bg, transparent); color: var(--md-quote-fg, var(--dsw-alias-label-secondary)); }',
    '.md-skin-github blockquote > :first-child { margin-top: 0; }',
    '.md-skin-github blockquote > :last-child { margin-bottom: 0; }',
    '.md-skin-github hr { height: .25em; margin: 24px 0; border: 0; background: var(--md-rule, var(--dsw-alias-border-l2)); }',
    '.md-skin-github table { display: block; width: max-content; max-width: 100%; margin: 0 0 var(--md-block-gap, 16px); overflow: auto; }',
    '.md-skin-github th, .md-skin-github td { padding: 6px 13px; border: 1px solid var(--md-table-border, var(--dsw-alias-border-l2)); }',
    '.md-skin-github thead th { background: var(--md-table-head-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--md-table-head-fg, inherit); }',
    '.md-skin-github tbody tr:nth-child(2n) { background: var(--md-table-stripe-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-github img { max-width: 100%; box-sizing: content-box; }',
    '.md-skin-github li.task-list-item input[type="checkbox"] { margin: 0 .4em 0 -1.4em; }',
  ].join('\n'),
  wechat: [
    '.md-skin-wechat { font-size: var(--md-font-size, 16px); line-height: var(--md-line-height, 1.85); letter-spacing: var(--md-letter-spacing, .02em); font-family: var(--md-font, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif); }',
    '.md-skin-wechat > :first-child { margin-top: 0; }',
    '.md-skin-wechat p { margin: var(--md-para-gap, 1.15em) 0; }',
    '.md-skin-wechat h1, .md-skin-wechat h2, .md-skin-wechat h3, .md-skin-wechat h4 { border: 0; padding: 0; font-weight: 600; }',
    '.md-skin-wechat h1 { font-size: 1.45em; margin: var(--md-heading-gap, 1.7em) 0 .8em; }',
    '.md-skin-wechat h2 { font-size: 1.3em; margin: calc(var(--md-heading-gap, 1.6em) - .1em) 0 .7em; }',
    '.md-skin-wechat h3 { font-size: 1.12em; margin: calc(var(--md-heading-gap, 1.4em) - .3em) 0 .6em; }',
    '.md-skin-wechat ul, .md-skin-wechat ol { margin: var(--md-block-gap, 1em) 0; padding-left: 1.5em; }',
    '.md-skin-wechat li { margin: .45em 0; }',
    '.md-skin-wechat code { padding: .15em .4em; border: 0; border-radius: 3px; font-size: .9em; background: var(--md-inline-code-bg, var(--dsw-alias-markdown-inline-code, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-wechat pre { margin: var(--md-block-gap, 1.2em) 0; padding: 14px 16px; border: 0; border-radius: 4px; font-size: .9em; line-height: 1.65; background: var(--md-code-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-wechat pre code { padding: 0; background: transparent; }',
    '.md-skin-wechat blockquote { margin: var(--md-block-gap, 1.2em) 0; padding: .85em 1em; border-left: 3px solid var(--md-quote-bar, var(--dsw-alias-border-l3)); border-radius: 0 4px 4px 0; background: var(--md-quote-bg, var(--dsw-alias-markdown-citation, var(--dsw-alias-bg-layer-1))); color: var(--md-quote-fg, var(--dsw-alias-label-secondary)); }',
    '.md-skin-wechat blockquote > :first-child { margin-top: 0; }',
    '.md-skin-wechat blockquote > :last-child { margin-bottom: 0; }',
    '.md-skin-wechat a { text-decoration: none; border-bottom: 1px solid currentColor; }',
    '.md-skin-wechat img { display: block; max-width: 100%; margin: 1.3em auto; }',
    '.md-skin-wechat picture { display: block; text-align: center; }',
    '.md-skin-wechat hr { height: 0; margin: 1.8em 0; border: 0; border-top: 1px dashed var(--md-rule, var(--dsw-alias-border-l2)); background: transparent; }',
    '.md-skin-wechat table { display: table; width: 100%; margin: var(--md-block-gap, 1.2em) 0; font-size: .92em; }',
    '.md-skin-wechat th, .md-skin-wechat td { padding: 8px 10px; border: 1px solid var(--md-table-border, var(--dsw-alias-border-l1)); }',
    '.md-skin-wechat thead th { background: var(--md-table-head-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--md-table-head-fg, inherit); }',
  ].join('\n'),
  zhihu: [
    '.md-skin-zhihu { font-size: var(--md-font-size, 15px); line-height: var(--md-line-height, 1.78); letter-spacing: var(--md-letter-spacing, .008em); font-family: var(--md-font, -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif); }',
    '.md-skin-zhihu > :first-child { margin-top: 0; }',
    '.md-skin-zhihu p { margin: var(--md-para-gap, 1em) 0; }',
    '.md-skin-zhihu h1, .md-skin-zhihu h2, .md-skin-zhihu h3, .md-skin-zhihu h4 { border: 0; padding: 0; font-weight: 600; }',
    '.md-skin-zhihu h1 { font-size: 1.5em; margin: var(--md-heading-gap, 1.7em) 0 .7em; }',
    '.md-skin-zhihu h2 { font-size: 1.3em; margin: calc(var(--md-heading-gap, 1.6em) - .1em) 0 .7em; }',
    '.md-skin-zhihu h3 { font-size: 1.12em; margin: calc(var(--md-heading-gap, 1.4em) - .3em) 0 .6em; }',
    '.md-skin-zhihu ul, .md-skin-zhihu ol { margin: var(--md-block-gap, .9em) 0; padding-left: 1.6em; }',
    '.md-skin-zhihu li { margin: .3em 0; }',
    '.md-skin-zhihu code { padding: .15em .35em; border: 0; border-radius: 3px; font-size: .9em; background: var(--md-inline-code-bg, var(--dsw-alias-markdown-inline-code, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-zhihu pre { margin: var(--md-block-gap, 1.1em) 0; padding: 12px 16px; border: 0; border-radius: 4px; background: var(--md-code-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }',
    '.md-skin-zhihu pre code { padding: 0; background: transparent; }',
    '.md-skin-zhihu blockquote { margin: var(--md-block-gap, 1.1em) 0; padding: .4em 1em; border-left: 3px solid var(--md-quote-bar, var(--dsw-alias-border-l3)); border-radius: 0; background: var(--md-quote-bg, transparent); color: var(--md-quote-fg, var(--dsw-alias-label-secondary)); }',
    '.md-skin-zhihu blockquote > :first-child { margin-top: 0; }',
    '.md-skin-zhihu blockquote > :last-child { margin-bottom: 0; }',
    '.md-skin-zhihu img { max-width: 100%; border-radius: 4px; }',
    '.md-skin-zhihu hr { height: 1px; margin: 1.6em 0; border: 0; background: var(--md-rule, var(--dsw-alias-border-l2)); }',
    '.md-skin-zhihu table { display: table; width: 100%; margin: var(--md-block-gap, 1.1em) 0; font-size: .95em; }',
    '.md-skin-zhihu th, .md-skin-zhihu td { padding: 7px 10px; border: 1px solid var(--md-table-border, var(--dsw-alias-border-l1)); }',
    '.md-skin-zhihu thead th { background: var(--md-table-head-bg, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--md-table-head-fg, inherit); }',
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
