// ── Git 只读切片：解析与判定（两侧共用） ─────────────────────────────────────
//
// This plugin shows a READ-ONLY slice of the workspace's git state: the branch,
// ahead/behind, the changed and untracked files, and one file's difference
// against HEAD. It never stages, commits, discards or checks anything out —
// that is a deliberate boundary, not an unfinished feature: writing to a
// repository is the one operation here that can destroy a user's work with no
// undo, and the panel's own 撤销 (revert) already covers "put one file back".
//
// The parsing lives in this shared module, not in the host route, for the same
// reason the CSV parser does: the host decides what an ENTRY is and the client
// decides how to GROUP it, and if those two disagreed a file could be listed
// under 已暂存 while the count said otherwise. scripts/check.js drives these
// functions directly, with text captured from real 「git status --porcelain=v1
// -z」 output.
//
// ── Why porcelain v1 with -z ────────────────────────────────────────────────
//   · 「--porcelain」 is the STABLE machine format — its columns are documented
//     never to change, unlike the human format, which is localized and
//     column-aligned for terminals;
//   · 「-z」 terminates records with NUL instead of newline, which is the only
//     form that survives a path containing a newline or a quote. Without it git
//     C-quotes such paths ("a\nb" as 「"a\nb"」) and we would have to unquote;
//   · with 「-z」 paths are literal, so the bytes after the two status columns
//     are the file name exactly as it exists on disk.
//
// ── The record shape ───────────────────────────────────────────────────────
// Each record is 「XY <path>」: X is the INDEX (staged) column, Y is the WORKTREE
// column, and one space separates them. A path may contain spaces, so only the
// first three characters are structural.
//
// A rename or copy (「R」/「C」) is the one record that is not self-contained: the
// ORIGINAL path travels as the NEXT NUL-separated record, and consuming it as
// an entry of its own is the classic bug here — it shows a phantom file and
// steals the next entry's slot.
//
// NOTE: no backticks and no dollar-brace anywhere in this file — it is inlined
// into the popout's single String.raw literal (scripts/check.js enforces that).

// How many entries one snapshot carries. An untracked build directory can hold
// tens of thousands of files (node_modules after a bad .gitignore), and a
// sidebar that tries to render them all is worse than useless: the cap keeps
// the snapshot bounded and the view says it was cut. The number is generous
// enough that a normal working tree is never truncated.
var GIT_ENTRY_CAP = 300

// The status letter shown for one entry in one section. 「section」 matters
// because the same file can sit in two sections at once (「MM」: staged edit plus
// a further unstaged edit), and each section shows ITS OWN column.
var GIT_SECTION_LIST = [
  { key: 'conflicted', title: '冲突', note: '需要人工合并后才能提交' },
  { key: 'staged', title: '已暂存', note: '已在索引中，等待提交' },
  { key: 'unstaged', title: '未暂存', note: '工作区与索引不一致' },
  { key: 'untracked', title: '未跟踪', note: 'Git 尚未记录的新文件' },
]

// Conflicted: any unmerged column (U), or the add/add and delete/delete pairs —
// those two are conflicts with no 「U」 in either column.
function gitEntryConflicted(entry) {
  if (!entry) return false
  var x = String(entry.x || ' ').charAt(0)
  var y = String(entry.y || ' ').charAt(0)
  if (x === 'U' || y === 'U') return true
  if (x === 'A' && y === 'A') return true
  if (x === 'D' && y === 'D') return true
  return false
}

function gitEntryUntracked(entry) {
  if (!entry) return false
  return String(entry.x || ' ').charAt(0) === '?' && String(entry.y || ' ').charAt(0) === '?'
}

// Parse the raw text of 「git status --porcelain=v1 -z」. Returns entries in the
// order git printed them (which is path order), each 「{ x, y, path, origPath }」.
function parsePorcelainZ(text) {
  var out = []
  var raw = String(text == null ? '' : text)
  if (!raw) return out
  var records = raw.split('\u0000')
  for (var i = 0; i < records.length; i += 1) {
    var rec = records[i]
    if (!rec || rec.length < 3) continue
    var entry = { x: rec.charAt(0), y: rec.charAt(1), path: rec.slice(3), origPath: '' }
    var x = entry.x
    if (x === 'R' || x === 'C') {
      // The source path is the next record and belongs to THIS entry.
      var next = records[i + 1]
      if (typeof next === 'string' && next) {
        entry.origPath = next
        i += 1
      }
    }
    out.push(entry)
  }
  return out
}

// Which sections one entry belongs to, in GIT_SECTION_LIST order. A file with
// both columns set (「MM」, 「AM」, 「RM」…) is deliberately listed under BOTH — that
// is what git's own status does, and collapsing it into one row would hide the
// fact that part of the change is already staged.
function gitSectionsOf(entry) {
  if (!entry) return []
  var keys = []
  if (gitEntryConflicted(entry)) keys.push('conflicted')
  var x = String(entry.x || ' ').charAt(0)
  var y = String(entry.y || ' ').charAt(0)
  if (!gitEntryUntracked(entry) && !gitEntryConflicted(entry)) {
    if (x !== ' ' && x !== '?') keys.push('staged')
    if (y !== ' ' && y !== '?') keys.push('unstaged')
  }
  if (gitEntryUntracked(entry)) keys.push('untracked')
  return keys
}

