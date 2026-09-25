# Popout Sidebar · dsh-sidebar-frog

**English** · [简体中文](./README.zh-CN.md)

[![ci](https://github.com/zengqingsong/dsh-sidebar-frog/actions/workflows/ci.yml/badge.svg)](https://github.com/zengqingsong/dsh-sidebar-frog/actions/workflows/ci.yml)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/zengqingsong/dsh-sidebar-frog)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/logo-dark.svg" />
    <img src="docs/logo/logo.svg" alt="dsh-sidebar-frog" width="448" height="128" />
  </picture>
</p>

A sidebar for **DeepSeek Harness** that keeps what you keep reaching for within reach: the files the agent created or edited, and the workspace it did it in. Click a file and it opens at full panel width with an offline preview; when the sidebar feels too narrow, pop it out into its own browser tab and drag it to a second monitor. Both windows share one session, one workspace and one set of settings, live.

Forked from [e2mcc/dsh-popout-sidebar](https://github.com/e2mcc/dsh-popout-sidebar) (MIT, Copyright (c) 2026 Qinyun Cai). The upstream notice is kept verbatim in [LICENSE](./LICENSE), and what this fork added is listed under [Credits](#credits).

- **Unofficial community plugin** — an independent project, not affiliated with or endorsed by DeepSeek.
- **MIT** · zero runtime dependencies · **no network requests** · no telemetry.
- Reads and writes only inside the session workspace. Every data route is fenced with the browser cookie exactly the way the product's own `/api` is, and answers `401` without it.
- Every preview library is **bundled**, so it works offline, on an intranet, behind no CDN.
- Targets DSH `0.1.7-rc.2` on the `web` profile. Installing runs **no build script**.

## Highlights


|      | What                        | Why it matters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🖥️ | Pop out to a second monitor | One click moves the whole sidebar into its own browser tab. Session, workspace, settings and the divider position are shared, so the two windows never drift apart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 🎨   | Markdown skins and raw HTML | Rendered Markdown can wear another platform's document typography — GitHub, WeChat, Zhihu — alongside the default, picked from this plugin's own section in Settings (the Markdown document skin row); a skin changes layout and structure only, so its colors still come from the theme and it holds in light and dark alike, and it applies to the panel, the system sidebar's document tab and the popout page at once. The raw HTML a README is built from renders too: a picture element with a dark/light source, a plain img, and the badge shape where an image sits inside a link — with relative image paths resolved against the document's own directory. |
| 🎯   | Quote the lines you mean    | Select a paragraph in a rendered document and a small bar appears over it naming its source lines ("第 12–14 行"); 引用 puts that locator plus exactly those lines into the composer, and 定位 opens the file in the editor with the same lines selected. It works on headings, paragraphs, list items, quotes, tables and fenced blocks, and it resolves through nested content correctly (a list item inside a blockquote reports the line it really is on). A Markdown fence quotes as one block: its lines are not addressed individually, because splitting the highlighted markup per line would break what you copy out of it.                                   |
| 📦   | Previews that work offline  | Code, Markdown with math and diagrams, PDF, HTML, images, sortable CSV tables, Word / Excel / PowerPoint, and audio and video with HTTP Range. Every renderer is bundled — no CDN, no network call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 🌳   | An artifact ledger          | Files the agent wrote or edited appear on their own, including files produced indirectly by a shell command. Edited files keep their before/after hunks, and Undo lives there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ↔️ | The workspace file tree     | The column shows exactly **one** file tree: this plugin's, in the **Files** tab, with `@`-references into the composer, the context menu, create/delete, per-directory refresh and the A/M letters — instead of two trees drawing the same workspace. Turn on 「显示系统的文件树」 in Settings and the system's own tree (live directory watching included) comes back as a **File tree** tab beside it. The same `@`-reference is also mounted on the system document preview's own toolbar, so a file opened from the system tree can be referenced too.                                                                                                                                                                                                                            |
| ✏️ | Editing and saving in place | Markdown, plain text and CSV open in a CodeMirror editor with`Ctrl+S`. The save is fenced to the workspace, checked against the version you opened, and puts the file's own line endings and byte-order mark back.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 🌿   | A read-only Git slice       | Branch, ahead/behind, and the changed / staged / untracked / conflicted lists, with a line-level diff against HEAD for any file. Read-only is a hard boundary: no staging, no commit, no checkout, no discard.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Install

```sh
# 1) keep DSH itself current
npm install -g @deepseek-ai/dsh

# 2) install this plugin
dsh plugin --profile web add github:zengqingsong/dsh-sidebar-frog
```

Then restart the DSH service and hard-refresh the browser (`Ctrl/Cmd+Shift+R`). The right sidebar gains five tabs — **File tree**, **Artifacts**, **Jobs**, **Usage** and **Git** — beside the system's own **Files** tab, and a permanent **File tree** button appears at the bottom of the left column, which is also how you get into the sidebar from a brand-new session.

To update, run the same `add` command again. To remove it, `dsh plugin --profile web remove dsh-sidebar-frog`.

## Install from a local checkout

To read the source, change it, and see the change in the running GUI without publishing anything, install the checkout itself rather than the repository:

```sh
git clone https://github.com/zengqingsong/dsh-sidebar-frog
cd dsh-sidebar-frog
dsh plugin --profile web add .
```

Then restart DSH and hard-refresh the browser, the same as above.

`dsh plugin` is a thin forwarder to `pnpm`, which it runs in the profile directory — so a relative spec like `.` is rewritten against the directory you invoked it from. `add .` from the checkout is what you want; an absolute path (`add D:\src\dsh-sidebar-frog`) works too. pnpm records the result as `link:…` in the profile's `package.json`, so the profile loads **your working tree through a symlink** instead of a copy, and an edit needs no reinstall.

Both bundle halves are generated, so the loop after changing anything under `src/` is:

```sh
npm run build       # regenerate src/host.js and src/client.js
npm run check:fast  # assertions only, no browser
npm run check       # assertions plus the real-browser suite
```

then restart DSH and hard-refresh the browser. The host prints the build id on startup and the popout page carries it in a `meta` tag, which is how you tell whether the restart took. Host changes need the process restarted; client changes need the page reloaded as well.

Nothing on this path runs a build script at install time, so pnpm never stops to ask you to approve one — that prompt belongs to git-hosted specs.

To go back to the released build:

```sh
dsh plugin --profile web remove dsh-sidebar-frog
dsh plugin --profile web add github:zengqingsong/dsh-sidebar-frog
```

## Features

- **Popout page.** `/dsh-sidebar-frog` is a standalone two-column page — preview on the left, file tree or ledger on the right, with a draggable divider. It is a normal tab, so you can drag it to another monitor, and it stays in sync with the sidebar through a `storage` bridge. **Its top is two rows, 60px in all**: a window row (the title and a connection dot — green for live, red for offline or unauthenticated), and below it one row that carries both **the open file's path and its actions** (copy path / `@`-reference / fullscreen) and the **产物 / 文件树 tabs**. The path strip and the tab strip used to own a row each; merged, that row goes back to the document, and the bar's width is measured from the preview pane itself so it tracks the divider as you drag it. The `@` button on the popout page writes the reference straight into the main window's composer; if that window is gone, it falls back to the clipboard. **It opens — like the sidebar — on the file tree**: the tree is how you reach a file, the ledger is what the agent changed, which is the question you ask afterwards. Switch the file tree off and both fall back to the ledger, since there is no tree left to open on.
- **Open the file you are looking at in the popout.** Every open document carries a **在弹出页打开** link, and it never costs a row of its own: in the editor's own toolbar where the file is editable (a row that has to exist anyway, for 预览/编辑/保存), and otherwise at the right end of the **file-tab strip** — the row above the document. In the system sidebar the product's own header row is the one that carries the document's controls, so editable files use the editor toolbar and everything else (HTML, images, Office, PDF, a file too large to edit) uses the **file tab's actions menu** — `在弹出页打开 <name>`, which is also the only entry that can reach a file this plugin does not draw at all. The file tree's context menu carries the same item, for any file. One click opens or reuses the popout tab **on that file**, addressed absolutely against the session workspace, so the same document is on screen in both places. The popout page honours `?path=<file>` on load and reveals the file in its tree; a path that no longer exists says so in the preview area instead of quietly showing the list. (The header itself does take contributions — that is where `@引用` is offered, see below — but the popout link stays on the tab strip so it is reachable for documents this plugin does not render.)
- **Fullscreen preview on the popout page.** The preview bar's 全屏 button gives the document the whole screen — the Fullscreen API where the browser allows it (no chrome, no taskbar: what a document on a second monitor wants), and a CSS mode that fills the tab where the API is missing or refuses, such as inside an embedding frame. `Esc` leaves it either way, and the button reports the state it is in (`aria-pressed`), including when the browser changes it on its own.
- **Artifact ledger.** Successful `write` and `edit` calls are recorded as they happen, with the file's type, its change letter and its before/after text. Shell commands are covered too: the workspace is fingerprinted before and after `bash` / `pwsh` runs, so a chart or a report produced by a script is picked up as well. Removing an entry and undoing a change both go through the same bounded history.
- **File tree.** Expand, collapse, filter, keyboard navigation, per-directory refresh (the toolbar refresh keeps your expansion state; `Shift`-click reloads everything), and a context menu with copy path, copy relative path, `@`-reference, refresh this folder, expand/collapse all, and delete for the single row you right-clicked. Expansion state survives reloads.
- **Its icons are the built-in tree's icons.** The tree draws with the product's own file-type artwork: a code file gets its language's full-colour square (48 of them — `.js`, `.ts`, `.py`, `.rs`, `.go`, `package.json` …), anything else gets a file card whose mark names the kind (MD / PDF / a spreadsheet / a play triangle / an image) and whose colour comes from the category, and folders use the product's own folder glyph. Both faces — the sidebar panel and the popout page — read one artwork table and one classifier, so a file looks the same in either window. The 48 brand glyphs' drawing instructions are extracted from **the DSH installed on this machine** by `scripts/gen-filetype-icons.js`, and `npm run check` fails when the committed module has drifted from that install rather than quietly keeping stale icons.
- **Tabs wear the same set.** The popout's two view chips (**产物** / **文件树**) draw the product's own 16-box stroke marks — 产物 is its deliverables-row stack of pages, 文件树 the outline folder its 文件 tab uses — and every open file tab in the panel shows **its own type glyph**, from the same classifier the tree rows use, so a tab and the row that opened it cannot disagree. The native column's chooser rows carry one too, and the 文件树 row reuses the product's `GuideArtworkFiles` artwork verbatim, so it sits beside the product's own 文件 entry without looking foreign.
- **Deleting from the tree.** Right-click one file — or one folder, which goes recursively — and that entry alone is removed from disk; the popout page offers the same item. The menu item only arms the action: a dialog that names the target has to be confirmed, and `Enter` / `Esc` run or cancel it. Every deletion is fenced by the host to the session workspace, which refuses the workspace root, a path outside it, a socket or a FIFO, and a locked file, and answers with its reason instead of failing silently. `清除` in the artifact ledger is deliberately a different thing: it drops the in-memory record and never touches disk.
- **Previews.** Code with syntax highlighting, Markdown with MathJax, Mermaid and JSXGraph, PDF, HTML, images, CSV and TSV as sortable tables, Word / Excel / PowerPoint rendered fully offline, and audio and video streamed with byte ranges so the scrubber actually works. A file it cannot render gets a short explanation instead of mojibake.
- **Renderers lent to the system sidebar.** The same Markdown, table and Office renderers register into the product's own document-preview registry, so the system's Markdown preview gains math and diagrams, spreadsheets stop being one long line of text, and Word / Excel / PowerPoint become readable there too. Each of the three is a separate switch, and the settings page states which ones actually took effect.
- **Editing and saving.** Markdown, plain text and CSV are editable in the panel, on the popout page, and in the system sidebar's own document page (the gate there is "the whole file arrived in one delivery" — the seat pages text by 5000 lines, so anything up to that is editable and a longer file goes out to the popout page's editor through 在弹出页打开). A save that conflicts with a change made in the meantime is refused with a clear choice rather than written over, and it joins the same undo history as the agent's edits — so Undo takes your change back too.
- **Git slice.** Branch, ahead/behind and four file lists, each row opening that file's diff against HEAD. Every git call goes through the harness's own subprocess service with a literal argument vector, and no mutating verb exists anywhere in the code.
- **Usage.** Context occupancy, its breakdown and cumulative token usage, read from the same session projection the ring above the composer uses, so the two can never disagree.
- **Settings and theme.** Seven switches and three width preferences, all reachable from the standard settings page, following the harness's light and dark themes.

The built-in browser view that earlier versions carried has been **removed**. It could only show a local page through an unauthenticated route, and the product's own document preview already renders workspace HTML, so the trade was not worth a route that answered without the browser cookie.

## Settings


| Setting                                         | Default                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expand on load                                  | on                          | Open the panel after the page loads. On the native sidebar it also opens this plugin's**File tree** page for a brand-new session, which both expands the column and lands on the tree. Sessions you have already used are never touched.                                                                                                                                                                                                                          |
| Auto refresh                                    | on                          | Poll for new artifacts every two seconds while the panel is open. The popout page obeys this switch as well, and still refreshes once when you return to it.                                                                                                                                                                                                                                                                                                      |
| File tree                                       | on                          | Show the file tree on the floating panel's strip. The native sidebar does not offer this switch: this plugin's tree always has a place in that column (which tab it takes is the next two rows).                                                                                                                                                                                                                                                                    |
| Carry the panel in the system right sidebar     | on                          | Register every view as a tab of the system right sidebar, so expansion, fullscreen, drag-width and the tab strip are the system's. Switching it off returns the panel to its floating form; the system's own**Files** tab is untouched. Takes effect on page refresh.                                                                                                                                                                                             |
| Show the system's file tree                     | off                         | **Off (the default):** the column holds exactly one file tree — this plugin's, in the **Files** tab (`@`-references, context menu, create/delete, per-directory refresh, A/M letters), with one file-tree entry on the Start page. The cost, stated: the system's live directory watcher lives inside its own page, so taking that tab over switches it off; this plugin re-reads the directories its artifact data says changed, and a file changed by another editor needs one manual refresh. **On:** the system's **Files** tab gets its own tree back (live watching and auto-refresh included) and this plugin's tree is a **File tree** tab beside it — two trees. Takes effect on page refresh. |
| Render system Markdown with this plugin         | on                          | Lend the Markdown renderer to the system's document previews, so the system sidebar gets math, Mermaid and JSXGraph. Off hands it back to the built-in renderer. Takes effect immediately.                                                                                                                                                                                                                                                                        |
| Render system tables with this plugin           | on                          | Lend the table renderer for`csv` and `tsv`. The product has no table renderer of its own, so there is no trade-off here. Takes effect immediately.                                                                                                                                                                                                                                                                                                                |
| Render system Office documents with this plugin | on                          | Lend the Office reader for`docx`, `xlsx` and `pptx`, which the system cannot display otherwise. It only affects the system sidebar; this plugin's own panel renders Office either way.                                                                                                                                                                                                                                                                            |
| Default panel width                             | 26%                         | The floating panel's width when expanded, 20–85% of the window. On the native sidebar the width belongs to the system, so this is not shown.                                                                                                                                                                                                                                                                                                                     |
| Minimum panel width                             | 20%                         | The floating panel's floor, 20–60%. File names stay readable regardless, so they are never ellipsised at small window sizes.                                                                                                                                                                                                                                                                                                                                     |
| Markdown document skin                          | Default (follows the theme) | The typography rendered Markdown wears: Default / GitHub / WeChat / Zhihu. Layout and structure only — colors come from the current theme, so a skin is right in light and dark alike. Applies to the sidebar panel, the system sidebar's document tab and the popout page together, with immediate effect.                                                                                                                                                      |
| Line numbers in the preview                     | off                         | Show the**source** line number of every top-level block in a gutter down the left edge of a rendered document — the answer to "which line is this?" without leaving the reader. Multi-line blocks show their range (`12–18`). The numbers are stamped on the blocks when the document is rendered, so they are the file's real lines and always agree with what "Quote / Locate" reports for a selection. Off by default: it is chrome added around a document. |
| Line numbers in the editor                      | on                          | CodeMirror's own line-number column, in the panel's editor and the popout page's alike. Turning it off buys back a little width on a narrow panel. The switch is applied to a running editor, so the cursor position, the undo history and any unsaved draft survive the flip.                                                                                                                                                                                    |
| Popout preview width                            | 80%                         | The preview's share of the split on the popout page, 20–80%. Dragging the divider adjusts it temporarily.                                                                                                                                                                                                                                                                                                                                                        |

## How it works

The plugin ships as two committed halves and needs no build at install time.

**Host** (`src/host.js`) registers its routes with the web server — the popout page, the data routes, the bundled renderer assets and the editor. It reaches `webServer` through a dynamic injection rather than a hard dependency, so on a profile without a web server the plugin still loads and still tracks artifacts; it simply has no routes to offer. Every data route opens by asking the connection service for a verdict, the same Host/Origin and cookie check the product applies to `/api`. The host also listens on the tool lifecycle: `tools/result` for direct `write` and `edit` calls, and `tools/execute` to capture the previous file contents that make undo possible, and to diff workspace fingerprints around shell commands.

**Client** (`src/client.js`) registers the five system tabs and their bodies into the keyed seats the sidebar exposes, lends the renderers to the document-preview registry, and adds the two entry points the system does not provide — the footer button and the per-tab "open in a new tab" menu item. When the registry is missing or rejects a registration, it rolls back and falls back to its own floating panel.

**Cross-window bridge** (`src/shared/bridge.js`) is the sidebar and the popout page talking through `storage` events. Session, settings and divider position are shared, and the `@`-reference request travels with a nonce and a ten-second validity window so a stale message is never mistaken for a fresh one.

## Compatibility and risk

- Built and tested against **DSH `0.1.7-rc.1`** on the `web` profile, which is the profile that has a browser UI.
- On a build whose right-sidebar tab registry is missing or has changed shape, the plugin falls back to its floating panel instead of failing to load.
- It reads and writes only paths inside the session workspace. Writes are limited to the edit-and-save feature and to removing an artifact entry, and both are checked against the workspace root before anything touches disk.
- It makes no outbound network request of any kind, and it reports nothing anywhere.
- Installing it runs no build script, so package managers will not ask you to approve one.
- It is an unofficial plugin: it is not reviewed or endorsed by DeepSeek, and you should read the source of any plugin before installing it.

## Verification

The host half passes [`dsh-plugin-verify`](https://github.com/qing3a/dsh-plugin-verify) — a full agent loop against a mock LLM, with the harness's waterfall chain watched end to end:

```sh
npx dsh-plugin-verify . --repo <dsh-checkout>
# the CLI answers, verbatim: "✅ 通过 | 捕获事件: 13 | waterfall: 7/7 | tools/result: 是"
#                       i.e.  pass | events: 13 | waterfall: 7/7 | tools/result: yes
```

All seven waterfall events fire and `tools/result` closes cleanly, with no bare `child_process` spawn and no `single`-slot registration. The part that matters for a sidebar plugin is what the check says about the profile you are *not* running: the host declares **no static `inject`**, so on a headless assembly the plugin still applies and still tracks artifacts, and only the HTTP routes are missing. A static `inject: ['webServer']` would have switched the whole plugin off there, waterfalls included — silently.

Four checks stand behind that, and they are independent on purpose — each one can fail for a different reason:

- **The working tree**, through `dsh-plugin-verify` (above): 7/7 waterfall, `tools/result` clean, no bare `child_process` spawn, no `single`-slot registration.
- **The packed artifact**, which is what a marketplace actually installs: `npm pack`, then `dsh plugin --profile headless add <the tarball>`. pnpm installs it, the profile's `dsh.profile.bundles` gains `dsh-sidebar-frog` beside the shipped bundles, and the host logs the same build id out of `node_modules` rather than out of a checkout — the loop still ends 7/7. Nothing on that path runs a build script, and the only step that needs the network is the fetch.
- **The registry's own admission test**: `dsh --profile headless --dump-config` exits 0 with the package installed — the gate `awesome-dsh-plugins` applies before it will list anything as verified.
- **Every push, on Linux and Windows**: the guard suite, 228 assertions plus 39 cases driving the pop-out page in real Chrome.

## Development

```sh
npm run build       # rebuild src/host.js and src/client.js from src/**/*.js
npm run check       # the guard suite, then the real-browser tests
npm run check:fast  # the same suite without launching a browser
```

`src/host.js` and `src/client.js` are generated from the modules under `src/`, and both are committed so that an install needs no build step. Assertions live in `scripts/check.js` and the browser tests in `scripts/browser-tests.js`.

The running build is identified by a short id. The host prints it on startup and the popout page carries it in a `meta` tag, which is the quickest way to tell whether a restart and a hard refresh actually took:

```sh
# the log line when the process starts
#   [artifacts] dsh-sidebar-frog build 00000000
```

## Credits

Written and maintained by [曾青松 (Zeng Qingsong)](https://github.com/zengqingsong).

It began as a fork of [e2mcc/dsh-popout-sidebar](https://github.com/e2mcc/dsh-popout-sidebar) by Qinyun Cai, whose upstream license notice is preserved unchanged in [LICENSE](./LICENSE). Since then the plugin has grown an artifact ledger, the file-tree takeover of the system sidebar, the offline preview and Office readers, editing and saving, the read-only Git slice, and the renderers lent back to the system — most recently, Markdown document skins, raw HTML (`<picture>` and badge image links), source-line quotes taken straight from a selection, plus the fix for "open in the system sidebar" failing because the plugin could not read the current session.

The bundled renderers are third-party work, used under their own licenses, with their texts kept under `src/vendor/`: pdf.js, MathJax, Mermaid, JSXGraph, CodeMirror, docx-preview, JSZip, SheetJS and the PowerPoint renderer.

## License

[MIT](./LICENSE) — including the original upstream copyright notice.

<p align="left">
  <img src="docs/logo/gzpu.jpg" alt="Guangzhou Polytechnic University" width="128" height="128" />
</p>

Developed and maintained at **Guangzhou Polytechnic University** ([gzpyp.edu.cn](https://www.gzpyp.edu.cn/)) by [曾青松 (Zeng Qingsong)](https://github.com/zengqingsong).
