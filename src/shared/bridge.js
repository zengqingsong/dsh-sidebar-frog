// Cross-window bridge between the two halves of the plugin.
//
// The in-app sidebar and the popout tab are two documents on the same origin,
// so they share localStorage and can talk through "storage" events (which fire
// in every *other* document of the origin, never in the writer itself). Every
// cross-window key and payload shape lives in this one file, so the two halves
// cannot drift on a key name or a field: a mismatched key would otherwise fail
// silently — no error anywhere, just a feature that never works.
//
// Portable JS (var/function, no template literals, no closing script tag) so
// this file can be inlined verbatim into the host Node scope, the client bundle,
// and the standalone page's String.raw inline script.
var BRIDGE = {
  session: 'dsh-sidebar-frog:session',           // main → popout: active session id
  settings: 'dsh-sidebar-frog:settings',         // shared: feature settings (src/shared/settings.js)
  previewWidth: 'dsh-sidebar-frog:previewWidth', // shared: divider position in px after a drag
  quote: 'dsh-sidebar-frog:quote',               // popout → main: "insert this @path"
  ack: 'dsh-sidebar-frog:quote-ack',             // main → popout: "it landed / it did not"
};

// A quote request is only acted on while it is fresh. localStorage outlives the
// tab that wrote it, so a payload left behind by an earlier popout would
// otherwise pop text into the composer the next time this window loads.
var BRIDGE_QUOTE_TTL_MS = 10000;
// How long the popout waits for an ack before assuming nobody is listening and
// falling back to the clipboard. The main window answers synchronously in its
// storage handler, so this only has to cover a busy main thread.
var BRIDGE_ACK_TIMEOUT_MS = 700;

// Unique per request: writing the *same* string twice fires no storage event,
// so quoting the same file twice in a row would be dropped without a nonce.
function bridgeNonce() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function bridgeParse(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    var data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

function bridgeEncodeQuote(path, nonce, ts) {
  return JSON.stringify({
    v: 1,
    path: String(path == null ? '' : path),
    nonce: String(nonce == null ? '' : nonce),
    ts: Number(ts) || 0,
  });
}

// Returns null (never throws) for anything that is not a well-formed request:
// the receiving window is a running app, so a hand-edited localStorage entry
// must not be able to break it.
function bridgeDecodeQuote(raw) {
  var data = bridgeParse(raw);
  if (!data || data.v !== 1) return null;
  if (typeof data.path !== 'string' || !data.path) return null;
  if (typeof data.nonce !== 'string' || !data.nonce) return null;
  if (typeof data.ts !== 'number' || !isFinite(data.ts)) return null;
  return { path: data.path, nonce: data.nonce, ts: data.ts };
}

function bridgeEncodeAck(nonce, ok) {
  return JSON.stringify({ v: 1, nonce: String(nonce == null ? '' : nonce), ok: !!ok });
}

function bridgeDecodeAck(raw) {
  var data = bridgeParse(raw);
  if (!data || data.v !== 1) return null;
  if (typeof data.nonce !== 'string' || !data.nonce) return null;
  return { nonce: data.nonce, ok: data.ok === true };
}

function bridgeQuoteIsFresh(quote, now, ttl) {
  if (!quote || typeof quote.ts !== 'number') return false;
  var budget = typeof ttl === 'number' ? ttl : BRIDGE_QUOTE_TTL_MS;
  var at = typeof now === 'number' ? now : Date.now();
  return Math.abs(at - quote.ts) <= budget;
}

// The divider position is a plain integer number of pixels; anything else in
// storage (a percentage from an older build, a hand-edited value) is ignored.
function bridgeParseWidth(raw) {
  if (raw == null || raw === '') return null;
  var n = parseInt(raw, 10);
  return isFinite(n) && n > 0 ? n : null;
}
