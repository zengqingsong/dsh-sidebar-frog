// ── Workspace path comparison (工作区路径) ───────────────────────────────────
//
// Both file trees — the sidebar's React explorer and the standalone popout page
// — cache levels and remember expansion against *absolute path strings* handed
// out by the host, and compare those strings to decide what lives under what.
// Getting the comparison wrong is silent: the tree still paints and a clicked
// folder still opens, but the remembered expansion, the "reveal the previewed
// file" walk and the relative-path labels quietly stop working.
//
// The host spellings the same directory two ways, which is what broke it:
//   • a level's OWN path used to be echoed straight back from the request (so
//     whatever the caller typed — a session cwd with forward slashes, a drive
//     letter in lower case), while
//   • every ENTRY path is a realpath (native separators, canonical case).
// On Windows that is "D:/ws" against "D:\ws\src": not a prefix of one another as
// plain strings, so every containment test failed and the tree forgot where it
// was. The host now answers with the resolved spelling of the level it listed
// (see listDir in src/host/core.js), and these helpers keep the comparison
// honest for the spellings that can still differ.
//
// Comparisons are separator-insensitive and — for Windows-shaped paths only,
// where case genuinely is not significant — case-insensitive. Slicing always
// happens on the ORIGINAL string, so callers keep the host's own spelling.
//
// NOTE: no backticks and no dollar-brace anywhere in this file — it is inlined
// into the popout's single String.raw literal (scripts/check.js enforces that).

// "D:\x", "D:/x", "\\server\share" — spellings whose case is not significant.
const PATH_WINDOWS = /^(?:[A-Za-z]:[\\/]|\\\\)/

const pathIsWindows = (value) => PATH_WINDOWS.test(String(value == null ? '' : value))

// The comparison form of a path: never returned to a caller, never sliced — it
// exists only to be compared. Both spellings that have to match ("D:/ws" from a
// session cwd, "D:\ws\src" from a realpath) differ in separator as well as in
// case, so both are folded here. Case only matters on Windows-shaped paths,
// where it is genuinely not significant; on POSIX it is a filename difference.
const pathFold = (value) => {
  const text = String(value == null ? '' : value)
  return pathIsWindows(text) ? text.toLowerCase().replace(/[\\/]+/g, '/') : text
}

// Trailing separators are noise — except on a bare drive root, where "D:\" and
// "D:" are not the same place.
const pathTrim = (value) => {
  const text = String(value == null ? '' : value)
  if (text.length <= 1) return text
  if (/^[A-Za-z]:[\\/]$/.test(text)) return text
  return text.replace(/[\\/]+$/, '')
}

// Is "candidate" the same place as, or somewhere inside, "prefix"?
const pathUnder = (candidate, prefix) => {
  const base = pathTrim(prefix)
  if (!base) return false
  const c = pathFold(pathTrim(candidate))
  const p = pathFold(base)
  if (c === p) return true
  return c.indexOf(p + '/') === 0 || c.indexOf(p + '\\') === 0
}

// The part of "full" below "root" ("" when they are the same place). Falls back
// to the whole path when it is not inside the root, which is what a label wants.
const pathRelativeTo = (full, root) => {
  const base = pathTrim(root)
  const text = String(full == null ? '' : full)
  if (!base || !pathUnder(text, base)) return text
  if (pathFold(pathTrim(text)) === pathFold(base)) return ''
  return text.slice(base.length + 1)
}

// Every intermediate directory between "root" and "full", outermost first,
// spelled with the separators "full" actually uses. This is the walk that
// expands a previewed file's ancestors; a top-level entry yields none.
const pathAncestorsOf = (full, root) => {
  const base = pathTrim(root)
  const text = String(full == null ? '' : full)
  if (!base || !pathUnder(text, base)) return []
  const parts = text.slice(base.length).split(/[\\/]+/).filter(Boolean)
  const dirs = []
  let acc = text.slice(0, base.length)
  for (let i = 0; i < parts.length - 1; i += 1) {
    acc = acc + (text.charAt(acc.length) || '/') + parts[i]
    dirs.push(acc)
  }
  return dirs
}
