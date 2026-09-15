# vendored: CodeMirror 6 (`codemirror.min.js`)

The panel's Markdown / text editor. CodeMirror is **not** an npm dependency of
this plugin: like pdf.js, MathJax, Mermaid, JSXGraph and the Office readers, it
is a vendored build served to the browser from an embedded copy, so the plugin
stays dependency-free and works fully offline.

## What this file is

A single IIFE that assigns the CodeMirror API to the global `DshFrogCM`. Both
faces of the plugin read that global: the client bundle's React editor and the
popout page's plain-DOM editor load the script lazily from
`/dsh-sidebar-frog/codemirror/codemirror.min.js` (see `src/shared/editor.js`),
and nothing is fetched until someone actually opens the editor.

`scripts/build.js` embeds these bytes into `src/host.js` as a string literal
(`@@CODEMIRROR_LIB@@`); `src/host/routes.js` serves them as
`application/javascript`. It is deliberately NOT inlined into `src/client.js`,
which stays a readable ~430 KB single file.

## Why it is not built from `package.json`

The plugin's `package.json` has no `dependencies` on purpose — an installed DSH
profile gets exactly one package, nothing to resolve. Building the editor
therefore happens in a scratch project outside this repository and only the
**output** is committed here.

## How to rebuild

```sh
mkdir ../cm-build && cd ../cm-build
npm init -y
npm i @codemirror/state @codemirror/view @codemirror/commands @codemirror/language \
      @codemirror/search @codemirror/lang-markdown @codemirror/lang-javascript \
      @codemirror/lang-json @codemirror/lang-python @codemirror/lang-yaml \
      @codemirror/lang-css @codemirror/lang-html
# as entry.js, use the checked-in copy:
#   <repo>/scripts/vendor-codemirror-entry.js
npx esbuild entry.js --bundle --minify --format=iife \
  --global-name=DshFrogCM --target=es2020 --legal-comments=none \
  --outfile=codemirror.min.js
cp codemirror.min.js <this directory>/
```

`--target=es2020` matters: the product supports older Chromium builds (the
plugin's own PDF history is a browser-version story), and esbuild's default
target would emit syntax those builds reject.

## Versions in this build

| Package | Version |
| --- | --- |
| `@codemirror/state` | 6.7.4 |
| `@codemirror/view` | 6.43.11 |
| `@codemirror/commands` | 6.11.0 |
| `@codemirror/language` | 6.12.4 |
| `@codemirror/search` | 6.7.2 |
| `@codemirror/lang-markdown` | 6.5.2 |
| `@codemirror/lang-javascript` | 6.2.5 |
| `@codemirror/lang-json` | 6.0.2 |
| `@codemirror/lang-python` | 6.2.1 |
| `@codemirror/lang-yaml` | 6.1.3 |
| `@codemirror/lang-css` | 6.3.1 |
| `@codemirror/lang-html` | 6.4.12 |
| `@lezer/common` | 1.5.2 |
| `@lezer/highlight` | 1.2.3 |
| `@lezer/markdown` | 1.7.2 |
| `@lezer/lr` | 1.4.10 |
| `style-mod` | 4.1.3 |
| `w3c-keyname` | 2.2.8 |
| `crelt` | 1.0.7 |

Bundle size: **604 KB** minified (618,896 bytes).

## Licence

MIT — Copyright (C) 2018-2021 by Marijn Haverbeke and others. The full text is
`LICENSE` in this directory. Every package above is MIT; `@lezer/*`, `style-mod`
and `w3c-keyname` carry the same holder and licence.
