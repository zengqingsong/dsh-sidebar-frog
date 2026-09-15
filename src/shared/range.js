// HTTP byte-range parsing for the host's /media route.
//
// Portable JS (var/function, no template literals) so both bundles can splice
// it, and so scripts/check.js can drive it directly: a range parser is pure
// arithmetic over a header string, and every way it can be wrong (an off-by-one
// on the last byte, a suffix range, a range past EOF) produces a player that
// either stutters or refuses to seek — with no error anywhere.
//
// Return value:
//   null       — no usable Range header: serve the whole file with 200.
//   'invalid'  — syntactically a range, but unsatisfiable: answer 416.
//   { start, end, length } — inclusive byte window: answer 206.
//
// A multipart range (bytes=0-1,5-9) returns null on purpose: answering it
// correctly needs a multipart/byteranges body, and every client that matters
// (a browser's <video>, pdf.js) falls back to a plain request. Answering 200 to
// a request we cannot honour is correct; pretending with the first range is not.
function parseByteRange(header, size) {
  if (typeof header !== 'string') return null;
  var m = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  if (!m) return null;
  var spec = m[1].replace(/\s+$/, '');
  if (spec.indexOf(',') >= 0) return null;
  var parts = /^(\d*)-(\d*)$/.exec(spec);
  if (!parts) return 'invalid';
  var rawStart = parts[1];
  var rawEnd = parts[2];
  if (rawStart === '' && rawEnd === '') return 'invalid';
  var total = Number(size);
  if (!isFinite(total) || total <= 0) return 'invalid';
  var start;
  var end;
  if (rawStart === '') {
    // Suffix form: the LAST n bytes. A player probes the tail of a container
    // (moov atom / cue index) with exactly this request.
    var n = parseInt(rawEnd, 10);
    if (!isFinite(n) || n <= 0) return 'invalid';
    start = Math.max(0, total - n);
    end = total - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd === '' ? total - 1 : parseInt(rawEnd, 10);
  }
  if (!isFinite(start) || !isFinite(end)) return 'invalid';
  if (start > end) return 'invalid';
  // A start at or past the last byte cannot be satisfied: 416, with the total so
  // the client can recover.
  if (start >= total) return 'invalid';
  if (end > total - 1) end = total - 1; // an end past EOF is clamped, not rejected
  return { start: start, end: end, length: end - start + 1 };
}

// The value of a Content-Range header for a satisfied range.
function formatContentRange(start, end, size) {
  return 'bytes ' + start + '-' + end + '/' + size;
}

// The value of a Content-Range header for a 416 (unsatisfied) answer.
function formatUnsatisfiedRange(size) {
  return 'bytes */' + size;
}
