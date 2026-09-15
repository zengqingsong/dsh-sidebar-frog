// Shared extension → preview-type helpers (portable JS: var/function, no
// template literals, so this file can be inlined verbatim into the host Node
// scope, the client bundle, and the standalone page's String.raw inline script).
var EXT_IMAGE = { png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1 };
var EXT_PDF = { pdf: 1 };
var EXT_MARKDOWN = { md: 1, markdown: 1, mdx: 1, mdown: 1 };
var EXT_HTML = { html: 1, htm: 1, xhtml: 1 };
// Explorer icon categories (see fileIconKind) — the colour of the icon is the
// type signal, the way an IDE's file icons work.
var EXT_MARKUP = { xml: 1, vue: 1, svelte: 1, astro: 1, hbs: 1, ejs: 1, pug: 1, razor: 1 };
var EXT_STYLE = { css: 1, scss: 1, sass: 1, less: 1, styl: 1, pcss: 1 };
var EXT_DATA = { json: 1, jsonc: 1, json5: 1, yaml: 1, yml: 1, toml: 1, ini: 1, cfg: 1, conf: 1, env: 1, csv: 1, tsv: 1, lock: 1, properties: 1 };
var EXT_SHELL = { sh: 1, bash: 1, zsh: 1, fish: 1, ps1: 1, psm1: 1, bat: 1, cmd: 1 };
var EXT_DOC = { doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, odt: 1, ods: 1, rtf: 1, epub: 1 };
// The subset of EXT_DOC this plugin can actually READ offline (see
// src/shared/office.js and the vendored docx-preview / SheetJS / pptx-renderer).
// Split out deliberately: "document" means "a binary container nobody here can
// draw" — it earns the card that says so plus the hand-off to an installed shell
// renderer — while "office" means "we draw this ourselves". The rest of EXT_DOC
// (.doc/.odt/.rtf/.epub) stays a card, because claiming a suffix without a
// reader turns an honest refusal into a broken renderer.
var EXT_OFFICE = { docx: 1, xlsx: 1, pptx: 1 };
var EXT_CODE = {
  js: 1, mjs: 1, cjs: 1, jsx: 1, ts: 1, tsx: 1, mts: 1, cts: 1, py: 1, pyi: 1, rb: 1, go: 1, rs: 1,
  java: 1, kt: 1, kts: 1, c: 1, h: 1, cc: 1, cpp: 1, cxx: 1, hpp: 1, cs: 1, php: 1, swift: 1, m: 1,
  mm: 1, scala: 1, lua: 1, dart: 1, sql: 1, r: 1, jl: 1, ex: 1, exs: 1, erl: 1, hs: 1, clj: 1, groovy: 1,
};
var EXT_TEXT = { txt: 1, text: 1, log: 1, out: 1, list: 1, gitignore: 1, editorconfig: 1 };
// Delimited text this plugin parses into a real table (src/shared/table.js).
// The psv suffix is the pipe-separated convention the delimiter sniffer detects.
var EXT_TABLE = { csv: 1, tsv: 1, psv: 1 };
// Playable by the browser's own element, streamed from the host's /media route.
// The extension only decides WHICH element to use; whether the codec actually
// plays is the engine's call, and the view says so when it refuses.
var EXT_AUDIO = { mp3: 1, wav: 1, ogg: 1, oga: 1, m4a: 1, aac: 1, flac: 1, opus: 1, weba: 1 };
var EXT_VIDEO = { mp4: 1, m4v: 1, webm: 1, mov: 1, mkv: 1, ogv: 1 };

function extType(path) {
  var ext = fileExt(path);
  // svg lands in the image band on purpose: an <img> never runs the scripts a
  // standalone SVG may carry, so this is the safe way to show one, and it is
  // also the reason there is no separate SVG renderer.
  if (EXT_IMAGE[ext]) return 'image';
  if (EXT_PDF[ext]) return 'pdf';
  if (EXT_MARKDOWN[ext]) return 'markdown';
  if (EXT_HTML[ext]) return 'html';
  if (EXT_TABLE[ext]) return 'table';
  if (EXT_AUDIO[ext]) return 'audio';
  if (EXT_VIDEO[ext]) return 'video';
  // An Office document this plugin reads itself, offline, with a vendored
  // parser. Checked BEFORE the binary container below: .docx is in both maps,
  // and this one is the more specific answer.
  if (EXT_OFFICE[ext]) return 'office';
  // A binary container (doc / odt / rtf / epub …). Naming it is what keeps it
  // away from the text path: decoding one of these as UTF-8 is exactly
  // the screen of mojibake this type exists to prevent.
  if (EXT_DOC[ext]) return 'document';
  return 'text';
}

function fileExt(path) {
  var m = /\.([^.]+)$/.exec(String(path || ''));
  return m ? m[1].toLowerCase() : '';
}

// Explorer icon category for a path. Shared by the sidebar tree and the
// standalone page so both tint a file the same way.
function fileIconKind(path) {
  var p = String(path || '');
  var ext = fileExt(p);
  if (EXT_IMAGE[ext]) return 'image';
  if (EXT_PDF[ext]) return 'pdf';
  if (EXT_MARKDOWN[ext]) return 'markdown';
  if (EXT_HTML[ext]) return 'markup';
  if (EXT_MARKUP[ext]) return 'markup';
  if (EXT_STYLE[ext]) return 'style';
  if (EXT_DATA[ext]) return 'data';
  if (EXT_AUDIO[ext] || EXT_VIDEO[ext]) return 'media';
  if (EXT_SHELL[ext]) return 'shell';
  if (EXT_DOC[ext]) return 'doc';
  if (EXT_CODE[ext]) return 'code';
  if (EXT_TEXT[ext]) return 'text';
  // Well-known extension-less files.
  var base = p.replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (base === 'makefile' || base === 'dockerfile' || base === 'procfile' || base.indexOf('.env') === 0) return 'shell';
  if (base === 'license' || base === 'notice' || base === 'authors') return 'text';
  return 'text';
}
