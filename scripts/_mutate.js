/**
 * Scratch: mutation-test the guards added in this round.
 *
 * Each case reintroduces ONE defect that shipped (or nearly shipped), rebuilds,
 * and runs the guard suite. A case that fails no check is a guard that guards
 * nothing.
 *
 *   node scripts/_mutate.js
 */
import { execFileSync } from 'node:child_process'
import { recover, mutate as writeMutant, unmutate } from './_mutate-lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const cases = [
  // ── the session identity fix (the reported 「无法在系统侧边栏打开此文件」) ──
  {
    name: 'root session read goes back to the field the snapshot does not have',
    file: 'src/client/core.js',
    from: `        const byId = snap.byId || {}
        const ids = Array.isArray(snap.ids) && snap.ids.length ? snap.ids : Object.keys(byId)
        for (const id of ids) {
          const row = byId[id]
          if (row && row.retainedBy && row.retainedBy.mainView > 0) return id
        }`,
    to: `        return ''`,
  },
  {
    name: 'file address keeps the absolute path',
    file: 'src/client/docpreview.js',
    from: `      const normalized = workspaceRelativePath(sessionId, String(path).replace(/\\\\/g, '/').replace(/^(?:\\.\\/)+/, ''))`,
    to: `      const normalized = String(path).replace(/\\\\/g, '/').replace(/^(?:\\.\\/)+/, '')`,
  },
  {
    name: 'the refusal loses its reason again',
    file: 'src/client/docpreview.js',
    from: `      const reason = res && res.reason
      if (reason === 'no-face') return '无法在系统侧边栏打开：这个 DSH 没有可用的右侧边栏'
      if (reason === 'no-session') return '无法在系统侧边栏打开：还没有选中的会话'
      const detail = res && res.detail ? '（' + res.detail + '）' : ''
      return '无法在系统侧边栏打开此文件' + detail`,
    to: `      return '无法在系统侧边栏打开此文件'`,
  },
  {
    name: 'the panel ignores the seat\'s session',
    file: 'src/client/components.js',
    from: `  const sessionId = seatSessionId || currentSessionId()`,
    to: `  const sessionId = currentSessionId()`,
  },
  {
    name: 'the tree is not told which session it belongs to',
    file: 'src/client/components.js',
    from: `          items: items,
          // The seat's own session, so every directory read is fenced to THIS
          // tab's workspace (see seatSessionId in src/client/filetree.js).
          sessionId: seatSessionId,`,
    to: `          items: items,`,
  },
  {
    name: 'the blank-session page reads the missing field again',
    file: 'src/client/native.js',
    from: `        const id = currentSessionId()
        if (!id) return ''
        const snap = list.getSnapshot()`,
    to: `        const snap = list.getSnapshot()
        const id = snap && (snap.current != null ? snap.current : snap.active)
        if (typeof id !== 'string' || !id) return ''`,
  },

  // ── the Markdown raw-HTML work (the reported badge / <picture> failures) ──
  {
    name: 'a name-valued setting is clamped like a number again',
    file: 'src/shared/settings.js',
    from: `    if (typeof fallback === 'boolean') out[key] = !!value;
    else if (typeof fallback === 'string') out[key] = choiceSetting(key, value);
    else out[key] = clampSetting(key, value);`,
    to: `    out[key] = typeof fallback === 'boolean' ? !!value : clampSetting(key, value);`,
  },
  {
    name: 'the settings allow-list drifts from the skins list',
    file: 'src/shared/settings.js',
    from: `  markdownSkin: ['default', 'github', 'wechat', 'zhihu'],`,
    to: `  markdownSkin: ['default', 'github'],`,
  },
  {
    name: 'nested tokens are restored in one pass again',
    file: 'src/shared/markdown.js',
    from: `  s = restoreTokens(s, kept, 'A');
  return restoreTokens(s, math, 'M');`,
    to: `  s = s.replace(/\\x01A(\\d+)\\x02/g, function (m, d) { return kept[Number(d) - 1] || m; });
  return s.replace(/\\x01M(\\d+)\\x02/g, function (m, d) { return math[Number(d) - 1] || m; });`,
  },
  {
    name: '<picture> is not a known block tag again',
    file: 'src/shared/markdown.js',
    from: `  picture: 1,
};`,
    to: `};`,
  },
  {
    name: 'raw HTML image URLs are not rebased again',
    file: 'src/shared/markdown.js',
    from: `      if (/^(src|poster)$/i.test(an)) safe = mdMedia(safe, opts);`,
    to: `      if (false) safe = mdMedia(safe, opts);`,
  },

  {
    name: 'the skin class is not put on the render root',
    file: 'src/client/preview.js',
    from: `      return React.createElement('div', { ref, className: 'artifacts-markdown' + markdownSkinClass(skin) })`,
    to: `      return React.createElement('div', { ref, className: 'artifacts-markdown' })`,
  },
  {
    name: 'the skin stylesheet is never injected',
    file: 'src/client/preview.js',
    from: `      const css = markdownSkinCss(settingsStore.get().markdownSkin)`,
    to: `      const css = ''`,
  },

  // ── the media route (a document-relative image 404ing) ────────────────────
  {
    name: 'the media route resolves against the sandbox root again',
    file: 'src/host/routes.js',
    from: `            const cwd = (await resolveCwd(query.sessionId || '')) || fallback`,
    to: `            const cwd = fallback`,
  },
]

const run = (args) => execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

let survived = 0
// A previous run may have been KILLED while holding a mutant (that is exactly how
// an `if (false)` once survived into a built bundle). Restore stale mutants FIRST,
// or this run would read a mutated file as its own original.
recover(['src/client/core.js', 'src/client/docpreview.js', 'src/client/components.js', 'src/client/native.js', 'src/shared/settings.js', 'src/shared/markdown.js', 'src/client/preview.js', 'src/host/routes.js'])

for (const c of cases) {
  const original = readFileSync(c.file, 'utf8')
  // The working tree checks these files out with CRLF; adapt the mutation to the
  // bytes on disk, or it silently misses and proves nothing.
  const crlf = original.indexOf('\r\n') >= 0
  const adapt = (text) => (crlf ? text.replace(/\n/g, '\r\n') : text)
  const from = adapt(c.from)
  const to = adapt(c.to)
  if (original.indexOf(from) < 0) {
    console.log('MISS   ' + c.name + ' — the text to mutate is not in ' + c.file)
    continue
  }
  writeMutant(c.file, original.replace(from, to))
  let verdict
  try {
    run(['scripts/build.js'])
    run(['scripts/check.js', '--no-browser'])
    verdict = 'SURVIVED (no guard caught it)'
    survived += 1
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '')
    const failed = out.split('\n').map((l) => l.trim()).filter((l) => l.indexOf('\u2717') === 0)
    verdict = failed.length ? 'CAUGHT — ' + failed.join(' | ').slice(0, 190) : 'ERROR: ' + out.slice(-200)
  } finally {
    unmutate(c.file)
    run(['scripts/build.js'])
  }
  console.log(verdict + '  [' + c.name + ']')
}
console.log(survived ? survived + ' case(s) survived' : 'every mutation was caught')
