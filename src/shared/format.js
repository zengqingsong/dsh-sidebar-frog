// Small formatting helpers shared by both halves of the plugin.
//
// The artifact list is a live ledger, so "when" is half the information — and
// the two halves must say it the same way. Written once here, the sidebar row,
// the popout row and the tooltips can never disagree.
//
// Portable JS (var/function, no template literals, no closing script tag) so
// this file can be inlined verbatim into the host Node scope, the client bundle,
// and the standalone page's String.raw inline script.
function relativeTime(ts, now) {
  var at = Number(ts);
  if (!isFinite(at) || at <= 0) return '';
  var ref = typeof now === 'number' ? now : Date.now();
  var seconds = Math.floor((ref - at) / 1000);
  // A clock skew between the host and the browser must not read as "in 3 hours".
  if (seconds < 0) seconds = 0;
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  return Math.floor(seconds / 86400) + 'd';
}