// The single character shown against a row in one section, and the full word
// its tooltip spells out. 「?」 is untracked, 「U」 is a conflict.
function gitStatusLetter(entry, section) {
  var x = entry ? String(entry.x || ' ').charAt(0) : ' '
  var y = entry ? String(entry.y || ' ').charAt(0) : ' '
  var letter = ' '
  if (section === 'staged') letter = x
  else if (section === 'unstaged') letter = y
  else if (section === 'untracked') letter = '?'
  else if (section === 'conflicted') letter = 'U'
  var words = {
    M: '已修改', A: '新增', D: '已删除', R: '重命名', C: '复制',
    T: '类型变更', U: '冲突', '?': '未跟踪', ' ': '无变化',
  }
  return { letter: letter, label: words[letter] || letter }
}

// Group entries into the sections the view draws, dropping empty ones.
function gitSectionGroups(entries) {
  var list = Array.isArray(entries) ? entries : []
  var groups = []
  for (var i = 0; i < GIT_SECTION_LIST.length; i += 1) {
    var spec = GIT_SECTION_LIST[i]
    var rows = []
    for (var j = 0; j < list.length; j += 1) {
      if (gitSectionsOf(list[j]).indexOf(spec.key) >= 0) rows.push(list[j])
    }
    if (rows.length) groups.push({ key: spec.key, title: spec.title, note: spec.note, rows: rows })
  }
  return groups
}

// Distinct-path counts, so a file that is both staged and unstaged is counted
// once in 「total」 while still appearing in both sections.
function gitCounts(entries) {
  var list = Array.isArray(entries) ? entries : []
  var out = { conflicted: 0, staged: 0, unstaged: 0, untracked: 0, total: 0 }
  var seen = {}
  for (var i = 0; i < list.length; i += 1) {
    var e = list[i]
    var keys = gitSectionsOf(e)
    if (!keys.length) continue
    if (!seen[e.path]) { seen[e.path] = 1; out.total += 1 }
    for (var k = 0; k < keys.length; k += 1) {
      if (out[keys[k]] != null) out[keys[k]] += 1
    }
  }
  return out
}

// The one-line summary the band and the header carry.
function gitSummaryText(counts) {
  if (!counts || !counts.total) return '工作区干净'
  var parts = []
  if (counts.conflicted) parts.push(counts.conflicted + ' 冲突')
  if (counts.staged) parts.push(counts.staged + ' 已暂存')
  if (counts.unstaged) parts.push(counts.unstaged + ' 未暂存')
  if (counts.untracked) parts.push(counts.untracked + ' 未跟踪')
  return counts.total + ' 个文件有改动' + (parts.length ? '（' + parts.join(' · ') + '）' : '')
}

// "↑2 ↓1" — ahead and behind the upstream. Absent counts (no upstream) print
// nothing rather than a misleading 0/0.
function gitAheadBehindText(ahead, behind) {
  var parts = []
  if (typeof ahead === 'number' && isFinite(ahead) && ahead > 0) parts.push('↑' + ahead)
  if (typeof behind === 'number' && isFinite(behind) && behind > 0) parts.push('↓' + behind)
  return parts.join(' ')
}

// A remote URL is shown to the user, so credentials must never travel with it.
// Two shapes carry them:
//   · https://user:token@host/owner/repo.git  (userinfo)
//   · git@host:owner/repo.git                 (ssh user — harmless, but the
//                                              user is noise, not information)
// and a third hides one in the query (「?access_token=…」, common on CI mirrors).
// Stripping all three is cheap; a token leaked into a screenshot is not.
function redactRemote(url) {
  var text = String(url == null ? '' : url).trim()
  if (!text) return ''
  var ssh = /^[A-Za-z0-9._-]+@([^/]+:.+)$/.exec(text)
  if (ssh) return ssh[1]
  var scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/]*)([\s\S]*)$/.exec(text)
  if (scheme) {
    var authority = scheme[2].replace(/^[^@]*@/, '')
    var rest = scheme[3].split('?')[0].split('#')[0]
    return scheme[1] + '://' + authority + rest
  }
  return text.split('?')[0]
}

// How the branch is named in the header: a detached HEAD has no branch name —
// git answers the literal "HEAD" — and saying so is more useful than printing
// "HEAD", which reads like a branch called HEAD.
function gitHeadLabel(snapshot) {
  var snap = snapshot || {}
  if (snap.detached) {
    return snap.head ? 'HEAD 分离 @ ' + String(snap.head) : 'HEAD 分离'
  }
  return String(snap.branch || '') || '（无分支）'
}
