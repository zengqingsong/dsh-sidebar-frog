// Feature settings — the single definition of the settings shape.
//
// The sidebar owns the settings UI (settings.section) and writes this entry;
// the popout tab reads the *same* localStorage entry so the two halves behave
// the same way (polling, the 文件树 tab, the default divider position). Keeping
// defaults and clamping here means a value can never be validated one way when
// it is written and interpreted another way when it is read.
//
// Portable JS (var/function, no template literals, no closing script tag); the
// storage key itself lives in src/shared/bridge.js.
var DEFAULT_SETTINGS = {
  autoRefresh: true,   // poll the artifact list while the panel is open
  defaultPanelWidth: 26, // panel width on load / before any drag, as % of window width
  minPanelWidth: 20,   // minimum panel width as % of window width
  showFileTree: true,  // show the 文件树 (file tree) tab
  defaultOpen: true,   // expand the sidebar by default on load
  previewHeight: 80,   // popout: default preview width as % of the split area (its ceiling — see below)
  // Where the panel lives. On: it registers as an "extension" band tab type for
  // the column's own files kind, so the shell's 文件 tab IS this plugin's file
  // tree — @引用 into the composer, the right-click menu, per-directory refresh —
  // and the product's own definition resumes the moment this is switched off.
  // Off: the panel falls back to its own floating window and the product's plain
  // tree keeps the tab. Read once at load (see src/client/native.js).
  nativeFileTree: true,
  // Lend this plugin's Markdown renderer (offline MathJax / Mermaid / JSXGraph)
  // to the SHELL's own document preview: registered in the "extension" band it
  // wins over the product's built-in Markdown over there, so the same .md file
  // gains math and diagrams in the official right sidebar too. Off hands .md
  // back to the built-in renderer (its wider chrome returns with it).
  // See src/client/docpreview.js.
  nativeMarkdown: true,
  // Lend the TABLE renderer (CSV / TSV: sticky header, click-to-sort, row and
  // column counts) to the same registry. There is no built-in competitor for
  // these suffixes — the product claims md/markdown/html/pdf and nothing else —
  // so switching this on is pure gain: a spreadsheet stops being one long line
  // in the official sidebar as well. Off hands them back to its plain-text view.
  // See src/client/docpreview.js.
  nativeTable: true,
  // Lend the OFFICE readers (docx / xlsx / pptx, all offline and vendored) to
  // the same registry, which delivers the file's COMPLETE BYTES to them
  // (loading: 'bytes-complete'). Nothing in the product claims these three
  // suffixes — without this they are the shell's "no way to view this content"
  // notice — so it is pure gain, and switching it off hands them back to that
  // notice. The panel and the popout tab render Office files either way: this
  // switch is about the SHELL's sidebar, not about this plugin's own previews.
  // See src/client/docpreview.js and src/shared/office.js.
  nativeOffice: true,
  // Which DOCUMENT SKIN rendered Markdown wears: the shipped look, or one of the
  // platform typographies in src/shared/skins.js (GitHub, 微信, 知乎). Typography
  // and layout only — colors come from the theme, so a skin is right in light and
  // dark alike. Applied to the panel, the shell's own document tab and the popout
  // page from this one value; see markdownSkinClass.
  markdownSkin: 'default',
};

var SETTINGS_RANGES = {
  // The default width is allowed past the floor's own ceiling: it is what the
  // panel opens with, and a wide panel is still legitimate on a big screen.
  defaultPanelWidth: [20, 85],
  minPanelWidth: [20, 60],
  previewHeight: [20, 80],
};

// Settings whose value is one of a fixed set of names rather than a number.
// EVERY string-valued setting must be listed here WITH its fallback among the
// allowed names, or it can never be changed at all:
// clampSetting reads a setting through parseInt, so a name like "github"
// arrives as NaN and comes back out as the DEFAULT — which is exactly how the
// Markdown skin picker shipped unselectable (the choice was stored, read back as
// the default, and the control snapped back under the user's pointer).
//
// The list is a literal on purpose, not a reference to MD_SKIN_ORDER in
// src/shared/skins.js: this module is evaluated BEFORE the skins module in both
// bundles (the popout page reads its settings at the top of its script), so a
// cross-reference would read an uninitialized var. The two are held together by
// a guard in scripts/check.js instead — a copy that can be checked beats a
// coupling that cannot be loaded.
var SETTINGS_CHOICES = {
  markdownSkin: ['default', 'github', 'wechat', 'zhihu'],
};

