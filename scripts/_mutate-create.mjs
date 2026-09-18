import { execFileSync } from 'node:child_process'
import { recover, mutate as writeMutant, unmutate } from './_mutate-lib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
const cases = [
  // Both no-clobber layers removed at once: the defect the two-layer design hides.
  { name: 'create clobbers an existing file (stat check AND the exclusive flag gone)',
    file: 'src/host/core.js',
    from: `      if (existing) {
        const what = existing.type === 'directory' ? '文件夹' : '文件'
        return { ok: false, error: '已存在同名' + what + '「' + named.name + '」' }
      }
      let nodeFs`,
    to: `      let nodeFs`,
    also: [[`        else await nodeFs.writeFile(abs, '', { flag: 'wx' })`, `        else await nodeFs.writeFile(abs, '')`]] },
  { name: 'only the stat check removed (the exclusive flag still refuses: NOT a defect)',
    file: 'src/host/core.js',
    from: `      if (existing) {
        const what = existing.type === 'directory' ? '文件夹' : '文件'
        return { ok: false, error: '已存在同名' + what + '「' + named.name + '」' }
      }
      let nodeFs`,
    to: `      let nodeFs` },
  { name: 'both create fences removed',
    file: 'src/host/core.js',
    from: `      if (!inside) return { ok: false, error: '该目录在工作区之外，不能新建' }`,
    to: `      if (false) return { ok: false, error: '该目录在工作区之外，不能新建' }`,
    also: [[`      if (!pathUnder(abs, rootAbs)) return { ok: false, error: '该路径在工作区之外，不能新建' }`,
            `      if (false) return { ok: false, error: '该路径在工作区之外，不能新建' }`]] },
  { name: 'name validation accepts a separator',
    file: 'src/host/core.js',
    from: `      if (/[\\\\/]/.test(trimmed)) return { ok: false, error: '名称不能包含路径分隔符（/ 或 \\\\）' }`,
    to: `      if (false) return { ok: false, error: '名称不能包含路径分隔符（/ 或 \\\\）' }` },
  { name: 'name validation stops checking the reserved names',
    file: 'src/host/core.js',
    from: `        if (CREATE_RESERVED.test(trimmed)) {
          return { ok: false, error: '这是 Windows 的保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）' }
        }`,
    to: `        if (false) {
          return { ok: false, error: '这是 Windows 的保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）' }
        }` },
  { name: 'a missing parent directory is accepted (and never checked)',
    file: 'src/host/core.js',
    from: `      if (!info || info.type !== 'directory') return { ok: false, error: '目标目录不存在或不是文件夹' }`,
    to: `      if (false) return { ok: false, error: '目标目录不存在或不是文件夹' }` },
  { name: 'the create route drops its auth guard',
    file: 'src/host/routes.js',
    from: `        path: '/dsh-sidebar-frog/create',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return`,
    to: `        path: '/dsh-sidebar-frog/create',
        handler: async (req, res) => {
          if (false && rejectRequest(req, res)) return` },
  { name: 'the create route answers GET',
    file: 'src/host/routes.js',
    from: `        path: '/dsh-sidebar-frog/create',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          if (req.method !== 'POST') {`,
    to: `        path: '/dsh-sidebar-frog/create',
        handler: async (req, res) => {
          if (rejectRequest(req, res)) return
          if (false) {` },
  { name: 'the tree sends a path where a name belongs',
    file: 'src/client/filetree.js',
    from: `    host.call('artifacts.create', { parent: c.parent, name: name, kind: c.kind, sessionId: seatSessionId() }).then((res) => {`,
    to: `    host.call('artifacts.create', { parent: c.parent, name: (c.parent ? c.parent + '/' : '') + name, kind: c.kind, sessionId: seatSessionId() }).then((res) => {` },
  { name: 'the created level is never re-read',
    file: 'src/client/filetree.js',
    from: `      if (parent && parent !== rootPath && pathRelativeTo(parent, rootPath) !== '') refreshDir(parent)
      else loadRoot(false)
      setFlashLabel(res.name || name, c.kind === 'dir' ? '已新建文件夹' : '已新建文件')`,
    to: `      setFlashLabel(res.name || name, c.kind === 'dir' ? '已新建文件夹' : '已新建文件')` },
  { name: 'a refused name closes the input row',
    file: 'src/client/filetree.js',
    from: `        setCreating(Object.assign({}, c, { busy: false, error: (res && res.error) || '新建失败' }))
        return`,
    to: `        setCreating(null)
        return` },
  { name: 'creating a folder opens it as a document too',
    file: 'src/client/filetree.js',
    from: `        if (c.kind === 'dir') setTimeout(() => toggle(fresh, true), 60)
        else if (props.onOpen) props.onOpen(fresh, { pinned: false, created: true })`,
    to: `        if (props.onOpen) props.onOpen(fresh, { pinned: false, created: true })
        if (c.kind === 'dir') setTimeout(() => toggle(fresh, true), 60)` },
  { name: 'the target folder is not expanded first',
    file: 'src/client/filetree.js',
    from: `    if (parent && parent !== rootPath) toggle(parent, true)`,
    to: `    if (false) toggle(parent, true)` },
  { name: 'arrow keys move the tree cursor while typing',
    file: 'src/client/filetree.js',
    from: `    if (creating) return
    // The delete confirm is a modal-ish overlay drawn over the tree: Escape`,
    to: `    // The delete confirm is a modal-ish overlay drawn over the tree: Escape` },
  { name: 'the + button creates in the root instead of the cursor directory',
    file: 'src/client/filetree.js',
    from: `    const target = cursorEntry() || { path: rootPath, name: basename(rootPath), isDir: true }`,
    to: `    const target = { path: rootPath, name: basename(rootPath), isDir: true }` },
  { name: 'a created file does not start in the editor',
    file: 'src/client/editor.js',
    from: `      const [mode, setMode] = React.useState(props.initialMode === 'edit' ? 'edit' : 'view')`,
    to: `      const [mode, setMode] = React.useState('view')` },
  { name: 'the panel forgets which file was just created',
    file: 'src/client/components.js',
    from: `    if (opts && opts.created && !fixedView) setPendingEdit(path)`,
    to: `    if (false) setPendingEdit(path)` },
  { name: 'the seat editor accepts a page payload',
    file: 'src/client/docpreview.js',
    from: `      if (Number(content.offset) !== 1 || content.eof !== true) return null`,
    to: `      if (false) return null` },
  { name: 'the seat editor gets no session to save against',
    file: 'src/client/docpreview.js',
    from: `          editable: !!edit,
          sessionId: sessionFromFileAddress(p.resourceAddress),
          content: content,
          baseVersion: edit ? edit.version : null,
          baseSize: edit ? edit.size : null,
        },
          React.createElement(TableView, { content, path: path }),`,
    to: `          editable: !!edit,
          sessionId: '',
          content: content,
          baseVersion: edit ? edit.version : null,
          baseSize: edit ? edit.size : null,
        },
          React.createElement(TableView, { content, path: path }),` },

]
// A previous run may have been KILLED while holding a mutant (that is exactly how
// an `if (false)` once survived into a built bundle). Restore stale mutants FIRST,
// or this run would read a mutated file as its own original.
recover(['src/host/core.js', 'src/host/routes.js', 'src/client/filetree.js', 'src/client/editor.js', 'src/client/components.js', 'src/client/docpreview.js'])

