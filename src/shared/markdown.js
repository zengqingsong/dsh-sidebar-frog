// Shared Markdown → HTML renderer (portable JS: var/function, no template
// literals). This file is inlined verbatim into the standalone page's
// String.raw template and into the client bundle, so it must never contain a
// literal backtick (written as \x60) or a dollar-followed-by-brace sequence.
//
// Supported flavours:
//   - Fenced code blocks, highlighted via highlightCode (shared/highlight.js);
//     mermaid fences are kept verbatim inside a .mermaid container so the
//     diagram can be rendered by Mermaid afterwards; jsxgraph fences are kept
//     inside a .jsxgraph container so the script can build an interactive
//     board afterwards
//   - TeX math $...$ (inline) / $$...$$ (display): kept as escaped literal
//     text so MathJax can typeset it afterwards (placeholder tokens protect
//     the formula internals from every other Markdown rule)
//   - GFM tables:  | h1 | h2 |  +  delimiter  | :-- | :--: |  + body rows
//   - Task lists:  - [ ] todo  /  - [x] done  (disabled checkbox)
//   - Strikethrough ~~x~~, highlight ==x==, superscript ^x^, subscript ~x~
//   - Bare http(s):// and www. URLs become links automatically
//   - Whitelisted raw inline HTML: <kbd>, <br>, <sub>, <sup>, <b>, <strong>,
//     <i>, <em>, <u>, <small>, <mark>, <del>, <ins>, <span>, <font>, <abbr>
//     (sanitized: no on* handlers, no javascript: URLs)
//   - Block-level raw HTML: <details>/<summary> (collapsible answers),
//     <div>, <figure>, <figcaption>, <p>, <ul>/<ol>/<li>, <dl>/<dt>/<dd>,
//     and raw HTML tables (<table>/<tr>/<th>/<td>…) — each block is
//     sanitized and its inner Markdown is re-rendered, so content inside
//     (lists, math, bold, nested blocks) renders too
//   - Inline SVG: an <svg>…</svg> block is emitted as-is after stripping
//     <script> and on*="" handlers; ![](local.svg) is resolved relative to the
//     Markdown file through the /dsh-sidebar-frog/media route when the caller
//     passes opts.path.
function sanitizeSvg(raw) {
  var s = String(raw).replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<\/?script[^>]*>/gi, '');
  s = s.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript\s*:/gi, '');
  return s;
}

