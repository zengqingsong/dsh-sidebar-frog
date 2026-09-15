// Delimited-text (CSV / TSV / semicolon / pipe) parsing for the table view.
//
// Portable JS (var/function, no template literals, no closing script tag): the
// sidebar bundle and the standalone popout page BOTH splice this file in, and
// the page is one String.raw literal — a backtick anywhere in here ends that
// literal early and the page's whole script becomes a syntax error. (This
// paragraph is the rule it describes; the checker enforces it on every file in
// src/shared.)
//
// It is one shared parser on purpose. The panel draws a React table and the
// popout page draws a DOM table, but "what is a cell" must not differ between
// them: a quoted field containing a newline is exactly where two hand-written
// parsers drift apart, and the drift is only visible on somebody's real file.
//
// The grammar is RFC 4180 plus the two things real exports rely on: a UTF-8 BOM
// (Excel writes one) and CRLF / CR line endings.

// Candidate separators, in tie-break order: a file that parses equally well as
// comma- and semicolon-separated is read as comma-separated.
var TABLE_DELIMITERS = [',', '\t', ';', '|'];
// How many records the sniffer looks at. Enough for a header plus a dozen rows,
// cheap on a large file.
var TABLE_SNIFF_RECORDS = 20;

// Split text into records of fields. The delimiter is a single character.
// A quote only opens a quoted field at the START of a field (RFC 4180); a bare
// quote inside an unquoted field is literal text, which is what spreadsheet
// exports actually mean by it.
function tableSplitRecords(text, delimiter) {
  var src = String(text == null ? '' : text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // BOM
  var sep = delimiter || ',';
  var records = [];
  var row = [];
  var field = '';
  var quoted = false;
  var started = false; // a field is in progress, so a leading quote can open one
  var i = 0;
  var n = src.length;
  while (i < n) {
    var ch = src.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') { field += '"'; i += 2; continue; } // escaped quote
        quoted = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"' && field === '' && !started) { quoted = true; started = true; i += 1; continue; }
    if (ch === sep) { row.push(field); field = ''; started = false; i += 1; continue; }
    if (ch === '\r') {
      // CRLF and a lone CR both end the record.
      row.push(field); field = ''; started = false;
      records.push(row); row = [];
      i += src.charAt(i + 1) === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field); field = ''; started = false;
      records.push(row); row = [];
      i += 1;
      continue;
    }
    field += ch; started = true; i += 1;
  }
  // The last record only exists if anything was pending: a trailing newline must
  // not invent an empty row.
  if (field !== '' || row.length || started) { row.push(field); records.push(row); }
  return records;
}

// How consistent is this separator? The fraction of sampled records whose field
// count equals the most common field count. A separator that never yields two
// fields scores 0 and is not a candidate at all.
function tableDelimiterScore(text, delimiter) {
  var records = tableSplitRecords(text, delimiter).slice(0, TABLE_SNIFF_RECORDS);
  if (!records.length) return 0;
  var counts = {};
  var best = 0;
  var bestCount = 0;
  for (var i = 0; i < records.length; i += 1) {
    var c = records[i].length;
    counts[c] = (counts[c] || 0) + 1;
    if (counts[c] > bestCount) { bestCount = counts[c]; best = c; }
  }
  if (best < 2) return 0;
  return bestCount / records.length;
}

function tableSniffDelimiter(text) {
  var bestDelimiter = ',';
  var bestScore = 0;
  for (var i = 0; i < TABLE_DELIMITERS.length; i += 1) {
    var score = tableDelimiterScore(text, TABLE_DELIMITERS[i]);
    // Strictly greater: an earlier candidate keeps the tie (see TABLE_DELIMITERS).
    if (score > bestScore) { bestScore = score; bestDelimiter = TABLE_DELIMITERS[i]; }
  }
  return bestDelimiter;
}

function tableDelimiterLabel(delimiter) {
  if (delimiter === '\t') return '制表符';
  if (delimiter === ';') return '分号';
  if (delimiter === '|') return '竖线';
  return '逗号';
}

// Parse into a grid the views can draw directly: the first record is the header,
// every row is padded to the widest row so the table has no holes.
function tableParse(text, opts) {
  var o = opts || {};
  var source = String(text == null ? '' : text);
  var delimiter = o.delimiter || tableSniffDelimiter(source);
  var records = tableSplitRecords(source, delimiter);
  // Trailing blank line(s) — not data.
  while (records.length && records[records.length - 1].length === 1 && records[records.length - 1][0] === '') records.pop();
  var header = records.length ? records[0].slice() : [];
  var rows = records.slice(1);
  var columns = header.length;
  var i, j;
  for (i = 0; i < rows.length; i += 1) if (rows[i].length > columns) columns = rows[i].length;
  for (i = header.length; i < columns; i += 1) header.push('');
  for (i = 0; i < rows.length; i += 1) {
    var row = rows[i];
    if (row.length < columns) { row = row.slice(); for (j = row.length; j < columns; j += 1) row.push(''); rows[i] = row; }
  }
  return {
    delimiter: delimiter,
    header: header,
    rows: rows,
    columns: columns,
    total: rows.length,
  };
}

// A cell that is *plainly* numeric sorts as a number; anything else sorts as
// text. Deliberately strict: "1,234" (thousands separator), "12%", "2026-01-02"
// and "v1.2" all stay text, because guessing at those is how a sort becomes
// wrong in a way nobody can see.
function tableCellNumber(value) {
  var s = String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  if (!s) return null;
  if (!/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return null;
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Numeric-aware ascending comparison; numbers come before text so a column that
// is mostly numbers keeps its numbers together at one end.
function tableCompare(a, b) {
  var na = tableCellNumber(a);
  var nb = tableCellNumber(b);
  if (na != null && nb != null) return na < nb ? -1 : (na > nb ? 1 : 0);
  if (na != null) return -1;
  if (nb != null) return 1;
  var sa = String(a == null ? '' : a);
  var sb = String(b == null ? '' : b);
  return sa < sb ? -1 : (sa > sb ? 1 : 0);
}

// Sort a copy of the rows by one column. Two deliberate rules: blank cells stay
// at the BOTTOM in both directions (flipping them to the top is the classic
// spreadsheet annoyance), and equal cells keep the file's own order.
function tableSortRows(rows, column, direction) {
  var decorated = [];
  for (var i = 0; i < rows.length; i += 1) decorated.push({ row: rows[i], at: i });
  var sign = direction === 'desc' ? -1 : 1;
  decorated.sort(function (x, y) {
    var a = x.row[column];
    var b = y.row[column];
    var ea = a == null || a === '';
    var eb = b == null || b === '';
    if (ea || eb) {
      if (ea && eb) return x.at - y.at;
      return ea ? 1 : -1;
    }
    var c = tableCompare(a, b);
    return c !== 0 ? c * sign : x.at - y.at;
  });
  var out = [];
  for (var k = 0; k < decorated.length; k += 1) out.push(decorated[k].row);
  return out;
}

// Cell text for display: trimmed, then cut to a maximum number of characters.
// The full value stays available as the cell's title, so nothing is lost — only
// hidden.
function tableFormatCell(value, max) {
  var s = String(value == null ? '' : value);
  var limit = typeof max === 'number' && max > 0 ? max : 2000;
  if (s.length <= limit) return s;
  return s.slice(0, limit - 1) + '…';
}