for (const c of cases) {
  const original = readFileSync(c.file, 'utf8')
  const crlf = original.includes('\r\n')
  const adapt = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t)
  if (!original.includes(adapt(c.from))) { console.log('MISS  ' + c.name); continue }
  let mutated = original.replace(adapt(c.from), adapt(c.to))
  for (const [f2, t2] of (c.also || [])) {
    if (!mutated.includes(adapt(f2))) { console.log('MISS(also)  ' + c.name); }
    mutated = mutated.replace(adapt(f2), adapt(t2))
  }
  writeMutant(c.file, mutated)
  let verdict
  try {
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
    execFileSync('node', ['scripts/check.js', '--no-browser'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    verdict = 'SURVIVED'
  } catch (e) {
    const out = String(e.stdout || '')
    const failed = out.split('\n').map((l) => l.trim()).filter((l) => l.indexOf('\u2717') === 0).map((l) => l.slice(2).split(' — ')[0])
    verdict = 'caught by ' + (failed.slice(0, 3).join(' / ') || 'a guard')
  } finally {
    unmutate(c.file)
    execFileSync('node', ['scripts/build.js'], { stdio: 'ignore' })
  }
  console.log((verdict === 'SURVIVED' ? 'SURVIVED  ' : 'caught    ') + c.name + (verdict === 'SURVIVED' ? '' : '  ← ' + verdict.slice(10)))
}
