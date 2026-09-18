const page = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- Which build this page is. The host serves it from memory, so a rebuilt
     plugin that was not restarted still serves the old page:
     curl -s http://127.0.0.1:3080/dsh-sidebar-frog | grep dsh-sidebar-frog-build -->
<meta name="dsh-sidebar-frog-build" content="@@build@@" />
<!-- The tab's own icon. This page is the one surface that lives in a browser tab
     strip, usually on a second monitor among a dozen unrelated tabs, so the icon
     is how the user finds it again. Generated from scripts/logo.js and inlined
     as a data URI: no extra route, no request, no auth question, and it still
     renders when the page is served from a cold process. -->
<link rel="icon" href="@@favicon@@" />
<title>弹出式侧边栏</title>
<script>
  // Theme, resolved up front. The popout tab is deliberately FIXED LIGHT by
  // default — it usually lives on a second monitor and must not flip when the
  // OS does. ?scheme=dark forces dark, ?scheme=auto opts into following the OS
  // preference (and then keeps following it). The marker goes on <html> (this
  // page) and is mirrored onto <body> (where the in-app shell puts it) so either
  // carrier styles dark. NOTE: no backticks anywhere in this file — it is one
  // String.raw literal (scripts/check.js enforces that).
  (function () {
    var m = /[?&]scheme=([^&]+)/.exec(location.search);
    var scheme = m ? m[1] : '';
    function followsSystem() { return scheme === 'auto'; }
    function isDark() {
      if (scheme === 'dark') return true;
      if (!followsSystem()) return false;
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      } catch (e) { return false; }
    }
    function apply() {
      var root = document.documentElement;
      if (!root) return;
      var dark = isDark();
      if (dark) root.setAttribute('data-ds-dark-theme', '');
      else root.removeAttribute('data-ds-dark-theme');
      var b = document.body;
      if (b) {
        if (dark) b.setAttribute('data-ds-dark-theme', '');
        else b.removeAttribute('data-ds-dark-theme');
      }
    }
    apply();
    if (followsSystem() && window.matchMedia) {
      try {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', apply);
        else if (mq.addListener) mq.addListener(apply);
      } catch (e) {}
    }
    if (document.addEventListener) document.addEventListener('DOMContentLoaded', apply);
  })();
</script>
<script>
  // MathJax 3 config — MUST run before tex-svg.js below loads. Only the
  // $...$ / $$...$$ delimiters mdToHtml keeps for us; startup.typeset is off
  // because previews are typeset explicitly (and the file list is never math).
  window.MathJax = {
    tex: { inlineMath: [['$', '$']], displayMath: [['$$', '$$']] },
    svg: { fontCache: 'local' },
    startup: { typeset: false }
  };