function clampSetting(key, value) {
  var fallback = DEFAULT_SETTINGS[key];
  var range = SETTINGS_RANGES[key];
  var n = typeof value === 'number' ? value : parseInt(value, 10);
  if (typeof n !== 'number' || !isFinite(n)) return fallback;
  if (!range) return n;
  return Math.max(range[0], Math.min(range[1], n));
}

// One of a fixed set of names: an unknown or missing name is the default, so a
// hand-edited localStorage entry degrades to a usable value instead of leaving a
// setting nothing can interpret.
function choiceSetting(key, value) {
  var allowed = SETTINGS_CHOICES[key] || [];
  var text = typeof value === 'string' ? value : '';
  return allowed.indexOf(text) >= 0 ? text : DEFAULT_SETTINGS[key];
}

// Fills in defaults, drops unknown keys, and normalizes every value by its own
// kind — booleans coerced, numbers clamped, names checked against their list.
// Applied on both sides of every read and write, so a malformed entry (partial
// JSON, a string where a number belongs, 5000%) degrades to a usable object
// instead of propagating.
function normalizeSettings(raw) {
  var out = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    var fallback = DEFAULT_SETTINGS[key];
    var value = raw && Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : fallback;
    if (typeof fallback === 'boolean') out[key] = !!value;
    else if (typeof fallback === 'string') out[key] = choiceSetting(key, value);
    else out[key] = clampSetting(key, value);
  });
  return out;
}

function parseSettings(text) {
  if (typeof text === 'string' && text) {
    try {
      return normalizeSettings(JSON.parse(text));
    } catch (e) {
      // Corrupt entry (hand-edited, half-written): fall through to defaults.
    }
  }
  return normalizeSettings(null);
}

function serializeSettings(data) {
  return JSON.stringify(normalizeSettings(data));
}

// ── Panel width policy ─────────────────────────────────────────────────────
// What width the sidebar panel takes: a drag from this session if there is one,
// otherwise「默认面板宽度」, either way floored by「最短面板宽度」and by enough room
// for its content to stay usable.
//
// This lives here, as pure functions, instead of inline in the component for one
// reason: the panel's opening width is the first thing a user sees, and a
// regression to "opens at the minimum again" is invisible in every other check
// (the panel still renders, the tree still works). scripts/check.js drives these
// directly.
//
// paneFloorPx is the width below which the panel's content is no longer usable.
// The panel holds ONE pane (the artifact list / file tree — the preview lives in
// the popout tab), so the caller passes the list floor; it owns that number
// because it also clamps the edge drag, so it is passed in rather than
// duplicated here.

function toPx(value) {
  var n = typeof value === 'number' ? value : parseInt(value, 10);
  return typeof n === 'number' && isFinite(n) ? n : 0;
}

// The hard floor: never below 80px, never below the configured minimum, and
// never below the pane floor — which is itself capped at 45% of the window so
// the conversation column always keeps a reasonable share.
function panelMinWidthPx(windowWidth, settings, paneFloorPx) {
  var win = toPx(windowWidth);
  var min = clampSetting('minPanelWidth', settings && settings.minPanelWidth);
  return Math.max(
    80,
    Math.round(win * min / 100),
    Math.min(toPx(paneFloorPx), Math.round(win * 0.45))
  );
}

// What the panel opens with (and returns to on reload, since a drag is not
// persisted): the configured default width, but never under the floor.
function panelDefaultWidthPx(windowWidth, settings, paneFloorPx) {
  var win = toPx(windowWidth);
  var want = Math.round(win * clampSetting('defaultPanelWidth', settings && settings.defaultPanelWidth) / 100);
  return Math.max(panelMinWidthPx(win, settings, paneFloorPx), want);
}

// The live width: dragPx is a drag from this session (null = none yet).
function panelWidthPx(windowWidth, settings, dragPx, paneFloorPx) {
  var drag = dragPx == null ? 0 : toPx(dragPx);
  if (drag <= 0) return panelDefaultWidthPx(windowWidth, settings, paneFloorPx);
  return Math.max(drag, panelMinWidthPx(windowWidth, settings, paneFloorPx));
}
