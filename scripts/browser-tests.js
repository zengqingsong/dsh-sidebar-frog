/**
 * Real-browser tests for the popout page (`src/host/page.js`).
 *
 *   node scripts/browser-tests.js            # headless Chrome/Edge, skipped if absent
 *   DSH_TEST_BROWSER=/path/to/chrome node scripts/browser-tests.js
 *
 * The popout page is plain DOM (no React, no build step), and three of its bugs
 * so far were only visible in an engine:
 *
 *   • the tree toolbar's「全部展开 / 全部折叠」buttons were `display:none`-ed by a
 *     container query at the panel's default width, so「刷新」sat under the
 *     cursor instead and clicking changed nothing;
 *   • a `position: fixed` menu placed with viewport coordinates was drawn inside
 *     the panel's containment box, i.e. off screen;
 *   • the menu rebuilt every item on `mouseenter`, replacing the button under the
 *     pointer, so the mousedown and mouseup landed on different nodes and no
 *     `click` ever reached the item.
 *
 * Node-side stubs cannot see any of that. This file boots the assembled page
 * against a stub host and drives it with real mouse and keyboard input through
 * the DevTools protocol (scripts/cdp.js), asserting on what the user sees:
 * which rows exist, whether a folder is expanded, where the menu was drawn, and
 * whether a click on a menu item actually ran it.
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildBundles } from './build.js'
import { launch, findBrowser } from './cdp.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = 'D:\\ws'

// The stub file system. Keys are paths relative to ROOT with "/" separators.
const TREE = {
  '': [['src', true], ['docs', true], ['README.md', false], ['notes.txt', false]],
  'src': [['deep', true], ['app.js', false], ['util.js', false]],
  'src/deep': [['inner.js', false], ['dsh-sidebar-frog.config.json', false]],
  'docs': [['guide.md', false], ['data.csv', false], ['report.docx', false], ['book.xlsx', false], ['deck.pptx', false], ['legacy.odt', false], ['clip.mp3', false], ['课件 中文.md', false]],
}

const CONTENT = 'const a = 1\nconst b = 2\n'
// Delimited text with a numeric column and one missing value: the table view's
// two deliberate rules (numeric-aware sorting, blanks pinned last) are only
// observable on data that has both.
const CSV = 'name,qty\nbanana,10\napple,2\ncherry,\n'
// A quote holding blocks rather than a run of text: a list, inline emphasis, and
// a line after the quote so the assertion can tell the quote ended. Inside a
// quote these are blocks, and the panel used to paint their markers as literal
// characters — the failure mode is visible in the document, so it belongs in the
// suite that renders one.
const GUIDE_MD = [
  '# guide',
  '',
  '> **Note** — the ledger keeps the before/after text.',
  '>',
  '> - Ctrl+S saves in place',
  '> - Undo joins the same history as the agent',
  '',
  'after the quote',
  '',
  '- outer',
  '  - inner one',
  '  - inner two',
  '',
  '| key | value |',
  '| --- | --- |',
  '| union | `a \\| b` |',
  '',
  // The README shapes: a badge, which is an image INSIDE a link, and a <picture>
  // whose two URLs are relative to the document.
  '[![ci](badge.svg)](https://example.com/ci)',
  '',
  '<p align="center">',
  '  <picture>',
  '    <source media="(prefers-color-scheme: dark)" srcset="logo-dark.svg" />',
  '    <img src="logo.svg" alt="logo" width="120" height="40" />',
  '  </picture>',
  '</p>',
].join('\n')
// A binary container, as the host would send it: no bytes unless the caller asks
// for them with text=1.
const DOCX_BYTES = 'PK\u0003\u0004docx-bytes-as-text'

// The suffix table the HOST uses, loaded from source rather than re-typed: a
// stub that answers `text` for a .docx would make every assertion below pass for
// the wrong reason.
const extType = new Function(readFileSync(join(HERE, '..', 'src/shared/ext.js'), 'utf8') + '\nreturn extType')()

// The preview's share of the split area, read from source for the same reason as
// the suffix table above: a test that re-types the number keeps passing after the
// setting itself moves — which is exactly what happened when the default went
// from 70% to 80% and this suite was the only thing still asserting 70.
const PREVIEW_PERCENT = new Function(
  readFileSync(join(HERE, '..', 'src/shared/settings.js'), 'utf8') + '\nreturn DEFAULT_SETTINGS.previewHeight')()

// The list/file-tree pane's floor, also read from source: the preview share above
// is measured against a window wide enough to clear it (see the split test).
const SPLIT_LIST_MIN = Number(
  /var SPLIT_LIST_MIN = (\d+)/.exec(readFileSync(join(HERE, '..', 'src/host/page.js'), 'utf8'))[1])

// The localStorage key the settings live under (src/shared/bridge.js), read from
// source rather than re-typed: the line-number test writes settings the way the
// sidebar does, and a renamed key would otherwise make that test pass vacuously.
const SETTINGS_KEY = /settings:\s*'([^']+)'/.exec(
  readFileSync(join(HERE, '..', 'src/shared/bridge.js'), 'utf8'))[1]

// A vendored UMD build, evaluated for Node. `require()` cannot be used: this
// package is `"type": "module"`, so Node parses these files as ES modules, where
// `module`/`exports` do not exist — the UMD then takes its BROWSER branch and
// leaves an empty namespace behind. Handing it a CommonJS-shaped `module` is what
// the browser does for us anyway (the plugin loads them as <script>).
const VENDORED = {}
const loadUmd = (relPath) => {
  if (!VENDORED[relPath]) {
    const src = readFileSync(join(HERE, '..', relPath), 'utf8')
    const mod = { exports: {} }
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'self', 'window', 'globalThis', src)(mod, mod.exports, undefined, undefined, globalThis)
    VENDORED[relPath] = mod.exports
  }
  return VENDORED[relPath]
}
const JSZip = () => loadUmd('src/vendor/jszip/jszip.min.js')
const SheetJS = () => loadUmd('src/vendor/xlsx/xlsx.full.min.js')

// ── Office fixtures ──────────────────────────────────────────────────────────
// Generated, never checked in, and generated with the SAME vendored libraries the
// plugin serves: a fixture written by the reader under test cannot be "a file
// only this plugin can open", and there is no binary blob in the repository to go
// stale. The .pptx is the minimal OOXML package a deck can consist of (that
// library ships no writer).
const OFFICE_TEXT = 'DSH Office 预览测试'
const OFFICE_SHEET = 'DSH Sheet'
const OFFICE_SLIDE = 'DSH Slide 1'

async function makeDocument() {
  const zip = new (JSZip())()
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>')
  zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>')
  const word = zip.folder('word')
  word.file('document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:t>' + OFFICE_TEXT + '</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>第二段：docx-preview 离线渲染的正文。</w:t></w:r></w:p>'
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
    + '</w:body></w:document>')
  word.folder('_rels').file('document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
  // generateAsync, not generate: the synchronous form is one of the methods JSZip 3 removed.
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function makeWorkbook() {
  const XLSX = SheetJS()
  const book = XLSX.utils.book_new()
  const first = XLSX.utils.aoa_to_sheet([
    ['name', 'qty', 'note'],
    ['banana', 10, 'round'],
    ['apple', 2, 'crisp'],
  ])
  const second = XLSX.utils.aoa_to_sheet([[OFFICE_SHEET], ['second sheet']])
  XLSX.utils.book_append_sheet(book, first, '数据')
  XLSX.utils.book_append_sheet(book, second, 'Sheet2')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
}

async function makeDeck() {
  const zip = new (JSZip())()
  const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    + '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
    + '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
    + '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
    + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
    + '</Types>')
  zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="' + RELS + '/officeDocument" Target="ppt/presentation.xml"/>'
    + '</Relationships>')
  const ppt = zip.folder('ppt')
  ppt.file('presentation.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst>'
    + '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>'
    + '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>'
    + '</p:presentation>')
  ppt.folder('_rels').file('presentation.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="' + RELS + '/slide" Target="slides/slide1.xml"/>'
    + '<Relationship Id="rId2" Type="' + RELS + '/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
    + '<Relationship Id="rId3" Type="' + RELS + '/theme" Target="theme/theme1.xml"/>'
    + '</Relationships>')
  const shape = (text) => '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
    + '<p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>'
    + '<p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>'
    + '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" dirty="0"/><a:t>' + text + '</a:t></a:r></a:p></p:txBody></p:sp>'
  ppt.folder('slides').file('slide1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    + '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + shape(OFFICE_SLIDE)
    + '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>')
  ppt.folder('slides').folder('_rels').file('slide1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="' + RELS + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
    + '</Relationships>')
  const layout = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title" preserve="1">'
    + '<p:cSld name="标题幻灯片"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + shape('')
    + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
  ppt.folder('slideLayouts').file('slideLayout1.xml', layout)
  ppt.folder('slideLayouts').folder('_rels').file('slideLayout1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="' + RELS + '/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
    + '</Relationships>')
  ppt.folder('slideMasters').file('slideMaster1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    + ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
    + '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'
    + '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    + '</p:spTree></p:cSld>'
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
    + '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>')
  ppt.folder('slideMasters').folder('_rels').file('slideMaster1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="' + RELS + '/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
    + '<Relationship Id="rId2" Type="' + RELS + '/theme" Target="../theme/theme1.xml"/>'
    + '</Relationships>')
  ppt.folder('theme').file('theme1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="DSH">'
    + '<a:themeElements><a:clrScheme name="DSH"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
    + '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
    + '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
    + '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>'
    + '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>'
    + '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
    + '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>'
    + '<a:fontScheme name="DSH"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    + '<a:fmtScheme name="DSH"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
    + '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    + '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
    + '<a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
    + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle>'
    + '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
    + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
    + '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>')
  // generateAsync, not generate: the synchronous form is one of the methods JSZip 3 removed.
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// The Office fixture bytes, by file name. Built ONCE, before the server starts
// (the builders are async — JSZip 3 writes through generateAsync), so a request
// never pays for a .pptx and a failure to build is a startup error rather than a
// request that hangs forever.
async function buildOfficeFixtures() {
  return {
    'report.docx': await makeDocument(),
    'book.xlsx': await makeWorkbook(),
    'deck.pptx': await makeDeck(),
  }
}

const toWin = (key) => (key ? ROOT + '\\' + key.split('/').join('\\') : ROOT)
// The stub models a Windows workspace on purpose (ROOT is `D:\ws`, and the tree
// keys above are '/'-separated because that is how they are written down), so
// every path the stub hands the client has to be spelled with backslashes on
// every host. `path.join` is the wrong tool for that: on Linux it produced
// `D:\ws/src/app.js`, which no longer matched the path the file tree reported,
// and the ledger row silently stopped offering its diff — two browser
// assertions failed on the Linux runner for a reason that had nothing to do
// with the plugin.
const path = (...parts) => ROOT + '\\' + parts.join('\\')

function relKey(p) {
  if (!p) return ''
  let s = String(p).replace(/\\/g, '/')
  const root = ROOT.replace(/\\/g, '/')
  if (s.toLowerCase().startsWith(root.toLowerCase())) s = s.slice(root.length)
  return s.replace(/^\/+/, '').replace(/\/+$/, '')
}

function listdir(p) {
  const key = relKey(p)
  const node = TREE[key]
  if (!node) return { ok: false, error: 'ENOENT: ' + p }
  const base = toWin(key)
  return {
    ok: true,
    path: base,
    entries: node.map(([name, isDir]) => ({
      name,
      isDir,
      hidden: name.charAt(0) === '.',
      path: base + '\\' + name,
    })),
  }
}

export async function startHost() {
  const { page, build } = buildBundles()
  // The Office fixtures, built before the first request can ask for one.
  const officeFixtures = await buildOfficeFixtures()
  // Every request is recorded: when a test fails with "nothing happened", the
  // first question is always "did the page even ask?".
  const requests = []
  // Bodies posted to /revert, so a test can assert the undo actually reached the
  // host rather than merely painting a button.
  const reverts = []
  // …and to /save: the editor's whole contract is "what you typed reached the
  // host", which is exactly the kind of claim a rendered button cannot make.
  const saves = []
  const server = createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1')
    if (u.pathname !== '/favicon.ico') requests.push(u.pathname + (u.search || ''))
    const json = (obj, code = 200) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(obj))
    }
    const js = (body) => {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      res.end(body)
    }
    if (u.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(page)
      return
    }
    // Keep the console clean: a 404 here would show up as a page error.
    if (u.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return }
    if (u.pathname === '/dsh-sidebar-frog/listdir') return json(listdir(u.searchParams.get('path')))
    if (u.pathname === '/dsh-sidebar-frog/data') {
      return json({
        artifacts: [
          {
            path: path('src', 'app.js'),
            kind: 'edit',
            diff: { before: 'const a = 1\nconst b = 2\n', after: 'const a = 1\nconst b = 3\n' },
            undo: { kind: 'edit', can: true, opId: 'op1' },
          },
          { path: path('README.md'), kind: 'create' },
        ],
      })
    }
    // The change review's undo posts here; the browser suite asserts the request
    // actually left the page (a rendered button that posts nothing is the exact
    // class of bug this suite exists for).
    if (u.pathname === '/dsh-sidebar-frog/revert') {
      if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
      let body = ''
      req.on('data', (c) => { body += c })
      return req.on('end', () => {
        reverts.push(body)
        json({ ok: true, path: path('src', 'app.js'), opId: 'op1', reverted: 'content' })
      })
    }
    if (u.pathname === '/dsh-sidebar-frog/content') {
      // Same contract as the real route: a binary container comes back empty
      // unless the caller explicitly asks for its bytes as text (text=1), and
      // the TYPE is the host's own classification (src/shared/ext.js) — the
      // panel branches on it, so a stub that calls everything "text" would hide
      // a Markdown file being decoded by the code view.
      //
      // `version`/`size` are the revision the 编辑 pane sends back on save.
      const p = String(u.searchParams.get('path') || '').toLowerCase()
      const wantText = u.searchParams.get('text') === '1'
      // A path that is not there answers with the host's own failure shape: the
      // deep-link case asserts that a ?path= naming nothing says so in the preview
      // area instead of quietly leaving the page on the artifact list.
      if (p.endsWith('gone.md')) return json({ ok: false, error: 'ENOENT: no such file (stub)' })
      if (p.endsWith('data.csv')) return json({ ok: true, type: 'table', content: CSV, truncated: false, size: CSV.length, version: 'v1' })
      if (p.endsWith('guide.md')) return json({ ok: true, type: 'markdown', content: GUIDE_MD, truncated: false, size: GUIDE_MD.length, version: 'v1' })
      const type = extType(p)
      if (type === 'office') return json({ ok: true, type: type, content: '', truncated: false, size: 0, version: 'v1' })
      if (type === 'document') return json({ ok: true, type: type, content: wantText ? DOCX_BYTES : '', truncated: false, size: 0, version: 'v1' })
      return json({ ok: true, content: CONTENT, type: type, truncated: false, size: CONTENT.length, version: 'v1' })
    }
    // The editor's engine, served as the REAL vendored bundle: these tests exist
    // to prove the plugin works in an engine, and a stubbed CodeMirror would
    // prove nothing at all.
    if (u.pathname === '/dsh-sidebar-frog/codemirror/codemirror.min.js') {
      const body = readFileSync(join(HERE, '..', 'src/vendor/codemirror/codemirror.min.js'))
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' })
      res.end(body)
      return
    }
    if (u.pathname === '/dsh-sidebar-frog/save') {
      if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
      let body = ''
      req.on('data', (c) => { body += c })
      return req.on('end', () => {
        saves.push(body)
        json({ ok: true, path: path('docs', 'guide.md'), version: 'v2', size: body.length, eol: 'LF', bom: false, revision: 1 })
      })
    }
    // The streaming route. It answers here so the <audio> element's own request
    // is a 200 (a 404 would land in the console and fail the "no console errors"
    // test, which is the suite's canary for exactly this kind of stub gap). An
    // Office file is answered with its REAL bytes: the widget mounted from them is
    // what these tests are about.
    if (u.pathname === '/dsh-sidebar-frog/media') {
      const wanted = String(u.searchParams.get('path') || '').toLowerCase()
      // A REAL image for the Markdown shapes below: an <img> whose naturalWidth
      // is still 0 proves the URL was wrong, which is exactly the failure a
      // document-relative path produced when it resolved against the wrong root.
      if (wanted.endsWith('.svg')) {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#2f9e7a"/></svg>'
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Length': Buffer.byteLength(svg), 'Cache-Control': 'no-store' })
        res.end(svg)
        return
      }
      const fixture = Object.keys(officeFixtures).find((name) => wanted.endsWith(name))
      if (fixture) {
        const body = officeFixtures[fixture]
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' })
        res.end(body)
        return
      }
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' })
      res.end('ID3')
      return
    }
    if (u.pathname === '/dsh-sidebar-frog/search') return json({ ok: true, results: [], local: true })
    if (u.pathname === '/dsh-sidebar-frog/remove') return json({ ok: true })
    if (/^\/dsh-sidebar-frog\/(mathjax|mermaid|jsxgraph|pdfjs)\//.test(u.pathname)) {
      return js('window.MathJax=Object.assign({},window.MathJax,{typesetPromise:function(){return Promise.resolve()},startup:{promise:Promise.resolve(),typeset:false}});')
    }
    // The Office readers are served as the REAL vendored files: these are the
    // only tests that can prove the plugin's documents render in an engine, and a
    // stubbed library would prove nothing. (A module fetch arrives as a script
    // request through the same route.)
    if (u.pathname.indexOf('/dsh-sidebar-frog/office/') === 0) {
      const file = {
        '/dsh-sidebar-frog/office/jszip.min.js': 'jszip/jszip.min.js',
        '/dsh-sidebar-frog/office/docx-preview.min.js': 'docx-preview/docx-preview.min.js',
        '/dsh-sidebar-frog/office/xlsx.full.min.js': 'xlsx/xlsx.full.min.js',
        '/dsh-sidebar-frog/office/pptx-renderer.es.js': 'pptx/pptx-renderer.browser.es.js',
      }[u.pathname]
      if (file) {
        const body = readFileSync(join(HERE, '..', 'src/vendor', file))
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' })
        res.end(body)
        return
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/', build, requests, reverts, saves }))
  })
}

/**
 * Record the raw DOM input events the page receives, so a failing interaction
 * test can say what the engine actually delivered instead of only "nothing
 * happened". A double click must arrive as `click(detail 1) → click(detail 2) →
 * dblclick`; a folder must toggle once.
 */