// ── Raw HTML sanitization (inline + block) ───────────────────────────────
// Strip a value that is a script payload rather than ordinary attribute data:
// javascript:, vbscript:, data:text/html, and expression()/url(javascript:)
// (IE-era CSS injection). Everything else — colors, sizes, alignment, hrefs
// to http(s)/relative targets — is kept.
function sanitizeAttrValue(v) {
  var x = String(v).replace(/["'\x60]/g, '');
  if (/^\s*javascript\s*:/i.test(x) || /^\s*vbscript\s*:/i.test(x)) return '';
  if (/^data\s*:\s*text\/html/i.test(x)) return '';
  x = x.replace(/expression\s*\(/gi, 'x(');
  x = x.replace(/(url\s*\(\s*)(?:javascript\s*:)?/gi, '$1');
  x = x.replace(/behavior\s*:/gi, 'x:');
  return x;
}
// Rewrite one raw <tag ...> opener (no content): drops on* handlers and other
// dangerous attributes, scrubs attribute values, and escapes what remains so
// the tag cannot be reinterpreted. Returns the sanitized opener string.
function sanitizeHtmlTag(open) {
  var nm = /^<\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(open) || [];
  var name = nm[1] || '';
  var body = open.slice(1, -1).replace(/^[a-zA-Z][a-zA-Z0-9-]*/, '');
  var attrs = [];
  var re = /([a-zA-Z][a-zA-Z0-9-]*)((?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)/g;
  var m;
  while ((m = re.exec(body))) {
    var an = m[1];
    var val = m[2] || '';
    var eq = /^\s*=/.test(val);
    if (/^on/i.test(an) || /^(srcdoc|formaction|xlink:href)$/i.test(an)) continue;
    if (!eq) { attrs.push(an); continue; }
    var raw = val.replace(/^\s*=\s*/, '');
    var q = raw.charAt(0);
    if (q === '"' || q === '\'') raw = raw.slice(1, -1);
    var safe = sanitizeAttrValue(raw);
    attrs.push(an + '="' + safe.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"');
  }
  return '<' + name + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
}
// Block-level raw HTML elements recognized by mdToHtml. details (with
// summary) is the collapsible "answer" convention used throughout the
// courseware; the rest are ordinary layout / table containers. Anything not
// in this set is escaped (the default behavior for unknown markup).
var BLOCK_HTML_TAGS = {
  details: 1, div: 1, figure: 1, figcaption: 1, summary: 1, p: 1,
  ul: 1, ol: 1, li: 1, dl: 1, dt: 1, dd: 1,
  table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, th: 1, td: 1,
};
// Collect the raw source of a block-level HTML element: starts at its opening
// tag (already on the current line) and runs until the matching closing tag
// (case-insensitive, closer-tag), counting nested openers so a nested
// details inside details gathers to the OUTER closer. Unclosed elements
// are terminated at end-of-document. Fences MAY appear inside — the inner
// source is re-rendered by mdToHtml, whose fence rule consumes them.
function gatherBlockHtml(line, i, lines, tag) {
  var reClose = new RegExp('</' + tag + '\\b[^>]*>', 'i');
  var reOpen = new RegExp('<' + tag + '\\b', 'i');
  var depth = (line.match(reOpen) || []).length - (line.match(reClose) || []).length;
  var buf = [line];
  while (depth > 0 && i + 1 < lines.length) {
    i += 1;
    var ln = lines[i];
    buf.push(ln);
    depth += (ln.match(reOpen) || []).length - (ln.match(reClose) || []).length;
  }
  return { block: buf.join('\n'), next: i + 1, closed: depth <= 0 };
}
// Inline-ish elements: content is ONE inline source line (whitespace
// collapsed), not a mini document.
var INLINE_BLOCK_TAGS = { summary: 1, p: 1, li: 1, dt: 1, dd: 1, figcaption: 1, th: 1, td: 1 };
// <tr>: render each <th>/<td> cell separately (Markdown inside every cell),
// keeping the row structure verbatim.
function renderTr(block, opts) {
  var reClose = /<\/tr\b[^>]*>/i;
  var cIdx = block.lastIndexOf('</tr');
  var inner = cIdx >= 0 ? block.slice(0, cIdx) : block;
  var closeTag = (block.match(reClose) || ['</tr>'])[0];
  var out = [];
  var reCell = /<(th|td)((?:\s[^>]*)?)\s*>[\s\S]*?<\/\1\s*>/gi;
  var m;
  var last = 0;
  while ((m = reCell.exec(inner))) {
    if (m.index > last) out.push(htmlEscape(inner.slice(last, m.index)));
    var cellAttr = sanitizeHtmlTag('<' + m[1] + (m[2] || '') + '>');
    var cellText = m[0].slice(m[0].indexOf('>') + 1, m[0].lastIndexOf('</'));
    cellText = cellText.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    out.push(cellAttr + mdInline(mdEscape(cellText), opts) + '</' + m[1] + '>');
    last = m.index + m[0].length;
  }
  if (last < inner.length) out.push(htmlEscape(inner.slice(last)));
  return out.join('') + closeTag;
}
// Turn a collected raw block into sanitized HTML. The opening tag is
// re-emitted through sanitizeHtmlTag (on* handlers / script URLs dropped).
// Inner rendering depends on the element:
//   - <summary> / <p> / <li> / <dt> / <dd> / <figcaption> / <th> / <td>:
//     one inline line (whitespace collapsed)
//   - <tr>: cell-aware (see renderTr)
//   - everything else (details, div, figure, ul, ol, dl, table, thead, tbody,
//     tfoot): the inner source is a mini Markdown document, re-rendered via
//     mdToHtml — lists, math, nested blocks, fences all work inside
function renderBlockHtml(block, tag, opts) {
  var m = new RegExp('<' + tag + '((?:\\s[^>]*)?)\\s*>', 'i').exec(block);
  var openTag = sanitizeHtmlTag(m ? ('<' + tag + (m[1] || '') + '>') : ('<' + tag + '>'));
  var reClose = new RegExp('</' + tag + '\\b[^>]*>', 'i');
  var closeMatch = block.match(reClose);
  var closeTag = closeMatch ? closeMatch[0] : '</' + tag + '>';
  var inner = '';
  if (m) {
    var openLen = m[0].length;
    var cIdx = closeMatch ? block.lastIndexOf(closeTag) : -1;
    inner = cIdx >= openLen ? block.slice(openLen, cIdx) : block.slice(openLen);
  }
  if (tag === 'tr') return renderTr(block, opts);
  if (INLINE_BLOCK_TAGS[tag]) {
    var text = inner.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return openTag + mdInline(mdEscape(text), opts) + closeTag;
  }
  return openTag + mdToHtml(inner, opts) + closeTag;
}

function mdEscape(s) {
  s = String(s);
  // Protect whitelisted raw inline HTML so the escaping below cannot turn it
  // into visible entity text. Whole elements (opener + content + closer) are
  // protected, mirroring the original kbd/sub/sup behavior:
  //   - paired: kbd/sub/sup, then the simple-markup whitelist — b, strong,
  //     i, em, u, s, small, mark, del, ins, q, span, font, abbr, a — with
  //     any attribute list (colors, sizes, href…); each opener is sanitized
  //     (on* handlers and script-ish URLs dropped, values scrubbed)
  //   - void: br, hr, wbr
  //   - single-line svg (sanitized)
  var toks = [];
  s = s.replace(/<(b|strong|i|em|u|s|small|mark|del|ins|q|span|font|abbr|a|figcaption)\b[^>]*>[\s\S]*?<\/\1>|<(kbd|sub|sup)>[\s\S]*?<\/\2>|<img\b[^>]*>|<wbr\s*\/?>|<br\s*\/?>|<hr\s*\/?>|<svg[\s\S]*?<\/svg>/gi, function (m) {
    if (/^<svg/i.test(m)) { m = sanitizeSvg(m); }
    else if (/^<(kbd|sub|sup)>/i.test(m)) { /* content is plain text — keep as-is */ }
    else {
      var gi = m.indexOf('>');
      m = sanitizeHtmlTag(m.slice(0, gi + 1)) + m.slice(gi + 1);
    }
    toks.push(m);
    return '\x01K' + toks.length + '\x02';
  });
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return s.replace(/\x01K(\d+)\x02/g, function (m, d) { return toks[Number(d) - 1] || m; });
}

// Escape text for HTML element content WITHOUT mdEscape's token round-trip:
// whitelisted raw tags (<br>, <kbd>, …) must NOT be reconstructed — the
// escaped text is later read back verbatim via textContent (Mermaid source).
function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── GFM table helpers ───────────────────────────────────────────────────
function tableCells(line) {
  var s = String(line).trim();
  if (!s) return [];
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.charAt(s.length - 1) === '|' && s.charAt(s.length - 2) !== '\\') s = s.slice(0, -1);
  if (s.indexOf('|') < 0) return [];
  // Split on pipes that are not backslash-escaped, then unescape the ones
  // inside cells. Splitting blindly on every '|' cut a cell in half the moment
  // its content had one — an escaped union type, a shell pipeline, a code span
  // — and shifted every column after it, which is worse than not rendering the
  // table at all because the result still looks like a table.
  var cells = [];
  var cur = '';
  for (var k = 0; k < s.length; k += 1) {
    var ch = s.charAt(k);
    if (ch === '\\' && s.charAt(k + 1) === '|') { cur += '|'; k += 1; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}
function isDelimRow(line) {
  var cells = tableCells(line);
  if (!cells || cells.length < 2) return false;
  for (var j = 0; j < cells.length; j += 1) {
    if (!/^\s*:?-+:?\s*$/.test(cells[j])) return false;
  }
  return true;
}
function isTableRow(line) {
  return String(line).indexOf('|') >= 0;
}
function cellAlign(cell) {
  var t = String(cell).trim();
  var left = t.charAt(0) === ':';
  var right = t.charAt(t.length - 1) === ':';
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return '';
}
// Resolve a Markdown image src against the hosting media route. Web-ish URLs
// (scheme:, data:, #fragment, /absolute) are passed through untouched; relative
// targets are rebased onto the Markdown file's directory. media is only set
// when the caller supplied opts.path (i.e. a real document is being rendered).
function mdMedia(url, dir, media) {
  if (!media) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:|data:|#|\/)/i.test(url)) return url;
  return media + encodeURIComponent(dir + url);
}
function mdCell(src, tag, align, opts) {
  var st = align ? ' style="text-align:' + align + '"' : '';
  return '<' + tag + st + '>' + mdInline(mdEscape(String(src).trim()), opts) + '</' + tag + '>';
}

// ── Inline pass ─────────────────────────────────────────────────────────
function mdInline(s, opts) {
  opts = opts || {};
  var math = [];
  var kept = [];
  // Protect display ($$...$$) first, then inline ($...$) math. Tokens carry no
  // characters the markup regexes act on, and the restore is verbatim.
  s = s.replace(/\$\$([^$\n]+)\$\$/g, function (m) { math.push(m); return '\x01M' + math.length + '\x02'; });
  s = s.replace(/\$([^$\n]+)\$/g, function (m) { math.push(m); return '\x01M' + math.length + '\x02'; });
  // Re-protect any raw single-line <svg> that mdEscape let through, so the
  // rules below (strong/em, auto-link on xmlns URLs, …) never touch its markup.
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, function (m) { kept.push(m); return '\x01A' + kept.length + '\x02'; });
  s = s.replace(/\x60([^\x60]+)\x60/g, function (m, c) { return '<code>' + c + '</code>'; });
  // Images and links are shelved as tokens while auto-linking runs, so a URL
  // inside a rendered href/src cannot be wrapped in a second anchor.
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
    kept.push('<img alt="' + alt + '" src="' + mdMedia(url, opts.dir || '', opts.media || '') + '">');
    return '\x01A' + kept.length + '\x02';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
    kept.push('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    return '\x01A' + kept.length + '\x02';
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  s = s.replace(/\^([^^\n]+)\^/g, '<sup>$1</sup>');
  s = s.replace(/~([^~\n]+)~/g, '<sub>$1</sub>');
  // Bare URLs. A URL directly after ( is skipped — that shape is a Markdown
  // link target handled above. Trailing punctuation is kept outside the link.
  s = s.replace(/(^|[\s([>])((?:https?:\/\/|www\.)[^\s<>"']+)/g, function (m, pre, url) {
    if (pre === '(') return m;
    var tail = /([.,;:!?)\]}>]+)$/.exec(url);
    var core = url;
    var suffix = '';
    if (tail) { suffix = tail[1]; core = url.slice(0, url.length - suffix.length); }
    if (!core) return m;
    var href = /^www\./i.test(core) ? 'http://' + core : core;
    return pre + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + core + '</a>' + suffix;
  });
  s = s.replace(/\x01A(\d+)\x02/g, function (m, d) { return kept[Number(d) - 1] || m; });
  return s.replace(/\x01M(\d+)\x02/g, function (m, d) { return math[Number(d) - 1] || m; });
}

// ── Lists ───────────────────────────────────────────────────────────────
// One list, at any depth. The previous rule matched /^\s*[-*+]\s+/ for every
// line and stripped the leading whitespace, so a nested list came out flat:
// the structure the document expressed was simply gone. Walking the markers
// with a stack of open levels keeps it — and gives a wrapped line somewhere to
// go, where it used to fall out of the list as a stray paragraph still carrying
// its indentation.
function mdListMarker(line) {
  var m = /^([ \t]*)([-*+]|\d+\.)([ \t]+)([\s\S]*)$/.exec(String(line));
  if (!m) return null;
  var bullet = m[2].charAt(0);
  return {
    // Tabs count as four columns, the usual reading of a tab stop.
    indent: m[1].replace(/\t/g, '    ').length,
    ordered: !(bullet === '-' || bullet === '*' || bullet === '+'),
    number: parseInt(m[2], 10) || 1,
    body: m[4],
  };
}

function mdListBlock(lines, start, opts) {
  // One level. Deeper markers recurse WHILE the parent item is still open, so
  // the nested list is emitted inside the li it belongs to rather than beside
  // it — which is what separates a real nested list from markup a browser will
  // repair on its own and a stylesheet cannot target.
  var first = mdListMarker(lines[start]);
  var base = first.indent;
  var tag = first.ordered ? 'ol' : 'ul';
  // A list that does not start at 1 has to say so, or the browser renumbers it
  // and the document's own numbering is lost.
  var html = ['<' + tag + (tag === 'ol' && first.number !== 1 ? ' start="' + first.number + '"' : '') + '>'];
  var open = false;
  var i = start;
  var item = function (body) {
    var task = /^\[([ xX])\][ \t]?([\s\S]*)$/.exec(body);
    if (task) {
      html.push('<li class="task-list-item"><input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + '> ' + mdInline(mdEscape(task[2]), opts));
    } else {
      html.push('<li>' + mdInline(mdEscape(body), opts));
    }
    open = true;
  };
  // An indented line that is not a marker: a wrapped line of the open item, or
  // a second block in it after a blank line. Both are item text — this renderer
  // has no indented-code rule, so that is the least surprising reading.
  var continuation = function (line) {
    html.push(' ' + mdInline(mdEscape(line.replace(/^[ \t]+/, '')), opts));
  };
  while (i < lines.length) {
    var mark = mdListMarker(lines[i]);
    if (mark && mark.indent === base) {
      if ((mark.ordered ? 'ol' : 'ul') !== tag) break;
      if (open) html.push('</li>');
      item(mark.body);
      i += 1;
      continue;
    }
    if (mark && mark.indent > base) {
      var sub = mdListBlock(lines, i, opts);
      html.push(sub.html);
      i = sub.next;
      continue;
    }
    if (lines[i].trim() === '') {
      // A blank line inside a list is ordinary — spacing, or a paragraph in an
      // item. The list carries on only if something that belongs to it follows.
      var j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j += 1;
      if (j >= lines.length) break;
      var next = mdListMarker(lines[j]);
      if (next && next.indent >= base) { i = j; continue; }
      if (open && lines[j].search(/\S/) > base) { continuation(lines[j]); i = j + 1; continue; }
      break;
    }
    if (open && lines[i].search(/\S/) > base) { continuation(lines[i]); i += 1; continue; }
    break;
  }
  if (open) html.push('</li>');
  html.push('</' + tag + '>');
  return { html: html.join(''), next: i };
}

// ── Block pass ──────────────────────────────────────────────────────────
function mdToHtml(src, opts) {
  opts = opts || {};
  var docPath = String(opts.path || '').replace(/\\/g, '/');
  var lastSlash = docPath.lastIndexOf('/');
  // dir/media can arrive precomputed (recursive block renders pass them
  // through) — only derive them from opts.path when not supplied.
  var mdOpts = {
    dir: opts.dir != null ? opts.dir : (lastSlash >= 0 ? docPath.slice(0, lastSlash + 1) : ''),
    media: opts.media != null ? opts.media : (opts.path ? '/dsh-sidebar-frog/media?path=' : ''),
  };
  var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    var fenceOpen = /^\s*(\x60{3,}|~{3,})([\w+-]*)/.exec(line);
    if (fenceOpen) {
      var fenceCh = fenceOpen[1].charAt(0);
      var langHint = fenceOpen[2];
      // Only the fence character that opened the block closes it: a tilde
      // fence inside a backtick block is content, and vice versa.
      var fenceClose = fenceCh === '~' ? /^\s*~{3,}/ : /^\s*\x60{3,}/;
      var buf = [];
      i += 1;
      while (i < lines.length && !fenceClose.test(lines[i])) { buf.push(lines[i]); i += 1; }
      i += 1;
      var codeText = buf.join('\n');
      if (langHint === 'mermaid') {
        // Keep the diagram source verbatim inside a .mermaid container; the
        // renderer replaces it with Mermaid's SVG. tex2jax_ignore keeps the
        // MathJax pass from reading '$'-looking text inside diagram labels.
        out.push('<div class="mermaid tex2jax_ignore">' + htmlEscape(codeText) + '</div>');
      } else if (langHint === 'jsxgraph') {
        // Keep the JSXGraph script verbatim inside a .jsxgraph container; the
        // renderer later runs it (with the generated board id in scope) to
        // build an interactive board. Same MathJax ignore rationale.
        out.push('<div class="jsxgraph tex2jax_ignore">' + htmlEscape(codeText) + '</div>');
      } else {
        out.push('<pre><code>' + highlightCode(codeText, langHint) + '</code></pre>');
      }
      continue;
    }
    // Display math: a line starting with $$ (leading spaces allowed). If the
    // closer is not on the same line, keep reading until one appears (code
    // fences were consumed above, so this cannot steal fence content). The
    // whole formula is emitted as one .math-display element whose text node
    // MathJax can typeset as a single $$...$$ block. Newlines inside the
    // formula are collapsed to spaces — TeX treats them as whitespace.
    if (/^\s*\$\$/.test(line)) {
      var rest = line.replace(/^\s*\$\$/, '');
      var closeIdx = rest.indexOf('$$');
      var parts = [];
      if (closeIdx >= 0) {
        parts.push(rest.slice(0, closeIdx));
        i += 1;
      } else {
        parts.push(rest);
        i += 1;
        while (i < lines.length) {
          var cur = lines[i];
          i += 1;
          var cj = cur.indexOf('$$');
          if (cj >= 0) { parts.push(cur.slice(0, cj)); break; }
          parts.push(cur);
        }
      }
      var mathBody = parts.join('\n').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      out.push('<div class="math-display">' + mdEscape('$$' + mathBody + '$$') + '</div>');
      continue;
    }
    // Standalone SVG block: gather until the closing tag, then emit sanitized.
    if (/^\s*<svg/i.test(line)) {
      var svgBuf = [line];
      var closed = /<\/svg>/i.test(line);
      while (!closed && i + 1 < lines.length) {
        i += 1;
        svgBuf.push(lines[i]);
        closed = /<\/svg>/i.test(lines[i]);
      }
      out.push(sanitizeSvg(svgBuf.join('\n')));
      i += 1;
      continue;
    }
    // Block-level raw HTML (whitelisted: details/div/figure/figcaption/
    // summary/p/ul/ol/li/dl/dt/dd). Gather through the matching closing tag,
    // sanitize the opener, and re-render the inner source as Markdown — so a
    // <details><summary>答案</summary> block shows collapsible, fully rendered
    // content (math, lists, bold…). Unknown tags on a line are escaped by the
    // paragraph rule, exactly as before.
    var bhMatch = /^\s*<([a-zA-Z][a-zA-Z0-9-]*)\b/.exec(line);
    if (bhMatch && BLOCK_HTML_TAGS[bhMatch[1].toLowerCase()]) {
      var bhTag = bhMatch[1].toLowerCase();
      if (!(bhTag === 'summary' && /\/\s*>$/.test(line))) {
        var bh = gatherBlockHtml(line, i, lines, bhTag);
        out.push(renderBlockHtml(bh.block, bhTag, mdOpts));
        i = bh.next;
        continue;
      }
    }
    // GFM table: header row + delimiter row (+ optional body rows).
    if (isTableRow(line) && i + 1 < lines.length && isDelimRow(lines[i + 1])) {
      var headCells = tableCells(line);
      var delimCells = tableCells(lines[i + 1]);
      var aligns = [];
      for (var a = 0; a < headCells.length; a += 1) aligns.push(cellAlign(delimCells[a] || ''));
      var tbl = ['<table>'];
      tbl.push('<thead><tr>');
      for (var h = 0; h < headCells.length; h += 1) tbl.push(mdCell(headCells[h], 'th', aligns[h], mdOpts));
      tbl.push('</tr></thead>');
      i += 2;
      var openedBody = false;
      while (i < lines.length && isTableRow(lines[i]) && !isDelimRow(lines[i])) {
        var cells = tableCells(lines[i]);
        if (!openedBody) { tbl.push('<tbody>'); openedBody = true; }
        tbl.push('<tr>');
        for (var c = 0; c < headCells.length; c += 1) tbl.push(mdCell(cells[c] == null ? '' : cells[c], 'td', aligns[c], mdOpts));
        tbl.push('</tr>');
        i += 1;
      }
      if (openedBody) tbl.push('</tbody>');
      tbl.push('</table>');
      out.push(tbl.join(''));
      continue;
    }
    var hd = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hd) {
      var lv = hd[1].length;
      out.push('<h' + lv + '>' + mdInline(mdEscape(hd[2]), mdOpts) + '</h' + lv + '>');
      i += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
    if (/^\s*>\s?/.test(line)) {
      var q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      // A quote holds BLOCKS, not a run of inline text. Stripping the marker and
      // running the remainder through mdInline — which is what this did — drew
      // a quoted "- a" as the literal characters "- a": every list, heading,
      // fence, table and nested quote inside a quote came out as text, which is
      // the marker showing up in the document rather than a subtle drift.
      // Re-entering the block renderer on the stripped lines fixes all of them
      // at once, and nesting needs no special handling because each level strips
      // exactly one marker before recursing.
      //
      // A quote whose body is a single paragraph keeps its previous shape (the
      // p wrapper is dropped), so nothing already written looks different. The
      // test is deliberately literal — starts with the p opener, ends with its
      // closer, and the first closer is the last four characters — because a
      // greedy /^<p>([\s\S]*)<\/p>$/ matches from the first opener to the LAST
      // closer and would tear the tags out of a two-paragraph quote.
      var quoted = mdToHtml(q.join('\n'), mdOpts);
      var oneParagraph = quoted.slice(0, 3) === '<p>' && quoted.slice(-4) === '</p>' &&
        quoted.indexOf('</p>') === quoted.length - 4;
      out.push('<blockquote>' + (oneParagraph ? quoted.slice(3, -4) : quoted) + '</blockquote>');
      continue;
    }
    if (mdListMarker(line)) {
      var list = mdListBlock(lines, i, mdOpts);
      out.push(list.html);
      i = list.next;
      continue;
    }
    // Setext heading: an underlined title. Only the '=' form is honoured here.
    // A '---' underline is also a horizontal rule, and this renderer has always
    // drawn it as one, so re-reading it as an h2 is a change nobody asked for.
    // '=====' cannot be anything but an underline, and today it renders as a
    // paragraph containing '=====', which is never what was meant.
    if (line.trim() !== '' && i + 1 < lines.length && /^\s*=+\s*$/.test(lines[i + 1])) {
      out.push('<h1>' + mdInline(mdEscape(line.trim()), mdOpts) + '</h1>');
      i += 2;
      continue;
    }
    if (line.trim() === '') { i += 1; continue; }
    out.push('<p>' + mdInline(mdEscape(line), mdOpts) + '</p>');
    i += 1;
  }
  return out.join('\n');
}
