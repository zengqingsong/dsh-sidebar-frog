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
  'docs': [['guide.md', false], ['data.csv', false], ['report.docx', false], ['book.xlsx', false], ['deck.pptx', false], ['legacy.odt', false], ['clip.mp3', false]],
}

const CONTENT = 'const a = 1\nconst b = 2\n'
// Delimited text with a numeric column and one missing value: the table view's
// two deliberate rules (numeric-aware sorting, blanks pinned last) are only
// observable on data that has both.
const CSV = 'name,qty\nbanana,10\napple,2\ncherry,\n'
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
            path: join(ROOT, 'src', 'app.js'),
            kind: 'edit',
            diff: { before: 'const a = 1\nconst b = 2\n', after: 'const a = 1\nconst b = 3\n' },
            undo: { kind: 'edit', can: true, opId: 'op1' },
          },
          { path: join(ROOT, 'README.md'), kind: 'create' },
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
        json({ ok: true, path: join(ROOT, 'src', 'app.js'), opId: 'op1', reverted: 'content' })
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
      if (p.endsWith('data.csv')) return json({ ok: true, type: 'table', content: CSV, truncated: false, size: CSV.length, version: 'v1' })
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
        json({ ok: true, path: join(ROOT, 'docs', 'guide.md'), version: 'v2', size: body.length, eol: 'LF', bom: false, revision: 1 })
      })
    }
    // The streaming route. It answers here so the <audio> element's own request
    // is a 200 (a 404 would land in the console and fail the "no console errors"
    // test, which is the suite's canary for exactly this kind of stub gap). An
    // Office file is answered with its REAL bytes: the widget mounted from them is
    // what these tests are about.
    if (u.pathname === '/dsh-sidebar-frog/media') {
      const wanted = String(u.searchParams.get('path') || '').toLowerCase()
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
const path = (...parts) => ROOT + '\\' + parts.join('\\')

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
