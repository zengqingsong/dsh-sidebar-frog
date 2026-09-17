    // ── 编辑 pane (React half) ──────────────────────────────────────────────
    // The panel's editor: a toolbar, the CodeMirror mount from the shared
    // module, and the three states a real save has to survive — writing,
    // saved, and "the file changed under you". The popout page mounts the SAME
    // CodeMirror core from plain DOM (see src/host/page.js), so the two faces
    // cannot disagree about what Ctrl+S does or when a document is dirty.
    //
    // What may be edited is decided here and nowhere else: the plugin's own
    // text-ish preview types, minus the two cases where saving would LOSE data:
    //
    //   · `editable === false` — the host's verdict that a save of what the
    //     browser holds cannot succeed (the file is past the save ceiling, or the
    //     read was cut). Its own rule, not one re-derived here: the panel used to
    //     infer it from `truncated`, which was right only while 预览 and 编辑
    //     shared a single 200000-character cap. They do not any more — a 2 MB
    //     Markdown file now previews IN FULL and is still refused an editor,
    //     because saving a prefix is the one failure worse than not editing.
    //   · a failed read (`ok === false`) — there is nothing to edit.
    //
    // Everything else (image / pdf / audio / video / office / document) has no
    // text to write and shows no toolbar at all, rather than a disabled one.

    const EDITABLE_TYPES = { markdown: 1, text: 1, table: 1 }

    // A host that predates the `editable` field answers `truncated` only, and
    // that inference is the safe one to fall back to.
    const canEditRead = (p) => (p.editable === undefined ? !p.truncated : !!p.editable)

    const isEditablePreview = (p) => !!p && p.ok !== false && canEditRead(p) && EDITABLE_TYPES[p.type] === 1 && typeof p.content === 'string'

    // ── Drafts ──────────────────────────────────────────────────────────────
    // Unsaved text lives OUTSIDE the component, keyed by path. A file tab
    // unmounts when you switch to another one (and the 2 s ledger poll re-reads
    // the preview), so edits kept in component state would be lost by a click on
    // another tab — the classic way an editor eats somebody's paragraph. The
    // draft also survives 预览/编辑 toggles, which is what lets the toggle stay
    // cheap (it re-creates the editor instead of trying to keep a hidden one
    // measured correctly).
    const draftStore = {
      map: Object.create(null),
      listeners: [],
      get(path) { return this.map[path] || null },
      put(path, patch) {
        if (!path) return
        const prev = this.map[path] || { text: '', dirty: false }
        const next = Object.assign({}, prev, patch)
        this.map[path] = next
        this.notify()
      },
      isDirty(path) {
        const d = this.map[path]
        return !!(d && d.dirty)
      },
      drop(path) {
        if (!this.map[path]) return
        delete this.map[path]
        this.notify()
      },
      notify() {
        this.listeners.forEach((fn) => { try { fn() } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
    }

    // Re-render whoever shows a dirty marker (the file tabs) when a draft
    // changes. Cheap on purpose: it is a counter, not a snapshot.
    const useDraftTick = () => {
      const [tick, setTick] = React.useState(0)
      React.useEffect(() => draftStore.subscribe(() => setTick((n) => n + 1)), [])
      return tick
    }

    // The draft's text is written on a short debounce. `onChange` fires per
    // keystroke and the draft is the WHOLE document, so writing it per character
    // would build a fresh copy of the file for each one; a debounce that is
    // always flushed before the editor goes away (unmount, mode toggle, save) is
    // invisible and cannot lose the tail of what somebody typed.
    const makeDraftWriter = (path, getText) => {
      let timer = null
      const write = () => {
        timer = null
        draftStore.put(path, { text: getText(), dirty: true })
      }
      return {
        touch() {
          if (timer) clearTimeout(timer)
          timer = setTimeout(write, 200)
        },
        flush() {
          if (timer) { clearTimeout(timer); timer = null }
          write()
        },
        cancel() {
          if (timer) { clearTimeout(timer); timer = null }
        },
      }
    }

    // The editor pane. It owns the mode (预览 / 编辑), the draft, the save and the
    // conflict state, and it renders `props.children` — the panel's ordinary
    // read-only preview — whenever it is not editing. That is what makes the
    // toolbar appear only where it means something: a caller passes children for
    // every type and this component decides whether there is anything to do
    // with them.
    const EditorPane = (props) => {
      const path = props.path || ''
      const editable = props.editable === true
      const [mode, setMode] = React.useState('view')
      const [boot, setBoot] = React.useState('idle')
      const [dirty, setDirty] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [status, setStatus] = React.useState('')
      const [conflict, setConflict] = React.useState(null)
      const [armedReload, setArmedReload] = React.useState(false)
      const [loaded, setLoaded] = React.useState(null)

      const mountRef = React.useRef(null)
      const ctrlRef = React.useRef(null)
      const writerRef = React.useRef(null)
      const dirtyRef = React.useRef(false)
      // The save handler is reached from CodeMirror's keymap, which captured the
      // closure at creation time. A ref is what keeps Ctrl+S pointing at the
      // CURRENT state (busy flag, latest loaded revision) instead of at whatever
      // those were when the editor was built.
      const saveRef = React.useRef(null)

      // Leaving the file (or losing editability — a re-read that came back
      // un-editable, whether because it is too big to save or because the read
      // was cut) returns to 预览: an editor whose document is no longer the one
      // on screen must not stay mounted claiming to be it.
      React.useEffect(() => {
        if (!editable && mode === 'edit') setMode('view')
      }, [editable, mode])

      React.useEffect(() => {
        if (mode === 'view') return undefined
        if (!path || !mountRef.current) return undefined
        const draft = draftStore.get(path)
        const initial = draft && draft.dirty ? draft.text : (props.content == null ? '' : String(props.content))
        const base = { version: props.baseVersion || null, size: typeof props.baseSize === 'number' ? props.baseSize : null }
        setLoaded(base)
        setBoot('loading')
        let alive = true
        const writer = makeDraftWriter(path, () => (ctrlRef.current ? ctrlRef.current.getValue() : initial))
        writerRef.current = writer
        createEditor(mountRef.current, {
          path: path,
          value: initial,
          dark: isDarkScheme(),
          onChange: () => { dirtyRef.current = true; writer.touch() },
          onDirty: (isDirty) => {
            dirtyRef.current = isDirty
            setDirty(isDirty)
            if (isDirty) writer.flush()
            else { writer.cancel(); draftStore.put(path, { dirty: false }) }
          },
          onSave: () => { if (saveRef.current) saveRef.current(false) },
        }).then((ctrl) => {
          if (!alive) {
            if (ctrl) ctrl.destroy()
            return
          }
          if (!ctrl) {
            setBoot('failed')
            return
          }
          ctrlRef.current = ctrl
          setBoot('ready')
          setDirty(ctrl.isDirty())
          ctrl.focus()
        })
        return () => {
          alive = false
          // The pending debounce is written BEFORE the controller goes away —
          // this is the one line that keeps switching tabs from losing the last
          // couple of hundred milliseconds of typing.
          if (dirtyRef.current) writer.flush()
          else writer.cancel()
          writerRef.current = null
          if (ctrlRef.current) {
            ctrlRef.current.destroy()
            ctrlRef.current = null
          }
        }
        // Deliberately keyed on the path and the mode only: a new `content` prop
        // (the 2 s ledger poll re-reading the file) must NOT rebuild the editor
        // and throw away what somebody is typing. Drift is surfaced as a conflict
        // instead — see the effect below and saveNow.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [path, mode])

      // The file moved on while there are unsaved edits. Saying so BEFORE the
      // save fails is the difference between "my work is safe, let me look at
      // what changed" and "保存 did nothing".
      const drifted = !!(mode === 'edit' && loaded && props.baseVersion && String(props.baseVersion) !== String(loaded.version))
      const conflictNow = conflict || (drifted && dirty
        ? { message: '磁盘上的文件已被改动，你正在编辑的是较早的版本', version: props.baseVersion, size: props.baseSize }
        : null)

      const saveNow = (force) => {
        const ctrl = ctrlRef.current
        if (!ctrl || busy) return
        const text = ctrl.getValue()
        setBusy(true)
        setStatus('保存中…')
        setArmedReload(false)
        host.call('artifacts.save', {
          path: path,
          content: text,
          sessionId: currentSessionId(),
          baseVersion: loaded && loaded.version ? loaded.version : undefined,
          baseSize: loaded && typeof loaded.size === 'number' ? loaded.size : undefined,
          force: !!force,
        }).then((res) => {
          setBusy(false)
          if (res && res.ok) {
            ctrl.markClean()
            setDirty(false)
            draftStore.drop(path)
            setConflict(null)
            setLoaded({ version: res.version || null, size: typeof res.size === 'number' ? res.size : null })
            const at = new Date()
            const hh = String(at.getHours()).padStart(2, '0')
            const mm = String(at.getMinutes()).padStart(2, '0')
            setStatus('已保存 ' + hh + ':' + mm + '（' + (res.eol === 'CRLF' ? 'CRLF' : 'LF') + (res.bom ? ' · BOM' : '') + '）')
            if (typeof props.onSaved === 'function') props.onSaved(res)
          } else if (res && res.stale) {
            setConflict({ message: res.error || '文件已被改动', version: res.version, size: res.size })
            setStatus('未保存')
          } else {
            setStatus((res && res.error) || '保存失败')
          }
        }).catch((e) => {
          setBusy(false)
          setStatus(e && e.message ? String(e.message) : '保存失败')
        })
      }
      saveRef.current = saveNow

      // 重新载入: throw the local text away and take what is on disk. The
      // two-step button is on purpose — this is the one action in the pane that
      // destroys work, and the product has no modal to fall back on.
      const reloadFromDisk = () => {
        const ctrl = ctrlRef.current
        if (!ctrl) return
        setBusy(true)
        setStatus('重新载入中…')
        host.call('artifacts.read', { path: path }).then((res) => {
          setBusy(false)
          if (!res || res.ok === false) {
            setStatus((res && res.error) || '重新载入失败')
            return
          }
          const view = ctrl.view
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(res.content == null ? '' : res.content) } })
          ctrl.markClean()
          setDirty(false)
          draftStore.drop(path)
          setConflict(null)
          setArmedReload(false)
          setLoaded({ version: res.version || null, size: typeof res.size === 'number' ? res.size : null })
          setStatus('已载入磁盘上的版本')
        }).catch((e) => {
          setBusy(false)
          setStatus(e && e.message ? String(e.message) : '重新载入失败')
        })
      }

      const onKeyDown = (ev) => {
        if (ev.key === 'Escape' && mode === 'edit' && !dirty) {
          setMode('view')
          ev.stopPropagation()
        }
      }

      // Not editable: the caller's read-only preview, untouched. No toolbar, no
      // disabled buttons — a control that cannot do anything is noise.
      if (!editable) return props.children || null

      const bar = React.createElement('div', { className: 'artifacts-edbar' },
        React.createElement('div', { className: 'artifacts-edbar-group' },
          React.createElement('button', {
            key: 'mode',
            type: 'button',
            className: 'artifacts-edbtn artifacts-edbtn-mode' + (mode === 'edit' ? ' is-on' : ''),
            title: mode === 'edit' ? '回到只读预览（Esc）' : '用 CodeMirror 编辑这个文件（Ctrl+S 保存）',
            onClick: () => setMode(mode === 'edit' ? 'view' : 'edit'),
          }, mode === 'edit' ? '预览' : '编辑'),
          mode === 'edit' ? React.createElement('span', { key: 'kind', className: 'artifacts-ednote' }, editorLanguageName(path) ? 'CodeMirror · ' + editorLanguageName(path) : 'CodeMirror · 纯文本') : null,
        ),
        React.createElement('div', { className: 'artifacts-edbar-group' },
          status ? React.createElement('span', {
            key: 'status',
            className: 'artifacts-edstatus' + (conflictNow ? ' is-bad' : (dirty ? ' is-dirty' : '')),
            title: status,
          }, status) : (mode === 'edit' && dirty ? React.createElement('span', { key: 'status', className: 'artifacts-edstatus is-dirty' }, '未保存') : null),
          mode === 'edit' ? React.createElement('button', {
            key: 'reload',
            type: 'button',
            className: 'artifacts-edbtn' + (armedReload ? ' is-armed' : ''),
            disabled: busy,
            title: armedReload ? '再点一次：丢弃你的修改，载入磁盘上的版本' : '丢弃你的修改，重新读取磁盘上的文件',
            onClick: () => { if (armedReload) reloadFromDisk(); else setArmedReload(true) },
          }, armedReload ? '确认丢弃并载入' : '重新载入') : null,
          mode === 'edit' ? React.createElement('button', {
            key: 'save',
            type: 'button',
            className: 'artifacts-edbtn artifacts-edbtn-save',
            disabled: busy || !dirty,
            title: dirty ? '保存（Ctrl+S）' : '没有未保存的修改',
            onClick: () => saveNow(!!conflict),
          }, busy ? '保存中…' : '保存') : null,
        ),
      )

      const conflictBar = (mode === 'edit' && conflictNow) ? React.createElement('div', { className: 'artifacts-edconflict', role: 'status' },
        React.createElement('span', { className: 'artifacts-edconflict-ico' }, '!'),
        React.createElement('span', { className: 'artifacts-edconflict-text' }, conflictNow.message || '文件已被改动'),
        React.createElement('span', { className: 'artifacts-edconflict-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-edbtn' + (armedReload ? ' is-armed' : ''),
            disabled: busy,
            onClick: () => { if (armedReload) reloadFromDisk(); else setArmedReload(true) },
          }, armedReload ? '确认丢弃并载入' : '载入磁盘版本'),
          React.createElement('button', {
            type: 'button',
            className: 'artifacts-edbtn artifacts-edbtn-force',
            disabled: busy,
            title: '用你编辑器里的内容覆盖磁盘上的版本（写入仍是原子的，并再次校验版本）',
            onClick: () => saveNow(true),
          }, '仍然保存'),
        ),
      ) : null

      return React.createElement('div', { className: 'artifacts-editpane', onKeyDown: onKeyDown },
        bar,
        conflictBar,
        mode === 'edit'
          ? React.createElement('div', { className: 'artifacts-edmount' },
            React.createElement('div', { ref: mountRef, className: 'artifacts-edcm' }),
            boot === 'loading' ? React.createElement('div', { className: 'artifacts-edhint' }, '正在载入编辑器（CodeMirror 604 KB，仅首次）…') : null,
            boot === 'failed' ? React.createElement('div', { className: 'artifacts-error' }, '编辑器组件未能载入（/dsh-sidebar-frog/codemirror/codemirror.min.js）。请刷新页面重试，或改用系统编辑器打开。') : null,
          )
          : (props.children || null),
      )
    }