async function recordEvents(s) {
  await s.evaluate(`(() => {
    window.__ev = []
    const body = document.getElementById('treeBody')
    if (window.__evOff) window.__evOff()
    const rec = (e) => {
      const row = e.target && e.target.closest ? e.target.closest('[data-path]') : null
      const name = row ? String(row.getAttribute('data-path')).split('\\\\').pop() : (e.target && e.target.id) || '?'
      window.__ev.push(e.type + '(detail=' + e.detail + ')' + (e.type === 'mousedown' || e.type === 'click' ? '@' + name : ''))
    }
    const types = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']
    types.forEach((t) => body.addEventListener(t, rec, true))
    window.__evOff = () => types.forEach((t) => body.removeEventListener(t, rec, true))
    return true
  })()`)
}

const eventLog = (s) => s.evaluate('(window.__ev || []).join(" → ")')

// ── assertions ───────────────────────────────────────────────────────────────
const failures = []
let passed = 0

const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const eq = (got, want, msg) => {
  if (got !== want) throw new Error((msg ? msg + ' — ' : '') + 'expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got))
}

// Set by run(): puts the page back into a known state before each test.
let isolate = null

async function test(name, fn) {
  try {
    if (isolate) await isolate()
    await fn()
    passed += 1
    console.log('  \u2713 ' + name)
  } catch (e) {
    failures.push({ name, message: e && e.message ? e.message : String(e) })
    console.log('  \u2717 ' + name)
    console.log('      ' + (e && e.message ? e.message : String(e)))
  }
}

// ── page helpers ─────────────────────────────────────────────────────────────
const rowSel = (p) => '[data-path="' + String(p).replace(/\\/g, '\\\\') + '"]'

const rows = (s) => s.evaluate('[...document.querySelectorAll("#treeBody [data-path]")].map(el => el.getAttribute("data-path"))')
const expandedOf = (s, p) => s.evaluate(
  '(() => { const el = document.querySelector(' + JSON.stringify(rowSel(p)) + '); return el ? el.getAttribute("aria-expanded") : null })()')
const menuOpen = (s) => s.evaluate('!!document.querySelector(".tree-menu")')
const menuRect = (s) => s.evaluate(
  '(() => { const el = document.querySelector(".tree-menu"); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width } })()')
const menuLabels = (s) => s.evaluate('[...document.querySelectorAll(".tree-menu-item")].map(b => b.textContent.trim())')
const viewport = (s) => s.evaluate('({ w: window.innerWidth, h: window.innerHeight })')

async function setOpen(s, p, want) {
  const now = await expandedOf(s, p)
  if (now === null) throw new Error('no row for ' + p)
  if ((now === 'true') === want) return
  const at = await s.center(rowSel(p))
  assert(at, 'no row to click for ' + p)
  await s.click(at.x, at.y)
  await s.waitFor(
    '(() => { const el = document.querySelector(' + JSON.stringify(rowSel(p)) + '); return el && el.getAttribute("aria-expanded") === "' + String(want) + '" })()',
    { label: 'folder ' + p + ' to become ' + (want ? 'expanded' : 'collapsed') },
  )
}

async function rightClickRow(s, p) {
  const at = await s.center(rowSel(p))
  assert(at, 'no row for ' + p)
  await s.click(at.x, at.y, 'right')
  await s.waitFor('!!document.querySelector(".tree-menu")', { label: 'context menu to open', timeout: 4000 })
  return at
}

async function clickMenuItem(s, label) {
  const at = await s.evaluate(`(() => {
    const b = [...document.querySelectorAll('.tree-menu-item')].find((x) => x.textContent.trim() === ${JSON.stringify(label)})
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  assert(at, 'menu item not found: ' + label)
  await s.click(at.x, at.y)
  return at
}

// A menu opened at the pointer may legitimately be nudged left/up to stay inside
// the window (a click near the right edge clamps to innerWidth - menu width), so
// "at the pointer" means "not displaced by more than one menu box". The bug this
// guards against — viewport coordinates used inside a containment box — pushed
// the menu out by a whole panel width, i.e. off screen entirely.
function assertAtPointer(r, at, vp, label) {
  assert(r.left >= 0 && r.top >= 0 && r.right <= vp.w && r.bottom <= vp.h,
    label + ': menu drawn outside the viewport: ' + JSON.stringify(r) + ' in ' + JSON.stringify(vp))
  assert(r.left <= at.x + 8 && r.left >= at.x - 260,
    label + ': menu left ' + r.left + ' is nowhere near the pointer x ' + at.x)
  assert(r.top <= at.y + 8 && r.top >= at.y - 300,
    label + ': menu top ' + r.top + ' is nowhere near the pointer y ' + at.y)
}

// ── the tests ────────────────────────────────────────────────────────────────
async function run(s, shots, host) {
  await s.waitFor('!!document.getElementById("tabs")', { label: 'the page to boot' })

  // A menu left open by a failing test covers the tree, so the NEXT test's
  // clicks land on the menu instead of the row: that is how this suite first
  // mis-reported a double-click bug that did not exist (an empty event log and
  // no /content request were the giveaway). Every test starts from a closed
  // menu.
  isolate = async () => {
    for (let i = 0; i < 3 && (await menuOpen(s)); i += 1) {
      await s.key('Escape')
      await s.wait(80)
      if (await menuOpen(s)) { await s.click(20, 400); await s.wait(80) }
    }
  }

  // The DEFAULT VIEW — asserted before any test clicks a tab, because a click is
  // exactly what would hide a wrong default. Both surfaces (this page and the
  // in-app panel) open on the file tree: the tree is how a file is reached, and
  // the artifact ledger is the record you consult afterwards. The tree's rows are
  // part of the assertion because a default that is set but never LOADED shows an
  // empty pane — which is what happens if the boot stops calling setView.
  await test('the page opens on the file tree, with its rows, and not on the artifact list', async () => {
    const at = await s.evaluate(`(() => {
      const tab = (view) => document.querySelector('.tab[data-view="' + view + '"]')
      return {
        view: typeof currentView === 'string' ? currentView : String(currentView),
        treeActive: tab('tree').classList.contains('is-active'),
        treeSelected: tab('tree').getAttribute('aria-selected'),
        artActive: tab('artifacts').classList.contains('is-active'),
        treeShown: document.getElementById('tree').classList.contains('is-active'),
        listHidden: document.getElementById('list').classList.contains('is-hidden'),
        rows: document.querySelectorAll('#treeBody [data-path]').length,
      }
    })()`)
    eq(at.view, 'tree', 'the page booted on another view')
    assert(at.treeActive && at.treeSelected === 'true', 'the 文件树 tab is not the active one: ' + JSON.stringify(at))
    assert(!at.artActive, 'the 产物 tab is active as well')
    assert(at.treeShown && at.listHidden, 'the tree pane is not the one on screen: ' + JSON.stringify(at))
    assert(at.rows > 0, 'the default tree drew no rows (setView did not load the root)')
  })

  // …and with the tree switched OFF there is nothing to open on, so the artifact
  // list takes over — the same downgrade the in-app panel makes. Driven through
  // the settings bridge (the same storage event the sidebar raises), which is also
  // how the live case is covered: the page is already on the tree when the switch
  // flips.
  await test('switching the file tree off moves the page onto the artifact list', async () => {
    const write = async (show) => {
      await s.evaluate(`(() => {
        const key = ${JSON.stringify(SETTINGS_KEY)}
        const raw = localStorage.getItem(key)
        const data = raw ? JSON.parse(raw) : {}
        data.showFileTree = ${show ? 'true' : 'false'}
        localStorage.setItem(key, JSON.stringify(data))
        window.dispatchEvent(new StorageEvent('storage', { key: key, newValue: JSON.stringify(data) }))
      })()`)
      await s.wait(120)
    }
    await write(false)
    await s.waitFor(`document.querySelector('.tab[data-view="artifacts"]').classList.contains('is-active')`,
      { label: 'the artifact list to take over' })
    const off = await s.evaluate(`(() => ({
      view: String(currentView),
      treeHidden: document.querySelector('.tab[data-view="tree"]').classList.contains('is-hidden'),
      listShown: !document.getElementById('list').classList.contains('is-hidden'),
    }))()`)
    eq(off.view, 'artifacts', 'the view did not fall back with the tree off')
    assert(off.treeHidden, 'the 文件树 tab is still offered while the tree is switched off')
    assert(off.listShown, 'the artifact list is not on screen')
    await write(true)
    await s.click((await s.center('.tab[data-view="tree"]')).x, (await s.center('.tab[data-view="tree"]')).y)
    await s.wait(120)
  })

  await test('the file tree renders the workspace root', async () => {
    const tab = await s.center('.tab[data-view="tree"]')
    assert(tab, 'no 文件树 tab')
    await s.click(tab.x, tab.y)
    await s.waitFor('document.querySelectorAll("#treeBody [data-path]").length > 0', { label: 'root rows' })
    const got = (await rows(s)).sort()
    eq(got.length, 4, 'root row count')
    assert(got.includes(path('src')), 'missing src row: ' + JSON.stringify(got))
  })

  await test('right-click opens the menu at the pointer, on screen', async () => {
    const at = await rightClickRow(s, path('src'))
    const r = await menuRect(s)
    assert(r, 'no menu')
    assertAtPointer(r, at, await viewport(s), 'wide window')
  })

  await test('hovering a menu item does not replace it (node identity + childList)', async () => {
    // The bug: paintTreeMenu() emptied and rebuilt the menu on every
    // mouseenter, so Blink kept re-entering the *new* button under the cursor
    // and the button that received mousedown was gone by mouseup.
    if (!(await menuOpen(s))) await rightClickRow(s, path('src'))
    const before = await s.evaluate('document.querySelectorAll(".tree-menu-item").length')
    assert(before > 2, 'menu has too few items: ' + before)
    await s.evaluate(`(() => {
      window.__dsfMut = 0
      if (window.__dsfObs) window.__dsfObs.disconnect()
      window.__dsfObs = new MutationObserver((recs) => { window.__dsfMut += recs.length })
      window.__dsfObs.observe(document.querySelector('.tree-menu'), { childList: true, subtree: true })
      return true
    })()`)
    const spot = await s.evaluate(`(() => {
      const b = document.querySelectorAll('.tree-menu-item')[2]
      if (!b) return null
      b.__probe = 'stable'
      const r = b.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()`)
    assert(spot, 'no third menu item')
    await s.mouseMove(spot.x, spot.y)
    await s.wait(400)   // ~24 frames — an unconditional repaint would be visible
    const mutations = await s.evaluate('window.__dsfMut')
    eq(mutations, 0, 'the menu rebuilt itself while the pointer was over an item')
    const kept = await s.evaluate('(() => { const b = document.querySelectorAll(".tree-menu-item")[2]; return !!(b && b.__probe === "stable") })()')
    assert(kept, 'the hovered menu item was replaced by a new node')
  })

  await test('clicking「展开文件夹」in the menu expands the folder', async () => {
    if (!(await menuOpen(s))) await rightClickRow(s, path('src'))
    await setOpen(s, path('src'), false)
    if (!(await menuOpen(s))) await rightClickRow(s, path('src'))
    const labels = await menuLabels(s)
    assert(labels.includes('展开文件夹'), 'menu has no 展开文件夹 item: ' + JSON.stringify(labels))
    await clickMenuItem(s, '展开文件夹')
    await s.waitFor(
      '(() => { const el = document.querySelector(' + JSON.stringify(rowSel(path('src'))) + '); return el && el.getAttribute("aria-expanded") === "true" })()',
      { label: 'the folder to expand', timeout: 4000 },
    )
    assert(!(await menuOpen(s)), 'the menu stayed open after an item was clicked')
    const all = await rows(s)
    assert(all.includes(path('src', 'app.js')), 'children were not listed: ' + JSON.stringify(all))
  })

  await test('a double click expands a folder and leaves it expanded', async () => {
    await setOpen(s, path('docs'), false)
    await recordEvents(s)
    const at = await s.center(rowSel(path('docs')))
    await s.doubleClick(at.x, at.y)
    await s.wait(300)
    const log = await eventLog(s)
    eq(await expandedOf(s, path('docs')), 'true',
      'a double click collapsed the folder it opened · events: ' + log)
  })

  await test('the menu runs its first item on Enter (focus survives)', async () => {
    await setOpen(s, path('docs'), false)
    if (!(await menuOpen(s))) await rightClickRow(s, path('docs'))
    const was = await expandedOf(s, path('docs'))
    await s.key('Enter')
    await s.wait(250)
    assert(!(await menuOpen(s)), 'Enter left the menu open')
    const now = await expandedOf(s, path('docs'))
    assert(now !== was, 'Enter did not run the highlighted item (' + was + ' → ' + now + ')')
  })

  await test('Escape closes the menu', async () => {
    if (!(await menuOpen(s))) await rightClickRow(s, path('src'))
    await s.key('Escape')
    await s.wait(150)
    assert(!(await menuOpen(s)), 'Escape left the menu open')
  })

  await test('a click outside closes the menu', async () => {
    if (!(await menuOpen(s))) await rightClickRow(s, path('src'))
    await s.click(30, 300)
    await s.wait(150)
    assert(!(await menuOpen(s)), 'clicking elsewhere left the menu open')
  })

  await test('the toolbar「全部折叠」button is visible and collapses everything', async () => {
    // Regression: a `@container (max-width: 400px)` rule hid tools 2 and 3 at the
    // panel's default width, so the button was never rendered and clicks landed
    // on「刷新」instead.
    const box = await s.evaluate(`(() => {
      const el = document.getElementById('treeCollapseAll')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: r.width, h: r.height, vis: getComputedStyle(el).display }
    })()`)
    assert(box, 'no 全部折叠 button in the DOM')
    assert(box.w > 0 && box.h > 0 && box.vis !== 'none', 'the 全部折叠 button is not visible: ' + JSON.stringify(box))
    await setOpen(s, path('src'), true)
    const at = await s.center('#treeCollapseAll')
    await s.click(at.x, at.y)
    await s.waitFor(
      '(() => { const el = document.querySelector(' + JSON.stringify(rowSel(path('src'))) + '); return el && el.getAttribute("aria-expanded") === "false" })()',
      { label: '全部折叠 to collapse src' },
    )
  })

  await test('「全部折叠」from the context menu collapses everything', async () => {
    await setOpen(s, path('src'), true)
    if (!(await menuOpen(s))) await rightClickRow(s, path('src'))
    await clickMenuItem(s, '全部折叠')
    await s.waitFor(
      '(() => { const el = document.querySelector(' + JSON.stringify(rowSel(path('src'))) + '); return el && el.getAttribute("aria-expanded") === "false" })()',
      { label: 'the menu item 全部折叠 to collapse src' },
    )
  })

  await test('a single click previews a file', async () => {
    await setOpen(s, path('src'), true)
    const at = await s.center(rowSel(path('src', 'app.js')))
    assert(at, 'no app.js row')
    await s.click(at.x, at.y)
    await s.waitFor('!!document.querySelector(".codeview, .markdown, .preview-iframe")', { label: 'the preview to render', timeout: 4000 })
  })

  // ── change review: line diff + 撤销 ───────────────────────────────────────
  // The ledger row carries a before/after diff and a revertible snapshot, so the
  // preview must paint a line-level diff and an undo that actually posts. Both
  // halves of that were only asserted against source text before this.
  await test('the changed file shows a line-level diff with its stats', async () => {
    await setOpen(s, path('src'), true)
    const at = await s.center(rowSel(path('src', 'app.js')))
    assert(at, 'no app.js row to open')
    await s.click(at.x, at.y)
    await s.waitFor('!!document.querySelector(".diff-rows .diff-row")', { label: 'the diff rows to render', timeout: 4000 })
    const shape = await s.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.diff-rows .diff-row')]
      return {
        kinds: rows.map((r) => r.className.replace('diff-row ', '')),
        texts: rows.map((r) => (r.querySelector('.diff-text') || {}).textContent || ''),
        stat: (document.querySelector('.diff-stat') || {}).textContent || '',
        undo: !!document.querySelector('.diff-undo'),
        // The diff must sit ABOVE the file body, where the review question is asked.
        diffBeforeBody: !!document.querySelector('.diff') && !!document.querySelector('.codeview') &&
          (document.querySelector('.diff').compareDocumentPosition(document.querySelector('.codeview')) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      }
    })()`)
    eq(shape.kinds.join(','), 'ctx,del,add', 'diff rows: ' + JSON.stringify(shape.kinds))
    eq(shape.texts[1], 'const b = 2', 'the removed line')
    eq(shape.texts[2], 'const b = 3', 'the added line')
    assert(/\+1/.test(shape.stat) && /1/.test(shape.stat), 'the stats line is missing: ' + shape.stat)
    assert(shape.undo, 'the undo button is not rendered for a revertible change')
    assert(shape.diffBeforeBody, 'the diff is not drawn above the file body')
  })

  await test('撤销 posts the change back to the host', async () => {
    const before = host.reverts.length
    const at = await s.center('.diff-undo')
    assert(at, 'no undo button to click')
    await s.click(at.x, at.y)
    await s.waitFor('document.body.innerText.indexOf("已撤销") >= 0', { label: 'the undo acknowledgement', timeout: 4000 })
    eq(host.reverts.length, before + 1, 'the undo never reached the host')
    const body = JSON.parse(host.reverts[host.reverts.length - 1])
    assert(body.path && body.path.indexOf('app.js') >= 0, 'the undo posted the wrong path: ' + JSON.stringify(body))
    eq(body.opId, 'op1', 'the undo posted the wrong change id')
  })

  // ── 编辑: CodeMirror mounts in the engine, and Ctrl+S really posts ────────
  // The whole feature is "type here, the host gets the text". A rendered button
  // cannot make that claim, so this drives the real thing: the real vendored
  // CodeMirror bundle, a real insertion into the editor, and the real POST.
  await test('a Markdown file edits in CodeMirror and saves what was typed', async () => {
    await setOpen(s, path('docs'), true)
    const at = await s.center(rowSel(path('docs', 'guide.md')))
    assert(at, 'no guide.md row')
    await s.click(at.x, at.y)
    await s.waitFor('!!document.querySelector(".markdown")', { label: 'the Markdown preview', timeout: 4000 })

    const editAt = await s.center('.editbtn')
    assert(editAt, 'no 编辑 button in the preview bar')
    await s.click(editAt.x, editAt.y)
    // 604 KB of CodeMirror, fetched lazily on this first click.
    await s.waitFor('!!document.querySelector(".editcm .cm-editor")', { label: 'CodeMirror to mount', timeout: 15000 })
    // The editor must be the thing you can type into: focus it, then insert text
    // through the same input pipeline a keyboard uses.
    const editorAt = await s.center('.editcm .cm-content')
    assert(editorAt, 'the editor has no content area')
    await s.click(editorAt.x, editorAt.y)
    await s.send('Input.insertText', { text: 'NEW ' })
    await s.waitFor('document.querySelector(".editcm").innerText.indexOf("NEW") >= 0', { label: 'the typed text to reach the document', timeout: 4000 })

    const before = host.saves.length
    const saveAt = await s.center('.editbtn.is-primary')
    assert(saveAt, 'no 保存 button')
    await s.click(saveAt.x, saveAt.y)
    await s.waitFor('document.querySelector(".editstatus").textContent.indexOf("已保存") >= 0', { label: 'the save acknowledgement', timeout: 4000 })
    eq(host.saves.length, before + 1, 'the save never reached the host')
    const posted = JSON.parse(host.saves[host.saves.length - 1])
    assert(posted.path && posted.path.indexOf('guide.md') >= 0, 'the save posted the wrong path: ' + JSON.stringify(posted.path))
    assert(String(posted.content).indexOf('NEW') >= 0, 'the save did not carry what was typed: ' + JSON.stringify(String(posted.content).slice(0, 80)))
    eq(posted.baseVersion, 'v1', 'the save did not carry the revision the editor was opened on')

    // …and 预览 puts the rendered document back, so the toggle is not a one-way
    // door out of the editor.
    const backAt = await s.center('.editbtn')
    assert(backAt, 'no 预览 button')
    await s.click(backAt.x, backAt.y)
    await s.waitFor('!!document.querySelector(".markdown") && !document.querySelector(".cm-editor")', { label: 'the preview to come back', timeout: 4000 })
  })

  await test('the menu is drawn on screen when the tree pane is narrow', async () => {    // The 20%-width default panel is the case that hid the toolbar buttons; keep
    // the menu honest at the same size.
    await s.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false })
    await s.wait(150)
    const at = await rightClickRow(s, path('src'))
    const r = await menuRect(s)
    assert(r, 'no menu at 900×700')
    assertAtPointer(r, at, { w: 900, h: 700 }, 'narrow pane (900×700)')
    await s.key('Escape')
    await s.send('Emulation.clearDeviceMetricsOverride')
  })

  // ── the split: 预览区默认宽度 (DEFAULT_SETTINGS.previewHeight), and the floor ──
  // The two halves must agree on this (the page pre-sizes it in CSS + falls back
  // to the same number in JS); here it is measured, not read.
  //
  // Measured WIDE on purpose. The setting is a starting position, not a promise:
  // the list/file-tree pane keeps its own floor (`SPLIT_LIST_MIN`, read from
  // source below), so at a 1400px window the floor caps the preview a few pixels
  // below the configured share and a test run there would be measuring the floor.
  await test('the preview opens at the configured share of the split area', async () => {
    await s.send('Emulation.setDeviceMetricsOverride', { width: 2400, height: 900, deviceScaleFactor: 1, mobile: false })
    await s.wait(200)
    const geo = await s.evaluate(`(() => {
      const main = document.getElementById('main')
      const split = document.getElementById('split')
      const preview = document.getElementById('preview')
      if (!main || !split || !preview) return null
      return {
        avail: main.clientWidth - split.offsetWidth,
        preview: preview.getBoundingClientRect().width,
      }
    })()`)
    assert(geo && geo.avail > 400, 'no main/preview/split: ' + JSON.stringify(geo))
    const want = geo.avail * (PREVIEW_PERCENT / 100)
    assert(want <= geo.avail - SPLIT_LIST_MIN + 2,
      'this viewport cannot show ' + PREVIEW_PERCENT + '%: want ' + want.toFixed(1) + 'px, the list pane keeps ' + SPLIT_LIST_MIN + 'px of ' + geo.avail + 'px')
    assert(Math.abs(geo.preview - want) <= 2,
      'the preview is ' + geo.preview + 'px of ' + geo.avail + 'px, want ' + want.toFixed(1) + ' (' + PREVIEW_PERCENT + '%)')
  })

  await test('dragging the divider right cannot squeeze the file tree below its floor', async () => {
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
    await s.wait(120)
    const tab = await s.center('.tab[data-view="tree"]')
    assert(tab, 'no 文件树 tab')
    await s.click(tab.x, tab.y)
    await setOpen(s, path('src'), true)
    await setOpen(s, path('src', 'deep'), true)
    // Drag the divider as far right as the window allows.
    const handle = await s.center('#split')
    assert(handle, 'no divider')
    await s.mouseMove(handle.x, handle.y)
    await s.mousePress(handle.x, handle.y)
    await s.mouseMove(1390, handle.y)
    await s.mouseRelease(1390, handle.y)
    await s.wait(150)
    const geo = await s.evaluate(`(() => {
      const main = document.getElementById('main')
      const split = document.getElementById('split')
      const pane = document.querySelector('.sidebar')
      const row = document.querySelector(${JSON.stringify(rowSel(path('src', 'deep', 'dsh-sidebar-frog.config.json')))})
      const name = row ? row.querySelector('.tree-name') : null
      return {
        avail: main.clientWidth - split.offsetWidth,
        pane: pane ? pane.getBoundingClientRect().width : null,
        nameWidth: name ? name.clientWidth : null,
        clipped: name ? name.scrollWidth > name.clientWidth + 1 : null,
      }
    })()`)
    assert(geo.pane != null, 'no tree pane')
    // 280px is SPLIT_LIST_MIN; the borders add a pixel. The upper bound proves the
    // drag really consumed the space (the preview took everything else).
    assert(geo.pane >= 279 && geo.pane <= 300,
      'the tree pane is ' + geo.pane + 'px of ' + geo.avail + 'px — the floor did not hold (' + JSON.stringify(geo) + ')')
    assert(geo.nameWidth != null, 'the long file name is not on screen: ' + JSON.stringify(geo))
    assert(geo.clipped === false,
      'a ' + geo.nameWidth + 'px row ellipsizes dsh-sidebar-frog.config.json — the floor is too small')
    await s.send('Emulation.clearDeviceMetricsOverride')
  })

  // ── the new preview types, in a real engine ───────────────────────────────
  // The type table, the CSV parser and the byte-range parser are covered in
  // scripts/check.js. What only an engine can answer is whether the DOM these
  // views build is what the user actually sees — and whether an <audio> really
  // asks the streaming route for its bytes (a src nobody fetches is a silent
  // player, which is the class of bug this suite exists for).
  const openDoc = async (name) => {
    await setOpen(s, path('docs'), true)
    const at = await s.center(rowSel(path('docs', name)))
    assert(at, 'no ' + name + ' row')
    await s.click(at.x, at.y)
  }
  const cellText = (step) => s.evaluate(
    '[...document.querySelectorAll("#previewArea .tabletd")].filter((_, i) => i % ' + step + ' === 0).map(e => e.textContent)'
  )
  const attr = (sel, name) => s.evaluate('(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); return el ? el.getAttribute(' + JSON.stringify(name) + ') : null })()')

  await test('a nested list nests, and an escaped pipe stays inside its cell', async () => {
    await openDoc('guide.md')
    await s.waitFor('!!document.querySelector("#previewArea ul li ul")', { label: 'the nested list to render', timeout: 4000 })
    const shape = await s.evaluate(`(() => {
      const nested = document.querySelector('#previewArea ul li ul')
      return {
        items: [...document.querySelectorAll('#previewArea ul li ul li')].map((li) => li.textContent.trim()),
        // closest('li') is the assertion that matters: the nested list has to be
        // INSIDE its parent item. Emitted as a sibling the browser still paints
        // something list-shaped, which is how a flat list passed for a nested
        // one until this was written.
        owner: nested && nested.closest('li') ? nested.closest('li').textContent.trim() : '',
        cells: [...document.querySelectorAll('#previewArea table th, #previewArea table td')].map((c) => c.textContent.trim()),
      }
    })()`)
    eq(shape.items.join('|'), 'inner one|inner two', 'the nested items')
    eq(shape.owner, 'outerinner oneinner two', 'the parent item owns the nested list')
    eq(shape.cells.join('|'), 'key|value|union|a | b', 'the table cells, escaped pipe intact')
  })

  await test('a badge and a <picture> logo render, and the document-relative images load', async () => {
    await openDoc('guide.md')
    await s.waitFor('!!document.querySelector("#previewArea .markdown picture")', { label: 'the picture block to render', timeout: 4000 })
    const shape = await s.evaluate(`(() => {
      const root = document.querySelector('#previewArea .markdown')
      const badge = root.querySelector('a > img')
      const source = root.querySelector('picture > source')
      const img = root.querySelector('picture > img')
      const text = root.innerText || ''
      return {
        // The badge is an <img> INSIDE an <a>: nested inline tokens used to leave
        // the inner one unreplaced, so the reader saw the characters "A1" where
        // the image should be.
        badgeSrc: badge ? badge.getAttribute('src') : null,
        badgeAlt: badge ? badge.getAttribute('alt') : null,
        sourceMedia: source ? source.getAttribute('media') : null,
        sourceSrcset: source ? source.getAttribute('srcset') : null,
        imgSrc: img ? img.getAttribute('src') : null,
        imgWidth: img ? img.naturalWidth : 0,
        imgHeight: img ? img.naturalHeight : 0,
        centered: !!(img && img.closest('[align="center"]')),
        escaped: (root.innerHTML.match(/&lt;(picture|source|img)/g) || []).length,
        token: /(^|[^\\w])A\\d+([^\\w]|$)/.test(text),
      }
    })()`)
    eq(shape.badgeSrc, '/dsh-sidebar-frog/media?path=D%3A%2Fws%2Fdocs%2Fbadge.svg', 'the badge image src (rebased onto the media route, against the document directory)')
    eq(shape.badgeAlt, 'ci', 'the badge alt text')
    eq(shape.sourceMedia, '(prefers-color-scheme: dark)', 'the dark-mode source media query, kept verbatim')
    assert(shape.sourceSrcset === '/dsh-sidebar-frog/media?path=D%3A%2Fws%2Fdocs%2Flogo-dark.svg',
      'the dark source srcset is ' + JSON.stringify(shape.sourceSrcset))
    eq(shape.imgSrc, '/dsh-sidebar-frog/media?path=D%3A%2Fws%2Fdocs%2Flogo.svg', 'the fallback image src')
    assert(shape.imgWidth === 120 && shape.imgHeight === 40,
      'the logo did not load: naturalSize ' + shape.imgWidth + 'x' + shape.imgHeight)
    assert(shape.centered, 'the picture left its <p align="center"> wrapper')
    eq(shape.escaped, 0, 'raw HTML was escaped into visible angle brackets')
    eq(shape.token, false, 'an inline token leaked into the rendered text')
  })

  await test('the rendered document carries source lines, and a selection resolves to them', async () => {
    await openDoc('guide.md')
    await s.waitFor('!!document.querySelector("#previewArea .markdown [data-line]")', { label: 'anchored markdown', timeout: 4000 })
    // The page exposes the shared helpers as top-level functions of its inline
    // script; the bar is wired through the same module, so this is the link that
    // would break silently if the page stopped inlining markdown.js.
    eq(await s.evaluate('typeof mdSelectionLines'), 'function', 'mdSelectionLines is reachable from the popout page')
    const shape = await s.evaluate(`(() => {
      const root = document.querySelector('#previewArea .markdown')
      const span = (el) => el ? {
        start: Number(el.getAttribute('data-line')),
        end: Number(el.getAttribute('data-line-end') || el.getAttribute('data-line')),
      } : null
      const rangeOf = (el) => {
        const r = document.createRange()
        r.selectNodeContents(el)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(r)
        return mdSelectionLines(root, sel)
      }
      const quote = rangeOf(root.querySelector('blockquote li'))
      const badge = root.querySelector('p > a > img')
      const outside = document.createElement('div')
      outside.textContent = 'not the document'
      document.body.appendChild(outside)
      const refused = rangeOf(outside)
      outside.remove()
      window.getSelection().removeAllRanges()
      return {
        heading: span(root.querySelector('h1')),
        quote: span(root.querySelector('blockquote')),
        quoteItem: span(root.querySelector('blockquote li')),
        // The first ul on the page is the quoted one, the OUTER list is the one
        // that is neither in a blockquote nor inside an li, and the nested one is
        // last in document order (it lives inside the outer li).
        quotedList: span(root.querySelector('blockquote ul')),
        list: span([...root.querySelectorAll('ul')].find((u) => !u.closest('blockquote') && !u.closest('li'))),
        nestedList: span([...root.querySelectorAll('ul')].pop()),
        table: span(root.querySelector('table')),
        // A <picture> inside a <p align="center"> is inline content of that
        // paragraph (the paragraph's own span covers it), so the block that
        // answers for a selection in the logo is the <p>.
        pictureBlock: span(root.querySelector('picture') ? root.querySelector('picture').closest('[data-line]') : null),
        pictureRange: (() => { const img = root.querySelector('picture > img'); return img ? rangeOf(img) : null })(),
        badge: span(badge ? badge.closest('p') : null),
        quoteRange: quote ? { start: quote.start, end: quote.end } : null,
        outside: refused,
      }
    })()`)
    eq(shape.heading.start, 1, 'the heading reports line 1')
    // 3-6 is the whole quote; 5 is the li INSIDE it, which only comes out right
    // if the inner render was offset by the quote's own first line.
    eq(shape.quote.start + '-' + shape.quote.end, '3-6', 'the blockquote span')
    eq(shape.quoteItem.start, 5, 'the quoted list item (an offset inner render)')
    // The FIRST ul in the document is the one inside the quote (line 5), so the
    // outer list is the last one — both spans are asserted, and the quoted one is
    // a second proof that a nested render is offset correctly.
    eq(shape.quotedList.start + '-' + shape.quotedList.end, '5-6', 'the quoted list span')
    eq(shape.list.start + '-' + shape.list.end, '10-12', 'the outer list span')
    eq(shape.nestedList.start + '-' + shape.nestedList.end, '11-12', 'the nested list span')
    eq(shape.table.start + '-' + shape.table.end, '14-16', 'the table span')
    eq(shape.pictureBlock.start + '-' + shape.pictureBlock.end, '20-25', 'the paragraph wrapping the picture')
    eq(shape.pictureRange.start + '-' + shape.pictureRange.end, '20-25', 'a selection inside the picture resolves to its block')
    eq(shape.badge.start, 18, 'the badge paragraph line')
    eq(shape.quoteRange.start + '-' + shape.quoteRange.end, '5-5', 'the range a selection inside the quoted item resolves to')
    eq(shape.outside, null, 'a selection outside the document is not read as a line range')
  })

  // ── 设置 › 行号: the reader's gutter and the editor's column, in a real engine ─
  // Two switches, two mechanisms: the preview's numbers are a CSS ::before drawing
  // attr(data-lineno) off the anchors the renderer already wrote (so they are the
  // file's REAL lines), and the editor's are a CodeMirror compartment. Both are
  // asserted in BOTH directions — a switch that is always on, or always off is the
  // failure mode a one-sided test cannot see.
  //
  // Exactly ONE reload, at the very start, on a page with nothing unsaved: the
  // popout asks before unloading a dirty draft, and that dialog blocks the browser
  // (it hung this test until the reloads were removed). Every later flip goes
  // through the same storage event the sidebar raises, which is the harder path
  // anyway — repainting a document that is already on screen, and reconfiguring a
  // RUNNING editor instead of one that is about to be rebuilt.
  await test('the line-number pair switches the preview gutter and the editor column', async () => {
    const put = async (preview, editor) => {
      await s.evaluate(`(() => {
        const key = ${JSON.stringify(SETTINGS_KEY)}
        const raw = localStorage.getItem(key)
        const data = raw ? JSON.parse(raw) : {}
        data.previewLineNumbers = ${preview ? 'true' : 'false'}
        data.editorLineNumbers = ${editor ? 'true' : 'false'}
        localStorage.setItem(key, JSON.stringify(data))
        // The same event the sidebar's write raises in another tab/window.
        window.dispatchEvent(new StorageEvent('storage', { key: key, newValue: JSON.stringify(data) }))
      })()`)
    }
    // The one reload, so the gutter is proven to survive a BOOT with the setting
    // already on (not merely to appear when a switch is flipped).
    await s.evaluate(`(() => {
      const key = ${JSON.stringify(SETTINGS_KEY)}
      const raw = localStorage.getItem(key)
      const data = raw ? JSON.parse(raw) : {}
      data.previewLineNumbers = true
      data.editorLineNumbers = true
      localStorage.setItem(key, JSON.stringify(data))
    })()`)
    await s.send('Page.reload')
    await s.waitFor('!!document.getElementById("tabs")', { label: 'the page to boot with the gutter on', timeout: 15000 })
    // A reload forgets the 文件树 tab and the loaded root: every other test in this
    // file assumes both, so they are restored here.
    const tab = await s.center('.tab[data-view="tree"]')
    if (tab) await s.click(tab.x, tab.y)
    await s.waitFor('document.querySelectorAll("#treeBody [data-path]").length > 0', { label: 'the tree to come back after a reload', timeout: 8000 })

    // What the gutter actually DRAWS, read off the pseudo-element the stylesheet
    // creates: computed content is the substituted attribute value.
    const gutterOf = () => s.evaluate(`(() => {
      const root = document.querySelector('#previewArea .markdown')
      if (!root) return { root: false }
      const block = root.querySelector(':scope > [data-lineno]')
      return {
        root: true,
        cls: root.className,
        padLeft: getComputedStyle(root).paddingLeft,
        label: block ? block.getAttribute('data-lineno') : null,
        drawn: block ? getComputedStyle(block, '::before').content : null,
      }
    })()`)

    await openDoc('guide.md')
    await s.waitFor('!!document.querySelector("#previewArea .markdown [data-lineno]")', { label: 'a labelled block', timeout: 4000 })
    const on = await gutterOf()
    assert(on.root, 'no markdown root with the gutter on')
    assert(String(on.cls).indexOf('is-lines') >= 0, 'the root does not carry is-lines after a boot: ' + JSON.stringify(on.cls))
    // The pseudo-element must draw the label, not a counter or nothing at all.
    const drawn = String(on.drawn).replace(/^"|"$/g, '')
    eq(drawn, String(on.label), 'the gutter draws something other than the block\'s source line')
    assert(/^\d+(-\d+)?$/.test(drawn), 'the drawn label is not a line number: ' + JSON.stringify(drawn))
    assert(parseFloat(on.padLeft) > 20, 'the document was not padded for a gutter: ' + on.padLeft)

    // OFF — live, on the document already on screen.
    await put(false, true)
    await s.waitFor('!document.querySelector("#previewArea .markdown.is-lines")', { label: 'the gutter class to come off', timeout: 4000 })
    const off = await gutterOf()
    eq(String(off.drawn), 'none', 'the gutter is still drawn with the switch off')
    assert(parseFloat(off.padLeft) < parseFloat(on.padLeft),
      'the document kept the gutter padding: ' + off.padLeft + ' vs ' + on.padLeft)

    // …and ON again, still without a reload.
    await put(true, true)
    await s.waitFor('!!document.querySelector("#previewArea .markdown.is-lines")', { label: 'the gutter class to come back', timeout: 4000 })

    // ── the editor's column, through the real CodeMirror ──────────────────────
    const editAt = await s.center('.editbtn')
    assert(editAt, 'no 编辑 button')
    await s.click(editAt.x, editAt.y)
    await s.waitFor('!!document.querySelector(".editcm .cm-editor")', { label: 'CodeMirror to mount', timeout: 15000 })
    const gutters = () => s.evaluate(`(() => {
      const ed = document.querySelector('.editcm .cm-editor')
      if (!ed) return null
      // CodeMirror keeps hidden measuring elements in the gutter (a "99" it uses to
      // size the column), so the numbers are the VISIBLE ones that really are
      // numbers — otherwise the first element is the ruler, not line 1.
      const numbers = [...ed.querySelectorAll('.cm-lineNumbers .cm-gutterElement')]
        .filter((e) => /^\\d+$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().height > 0)
        .map((e) => (e.textContent || '').trim())
      return { lineNumbers: !!ed.querySelector('.cm-lineNumbers'), numbers: numbers }
    })()`)
    const ed = await gutters()
    assert(ed, 'the editor vanished')
    assert(ed.lineNumbers, 'the editor has no line-number column with the switch on')
    eq(ed.numbers[0], '1', 'the line-number column does not start at 1')
    assert(ed.numbers.indexOf('2') > 0, 'the column has no second line number: ' + JSON.stringify(ed.numbers))

    // Flipping the switch while the editor is OPEN must reach the live view…
    await put(true, false)
    await s.waitFor('(() => { const ed = document.querySelector(".editcm .cm-editor"); return ed && !ed.querySelector(".cm-lineNumbers") })()',
      { label: 'the live editor to drop its line-number column', timeout: 4000 })
    // …and back on with typed text in the document, which is what proves the column
    // was RECONFIGURED rather than the editor remounted (a remount loses the draft).
    const editorAt = await s.center('.editcm .cm-content')
    await s.click(editorAt.x, editorAt.y)
    await s.send('Input.insertText', { text: 'KEEP ' })
    await put(true, true)
    await s.waitFor('!!document.querySelector(".editcm .cm-lineNumbers")', { label: 'the column to come back', timeout: 4000 })
    const kept = await s.evaluate('document.querySelector(".editcm .cm-content").innerText.indexOf("KEEP") >= 0')
    assert(kept, 'toggling the line numbers threw the typed text away — the editor was remounted instead of reconfigured')

    // Leave the page as the rest of the suite expects it: out of edit mode (a dirty
    // draft would make any later reload ask) and back on the shipped defaults.
    const backAt = await s.center('.editbtn')
    if (backAt) await s.click(backAt.x, backAt.y)
    await s.waitFor('!!document.querySelector("#previewArea .markdown") && !document.querySelector(".cm-editor")',
      { label: 'the preview to come back', timeout: 4000 })
    await put(false, true)
  })



  await test('a Chinese file name survives the tree, the request and the preview', async () => {
    // Four hops, each of which can mangle it independently: the tree row's
    // data-path attribute, the `path` the client builds, the percent-encoding on
    // the wire, and the JSON coming back. A workspace here is full of these
    // names, which is why it is worth one assertion rather than an assumption.
    await setOpen(s, path('docs'), true)
    const name = '课件 中文.md'
    const row = rowSel(path('docs', name))
    assert(await s.evaluate('!!document.querySelector(' + JSON.stringify(row) + ')'), 'the Chinese-named file has no row in the tree')
    const before = host.requests.length
    const at = await s.center(row)
    assert(at, 'the Chinese-named row has no clickable centre')
    await s.click(at.x, at.y)
    await s.waitFor('!!document.querySelector("#previewArea .markdown, #previewArea .codeview, #previewArea .preview-iframe")', { label: 'the preview of a non-ASCII file', timeout: 4000 })
    const asked = host.requests.slice(before).filter((r) => r.indexOf('/content?') >= 0)
    assert(asked.length > 0, 'nothing asked the host for the Chinese file: ' + JSON.stringify(host.requests.slice(before)))
    const encoded = encodeURIComponent(name)
    assert(asked.some((r) => r.indexOf(encoded) >= 0), 'the name was not percent-encoded on the wire: ' + JSON.stringify(asked))
    assert(!asked.some((r) => r.indexOf('%EF%BF%BD') >= 0), 'the name was mangled into replacement characters: ' + JSON.stringify(asked))
  })

  await test('a quoted list renders as a list, not as its own markers', async () => {
    await openDoc('guide.md')
    await s.waitFor('document.querySelectorAll("#previewArea blockquote ul li").length === 2', { label: 'the quoted list to render', timeout: 4000 })
    const shape = await s.evaluate(`(() => {
      const q = document.querySelector('#previewArea blockquote')
      return {
        items: [...document.querySelectorAll('#previewArea blockquote ul li')].map((li) => li.textContent.trim()),
        strong: !!document.querySelector('#previewArea blockquote strong'),
        text: q ? q.textContent : '',
      }
    })()`)
    eq(shape.items.join('|'), 'Ctrl+S saves in place|Undo joins the same history as the agent', 'the quoted list items')
    // Inline formatting inside the quote still applies — the fix must not trade
    // block parsing for inline parsing.
    assert(shape.strong, 'inline emphasis inside the quote was lost')
    assert(shape.text.indexOf('- ') === -1, 'the list marker is still painted as text: ' + JSON.stringify(shape.text))
  })

  await test('a .csv renders a sortable table', async () => {
    await openDoc('data.csv')
    await s.waitFor('!!document.querySelector("#previewArea table.datatable")', { label: 'the table to render', timeout: 4000 })
    const head = await s.evaluate('[...document.querySelectorAll("#previewArea .tableheadtext")].map(e => e.textContent)')
    eq(head.join('|'), 'name|qty', 'header cells')
    const order = (await cellText(2)).join(',')
    eq(order, 'banana,apple,cherry', 'rows in file order')
    // Numeric, not lexical: 2 before 10 (a text sort would put 10 first).
    const btns = await s.evaluate('[...document.querySelectorAll("#previewArea .tablesortbtn")].map(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })')
    eq(btns.length, 2, 'sortable header buttons')
    await s.click(btns[1].x, btns[1].y)
    await s.wait(250)
    eq((await cellText(2)).join(','), 'apple,banana,cherry', 'sorted by the numeric column, blank last')
    eq(await attr('#previewArea .tableth:nth-child(2)', 'aria-sort'), 'ascending', 'aria-sort')
    // …and a third click puts the file's own order back.
    await s.click(btns[1].x, btns[1].y)
    await s.wait(150)
    await s.click(btns[1].x, btns[1].y)
    await s.wait(250)
    eq((await cellText(2)).join(','), order, 'the third click restores the file order')
  })

  await test('a binary container shows a card, and 以纯文本查看 really fetches the bytes', async () => {
    await openDoc('legacy.odt')
    await s.waitFor('!!document.querySelector("#previewArea .doccard")', { label: 'the document card', timeout: 4000 })
    const unasked = await s.evaluate('!!document.querySelector("#previewArea .codeview")')
    assert(!unasked, 'the binary document was decoded as text without being asked')
    const before = host.requests.length
    const btn = await s.center('#previewArea .docbtn')
    assert(btn, 'the card offers no plain-text escape hatch')
    await s.click(btn.x, btn.y)
    await s.waitFor('!!document.querySelector("#previewArea .codeview")', { label: 'the plain-text view', timeout: 4000 })
    const asked = host.requests.slice(before).some((r) => r.indexOf('/content?') >= 0 && r.indexOf('text=1') >= 0)
    assert(asked, 'the escape hatch did not ask the host for the text: ' + JSON.stringify(host.requests.slice(before)))
  })

  // ── Office documents, read offline in a real engine ───────────────────────
  // Three libraries parse three container formats, and every one of them can fail
  // in ways no Node-side stub can see: a script that never loads (the URL is not
  // served), a ZIP the parser refuses, a canvas/worker that never initialises.
  // The fixtures are generated with the vendored libraries themselves (see
  // makeDocument / makeWorkbook / makeDeck above), so what is asserted here is
  // that a document a USER would have actually renders.
  const officeText = (sel) => s.evaluate(
    '(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); return el ? el.textContent : null })()'
  )

  await test('a .docx renders as pages, offline', async () => {
    await openDoc('report.docx')
    await s.waitFor('!!document.querySelector("#previewArea .office-docx section")', { label: 'the rendered Word page', timeout: 20000 })
    const text = await officeText('#previewArea .office-docx')
    assert(text && text.indexOf(OFFICE_TEXT) >= 0, 'the document text is not on screen: ' + JSON.stringify(String(text).slice(0, 200)))
    assert(String(text).indexOf('docx-preview 离线渲染的正文') >= 0, 'the second paragraph is missing: ' + JSON.stringify(String(text).slice(0, 300)))
    const pages = await s.evaluate('document.querySelectorAll("#previewArea .office-docx section").length')
    assert(pages >= 1, 'no page section was built: ' + pages)
    shots.push(await s.screenshot(join(tmpdir(), 'dsf-popout-docx.png')))
    const src = host.requests.filter((r) => r.indexOf('/dsh-sidebar-frog/office/') === 0)
    assert(src.some((r) => r.indexOf('jszip.min.js') >= 0), 'the vendored JSZip was never fetched: ' + JSON.stringify(src))
    assert(src.some((r) => r.indexOf('docx-preview.min.js') >= 0), 'the vendored docx-preview was never fetched: ' + JSON.stringify(src))
    // Offline means offline: nothing may leave the origin.
    assert(host.requests.every((r) => r.indexOf('http') !== 0), 'a cross-origin request was made: ' + JSON.stringify(host.requests.filter((r) => r.indexOf('http') === 0)))
  })

  await test('an .xlsx renders a real grid with sheet tabs', async () => {
    await openDoc('book.xlsx')
    await s.waitFor('!!document.querySelector("#previewArea .office-grid")', { label: 'the rendered workbook', timeout: 20000 })
    const cells = await s.evaluate('[...document.querySelectorAll("#previewArea .office-grid td")].map((td) => td.textContent)')
    // Formatted values, in cell order: the header row then the two data rows.
    eq(cells.slice(0, 3).join('|'), 'name|qty|note', 'the first row')
    assert(cells.includes('banana') && cells.includes('10'), 'the data rows are missing: ' + JSON.stringify(cells))
    const tabs = await s.evaluate('[...document.querySelectorAll("#previewArea .office-tab")].map((b) => b.textContent)')
    eq(tabs.length, 2, 'sheet tabs')
    eq(tabs[0], '数据', 'the first sheet name')
    // Switching sheets re-renders the grid from the other worksheet.
    const at = await s.evaluate(`(() => {
      const b = [...document.querySelectorAll('#previewArea .office-tab')][1]
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()`)
    assert(at, 'no second sheet tab to click')
    await s.click(at.x, at.y)
    await s.wait(200)
    const after = await s.evaluate('[...document.querySelectorAll("#previewArea .office-grid td")].map((td) => td.textContent)')
    assert(after.join('|').indexOf(OFFICE_SHEET) >= 0, 'the second sheet did not render: ' + JSON.stringify(after))
    assert(host.requests.some((r) => r.indexOf('xlsx.full.min.js') >= 0), 'the vendored SheetJS was never fetched')
  })

  await test('a .pptx renders slides, with page navigation', async () => {
    await openDoc('deck.pptx')
    // The module is a dynamic import(), so its fetch is the load-bearing part:
    // assert the widget mounts (either the slide or a stated reason), then that
    // the vendored module really travelled.
    await s.waitFor('!!document.querySelector("#previewArea .office-view, #previewArea .office-state.is-error")', { label: 'the deck or its refusal', timeout: 30000 })
    const failed = await officeText('#previewArea .office-state.is-error')
    assert(host.requests.some((r) => r.indexOf('pptx-renderer.es.js') >= 0),
      'the vendored pptx module was never fetched: ' + JSON.stringify(host.requests.filter((r) => r.indexOf('/office/') === 0)))
    assert(!failed, 'the deck could not be parsed: ' + JSON.stringify(failed))
    await s.waitFor('!!document.querySelector("#previewArea .office-pptx")', { label: 'the deck widget', timeout: 20000 })
    await s.waitFor(
      '(() => { const el = document.querySelector("#previewArea .office-pptx"); return !!el && el.textContent.indexOf(' + JSON.stringify(OFFICE_SLIDE) + ') >= 0 })()',
      { label: 'the slide text', timeout: 20000 },
    )
    const page = await officeText('#previewArea .office-page')
    eq(String(page).trim(), '1 / 1', 'the page indicator')
  })

  await test('an .mp3 streams from the media route', async () => {
    await openDoc('clip.mp3')
    await s.waitFor('!!document.querySelector("#previewArea audio.preview-audio")', { label: 'the audio element', timeout: 4000 })
    const src = await attr('#previewArea audio.preview-audio', 'src')
    assert(String(src).indexOf('/dsh-sidebar-frog/media?path=') === 0, 'the audio element does not stream from /media: ' + src)
    await s.wait(400)
    assert(host.requests.some((r) => r.indexOf('/media?') >= 0), 'the page never requested the media route: ' + JSON.stringify(host.requests.slice(-6)))
  })

  // A picture of the open menu, for eyeballing: the harness can assert geometry
  // but not "does this look right".
  const at = await s.center(rowSel(path('src')))
  await s.click(at.x, at.y, 'right')
  await s.wait(200)
  shots.push(await s.screenshot(join(tmpdir(), 'dsf-popout-menu.png')))

  // ── 全屏查看 (fullscreen preview) ──────────────────────────────────────────
  // Driven by a real click on the real button. Two contracts, one test: the
  // preview must FILL THE SCREEN (a black or zero-height box is the failure), and
  // the control must report the state it is in — because the page has two ways in
  // (the Fullscreen API and a CSS mode for engines/frames where the API refuses)
  // and the state has to be readable from the button either way. Which of the two
  // happened is recorded in the failure message rather than asserted: a headless
  // engine may legitimately refuse element fullscreen, and that is exactly the
  // case the CSS mode exists for.
  await test('the 全屏 button fills the screen with the open document', async () => {
    await openDoc('guide.md')
    await s.waitFor('!!document.querySelector("#previewArea .markdown")', { label: 'the document', timeout: 4000 })
    const btn = await s.center('#previewFull')
    assert(btn, 'there is no 全屏 button in the preview bar')
    await s.click(btn.x, btn.y)
    await s.waitFor('!!document.fullscreenElement || !!document.querySelector("#main.is-preview-full")', { label: 'the preview to fill the screen', timeout: 4000 })
    const mode = await s.evaluate('document.fullscreenElement ? "element" : "css"')
    eq(await s.evaluate('document.getElementById("previewFull").getAttribute("aria-pressed")'), 'true', 'the button does not report fullscreen (' + mode + ')')
    const box = await s.evaluate(`(() => {
      const el = document.getElementById('preview')
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight, doc: !!document.querySelector('#previewArea .markdown') }
    })()`)
    assert(box.w >= box.vw - 2 && box.h >= box.vh - 2, 'the preview does not fill the screen (' + mode + '): ' + JSON.stringify(box))
    assert(box.doc, 'the document left the screen when fullscreen started')
    // The same key that leaves fullscreen in a browser leaves it here in both
    // modes: element fullscreen is the browser's own Escape, the CSS mode is this
    // page's handler (and the test above cannot tell which one answered, so both
    // are required to work).
    await s.key('Escape')
    await s.waitFor('!document.fullscreenElement && !document.querySelector("#main.is-preview-full")', { label: 'fullscreen to end', timeout: 4000 })
    eq(await s.evaluate('document.getElementById("previewFull").getAttribute("aria-pressed")'), 'false', 'the button still claims fullscreen after Escape')
  })

  // The other half of that button: on an engine with NO Fullscreen API at all, the
  // click must still fill the tab. BOTH spellings are removed, because that is what
  // "no API" means — Chromium carries `webkitRequestFullscreen` as an alias, and a
  // test that removed only the standard name would be measuring the alias instead
  // (which is its own case, right below).
  await test('with no Fullscreen API the button still fills the tab', async () => {
    const had = await s.evaluate(`(() => {
      window.__dsfFs = { std: Element.prototype.requestFullscreen, webkit: Element.prototype.webkitRequestFullscreen }
      try { delete Element.prototype.requestFullscreen } catch (e) { Element.prototype.requestFullscreen = undefined }
      try { delete Element.prototype.webkitRequestFullscreen } catch (e) { Element.prototype.webkitRequestFullscreen = undefined }
      const el = document.getElementById('preview')
      return { std: typeof el.requestFullscreen, webkit: typeof el.webkitRequestFullscreen }
    })()`)
    eq(had.std, 'undefined', 'the standard API is still there')
    eq(had.webkit, 'undefined', 'the prefixed API is still there')
    const btn = await s.center('#previewFull')
    assert(btn, 'there is no 全屏 button in the preview bar')
    await s.click(btn.x, btn.y)
    await s.waitFor('!!document.querySelector("#main.is-preview-full")', { label: 'the CSS fullscreen mode', timeout: 4000 })
    const box = await s.evaluate(`(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { w: Math.round(r.width), vw: window.innerWidth } })()`)
    assert(box.w >= box.vw - 2, 'the CSS mode did not widen the preview: ' + JSON.stringify(box))
    await s.key('Escape')
    await s.waitFor('!document.querySelector("#main.is-preview-full")', { label: 'the CSS mode to end', timeout: 4000 })
    await s.evaluate(`(() => {
      if (window.__dsfFs.std) { try { Element.prototype.requestFullscreen = window.__dsfFs.std } catch (e) {} }
      if (window.__dsfFs.webkit) { try { Element.prototype.webkitRequestFullscreen = window.__dsfFs.webkit } catch (e) {} }
      return true
    })()`)
    // The button must not have been left claiming fullscreen by either mode.
    eq(await s.evaluate('document.getElementById("previewFull").getAttribute("aria-pressed")'), 'false', 'the button still claims fullscreen')
  })

  // A browser with ONLY the prefixed API (WebKit's spelling): the click must enter
  // REAL fullscreen and the button must know it — not enter the CSS mode as well,
  // which is a screen Escape then cannot leave (the prefixed call returns nothing
  // to await, so "no return value" is not "no fullscreen").
  await test('an engine with only the prefixed API still goes fullscreen, and comes back', async () => {
    const had = await s.evaluate(`(() => {
      window.__dsfStd = Element.prototype.requestFullscreen
      try { delete Element.prototype.requestFullscreen } catch (e) { Element.prototype.requestFullscreen = undefined }
      return typeof document.getElementById('preview').requestFullscreen
    })()`)
    eq(had, 'undefined', 'the standard API is still there')
    const btn = await s.center('#previewFull')
    assert(btn, 'there is no 全屏 button in the preview bar')
    await s.click(btn.x, btn.y)
    await s.waitFor('!!document.fullscreenElement', { label: 'real fullscreen via the prefixed API', timeout: 4000 })
    const css = await s.evaluate('document.getElementById("main").classList.contains("is-preview-full")')
    assert(!css, 'the CSS mode was entered on top of real fullscreen — Escape would leave it behind')
    eq(await s.evaluate('document.getElementById("previewFull").getAttribute("aria-pressed")'), 'true', 'the button does not report fullscreen')
    await s.key('Escape')
    await s.waitFor('!document.fullscreenElement && !document.querySelector("#main.is-preview-full")', { label: 'fullscreen to end', timeout: 4000 })
    await s.evaluate(`(() => {
      if (window.__dsfStd) { try { Element.prototype.requestFullscreen = window.__dsfStd } catch (e) {} }
      return true
    })()`)
  })

  // …and the case a screenshot would catch but an assertion only catches if it
  // asks: a COLLAPSED preview that then goes fullscreen. A collapsed preview is
  // `display: none`, so "filling the screen" would fill it with nothing at all.
  //
  // The state is reached deliberately rather than by clicking, and that is the
  // honest way to test it: the 全屏 button lives INSIDE the collapsed preview, so a
  // user cannot get here through this page's own UI (a stored divider position or
  // the settings bridge from another tab can). Which is exactly why the line that
  // expands it back is defensive — and why it needs a test that can reach the
  // state at all.
  await test('全屏 never leaves a hidden document on the screen', async () => {
    const collapsed = await s.evaluate(`(() => {
      document.getElementById('main').classList.add('is-preview-collapsed')
      const el = document.getElementById('preview')
      return { display: getComputedStyle(el).display, button: !!document.getElementById('previewFull') }
    })()`)
    eq(collapsed.display, 'none', 'the collapsed preview is not display:none — this test needs another way to hide it')
    assert(collapsed.button, 'the 全屏 button is gone from the DOM entirely')
    await s.evaluate('document.getElementById("previewFull").click()')
    await s.waitFor('!!document.fullscreenElement || !!document.querySelector("#main.is-preview-full")', { label: 'fullscreen', timeout: 4000 })
    const state = await s.evaluate(`(() => {
      const el = document.getElementById('preview')
      const r = el.getBoundingClientRect()
      return {
        display: getComputedStyle(el).display,
        w: Math.round(r.width), h: Math.round(r.height),
        vw: window.innerWidth, vh: window.innerHeight,
        collapsed: document.getElementById('main').classList.contains('is-preview-collapsed'),
        doc: !!document.querySelector('#previewArea .markdown'),
      }
    })()`)
    assert(state.display !== 'none', 'the preview is still collapsed inside fullscreen: ' + JSON.stringify(state))
    assert(state.w >= state.vw - 2 && state.h >= state.vh - 2, 'the preview did not fill the screen: ' + JSON.stringify(state))
    assert(state.doc, 'the document is not on screen: ' + JSON.stringify(state))
    await s.key('Escape')
    await s.waitFor('!document.fullscreenElement && !document.querySelector("#main.is-preview-full")', { label: 'fullscreen to end', timeout: 4000 })
  })

  // ── ?path=<file>: the file the sidebar was showing, opened here ──────────
  // The sidebar's 「在弹出页打开」is a link to THIS page plus the file, so the page
  // has to open on that document: a tab that lands on the artifact list while the
  // sidebar shows the file reads as "the button did nothing". Navigating away
  // reloads the page, which is why this case runs last (the suite's own state is
  // rebuilt by every test above, and the two final checks in main() only read the
  // exception/log collectors, which keep accumulating across the load).
  await test('a ?path= link opens that file, pinned, and reveals it in the tree', async () => {
    const target = path('docs', 'guide.md')
    const before = host.requests.length
    // `onDialog: 'accept'` because this page ASKS before it leaves when it holds
    // unsaved edits (its own `beforeunload` guard, which the editor test above
    // leaves dirty text behind for) — and an unanswered dialog blocks the
    // navigation, and then the renderer, until it is answered. In the product the
    // deep link never navigates an existing tab at all: it opens or reuses the
    // popout TAB, which is exactly why the guard is not in the user's way.
    await s.navigate(host.url + '?sessionId=seat-7&path=' + encodeURIComponent(target), { onDialog: 'accept' })
    await s.waitFor('!!document.getElementById("bar") && !!document.getElementById("previewArea")', { label: 'the deep-linked page to boot' })
    await s.waitFor('!!document.querySelector("#bar .path")', { label: 'the preview bar', timeout: 4000 })
    eq(await s.text('#bar .path'), target, 'the file the ?path= link named')
    assert(await s.evaluate('!!document.querySelector("#bar .path.is-pinned")'), 'a deep-linked file is not pinned, so the next click in the tree replaces it')
    await s.waitFor('!!document.querySelector("#previewArea .markdown h1")', { label: 'the file body', timeout: 6000 })
    assert(
      host.requests.slice(before).some((r) => r.indexOf('/content?path=') > 0 && r.indexOf(encodeURIComponent(target)) > 0),
      'the deep link never asked the host for the file: ' + JSON.stringify(host.requests.slice(before)),
    )
    // …and its row is revealed in the tree, which is what makes the tab feel like
    // the same session as the sidebar rather than a fresh one.
    const tab = await s.center('.tab[data-view="tree"]')
    await s.click(tab.x, tab.y)
    await s.waitFor('!!document.querySelector(' + JSON.stringify(rowSel(target)) + ')', { label: 'the opened file row in the tree', timeout: 6000 })
  })

  await test('a ?path= link that names nothing still boots, and says why', async () => {
    await s.navigate(host.url + '?sessionId=seat-7&path=' + encodeURIComponent('D:\\ws\\docs\\gone.md'), { onDialog: 'accept' })
    await s.waitFor('!!document.querySelector("#previewArea .err")', { label: 'the read failure to be reported', timeout: 6000 })
    // The bar still names what was asked for — a page that quietly shows the list
    // instead is the "button did nothing" failure in another costume.
    eq(await s.text('#bar .path'), path('docs', 'gone.md'), 'the refused path')
  })
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const browser = findBrowser()
  if (!browser) {
    console.log('browser-tests: no Chrome/Edge found — skipped (set DSH_TEST_BROWSER to point at one)')
    return 0
  }
  const host = await startHost()
  console.log('browser-tests: ' + browser)
  console.log('browser-tests: stub host at ' + host.url + ' · build ' + host.build)
  let session = null
  const exceptions = []
  const logs = []
  const shots = []
  try {
    session = await launch({ url: host.url })
    if (!session) {
      console.log('browser-tests: could not launch a browser — skipped')
      return 0
    }
    session.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails || {}
      exceptions.push((d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception')
    })
    session.on('Log.entryAdded', (p) => {
      const e = p.entry || {}
      if (e.level === 'error') logs.push(e.text + (e.url ? ' <' + e.url + '>' : ''))
    })
    await run(session, shots, host)

    await test('the page threw no exceptions', async () => {
      eq(exceptions.length, 0, 'page exceptions: ' + JSON.stringify(exceptions))
    })
    await test('nothing was logged to the console as an error', async () => {
      eq(logs.length, 0, 'console errors: ' + JSON.stringify(logs))
    })
  } finally {
    if (session) {
      if (failures.length) {
        try { shots.push(await session.screenshot(join(tmpdir(), 'dsf-popout-failure.png'))) } catch (e) { /* gone */ }
      }
      await session.close()
    }
    await new Promise((r) => host.server.close(r))
  }
  console.log('')
  for (const p of shots) console.log('screenshot: ' + p)
  if (failures.length) {
    // "Nothing happened" is almost always answered by the request log.
    console.log('host requests:')
    for (const r of host.requests) console.log('  ' + r)
    console.log('browser-tests: ' + passed + ' passed, ' + failures.length + ' FAILED')
    return 1
  }
  console.log('browser-tests: ' + passed + ' passed')
  return 0
}

const isCli = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isCli) {
  main().then((code) => { process.exitCode = code }).catch((e) => {
    console.error('browser-tests: ' + (e && e.stack ? e.stack : e))
    process.exitCode = 1
  })
}
