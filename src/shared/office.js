// Office documents (.docx / .xlsx / .pptx) — reading them offline.
//
// Three vendored libraries do the parsing, each served by this plugin's own
// asset routes (see the /dsh-sidebar-frog/office/* routes in src/host/routes.js),
// so an Office file is read without a network round trip and never leaves the
// machine:
//
//   · docx-preview + JSZip   → WordprocessingML → DOM pages   (Apache-2.0)
//   · SheetJS (xlsx)         → SpreadsheetML    → a real grid  (Apache-2.0)
//   · @aiden0z/pptx-renderer → PresentationML   → slides       (Apache-2.0)
//
// This module is the part BOTH halves of the plugin share: the React preview
// inside the shell and the standalone popout page mount the same widget with the
// same teardown discipline, so a .docx cannot look — or leak — different in the
// two windows. That is also why the widget builds its own chrome (sheet tabs,
// slide navigation) here rather than in either caller: chrome written twice is
// chrome that drifts.
//
// Portable JS on purpose (var/function, no template literals, no interpolation,
// no script-end marker): this file is spliced verbatim into the client bundle AND the
// popout page's inline <script> (see scripts/build.js, and the embedding-hazard
// guard in scripts/check.js that reads src/shared/*.js off disk).

// Which suffixes this module can actually draw. The set is deliberately short:
// a suffix belongs here only once a vendored reader exists for it, because
// .doc / .odt / .rtf (see EXT_DOC in src/shared/ext.js) still take the
// panel's binary-document card and its hand-off — claiming them here would turn
// an honest "this container is not text" into a renderer that fails.
var OFFICE_KINDS = { docx: 1, xlsx: 1, pptx: 1 };

function officeKind(path) {
  var ext = fileExt(path);
  return OFFICE_KINDS[ext] ? ext : '';
}

function officeKindLabel(kind) {
  if (kind === 'docx') return 'Word 文档';
  if (kind === 'xlsx') return 'Excel 工作簿';
  if (kind === 'pptx') return 'PowerPoint 演示';
  return 'Office 文档';
}

// ── Assets ────────────────────────────────────────────────────────────────
// Public library code, served without the cookie fence (like the pdf.js /
// MathJax / Mermaid assets): none of it reveals anything about the workspace.
var OFFICE_ASSETS = {
  jszip: '/dsh-sidebar-frog/office/jszip.min.js',
  docx: '/dsh-sidebar-frog/office/docx-preview.min.js',
  xlsx: '/dsh-sidebar-frog/office/xlsx.full.min.js',
  // An ES module: docx-preview and SheetJS ship UMD builds, this one does not,
  // so it is reached with a dynamic import() — same origin, same script-src.
  pptx: '/dsh-sidebar-frog/office/pptx-renderer.es.js',
};

// The whole-file ceiling. The shell's own document preview refuses a complete
// read past its own cap and says so; this is the same kind of line for the
// panel's side (which fetches bytes from /media itself, and /media serves up to
// 25 MB in one response anyway).
var OFFICE_MAX_FILE = 24 * 1024 * 1024;
// The EXPANSION ceiling, and the reason it exists: a .docx is a ZIP, so a
// 200 KB file can inflate to gigabytes and take the tab down with it. The
// libraries have no say in this, so the archive's own central directory is read
// BEFORE anything is handed to them (see officeZipTotals).
var OFFICE_MAX_EXPANDED = 192 * 1024 * 1024;