</script>
<script defer src="/dsh-sidebar-frog/mathjax/tex-svg.js"></script>
<style>
  :root {
    color-scheme: light;
    --p-bg: rgb(255, 255, 255);
    --p-bg-layer-1: rgb(255, 255, 255);
    /* The design tokens the Markdown skins use (src/shared/skins.js), aliased
       onto this page own palette: one skin stylesheet then serves the panel,
       the shell document tab and this page. */
    --dsw-alias-bg-layer-1: var(--p-bg-layer-1);
    --dsw-alias-border-l1: var(--p-border-l1);
    --dsw-alias-border-l2: var(--p-border-l2);
    --dsw-alias-border-l3: var(--p-border-l2);
    --dsw-alias-label-primary: var(--p-text);
    --dsw-alias-label-secondary: var(--p-text-secondary);
    --p-border-l1: rgba(0, 0, 0, 0.04);
    --p-border-l2: rgba(0, 0, 0, 0.1);
    --p-text: rgb(15, 17, 21);
    --p-text-secondary: rgb(97, 102, 107);
    --p-text-tertiary: rgb(129, 133, 140);
    --p-text-caption: rgb(173, 178, 184);
    --p-hover: rgba(38, 49, 72, 0.06);
    --p-accent: rgb(65, 118, 230);
    --p-success-fg: rgb(34, 197, 94);
    --p-success-bg: rgb(230, 250, 237);
    --p-warn-fg: rgb(221, 134, 41);
    --p-warn-bg: rgb(254, 245, 231);
    --p-error: rgb(236, 19, 19);
    --p-code-bg: rgb(250, 250, 250);
    --p-code-fg: rgb(97, 102, 107);
    --p-shadow: 0 4px 12px 0 rgba(0,0,0,0.02), 0 2px 8px 0 rgba(0,0,0,0.04);
  }
  /* Dark mode is signalled on <html> by the popout page itself and on <body>
     by the host shell, so both carriers must define the same variables. */
  :root[data-ds-dark-theme], body[data-ds-dark-theme] {
    color-scheme: dark;
    --p-bg: rgb(21, 21, 23);
    --p-bg-layer-1: rgb(35, 35, 36);
    /* The design tokens the Markdown skins use (src/shared/skins.js), aliased
       onto this page own palette: one skin stylesheet then serves the panel,
       the shell document tab and this page. */
    --dsw-alias-bg-layer-1: var(--p-bg-layer-1);
    --dsw-alias-border-l1: var(--p-border-l1);
    --dsw-alias-border-l2: var(--p-border-l2);
    --dsw-alias-border-l3: var(--p-border-l2);
    --dsw-alias-label-primary: var(--p-text);
    --dsw-alias-label-secondary: var(--p-text-secondary);
    --p-border-l1: rgba(255, 255, 255, 0.06);
    --p-border-l2: rgba(255, 255, 255, 0.12);
    --p-text: rgb(249, 250, 251);
    --p-text-secondary: rgb(207, 211, 214);
    --p-text-tertiary: rgb(173, 178, 184);
    --p-text-caption: rgb(129, 133, 140);
    --p-hover: rgba(255, 255, 255, 0.08);
    --p-accent: rgb(103, 158, 254);
    --p-success-fg: rgb(34, 197, 94);
    --p-success-bg: rgb(35, 60, 44);
    --p-warn-fg: rgb(221, 134, 41);
    --p-warn-bg: rgb(39, 36, 31);
    --p-error: rgb(242, 90, 90);
    --p-code-bg: rgb(27, 27, 28);
    --p-code-fg: rgb(207, 211, 214);
    --p-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background: var(--p-bg); color: var(--p-text);
    display: flex; flex-direction: column;
    /* Same layout grid as the in-app panel: 30px rows, 32px strips, 40px head. */
    --f-h-head: 40px;
    --f-h-strip: 32px;
    --f-h-row: 30px;
    --f-h-tree-row: 22px;
    --f-pad-x: 10px;
    /* Pane floors — the same numbers as the in-app panel
       (src/client/styles.js): the list/file tree keeps enough width for its file
       names (~46px of padding/twisty/icon + 12px per indent level), and the
       preview keeps enough to render a document. Mirrored by SPLIT_LIST_MIN /
       SPLIT_PREVIEW_MIN below; scripts/check.js fails when they drift apart. */
    --f-pane-min-list: min(280px, 38%);
    --f-pane-min-preview: min(300px, 42%);
  }
  header { display: flex; align-items: center; gap: 10px; height: var(--f-h-head); padding: 0 16px; border-bottom: 1px solid var(--p-border-l2); background: var(--p-bg-layer-1); flex: none; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .spacer { flex: 1; }
  header .status { font-size: 12px; color: var(--p-success-fg); }
  main { flex: 1; display: flex; min-height: 0; }
  /* Preview on the LEFT, list/file tree on the RIGHT — the same arrangement as
     the in-app sidebar panel, including the draggable divider between them. */
  .sidebar { flex: 1 1 0; min-width: var(--f-pane-min-list); display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--p-border-l2); container-type: inline-size; }
  .list { flex: 1; min-height: 0; overflow-y: auto; }
  .list .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .item { position: relative; display: flex; align-items: stretch; border-bottom: 1px solid var(--p-border-l1); --f-row-bg: var(--p-bg); }
  /* Selected artifact: left accent bar distinguishes it from the file tree. */
  .item.active { background: var(--p-hover); box-shadow: inset 3px 0 0 var(--p-accent); --f-row-bg: var(--p-hover); }
  .item-main { flex: 1; min-width: 0; text-align: left; padding: 8px var(--f-pad-x); border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .item-main:hover { background: var(--p-hover); }
  .item .row { display: flex; align-items: center; gap: 8px; }
  .badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
  .badge.create { background: var(--p-success-bg); color: var(--p-success-fg); }
  .badge.edit { background: var(--p-warn-bg); color: var(--p-warn-fg); }
  .item .base { flex: 1 1 auto; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .full { color: var(--p-text-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .item .time { color: var(--p-text-caption); font-size: 11px; flex: none; }
  /* Floating actions: no layout space, so the file name never reflows. */
  .actions {
    position: absolute; top: 50%; right: 4px; transform: translateY(-50%);
    display: flex; align-items: center; gap: 2px; padding-left: 14px;
    background: linear-gradient(90deg, transparent, var(--f-row-bg) 14px);
    opacity: 0; pointer-events: none; transition: opacity .12s;
  }
  .item:hover .actions, .item:focus-within .actions { opacity: 1; pointer-events: auto; }
  .mini-btn { border: none; background: transparent; color: var(--p-text-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; }
  .mini-btn:hover { background: var(--p-hover); color: var(--p-text); }
  .preview { flex: 0 1 auto; width: 80%; min-width: var(--f-pane-min-preview); display: flex; flex-direction: column; }
  .preview .bar { display: flex; align-items: center; gap: 8px; height: var(--f-h-strip); padding: 0 var(--f-pad-x); border-bottom: 1px solid var(--p-border-l2); color: var(--p-text-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview .bar .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview .area { flex: 1; min-height: 0; overflow: auto; position: relative; }
  /* Divider between the preview (left) and the list/file tree (right). Dragging
     it sizes the preview; the position is remembered across reloads. */
  .split { flex: none; width: 6px; align-self: stretch; position: relative; cursor: col-resize; touch-action: none; border-left: 1px solid var(--p-border-l2); background: transparent; }
  .split::after { content: ''; position: absolute; top: 0; bottom: 0; left: 2px; width: 2px; background: transparent; transition: background .15s; }
  .split:hover::after, .split.is-dragging::after { background: var(--p-accent); }
  .split-btn {
    position: absolute; top: 50%; right: 0; transform: translateY(-50%);
    width: 16px; height: 32px; padding: 0; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--p-border-l2); border-radius: 999px 0 0 999px;
    background: var(--p-bg-layer-1); color: var(--p-text-tertiary); cursor: pointer; z-index: 3;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    opacity: 0; transition: opacity .15s, color .15s, background .15s;
  }
  .split:hover .split-btn, .split:focus-within .split-btn, main.is-preview-collapsed .split-btn { opacity: 1; }
  .split-btn:hover { color: var(--p-text); background: var(--p-hover); }
  main.is-preview-collapsed .split-btn { right: auto; left: 0; border-radius: 0 999px 999px 0; }
  .split-chevron { display: inline-flex; transform: rotate(90deg); transition: transform .18s ease; }
  main.is-preview-collapsed .split-chevron { transform: rotate(-90deg); }
  main.is-preview-collapsed .preview { display: none; }
  .preview pre { margin: 0; padding: 16px; background: var(--p-code-bg); font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; color: var(--p-code-fg); }
  .preview .hint { padding: 32px; color: var(--p-text-tertiary); text-align: center; }
  .preview .err { padding: 24px; color: var(--p-error); font-family: ui-monospace, monospace; }
  .preview-img { display: block; max-width: 100%; max-height: 80vh; object-fit: contain; margin: 16px; }
  /* iframe/embed are REPLACED elements: inset-0 keeps their intrinsic
     (small) size, so give them an explicit width/height 100% to fill the area. */
  .preview-iframe { width: 100%; height: 100%; min-height: 400px; border: 0; background: #fff; }
  .preview-pdf { width: 100%; height: 100%; min-height: 480px; border: 0; background: #fff; display: block; }
  /* ── Delimited-text table ────────────────────────────────────────────────
     Mirrors the sidebar's table (same sticky header, same right-aligned tabular
     figures) — one file must not look like two different products depending on
     which window it was opened in. */
  .tableview { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .tablestatus { flex: none; padding: 6px 10px; font-size: 11px; color: var(--p-text-tertiary); border-bottom: 1px solid var(--p-border-l1); }
  .tablescroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .datatable { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 12px; }
  .tableth { position: sticky; top: 0; z-index: 1; background: var(--p-bg-layer-1); border-bottom: 1px solid var(--p-border-l2); border-right: 1px solid var(--p-border-l1); padding: 0; text-align: left; }
  .tableth.is-sorted { background: var(--p-hover); }
  .tablesortbtn { display: flex; align-items: center; gap: 4px; width: 100%; padding: 5px 8px; border: 0; background: transparent; cursor: pointer; font: inherit; font-weight: 600; color: var(--p-text-secondary); text-align: left; }
  .tablesortbtn:hover { background: var(--p-hover); color: var(--p-text); }
  .tablesortbtn:focus-visible { outline: 2px solid var(--p-accent); outline-offset: -2px; }
  .tableheadtext { overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
  .tablearrow { flex: none; font-size: 9px; color: var(--p-accent); }
  .tabletd { padding: 4px 8px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-bottom: 1px solid var(--p-border-l1); border-right: 1px solid var(--p-border-l1); color: var(--p-text); }
  .tabletd.is-number { text-align: right; font-variant-numeric: tabular-nums; }
  .tablerow:hover .tabletd { background: var(--p-hover); }
  .tableempty { color: var(--p-text-tertiary); }
  /* ── Audio / video: the element brings its own controls ────────────────── */
  .preview-media { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px; }
  .preview-video { max-width: 100%; max-height: 70vh; background: #000; border-radius: 4px; }
  .preview-audio { width: 100%; max-width: 520px; }
  .media-error { font-size: 12px; color: var(--p-warn-fg); line-height: 1.6; text-align: center; }
  /* ── Binary document card ─────────────────────────────────────────────── */
  .doccard { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; margin: 16px; padding: 16px; background: var(--p-bg-layer-1); border: 1px solid var(--p-border-l1); border-radius: 8px; }
  .doctitle { font-size: 13px; font-weight: 600; color: var(--p-text); }
  .doctext { margin: 0; font-size: 12px; line-height: 1.7; color: var(--p-text-secondary); }
  .docactions { display: flex; gap: 8px; flex-wrap: wrap; }
  .docbtn { padding: 5px 12px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px; border: 1px solid var(--p-border-l2); background: var(--p-bg); color: var(--p-text); }
  .docbtn:hover { background: var(--p-hover); }
  .docbtn:focus-visible { outline: 2px solid var(--p-accent); outline-offset: 1px; }
  .docbtn:disabled { opacity: 0.6; cursor: default; }
  .markdown { padding: 16px 20px; line-height: 1.6; word-wrap: break-word; }
  .markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6 { margin: 16px 0 8px; line-height: 1.3; }
  .markdown h1 { font-size: 1.5em; border-bottom: 1px solid var(--p-border-l2); padding-bottom: 6px; }
  .markdown h2 { font-size: 1.3em; border-bottom: 1px solid var(--p-border-l1); padding-bottom: 4px; }
  .markdown code { background: var(--p-code-bg); color: var(--p-code-fg); padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  .markdown pre { background: var(--p-code-bg); padding: 12px 14px; border-radius: 6px; overflow: auto; }
  .markdown pre code { background: transparent; padding: 0; }
  .markdown img { max-width: 100%; }
.markdown picture { max-width: 100%; }
.markdown picture > img { max-width: 100%; height: auto; }
.markdown [align="center"] { text-align: center; }
.markdown [align="right"] { text-align: right; }
  .markdown blockquote { border-left: 3px solid var(--p-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--p-text-secondary); }
  .markdown ul, .markdown ol { padding-left: 24px; }
  .markdown a { color: var(--p-accent); }
  .markdown hr { border: none; border-top: 1px solid var(--p-border-l2); margin: 16px 0; }
  /* Math display blocks kept verbatim by mdToHtml for MathJax to typeset. */
  .markdown .math-display { margin: 10px 0; overflow-x: auto; }
  /* Tables, task lists and extra inline marks produced by mdToHtml. */
  .markdown table { border-collapse: collapse; margin: 10px 0; display: block; max-width: 100%; overflow-x: auto; font-size: 0.93em; }
  .markdown th, .markdown td { border: 1px solid var(--p-border-l2); padding: 5px 10px; }
  .markdown th { background: var(--p-hover); font-weight: 600; }
  .markdown li.task-list-item { list-style: none; margin-left: -20px; }
  .markdown li.task-list-item input[type="checkbox"] { margin-right: 6px; vertical-align: -1px; accent-color: var(--p-accent); }
  .markdown mark { background: #ffe066; color: #241f00; border-radius: 3px; padding: 0 2px; }
  [data-ds-dark-theme] .markdown mark { background: #6b5c12; color: #f6e7a1; }
  .markdown del { color: var(--p-text-tertiary); }
  .markdown sup, .markdown sub { line-height: 0; }
  /* Raw HTML embedded in the document: collapsible answers (<details>/
     <summary>, the courseware's "答案" convention) and layout containers. */
  .markdown details { border: 1px solid var(--p-border-l2); border-radius: 8px; margin: 8px 0; background: var(--p-bg-layer-1); overflow: hidden; }
  .markdown details > summary { position: relative; cursor: pointer; padding: 6px 28px 6px 10px; font-weight: 600; list-style: none; user-select: none; }
  .markdown details > summary::-webkit-details-marker { display: none; }
  .markdown details > summary::after { content: '▸'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--p-text-tertiary); transition: transform .15s ease; }
  .markdown details[open] > summary::after { transform: translateY(-50%) rotate(90deg); }
  .markdown details[open] > summary { border-bottom: 1px solid var(--p-border-l2); background: var(--p-hover); }
  .markdown details > *:first-child { margin-top: 0; }
  .markdown details > *:last-child { margin-bottom: 0; }
  .markdown kbd { background: var(--p-bg-layer-1); border: 1px solid var(--p-border-l2); border-bottom-width: 2px; border-radius: 4px; padding: 1px 5px; font: 0.85em ui-monospace, SFMono-Regular, Menlo, monospace; }
  .markdown figure { margin: 8px 0; }
  .markdown figcaption { margin-top: 4px; font-size: 0.9em; color: var(--p-text-tertiary); }
  .markdown svg { max-width: 100%; height: auto; }
  /* Mermaid diagram containers (rendered SVG replaces the raw source). */
  .markdown .mermaid { margin: 10px 0; overflow-x: auto; text-align: center; }
  .markdown .mermaid svg { max-width: 100%; height: auto; }
  .markdown .mermaid-error { border: 1px solid var(--p-error); border-radius: 8px; padding: 8px; background: rgba(236,19,19,0.05); }
  .markdown .mermaid-fallback { margin: 0; padding: 8px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; color: var(--p-text-secondary); text-align: left; background: transparent; }
  /* JSXGraph board containers (interactive boards replace the raw source). */
  .markdown .jsxgraph-box { width: 100%; min-height: 280px; }
  .markdown .jsxgraph-error { border: 1px solid var(--p-error); border-radius: 8px; padding: 8px; background: rgba(236,19,19,0.05); }
  .markdown .jsxgraph-fallback { margin: 0; padding: 8px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; color: var(--p-text-secondary); text-align: left; background: transparent; }
  .markdown .jsxgraph-fallback-error { margin: 0 0 6px; font-size: 12px; color: var(--p-error); word-break: break-word; }
  .diff { border-top: 1px solid var(--p-border-l2); }
  .diff-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; padding: 5px 10px; color: var(--p-text-secondary); background: var(--p-bg-layer-1); border-bottom: 1px solid var(--p-border-l2); }
  .diff-name { flex: none; }
  .diff-stat { flex: none; font-weight: 500; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--p-text-tertiary); }
  .diff-note { flex: none; font-weight: 400; color: var(--p-text-tertiary); }
  .diff-undo { appearance: none; margin-left: auto; font: inherit; font-size: 11px; font-weight: 500; background: transparent; border: 1px solid var(--p-border-l2); color: var(--p-text-secondary); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  .diff-undo:hover:not(:disabled) { color: var(--p-text); border-color: var(--p-text-tertiary); background: var(--p-hover); }
  .diff-undo:disabled { opacity: .6; cursor: default; }
  .diff-rows { max-height: 45vh; overflow: auto; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .diff-row { display: flex; align-items: flex-start; white-space: pre-wrap; word-break: break-word; }
  .diff-no { flex: none; width: 32px; padding-right: 6px; text-align: right; color: var(--p-text-tertiary); user-select: none; }
  .diff-sign { flex: none; width: 12px; color: var(--p-text-tertiary); user-select: none; }
  .diff-text { flex: 1 1 auto; min-width: 0; padding-right: 8px; }
  .diff-row.del { background: rgba(236,19,19,0.07); }
  .diff-row.del .diff-sign, .diff-row.del .diff-text { color: var(--p-error); }
  .diff-row.add { background: rgba(34,197,94,0.08); }
  .diff-row.add .diff-sign, .diff-row.add .diff-text { color: var(--p-success-fg); }
  .diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
  .toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--p-bg-layer-1); border: 1px solid var(--p-border-l2); color: var(--p-text); padding: 6px 14px; border-radius: 8px; font-size: 12px; opacity: 0; transition: opacity .18s; pointer-events: none; box-shadow: var(--p-shadow); z-index: 10; }
  .tabs { display: flex; align-items: stretch; height: var(--f-h-strip); border-bottom: 2px solid var(--p-bg); background: var(--p-bg-layer-1); flex: none; }
  .tab { flex: 1; border: none; background: var(--p-hover); color: var(--p-text-tertiary); font: inherit; font-size: 12px; cursor: pointer; border-right: 1px solid var(--p-border-l1); }
  .tab:last-child { border-right: none; }
  .tab:hover { background: var(--p-hover); }
  .tab.is-active { color: var(--p-text); background: transparent; }
  /* The 文件树 tab disappears when the shared「文件树」setting is off, the same
     way the in-app panel drops the tab. */
  .tab.is-hidden { display: none; }
  .tabs.is-hidden { display: none; }
  .list.is-hidden { display: none; }
  .tree { flex: 1; min-height: 0; display: none; flex-direction: column; }
  .tree.is-active { display: flex; }
  /* IDE-style explorer header: small uppercase section label + toolbar. */
  .tree-head { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 4px; height: var(--f-h-strip); padding: 0 4px 0 var(--f-pad-x); border-bottom: 1px solid var(--p-border-l2); }
  .tree-root { flex: 1 1 auto; min-width: 0; color: var(--p-text-tertiary); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tree-tools { flex: none; display: flex; align-items: center; gap: 2px; }
  .tree-tool, .tree-refresh { width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--p-text-tertiary); cursor: pointer; background: transparent; border: none; border-radius: 4px; padding: 0; }
  .tree-tool:hover, .tree-refresh:hover { background: var(--p-hover); color: var(--p-text); }
  .tree-tool.is-on { color: var(--p-text); background: var(--p-hover); }
  .tree-refresh.is-busy svg { animation: tree-spin .8s linear infinite; }
  /* Filter box: hidden until the magnifier in the header turns it on. */
  .tree-filter { display: none; box-sizing: border-box; flex: none; align-items: center; gap: 5px; height: 26px; padding: 0 var(--f-pad-x); color: var(--p-text-tertiary); background: var(--p-bg-layer-1); border-bottom: 1px solid var(--p-border-l2); }
  .tree-filter.is-open { display: flex; }
  .tree-filter-input { flex: 1 1 auto; min-width: 0; border: none; outline: none; background: transparent; color: var(--p-text); font: inherit; font-size: 12px; }
  .tree-filter-clear { width: 18px; height: 18px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 4px; background: transparent; color: var(--p-text-tertiary); cursor: pointer; }
  .tree-filter-clear:hover { background: var(--p-hover); color: var(--p-text); }
  .tree-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 2px 4px 8px; outline: none; }
  .tree-body:focus-visible { outline: 1px solid var(--p-accent); outline-offset: -1px; }
  .tree .empty { padding: 32px 20px; color: var(--p-text-tertiary); text-align: center; }
  .tree-note { padding: 4px var(--f-pad-x) 6px; font-size: 11px; color: var(--p-text-tertiary); }
  /* Rows: flat, 22px, square-ish selection (IDE explorer). */
  .tree-row { position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 4px; width: 100%; height: var(--f-h-tree-row); padding: 0 6px 0 4px; cursor: pointer; white-space: nowrap; color: var(--p-text); font-size: 13px; border-radius: 3px; --f-row-bg: var(--p-hover); }
  .tree-row:hover { background: var(--p-hover); }
  .tree-row.is-selected { background: var(--p-hover); }
  .tree-row.is-cursor { box-shadow: inset 0 0 0 1px var(--p-border-l2); }
  .tree-dir { font-weight: 400; }
  .tree-hidden { opacity: .45; }
  .tree-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tree-name.is-preview { font-style: italic; }
  .tree-guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--p-border-l1); pointer-events: none; }
  .tree-twisty { flex: none; width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; color: var(--p-text-tertiary); }
  .tree-twisty svg { transition: transform .1s ease; }
  .tree-twisty.is-open svg { transform: rotate(90deg); }
  .tree-twisty.is-file { visibility: hidden; }
  .tree-ico { flex: none; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
  /* Per-type icon colours (see fileIconKind in src/shared/ext.js). */
  .tree-ico-folder { color: #c99a4e; }
  .tree-ico-code { color: #4f9cf9; }
  .tree-ico-markup { color: #e07b39; }
  .tree-ico-style { color: #46b8c8; }
  .tree-ico-markdown { color: #6c9ef8; }
  .tree-ico-data { color: #d4a72c; }
  .tree-ico-image { color: #b180d7; }
  .tree-ico-pdf { color: #e05252; }
  .tree-ico-doc { color: #4f9cf9; }
  .tree-ico-media { color: #e879a8; }
  .tree-ico-shell { color: #6cbf58; }
  .tree-ico-text { color: var(--p-text-tertiary); }
  /* Change letters: A = created by the agent, M = edited. */
  .tree-status { flex: none; font-size: 11px; font-weight: 700; padding: 0 2px; }
  .tree-status-add { color: #3fb950; }
  .tree-status-mod { color: #d29922; }
  .tree-sub { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--p-text-tertiary); font-size: 11px; padding-left: 4px; }
  /* Floating action cluster: the filename keeps its full width on hover instead
     of being squeezed by the actions. */
  .tree-actions {
    position: absolute; top: 50%; right: 3px; transform: translateY(-50%);
    display: none; align-items: center; gap: 2px; padding-left: 14px;
    background: linear-gradient(90deg, transparent, var(--f-row-bg) 14px);
  }
  .tree-row:hover .tree-actions, .tree-row:focus-within .tree-actions, .tree-row.is-actions-open .tree-actions { display: inline-flex; }
  .tree-ref { height: 18px; border: 1px solid var(--p-border-l1); background: var(--p-bg-layer-1); color: var(--p-text-tertiary); font-size: 10.5px; font-weight: 600; cursor: pointer; border-radius: 999px; flex: none; align-items: center; padding: 0 7px; display: inline-flex; }
  .tree-ref:hover { background: var(--p-hover); color: var(--p-text); }
  /* Per-directory refresh: one level at a time, so a refresh never collapses
     the rest of the tree. Lives in the floating cluster, pinned while spinning. */
  .tree-act { width: 18px; height: 18px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; color: var(--p-text-tertiary); background: transparent; border: none; border-radius: 4px; cursor: pointer; }
  .tree-act:hover { background: var(--p-hover); color: var(--p-text); }
  .tree-act.is-busy { color: var(--p-text-secondary); cursor: progress; }
  .tree-act.is-busy svg { animation: tree-spin .8s linear infinite; }
  .tree-row.is-flashed { animation: tree-flash .9s ease; }
  /* Context menu. */
  .tree-menu { position: fixed; z-index: 20; min-width: 184px; padding: 4px; border: 1px solid var(--p-border-l2); border-radius: 6px; background: var(--p-bg-layer-1); box-shadow: var(--p-shadow); outline: none; }
  .tree-menu-item { display: block; width: 100%; text-align: left; padding: 5px 10px; border: none; border-radius: 4px; background: transparent; color: var(--p-text); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
  .tree-menu-item:hover, .tree-menu-item.is-active { background: var(--p-hover); }
  .tree-menu-item.is-danger { color: var(--p-error); }
  .tree-menu-item.is-danger:hover, .tree-menu-item.is-danger.is-active { background: rgba(236,19,19,0.12); }
  .tree-menu-sep { height: 1px; margin: 4px 6px; background: var(--p-border-l2); }
  @keyframes tree-spin { to { transform: rotate(360deg) } }
  @keyframes tree-flash { 0% { background: var(--p-hover) } 100% { background: transparent } }
  .tree-copied { font-size: 11px; color: var(--p-text-tertiary); flex: none; }
  /* Narrow column: the「@引用」pill collapses to a compact '@'. */
  @container (max-width: 260px) {
    .tree-ref-text { display: none; }
    .tree-ref { padding: 0 6px; }
  }
  .tree-loading { color: var(--p-text-tertiary); cursor: default; font-size: 12px; }
  .tree-error { color: var(--p-error); cursor: default; font-size: 12px; }
  /* Code preview (syntax-highlighted) */
  .codeview { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .codeview-head { flex: none; display: flex; align-items: center; gap: 8px; height: var(--f-h-strip); padding: 0 var(--f-pad-x); border-bottom: 1px solid var(--p-border-l2); }
  .codeview-lang { font-size: 11px; font-weight: 600; color: var(--p-text-secondary); padding: 1px 8px; border-radius: 4px; background: var(--p-hover); }
  .codeview-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--p-code-bg); }
  .codeview-gutter { flex: none; min-width: 3em; margin: 0; padding: 16px 10px 16px 12px; text-align: right; color: var(--p-text-caption); background: var(--p-code-bg); border-right: 1px solid var(--p-border-l1); position: sticky; left: 0; user-select: none; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .codeview-pre { flex: 1; margin: 0; padding: 16px; background: var(--p-code-bg); font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .codeview-pre code { font: inherit; }
  .tok-comment { color: #868e96; }
  .tok-string { color: #2f9e44; }
  .tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
  .tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
  .tok-function, .tok-decorator { color: #6741d9; }
  .tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
  .tok-property { color: #495057; }
  [data-ds-dark-theme] .tok-comment { color: #adb5bd; }
  [data-ds-dark-theme] .tok-string { color: #69db7c; }
  [data-ds-dark-theme] .tok-number, [data-ds-dark-theme] .tok-bool, [data-ds-dark-theme] .tok-variable, [data-ds-dark-theme] .tok-hex, [data-ds-dark-theme] .tok-attr { color: #ffa94d; }
  [data-ds-dark-theme] .tok-keyword, [data-ds-dark-theme] .tok-important, [data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
  [data-ds-dark-theme] .tok-function, [data-ds-dark-theme] .tok-decorator { color: #b197fc; }
  [data-ds-dark-theme] .tok-class, [data-ds-dark-theme] .tok-builtin, [data-ds-dark-theme] .tok-tag, [data-ds-dark-theme] .tok-key { color: #74c0fc; }
  [data-ds-dark-theme] .tok-property { color: #ced4da; }
  /* 编辑 (popout). The toolbar rides the preview's own bar, so the controls sit
     with the path they act on. CodeMirror paints its own colours (from
     EditorView.theme in src/shared/editor.js); what this stylesheet owns is the
     box — the mount needs a definite height inside a flex column, or the editor
     collapses to nothing. */
  .edittools { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
  .editbtn { appearance: none; font: inherit; font-size: 11px; font-weight: 500; line-height: 1.4; padding: 2px 8px; border-radius: 6px; cursor: pointer; border: 1px solid var(--p-border-l2); background: transparent; color: var(--p-text-secondary); }
  .editbtn:hover { color: var(--p-text); background: var(--p-hover); }
  .editbtn.is-on { color: var(--p-text); background: var(--p-hover); border-color: var(--p-text-tertiary); }
  .editbtn.is-primary { color: var(--p-accent); border-color: var(--p-accent); }
  .editbtn.is-armed { color: var(--p-error); border-color: var(--p-error); background: var(--p-hover); }
  .editstatus { font-size: 11px; color: var(--p-text-tertiary); max-width: 46ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .editstatus.is-bad { color: var(--p-error); }
  .editmount { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .editcm { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .editcm .cm-editor { height: 100%; }
  .editcm .cm-editor.cm-focused { outline: none; }
  .edithint { position: absolute; inset: auto 0 0 0; padding: 6px var(--f-pad-x); font-size: 11px; color: var(--p-text-tertiary); background: var(--p-bg); border-top: 1px solid var(--p-border-l2); }
@@office_css@@
</style>
</head>
<body>
  <header>
    <h1>弹出式侧边栏</h1>
    <span class="spacer"></span>
    <span class="status" id="status" role="status" aria-live="polite">连接中…</span>
  </header>
  <main id="main">
    <div class="preview" id="preview">
      <div class="bar" id="bar"><span class="path">选择一个文件预览</span></div>
      <div class="area" id="previewArea"><div class="hint">点击右侧的文件预览内容 →</div></div>
    </div>
    <div class="split" id="split" role="separator" aria-orientation="vertical" aria-label="调整预览区宽度" title="左右拖动调整 预览区 与 列表/文件树 的分界">
      <button class="split-btn" id="splitToggle" type="button" title="收起预览区（收到左侧）" aria-expanded="true"></button>
    </div>
    <div class="sidebar">
      <div class="tabs" id="tabs" role="tablist">
        <button class="tab is-active" data-view="artifacts" role="tab" aria-selected="true">产物</button>
        <button class="tab" data-view="tree" role="tab" aria-selected="false">文件树</button>
      </div>
      <div class="list" id="list"></div>
      <div class="tree" id="tree">
        <div class="tree-head">
          <span class="tree-root" id="treeRoot">…</span>
          <span class="tree-tools">
            <button class="tree-tool" id="treeFilter" type="button"></button>
            <button class="tree-tool" id="treeExpandAll" type="button"></button>
            <button class="tree-tool" id="treeCollapseAll" type="button"></button>
            <button class="tree-refresh" id="treeRefresh" title="刷新" type="button"></button>
          </span>
        </div>
        <div class="tree-filter" id="treeFilterBar">
          <span class="tree-filter-ico" id="treeFilterIcon"></span>
          <input class="tree-filter-input" id="treeFilterInput" type="text" placeholder="按文件名过滤…" aria-label="按文件名过滤" />
          <button class="tree-filter-clear" id="treeFilterClear" type="button"></button>
        </div>
        <div class="tree-body" id="treeBody"></div>
      </div>
    </div>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script>
@@bridge@@
@@settings@@
@@format@@
@@paths@@
@@linediff@@
@@highlight@@
    var DATA_URL = '/dsh-sidebar-frog/data';
    var CONTENT_URL = '/dsh-sidebar-frog/content';
    var MEDIA_URL = '/dsh-sidebar-frog/media';
    var LISTDIR_URL = '/dsh-sidebar-frog/listdir';
    var DELETE_URL = '/dsh-sidebar-frog/delete';
    var _sm = /[?&]sessionId=([^&]+)/.exec(location.search);
    // A malformed percent-escape must never throw here: this runs at the top
    // level of the inline script, so one bad query string would kill the page.
    var _urlSessionId = '';
    if (_sm) {
      try { _urlSessionId = decodeURIComponent(_sm[1]); } catch (e) { _urlSessionId = ''; }
    }
    var SESSION_KEY = BRIDGE.session;
    // Feature settings are owned by the sidebar's settings section; this tab
    // reads the same localStorage entry so both halves behave the same way
    // (polling, the 文件树 tab, the default divider position).
    var SETTINGS = readBridgeSettings();
    function readBridgeSettings() {
      try { return parseSettings(localStorage.getItem(BRIDGE.settings)); } catch (e) { return parseSettings(null); }
    }
    function currentSessionId() {
      try {
        var v = localStorage.getItem(SESSION_KEY);
        if (v) return v;
      } catch (e) {}
      return _urlSessionId;
    }
    function listdirUrl(path) {
      var q = [];
      var sid = currentSessionId();
      if (sid) q.push('sessionId=' + encodeURIComponent(sid));
      if (path) q.push('path=' + encodeURIComponent(path));
      return LISTDIR_URL + (q.length ? '?' + q.join('&') : '');
    }
    var items = [];
    var selectedPath = null;
    var treeRoot = null;
    var treeChildren = {};
    var treeExpanded = {};
    var treeBusy = {};
    var treeFlash = null;
    var treeFlashTimer = null;
    var treeCursor = null;      // keyboard cursor (row path)
    var treeQuery = '';         // filter box contents
    var treeSearch = null;      // { loading, results, local }
    var treeSearchTimer = null;
    var treeMenuEl = null;      // open context menu
    var treeMenuEntry = null;
    var treeMenuIndex = 0;
    var treeTypeBuf = '';
    var treeTypeAt = 0;
    var treeRestoredFor = '';   // workspace root whose expansion was restored
    var expandIntent = false;   // an expand-all is still filling in levels
    var treeExpandIdle = 0;     // consecutive expand-all passes that added nothing
    var pinnedPath = null;      // pinned preview (vs the italic preview state)
    var currentView = 'artifacts';
    var treeMenuList = [];      // context-menu items incl. separators (DOM order)
    var treeMenuNav = [];       // indices into treeMenuList that can be run
    var treeMenuBtns = [];      // per raw item index: its node (null for a separator)
    var treePersistTimer = null;
    var _previewSeq = 0;        // guards a stale preview response
    var _previewAbort = null;   // AbortController of the preview read in flight
    var _previewOffice = null;  // live Office widget (canvas / worker / URLs to release)
    var _loadInFlight = false;  // one artifact poll at a time
    var _treeRootSeq = 0;       // guards a stale (retried) root read

@@ext@@
@@office@@
@@table@@

    var FOLDER_CLOSE_D = 'M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z';
    var FOLDER_OPEN_D1 = 'M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z';
    var FOLDER_OPEN_D2 = 'M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z';
    var CODE_D = 'M12.3368 1.53569L11.931 4.43172H14.8086V5.79673H11.7404L11.1962 9.67859H14.2839V11.0436H11.0056L10.4994 14.6529L9.14873 14.4643L9.62731 11.0436H5.75876L5.25252 14.6529L3.90186 14.4643L4.38043 11.0436H1.69141V9.67859H4.57104L5.11417 5.79673H2.21609V4.43172H5.30581L5.73724 1.34713L7.08995 1.53569L6.68414 4.43172H10.5527L10.9841 1.34713L12.3368 1.53569ZM5.94937 9.67859H9.81791L10.361 5.79673H6.49353L5.94937 9.67859Z';
    var REFRESH_D = 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z';

    function svgIcon(paths, size) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || 14);
      svg.setAttribute('height', size || 14);
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('fill', 'none');
      (paths || []).forEach(function (spec) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', spec.d);
        if (spec.transform) p.setAttribute('transform', spec.transform);
        if (spec.opacity) p.setAttribute('opacity', spec.opacity);
        if (spec.fillRule) p.setAttribute('fill-rule', spec.fillRule);
        if (spec.clipRule) p.setAttribute('clip-rule', spec.clipRule);
        p.setAttribute('fill', 'currentColor');
        svg.appendChild(p);
      });
      return svg;
    }
    function folderClosedIcon() { return svgIcon([{ d: FOLDER_CLOSE_D, transform: 'translate(1.5 2.429)' }]); }
    function folderOpenIcon() { return svgIcon([{ d: FOLDER_OPEN_D1 }, { d: FOLDER_OPEN_D2, opacity: '0.2' }]); }
    function fileCodeIcon() { return svgIcon([{ d: CODE_D, fillRule: 'evenodd', clipRule: 'evenodd' }]); }
    function refreshIcon(size) { return svgIcon([{ d: REFRESH_D }], size); }
    // Rounded stroked chevron (down); the splitter handle rotates it via CSS.
    var CHEVRON_D = 'M1.6 3.6 L5 7 L8.4 3.6';
    function chevronIcon(size) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || 10);
      svg.setAttribute('height', size || 10);
      svg.setAttribute('viewBox', '0 0 10 10');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('aria-hidden', 'true');
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', CHEVRON_D);
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.5');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
      return svg;
    }

    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      return n;
    }
    // Split on both separators: the host reports Windows paths with "\".
    function basename(p) {
      var parts = String(p).split(/[/\\]/);
      return parts[parts.length - 1] || p;
    }
    // The popout page marks dark mode on <html>; the in-app shell marks <body>.
    function isDarkTheme() {
      var d = document.documentElement;
      if (d && d.hasAttribute && d.hasAttribute('data-ds-dark-theme')) return true;
      var b = document.body;
      if (b && b.hasAttribute && b.hasAttribute('data-ds-dark-theme')) return true;
      return false;
    }
    function timeAgo(ts) {
      return relativeTime(ts);
    }
    function toast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.style.opacity = '1';
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.style.opacity = '0'; }, 1600);
    }
    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    function copyText(text, msg) {
      var done = function () { toast(msg); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    }

    // ── @reference: hand it to the main window, else copy it ──────────────
    // This tab has no composer; the main window does. It is one origin away, so
    // a localStorage write here arrives there as a "storage" event and it writes
    // the reference into the composer the same way its own「@」button does, then
    // answers with an ack. No main window (closed tab, different browser
    // profile, storage disabled) means no ack, and the reference goes to the
    // clipboard instead — that used to be the only behaviour; now it is the
    // fallback, so the menu label can promise what actually happens.
    function quoteRef(path) {
      var nonce = bridgeNonce();
      var settled = false;
      var finish = function (inserted) {
        if (settled) return;
        settled = true;
        window.removeEventListener('storage', onAck);
        if (inserted) toast('已插入主窗口输入框');
        else copyText('@' + path, '主窗口未响应，已复制 @引用');
      };
      var onAck = function (e) {
        if (!e || e.key !== BRIDGE.ack || !e.newValue) return;
        var ack = bridgeDecodeAck(e.newValue);
        // Ignore an ack for a different request: two popout tabs can quote at
        // the same time and each must settle on its own answer.
        if (!ack || ack.nonce !== nonce) return;
        finish(ack.ok === true);
      };
      window.addEventListener('storage', onAck);
      var wrote = true;
      try { localStorage.setItem(BRIDGE.quote, bridgeEncodeQuote(path, nonce, Date.now())); }
      catch (e) { wrote = false; }
      if (!wrote) { finish(false); return; }
      setTimeout(function () { finish(false); }, BRIDGE_ACK_TIMEOUT_MS);
    }
@@markdown@@
@@skins@@
@@editor@@

    // Change review in the popout tab: the same line-per-row diff the sidebar
    // paints, from the same shared module, plus the same 撤销 action — this page
    // is a first-class surface, not a viewer, and the routes it calls are the
    // ones the sidebar calls.
    function diffNode(d, entry) {
      var wrap = el('div', 'diff');
      var stats = diffLines(d && d.before, d && d.after);
      var counts = diffStats(stats.rows);
      var title = el('div', 'diff-title');
      title.appendChild(el('span', 'diff-name', '编辑差异'));
      title.appendChild(el('span', 'diff-stat', '+' + counts.add + '  −' + counts.del));
      if (d && d.truncated) title.appendChild(el('span', 'diff-note', '（已截断）'));
      var undo = (entry || entryOf(selectedPath) || {}).undo;
      if (undo && undo.can) {
        var btn = el('button', 'diff-undo', '撤销');
        btn.type = 'button';
        btn.title = '把这次改动还原成改动前的内容';
        btn.addEventListener('click', function () { revertNow(entry, btn); });
        title.appendChild(btn);
      } else if (undo && undo.reason) {
        title.appendChild(el('span', 'diff-note', '不可撤销'));
        title.title = undo.reason;
      }
      wrap.appendChild(title);
      var rows = el('div', 'diff-rows');
      if (!stats.rows.length) rows.appendChild(el('div', 'diff-row ctx', '（内容相同）'));
      for (var i = 0; i < stats.rows.length; i += 1) {
        var row = stats.rows[i];
        var cls = row.t === 'add' ? 'add' : row.t === 'del' ? 'del' : 'ctx';
        var line = el('div', 'diff-row ' + cls);
        line.appendChild(el('span', 'diff-no', row.oldNo == null ? '' : String(row.oldNo)));
        line.appendChild(el('span', 'diff-no', row.newNo == null ? '' : String(row.newNo)));
        line.appendChild(el('span', 'diff-sign', row.t === 'add' ? '+' : row.t === 'del' ? '-' : ' '));
        line.appendChild(el('span', 'diff-text', row.text === '' ? ' ' : row.text));
        rows.appendChild(line);
      }
      wrap.appendChild(rows);
      return wrap;
    }

    // 撤销 from the popout tab: same route, same semantics as the sidebar. A
    // refusal (the file moved on, no snapshot) is shown verbatim — the user has
    // to know the undo did NOT happen.
    function revertNow(entry, btn) {
      entry = entry || entryOf(selectedPath);
      if (!entry || !entry.path) return;
      btn.disabled = true;
      btn.textContent = '撤销中…';
      fetch('/dsh-sidebar-frog/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, opId: entry.undo && entry.undo.opId ? entry.undo.opId : '' }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        btn.disabled = false;
        btn.textContent = '撤销';
        if (res && res.ok) {
          toast('已撤销这次改动');
          // The ledger row's diff and undo state describe the PRE-undo file:
          // reload it, then repaint the preview from the fresh row.
          load();
          var cur = entryOf(entry.path);
          if (cur) openPath(cur.path, cur.diff, true);
        } else {
          toast((res && res.error) || '撤销失败');
        }
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = '撤销';
        toast('撤销失败');
      });
    }

    // The ledger row for a path, for the diff's undo affordance.
    function entryOf(path) {
      for (var i = 0; i < items.length; i += 1) if (items[i].path === path) return items[i];
      return null;
    }
    // Delete a file or folder from DISK (the tree's 删除). The host fences the
    // path to the session's workspace and answers a REASON on refusal — a path
    // outside the workspace, the workspace root, a locked file — which the toast
    // shows, because a deletion that silently does nothing is the worst outcome.
    function deletePathNow(entry) {
      entry = entry || entryOf(treeCursor || selectedPath);
      if (!entry || !entry.path) return;
      var isDir = !!entry.isDir;
      var name = entry.name || entry.path;
      var msg = isDir
        ? '删除文件夹「' + name + '」及其中的全部内容？此操作无法恢复。'
        : '删除文件「' + name + '」？此操作无法恢复。';
      if (!window.confirm(msg)) return;
      fetch(DELETE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, sessionId: currentSessionId() }),
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.ok) {
          toast(isDir ? '已删除文件夹 ' + name : '已删除 ' + name);
          // The preview may be showing the very file just deleted: clear it and
          // re-read the level that listed the entry so the row disappears.
          selectedPath = null;
          var parent = parentDirOf(entry.path);
          // A top-level entry is listed by treeRoot.entries, not treeChildren:
          // its "parent" is the workspace root itself, so what is stale is the
          // ROOT — refreshTreeDir(root) would only write a treeChildren['<root>']
          // key the renderer never reads, leaving the deleted row on screen.
          if (parent && relTreePath(parent) !== '') refreshTreeDir(parent); else loadTreeRoot(false);
        } else {
          toast((res && res.error) || '删除失败');
        }
      }).catch(function () {
        toast('删除失败');
      });
    }
    // The directory a tree entry lives in, spelled the way the host spells it.
    // Empty for a top-level entry, whose level is the workspace root.
    function parentDirOf(path) {
      var text = String(path || '');
      var at = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
      if (at <= 0) return '';
      return text.slice(0, at);
    }
    function errNode(msg) {
      return el('div', 'err', msg || '读取失败');
    }
    // The note a cut read must always carry — for Markdown too, which is the bug
    // this exists for: the whole document was sliced at character 200000 and the
    // page simply ended, with nothing on screen to tell a reader whether the book
    // was that short or the preview had stopped.
    //
    // The host's own count of the COMPLETE file rides along as data.chars (see
    // src/host/core.js), so the note reports how much is missing instead of only
    // that something is.
    function truncatedNote(data) {
      var shown = data && typeof data.content === 'string' ? data.content.length : 0;
      var total = data && typeof data.chars === 'number' ? data.chars : 0;
      return el('div', 'diff-label', '(truncated preview)' + (total > 0 ? ' — ' + shown + ' / ' + total + ' characters shown' : ''));
    }
    // Typeset any $...$ / $$...$$ math that mdToHtml left verbatim in the node.
    // MathJax loads lazily via the deferred <script> in <head>, so retry briefly
    // while it is still booting; give up silently if it never arrives.
    function typesetMath(node, tries) {
      if (!node) return;
      tries = tries || 0;
      var mj = window.MathJax;
      if (mj && typeof mj.typesetPromise === 'function') {
        try { mj.typesetPromise([node]).catch(function () {}); } catch (e) {}
        return;
      }
      if (mj && mj.startup && mj.startup.promise) {
        mj.startup.promise.then(function () {
          if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            try { window.MathJax.typesetPromise([node]).catch(function () {}); } catch (e) {}
          }
        });
        return;
      }
      if (tries < 40 && node.isConnected !== false) {
        setTimeout(function () { typesetMath(node, tries + 1); }, 150);
      }
    }
    // Render any .mermaid blocks under root with Mermaid (lazily loaded from
    // the host-served vendored copy). Unparseable diagrams keep their raw
    // source visible instead of disappearing; guards on isConnected keep a
    // stale async pass from overwriting a newer preview.
    var _mermaidSeq = 0;
    var _mermaidPromise = null;
    function loadMermaid() {
      var mm = window.mermaid;
      if (mm && typeof mm.render === 'function') return Promise.resolve(mm);
      if (_mermaidPromise) return _mermaidPromise;
      _mermaidPromise = new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = '/dsh-sidebar-frog/mermaid/mermaid.min.js';
        s.async = true;
        s.onload = function () { resolve(window.mermaid && typeof window.mermaid.render === 'function' ? window.mermaid : null); };
        s.onerror = function () { _mermaidPromise = null; resolve(null); };
        document.head.appendChild(s);
      });
      return _mermaidPromise;
    }
    function typesetMermaid(root) {
      if (!root || !root.querySelectorAll) return;
      var nodes = root.querySelectorAll('.mermaid');
      if (!nodes || !nodes.length) return;
      var targets = [];
      for (var i = 0; i < nodes.length; i += 1) targets.push(nodes[i]);
      loadMermaid().then(function (mm) {
        if (!mm) return;
        try {
          mm.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            theme: isDarkTheme() ? 'dark' : 'default'
          });
        } catch (e) {}
        targets.forEach(function (el) {
          if (!el || !el.isConnected || el.getAttribute('data-processed')) return;
          var src = (el.textContent || '').replace(/^\s+|\s+$/g, '');
          if (!src) return;
          _mermaidSeq += 1;
          mm.render('dshfrog-mm-' + _mermaidSeq + '-' + Date.now(), src).then(function (res) {
            if (!el.isConnected) return;
            el.innerHTML = res && res.svg ? res.svg : '';
            el.setAttribute('data-processed', 'true');
          }).catch(function () {
            if (!el.isConnected) return;
            el.classList.add('mermaid-error');
            el.textContent = '';
            var pre = document.createElement('pre');
            pre.className = 'mermaid-fallback';
            pre.textContent = src;
            el.appendChild(pre);
            el.setAttribute('data-processed', 'true');
          });
        });
      });
    }
    // Run any .jsxgraph blocks under root with JSXGraph (lazily loaded from the
    // host-served vendored copy: stylesheet + core). The block's script runs
    // with the generated container id, the container element and the library in
    // scope; BOARDID aliases id — the convention used by the Orange courseware
    // and the VS Code jsxgraph plugin (JXG.JSXGraph.initBoard(BOARDID, {...})),
    // which keeps those dual-environment snippets rendering unchanged.
    // Failures keep the raw source visible plus the error message. Guards on
    // isConnected keep stale passes from clobbering a newer preview.
    var _jsxgraphSeq = 0;
    var _jsxgraphPromise = null;
    function loadJSXGraph() {
      var jxg = window.JXG;
      if (jxg && jxg.JSXGraph) return Promise.resolve(jxg);
      if (_jsxgraphPromise) return _jsxgraphPromise;
      _jsxgraphPromise = new Promise(function (resolve) {
        var cssId = 'dsh-sidebar-frog-jsxgraph-css';
        if (!document.getElementById(cssId)) {
          var link = document.createElement('link');
          link.id = cssId;
          link.rel = 'stylesheet';
          link.href = '/dsh-sidebar-frog/jsxgraph/jsxgraph.css';
          document.head.appendChild(link);
        }
        var s = document.createElement('script');
        s.src = '/dsh-sidebar-frog/jsxgraph/jsxgraphcore.js';
        s.async = true;
        s.onload = function () { resolve(window.JXG && window.JXG.JSXGraph ? window.JXG : null); };
        s.onerror = function () { _jsxgraphPromise = null; resolve(null); };
        document.head.appendChild(s);
      });
      return _jsxgraphPromise;
    }
    function jsxgraphFallback(el, src, err) {
      el.classList.add('jsxgraph-error');
      el.textContent = '';
      if (err) {
        var msg = document.createElement('div');
        msg.className = 'jsxgraph-fallback-error';
        msg.textContent = 'JSXGraph 渲染失败: ' + (err && err.message ? err.message : String(err));
        el.appendChild(msg);
      }
      var pre = document.createElement('pre');
      pre.className = 'jsxgraph-fallback';
      pre.textContent = src;
      el.appendChild(pre);
      el.setAttribute('data-processed', 'true');
    }
    function typesetJSXGraph(root) {
      if (!root || !root.querySelectorAll) return;
      var nodes = root.querySelectorAll('.jsxgraph');
      if (!nodes || !nodes.length) return;
      var targets = [];
      for (var i = 0; i < nodes.length; i += 1) targets.push(nodes[i]);
      loadJSXGraph().then(function (JXG) {
        targets.forEach(function (el) {
          if (!el || !el.isConnected || el.getAttribute('data-processed')) return;
          var src = (el.textContent || '').replace(/^\s+|\s+$/g, '');
          if (!src) { el.setAttribute('data-processed', 'true'); return; }
          if (!JXG) { jsxgraphFallback(el, src); return; }
          _jsxgraphSeq += 1;
          var id = 'dshfrog-jxg-' + _jsxgraphSeq + '-' + Date.now();
          var box = document.createElement('div');
          box.id = id;
          box.className = 'jsxgraph-box';
          el.textContent = '';
          el.appendChild(box);
          try {
            var fn = new Function('JXG', 'id', 'BOARDID', 'container', src);
            fn(JXG, id, id, box);
            el.setAttribute('data-processed', 'true');
          } catch (e) {
            try { if (box.parentNode) box.parentNode.removeChild(box); } catch (e2) {}
            jsxgraphFallback(el, src, e);
          }
        });
      });
    }
    function render() {
      var list = document.getElementById('list');
      list.textContent = '';
      if (!items.length) {
        list.appendChild(el('div', 'empty', '暂无产物 — 代理创建/编辑的文件会出现在这里。'));
        return;
      }
      items.forEach(function (it) {
        var item = el('div', 'item');
        if (it.path === selectedPath) item.className += ' active';
        var main = el('button', 'item-main');
        var row = el('div', 'row');
        var badge = el('span', 'badge ' + (it.kind === 'create' ? 'create' : 'edit'), it.kind === 'create' ? '新建' : '编辑');
        var base = el('span', 'base' + (it.path === selectedPath && pinnedPath !== it.path ? ' is-preview' : ''), basename(it.path));
        var time = el('span', 'time', timeAgo(it.at));
        row.appendChild(badge);
        row.appendChild(base);
        row.appendChild(time);
        var full = el('div', 'full', it.path);
        main.appendChild(row);
        main.appendChild(full);
        main.addEventListener('click', function () { select(it, false); });
        main.addEventListener('dblclick', function () { select(it, true); });
        item.appendChild(main);
        var actions = el('div', 'actions');
        var cp = el('button', 'mini-btn', '⧉');
        cp.title = '复制路径';
        cp.addEventListener('click', function (ev) { ev.stopPropagation(); copyText(it.path, '已复制路径'); });
        var qt = el('button', 'mini-btn', '@');
        qt.title = '@引用到主窗口输入框（主窗口不在时复制）';
        qt.addEventListener('click', function (ev) { ev.stopPropagation(); quoteRef(it.path); });
        actions.appendChild(cp);
        actions.appendChild(qt);
        item.appendChild(actions);
        list.appendChild(item);
      });
    }
    // The plain code view: line numbers plus highlighted source. Extracted so the
    // binary-document card's「以纯文本查看」can reach the same view instead of a
    // second, subtly different one.
    function codeViewNode(path, text) {
      var ext = fileExt(path);
      var codeView = el('div', 'codeview');
      var head = el('div', 'codeview-head');
      head.appendChild(el('span', 'codeview-lang', hlLangLabel(ext)));
      codeView.appendChild(head);
      var scroll = el('div', 'codeview-scroll');
      var gutter = el('pre', 'codeview-gutter');
      gutter.setAttribute('aria-hidden', 'true');
      var lineCount = String(text == null ? '' : text).split('\n').length;
      var gutterText = '';
      for (var gi = 0; gi < lineCount; gi += 1) gutterText += (gi + 1) + (gi < lineCount - 1 ? '\n' : '');
      gutter.textContent = gutterText;
      var pre = el('pre', 'codeview-pre');
      var code = el('code');
      code.innerHTML = highlightCode(String(text == null ? '' : text), ext);
      pre.appendChild(code);
      scroll.appendChild(gutter);
      scroll.appendChild(pre);
      codeView.appendChild(scroll);
      return codeView;
    }

    // The delimited-text table. The parser is the shared one (src/shared/table.js)
    // — the same module the sidebar's React table uses — so a quoted field with a
    // newline in it cannot mean two different things in the two windows.
    // Clicking a header sorts; a third click restores the file's own order.
    function tableNode(path, content) {
      var parsed = tableParse(content);
      var wrap = el('div', 'tableview');
      var state = { col: -1, dir: 0 };   // 0 = file order, 1 = asc, -1 = desc
      var scroll = el('div', 'tablescroll');
      var status = el('div', 'tablestatus');
      var table = el('table', 'datatable');
      function paint() {
        var rows = state.col < 0 ? parsed.rows : tableSortRows(parsed.rows, state.col, state.dir > 0 ? 'asc' : 'desc');
        var shown = rows.length > 500 ? rows.slice(0, 500) : rows;
        table.textContent = '';
        var thead = el('thead');
        var hrow = el('tr', 'tableheadrow');
        parsed.header.forEach(function (name, i) {
          var th = el('th', 'tableth' + (state.col === i ? ' is-sorted' : ''));
          th.setAttribute('scope', 'col');
          th.setAttribute('aria-sort', state.col === i ? (state.dir > 0 ? 'ascending' : 'descending') : 'none');
          var btn = el('button', 'tablesortbtn');
          btn.type = 'button';
          btn.title = '按此列排序（第三次点击恢复文件原有顺序）';
          btn.appendChild(el('span', 'tableheadtext', name || ('列 ' + (i + 1))));
          btn.appendChild(el('span', 'tablearrow', state.col === i ? (state.dir > 0 ? '▲' : '▼') : ''));
          btn.addEventListener('click', function () {
            if (state.col !== i) { state.col = i; state.dir = 1 }
            else if (state.dir > 0) { state.dir = -1 }
            else { state.col = -1; state.dir = 0 }
            paint();
          });
          th.appendChild(btn);
          hrow.appendChild(th);
        });
        thead.appendChild(hrow);
        table.appendChild(thead);
        var tbody = el('tbody');
        shown.forEach(function (row) {
          var tr = el('tr', 'tablerow');
          for (var c = 0; c < parsed.columns; c += 1) {
            var value = row[c] == null ? '' : row[c];
            var td = el('td', 'tabletd' + (c === 0 ? ' is-first' : '') + (tableCellNumber(value) != null ? ' is-number' : ''));
            var shownText = tableFormatCell(value, 400);
            if (String(value).length > 60) td.title = String(value);
            if (shownText === '') td.appendChild(el('span', 'tableempty', '·'));
            else td.textContent = shownText;
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        var bits = [parsed.total + ' 行 × ' + parsed.columns + ' 列', '分隔符：' + tableDelimiterLabel(parsed.delimiter)];
        if (rows.length > 500) bits.push('仅显示前 500 行');
        status.textContent = bits.join(' · ');
      }
      paint();
      scroll.appendChild(table);
      wrap.appendChild(status);
      wrap.appendChild(scroll);
      return wrap;
    }

    // A binary container (.docx / .xlsx / …): not text, so not decoded. The card
    // says why, and「以纯文本查看」asks the host for the bytes as text explicitly
    // (the text=1 query — see BINARY_TYPES in src/host/core.js).
    function documentCardNode(path, seq) {
      var card = el('div', 'doccard');
      var ext = (fileExt(path) || '').toUpperCase();
      card.appendChild(el('div', 'doctitle', (ext ? ext + ' · ' : '') + '二进制文档'));
      card.appendChild(el('p', 'doctext', '这类文件是压缩包 / 二进制容器，按文本解码只会得到乱码，所以这里不解析它。'));
      var actions = el('div', 'docactions');
      var textBtn = el('button', 'docbtn', '以纯文本查看');
      textBtn.type = 'button';
      textBtn.addEventListener('click', function () {
        textBtn.disabled = true;
        textBtn.textContent = '读取中…';
        fetch(CONTENT_URL + '?path=' + encodeURIComponent(path) + '&text=1').then(function (r) {
          if (r.status === 401 || r.status === 403) throw new Error('未通过会话认证（401）：请刷新页面重新登录后再试');
          return r.json();
        }).then(function (data) {
          if (seq !== _previewSeq) return;
          textBtn.disabled = false;
          textBtn.textContent = '以纯文本查看';
          if (!data || data.ok !== true) { card.appendChild(errNode(data && data.error)); return; }
          var area = document.getElementById('previewArea');
          if (!area || !card.parentNode) return;
          area.replaceChild(codeViewNode(path, data.content), card);
        }).catch(function (e) {
          textBtn.disabled = false;
          textBtn.textContent = '以纯文本查看';
          card.appendChild(errNode(String(e && e.message ? e.message : e)));
        });
      });
      actions.appendChild(textBtn);
      card.appendChild(actions);
      return card;
    }
    // ── 编辑 (popout) ────────────────────────────────────────────────────────
    // The popout tab edits too. This page is a first-class surface here (it calls
    // the same /revert the sidebar does), and the editor is the SAME CodeMirror
    // mount from src/shared/editor.js — so Ctrl+S, the dirty marker and the save
    // route cannot drift between the two windows.
    //
    // What the host does with a save is the interesting half: it fences the path
    // to the workspace, restores the file's own line endings and BOM, and guards
    // the write with the revision the editor was opened on. A refusal comes back
    // as JSON with a reason and is ALWAYS shown — a save that silently did
    // nothing is the one outcome this pane must not have.
    var SAVE_URL = '/dsh-sidebar-frog/save';
    var EDITABLE = { markdown: 1, text: 1, table: 1 };
    var drafts = {};          // path -> { text, dirty, version, size }
    var editorCtl = null;     // the live CodeMirror controller
    var editorPath = '';      // the file that controller holds
    var editorMode = false;   // 编辑 on for editorModePath
    var editorModePath = '';
    var editorStatusEl = null;
    var saveBtnEl = null;
    var forceArmed = false;

    function flushDraft() {
      if (!editorCtl || !editorPath) return;
      var d = drafts[editorPath];
      if (d && d.dirty) d.text = editorCtl.getValue();
    }

    // Tear the editor down (keeping its text) — called before any repaint and
    // before a file switch. editorCtl is cleared FIRST so a late async mount
    // cannot resurrect an editor for a file the page has left.
    function destroyEditor() {
      flushDraft();
      var gone = editorCtl;
      editorCtl = null;
      editorPath = '';
      if (gone) { try { gone.destroy(); } catch (e) {} }
    }

    function setEditorStatus(text, bad) {
      if (!editorStatusEl) return;
      editorStatusEl.textContent = text || '';
      editorStatusEl.className = 'editstatus' + (bad ? ' is-bad' : '');
    }

    function saveFromEditor(force) {
      if (!editorCtl || !editorPath) return;
      var path = editorPath;
      var d = drafts[path] || {};
      setEditorStatus('保存中…', false);
      fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: path,
          content: editorCtl.getValue(),
          sessionId: currentSessionId(),
          baseVersion: d.version || undefined,
          baseSize: typeof d.size === 'number' ? d.size : undefined,
          force: !!force,
        }),
      }).then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('未通过会话认证（401）：请刷新页面重新登录后再试');
        return r.json();
      }).then(function (res) {
        forceArmed = false;
        if (saveBtnEl) { saveBtnEl.textContent = '保存'; saveBtnEl.classList.remove('is-armed'); }
        if (res && res.ok) {
          if (editorCtl) editorCtl.markClean();
          d.dirty = false;
          d.version = res.version || null;
          d.size = typeof res.size === 'number' ? res.size : null;
          drafts[path] = d;
          setEditorStatus('已保存 · ' + (res.eol === 'CRLF' ? 'CRLF' : 'LF') + (res.bom ? ' · BOM' : ''), false);
          // The ledger's row (its diff and its 撤销) now describes the revision
          // before this save, so it has to be re-read — the same reason 撤销
          // reloads it.
          load();
        } else if (res && res.stale) {
          // Arm 覆盖 on the very button that was just clicked: the next click
          // overwrites, and anything else (a reload, a successful save) disarms
          // it. Without this the 「仍然保存」 the message offers would not exist.
          forceArmed = true;
          if (saveBtnEl) { saveBtnEl.textContent = '仍然保存'; saveBtnEl.classList.add('is-armed'); }
          setEditorStatus((res.error || '文件已被改动') + '：再点一次「仍然保存」覆盖，或「重新载入」取磁盘版本', true);
        } else {
          setEditorStatus((res && res.error) || '保存失败', true);
        }
      }).catch(function (e) {
        setEditorStatus(String(e && e.message ? e.message : e), true);
      });
    }

    // Re-read the file into the editor, throwing the local text away. Two-step,
    // because it is the one control here that destroys work.
    function reloadEditorFromDisk() {
      var path = editorPath;
      if (!path) return;
      setEditorStatus('重新载入中…', false);
      fetch(CONTENT_URL + '?path=' + encodeURIComponent(path)).then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('未通过会话认证（401）：请刷新页面重新登录后再试');
        return r.json();
      }).then(function (data) {
        if (!data || data.ok !== true) { setEditorStatus((data && data.error) || '重新载入失败', true); return; }
        if (!editorCtl || editorPath !== path) return;
        var ctl = editorCtl;
        var view = ctl.view;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(data.content == null ? '' : data.content) } });
        ctl.markClean();
        drafts[path] = { text: String(data.content == null ? '' : data.content), dirty: false, version: data.version || null, size: typeof data.size === 'number' ? data.size : null };
        forceArmed = false;
        if (saveBtnEl) { saveBtnEl.textContent = '保存'; saveBtnEl.classList.remove('is-armed'); }
        setEditorStatus('已载入磁盘上的版本', false);
      }).catch(function (e) {
        setEditorStatus(String(e && e.message ? e.message : e), true);
      });
    }

    // The 编辑 controls, appended to the preview's own bar so there is one
    // header rather than two stacked strips.
    function editTools(path, data, diff, pinned) {
      var wrap = el('span', 'edittools');
      var mode = el('button', 'editbtn' + (editorMode ? ' is-on' : ''), editorMode ? '预览' : '编辑');
      mode.type = 'button';
      mode.title = editorMode ? '回到只读预览' : '用 CodeMirror 编辑这个文件（Ctrl+S 保存）';
      mode.addEventListener('click', function () {
        if (editorMode) {
          flushDraft();
          editorMode = false;
          destroyEditor();
        } else {
          editorMode = true;
          editorModePath = path;
          forceArmed = false;
        }
        openPath(path, diff, pinned, true);
      });
      wrap.appendChild(mode);
      if (editorMode) {
        var reloadBtn = el('button', 'editbtn', '重新载入');
        reloadBtn.type = 'button';
        reloadBtn.title = '丢弃你的修改，重新读取磁盘上的文件';
        reloadBtn.addEventListener('click', function () {
          if (reloadBtn.classList.contains('is-armed')) { reloadBtn.classList.remove('is-armed'); reloadBtn.textContent = '重新载入'; reloadEditorFromDisk(); return; }
          reloadBtn.classList.add('is-armed');
          reloadBtn.textContent = '确认丢弃';
        });
        var saveBtn = el('button', 'editbtn is-primary', '保存');
        saveBtn.type = 'button';
        saveBtn.title = '保存（Ctrl+S）';
        saveBtn.addEventListener('click', function () {
          // The first click after a stale refusal arms 覆盖: overwriting what
          // somebody else wrote has to be a decision, not a reflex.
          if (forceArmed) { saveFromEditor(true); return; }
          saveFromEditor(false);
        });
        saveBtnEl = saveBtn;
        editorStatusEl = el('span', 'editstatus', drafts[path] && drafts[path].dirty ? '未保存' : '');
        wrap.appendChild(editorStatusEl);
        wrap.appendChild(reloadBtn);
        wrap.appendChild(saveBtn);
      } else {
        saveBtnEl = null;
        editorStatusEl = null;
      }
      return wrap;
    }

    // Mount the editor for path, taking whatever was typed before (the draft)
    // over the bytes just read — that is what makes a 预览/编辑 toggle and a file
    // switch non-destructive.
    function mountEditorIn(area, path, data) {
      area.textContent = '';
      var d = drafts[path];
      if (!d) {
        d = { text: String(data.content == null ? '' : data.content), dirty: false, version: data.version || null, size: typeof data.size === 'number' ? data.size : null };
      } else if (typeof d.text !== 'string') {
        d.text = String(data.content == null ? '' : data.content);
      }
      drafts[path] = d;
      editorPath = path;
      var box = el('div', 'editmount');
      // The editor mounts into the .editcm child, not into .editmount itself: the
      // mount is the flex column that also holds the loading hint, and CodeMirror
      // has to land in the child that carries the definite height. (Mounting
      // straight into the outer box leaves the editor at zero height — the class
      // would then exist in the stylesheet and nowhere in the document.)
      var cmBox = el('div', 'editcm');
      var hint = el('div', 'edithint', '正在载入编辑器（CodeMirror 604 KB，仅首次）…');
      box.appendChild(cmBox);
      box.appendChild(hint);
      area.appendChild(box);
      var wanted = path;
      createEditor(cmBox, {
        path: path,
        value: d.text,
        dark: isDarkTheme(),
        onChange: function () { d.dirty = true; },
        onDirty: function (isDirty) {
          d.dirty = isDirty;
          if (isDirty) setEditorStatus('未保存', false);
        },
        onSave: function () { if (forceArmed) saveFromEditor(true); else saveFromEditor(false); },
      }).then(function (ctl) {
        if (hint.parentNode) hint.parentNode.removeChild(hint);
        // A file switch (or a repaint) while the bundle was loading: this editor
        // is for a document the page has already left.
        if (editorPath !== wanted || !editorMode) { if (ctl) ctl.destroy(); return; }
        if (!ctl) { box.appendChild(errNode('编辑器组件未能载入（/dsh-sidebar-frog/codemirror/codemirror.min.js）——刷新重试，或改用系统编辑器打开')); return; }
        editorCtl = ctl;
        ctl.focus();
      });
    }

    // Unsaved text lives only in this page, so leaving it (or reloading) has to
    // ask. This is the browser's own prompt — the panel's inline two-step is not
    // available to a page that is being torn down.
    window.addEventListener('beforeunload', function (e) {
      for (var k in drafts) {
        if (drafts[k] && drafts[k].dirty) { e.preventDefault(); e.returnValue = ''; return; }
      }
    });

    function openPath(path, diff, pinned, force) {
      // Re-opening the path that is already showing only updates the
      // preview/pinned state — no wasted re-read of the file. force is the
      // 编辑/预览 toggle and the after-save repaint asking for that re-read
      // anyway.
      var same = selectedPath === path && !force;
      // Leaving a file ends its edit session: a new document must not open with
      // the previous one's 编辑 mode still on. The text typed so far is kept in
      // drafts, so nothing is lost by the switch.
      if (editorPath && editorPath !== path) destroyEditor();
      if (editorModePath && editorModePath !== path) { editorMode = false; forceArmed = false; }
      selectedPath = path;
      pinnedPath = pinned ? path : (same ? pinnedPath : null);
      render();
      if (treeRoot) {
        revealInTree(path);
        renderTree();
      }
      if (same) { updatePreviewPin(); return; }
      var bar = document.getElementById('bar');
      var area = document.getElementById('previewArea');
      // Whatever the previous preview mounted must release its own resources
      // (a canvas, a worker, object URLs) before its nodes go away — clearing
      // the container alone leaves them running.
      if (_previewOffice) { try { _previewOffice.destroy(); } catch (e) {} _previewOffice = null; }
      // A live editor holds the text that has not reached the disk yet — flush
      // it into drafts before its nodes go away.
      destroyEditor();
      area.textContent = '';
      bar.textContent = '';
      bar.appendChild(el('span', 'path' + (pinnedPath && pinnedPath === path ? ' is-pinned' : ''), path));
      var cp = el('button', 'mini-btn', '⧉');
      cp.title = '复制路径';
      cp.addEventListener('click', function () { copyText(path, '已复制路径'); });
      bar.appendChild(cp);
      var qt = el('button', 'mini-btn', '@');
      qt.title = '@引用到主窗口输入框（主窗口不在时复制）';
      qt.addEventListener('click', function () { quoteRef(path); });
      bar.appendChild(qt);

      // Rapid clicks on different files must not let an older, slower read
      // paint over the newer preview: bump a sequence and abort the old read.
      _previewSeq += 1;
      var seq = _previewSeq;
      if (typeof AbortController === 'function') {
        if (_previewAbort) { try { _previewAbort.abort(); } catch (e) {} }
        _previewAbort = new AbortController();
      } else {
        _previewAbort = null;
      }
      var type = extType(path);
      if (type === 'image') {
        var img = el('img', 'preview-img');
        img.src = MEDIA_URL + '?path=' + encodeURIComponent(path);
        img.alt = path;
        img.addEventListener('error', function () {
          if (seq !== _previewSeq) return;
          area.textContent = '';
          area.appendChild(errNode('图片加载失败'));
        });
        area.appendChild(img);
        if (diff) area.appendChild(diffNode(diff));
        return;
      }
      if (type === 'pdf') {
        // Standalone tab: use the browser's NATIVE PDF viewer (with its own
        // toolbar) — the sidebar uses a custom pdf.js renderer instead.
        // #zoom=page-width fits the page to the box width instead of the
        // viewer's default "fit page" (which leaves a portrait page small).
        var pdf = el('embed', 'preview-pdf');
        pdf.src = MEDIA_URL + '?path=' + encodeURIComponent(path) + '#zoom=page-width';
        pdf.type = 'application/pdf';
        area.appendChild(pdf);
        if (diff) area.appendChild(diffNode(diff));
        return;
      }
      // Media is streamed straight from /media, which answers byte ranges now —
      // that is what makes seeking work. Whether the engine can decode the file is
      // not knowable here, so its own error event is reported instead of swallowed.
      if (type === 'audio' || type === 'video') {
        var media = el(type === 'video' ? 'video' : 'audio', type === 'video' ? 'preview-video' : 'preview-audio');
        media.setAttribute('controls', 'controls');
        media.setAttribute('preload', 'metadata');
        if (type === 'video') media.setAttribute('playsinline', 'playsinline');
        media.src = MEDIA_URL + '?path=' + encodeURIComponent(path);
        var mediaBox = el('div', 'preview-media' + (type === 'video' ? '' : ' is-audio'));
        mediaBox.appendChild(media);
        media.addEventListener('error', function () {
          if (seq !== _previewSeq) return;
          if (mediaBox.querySelector('.media-error')) return;   // the element can fire twice
          mediaBox.appendChild(el('div', 'media-error', '浏览器无法解码这个文件（该编码可能不在这台机器的解码器里）。'));
        });
        area.appendChild(mediaBox);
        if (diff) area.appendChild(diffNode(diff));
        return;
      }
      if (type === 'office') {
        // An Office document this plugin reads itself (docx / xlsx / pptx — see
        // src/shared/office.js): the bytes come from /media, the widget from the
        // shared module, so this tab and the shell's sidebar draw the same file
        // with the same code. The sequence guard is the one every other type
        // uses: a slower read must never paint over a newer preview.
        var officeKindName = officeKind(path);
        var officeBox = el('div', 'office-host');
        var officeState = el('div', 'office-state', '正在读取 ' + officeKindLabel(officeKindName) + '…');
        officeBox.appendChild(officeState);
        area.appendChild(officeBox);
        var officeSeq = seq;
        fetch(MEDIA_URL + '?path=' + encodeURIComponent(path), _previewAbort ? { signal: _previewAbort.signal } : undefined)
          .then(function (r) {
            if (r.status === 401 || r.status === 403) throw new Error('未通过会话认证（401）：请刷新页面重新登录后再试');
            if (!r.ok) throw new Error('读取文件失败（HTTP ' + r.status + '）');
            return r.arrayBuffer();
          })
          .then(function (buffer) {
            if (officeSeq !== _previewSeq) return null;
            return officeMount(officeBox, officeKindName, buffer);
          })
          .then(function (handle) {
            if (!handle) return;
            if (officeSeq !== _previewSeq) { try { handle.destroy(); } catch (e) {} return; }
            if (officeState.parentNode) officeBox.removeChild(officeState);
            _previewOffice = handle;
          })
          .catch(function (e) {
            if (officeSeq !== _previewSeq) return;
            officeState.className = 'office-state is-error';
            officeState.textContent = String(e && e.message ? e.message : e);
          });
        if (diff) area.appendChild(diffNode(diff));
        return;
      }
      if (type === 'document') {
        area.appendChild(documentCardNode(path, seq));
        if (diff) area.appendChild(diffNode(diff));
        return;
      }
      fetch(CONTENT_URL + '?path=' + encodeURIComponent(path), _previewAbort ? { signal: _previewAbort.signal } : undefined).then(function (r) {
        // The data routes sit behind DSH's browser-cookie authentication, so a
        // stale session answers 401/403 with a plain-text body — say so instead
        // of failing on r.json().
        if (r.status === 401 || r.status === 403) throw new Error('未通过会话认证（401）：请刷新页面重新登录后再试');
        return r.json();
      }).then(function (data) {
        if (seq !== _previewSeq) return;   // a newer preview already replaced this one
        if (!data || data.ok !== true) { area.appendChild(errNode(data && data.error)); return; }
        // 编辑 is offered for the plugin's text-ish types only, and only where a
        // SAVE can succeed. That verdict is the host's (data.editable), because
        // the host owns the save ceiling — the page used to infer it from
        // data.truncated, which was the same answer only while 预览 and 编辑 shared
        // one 200000-character cap. They don't: a 2 MB Markdown file now previews
        // in full and is still refused an editor, since an editor built on a
        // prefix would truncate the file on save. (The host refuses such a save
        // regardless — this is the honest UI, not the guard.)
        var canEdit = EDITABLE[type] === 1 && (data.editable === undefined ? !data.truncated : !!data.editable);
        if (canEdit) {
          bar.appendChild(editTools(path, data, diff, pinned));
          if (editorMode && editorModePath === path) { mountEditorIn(area, path, data); return; }
        } else if (editorMode && editorModePath === path) {
          editorMode = false;
        }
        if (diff) area.appendChild(diffNode(diff));
        if (type === 'html') {
          var frame = el('iframe', 'preview-iframe');
          frame.setAttribute('sandbox', 'allow-scripts');
          frame.setAttribute('srcdoc', data.content);
          area.appendChild(frame);
        } else if (type === 'markdown') {
          var md = el('div', 'markdown');
          // opts.path lets relative image/svg links resolve next to the doc.
          md.className = 'markdown' + markdownSkinClass(SETTINGS.markdownSkin);
        md.innerHTML = mdToHtml(data.content, { path: path, sessionId: currentSessionId() });
          area.appendChild(md);
          typesetMath(md);
          typesetMermaid(md);
          typesetJSXGraph(md);
          if (data.truncated) area.appendChild(truncatedNote(data));
        } else if (type === 'table') {
          area.appendChild(tableNode(path, data.content));
          if (data.truncated) area.appendChild(truncatedNote(data));
        } else {
          if (data.truncated) area.appendChild(truncatedNote(data));
          area.appendChild(codeViewNode(path, data.content));
        }
      }).catch(function (e) {
        // An aborted read (superseded preview) is not an error to report.
        if (seq !== _previewSeq) return;
        if (e && e.name === 'AbortError') return;
        area.appendChild(errNode(String(e && e.message ? e.message : e)));
      });
    }

    function select(it, pinned) { openPath(it.path, it.diff, pinned); }

    // Preview vs pinned: the bar shows a pin marker, the tree/list labels go
    // italic while the file is only previewed (an IDE's preview tab).
    function updatePreviewPin() {
      var bar = document.getElementById('bar');
      var pathEl = bar ? bar.querySelector('.path') : null;
      if (pathEl) pathEl.classList.toggle('is-pinned', !!pinnedPath && pinnedPath === selectedPath);
      render();
      if (treeRoot) renderTree();
    }
    // Look an opened path up in the artifact list so files the agent edited
    // show their「- 删除 / + 新增」comparison even when opened from the tree.
    function diffOf(path) {
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].path === path) return items[i].diff || null;
      }
      return null;
    }

    // ── File tree (文件树) — IDE-style explorer ──────────────────────────
    // Same appearance and habits as the in-app panel: 22px flat rows, disclosure
    // chevrons, indent guides, per-type icon colours, A/M change letters,
    // arrow-key navigation, type-ahead, context menu, filter/search box,
    // remembered expansion, reveal, and preview vs pinned.
    function setView(view) {
      currentView = view;
      var tabs = document.querySelectorAll('.tab');
      for (var i = 0; i < tabs.length; i += 1) {
        var on = tabs[i].getAttribute('data-view') === view;
        tabs[i].classList.toggle('is-active', on);
        tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      document.getElementById('list').classList.toggle('is-hidden', view !== 'artifacts');
      document.getElementById('tree').classList.toggle('is-active', view === 'tree');
      if (view === 'tree' && !treeRoot) loadTreeRoot(true);
    }

    // A directory that disappears takes its cached descendants and their
    // expansion state with it, so a path that comes back later is fetched fresh
    // instead of resurrecting stale contents. "oldEntries" are the previous
    // children of the level that was just re-listed (workspace root or a
    // subdirectory) — both are just "one directory level".
    // Containment / relative spelling come from src/shared/paths.js, the same
    // helpers the sidebar tree uses: both trees decide "what lives under this
    // workspace root" from identical host-issued strings, and a drift between
    // them is invisible until the remembered expansion stops coming back.
    function treePathIsUnder(candidate, prefix) { return pathUnder(candidate, prefix); }
    function pruneTreeMissing(oldEntries, newEntries) {
      var alive = {};
      (newEntries || []).forEach(function (e) { alive[e.path] = true; });
      (oldEntries || []).forEach(function (e) {
        if (!e.isDir || alive[e.path]) return;
        Object.keys(treeChildren).forEach(function (k) { if (treePathIsUnder(k, e.path)) delete treeChildren[k]; });
        Object.keys(treeExpanded).forEach(function (k) { if (treePathIsUnder(k, e.path)) delete treeExpanded[k]; });
      });
    }

    function flashTreeRow(path) {
      treeFlash = path;
      clearTimeout(treeFlashTimer);
      // Drop the highlight in place instead of re-rendering the whole tree.
      treeFlashTimer = setTimeout(function () {
        var p = treeFlash;
        treeFlash = null;
        if (!p) return;
        var body = document.getElementById('treeBody');
        if (!body) return;
        var flashed = body.querySelectorAll('.tree-row.is-flashed');
        for (var i = 0; i < flashed.length; i += 1) {
          if (flashed[i].getAttribute('data-path') === p) flashed[i].classList.remove('is-flashed');
        }
      }, 900);
    }

    function treeRootPath() { return treeRoot && treeRoot.path ? treeRoot.path : ''; }

    function relTreePath(path) { return pathRelativeTo(path, treeRootPath()); }

    function treeStatusFor(path) {
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].path === path) return items[i].kind === 'create' ? 'A' : 'M';
      }
      return '';
    }

    // Fetch one level and hand the raw result back (never throws).
    function fetchTreeDir(path, done) {
      fetch(listdirUrl(path), { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (res) { done(res); })
        .catch(function () { done(null); });
    }

    // Load a level that is expanded but has no cached contents yet (remembered
    // state, expand-all, reveal) — or retry one whose cached result is only a
    // failure. A folder that failed once (a file lock, a transient EPERM, a
    // directory created a moment ago) used to keep showing that failure for the
    // rest of the session, because the cached node short-circuited every later
    // attempt: collapsing and re-expanding it appeared to do nothing.
    function ensureTreeLoaded(path) {
      if (!path) return;
      var node = treeChildren[path];
      if (node && !node.error) return;   // loaded, or already in flight
      treeChildren[path] = node && node.entries
        ? { entries: node.entries, loading: true }
        : { loading: true };
      fetchTreeDir(path, function (res) {
        var cur = treeChildren[path] || {};
        if (res && res.ok) {
          treeChildren[path] = { entries: res.entries };
        } else {
          var msg = (res && res.error) || '读取失败';
          treeChildren[path] = cur.entries ? { entries: cur.entries, error: msg } : { error: msg };
        }
        renderTree();
        // Keep an expand-all filling in the levels that just arrived.
        expandAllStep();
      });
    }

    // Reload the workspace ROOT level. "hard" throws every cached level and the
    // expansion state away (workspace switch); the default keeps the rest of the
    // tree — expansion, sibling levels and scroll position — as the user left it.
    function loadTreeRoot(hard) {
      _treeRootSeq += 1;
      var seq = _treeRootSeq;
      if (hard) {
        treeRoot = null;
        treeChildren = {};
        treeExpanded = {};
        treeBusy = {};
        treeFlash = null;
        treeCursor = null;
        expandIntent = false;
        clearTimeout(treeFlashTimer);
        var rootLabel0 = document.getElementById('treeRoot');
        if (rootLabel0) rootLabel0.textContent = '…';
        var bodyEl0 = document.getElementById('treeBody');
        bodyEl0.textContent = '';
        bodyEl0.appendChild(el('div', 'tree-loading', '加载文件树…'));
      }
      setTreeHeadBusy(true);
      // A freshly switched-to workspace may not be resolvable on the host for a
      // beat (its session is still loading/persisting), so retry briefly.
      var attempt = function (tries) {
        fetchTreeDir('', function (res) {
          if (seq !== _treeRootSeq) return;   // superseded by a newer root read
          if ((!res || res.ok !== true) && tries > 0) {
            setTimeout(function () { attempt(tries - 1); }, 400);
            return;
          }
          setTreeHeadBusy(false);
          var oldEntries = treeRoot && treeRoot.entries ? treeRoot.entries : [];
          if (res && res.ok) {
            pruneTreeMissing(oldEntries, res.entries);
            treeRoot = { path: res.path, entries: res.entries };
            var rootLabel = document.getElementById('treeRoot');
            if (rootLabel) rootLabel.textContent = basename(res.path);
            restoreTreeExpansion();
          } else if (treeRoot) {
            // Keep the rows already on screen; report the reason above them.
            treeRoot = { path: treeRoot.path, entries: treeRoot.entries, error: (res && res.error) || '读取失败' };
          } else {
            treeRoot = { path: null, entries: [], error: (res && res.error) || '加载失败' };
          }
          renderTree();
        });
      };
      attempt(hard ? 3 : 1);
    }

    function setTreeHeadBusy(busy) {
      var btn = document.getElementById('treeRefresh');
      if (btn) btn.classList.toggle('is-busy', !!busy);
    }

    // Re-read ONE directory level. Rows already loaded stay on screen while the
    // request is in flight (the row spins); nothing else in the tree is touched.
    function refreshTreeDir(path) {
      if (treeBusy[path]) return;
      var node = treeChildren[path] || {};
      treeBusy[path] = true;
      treeChildren[path] = { entries: node.entries, loading: !node.entries };
      treeExpanded[path] = true;
      renderTree();
      fetchTreeDir(path, function (res) {
        delete treeBusy[path];
        applyTreeDir(path, res);
      });
    }

    function applyTreeDir(path, res) {
      var node = treeChildren[path] || {};
      if (!res || res.ok !== true) {
        var msg = (res && res.error) || '读取失败';
        // A failed refresh keeps the level's rows and shows the reason beneath.
        treeChildren[path] = node.entries ? { entries: node.entries, error: msg } : { error: msg };
      } else {
        pruneTreeMissing(node.entries, res.entries);
        treeChildren[path] = { entries: res.entries };
      }
      flashTreeRow(path);
      renderTree();
    }

    // F5: re-read the root plus every folder currently expanded (no collapse).
    // Bounded so a deeply expanded tree cannot storm the host.
    function refreshTreeExpanded() {
      loadTreeRoot(false);
      Object.keys(treeExpanded)
        .filter(function (p) { return treeExpanded[p]; })
        .slice(0, 60)
        .forEach(function (p) { refreshTreeDir(p); });
    }

    function toggleTree(path, force) {
      var want = force == null ? !treeExpanded[path] : !!force;
      // A manual collapse cancels an expand-all in flight.
      if (!want) expandIntent = false;
      treeExpanded[path] = want;
      treeCursor = path;
      if (want) ensureTreeLoaded(path);
      scheduleTreeExpansionSave();
      renderTree();
    }

    function collapseTreeAll() {
      expandIntent = false;
      treeExpanded = {};
      scheduleTreeExpansionSave();
      renderTree();
    }

    function expandTreeLoaded() {
      var expanded = {};
      Object.keys(treeExpanded).forEach(function (k) { if (treeExpanded[k]) expanded[k] = true; });
      var added = 0;
      var budget = 400;
      var walk = function (entries) {
        (entries || []).forEach(function (e) {
          if (!e.isDir || budget <= 0) return;
          budget -= 1;
          if (!expanded[e.path]) { expanded[e.path] = true; added += 1; }
          var node = treeChildren[e.path];
          if (node && node.entries) walk(node.entries);
        });
      };
      walk(treeRoot && treeRoot.entries);
      treeExpanded = expanded;
      if (added) {
        // Load what just opened, then keep expanding as levels arrive.
        Object.keys(treeExpanded).forEach(function (p) { if (!treeChildren[p]) ensureTreeLoaded(p); });
      }
      return added;
    }

    // True while any expanded folder's contents are still in flight.
    function treeLevelsPending() {
      var keys = Object.keys(treeExpanded);
      for (var i = 0; i < keys.length; i += 1) {
        if (!treeExpanded[keys[i]]) continue;
        var node = treeChildren[keys[i]];
        if (node && node.loading) return true;
      }
      return false;
    }

    // One expand-all pass. Levels arrive asynchronously, so the intent is kept
    // alive (and re-run on every arriving level) until a few consecutive passes
    // add nothing new and nothing is still loading.
    function expandAllStep() {
      if (!expandIntent) return;
      var added = expandTreeLoaded();
      if (added || treeLevelsPending()) treeExpandIdle = 0;
      else treeExpandIdle += 1;
      if (treeExpandIdle > 3) { expandIntent = false; return; }
      scheduleTreeExpansionSave();
      renderTree();
    }

    function expandTreeAll() {
      expandIntent = true;
      treeExpandIdle = 0;
      expandAllStep();
    }

    // ── remembered expansion (per workspace root) ─────────────────────────
    function treePersistKey() {
      var root = treeRootPath();
      return root ? 'dsh-sidebar-frog:tree:' + root : '';
    }
    function saveTreeExpansion() {
      var key = treePersistKey();
      if (!key) return;
      try {
        var open = Object.keys(treeExpanded).filter(function (p) {
          return treeExpanded[p] && treePathIsUnder(p, treeRootPath());
        });
        localStorage.setItem(key, JSON.stringify(open));
      } catch (e) { }
    }
    // Debounced write: expansion changes in bursts (expand-all, reveal).
    function scheduleTreeExpansionSave() {
      if (!treePersistKey()) return;
      clearTimeout(treePersistTimer);
      treePersistTimer = setTimeout(saveTreeExpansion, 400);
    }
    function restoreTreeExpansion() {
      var key = treePersistKey();
      if (!key || treeRestoredFor === treeRootPath()) return;
      treeRestoredFor = treeRootPath();
      var open = [];
      try { open = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { open = []; }
      if (!open || !open.length) return;
      var restored = [];
      open.forEach(function (p) {
        if (typeof p === 'string' && p !== treeRootPath() && treePathIsUnder(p, treeRootPath())) {
          treeExpanded[p] = true;
          restored.push(p);
        }
      });
      // A remembered folder only shows anything once its level is re-read.
      restored.slice(0, 12).forEach(function (p) { ensureTreeLoaded(p); });
    }

    // ── filter / search ──────────────────────────────────────────────────
    // Host-side bounded recursive search when the route exists; otherwise the
    // levels already loaded are filtered (and the UI says so).
    function runTreeSearch(text) {
      var q = String(text || '').trim();
      if (!q) { treeSearch = null; renderTree(); return; }
      treeSearch = { loading: true, results: [], local: false };
      renderTree();
      fetch('/dsh-sidebar-frog/search?q=' + encodeURIComponent(q) + '&sessionId=' + encodeURIComponent(currentSessionId()) + '&limit=200', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('搜索不可用'); return r.json(); })
        .then(function (res) {
          if (res && res.ok && Array.isArray(res.results)) {
            treeSearch = { loading: false, results: res.results, local: false, truncated: !!res.truncated };
          } else {
            treeSearch = { loading: false, results: localTreeSearch(q), local: true, truncated: false };
          }
          renderTree();
        })
        .catch(function () {
          treeSearch = { loading: false, results: localTreeSearch(q), local: true, truncated: false };
          renderTree();
        });
    }
    function localTreeSearch(text) {
      var q = text.toLowerCase();
      var out = [];
      var seen = {};
      var walk = function (entries) {
        (entries || []).forEach(function (e) {
          if (out.length >= 200) return;
          // A cached level can be reachable twice (nested expansion), so de-dupe.
          if (e.name.toLowerCase().indexOf(q) >= 0 && !seen[e.path]) {
            seen[e.path] = true;
            out.push({ name: e.name, path: e.path, isDir: e.isDir });
          }
          if (e.isDir) {
            var node = treeChildren[e.path];
            if (node && node.entries) walk(node.entries);
          }
        });
      };
      walk(treeRoot && treeRoot.entries);
      return out;
    }
    function setTreeQuery(text) {
      treeQuery = text;
      clearTimeout(treeSearchTimer);
      treeSearchTimer = setTimeout(function () { runTreeSearch(text); }, 220);
    }

    // ── flat visible rows (IDE style) ────────────────────────────────────
    function treeRows() {
      var rows = [];
      if (treeQuery.trim() && treeSearch && !treeSearch.loading) {
        (treeSearch.results || []).forEach(function (r) {
          rows.push({ entry: r, depth: r.depth != null ? r.depth : 0, flat: true });
        });
        return rows;
      }
      var walk = function (entries, depth) {
        (entries || []).forEach(function (e) {
          rows.push({ entry: e, depth: depth });
          if (!e.isDir || !treeExpanded[e.path]) return;
          var node = treeChildren[e.path];
          if (node && node.entries) {
            walk(node.entries, depth + 1);
            // A failed refresh keeps the level's rows and reports the reason.
            if (node.error) rows.push({ error: node.error, depth: depth + 1 });
          } else if (node && node.error) {
            rows.push({ error: node.error, depth: depth + 1 });
          } else if (node && node.loading) {
            rows.push({ loading: true, depth: depth + 1 });
          }
        });
      };
      walk(treeRoot && treeRoot.entries, 0);
      return rows;
    }

    var TREE_ICON_D = 'M9.4 1.6H4.7A1.2 1.2 0 0 0 3.5 2.8v10.4a1.2 1.2 0 0 0 1.2 1.2h6.6a1.2 1.2 0 0 0 1.2-1.2V5.4L9.4 1.6Z';
    function treeFileIcon() {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 16); svg.setAttribute('height', 16);
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
      [
        { d: TREE_ICON_D },
        { d: 'M9.4 1.7v3.7h3.7' },
      ].forEach(function (spec) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', spec.d);
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '1.2');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
      });
      return svg;
    }
    function strokeIcon(paths, size) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || 14); svg.setAttribute('height', size || 14);
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
      (paths || []).forEach(function (d) {
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', '1.4');
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
      });
      return svg;
    }
    function searchToolIcon() {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', 14); svg.setAttribute('height', 14);
      svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', 7); c.setAttribute('cy', 7); c.setAttribute('r', 4.2);
      c.setAttribute('stroke', 'currentColor'); c.setAttribute('stroke-width', '1.3');
      svg.appendChild(c);
      var l = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      l.setAttribute('d', 'M10.2 10.2 L13.6 13.6');
      l.setAttribute('stroke', 'currentColor'); l.setAttribute('stroke-width', '1.3'); l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
      return svg;
    }
    function expandAllIcon() { return strokeIcon(['M4 6.2 L8 2.6 L12 6.2', 'M4 9.8 L8 13.4 L12 9.8']); }
    function collapseAllIcon() { return strokeIcon(['M4 2.6 L8 6.2 L12 2.6', 'M4 13.4 L8 9.8 L12 13.4']); }
    function closeIcon() { return strokeIcon(['M4.5 4.5 L11.5 11.5', 'M11.5 4.5 L4.5 11.5'], 12); }

    function renderTree() {
      var bodyEl = document.getElementById('treeBody');
      if (!bodyEl) return;
      // Still loading the root: keep the hint instead of blanking the panel.
      if (!treeRoot) {
        if (!bodyEl.firstChild) bodyEl.appendChild(el('div', 'tree-loading', '加载文件树…'));
        return;
      }
      // Re-rendering is routine (the poll re-renders on every artifact change),
      // so carry the keyboard focus over to the rebuilt row.
      var active = document.activeElement;
      var focusPath = active && bodyEl.contains(active) && active.getAttribute
        ? active.getAttribute('data-path') : null;
      bodyEl.textContent = '';
      var filtered = !!treeQuery.trim() && !!treeSearch && !treeSearch.loading;
      if (treeRoot.error) bodyEl.appendChild(el('div', 'tree-error', treeRoot.error));
      if (filtered && treeSearch.loading) bodyEl.appendChild(el('div', 'tree-row tree-loading', '搜索中…'));
      if (filtered && treeSearch.local && !treeSearch.loading && (treeSearch.results || []).length) {
        bodyEl.appendChild(el('div', 'tree-note', '仅搜索已加载的目录（重启 dsh web 后可用全库搜索）'));
      }
      if (filtered && treeSearch.truncated && !treeSearch.loading && (treeSearch.results || []).length) {
        bodyEl.appendChild(el('div', 'tree-note', '匹配过多，仅显示前 200 条'));
      }
      if (filtered && !treeSearch.loading && !(treeSearch.results || []).length) {
        bodyEl.appendChild(el('div', 'empty', treeSearch.local ? '没有匹配（仅搜索已加载的目录）' : '没有匹配的文件'));
        return;
      }
      if (!filtered && (!treeRoot.entries || !treeRoot.entries.length)) {
        bodyEl.appendChild(el('div', 'empty', '（空目录）'));
        return;
      }
      treeRows().forEach(function (row) { bodyEl.appendChild(renderTreeRow(row)); });
      if (focusPath) {
        var again = bodyEl.querySelector('[data-path="' + cssEscapeAttr(focusPath) + '"]');
        if (again && again.focus) again.focus();
      }
    }

    // data-path is written into an attribute selector, so quote and backslash
    // must be escaped (Windows paths contain "\").
    function cssEscapeAttr(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function renderTreeRow(row) {
      var unit = 12;
      if (!row.entry) {
        var msg = el('div', 'tree-row ' + (row.error ? 'tree-error' : 'tree-loading'), row.error || '加载中…');
        msg.style.paddingLeft = (4 + row.depth * unit + 16) + 'px';
        return msg;
      }
      var entry = row.entry;
      var depth = row.depth;
      var isDir = !!entry.isDir;
      var isOpen = isDir && !!treeExpanded[entry.path];
      var isSelected = selectedPath === entry.path;
      var kind = treeStatusFor(entry.path);
      var dom = el('div', 'tree-row' + (isDir ? ' tree-dir' : '') +
        (entry.hidden ? ' tree-hidden' : '') +
        (isSelected ? ' is-selected' : '') +
        (treeCursor === entry.path ? ' is-cursor' : '') +
        (treeFlash === entry.path ? ' is-flashed' : '') +
        (treeBusy[entry.path] ? ' is-actions-open' : '') +
        (row.flat ? ' is-flat' : ''));
      dom.setAttribute('data-path', entry.path);
      dom.setAttribute('data-depth', String(depth));
      dom.setAttribute('role', 'treeitem');
      dom.setAttribute('tabindex', '-1');
      dom.setAttribute('aria-level', String(depth + 1));
      dom.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (isDir) dom.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      dom.style.paddingLeft = (4 + depth * unit) + 'px';
      dom.title = entry.path;

      for (var g = 0; g < depth; g += 1) {
        var guide = el('span', 'tree-guide');
        guide.style.left = (6 + g * unit) + 'px';
        dom.appendChild(guide);
      }

      if (isDir) {
        var twisty = el('span', 'tree-twisty' + (isOpen ? ' is-open' : ''));
        twisty.appendChild(chevronIcon(12));
        dom.appendChild(twisty);
        var folder = el('span', 'tree-ico tree-ico-folder');
        folder.appendChild(isOpen ? folderOpenIcon() : folderClosedIcon());
        dom.appendChild(folder);
      } else {
        dom.appendChild(el('span', 'tree-twisty is-file'));
        var ico = el('span', 'tree-ico tree-ico-' + fileIconKind(entry.path));
        ico.appendChild(treeFileIcon());
        dom.appendChild(ico);
      }

      var name = el('span', 'tree-name' + (isSelected && pinnedPath !== entry.path ? ' is-preview' : ''), entry.name);
      dom.appendChild(name);
      if (row.flat && row.depth === 0 && entry.path !== entry.name) dom.appendChild(el('span', 'tree-sub', relTreePath(entry.path)));
      if (kind) {
        var badge = el('span', 'tree-status tree-status-' + (kind === 'A' ? 'add' : 'mod'), kind);
        badge.title = kind === 'A' ? '代理新建' : '代理修改';
        dom.appendChild(badge);
      }

      // Floating actions: showing them never re-flows the row.
      var actions = el('span', 'tree-actions');
      if (isDir) {
        var actBtn = el('button', 'tree-act' + (treeBusy[entry.path] ? ' is-busy' : ''));
        actBtn.type = 'button';
        actBtn.title = '仅刷新此目录';
        actBtn.setAttribute('aria-label', '仅刷新此目录');
        actBtn.appendChild(refreshIcon(12));
        actBtn.addEventListener('click', function (ev) { ev.stopPropagation(); refreshTreeDir(entry.path); });
        actions.appendChild(actBtn);
      }
      var refBtn = el('button', 'tree-ref');
      refBtn.type = 'button';
      refBtn.title = '@引用到主窗口输入框（主窗口不在时复制）';
      refBtn.appendChild(document.createTextNode('@'));
      refBtn.appendChild(el('span', 'tree-ref-text', '引用'));
      refBtn.addEventListener('click', function (ev) { ev.stopPropagation(); quoteRef(entry.path); });
      actions.appendChild(refBtn);
      dom.appendChild(actions);

      dom.addEventListener('focus', function () { treeCursor = entry.path; });
      dom.addEventListener('click', function (ev) {
        treeCursor = entry.path;
        // A double-click delivers click, click, dblclick. Toggling on both clicks
        // opens and immediately re-closes the folder, which is exactly the "expand
        // does nothing" report; the second click of a multi-click carries
        // detail > 1 (0 for keyboard activation, where the toggle is wanted).
        if (isDir) {
          if (!(ev && ev.detail > 1)) toggleTree(entry.path);
        } else {
          openPath(entry.path, diffOf(entry.path), false);
        }
        if (dom.focus) dom.focus();
      });
      // Files only: a folder's second click is swallowed by the guard above.
      dom.addEventListener('dblclick', function () { if (!isDir) openPath(entry.path, diffOf(entry.path), true); });
      dom.addEventListener('contextmenu', function (ev) { openTreeMenu(ev, entry); });
      return dom;
    }

    // Kept as an explicit clipboard action next to the bridge: quoting into the
    // main window and copying the reference are different intentions, so both
    // stay reachable from the menu.
    function copyRef(path) {
      copyText('@' + path, '已复制 @引用');
    }

    // ── context menu ─────────────────────────────────────────────────────
    function treeMenuItems(entry) {
      var list = [];
      if (entry.isDir) {
        var open = !!treeExpanded[entry.path];
        list.push({ label: open ? '折叠文件夹' : '展开文件夹', run: function () { toggleTree(entry.path, !open); } });
      } else {
        list.push({ label: '打开预览', run: function () { openPath(entry.path, diffOf(entry.path), false); } });
        list.push({ label: '固定预览', run: function () { openPath(entry.path, diffOf(entry.path), true); } });
      }
      list.push({ sep: true });
      list.push({ label: '复制路径', run: function () { copyText(entry.path, '已复制路径'); } });
      list.push({ label: '复制相对路径', run: function () { copyText(relTreePath(entry.path), '已复制相对路径'); } });
      // The standalone tab has no composer of its own, so「引用到主窗口输入框」
      // hands the reference to the main window (which does) and only copies when
      // no main window answers.「复制 @引用」stays for when the clipboard is what
      // you actually want — the label says which one you get.
      list.push({ label: '引用到主窗口输入框', run: function () { quoteRef(entry.path); } });
      list.push({ label: '复制 @引用', run: function () { copyRef(entry.path); } });
      if (entry.isDir) {
        list.push({ sep: true });
        list.push({ label: '仅刷新此目录', run: function () { refreshTreeDir(entry.path); } });
        list.push({ label: '展开全部', run: function () { toggleTree(entry.path, true); expandTreeAll(); } });
      }
      list.push({ sep: true });
      // Destructive: runs through a native confirm() first, so a stray click
      // never deletes anything on its own.
      list.push({ label: entry.isDir ? '删除文件夹…' : '删除文件…', danger: true, run: function () { deletePathNow(entry); } });
      list.push({ sep: true });
      list.push({ label: '全部展开', run: expandTreeAll });
      list.push({ label: '全部折叠', run: collapseTreeAll });
      return list;
    }

    // The item list is built ONCE per opened menu (buildTreeMenu): highlight,
    // arrow keys and Enter all index the SAME array, and navigation skips
    // separators so Enter can never call run() on one.
    function buildTreeMenu(entry) {
      treeMenuList = treeMenuItems(entry);
      treeMenuNav = [];
      for (var i = 0; i < treeMenuList.length; i += 1) {
        if (!treeMenuList[i].sep) treeMenuNav.push(i);
      }
      treeMenuIndex = 0;
    }

    // Position of a raw item index inside the navigable list.
    function treeMenuNavIndex(raw) {
      for (var i = 0; i < treeMenuNav.length; i += 1) {
        if (treeMenuNav[i] === raw) return i;
      }
      return 0;
    }

    function treeMenuPick() {
      if (!treeMenuNav.length) return null;
      var at = Math.max(0, Math.min(treeMenuNav.length - 1, treeMenuIndex));
      var it = treeMenuList[treeMenuNav[at]];
      return it && typeof it.run === 'function' ? it : null;
    }

    // The document/window closers only exist while a menu is open.
    function closeTreeMenu() {
      if (!treeMenuEl) return;
      treeMenuEl.remove();
      treeMenuEl = null;
      treeMenuEntry = null;
      treeMenuIndex = 0;
      treeMenuList = [];
      treeMenuNav = [];
      treeMenuBtns = [];
      document.removeEventListener('click', closeTreeMenu);
      window.removeEventListener('resize', closeTreeMenu);
      window.removeEventListener('scroll', closeTreeMenu, true);
    }

    function openTreeMenu(ev, entry) {
      ev.preventDefault();
      ev.stopPropagation();
      closeTreeMenu();
      treeCursor = entry.path;
      treeMenuEntry = entry;
      buildTreeMenu(entry);
      treeMenuEl = el('div', 'tree-menu');
      treeMenuEl.setAttribute('role', 'menu');
      treeMenuEl.tabIndex = -1;
      treeMenuEl.style.left = Math.min(ev.clientX, Math.max(8, window.innerWidth - 210)) + 'px';
      treeMenuEl.style.top = Math.min(ev.clientY, Math.max(8, window.innerHeight - 340)) + 'px';
      // ONE listener per kind, on the container — which never changes while the
      // menu is open. The items themselves carry no listeners, so there is
      // nothing for a repaint to lose (see buildTreeMenuDom).
      treeMenuEl.addEventListener('click', onTreeMenuClick);
      treeMenuEl.addEventListener('mouseover', onTreeMenuHover);
      treeMenuEl.addEventListener('keydown', onTreeMenuKey);
      document.body.appendChild(treeMenuEl);
      buildTreeMenuDom();
      treeMenuEl.focus();
      document.addEventListener('click', closeTreeMenu);
      window.addEventListener('resize', closeTreeMenu);
      window.addEventListener('scroll', closeTreeMenu, true);
    }

    // Position of the event's target inside the navigable list, or -1 (a
    // separator, the menu's own padding, or something outside the menu).
    function treeMenuNavAt(target) {
      var btn = target && target.closest ? target.closest('.tree-menu-item') : null;
      if (!btn) return -1;
      var raw = parseInt(btn.getAttribute('data-item'), 10);
      return isNaN(raw) ? -1 : treeMenuNavIndex(raw);
    }

    // Moving the highlight only toggles a class on nodes that stay put. The
    // first version rebuilt every item on each mouseenter, so the button under
    // the pointer was replaced the instant the pointer entered it — and Blink
    // answers a replaced hover target by firing mouseenter again on the new
    // node, i.e. an endless rebuild loop (measured in Chrome: ~350 rebuilds
    // while the pointer sat still on one item for 400ms). mousedown and mouseup
    // then landed on two different nodes, so the click was dispatched to their
    // common ancestor — the menu container — and no item ever ran: right-click
    // opened the menu, and clicking it "did nothing".
    //
    // The React sidebar has always been immune: it re-renders the same keyed
    // buttons and React updates them in place, so the node under the cursor
    // survives. This is the hand-rolled equivalent of that guarantee.
    function highlightTreeMenu() {
      var at = treeMenuNav.length
        ? treeMenuNav[Math.max(0, Math.min(treeMenuNav.length - 1, treeMenuIndex))]
        : -1;
      for (var i = 0; i < treeMenuBtns.length; i += 1) {
        var btn = treeMenuBtns[i];
        if (btn) btn.classList.toggle('is-active', i === at);
      }
    }

    // Built EXACTLY once per opened menu; only highlightTreeMenu() runs after.
    function buildTreeMenuDom() {
      treeMenuBtns = [];
      treeMenuEl.textContent = '';
      for (var i = 0; i < treeMenuList.length; i += 1) {
        var it = treeMenuList[i];
        if (it.sep) {
          treeMenuEl.appendChild(el('div', 'tree-menu-sep'));
          treeMenuBtns.push(null);
          continue;
        }
        var btn = el('button', 'tree-menu-item' + (it.danger ? ' is-danger' : ''), it.label);
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.setAttribute('data-item', String(i));
        treeMenuEl.appendChild(btn);
        treeMenuBtns.push(btn);
      }
      highlightTreeMenu();
    }

    function onTreeMenuClick(ev) {
      // Keep the menu's own clicks away from the document-level closer, and run
      // the item here: a click on the padding or a separator runs nothing.
      ev.stopPropagation();
      var at = treeMenuNavAt(ev.target);
      if (at < 0) return;
      var it = treeMenuList[treeMenuNav[at]];
      closeTreeMenu();
      if (it && typeof it.run === 'function') it.run();
    }

    function onTreeMenuHover(ev) {
      var at = treeMenuNavAt(ev.target);
      if (at < 0 || at === treeMenuIndex) return;   // already highlighted: no work
      treeMenuIndex = at;
      highlightTreeMenu();
    }

    function onTreeMenuKey(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); closeTreeMenu(); return; }
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        treeMenuIndex = Math.min(treeMenuNav.length - 1, treeMenuIndex + 1);
        highlightTreeMenu();
        return;
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        treeMenuIndex = Math.max(0, treeMenuIndex - 1);
        highlightTreeMenu();
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        var pick = treeMenuPick();
        closeTreeMenu();
        if (pick) pick.run();
      }
    }

    // ── keyboard navigation ──────────────────────────────────────────────
    function scrollTreeRowIntoView(path) {
      var target = treeBodyEl().querySelector('[data-path="' + cssEscapeAttr(path) + '"]');
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'nearest' });
    }
    function treeBodyEl() { return document.getElementById('treeBody'); }

    function onTreeKeyDown(ev) {
      if (treeMenuEl) { onTreeMenuKey(ev); return; }
      var rows = treeRows();
      var index = -1;
      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].entry && rows[i].entry.path === treeCursor) { index = i; break; }
      }
      var cur = index >= 0 ? rows[index] : null;
      var move = function (row) {
        if (!row || !row.entry) return;
        treeCursor = row.entry.path;
        renderTree();
        scrollTreeRowIntoView(row.entry.path);
      };
      if (ev.key === 'ArrowDown') { ev.preventDefault(); move(rows[Math.min(rows.length - 1, index + 1)] || rows[0]); return; }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); move(rows[Math.max(0, index - 1)]); return; }
      if (ev.key === 'Home') { ev.preventDefault(); move(rows[0]); return; }
      if (ev.key === 'End') { ev.preventDefault(); move(rows[rows.length - 1]); return; }
      if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        if (!cur) { move(rows[0]); return; }
        if (cur.entry.isDir) {
          if (!treeExpanded[cur.entry.path]) toggleTree(cur.entry.path, true);
          else move(rows[index + 1]);
        }
        return;
      }
      if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        if (!cur) return;
        if (cur.entry.isDir && treeExpanded[cur.entry.path]) { toggleTree(cur.entry.path, false); return; }
        for (var j = index - 1; j >= 0; j -= 1) {
          if (rows[j].depth < cur.depth) { move(rows[j]); return; }
        }
        return;
      }
      if (ev.key === 'Enter' || ev.key === ' ') {
        if (!cur) { move(rows[0]); return; }
        ev.preventDefault();
        if (cur.entry.isDir) toggleTree(cur.entry.path);
        else openPath(cur.entry.path, diffOf(cur.entry.path), false);
        return;
      }
      if (ev.key === 'F5') { ev.preventDefault(); refreshTreeExpanded(); return; }
      if (ev.key === 'Escape') {
        if (treeQuery) { closeTreeFilter(); }
        return;
      }
      if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key !== ' ') {
        var now = Date.now();
        treeTypeBuf = (now - treeTypeAt > 700 ? ev.key : treeTypeBuf + ev.key);
        treeTypeAt = now;
        var needle = treeTypeBuf.toLowerCase();
        var start = index + 1;
        for (var k = 0; k < rows.length; k += 1) {
          var cand = rows[(start + k) % rows.length];
          if (cand.entry && String(cand.entry.name).toLowerCase().indexOf(needle) === 0) {
            ev.preventDefault();
            move(cand);
            return;
          }
        }
      }
    }

    // ── reveal the previewed file ────────────────────────────────────────
    function revealInTree(path) {
      var root = treeRootPath();
      if (!path || !root || !treePathIsUnder(path, root)) return;
      // Every directory between the root and the file, spelled the way the host
      // spelled the file (a top-level file has none: already visible).
      var dirs = pathAncestorsOf(path, root);
      if (!dirs.length) return;
      dirs.forEach(function (d) { treeExpanded[d] = true; });
      if (currentView === 'tree') {
        renderTree();
        var step = function (i) {
          if (i >= dirs.length) {
            setTimeout(function () { scrollTreeRowIntoView(path); }, 30);
            return;
          }
          ensureTreeLoaded(dirs[i]);
          setTimeout(function () { step(i + 1); }, 60);
        };
        step(0);
      }
    }

    // Closing the filter must also drop its text: otherwise the field shows a
    // query that is no longer filtering anything.
    function closeTreeFilter() {
      var bar = document.getElementById('treeFilterBar');
      if (bar) bar.classList.remove('is-open');
      var btn = document.getElementById('treeFilter');
      if (btn) btn.classList.remove('is-on');
      var input = document.getElementById('treeFilterInput');
      if (input) input.value = '';
      setTreeQuery('');
    }

    // Toolbar wiring (filter / expand all / collapse all / refresh).
    (function initTreeTools() {
      var filterBtn = document.getElementById('treeFilter');
      var expandBtn = document.getElementById('treeExpandAll');
      var collapseBtn = document.getElementById('treeCollapseAll');
      var input = document.getElementById('treeFilterInput');
      var clearBtn = document.getElementById('treeFilterClear');
      var bar = document.getElementById('treeFilterBar');
      var closeFilter = closeTreeFilter;
      if (filterBtn) {
        filterBtn.appendChild(searchToolIcon());
        filterBtn.title = '过滤文件';
        filterBtn.setAttribute('aria-label', '过滤文件');
        filterBtn.addEventListener('click', function () {
          if (!bar) return;
          var open = bar.classList.toggle('is-open');
          filterBtn.classList.toggle('is-on', open);
          if (open) { if (input) input.focus(); }
          else closeFilter();
        });
      }
      if (expandBtn) {
        expandBtn.appendChild(expandAllIcon());
        expandBtn.title = '全部展开';
        expandBtn.setAttribute('aria-label', '全部展开');
        expandBtn.addEventListener('click', expandTreeAll);
      }
      if (collapseBtn) {
        collapseBtn.appendChild(collapseAllIcon());
        collapseBtn.title = '全部折叠';
        collapseBtn.setAttribute('aria-label', '全部折叠');
        collapseBtn.addEventListener('click', collapseTreeAll);
      }
      if (input) {
        input.addEventListener('input', function () { setTreeQuery(input.value); });
        input.addEventListener('keydown', function (ev) {
          // Escape clears AND closes the box (IDE behaviour), then hands the
          // keyboard back to the tree so arrows keep working.
          if (ev.key === 'Escape') {
            ev.preventDefault();
            closeFilter();
            treeBodyEl().focus();
          }
          if (ev.key === 'ArrowDown') { ev.preventDefault(); treeBodyEl().focus(); }
        });
      }
      if (clearBtn) {
        clearBtn.appendChild(closeIcon());
        clearBtn.title = '清除过滤';
        clearBtn.setAttribute('aria-label', '清除过滤');
        clearBtn.addEventListener('click', function () { setTreeQuery(''); if (input) { input.value = ''; input.focus(); } });
      }
      var searchIconEl = document.getElementById('treeFilterIcon');
      if (searchIconEl) searchIconEl.appendChild(searchToolIcon());
      var body = treeBodyEl();
      if (body) {
        body.tabIndex = 0;
        body.setAttribute('role', 'tree');
        body.setAttribute('aria-label', '工作区文件树');
        body.addEventListener('keydown', onTreeKeyDown);
      }
    })();

    document.getElementById('tabs').addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.tab') : null;
      if (!btn) return;
      setView(btn.getAttribute('data-view'));
    });

    // ── Splitter: preview (left) vs list/file tree (right) ───────────────
    // Same behaviour as the in-app panel: drag to resize, a handle in the middle
    // retracts the preview to the left, and the dragged width is remembered — in
    // the same localStorage entry the sidebar writes, so the divider position
    // follows you between the two.
    var SPLITTER_PX = 6;
    var SPLIT_PREVIEW_MIN = 300;
    // The file tree's floor: enough width that a row's fixed chrome (padding,
    // twisty, icon, indent) still leaves its file name readable.
    var SPLIT_LIST_MIN = 280;
    // storedWidth is the divider position this tab (or the sidebar — same
    // localStorage key) last dragged, or null for "never dragged". previewWidth
    // is the live px value, recomputed from the configured「预览区默认宽度」
    // percentage on every resize until a drag creates an override.
    var storedWidth = null;
    var previewWidth = null;
    var splitting = false;

    function readStoredWidth() {
      try { return bridgeParseWidth(localStorage.getItem(BRIDGE.previewWidth)); } catch (e) { return null; }
    }

    function splitBounds() {
      var main = document.getElementById('main');
      var avail = main.clientWidth - SPLITTER_PX;
      var previewMin = Math.min(SPLIT_PREVIEW_MIN, avail * 0.42);
      var listMin = Math.min(SPLIT_LIST_MIN, avail * 0.38);
      return { avail: avail, min: previewMin, max: Math.max(previewMin, avail - listMin) };
    }

    function applySplit() {
      var previewEl = document.getElementById('preview');
      if (!previewEl) return;
      var b = splitBounds();
      // Same rule as the in-app panel: the dragged px wins, otherwise the
      // configured percentage of the split area decides the divider.
      var percentage = (SETTINGS && typeof SETTINGS.previewHeight === 'number' ? SETTINGS.previewHeight : 80) / 100;
      previewWidth = storedWidth == null ? b.avail * percentage : storedWidth;
      previewWidth = Math.max(b.min, Math.min(b.max, previewWidth));
      previewEl.style.width = Math.round(previewWidth) + 'px';
      syncSplitAria();
    }

    // Report the current preview width to assistive tech (role="separator").
    function syncSplitAria() {
      var splitEl = document.getElementById('split');
      if (!splitEl || previewWidth == null) return;
      var b = splitBounds();
      splitEl.setAttribute('aria-valuenow', String(Math.round(previewWidth)));
      splitEl.setAttribute('aria-valuemin', String(Math.round(b.min)));
      splitEl.setAttribute('aria-valuemax', String(Math.round(b.max)));
    }

    function setCollapsedSplit(collapsed) {
      var main = document.getElementById('main');
      main.classList.toggle('is-preview-collapsed', collapsed);
      var btn = document.getElementById('splitToggle');
      if (btn) {
        btn.title = collapsed ? '展开预览区' : '收起预览区（收到左侧）';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      if (!collapsed) {
        // Re-expanding returns to the configured「预览区默认宽度」on both sides:
        // the drag override is dropped here and in the sidebar.
        storedWidth = null;
        try { localStorage.removeItem(BRIDGE.previewWidth); } catch (e) { }
        applySplit();
      }
    }
    (function initSplit() {
      var splitEl = document.getElementById('split');
      var toggle = document.getElementById('splitToggle');
      if (!splitEl || !toggle) return;
      storedWidth = readStoredWidth();
      var chev = chevronIcon(10);
      chev.setAttribute('class', 'split-chevron');
      toggle.appendChild(chev);
      applySplit();
      toggle.addEventListener('click', function (ev) {
        ev.stopPropagation();
        setCollapsedSplit(!document.getElementById('main').classList.contains('is-preview-collapsed'));
      });
      splitEl.addEventListener('mousedown', function (ev) {
        if (document.getElementById('main').classList.contains('is-preview-collapsed')) { setCollapsedSplit(false); return; }
        ev.preventDefault();
        splitting = true;
        splitEl.classList.add('is-dragging');
        var main = document.getElementById('main');
        var left = main.getBoundingClientRect().left;
        var onMove = function (mv) {
          var b = splitBounds();
          previewWidth = Math.max(b.min, Math.min(b.max, mv.clientX - left));
          document.getElementById('preview').style.width = Math.round(previewWidth) + 'px';
          syncSplitAria();
        };
        var onUp = function () {
          splitting = false;
          splitEl.classList.remove('is-dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          // Remember the drag for both halves (the sidebar reads the same key).
          storedWidth = Math.round(previewWidth);
          try { localStorage.setItem(BRIDGE.previewWidth, String(storedWidth)); } catch (e) { }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      window.addEventListener('resize', function () { if (!splitting) applySplit(); });
    })();
    var treeRefreshBtn = document.getElementById('treeRefresh');
    if (treeRefreshBtn) {
      treeRefreshBtn.appendChild(refreshIcon());
      treeRefreshBtn.title = '刷新根目录（保留已展开的目录）· Shift+点击：整棵树重新加载';
      treeRefreshBtn.setAttribute('aria-label', '刷新根目录');
      treeRefreshBtn.addEventListener('click', function (ev) { loadTreeRoot(ev.shiftKey === true); });
    }
    function load() {
      // One poll in flight at a time: the 2s interval plus an 8s timeout could
      // otherwise pile up several overlapping requests.
      if (_loadInFlight) return;
      _loadInFlight = true;
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
      var safety = null;
      // Release the guard from whichever path finishes first — including a
      // request that never settles (no AbortController) — so the poll can fail
      // open instead of stopping for good.
      var settle = function () {
        _loadInFlight = false;
        if (timer) clearTimeout(timer);
        if (safety) clearTimeout(safety);
      };
      safety = setTimeout(settle, 12000);
      fetch(DATA_URL, controller ? { signal: controller.signal, cache: 'no-store' } : { cache: 'no-store' })
        .then(function (r) {
          // Distinguish "the session needs a refresh" from "the host is gone":
          // the data routes are behind DSH's browser-cookie authentication now.
          if (r.status === 401 || r.status === 403) { var denied = new Error('unauthorized'); denied.auth = true; throw denied; }
          return r.json();
        }).then(function (data) {
          settle();
          items = data && Array.isArray(data.artifacts) ? data.artifacts : [];
          if (selectedPath && !items.some(function (x) { return x.path === selectedPath; })) { selectedPath = null; }
          render();
          // The tree shows the same A/M change letters, so it follows the poll.
          if (treeRoot) renderTree();
          var st = document.getElementById('status');
          st.textContent = '实时';
          st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-success-fg').trim() || '#34c55e';
        }).catch(function (err) {
          settle();
          var st = document.getElementById('status');
          st.textContent = err && err.auth ? '未认证' : '离线';
          st.style.color = getComputedStyle(document.documentElement).getPropertyValue('--p-error').trim() || '#ef4444';
        });
    }
    load();
    // ── Shared settings ───────────────────────────────────────────────────
    // Read once at startup and re-applied whenever the sidebar changes them, so
    // this tab behaves like the panel instead of keeping its own fixed habits:
    // the poll interval and its「自动刷新」switch, whether the 文件树 tab exists,
    // and the default divider position.
    var _pollTimer = null;
    // The document skin (src/shared/skins.js): one style tag for the whole page,
    // rewritten when the setting changes. A skin is a few dozen rules scoped by
    // the class the Markdown root carries, so switching one costs a textContent
    // write — not a re-render of every open document.
    var SKIN_STYLE_ID = "dsh-sidebar-frog-skin";
    function applyMarkdownSkin() {
      var css = markdownSkinCss(SETTINGS.markdownSkin);
      var existing = document.getElementById(SKIN_STYLE_ID);
      if (!css) { if (existing && existing.parentNode) existing.parentNode.removeChild(existing); return; }
      if (existing) { if (existing.textContent !== css) existing.textContent = css; return; }
      var tag = document.createElement("style");
      tag.id = SKIN_STYLE_ID;
      tag.setAttribute("data-plugin", "dsh-sidebar-frog");
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    function applySettings() {
      applyMarkdownSkin();
      var wanted = SETTINGS.autoRefresh !== false;
      if (wanted && !_pollTimer) _pollTimer = setInterval(load, 2000);
      else if (!wanted && _pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      var tabs = document.getElementById('tabs');
      var treeTab = document.querySelector('.tab[data-view="tree"]');
      if (treeTab) treeTab.classList.toggle('is-hidden', SETTINGS.showFileTree === false);
      if (tabs) tabs.classList.toggle('is-hidden', SETTINGS.showFileTree === false);
      if (SETTINGS.showFileTree === false && currentView === 'tree') setView('artifacts');
      // A settings change re-derives the divider (the stored drag, if any, wins).
      storedWidth = readStoredWidth();
      applySplit();
    }
    applySettings();
    // Follow the active session in real time: the main tab publishes the
    // current session id to localStorage (SESSION_KEY) only when it actually
    // changes, so the storage event alone is enough — no polling.
    var _lastTreeSession = currentSessionId();
    function watchSession() {
      var sid = currentSessionId();
      if (sid !== _lastTreeSession) {
        _lastTreeSession = sid;
        if (treeRoot !== null) loadTreeRoot(true);
      }
    }
    window.addEventListener('storage', function (e) {
      if (e.key === SESSION_KEY) watchSession();
      else if (e.key === BRIDGE.settings) { SETTINGS = readBridgeSettings(); applySettings(); }
      else if (e.key === BRIDGE.previewWidth) { storedWidth = readStoredWidth(); if (!splitting) applySplit(); }
    });
    // Background tabs throttle setInterval, so a tab left in the background can
    // show stale artifacts for up to a minute — and with「自动刷新」off there is no
    // interval at all. Refresh immediately whenever the user returns to (or
    // focuses) this tab, which is what makes the manual mode usable.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) load();
    });
    window.addEventListener('focus', load);
  </script>
</body>
</html>`

