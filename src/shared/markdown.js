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
//
// opts (dir/media, see mdMedia) additionally REBASES the URLs the tag carries:
// a raw <img src="docs/logo/logo.svg"> in a Markdown file is relative to THAT
// file, and left alone it resolved against the app's own URL — where it 404s, so
// the image silently did not appear. ![alt](relative.svg) already went through
// mdMedia; raw HTML images now do too. Omitted opts (no document path) keep the
// old behavior: no rebasing.
function sanitizeHtmlTag(open, opts) {
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
    if (opts) {
      if (/^(src|poster)$/i.test(an)) safe = mdMedia(safe, opts);
      else if (/^srcset$/i.test(an)) safe = mdRebaseSrcset(safe, opts);
    }
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
  // <picture> is the light/dark image switch GitHub READMEs use — a <source
  // media="(prefers-color-scheme: dark)"> beside a fallback <img>. It is
  // gathered as a block so a multi-line one survives (line-by-line paragraph
  // handling split it), and rendered by renderPicture.
  picture: 1,
};
// A <picture> element, rebuilt from its own children: the <source> elements and
// the fallback <img> are sanitized and their URLs rebased (see sanitizeHtmlTag),
// and the browser keeps making the light/dark choice itself — that IS the
// element's contract, and re-implementing it here would only disagree with the
// engine on the cases it already handles (width media queries, image formats).
// Anything else inside is escaped: a <picture> holds sources and an image, so
// stray text or markup is not silently swallowed.
function renderPicture(block, opts, startLine, endLine) {
  var open = /<picture((?:\s[^>]*)?)\s*>/i.exec(block);
  var rawOpen = sanitizeHtmlTag('<picture' + (open ? (open[1] || '') : '') + '>', opts);
  var opener = startLine ? mdTag(opts, rawOpen, startLine, endLine) : rawOpen;
  var afterOpen = open ? block.slice(open.index + open[0].length) : block;
  var closeAt = afterOpen.toLowerCase().lastIndexOf('</picture');
  var inner = closeAt >= 0 ? afterOpen.slice(0, closeAt) : afterOpen;
  var out = [];
  var re = /<(?:source|img)\b[^>]*>/gi;
  var m;
  var last = 0;
  while ((m = re.exec(inner))) {
    if (m.index > last) {
      var gap = inner.slice(last, m.index);
      if (gap.trim()) out.push(htmlEscape(gap));
    }
    out.push(sanitizeHtmlTag(m[0], opts));
    last = m.index + m[0].length;
  }
  if (last < inner.length) {
    var tail = inner.slice(last);
    if (tail.trim()) out.push(htmlEscape(tail));
  }
  return opener + out.join('') + '</picture>';
}
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
function renderTr(block, opts, startLine) {
  var reClose = /<\/tr\b[^>]*>/i;
  var cIdx = block.lastIndexOf('</tr');
  var inner = cIdx >= 0 ? block.slice(0, cIdx) : block;
  var closeTag = (block.match(reClose) || ['</tr>'])[0];
  var out = [];
  // The row's own <tr> is emitted by renderBlockHtml, not here; the cells carry
  // the row's line so that a selection inside a cell still resolves to it.
  var cellLine = startLine || 0;
  var reCell = /<(th|td)((?:\s[^>]*)?)\s*>[\s\S]*?<\/\1\s*>/gi;
  var m;
  var last = 0;
  while ((m = reCell.exec(inner))) {
    if (m.index > last) out.push(htmlEscape(inner.slice(last, m.index)));
    var cellAttr = mdTag(opts, sanitizeHtmlTag('<' + m[1] + (m[2] || '') + '>'), cellLine);
    var cellText = m[0].slice(m[0].indexOf('>') + 1, m[0].lastIndexOf('</'));
    cellText = cellText.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    out.push(cellAttr + mdInline(mdEscape(cellText, opts), opts) + '</' + m[1] + '>');
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
function renderBlockHtml(block, tag, opts, startLine, nextLine) {
  var m = new RegExp('<' + tag + '((?:\\s[^>]*)?)\\s*>', 'i').exec(block);
  var openTag = sanitizeHtmlTag(m ? ('<' + tag + (m[1] || '') + '>') : ('<' + tag + '>'));
  // The block's span is known to the caller (gatherBlockHtml counted the lines),
  // so the opener carries it; the INNER render only needs to know where the
  // source it was handed begins.
  var span = mdAnchor(opts, startLine || 0, nextLine || 0);
  if (span) openTag = openTag.slice(0, -1) + span + '>';
  var reClose = new RegExp('</' + tag + '\\b[^>]*>', 'i');
  var closeMatch = block.match(reClose);
  var closeTag = closeMatch ? closeMatch[0] : '</' + tag + '>';
  var inner = '';
  if (m) {
    var openLen = m[0].length;
    var cIdx = closeMatch ? block.lastIndexOf(closeTag) : -1;
    inner = cIdx >= openLen ? block.slice(openLen, cIdx) : block.slice(openLen);
  }
  if (tag === 'tr') return renderTr(block, opts, startLine);
  if (tag === 'picture') return renderPicture(block, opts, startLine, nextLine);
  if (INLINE_BLOCK_TAGS[tag]) {
    var text = inner.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return openTag + mdInline(mdEscape(text, opts), opts) + closeTag;
  }
  // What follows the opening tag on its own line is inner line 1, so the offset
  // is the opener's line MINUS one: inner line k is source line startLine+k-1.
  var innerOpts = Object.assign({}, opts, { lineOffset: (opts.lineOffset || 0) + (startLine || 1) - 1 });
  return openTag + mdToHtml(inner, innerOpts) + closeTag;
}

function mdEscape(s, opts) {
  s = String(s);
  // Protect whitelisted raw inline HTML so the escaping below cannot turn it
  // into visible entity text. Whole elements (opener + content + closer) are
  // protected, mirroring the original kbd/sub/sup behavior:
  //   - paired: kbd/sub/sup, then the simple-markup whitelist — b, strong,
  //     i, em, u, s, small, mark, del, ins, q, span, font, abbr, a — with
  //     any attribute list (colors, sizes, href…); each opener is sanitized
  //     (on* handlers and script-ish URLs dropped, values scrubbed)
  //   - void: br, hr, wbr, and img — an image's src is REBASED onto the media
  //     route when opts carries one (see sanitizeHtmlTag), which is what makes a
  //     raw <img src="docs/logo/logo.svg"> in a README actually appear
  //   - picture: the whole element (sources + fallback image) is rebuilt by
  //     renderPicture, so a <picture> inside a paragraph renders as the image
  //     instead of as visible angle brackets
  //   - single-line svg (sanitized)
  var toks = [];
  s = s.replace(/<picture\b[^>]*>[\s\S]*?<\/picture>|<(b|strong|i|em|u|s|small|mark|del|ins|q|span|font|abbr|a|figcaption)\b[^>]*>[\s\S]*?<\/\1>|<(kbd|sub|sup)>[\s\S]*?<\/\2>|<img\b[^>]*>|<wbr\s*\/?>|<br\s*\/?>|<hr\s*\/?>|<svg[\s\S]*?<\/svg>/gi, function (m) {
    if (/^<svg/i.test(m)) { m = sanitizeSvg(m); }
    else if (/^<picture/i.test(m)) { m = renderPicture(m, opts); }
    else if (/^<(kbd|sub|sup)>/i.test(m)) { /* content is plain text — keep as-is */ }
    else {
      var gi = m.indexOf('>');
      m = sanitizeHtmlTag(m.slice(0, gi + 1), opts) + m.slice(gi + 1);
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
function mdMedia(url, opts) {
  var media = (opts && opts.media) || '';
  if (!media) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:|data:|#|\/)/i.test(url)) return url;
  var out = media + encodeURIComponent(((opts && opts.dir) || '') + url);
  // The session the document is being read in. The media route resolves a
  // relative path against that session's workspace (see src/host/routes.js), so
  // without it a document-relative image resolves against whatever the sandbox
  // root happens to be — a 404, i.e. a silently broken image.
  if (opts && opts.sessionId) out += '&sessionId=' + encodeURIComponent(opts.sessionId);
  return out;
}
// srcset is a comma-separated list of "url [descriptor]" candidates, so each
// candidate's URL is rebased on its own and its descriptor (2x, 640w) is
// kept. A srcset carrying a data: URL is passed through untouched: those
// contain commas of their own, and splitting them would corrupt the value —
// and a data URL needs no rebasing anyway.
function mdRebaseSrcset(value, opts) {
  var text = String(value);
  if (!(opts && opts.media) || /data\s*:/i.test(text)) return text;
  return text.split(',').map(function (part) {
    var m = /^(\s*)(\S+)([\s\S]*)$/.exec(part);
    if (!m) return part;
    return m[1] + mdMedia(m[2], opts) + m[3];
  }).join(',');
}
function mdCell(src, tag, align, opts, startLine) {
  var st = align ? ' style="text-align:' + align + '"' : '';
  return '<' + tag + st + mdAnchor(opts, startLine || 0) + '>' + mdInline(mdEscape(String(src).trim(), opts), opts) + '</' + tag + '>';
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
    kept.push('<img alt="' + alt + '" src="' + mdMedia(url, opts) + '">');
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
  // Tokens can nest — a badge is [![alt](image)](link), so the link token's
  // replacement text CONTAINS the image token. String.replace never rescans
  // what it just wrote, so a single pass left the inner token in the output and
  // the badge rendered as the literal characters "A1" instead of the image.
  // Restoring repeatedly until nothing is left fixes every nesting depth, and the
  // bound is only there so a malformed token cannot spin.
  s = restoreTokens(s, kept, 'A');
  return restoreTokens(s, math, 'M');
}

// Replace the \x01<t>\x02 tokens with what they stand for, repeatedly: a token's
// replacement text may hold another token (see the badge note above). An
// out-of-range index is left as-is rather than dropped — a missing token must not
// be able to delete text.
function restoreTokens(s, list, letter) {
  var re = new RegExp('\\x01' + letter + '(\\d+)\\x02');
  var once = function (text) {
    return text.replace(new RegExp('\\x01' + letter + '(\\d+)\\x02', 'g'), function (m, d) {
      return list[Number(d) - 1] || m;
    });
  };
  for (var pass = 0; pass < 6 && re.test(s); pass += 1) s = once(s);
  return s;
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
  // Where the open item started, so its <li> can carry a span once the item's
  // last line (a wrapped line, a nested list, a second block) is known. The
  // span is closed when the NEXT item opens, which is the only point at which
  // "the end of this item" is known at all.
  var itemLine = 0;
  var itemIndex = -1;
  var closeItem = function (endLine) {
    if (!open) return;
    var end = endLine || itemLine;
    if (end > itemLine && itemIndex >= 0 && typeof html[itemIndex] === 'string') {
      // The opener was pushed with data-line only (the end was unknown then), so
      // the full span replaces it: strip ALL THREE anchor attributes — the range
      // pair and the label — and splice in the pair. Stripping only the range
      // would leave the element with a stale label beside the new one, and the
      // browser reads the FIRST of two data-lineno attributes: the reader's gutter
      // would draw "6" for an item that spans 6-7.
      var span = mdAnchor(opts, itemLine, end);
      html[itemIndex] = html[itemIndex].replace(/ data-(?:line|line-end|lineno)="[^"]*"/g, '').replace('>', span + '>');
    }
    html.push('</li>');
    open = false;
  };
  var item = function (body, lineNo) {
    itemLine = lineNo;
    var task = /^\[([ xX])\][ \t]?([\s\S]*)$/.exec(body);
    // The mdEscape here used to be called WITHOUT opts, so a task item holding
    // an image kept a document-relative src that never got rebased onto the
    // media route (the plain item below always passed them).
    itemIndex = html.length;
    if (task) {
      html.push('<li class="task-list-item"' + mdAnchor(opts, lineNo) + '><input type="checkbox" disabled' + (task[1] === ' ' ? '' : ' checked') + '> ' + mdInline(mdEscape(task[2], opts), opts));
    } else {
      html.push('<li' + mdAnchor(opts, lineNo) + '>' + mdInline(mdEscape(body, opts), opts));
    }
    open = true;
  };
  // An indented line that is not a marker: a wrapped line of the open item, or
  // a second block in it after a blank line. Both are item text — this renderer
  // has no indented-code rule, so that is the least surprising reading.
  var continuation = function (line) {
    html.push(' ' + mdInline(mdEscape(line.replace(/^[ \t]+/, ''), opts), opts));
  };
  while (i < lines.length) {
    var mark = mdListMarker(lines[i]);
    if (mark && mark.indent === base) {
      if ((mark.ordered ? 'ol' : 'ul') !== tag) break;
      if (open) closeItem(i);
      item(mark.body, i + 1);
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
  if (open) closeItem(i);
  html.push('</' + tag + '>');
  // The list element carries the whole list's span; each li carries its own, so
  // selecting one item resolves to that item and not to the list.
  var listSpan = mdAnchor(opts, start + 1, i);
  if (listSpan) html[0] = html[0].slice(0, -1) + listSpan + '>';
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
    // Carried through to every media URL this render produces (see mdMedia).
    sessionId: opts.sessionId || '',
    // The chosen document skin (see src/shared/skins.js): the class the Markdown
    // root carries, so a skin is pure CSS and costs the renderer nothing.
    skin: opts.skin || '',
    // Source-line anchors are OPT-IN. The reader surfaces ask for them (the
    // panel, the shell's document tab, the popout page) because they are what
    // turns "the paragraph I selected" into "lines 12-14 of this file"; every
    // other caller keeps the plain shapes it has always produced, so nothing
    // about the rendered document moves for a caller that did not ask.
    lineAnchors: opts.lineAnchors === true,
    // Added to every anchored line number. Nested renders (a blockquote inside a
    // details, an item inside a list) are handed a slice of the source, so their
    // own line 1 is not the document's line 1.
    lineOffset: opts.lineOffset || 0,
  };
  var lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    var fenceOpen = /^\s*(\x60{3,}|~{3,})([\w+-]*)/.exec(line);
    if (fenceOpen) {
      var fenceStart = i + 1;
      var fenceCh = fenceOpen[1].charAt(0);
      var langHint = fenceOpen[2];
      // Only the fence character that opened the block closes it: a tilde
      // fence inside a backtick block is content, and vice versa.
      var fenceClose = fenceCh === '~' ? /^\s*~{3,}/ : /^\s*\x60{3,}/;
      var buf = [];
      i += 1;
      while (i < lines.length && !fenceClose.test(lines[i])) { buf.push(lines[i]); i += 1; }
      var fenceEnd = (i < lines.length ? i : i - 1) + 1;
      i += 1;
      var codeText = buf.join('\n');
      // The whole fence is one anchored block. Its lines are NOT anchored
      // individually: the highlighted HTML is produced by highlightCode, whose
      // multi-line tokens would be cut in half by a per-line wrapper, and a
      // document that copies badly is worse than one that quotes a few lines too
      // many. Selecting inside a fence resolves to the fence.
      var fenceAnchor = mdAnchor(mdOpts, fenceStart, fenceEnd);
      if (langHint === 'mermaid') {
        // Keep the diagram source verbatim inside a .mermaid container; the
        // renderer replaces it with Mermaid's SVG. tex2jax_ignore keeps the
        // MathJax pass from reading '$'-looking text inside diagram labels.
        out.push('<div class="mermaid tex2jax_ignore"' + fenceAnchor + '>' + htmlEscape(codeText) + '</div>');
      } else if (langHint === 'jsxgraph') {
        // Keep the JSXGraph script verbatim inside a .jsxgraph container; the
        // renderer later runs it (with the generated board id in scope) to
        // build an interactive board. Same MathJax ignore rationale.
        out.push('<div class="jsxgraph tex2jax_ignore"' + fenceAnchor + '>' + htmlEscape(codeText) + '</div>');
      } else {
        out.push('<pre' + fenceAnchor + '><code>' + highlightCode(codeText, langHint) + '</code></pre>');
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
      var mathStart = i + 1;
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
      out.push('<div class="math-display"' + mdAnchor(mdOpts, mathStart, i) + '>' + mdEscape('$$' + mathBody + '$$', mdOpts) + '</div>');
      continue;
    }
    // Standalone SVG block: gather until the closing tag, then emit sanitized.
    if (/^\s*<svg/i.test(line)) {
      var svgStart = i + 1;
      var svgBuf = [line];
      var closed = /<\/svg>/i.test(line);
      while (!closed && i + 1 < lines.length) {
        i += 1;
        svgBuf.push(lines[i]);
        closed = /<\/svg>/i.test(lines[i]);
      }
      var svgEnd = i + 1;
      // The sanitized SVG is emitted as-is; the anchor rides on a wrapper so the
      // svg element itself is untouched (a bare <svg> with an extra attribute
      // would be a second thing to sanitize).
      out.push(mdOpts.lineAnchors
        ? '<div class="artifacts-md-svgblock"' + mdAnchor(mdOpts, svgStart, svgEnd) + '>' + sanitizeSvg(svgBuf.join('\n')) + '</div>'
        : sanitizeSvg(svgBuf.join('\n')));
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
        var bhStart = i + 1;
        var bh = gatherBlockHtml(line, i, lines, bhTag);
        out.push(renderBlockHtml(bh.block, bhTag, mdOpts, bhStart, bh.next));
        i = bh.next;
        continue;
      }
    }
    // GFM table: header row + delimiter row (+ optional body rows).
    if (isTableRow(line) && i + 1 < lines.length && isDelimRow(lines[i + 1])) {
      var tblStart = i + 1;
      var headCells = tableCells(line);
      var delimCells = tableCells(lines[i + 1]);
      var aligns = [];
      for (var a = 0; a < headCells.length; a += 1) aligns.push(cellAlign(delimCells[a] || ''));
      var tbl = ['<table>'];
      tbl.push('<thead><tr' + mdAnchor(mdOpts, tblStart) + '>');
      for (var h = 0; h < headCells.length; h += 1) tbl.push(mdCell(headCells[h], 'th', aligns[h], mdOpts, tblStart));
      tbl.push('</tr></thead>');
      i += 2;
      var openedBody = false;
      while (i < lines.length && isTableRow(lines[i]) && !isDelimRow(lines[i])) {
        var cells = tableCells(lines[i]);
        if (!openedBody) { tbl.push('<tbody>'); openedBody = true; }
        tbl.push('<tr' + mdAnchor(mdOpts, i + 1) + '>');
        for (var c = 0; c < headCells.length; c += 1) tbl.push(mdCell(cells[c] == null ? '' : cells[c], 'td', aligns[c], mdOpts, i + 1));
        tbl.push('</tr>');
        i += 1;
      }
      if (openedBody) tbl.push('</tbody>');
      tbl.push('</table>');
      // The table element carries the whole span; its rows carry their own line,
      // so a selected ROW resolves to that row rather than to the whole table.
      // The opener is rewritten here rather than spliced into the finished HTML:
      // the end line is only known once the body rows have been read.
      var tableSpan = mdAnchor(mdOpts, tblStart, i);
      if (tableSpan) tbl[0] = '<table' + tableSpan + '>';
      out.push(tbl.join(''));
      continue;
    }
    var hd = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hd) {
      var lv = hd[1].length;
      out.push('<h' + lv + mdAnchor(mdOpts, i + 1) + '>' + mdInline(mdEscape(hd[2], mdOpts), mdOpts) + '</h' + lv + '>');
      i += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr' + mdAnchor(mdOpts, i + 1) + '>'); i += 1; continue; }
    if (/^\s*>\s?/.test(line)) {
      var qStart = i + 1;
      var q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      var qEnd = i;
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
      // Each stripped line is the next source line, so the inner render is offset
      // by one less than the quote's first line.
      var quoted = mdToHtml(q.join('\n'), Object.assign({}, mdOpts, { lineOffset: (mdOpts.lineOffset || 0) + qStart - 1 }));
      var oneParagraph = quoted.slice(0, 3) === '<p>' && quoted.slice(-4) === '</p>' &&
        quoted.indexOf('</p>') === quoted.length - 4;
      var quoteInner = oneParagraph ? quoted.slice(quoted.indexOf('>') + 1, -4) : quoted;
      out.push('<blockquote' + mdAnchor(mdOpts, qStart, qEnd) + '>' + quoteInner + '</blockquote>');
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
      out.push('<h1' + mdAnchor(mdOpts, i + 1, i + 2) + '>' + mdInline(mdEscape(line.trim(), mdOpts), mdOpts) + '</h1>');
      i += 2;
      continue;
    }
    if (line.trim() === '') { i += 1; continue; }
    out.push('<p' + mdAnchor(mdOpts, i + 1) + '>' + mdInline(mdEscape(line, mdOpts), mdOpts) + '</p>');
    i += 1;
  }
  return out.join('\n');
}

// ── Source-line anchors ─────────────────────────────────────────────────────
// The block pass stamps every element a reader can see with the 1-based SOURCE
// line it came from, and with the last line it covers when that is more than
// one. That attribute is the whole mechanism: a selection inside the rendered
// document can be walked up to the nearest anchored element, and the reader gets
// "lines 12-14 of this file" — precise enough to quote into a request, or to
// send an editor straight to it — without the renderer having to keep a second,
// parallel map of the document.
//
// It is opt-in (mdToHtml's lineAnchors) because these attributes are decoration:
// a caller that asked for none must keep the exact markup it always produced.
function mdAnchor(opts, start, end) {
  if (!opts || opts.lineAnchors !== true) return '';
  var base = opts.lineOffset || 0;
  var from = base + start;
  var to = base + (end == null ? start : end);
  if (!(from > 0)) return '';
  // data-lineno is the LABEL a reader displays, decided here beside the range it
  // describes so that "12" and "12–18" can never disagree with the data-line pair
  // the selection bar quotes (see .artifacts-markdown.is-lines in styles.js).
  var label = to > from ? from + '\u2013' + to : String(from);
  return ' data-line="' + from + '"' + (to > from ? ' data-line-end="' + to + '"' : '') +
    ' data-lineno="' + label + '"';
}

// Same anchor, spliced into an already-built opening tag: <p ...> becomes <p ... ...>.
function mdTag(opts, tagHtml, start, end) {
  var a = mdAnchor(opts, start, end);
  return a && tagHtml.charAt(tagHtml.length - 1) === '>' ? tagHtml.slice(0, -1) + a + '>' : tagHtml;
}

// The source lines one rendered node stands for: the node itself when it is an
// anchored element, otherwise its nearest anchored ancestor. Null when there is
// no anchor above it (inline-only content, or a document rendered without them).
function mdLinesOfNode(node) {
  var el = node;
  try {
    if (el && el.nodeType === 3) el = el.parentElement;
    if (el && typeof el.closest === 'function') el = el.closest('[data-line]');
    else { while (el && !(el.getAttribute && el.getAttribute('data-line'))) el = el.parentNode; }
  } catch (e) { return null; }
  if (!el || typeof el.getAttribute !== 'function') return null;
  var start = parseInt(el.getAttribute('data-line'), 10);
  if (!(start > 0)) return null;
  var endAttr = parseInt(el.getAttribute('data-line-end'), 10);
  return { start: start, end: endAttr > start ? endAttr : start };
}

// The range a live selection covers. Both ends are resolved and then ordered, so
// a selection dragged upwards reads the same as one dragged down. Null when
// either end is unanchored, or when the selection is not inside root — a
// selection in the file tree must not be read as a line range of the document.
function mdSelectionLines(root, sel) {
  if (!sel) return null;
  var a = mdLinesOfNode(sel.anchorNode);
  var b = mdLinesOfNode(sel.focusNode || sel.anchorNode);
  if (!a || !b) return null;
  if (root && typeof root.contains === 'function') {
    var node = sel.anchorNode && sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    if (node && !root.contains(node)) return null;
  }
  return a.start <= b.end ? { start: a.start, end: b.end } : { start: b.start, end: a.end };
}

// Lines [start, end] (1-based, inclusive) of a source text. Out-of-range values
// are clamped rather than refused: a document that changed under the reader must
// still produce a quote of what is there now.
function mdSourceLines(text, start, end) {
  var all = String(text == null ? '' : text).replace(/\r\n/g, '\n').split('\n');
  var from = Math.max(1, parseInt(start, 10) || 1);
  var to = Math.max(from, parseInt(end, 10) || from);
  if (from > all.length) return '';
  return all.slice(from - 1, Math.min(to, all.length)).join('\n');
}

// The info string of a fenced quote, from the file's own extension: a quote the
// model reads should say what language it is, and guessing from the content is
// how a shell transcript ends up highlighted as Python.
function mdQuoteLang(path) {
  var m = /\.([A-Za-z0-9]+)$/.exec(String(path || ''));
  if (!m) return '';
  var ext = m[1].toLowerCase();
  var map = {
    md: 'md', markdown: 'md', js: 'js', mjs: 'js', cjs: 'js', ts: 'ts', tsx: 'tsx', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c',
    cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', ps1: 'powershell',
    json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', sql: 'sql', txt: '',
  };
  return Object.prototype.hasOwnProperty.call(map, ext) ? map[ext] : ext;
}

// The payload a reader gets for one selected range: a locator the agent can act
// on (path:12-14) followed by exactly those source lines in a fence.
//
// The line numbers stay OUT of the fence on purpose. A model handed
// "12 | const a = 1" will happily write the numbers back into the file, and a
// patch that corrupts the document is a worse failure than a quote that carries
// one less hint. The locator above the fence is the only place they appear, and
// it names the same range the fence holds.
function mdLineQuote(path, start, end, text) {
  var p = String(path || '').replace(/\\/g, '/');
  var from = parseInt(start, 10) || 1;
  var to = Math.max(from, parseInt(end, 10) || from);
  var body = mdSourceLines(text, from, to);
  // A quote that contains its own closing fence would end early; the longer
  // fence is the standard answer and needs no escaping.
  var fence = /(^|\n)\s*\x60{3}/.test(body) ? '~~~~' : '\x60\x60\x60';
  var lang = mdQuoteLang(p);
  return '@' + p + ':' + from + (to > from ? '-' + to : '') + '\n' +
    fence + lang + '\n' + body + '\n' + fence + '\n';
}

// ── The selection bar ───────────────────────────────────────────────────────
// One floating bar, positioned over the current selection of a RENDERED
// document: it names the source range and offers the two things a reader wants
// from it — quote those lines, or open them where they can be edited.
//
// Plain DOM and no framework, because the panel (React) and the popout page
// (plain DOM) both need it; it is appended to <body> rather than into the
// document, because the panel is a CSS containing block (container-type:
// inline-size) and a fixed child of it would be positioned against the panel
// instead of the viewport — the trap that once put the file tree's context menu
// off screen entirely.
//
// opts:
//   root     — the rendered container a selection must be inside
//   path     — the document's path (the locator's left half)
//   text     — the document's SOURCE (the quote is taken from here, not from
//              the selection, so the reply names exactly the lines it shows)
//   onQuote  — (payload, range) → void
//   onLocate — optional (start, end) → void; when absent the 定位 button is not
//              drawn at all (a button that cannot do anything is worse than none)
function attachMarkdownSelectionBar(opts) {
  opts = opts || {};
  var root = opts.root;
  var doc = (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc || !root || typeof doc.createElement !== 'function') return function () {};

  var bar = doc.createElement('div');
  bar.className = 'artifacts-mdselbar';
  bar.setAttribute('role', 'toolbar');
  var label = doc.createElement('span');
  label.className = 'artifacts-mdselbar-label';
  bar.appendChild(label);
  var quoteBtn = doc.createElement('button');
  quoteBtn.type = 'button';
  quoteBtn.className = 'artifacts-mdselbar-btn';
  quoteBtn.textContent = '引用';
  quoteBtn.title = '把这部分（含文件路径与行号）放进输入框';
  bar.appendChild(quoteBtn);
  var locateBtn = null;
  if (typeof opts.onLocate === 'function') {
    locateBtn = doc.createElement('button');
    locateBtn.type = 'button';
    locateBtn.className = 'artifacts-mdselbar-btn';
    locateBtn.textContent = '定位';
    locateBtn.title = '在编辑器里打开并选中这几行';
    bar.appendChild(locateBtn);
  }
  bar.style.display = 'none';
  if (doc.body && doc.body.appendChild) doc.body.appendChild(bar);

  var current = null;
  var raf = null;
  var hide = function () {
    current = null;
    bar.style.display = 'none';
  };
  var show = function (range, rect) {
    current = range;
    label.textContent = range.start === range.end ? '第 ' + range.start + ' 行' : '第 ' + range.start + '–' + range.end + ' 行';
    bar.style.display = 'flex';
    // Measured after it is visible: a hidden element has no box to center on.
    var w = bar.offsetWidth || 180;
    var h = bar.offsetHeight || 28;
    var viewportW = (doc.documentElement && doc.documentElement.clientWidth) || 1024;
    var left = Math.max(8, Math.min((rect.left + rect.width / 2) - w / 2, viewportW - w - 8));
    var top = rect.top - h - 6;
    // A selection at the very top of the viewport gets the bar below it instead
    // of under the toolbar, where it would be unreachable.
    if (top < 8) top = Math.min(rect.bottom + 6, ((doc.documentElement && doc.documentElement.clientHeight) || 768) - h - 8);
    bar.style.left = Math.round(left) + 'px';
    bar.style.top = Math.round(top) + 'px';
  };
  var update = function () {
    raf = null;
    var sel = typeof doc.getSelection === 'function' ? doc.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { hide(); return; }
    var range = mdSelectionLines(root, sel);
    if (!range) { hide(); return; }
    var rect = null;
    try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch (e) { rect = null; }
    if (!rect || (!rect.width && !rect.height)) { hide(); return; }
    show(range, rect);
  };
  var schedule = function () {
    if (raf !== null) return;
    // Deferred by a frame: selectionchange fires while the browser is still
    // moving the selection, and reading a rect mid-gesture is how a bar lands
    // one selection behind the pointer.
    raf = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(update)
      : setTimeout(update, 16);
  };
  var onKey = function (e) { if (e && (e.key === 'Escape' || e.key === 'Esc')) hide(); };
  var onQuote = function () {
    if (!current) return;
    var payload = mdLineQuote(opts.path, current.start, current.end, opts.text);
    var range = current;
    hide();
    try { opts.onQuote(payload, range); } catch (e) {}
  };
  var onLocateClick = function () {
    if (!current) return;
    var range = current;
    hide();
    try { opts.onLocate(range.start, range.end); } catch (e) {}
  };

  doc.addEventListener('selectionchange', schedule);
  doc.addEventListener('mouseup', schedule);
  doc.addEventListener('keyup', schedule);
  doc.addEventListener('keydown', onKey);
  // Capture, so a scroll inside the document pane counts: a fixed bar left over
  // a scrolled-away paragraph is worse than no bar.
  (doc.defaultView || (typeof window !== 'undefined' ? window : null) || doc).addEventListener('scroll', hide, true);
  quoteBtn.addEventListener('click', onQuote);
  if (locateBtn) locateBtn.addEventListener('click', onLocateClick);

  return function dispose() {
    doc.removeEventListener('selectionchange', schedule);
    doc.removeEventListener('mouseup', schedule);
    doc.removeEventListener('keyup', schedule);
    doc.removeEventListener('keydown', onKey);
    (doc.defaultView || (typeof window !== 'undefined' ? window : null) || doc).removeEventListener('scroll', hide, true);
    if (bar.parentNode) bar.parentNode.removeChild(bar);
    current = null;
  };
}