// Reads a ZIP's central directory without inflating anything: entry count plus
// the declared compressed/uncompressed totals.
//
// Deliberately conservative — it walks the END OF CENTRAL DIRECTORY record and
// then the directory entries, and returns null (meaning "no verdict") the moment
// the structure is not what it expects. A null never blocks a file: the real
// parser is then the one that reports the problem, in its own words.
function officeZipTotals(bytes) {
  try {
    var view = bytes && bytes.length !== undefined && typeof bytes !== 'string'
      ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
      : null;
    if (!view) return null;
    var len = view.length;
    if (len < 22) return null;
    // EOCD is at the end, possibly followed by a comment (up to 64 KB).
    var floor = Math.max(0, len - 22 - 65535);
    var eocd = -1;
    for (var i = len - 22; i >= floor; i--) {
      if (view[i] === 0x50 && view[i + 1] === 0x4b && view[i + 2] === 0x05 && view[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    var dv = new DataView(view.buffer, view.byteOffset, view.byteLength);
    var count = dv.getUint16(eocd + 10, true);
    var cdOffset = dv.getUint32(eocd + 16, true);
    if (!count || cdOffset + 46 > len) return null;
    var total = 0;
    var compressed = 0;
    var seen = 0;
    var p = cdOffset;
    while (seen < count && p + 46 <= len) {
      if (!(view[p] === 0x50 && view[p + 1] === 0x4b && view[p + 2] === 0x01 && view[p + 3] === 0x02)) break;
      var rawCompressed = dv.getUint32(p + 20, true);
      var rawTotal = dv.getUint32(p + 24, true);
      // 0xFFFFFFFF means "look in the ZIP64 extra field", i.e. a size too large
      // for this field. Reading it as 4 GB and refusing is the safe direction:
      // such an entry is already past every ceiling here.
      total += rawTotal;
      compressed += rawCompressed;
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      p += 46 + nameLen + extraLen + commentLen;
      seen += 1;
    }
    if (!seen) return null;
    return { entries: seen, uncompressed: total, compressed: compressed };
  } catch (e) {
    return null;
  }
}

// The pre-flight both entry points run before a library is loaded. Returns
// { ok: true } or { ok: false, message } — a string the view shows as-is, since
// "why can I not see my file" is the only question a refusal has to answer.
function officeBytesVerdict(bytes) {
  var size = bytes && bytes.length !== undefined ? bytes.length : 0;
  if (!size) return { ok: false, code: 'empty', message: '这个文件是空的（0 字节），没有可读的内容。' };
  if (size > OFFICE_MAX_FILE) {
    return {
      ok: false,
      code: 'too-big',
      message: '文件太大（' + officeSizeText(size) + '）：离线预览的上限是 ' + officeSizeText(OFFICE_MAX_FILE) + '。',
    };
  }
  var zip = officeZipTotals(bytes);
  if (zip && zip.uncompressed > OFFICE_MAX_EXPANDED) {
    return {
      ok: false,
      code: 'too-expanded',
      message: '这个压缩包解开后有 ' + officeSizeText(zip.uncompressed) + '（压缩包本身只有 ' + officeSizeText(size)
        + '）：为避免把它解进内存后卡住页面，这里拒绝展开。',
    };
  }
  return { ok: true, zip: zip };
}

function officeSizeText(n) {
  var bytes = typeof n === 'number' && isFinite(n) ? n : 0;
  if (bytes >= 1024 * 1024 * 1024) return (Math.round(bytes / (1024 * 1024 * 1024) * 10) / 10) + ' GB';
  if (bytes >= 1024 * 1024) return (Math.round(bytes / (1024 * 1024) * 10) / 10) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

// ── Lazy library loading ──────────────────────────────────────────────────
// A promise per URL, kept forever (a script tag is not re-fetched), and cleared
// on failure so a retry after a transient error is possible.
var _officeScripts = {};
function officeLoadScript(url) {
  if (typeof document === 'undefined') return Promise.reject(new Error('这里没有可用的页面环境'));
  if (_officeScripts[url]) return _officeScripts[url];
  _officeScripts[url] = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = function () { resolve(url); };
    s.onerror = function () {
      _officeScripts[url] = null;
      reject(new Error('无法加载渲染库（' + url + '）：请确认本插件是最新的，然后重启 dsh web 并硬刷新。'));
    };
    document.head.appendChild(s);
  });
  return _officeScripts[url];
}

var _officePptx = null;
function officeLoadPptx() {
  if (typeof window !== 'undefined' && window.__dshFrogPptx) return Promise.resolve(window.__dshFrogPptx);
  if (_officePptx) return _officePptx;
  _officePptx = Promise.resolve().then(function () {
    return import(OFFICE_ASSETS.pptx);
  }).then(function (mod) {
    if (!mod || typeof mod.PptxViewer !== 'function') throw new Error('pptx 渲染库没有导出 PptxViewer');
    try { window.__dshFrogPptx = mod; } catch (e) {}
    return mod;
  }).catch(function (e) {
    _officePptx = null;
    throw new Error('无法加载 pptx 渲染库：' + (e && e.message ? e.message : String(e)));
  });
  return _officePptx;
}

// ── Small DOM helpers (used by every widget below) ────────────────────────
function officeEl(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = String(text);
  return el;
}

function officeClear(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function officeRemove(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function officeHandle(kind, element, extra, destroy) {
  var handle = { kind: kind, element: element, destroy: destroy };
  if (extra) Object.keys(extra).forEach(function (key) { handle[key] = extra[key]; });
  return handle;
}

// Everything a failed mount may have already put on screen must come off again:
// a half-drawn widget plus an error line is worse than the error line alone.
function officeFail(view) {
  officeRemove(view);
}

function officeBytes(input) {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input.buffer) return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
  return new Uint8Array(input);
}

// ── The widgets ───────────────────────────────────────────────────────────
// Every mount appends ONE .office-view to the container it is given, resolves
// with a handle whose destroy() removes exactly what it added, and rejects
// with a message meant for the user. Callers own the container, the loading
// state and the error line; this module owns the reading.

function officeMountDocx(container, bytes) {
  var view = null;
  return officeLoadScript(OFFICE_ASSETS.jszip)
    .then(function () { return officeLoadScript(OFFICE_ASSETS.docx); })
    .then(function () {
      var lib = typeof window !== 'undefined' ? window.docx : null;
      if (!lib || typeof lib.renderAsync !== 'function') throw new Error('docx 渲染库没有就绪');
      view = officeEl('div', 'office-view office-docx');
      container.appendChild(view);
      // renderAsync(data, bodyContainer, styleContainer, options): the SAME
      // element for both, so the document's own <style> block lands beside its
      // pages instead of in some other node — and both are cleared first, which
      // is why a re-mount cannot stack two documents.
      return lib.renderAsync(bytes, view, view, {
        className: 'office-docx-page',
        inWrapper: true,
        breakPages: true,
        // Word writes an explicit "last rendered page break"; honouring it is
        // what keeps a long document's page count equal to Word's.
        ignoreLastRenderedPageBreak: false,
        // Images and embedded objects become data: URLs, so the rendered pages
        // stay self-contained after mount (the default is object URLs, which
        // this widget cannot revoke — it does not own their lifetime).
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderAltChunks: true,
      });
    })
    .then(function () {
      var pages = view.querySelectorAll('section.office-docx-page').length;
      return officeHandle('docx', view, { pages: pages }, function () { officeRemove(view); });
    })
    .catch(function (e) {
      officeFail(view);
      throw e;
    });
}

// One worksheet as a real table. Values come from sheet_to_json with
// raw: false, i.e. the FORMATTED text Excel would show (a date stays a date,
// a percentage keeps its sign) — the honest reading of a spreadsheet, and the
// reason this is not sheet_to_html: every cell is written with textContent,
// so nothing in the file can become markup in our page.
function officeSheetTable(XLSX, sheet, name) {
  if (!sheet) return officeEl('div', 'office-note', '工作表「' + name + '」是空的。');
  var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false }) || [];
  var merges = sheet['!merges'] || [];
  var ref = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
  var width = 0;
  var i;
  for (i = 0; i < rows.length; i++) if (rows[i] && rows[i].length > width) width = rows[i].length;
  if (ref && ref.e.c + 1 > width) width = ref.e.c + 1;
  // A grid nobody can read is not a preview: cap both axes and SAY that it was
  // capped, the way the panel says "(truncated preview)" for a long text file.
  var maxRows = 4000;
  var maxCols = 200;
  var truncated = false;
  if (rows.length > maxRows) { rows = rows.slice(0, maxRows); truncated = true; }
  if (width > maxCols) { width = maxCols; truncated = true; }

  var covered = {};
  var span = {};
  merges.forEach(function (m) {
    if (!m || !m.s || !m.e) return;
    var r0 = m.s.r, c0 = m.s.c, r1 = Math.min(m.e.r, rows.length - 1), c1 = Math.min(m.e.c, width - 1);
    if (r0 > r1 || c0 > c1) return;
    span[r0 + ':' + c0] = { rows: r1 - r0 + 1, cols: c1 - c0 + 1 };
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) if (r !== r0 || c !== c0) covered[r + ':' + c] = 1;
    }
  });

  var wrap = officeEl('div', 'office-grid-wrap');
  var table = officeEl('table', 'office-grid');
  var tbody = officeEl('tbody');
  table.appendChild(tbody);
  for (var r2 = 0; r2 < rows.length; r2++) {
    var tr = officeEl('tr');
    var row = rows[r2] || [];
    for (var c2 = 0; c2 < width; c2++) {
      if (covered[r2 + ':' + c2]) continue;
      var td = officeEl('td', r2 === 0 ? 'office-grid-head' : null);
      var s = span[r2 + ':' + c2];
      if (s) {
        if (s.cols > 1) td.colSpan = s.cols;
        if (s.rows > 1) td.rowSpan = s.rows;
      }
      var value = row[c2];
      td.textContent = value == null ? '' : String(value);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  wrap.appendChild(table);
  if (truncated) {
    wrap.appendChild(officeEl('div', 'office-note', '仅显示前 ' + Math.min(rows.length, maxRows) + ' 行 × ' + width + ' 列（更大的表请用 Excel 打开）。'));
  }
  return wrap;
}

function officeMountXlsx(container, bytes) {
  var view = null;
  return officeLoadScript(OFFICE_ASSETS.xlsx)
    .then(function () {
      var XLSX = typeof window !== 'undefined' ? window.XLSX : null;
      if (!XLSX || typeof XLSX.read !== 'function') throw new Error('xlsx 渲染库没有就绪');
      var book = XLSX.read(bytes, { type: 'array', cellDates: true, cellStyles: false });
      var names = book && book.SheetNames ? book.SheetNames : [];
      if (!names.length) throw new Error('这个工作簿里没有工作表。');
      view = officeEl('div', 'office-view office-xlsx');
      var bar = officeEl('div', 'office-bar');
      var scroll = officeEl('div', 'office-scroll');
      view.appendChild(bar);
      view.appendChild(scroll);
      container.appendChild(view);
      var tabs = [];
      var current = -1;
      var show = function (index) {
        current = index;
        tabs.forEach(function (tab, i) {
          tab.className = 'office-tab' + (i === index ? ' is-active' : '');
          tab.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });
        officeClear(scroll);
        scroll.appendChild(officeSheetTable(XLSX, book.Sheets[names[index]], names[index]));
        scroll.scrollTop = 0;
        scroll.scrollLeft = 0;
      };
      names.forEach(function (name, index) {
        var tab = officeEl('button', 'office-tab', name);
        tab.type = 'button';
        tab.title = '工作表 ' + name;
        tab.addEventListener('click', function () { if (index !== current) show(index); });
        tabs.push(tab);
        bar.appendChild(tab);
      });
      // Only one sheet: the strip would be chrome with nothing to do, so it is
      // dropped rather than shown dead.
      if (names.length < 2) bar.className = 'office-bar is-empty';
      show(0);
      var count = officeEl('span', 'office-count', names.length + ' 个工作表');
      if (names.length > 1) bar.appendChild(count);
      return officeHandle('xlsx', view, { sheets: names.length }, function () { officeRemove(view); });
    })
    .catch(function (e) {
      officeFail(view);
      throw e;
    });
}

function officeMountPptx(container, bytes) {
  var view = null;
  var viewer = null;
  return officeLoadPptx()
    .then(function (mod) {
      view = officeEl('div', 'office-view office-pptx');
      var bar = officeEl('div', 'office-bar');
      var stage = officeEl('div', 'office-scroll office-pptx-stage');
      var prev = officeEl('button', 'office-nav', '‹');
      var next = officeEl('button', 'office-nav', '›');
      var label = officeEl('span', 'office-page', '…');
      prev.type = 'button';
      next.type = 'button';
      prev.title = '上一页';
      next.title = '下一页';
      bar.appendChild(prev);
      bar.appendChild(label);
      bar.appendChild(next);
      view.appendChild(bar);
      view.appendChild(stage);
      container.appendChild(view);
      var sync = function (index) {
        var total = viewer ? viewer.slideCount : 0;
        label.textContent = (index + 1) + ' / ' + total;
        prev.disabled = !total || index <= 0;
        next.disabled = !total || index >= total - 1;
      };
      prev.addEventListener('click', function () {
        if (!viewer) return;
        var at = viewer.currentSlideIndex;
        if (at > 0) viewer.goToSlide(at - 1);
      });
      next.addEventListener('click', function () {
        if (!viewer) return;
        var at = viewer.currentSlideIndex;
        if (at < viewer.slideCount - 1) viewer.goToSlide(at + 1);
      });
      return mod.PptxViewer.open(bytes, stage, {
        fitMode: 'contain',
        zoomPercent: 100,
        // Media and slide bodies are decoded on demand: a 60-slide deck would
        // otherwise inflate every embedded image before the first slide is seen.
        lazyMedia: true,
        lazySlides: true,
        scrollContainer: stage,
        zipLimits: mod.RECOMMENDED_ZIP_LIMITS,
        onSlideChange: function (index) { sync(index); },
        onSlideError: function (index, error) {
          // One broken slide must not blank the deck; the viewer keeps going and
          // the message says which page it was.
          var note = officeEl('div', 'office-note', '第 ' + (index + 1) + ' 页渲染失败：' + (error && error.message ? error.message : String(error)));
          stage.appendChild(note);
        },
      }).then(function (opened) {
        viewer = opened;
        if (!viewer.slideCount) throw new Error('这份演示文稿里没有可显示的幻灯片。');
        sync(viewer.currentSlideIndex || 0);
        return officeHandle('pptx', view, { slides: viewer.slideCount }, function () {
          try { viewer.destroy(); } catch (e) {}
          viewer = null;
          officeRemove(view);
        });
      });
    })
    .catch(function (e) {
      viewer = null;
      officeFail(view);
      throw new Error('无法解析这份演示文稿：' + (e && e.message ? e.message : String(e)));
    });
}

// The one entry point every caller uses.
//
// bytes may be a Uint8Array or an ArrayBuffer (the shell's document seat hands
// over a Uint8Array; the panel and the popout page fetch an ArrayBuffer from
// /media). Returns a promise for a handle — never a bare element — because every
// widget here allocates something that must be released: a canvas, a worker, a
// URL, a ResizeObserver.
function officeMount(container, kind, bytes, options) {
  var opts = options || {};
  if (!container) return Promise.reject(new Error('没有可挂载的容器'));
  var data = officeBytes(bytes);
  var verdict = officeBytesVerdict(data);
  if (!verdict.ok) return Promise.reject(new Error(verdict.message));
  if (kind === 'docx') return officeMountDocx(container, data, opts);
  if (kind === 'xlsx') return officeMountXlsx(container, data, opts);
  if (kind === 'pptx') return officeMountPptx(container, data, opts);
  return Promise.reject(new Error('这个格式还不能离线渲染：' + String(kind || '')));
}

// Where the panel and the popout page read the bytes of a workspace file.
function officeMediaUrl(path) {
  return '/dsh-sidebar-frog/media?path=' + encodeURIComponent(String(path || ''));
}
