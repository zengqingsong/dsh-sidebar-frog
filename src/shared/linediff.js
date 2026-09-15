// Line-level diff shared by the sidebar panel and the standalone popout page.
//
// Why a hand-written diff: the ledger already carries the full "before" and
// "after" text of every agent write/edit (the host reads it off the live tool
// result, see src/host/core.js), and both halves of the plugin render it — a
// small, dependency-free LCS keeps that text out of two duplicated renderers
// and keeps the bundles free of a diff library.
//
// Portable JS on purpose (var/function, no template literals): this file is
// inlined verbatim into the host bundle, the client bundle and the popout
// page's inline script by scripts/build.js.
//
// Cost is bounded: the DP table is only built when lines(old) * lines(new)
// stays under DIFF_CELL_MAX; otherwise the diff degrades to "strip the common
// head and tail, replace the middle", which is what a huge rewrite looks like
// anyway and never hangs the page.

var DIFF_CELL_MAX = 400000;
var DIFF_LINE_MAX = 4000;

function splitDiffLines(text) {
  var s = String(text == null ? '' : text);
  if (s === '') return [];
  // The host hands over LF-normalized text (fs write outcomes are LF), so a
  // single split is enough here.
  var lines = s.split('\n');
  // A trailing newline means "ends with a newline", not "one more empty line".
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function diffCommonEdges(a, b) {
  var head = 0;
  var maxHead = Math.min(a.length, b.length);
  while (head < maxHead && a[head] === b[head]) head += 1;
  var tail = 0;
  var maxTail = Math.min(a.length, b.length) - head;
  while (tail < maxTail && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  return { head: head, tail: tail };
}

// Longest common subsequence over lines, returned as index pairs.
function diffLcsPairs(a, b) {
  var n = a.length;
  var m = b.length;
  var width = m + 1;
  var table = new Uint32Array((n + 1) * width);
  for (var i = n - 1; i >= 0; i -= 1) {
    for (var j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + (j + 1)] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }
  var pairs = [];
  var x = 0;
  var y = 0;
  while (x < n && y < m) {
    if (a[x] === b[y]) { pairs.push([x, y]); x += 1; y += 1; continue; }
    if (table[(x + 1) * width + y] >= table[x * width + (y + 1)]) x += 1;
    else y += 1;
  }
  return pairs;
}

function diffRows(a, b, head, tail) {
  var rows = [];
  var i;
  for (i = 0; i < head; i += 1) rows.push({ t: 'ctx', text: a[i], oldNo: i + 1, newNo: i + 1 });
  var midA = a.slice(head, a.length - tail);
  var midB = b.slice(head, b.length - tail);
  var pairs = midA.length * midB.length <= DIFF_CELL_MAX ? diffLcsPairs(midA, midB) : null;
  var ai = 0;
  var bi = 0;
  for (var k = 0; pairs && k < pairs.length; k += 1) {
    var pa = pairs[k][0];
    var pb = pairs[k][1];
    while (ai < pa) { rows.push({ t: 'del', text: midA[ai], oldNo: head + ai + 1, newNo: null }); ai += 1; }
    while (bi < pb) { rows.push({ t: 'add', text: midB[bi], oldNo: null, newNo: head + bi + 1 }); bi += 1; }
    rows.push({ t: 'ctx', text: midA[ai], oldNo: head + ai + 1, newNo: head + bi + 1 });
    ai += 1;
    bi += 1;
  }
  while (ai < midA.length) { rows.push({ t: 'del', text: midA[ai], oldNo: head + ai + 1, newNo: null }); ai += 1; }
  while (bi < midB.length) { rows.push({ t: 'add', text: midB[bi], oldNo: null, newNo: head + bi + 1 }); bi += 1; }
  for (i = 0; i < tail; i += 1) {
    var oldIdx = a.length - tail + i;
    var newIdx = b.length - tail + i;
    rows.push({ t: 'ctx', text: a[oldIdx], oldNo: oldIdx + 1, newNo: newIdx + 1 });
  }
  return rows;
}

// One row per line: { t: 'ctx' | 'add' | 'del', text, oldNo, newNo }.
// The result also carries a truncated flag: true when the inputs were too large
// to diff exactly and the middle was collapsed into a delete-then-add block.
function diffLines(before, after) {
  var a = splitDiffLines(before);
  var b = splitDiffLines(after);
  if (a.length > DIFF_LINE_MAX || b.length > DIFF_LINE_MAX) {
    return { rows: diffRows(a, b, 0, 0), truncated: true };
  }
  var edges = diffCommonEdges(a, b);
  var rows = diffRows(a, b, edges.head, edges.tail);
  return { rows: rows, truncated: a.length * b.length > DIFF_CELL_MAX && rows.length > 0 };
}

// Summary counts for a diff header ("+3 −1").
function diffStats(rows) {
  var add = 0;
  var del = 0;
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].t === 'add') add += 1;
    else if (rows[i].t === 'del') del += 1;
  }
  return { add: add, del: del };
}
