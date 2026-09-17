/* Layout push: reserve space for the popout panel so the conversation column
   yields instead of being covered.
   --dsh-sidebar-frog-right is MEASURED from the shell's own right sidebar
   element (see watchShellRight in src/client/core.js) because the shell exposes
   no variable for it; --dsh-sidebar-width is the legacy better-sidebar variable
   and only remains as a fallback for an older host that still sets it.
   --dsh-sidebar-frog-width is our own live panel width. */
html #root {
  margin-right: calc(var(--dsh-sidebar-frog-right, var(--dsh-sidebar-width, 0px)) + var(--dsh-sidebar-frog-width, 0px));
  transition: margin-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
body[data-dsh-sidebar-frog-dragging] #root {
  transition: none;
}
/* Reserve right-side clearance in the conversation header so the corner
   trigger never overlaps its right-aligned utilities (e.g. "Session log").
   The clearance only applies while the popout panel is closed. */
header:has([data-slot="conversation.session.header.utilities"]) {
  padding-right: max(28px, calc(60px - var(--dsh-sidebar-frog-width, 0px)));
  transition: padding-right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
@media(prefers-reduced-motion: reduce) {
  html #root { transition: none; }
  header:has([data-slot="conversation.session.header.utilities"]) { transition: none; }
}
/* Native tab surface: the shell's right sidebar draws the frame, owns the width
   and provides the scroll container, so the panel drops every part of the chrome
   that made it a floating window — no fixed position, no seam, no shadow, no
   reserved space. height:100% degrades to the content's own height when the
   seat's box is not definite, so nothing collapses if the frame changes. */
.artifacts-panel.artifacts-panel-native {
  position: static; width: auto; max-width: none; min-width: 0; height: 100%; min-height: 0;
  border-left: 0; box-shadow: none; z-index: auto;
}
.artifacts-panel {
  position: fixed; top: 0; right: var(--dsh-sidebar-frog-right, var(--dsh-sidebar-width, 0px)); bottom: 0; width: 30vw; max-width: calc(100vw - 24px); min-width: 0;
  display: flex; flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  pointer-events: auto; z-index: 9999;
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
  font-size: 13px; line-height: 1.5;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
  /* ── Layout grid ──────────────────────────────────────────────────────
     One set of sizes for every band of chrome, so the header, the tab strip,
     the file-tree header and the list/tree rows line up with each other and
     stay aligned with the preview on the left. Rows are 30px, strips 32px. */
  --frog-h-head: 38px;      /* top bar — the Harness's own panel-header height */
  --frog-h-strip: 38px;     /* tab strip AND file-tree header (same 38px band) */
  --frog-h-row: 30px;       /* artifact list rows (two-line cards) */
  --frog-h-tree-row: 22px;  /* file-tree rows: IDE density (VS Code uses 22px) */
  --frog-tree-indent: 12px; /* one indent level per tree depth */
  --frog-pad-x: 10px;       /* horizontal padding of every strip/row */
  --frog-radius-row: 6px;
  /* Pane floors: the preview and the list/tree each keep a usable width. The
     percentages are the fallback for narrow panels (min() picks the smaller),
     which is what keeps the split from collapsing into slivers.
     The list/tree floor is what keeps file names readable: a row spends ~46px on
     its padding, twisty and icon plus 12px per indent level, so 280px still
     leaves a long name (dsh-sidebar-frog.config.json) its full width two levels
     deep. Mirrored by SPLIT_LIST_MIN / SPLIT_PREVIEW_MIN in
     src/client/components.js — scripts/check.js fails if they drift apart. */
  --frog-pane-min-list: min(280px, 38%);
  /* Container queries below react to the PANEL's width, not the window's. */
  container-type: inline-size;
}
/* Every band is measured border-box, so a 38px strip is 38px on screen even
   with its seam (the pop-out page does the same with a global reset).
   The top bar copies the Harness's own panel header (its 文件 / 文档预览 panels):
   38px tall, a .5px border-bottom in border-l3, 28px icon buttons. Same height,
   same hairline, same button box — the panel reads as part of the shell. */
.artifacts-head {
  position: relative; box-sizing: border-box; display: flex; align-items: center; gap: 4px; height: var(--frog-h-head); padding: 0 6px; flex: none;
  border-bottom: .5px solid var(--dsw-alias-border-l3);
  background: var(--dsw-alias-bg-layer-1);
}
.artifacts-head-left { display: flex; align-items: center; gap: 2px; flex: none; }
.artifacts-spacer { flex: 1; }
/* Panel actions in the top bar: 收起 (the overlay's own collapse) and 弹出到新标签页.
   A 28px icon-button box — the size and 6px radius the Harness uses for the
   buttons in its own panel headers. Under the native surface neither the shell's
   toggle nor ours is duplicated: 收起 exists only here, and only on the overlay. */
.artifacts-link, .artifacts-headbtn {
  display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; line-height: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; text-decoration: none;
  transition: color .15s, background .15s;
}
.artifacts-link:hover, .artifacts-headbtn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-link:focus-visible, .artifacts-headbtn:focus-visible, .artifacts-iconbtn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
/* Secondary button in the top bar (清除模式): the Harness's own outlined small
   button — 1px border-l2, label-secondary, 8px radius, text turning primary on
   hover. */
.artifacts-iconbtn {
  appearance: none; font: inherit; font-size: 12px; line-height: 1.5;
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 8px; padding: 3px 10px;
  cursor: pointer; transition: color .15s, border-color .15s, background .15s;
}
.artifacts-iconbtn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
/* Split area: preview on the LEFT, artifact list / file tree on the RIGHT
   (the pop-out tab uses the same left/right arrangement). Both panes carry a
   min-width, so neither can ever be squeezed into a sliver; the preview is the
   sized pane and the list/tree takes the rest. */
.artifacts-main { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: row; }
/* The tab panes share the panel: the visible one takes the space, the others keep
   their box but are made invisible (position: absolute + visibility: hidden).
   Unmounting them instead — the obvious way to write a tab strip — destroyed the
   file tree's loaded levels and its scroll offset, so every switch back to 文件树
   looked like a refresh that had lost the user's place. */
.artifacts-pane { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.artifacts-pane.is-hidden { position: absolute; inset: 0; visibility: hidden; pointer-events: none; }
/* The single pane: the artifact list or the file tree, full width. Its floor is
   what keeps file names readable — the panel's own width policy uses the same
   280px (scripts/check.js fails if the two drift apart). */
.artifacts-body { flex: 1 1 0; min-width: var(--frog-pane-min-list); min-height: 0; overflow-y: auto; overflow-x: hidden; }
.artifacts-empty { padding: 28px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
/* 后台任务 tab: a read-only mirror of the shell's own job list. One row per job,
   a status dot in the status colour the shell uses, and the live ones tinted so
   "still running" is visible without reading. */
.artifacts-jobs-hint { padding: 10px 12px; font-size: 11px; color: var(--dsw-alias-label-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-job { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-job.is-live { background: var(--dsw-alias-bg-layer-1); }
.artifacts-job-main { min-width: 0; flex: 1 1 auto; }
.artifacts-job-dot { flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); }
.artifacts-job-dot-running { background: var(--dsw-alias-state-business-primary); }
.artifacts-job-dot-stopping { background: var(--dsw-alias-state-warn-label); }
.artifacts-job-dot-completed { background: var(--dsw-alias-state-success-primary); }
.artifacts-job-dot-failed { background: var(--dsw-alias-state-error-primary); }
.artifacts-job-dot-killed { background: var(--dsw-alias-label-dimmed); }
.artifacts-job-row { display: flex; align-items: baseline; gap: 8px; }
.artifacts-job-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.artifacts-job-time { flex: none; margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-job-sub { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-job-status { flex: none; }
.artifacts-job-detail { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-item {
  display: block; width: 100%; text-align: left; padding: 9px 12px;
  border: none; border-bottom: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: inherit; cursor: pointer; font: inherit;
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-row { display: flex; align-items: center; gap: 8px; }
.artifacts-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; flex: none; }
.artifacts-badge-create { background: var(--dsw-alias-state-success-tertiary); color: var(--dsw-alias-state-success-primary); }
.artifacts-badge-edit { background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-state-warn-label); }
.artifacts-item-base { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Last-touched age, pushed to the right edge (the same value the popout shows). */
.artifacts-item-time { flex: none; margin-left: auto; font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.artifacts-item-full {
  color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 2px; font-family: var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
/* Italic label = only previewed (an IDE's preview tab); upright once pinned. */
.artifacts-item-base.is-preview { font-style: italic; }
.artifacts-hint { padding: 24px 16px; color: var(--dsw-alias-label-tertiary); text-align: center; }
.artifacts-error { padding: 16px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsh-font-mono, monospace); word-break: break-all; }
/* Closed-state switch, top-right: 打开/收起 + (while closed) 在新标签页弹出. One
   fixed group, so the two never drift apart.

   Its offset is MEASURED, not guessed. The shell keeps its own sidebar toggle in
   the session header's corner (28px in from the conversation column's right
   edge), and our panel narrows that column by exactly the width we claim — so a
   fixed "just left of the sidebars" offset puts our switch in the same 28px band
   as theirs and the two icons land on top of each other — which is exactly what
   the old fixed right: sidebarWidth + frogWidth + 12px did. CornerButton measures
   the shell's button and publishes --frog-corner-right as a px offset from the
   window's right edge, 8px clear of it; the fallback below is plain "left of the
   sidebars" for when no such button exists. */
.artifacts-corner {
  position: fixed; top: 10px; right: var(--frog-corner-right, calc(var(--dsh-sidebar-frog-right, var(--dsh-sidebar-width, 0px)) + var(--dsh-sidebar-frog-width, 0px) + 12px));
  z-index: 10000; display: flex; align-items: center; gap: 2px;
  transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease);
}
.artifacts-corner-btn {
  width: 34px; height: 34px; padding: 0; border: none; border-radius: 6px;
  background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; align-items: center; justify-content: center; display: inline-flex;
  transition: color .15s, background .15s;
}
.artifacts-corner-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }

/* The left sidebar's footer entry point (sidebar.footer.action).
   It exists because the shell's column has exactly ONE control that can open it —
   its own button in the session header's corner — and the shell renders that
   header display:none while the session is still blank (a session that has never
   run a turn). The left sidebar's foot, by contrast, is rendered in every state
   including the hero screen, so this is where a standing "open the tree" control
   belongs. Sized like the shell's own footer occupants: a 36px round icon in the
   collapsed rail, a full-width 42px row in the expanded column (stacked above the
   shell's own Settings row).
   The seat holds ONE occupant (文件树, and under it the <a> to the popout page),
   so the rule carries text-decoration: none — the anchor form is deliberate (a
   real navigation cannot be swallowed by a popup blocker the way window.open
   can). */
/* Why that occupant is a COLUMN, and why it is one occupant at all. The shell
   renders this seat as a ROW in both fold states (dsh-client-ui-sidebar:
   ".footerActions{display:flex}", and in the rail
   ".collapsed .footerActions{justify-content:center;width:auto}"), so two
   registered entries are always laid out side by side. In the rail they do not
   fit: it is 56px wide (SIDEBAR_COLLAPSED, ui-layout) minus 10px of inline
   padding — a 36px content box — while one round button is 36px, so the second
   button hung outside the rail. That row is not ours to restyle (its class is a
   private CSS-module hash), so the direction lives here instead: two round icons
   stacked in the rail, two full-width rows in the expanded foot — the same
   rhythm as the shell's own Settings row right beneath them.
   NB: this file is embedded in a template literal by scripts/build.js, so no
   comment here may contain a backtick or a dollar-brace — either one ends the
   string and the bundle stops parsing. A guard in scripts/check.js says so. */
.artifacts-foot-stack {
  box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
  gap: 2px; min-width: 0;
}
.artifacts-foot-stack.is-wide { width: 100%; gap: 4px; align-items: stretch; }
.artifacts-foot-btn {
  box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center;
  gap: 8px; width: 36px; height: 36px; margin: 0; padding: 0;
  border: none; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font: inherit; font-size: 14px; line-height: 20px; text-decoration: none;
  transition: color .15s, background .15s;
}
.artifacts-foot-btn:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-foot-btn.is-wide {
  flex: 1 1 auto; width: calc(100% + 4px); min-width: 0; height: 42px; margin: 0 -2px; padding: 0 10px 0 8px;
  border-radius: 12px; justify-content: flex-start;
}
.artifacts-foot-label { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* Stretched by the column, not sized by the row rule above: "calc(100% + 4px)"
   with "margin: 0 -2px" was written for a flex ROW, where it bled into the row's
   own edge. In a column the parent stretches its children instead, so the row is
   exactly as wide as the stack and can never overhang the foot. */
.artifacts-foot-stack.is-wide .artifacts-foot-btn.is-wide { flex: none; width: auto; margin: 0; }

/* 「在新标签页弹出」 inside the SHELL's own tab menu
   (sidebar.right.tab.menu.item — the column's list seat for per-tab actions). The
   kit renders our node as a raw child of its menu portal: its own rows carry a
   private CSS-module class we cannot use, and the portal is a child of <body>,
   i.e. OUTSIDE the panel. So the row is styled here in the MENU's colours rather
   than the panel's — color: inherit (the menu sets it) and a hover wash mixed
   from currentColor — which is what keeps it looking like the kit's own items in
   both themes. The plain fallback above the color-mix line covers an engine
   without it. */
.artifacts-menuitem {
  box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%;
  margin: 0; padding: 7px 10px; border: none; border-radius: 6px;
  background: transparent; color: inherit; cursor: pointer;
  font: inherit; font-size: 13px; line-height: 18px; text-align: left; text-decoration: none;
  white-space: nowrap;
}
.artifacts-menuitem svg { flex: none; }
.artifacts-menuitem:hover { background: rgba(127, 127, 127, .14); background: color-mix(in srgb, currentColor 14%, transparent); }
.artifacts-menuitem-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.artifacts-item {
  position: relative; display: flex; align-items: stretch; width: 100%;
  padding: 0; cursor: default ; border-bottom: 1px solid var(--dsw-alias-border-l2);
  /* Background the floating actions fade into (see --frog-row-bg below). */
  --frog-row-bg: var(--dsw-alias-bg-base);
}
.artifacts-item:hover { background: var(--dsw-alias-interactive-bg-hover); --frog-row-bg: var(--dsw-alias-interactive-bg-hover); }
/* Selected artifact: a left accent bar (list-item language) keeps it visually
   distinct from the file tree's rounded full-fill selection, so a lone selected
   artifact never reads as a file-tree row. */
.artifacts-item.is-active { background: var(--dsw-alias-interactive-bg-hover); box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary); --frog-row-bg: var(--dsw-alias-interactive-bg-hover); }
.artifacts-item-main { flex: 1; min-width: 0; text-align: left; padding: 7px var(--frog-pad-x); border: none; background: transparent; color: inherit; cursor: pointer; font: inherit; }
/* Row actions float above the row instead of taking layout space: the file name
   keeps its full width and never reflows (or collapses) when they appear. */
.artifacts-item-actions {
  position: absolute; top: 50%; right: 4px; transform: translateY(-50%);
  display: flex; align-items: center; gap: 2px; padding-left: 14px;
  background: linear-gradient(90deg, transparent, var(--frog-row-bg) 14px);
  opacity: 0; pointer-events: none; transition: opacity .12s;
}
.artifacts-item:hover .artifacts-item-actions,
.artifacts-item:focus-within .artifacts-item-actions,
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; pointer-events: auto; }
.artifacts-minibtn { border: none; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; line-height: 1; }
.artifacts-minibtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-notice { color: var(--dsw-alias-state-business-primary); font-size: 12px; }
/* Transient feedback, rendered into the SHELL's frame-wide overlay layer (see
   NoticePill in src/client/components.js). The layer is click-through, so the
   pill stays non-interactive too — it only reports. */
.artifacts-notice-pill {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  pointer-events: none; max-width: min(420px, calc(100vw - 48px));
  padding: 6px 14px; border-radius: 999px;
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
  border: .5px solid var(--dsw-alias-border-l3); box-shadow: var(--dsw-shadow-lv2);
  font-size: 12px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* 清除 rides the end of the view switcher on the native surface, where the
   shell's tab strip is the panel's only other header. Sticky so it stays at the
   strip's right edge however many file tabs are open — the strip scrolls. */
.artifacts-tab-action { position: sticky; right: 0; margin-left: auto; align-self: center; flex: none; background: var(--dsw-alias-bg-layer-1); }
/* Preview pane — the body of a FILE TAB. The panel shows one tab at a time
   (产物 / 文件树 / the files you opened), so the preview gets the panel's full
   width instead of sharing it with the tree: that is the whole reason tapping a
   file opens a tab rather than squeezing a second column into the sidebar. */
.artifacts-preview { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.artifacts-preview-body { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; position: relative; }
.artifacts-img { display: block; max-width: 100%; max-height: 70vh; object-fit: contain; margin: 12px; }
/* iframe/embed are REPLACED elements: inset-0 without an explicit
   width/height keeps their intrinsic (small) size, so use width/height 100%
   instead. position:relative above is for the pdf.js renderer's absolute
   canvas container (a non-replaced div, which DOES stretch with inset-0). */
.artifacts-iframe { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; }
.artifacts-pdf { width: 100%; height: 100%; min-height: 360px; border: 0; background: #fff; display: block; }
/* pdf.js renderer (sidebar): fills the preview area, no native toolbar. */
.artifacts-pdfview { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: flex; flex-direction: column; background: #525659; }
.artifacts-pdfview-bar { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 6px; height: var(--frog-h-strip); padding: 0 8px; background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-pdfview-btn { min-width: 24px; height: 22px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 5px; cursor: pointer; font: inherit; font-size: 13px; line-height: 1; padding: 0 6px; }
.artifacts-pdfview-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-pdfview-btn:disabled { opacity: .4; cursor: default ; }
.artifacts-pdfview-zoom { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 40px; text-align: center; }
.artifacts-pdfview-page { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 44px; text-align: center; }
.artifacts-pdfview-spacer { flex: 1; }
.artifacts-pdfview-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px; }
.artifacts-pdfview-canvas { display: block; margin: 0 auto; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
.artifacts-markdown { padding: 12px 14px; line-height: 1.6; word-wrap: break-word; font-size: 13px; }
.artifacts-markdown h1, .artifacts-markdown h2, .artifacts-markdown h3, .artifacts-markdown h4, .artifacts-markdown h5, .artifacts-markdown h6 { margin: 14px 0 8px; line-height: 1.3; }
.artifacts-markdown h1 { font-size: 1.45em; border-bottom: 1px solid var(--dsw-alias-border-l2); padding-bottom: 6px; }
.artifacts-markdown h2 { font-size: 1.25em; border-bottom: 1px solid var(--dsw-alias-border-l1); padding-bottom: 4px; }
.artifacts-markdown code { background: var(--dsw-alias-bg-layer-1); padding: 1px 5px; border-radius: 4px; font-family: var(--dsh-font-mono, ui-monospace, monospace); font-size: 0.9em; }
.artifacts-markdown pre { background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; border-radius: 6px; overflow: auto; }
.artifacts-markdown pre code { background: transparent; padding: 0; }
.artifacts-markdown img { max-width: 100%; }
.artifacts-markdown blockquote { border-left: 3px solid var(--dsw-alias-border-l2); margin: 8px 0; padding: 2px 12px; color: var(--dsw-alias-label-secondary); }
.artifacts-markdown ul, .artifacts-markdown ol { padding-left: 24px; }
.artifacts-markdown a { color: var(--dsw-alias-state-business-primary); }
/* Math display blocks kept verbatim by mdToHtml for MathJax to typeset. */
.artifacts-markdown .math-display { margin: 8px 0; overflow-x: auto; }
.artifacts-markdown .math-display mjx-container { max-width: 100%; }
/* Tables, task lists and extra inline marks produced by mdToHtml. */
.artifacts-markdown table { border-collapse: collapse; margin: 8px 0; display: block; max-width: 100%; overflow-x: auto; font-size: 0.93em; }
.artifacts-markdown th, .artifacts-markdown td { border: 1px solid var(--dsw-alias-border-l2); padding: 4px 9px; }
.artifacts-markdown th { background: var(--dsw-alias-interactive-bg-hover); font-weight: 600; }
.artifacts-markdown li.task-list-item { list-style: none; margin-left: -20px; }
.artifacts-markdown li.task-list-item input[type="checkbox"] { margin-right: 6px; vertical-align: -1px; accent-color: var(--dsw-alias-state-business-primary); }
.artifacts-markdown mark { background: #ffe066; color: #241f00; border-radius: 3px; padding: 0 2px; }
body[data-ds-dark-theme] .artifacts-markdown mark { background: #6b5c12; color: #f6e7a1; }
.artifacts-markdown del { color: var(--dsw-alias-label-tertiary); }
.artifacts-markdown sup, .artifacts-markdown sub { line-height: 0; }
/* Raw HTML embedded in the document: collapsible answers (<details>/<summary>,
   the courseware's "答案" convention), layout containers and simple marks. */
.artifacts-markdown details { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; margin: 8px 0; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.artifacts-markdown details > summary { position: relative; cursor: pointer; padding: 6px 28px 6px 10px; font-weight: 600; list-style: none; user-select: none; }
.artifacts-markdown details > summary::-webkit-details-marker { display: none; }
.artifacts-markdown details > summary::after { content: '▸'; position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--dsw-alias-label-tertiary); transition: transform .15s var(--ds-ease-in-out, ease); }
.artifacts-markdown details[open] > summary::after { transform: translateY(-50%) rotate(90deg); }
.artifacts-markdown details[open] > summary { border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-markdown details > *:first-child { margin-top: 0; }
.artifacts-markdown details > *:last-child { margin-bottom: 0; }
.artifacts-markdown kbd { background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1)); border: 1px solid var(--dsw-alias-border-l2); border-bottom-width: 2px; border-radius: 4px; padding: 1px 5px; font: 0.85em var(--dsh-font-mono, ui-monospace, monospace); }
.artifacts-markdown figure { margin: 8px 0; }
.artifacts-markdown figcaption { margin-top: 4px; font-size: 0.9em; color: var(--dsw-alias-label-tertiary); }
.artifacts-markdown svg { max-width: 100%; height: auto; }
/* Mermaid diagram containers (rendered SVG replaces the raw source). */
.artifacts-markdown .mermaid { margin: 10px 0; overflow-x: auto; text-align: center; }
.artifacts-markdown .mermaid svg { max-width: 100%; height: auto; }
.artifacts-markdown .mermaid-error { border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 8px; background: rgba(236, 19, 19, 0.05); }
.artifacts-markdown .mermaid-fallback { margin: 0; padding: 8px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); background: transparent; text-align: left; }
/* JSXGraph board containers (interactive boards replace the raw source). */
.artifacts-markdown .jsxgraph-box { width: 100%; min-height: 280px; }
.artifacts-markdown .jsxgraph-error { border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; padding: 8px; background: rgba(236, 19, 19, 0.05); }
.artifacts-markdown .jsxgraph-fallback { margin: 0; padding: 8px; font: 12px/1.5 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); background: transparent; text-align: left; }
.artifacts-markdown .jsxgraph-fallback-error { margin: 0 0 6px; font-size: 12px; color: var(--dsw-alias-state-error-primary); word-break: break-word; }
.artifacts-diff { border-top: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; padding: 5px 10px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-diff-name { flex: none; }
.artifacts-diff-stat { flex: none; font-weight: 500; font-family: var(--dsh-font-mono, ui-monospace, monospace); color: var(--dsw-alias-label-tertiary); }
.artifacts-diff-note { flex: none; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
/* 撤销 sits at the end of the diff title: the review is "what changed, and do I
   want it" — one bar, one decision. Sized like the Harness's own small outlined
   buttons. */
.artifacts-undo {
  appearance: none; margin-left: auto; font: inherit; font-size: 11px; font-weight: 500;
  background: transparent; border: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary); border-radius: 6px; padding: 2px 8px; cursor: pointer;
  transition: color .15s, border-color .15s, background .15s;
}
.artifacts-undo:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-undo:disabled { opacity: .6; cursor: default; }
/* One line per row, old/new line numbers in a fixed gutter so a removal and the
   insertion that replaced it can be read against each other. */
.artifacts-diff-rows { max-height: 45%; overflow: auto; font: 12px / 1.5 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.artifacts-diff-row { display: flex; align-items: flex-start; white-space: pre-wrap; word-break: break-word; }
.artifacts-diff-no { flex: none; width: 32px; padding-right: 6px; text-align: right; color: var(--dsw-alias-label-tertiary); user-select: none; }
.artifacts-diff-sign { flex: none; width: 12px; color: var(--dsw-alias-label-tertiary); user-select: none; }
.artifacts-diff-text { flex: 1 1 auto; min-width: 0; padding-right: 8px; }
.artifacts-diff-del { background: rgba(236, 19, 19, 0.07); }
.artifacts-diff-del .artifacts-diff-sign, .artifacts-diff-del .artifacts-diff-text { color: var(--dsw-alias-state-error-primary); }
.artifacts-diff-add { background: rgba(34, 197, 94, 0.08); }
.artifacts-diff-add .artifacts-diff-sign, .artifacts-diff-add .artifacts-diff-text { color: var(--dsw-alias-state-success-primary); }
/* Kept: other views still use the plain label form. */
.artifacts-diff-label { font-size: 11px; padding: 4px 12px; font-weight: 600; }
.artifacts-panel { transition: right var(--ds-transition-duration-slow, 200ms) var(--ds-ease-in-out, ease); }
.artifacts-panel.artifacts-resizing { transition: none; user-select: none; }

/* Resize handle on the panel's left edge */
.artifacts-resize { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 3; touch-action: none; }
.artifacts-resize::after { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px; background: transparent; transition: background .15s; }
.artifacts-resize:hover::after, .artifacts-resize:active::after { background: var(--dsw-alias-interactive-bg-hover-accent); }

/* Vertical divider between the preview (left) and the list/file tree (right):
   drag left/right to resize — POPOUT ONLY. The sidebar panel has no preview of
   its own any more (clicking a file opens it in the popout tab), so it keeps one
   full-width pane: no splitter, no preview-collapse control, nothing to overlap.
   The divider lives in the standalone page's own stylesheet. */

/* Tabs (产物 / 文件树) — the Harness's own tab strip, not a bespoke one: a .5px
   base rule in border-l2, 13px 20px labels in label-tertiary, and a 2px
   label-primary underline on the active tab (identical to the values the
   settings surface uses). The strip is the same 38px band as the header. */
.artifacts-tabs { box-sizing: border-box; flex: none; display: flex; align-items: flex-end; gap: 16px; height: var(--frog-h-strip); padding: 0 var(--frog-pad-x); border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.artifacts-tabs::-webkit-scrollbar { display: none; }
/* The left-hand fact a native view's band states about itself (the ledger's live
   record count), the way the product's files tab states its path. Muted and
   non-interactive: it is a label, not a control. */
.artifacts-tab-note { flex: none; align-self: center; color: var(--dsw-alias-label-tertiary); font-size: 12px; white-space: nowrap; }
.artifacts-tab { position: relative; flex: none; padding: 7px 1px 9px; border: 0; background: transparent; color: var(--dsw-alias-label-tertiary); font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.artifacts-tab:hover, .artifacts-tab.is-active { color: var(--dsw-alias-label-primary); }
.artifacts-tab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary); }
.artifacts-tab:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: 2px; color: var(--dsw-alias-label-primary); }
/* File tabs (one per file you clicked): the same tab vocabulary, with the label
   inside a button so it can ellipsize and a ✕ beside it. */
.artifacts-tab-file { display: inline-flex; align-items: center; gap: 2px; max-width: 190px; padding-right: 0; }
.artifacts-tab-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.artifacts-tab-label:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: 2px; }
.artifacts-tab-close { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.artifacts-tab-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* The unsaved dot and the armed close button. A tab whose editor unmounts on
   every switch has to say which files still hold edits, and the click that
   throws them away has to be a decision — so the ✕ turns into 确认 first. */
.artifacts-tab-dirty { flex: none; margin-right: 3px; font-size: 9px; line-height: 1; color: var(--dsw-alias-state-business-primary); }
.artifacts-tab-close.is-armed { width: auto; padding: 0 5px; font-size: 11px; color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover); }

/* File tree (文件树) — IDE-style explorer (VS Code's explorer is the model):
   flat 22px rows, square-ish selection, disclosure chevrons, indent guides,
   per-type icon colours and always-visible A/M change letters. */
.artifacts-tree { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-tree-header { box-sizing: border-box; flex: none; justify-content: space-between; align-items: center; gap: 4px; height: var(--frog-h-strip); padding: 0 4px 0 var(--frog-pad-x); display: flex; }
/* Explorer section label: small, uppercase, tertiary — like「EXPLORER」. */
.artifacts-tree-root { flex: 1 1 auto; min-width: 0; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }
.artifacts-tree-tools { flex: none; display: flex; align-items: center; gap: 2px; }
.artifacts-tree-tool, .artifacts-tree-refresh { width: 22px; height: 22px; color: var(--dsw-alias-label-tertiary); cursor: pointer; background: transparent; border: none; border-radius: 4px; flex: none; justify-content: center; align-items: center; display: inline-flex; padding: 0; }
.artifacts-tree-tool:hover, .artifacts-tree-refresh:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-tool.is-on { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-active); }
/* Filter row (explorer filter box). */
.artifacts-tree-filter { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 var(--frog-pad-x); color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-bg-layer-1); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-tree-filter-input { flex: 1 1 auto; min-width: 0; border: none; outline: none; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.artifacts-tree-filter-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-filter-clear { width: 18px; height: 18px; flex: none; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.artifacts-tree-filter-clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 2px 4px 8px; outline: none; }
.artifacts-tree-body:focus-visible { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
.artifacts-tree-row { position: relative; box-sizing: border-box; width: 100%; height: var(--frog-h-tree-row); font-family: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); text-align: left; cursor: pointer; white-space: nowrap; background: transparent; border: none; border-radius: 3px; align-items: center; gap: 4px; padding: 0 6px 0 4px; display: flex; --frog-row-bg: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* VS Code keeps folder labels in the normal weight — the icon + chevron carry
   the meaning, so the tree stays calm and dense. */
.artifacts-tree-dir { font-weight: 400; }
.artifacts-tree-hidden { opacity: .45; }
.artifacts-tree-name { flex: 1 1 auto; min-width: 0; text-overflow: ellipsis; overflow: hidden; }
/* Italic label = previewed but not pinned (an IDE's preview tab). */
.artifacts-tree-name.is-preview { font-style: italic; }
/* Keyboard cursor ring, distinct from the (mouse) selection fill. */
.artifacts-tree-row.is-cursor { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2); }
.artifacts-tree-row.is-selected { background: var(--dsw-alias-interactive-bg-active); --frog-row-bg: var(--dsw-alias-interactive-bg-active); }
/* Depth guides, drawn inside each row so they never leak across levels. */
.artifacts-tree-guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dsw-alias-border-l1); pointer-events: none; }
.artifacts-tree-twisty { flex: none; width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary); }
.artifacts-tree-twisty svg { transition: transform .1s var(--ds-ease-in-out, ease); }
.artifacts-tree-twisty.is-open svg { transform: rotate(90deg); }
.artifacts-tree-twisty.is-file { visibility: hidden; }
.artifacts-tree-ico { flex: none; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
/* Per-type icon colours (see fileIconKind in src/shared/ext.js). Mid-tone hues
   that stay legible on both the light and the dark panel. */
.artifacts-tree-ico-folder { color: #c99a4e; }
.artifacts-tree-ico-code { color: #4f9cf9; }
.artifacts-tree-ico-markup { color: #e07b39; }
.artifacts-tree-ico-style { color: #46b8c8; }
.artifacts-tree-ico-markdown { color: #6c9ef8; }
.artifacts-tree-ico-data { color: #d4a72c; }
.artifacts-tree-ico-image { color: #b180d7; }
.artifacts-tree-ico-pdf { color: #e05252; }
.artifacts-tree-ico-doc { color: #4f9cf9; }
.artifacts-tree-ico-media { color: #e879a8; }
.artifacts-tree-ico-shell { color: #6cbf58; }
.artifacts-tree-ico-text { color: var(--dsw-alias-label-tertiary); }
/* Change letters: A = created by the agent, M = edited (IDE git decorations). */
.artifacts-tree-status { flex: none; font-size: 11px; font-weight: 700; padding: 0 2px; }
.artifacts-tree-status-add { color: #3fb950; }
.artifacts-tree-status-mod { color: #d29922; }
/* Filter results: name first, the relative path dimmed after it. */
.artifacts-tree-sub { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-tertiary); font-size: 11px; padding-left: 4px; direction: rtl; text-align: left; }
.artifacts-tree-note { padding: 4px var(--frog-pad-x) 6px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
/* Row actions float above the row (fading the name out underneath) instead of
   taking layout space: a filename keeps its full width on hover instead of being
   squeezed to zero. */
.artifacts-tree-actions {
  position: absolute; top: 50%; right: 3px; transform: translateY(-50%);
  display: none; align-items: center; gap: 2px; padding-left: 14px;
  background: linear-gradient(90deg, transparent, var(--frog-row-bg) 14px);
}
.artifacts-tree-row:hover .artifacts-tree-actions,
.artifacts-tree-row:focus-within .artifacts-tree-actions,
.artifacts-tree-row.is-actions-open .artifacts-tree-actions { display: inline-flex; }
.artifacts-tree-ref { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); height: 18px; color: var(--dsw-alias-label-tertiary); font-size: 10.5px; font-weight: 600; line-height: 1; white-space: nowrap; cursor: pointer; border-radius: 999px; flex: none; align-items: center; justify-content: center; padding: 0 7px; display: inline-flex; }
.artifacts-tree-ref:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* Per-directory refresh: one level at a time, so a refresh never collapses
   the rest of the tree. Lives in the floating action cluster; pinned while the
   level is being re-read. */
.artifacts-tree-act { width: 18px; height: 18px; color: var(--dsw-alias-label-tertiary); cursor: pointer; background: transparent; border: none; border-radius: 4px; flex: none; justify-content: center; align-items: center; padding: 0; display: inline-flex; }
.artifacts-tree-act:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-tree-act.is-busy { color: var(--dsw-alias-label-secondary); cursor: progress; }
.artifacts-tree-act.is-busy svg, .artifacts-tree-refresh.is-busy svg { animation: artifacts-spin .8s linear infinite; }
/* Brief pulse on the row that was just re-read, so a single-level refresh is
   visible without any list-wide reflow. */
.artifacts-tree-row.is-flashed { animation: artifacts-row-flash .9s var(--ds-ease-in-out, ease); }
.artifacts-tree-copied { font-size: 10.5px; line-height: 1; white-space: nowrap; color: var(--dsw-alias-label-tertiary); flex: none; }
/* Context menu (right-click on a row). */
.artifacts-tree-menu { position: fixed; z-index: 10001; min-width: 184px; padding: 4px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1)); box-shadow: var(--dsw-shadow-lv2); outline: none; }
.artifacts-tree-menu-item { display: block; width: 100%; text-align: left; padding: 5px 10px; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.artifacts-tree-menu-item:hover, .artifacts-tree-menu-item.is-active { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-tree-menu-sep { height: 1px; margin: 4px 6px; background: var(--dsw-alias-border-l2); }
/* The destructive item (删除). It reads as a warning, not a neighbour of the
   copy actions, so a right-click never hides it among the safe ones. */
.artifacts-tree-menu-item.is-danger { color: var(--dsw-alias-state-error-primary); }
.artifacts-tree-menu-item.is-danger:hover, .artifacts-tree-menu-item.is-danger.is-active { background: rgba(236, 19, 19, 0.12); }
/* Delete confirmation: the destructive action that must be answered. Drawn as a
   small fixed box (portaled to <body>, so it is measured from the viewport),
   above the menu's z-index so it wins even if both are briefly on screen. */
.artifacts-tree-confirm { position: fixed; z-index: 10002; width: 320px; padding: 14px 16px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1)); box-shadow: var(--dsw-shadow-lv3, var(--dsw-shadow-lv2)); outline: none; }
.artifacts-tree-confirm-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-state-error-primary); }
.artifacts-tree-confirm-body { margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-primary); word-break: break-all; }
.artifacts-tree-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.artifacts-tree-confirm-btn { padding: 5px 14px; font: inherit; font-size: 12px; cursor: pointer; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); }
.artifacts-tree-confirm-btn.is-danger { border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-state-error-primary); color: #fff; }
.artifacts-tree-confirm-btn.is-danger.is-busy { opacity: 0.7; cursor: default; }
.artifacts-tree-confirm-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: 1px; }
/* Transient "已删除 / 删除失败" note pinned above the tree body, so it survives
   the deleted row vanishing from under it. */
.artifacts-tree-flash-label { margin: 0 0 4px; padding: 4px 10px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236, 19, 19, 0.08); border-radius: 4px; }
/* Narrow panel: the「@引用」pill collapses to a compact '@' so the row's
   floating actions never overflow a cramped list/tree pane. */
@container (max-width: 460px) {
  .artifacts-tree-ref-text { display: none; }
  .artifacts-tree-ref { padding: 0 6px; }
}
/* Cramped panel: the tree header tightens instead of dropping controls.
   The bulk toolbar (展开全部 / 全部折叠) used to be hidden here — at the default
   panel width that is 20% of the window, i.e. under 400px on any screen
   narrower than 2000px, so those two buttons were *never* rendered as controls:
   the refresh button slid into their place and clicking there did nothing
   visible, which read as "全部折叠 点了没反应". Only the root label gives way
   now; it already ellipsizes, and 4 buttons fit in any usable panel. */
@container (max-width: 400px) {
  .artifacts-tree-header { padding-left: 6px; gap: 2px; }
  .artifacts-tree-tools { gap: 0; }
  .artifacts-tree-tool, .artifacts-tree-refresh { width: 20px; height: 20px; }
}
.artifacts-tree-loading { cursor: default ; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.artifacts-tree-error { cursor: default ; color: var(--dsw-alias-state-error-primary); font-size: 12px; }
@keyframes artifacts-row-in { 0% { opacity: 0 } }
@keyframes artifacts-spin { to { transform: rotate(360deg) } }
@keyframes artifacts-row-flash { 0% { background: var(--dsw-alias-interactive-bg-active) } 100% { background: transparent } }

/* Renderer note (see rendererNote in src/client/preview.js): the file is one this
   panel can only show as plain text, while an installed renderer claims its
   suffix. A slim bar above the body, so it reads as an offer, not an error. */
.artifacts-renderer { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.artifacts-renderer-text { min-width: 0; flex: 1 1 auto; font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-renderer-btn { flex: none; appearance: none; font: inherit; font-size: 12px; line-height: 1.5; background: transparent; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); border-radius: 8px; padding: 3px 10px; cursor: pointer; transition: color .15s, border-color .15s, background .15s; }
.artifacts-renderer-btn:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
/* The pure-Markdown body rendered into the SHELL's document seat (see
   MarkdownDocumentBody in src/client/docpreview.js). It borrows the panel's own
   markdown styles wholesale — the two must not drift — and only adds the
   wrapper that keeps the owner's scroll container in charge. */
.artifacts-doc { min-width: 0; }
/* 用量 / 上下文 tab. The three composition tints are the product's own meter
   colours (ui-conversation's ContextMeter), so the same context reads the same
   way here as in the ring beside the composer. Figures are tabular so a column
   of them stays aligned. */
.artifacts-usage { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px var(--frog-pad-x) 20px; }
.artifacts-usage-head { display: flex; align-items: baseline; gap: 8px; }
.artifacts-usage-title { font-weight: 600; }
.artifacts-usage-percent { font-variant-numeric: tabular-nums; font-weight: 600; }
.artifacts-usage-figures { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.artifacts-usage-muted { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.artifacts-usage-block { margin-top: 14px; }
.artifacts-usage-label { font-size: 11px; color: var(--dsw-alias-label-tertiary); margin-bottom: 6px; }
.artifacts-usage-track { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--dsw-alias-border-l3); }
.artifacts-usage-seg { height: 100%; min-width: 2px; }
.artifacts-usage-tone-system { --frog-usage-tint: var(--dsw-static-neutral-bluish-400); }
.artifacts-usage-tone-tools { --frog-usage-tint: #a78bfa; }
.artifacts-usage-tone-messages { --frog-usage-tint: var(--dsw-static-blue-450); }
.artifacts-usage-seg.artifacts-usage-tone-system,
.artifacts-usage-seg.artifacts-usage-tone-tools,
.artifacts-usage-seg.artifacts-usage-tone-messages { background: var(--frog-usage-tint); }
.artifacts-usage-swatch { flex: none; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; display: inline-block; }
.artifacts-usage-swatch.artifacts-usage-tone-system,
.artifacts-usage-swatch.artifacts-usage-tone-tools,
.artifacts-usage-swatch.artifacts-usage-tone-messages { background: var(--frog-usage-tint); }
.artifacts-usage-legend { margin-top: 6px; }
.artifacts-usage-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.artifacts-usage-name { color: var(--dsw-alias-label-secondary); min-width: 0; }
.artifacts-usage-value { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
/* Git 只读切片 tab. The status letters use the product's own state tokens, so
   the same letters read the same way in both themes: added/renamed green,
   modified amber, deleted red, a conflict inverted (solid red, white letter).
   Rows are full-width buttons because the whole row opens its difference — the
   panel is far too narrow for a separate affordance column. */
.artifacts-git { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.artifacts-git-head { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px var(--frog-pad-x); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-git-branch { font-weight: 600; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-chip { flex: none; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; padding: 1px 7px; }
.artifacts-git-chip.is-warn { color: var(--dsw-alias-state-warn-label); border-color: var(--dsw-alias-state-warn-secondary); }
.artifacts-git-summary { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.artifacts-git-age { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.artifacts-git-upstream { flex: none; padding: 6px var(--frog-pad-x); font-size: 11px; color: var(--dsw-alias-label-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-upstream-note { color: var(--dsw-alias-label-secondary); }
.artifacts-git-truncated { flex: none; padding: 6px var(--frog-pad-x); font-size: 11px; color: var(--dsw-alias-state-warn-label); background: var(--dsw-alias-state-warn-tertiary); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-git-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.artifacts-git-section { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-git-section-head { display: flex; align-items: baseline; gap: 8px; padding: 8px var(--frog-pad-x) 4px; }
.artifacts-git-section-title { font-size: 12px; font-weight: 600; }
.artifacts-git-section-count { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.artifacts-git-section-note { margin-left: auto; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-git-row { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; appearance: none; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; padding: 4px var(--frog-pad-x); cursor: pointer; }
.artifacts-git-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-git-row.is-open { background: var(--dsw-alias-interactive-bg-active); }
.artifacts-git-letter { flex: none; width: 16px; height: 16px; border-radius: 4px; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; font-family: var(--dsw-font-mono, ui-monospace, monospace); }
.artifacts-git-tone-add { color: var(--dsw-alias-state-success-primary); border-color: var(--dsw-alias-state-success-secondary); }
.artifacts-git-tone-mod { color: var(--dsw-alias-state-warn-label); border-color: var(--dsw-alias-state-warn-secondary); }
.artifacts-git-tone-del { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-secondary); }
.artifacts-git-tone-ren { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-git-tone-new { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-git-tone-conflict { color: var(--dsw-alias-label-primary-foreground); background: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
.artifacts-git-path { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-git-name { color: var(--dsw-alias-label-primary); }
.artifacts-git-dir { color: var(--dsw-alias-label-tertiary); }
.artifacts-git-dir:not(:empty) { margin-left: 6px; }
.artifacts-git-orig { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-git-diff { padding: 0 0 6px; }
.artifacts-git-empty { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 24px var(--frog-pad-x); text-align: center; }
.artifacts-git-empty-title { font-weight: 600; }
.artifacts-git-empty-note { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-tertiary); }
.artifacts-git-empty-path { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-family: var(--dsw-font-mono, ui-monospace, monospace); word-break: break-all; opacity: .85; }
/* Settings section */
  .artifacts-settings { display: flex; flex-direction: column; gap: 14px; width: 100%; height: 100%; min-height: 0; overflow-y: auto; padding-bottom: 24px; }
.artifacts-setintro { color: var(--dsw-alias-label-tertiary); margin: 0; padding: 0 2px; font-size: 13px; line-height: 20px; }
.artifacts-setbuild { color: var(--dsw-alias-label-tertiary); margin: 2px 0 0; padding: 0 2px; font-size: 11px; line-height: 16px; font-family: var(--dsw-font-mono, ui-monospace, monospace); opacity: .75; }
/* The two halves can legitimately be on different builds after a rebuild: the
   host is read once at process start, the client is fetched per page load. This
   line names the stale one instead of leaving a feature that "did nothing". */
.artifacts-setstale { color: var(--dsw-alias-state-warn-label); background: var(--dsw-alias-state-warn-tertiary); border: 1px solid var(--dsw-alias-state-warn-secondary); border-radius: 8px; margin: 6px 0 0; padding: 6px 9px; font-size: 12px; line-height: 18px; }
/* One line per lent renderer in the settings panel: the suffixes on the left,
   the live state on the right. A state that is not "live" is the interesting
   one, so the row colours it — that is the whole point of the block. */
.artifacts-setlendrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 4px 0 0; padding: 0 2px; font-size: 12px; line-height: 18px; }
.artifacts-setlendname { color: var(--dsw-alias-label-secondary); font-family: var(--dsw-font-mono, ui-monospace, monospace); }
.artifacts-setlendstate { color: var(--dsw-alias-label-tertiary); }
.artifacts-setlendstate.is-live { color: var(--dsw-alias-state-success-primary, #1a7f37); }
.artifacts-setlendstate.is-failed,
.artifacts-setlendstate.is-noregistry { color: var(--dsw-alias-state-error-primary); }
.artifacts-setlendstate.is-pending { color: var(--dsw-alias-state-warn-label); }
.artifacts-setlendwhy { flex: 1 1 100%; color: var(--dsw-alias-state-error-primary); font-size: 11px; word-break: break-word; }
/* Which surface the panel got (native tab vs the floating fallback). Worth a
   line of its own: it is what explains the absent width / 默认展开 preferences. */
.artifacts-setmode { color: var(--dsw-alias-label-secondary); margin: 2px 0 0; padding: 0 2px; font-size: 12px; line-height: 18px; }
.artifacts-setgroup { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-3); border-radius: 16px; padding: 6px 20px; display: flex; flex-direction: column; flex: none; }
.artifacts-setrow { border-bottom: 1px solid var(--dsw-alias-border-l2); justify-content: space-between; align-items: center; gap: 16px; padding: 12px 2px; display: flex; }
.artifacts-setrow:last-child { border-bottom: none; }
.artifacts-settext { flex-direction: column; gap: 4px; min-width: 0; display: flex; }
.artifacts-settitle { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.artifacts-setdesc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.artifacts-switch { cursor: pointer; flex: none; display: inline-flex; position: relative; }
  .artifacts-switch input { opacity: 0; width: 1px; height: 1px; margin: 0; position: absolute; }
.artifacts-switch-track { box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); border-radius: 10px; align-items: center; width: 36px; height: 20px; padding: 2px; transition: background .15s, border-color .15s; display: inline-flex; }
.artifacts-switch-thumb { background: var(--dsw-alias-label-secondary); border-radius: 50%; width: 14px; height: 14px; transition: transform .15s, background .15s; display: block; }
.artifacts-switch:hover .artifacts-switch-track { border-color: var(--dsw-alias-label-dimmed); }
.artifacts-switch input:checked + .artifacts-switch-track { border-color: var(--dsw-alias-button-primary-fill); background: var(--dsw-alias-button-primary-fill); }
.artifacts-switch input:checked + .artifacts-switch-track .artifacts-switch-thumb { background: var(--dsw-alias-bg-layer-3); transform: translate(16px); }
.artifacts-switch input:focus-visible + .artifacts-switch-track { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.artifacts-setcontrol { flex: none; align-items: center; gap: 6px; display: flex; }
.artifacts-widthinput { width: 76px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; border-radius: 6px; padding: 4px 8px; }
.artifacts-suffix { color: var(--dsw-alias-label-secondary); font-size: 14px; line-height: 22px; }

/* Delete mode */
.artifacts-delete-hint { padding: 6px 12px; font-size: 12px; color: var(--dsw-alias-state-error-primary); background: rgba(236, 19, 19, 0.08); border-bottom: 1px solid var(--dsw-alias-border-l2); flex: none; }
.artifacts-iconbtn.artifacts-delete-on { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: rgba(236, 19, 19, 0.08); }
.artifacts-item.is-delete-marked { outline: 2px solid var(--dsw-alias-state-error-primary); outline-offset: -2px; background: rgba(236, 19, 19, 0.06); --frog-row-bg: rgba(236, 19, 19, 0.06); }
.artifacts-item.is-delete-marked .artifacts-item-actions { opacity: 1; }
.artifacts-delete-x { color: var(--dsw-alias-state-error-primary); font-size: 16px; font-weight: 700; line-height: 1; }
.artifacts-delete-x:hover { background: rgba(236, 19, 19, 0.12); color: var(--dsw-alias-state-error-primary); }

/* Code preview (syntax-highlighted via DSH's Shiki — token colors come from
   the app's global--shiki-token-* palette, matching the rest of DSH) */
.artifacts-code { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.artifacts-code-head { box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 8px; height: var(--frog-h-strip); padding: 0 var(--frog-pad-x); border-bottom: 1px solid var(--dsw-alias-border-l2); }
.artifacts-code-lang { font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary); padding: 1px 8px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1)); }
.artifacts-code-scroll { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: flex-start; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); }
.artifacts-code-gutter { flex: none; min-width: 3em; margin: 0; padding: 12px 10px 12px 12px; text-align: right; color: var(--dsw-alias-label-tertiary); border-right: 1px solid var(--dsw-alias-border-l1); position: sticky; left: 0; user-select: none; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); font: 12px / 1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre { flex: 1; margin: 0; padding: 12px; background: var(--shiki-background, var(--dsw-alias-markdown-code-block, var(--dsw-alias-bg-layer-1))); color: var(--shiki-foreground, var(--dsw-alias-label-primary)); font: 12px / 1.6 var(--dsh-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); white-space: pre; }
.artifacts-code-pre code { font: inherit; color: inherit; }
.artifacts-code-line { display: block; }

/* Token colors for the shared self-contained highlighter (markdown fenced
   code blocks). Palette matches the standalone page + DSH's--shiki-* hues. */
.tok-comment { color: #868e96; }
.tok-string { color: #2f9e44; }
.tok-number, .tok-bool, .tok-variable, .tok-hex, .tok-attr { color: #e8590c; }
.tok-keyword, .tok-important, .tok-atrule { color: #d6336c; }
.tok-function, .tok-decorator { color: #6741d9; }
.tok-class, .tok-builtin, .tok-tag, .tok-key { color: #1971c2; }
.tok-property { color: #495057; }
/* Dark theme: these four rules used to be written as body[data-ds-dark-theme]
   immediately followed by the token class (no space), so they never matched and
   markdown code blocks stayed on the light palette in dark mode. */
body[data-ds-dark-theme] .tok-comment { color: #adb5bd; }
body[data-ds-dark-theme] .tok-string { color: #69db7c; }
body[data-ds-dark-theme] .tok-number, body[data-ds-dark-theme] .tok-bool, body[data-ds-dark-theme] .tok-variable, body[data-ds-dark-theme] .tok-hex, body[data-ds-dark-theme] .tok-attr { color: #ffa94d; }
body[data-ds-dark-theme] .tok-keyword, body[data-ds-dark-theme] .tok-important, body[data-ds-dark-theme] .tok-atrule { color: #faa2c1; }
body[data-ds-dark-theme] .tok-function, body[data-ds-dark-theme] .tok-decorator { color: #b197fc; }
body[data-ds-dark-theme] .tok-class, body[data-ds-dark-theme] .tok-builtin, body[data-ds-dark-theme] .tok-tag, body[data-ds-dark-theme] .tok-key { color: #74c0fc; }
body[data-ds-dark-theme] .tok-property { color: #ced4da; }


/* ── Table view (CSV / TSV) ────────────────────────────────────────────────
   A spreadsheet reads as a grid or it does not read at all: the header is
   sticky (a 500-row export is unusable otherwise), the numbers are right
   aligned with tabular figures so columns line up digit for digit, and the
   first column keeps a little more weight — the same affordance a spreadsheet
   gives its row labels. Colours are the shell's own tokens; there is nothing
   here an IDE theme would not already know how to paint. */
.artifacts-table-view { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.artifacts-table-status {
  flex: none; padding: 6px 10px;
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.artifacts-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.artifacts-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 12px; }
.artifacts-table-headrow { position: sticky; top: 0; z-index: 1; }
.artifacts-table-th {
  position: sticky; top: 0; z-index: 1;
  background: var(--dsw-alias-bg-layer-2);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  border-right: 1px solid var(--dsw-alias-border-l1);
  padding: 0; text-align: left; font-weight: 600; white-space: nowrap;
}
.artifacts-table-th.is-sorted { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-table-sortbtn {
  display: flex; align-items: center; gap: 4px; width: 100%;
  padding: 5px 8px; border: 0; background: transparent; cursor: pointer;
  font: inherit; font-weight: 600; color: var(--dsw-alias-label-secondary);
  text-align: left;
}
.artifacts-table-sortbtn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.artifacts-table-sortbtn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.artifacts-table-headtext { overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.artifacts-table-arrow { flex: none; font-size: 9px; color: var(--dsw-alias-state-business-primary); }
.artifacts-table-td {
  padding: 4px 8px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  border-right: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-primary);
}
.artifacts-table-td.is-number { text-align: right; font-variant-numeric: tabular-nums; }
.artifacts-table-td.is-first { color: var(--dsw-alias-label-primary); }
.artifacts-table-tr:hover .artifacts-table-td { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-table-empty { color: var(--dsw-alias-label-dimmed); }

/* ── Audio / video ────────────────────────────────────────────────────────
   The element brings its own controls: the shell's player is the browser's, and
   anything drawn on top of it would only be a second, worse transport. */
.artifacts-media { display: flex; flex-direction: column; gap: 10px; padding: 14px; min-height: 0; overflow: auto; }
.artifacts-media-frame { display: flex; justify-content: center; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; padding: 8px; }
.artifacts-media-frame.is-audio { padding: 16px 12px; }
.artifacts-video { max-width: 100%; max-height: 60vh; border-radius: 4px; background: #000; }
.artifacts-audio { width: 100%; max-width: 520px; }
.artifacts-media-meta { display: flex; align-items: baseline; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-media-kind { flex: none; padding: 1px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.artifacts-media-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifacts-media-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-media-error { font-size: 12px; color: var(--dsw-alias-state-warn-label); line-height: 1.6; }

/* ── Binary document card ─────────────────────────────────────────────────
   Says what the file is and why it is not being decoded, then offers the two
   honest ways out. A card is the whole point: showing the bytes as text is the
   screen of mojibake this replaced. */
.artifacts-doc-card {
  display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
  margin: 14px; padding: 16px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
}
.artifacts-doc-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.artifacts-doc-text { margin: 0; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.artifacts-doc-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.artifacts-doc-btn {
  padding: 5px 12px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
}
.artifacts-doc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-doc-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.artifacts-doc-btn:disabled { opacity: 0.6; cursor: default; }
.artifacts-doc-btn.is-primary { background: var(--dsw-alias-button-primary-fill); border-color: transparent; color: #fff; }
.artifacts-doc-btn.is-primary:hover { background: var(--dsw-alias-button-primary-fill); opacity: 0.9; }
.artifacts-doc-note { padding: 6px 10px; font-size: 11px; color: var(--dsw-alias-state-warn-label); }

/* ── Office documents (docx / xlsx / pptx) ────────────────────────────────
   The widget itself is styled by the SHARED stylesheet (src/shared/office.css,
   appended to this file's stylesheet at build time) so the shell's sidebar and
   the popout tab cannot drift. What is here is only the box it is mounted in:
   the widget tries to fill it, and degrades to content height when the seat
   gives no definite height — a document that scrolls with the panel is a fine
   outcome, a collapsed one is not. */
.artifacts-office { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; }
.artifacts-office-host { flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden; }
/* …and the same box when the shell's document seat mounts it: the body wrapper
   has to be a flex column for the widget below it to get a height at all. */
.artifacts-doc.is-office { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* The lent PDF body (only on an engine whose own PDF renderer cannot run).
   The plugin's PdfView fills its parent ABSOLUTELY, so that parent must be
   positioned and have a height: the seat's own box can report zero height for
   a body that does not claim a scrollport, and a PDF drawn into a zero-height
   relative box is an invisible PDF. Hence the min-height floor. */
.artifacts-doc.is-pdf { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 320px; }
.artifacts-doc.is-pdf > .artifacts-pdfview { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }

/* ── 编辑 (editing) ──────────────────────────────────────────────────────────
   The editor pane: a toolbar (预览/编辑 toggle, 重新载入, 保存), an optional
   conflict bar, and the CodeMirror mount. CodeMirror's own colours come from
   EditorView.theme in src/shared/editor.js — a plugin cannot reliably restyle
   .cm-* from here, because CodeMirror injects its sheets after this one and both
   are plain classes. What belongs here is the box: the mount must be a definite
   height inside a flex column, or the editor collapses to zero and shows
   nothing. */
.artifacts-editpane { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; min-height: 0; }
.artifacts-edbar {
  box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 8px;
  height: var(--frog-h-strip); padding: 0 var(--frog-pad-x);
  border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
}
.artifacts-edbar-group { display: flex; align-items: center; gap: 6px; min-width: 0; }
.artifacts-edbar-group:first-child { flex: none; }
/* The right-hand group carries the status and the two actions; it takes the
   remaining width so the buttons stay at the right edge however long the status
   text is. */
.artifacts-edbar-group:last-child { flex: 1 1 auto; justify-content: flex-end; }
.artifacts-edbtn {
  appearance: none; flex: none; font: inherit; font-size: 11px; font-weight: 500; line-height: 1.4;
  padding: 2px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary);
  transition: color .15s, border-color .15s, background .15s;
}
.artifacts-edbtn:hover:not(:disabled) { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-dimmed); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-edbtn:disabled { opacity: .6; cursor: default; }
.artifacts-edbtn.is-on { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-active); border-color: var(--dsw-alias-label-dimmed); }
/* 保存 is the pane's one primary action. */
.artifacts-edbtn-save { font-weight: 600; }
.artifacts-edbtn-save:not(:disabled) { color: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.artifacts-edbtn-save:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-accent); }
.artifacts-edbtn-force { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); }
/* The two-step confirm (重新载入 / closing a dirty tab). */
.artifacts-edbtn.is-armed { color: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover); }
.artifacts-ednote { flex: none; font-size: 11px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.artifacts-edstatus { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.artifacts-edstatus.is-dirty { color: var(--dsw-alias-state-business-primary); }
.artifacts-edstatus.is-bad { color: var(--dsw-alias-state-error-primary); }
/* The conflict bar: the file changed under the editor. It states the fact and
   offers the only two honest answers — take the disk version, or overwrite it. */
.artifacts-edconflict {
  box-sizing: border-box; flex: none; display: flex; align-items: center; gap: 6px;
  padding: 4px var(--frog-pad-x); font-size: 11px;
  background: var(--dsw-alias-interactive-bg-hover); border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
}
.artifacts-edconflict-ico { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; font-size: 10px; font-weight: 700; color: var(--dsw-alias-bg-layer-1); background: var(--dsw-alias-state-error-primary); }
.artifacts-edconflict-text { flex: 1 1 auto; min-width: 0; }
.artifacts-edconflict-actions { flex: none; display: flex; align-items: center; gap: 6px; }
/* The mount. A relative position gives the loading hint a box to sit in while
   the 604 KB CodeMirror bundle arrives, and the definite height is what makes
   the scroller scroll instead of growing the panel. */
.artifacts-edmount { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.artifacts-edcm { flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden; }
.artifacts-edcm .cm-editor { height: 100%; }
.artifacts-edcm .cm-editor.cm-focused { outline: none; }
.artifacts-edhint {
  position: absolute; inset: auto 0 0 0; padding: 6px var(--frog-pad-x);
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-1); border-top: 1px solid var(--dsw-alias-border-l2);
}