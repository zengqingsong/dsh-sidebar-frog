    // ── Git 只读切片：一个系统的 Tab ────────────────────────────────────────
    // What this view is: the branch, ahead/behind, the changed and untracked
    // files, and one file's difference against HEAD. What it deliberately is NOT:
    // any way to change the repository. There is no stage, commit, discard,
    // checkout or stash anywhere in this plugin — a repository-wide write is the
    // one operation here that can destroy a user's work with no undo, and the
    // panel's own 撤销 already covers "put this one file back".
    //
    // It is a PAGE TYPE of the shell's column (registered with every other view
    // in src/client/native.js's FROG_TABS), so its chip, its chrome and its
    // fullscreen / float controls are the shell's, like every other tab there.
    //
    // ── One snapshot store, module-level ────────────────────────────────────
    // Every mount of this view reads ONE copy through `gitStore`, so two panels
    // (or a session switch and a remount) cannot disagree about the workspace's
    // state, and a request in flight is shared instead of duplicated.
    //
    // ── Why the refresh is throttled rather than polled ─────────────────────
    // `git status` walks the whole worktree: on a large repository it is not the
    // cheap 2-second poll the artifact ledger does. So the snapshot refreshes on
    // mount, when the ledger reports a change (i.e. the agent just wrote
    // something), on window focus / tab visibility, and on demand through the
    // header's ↻ — and never more often than GIT_REFRESH_MIN_MS. The header
    // states when it last read, so a stale view is visible as stale instead of
    // being quietly wrong.
    const GIT_TAB_ID = 'dsh-sidebar-frog/git'
    const GIT_TAB_KIND = 'frog-git'
    const GIT_TAB_TITLE = 'Git'
    const GIT_REFRESH_MIN_MS = 4000

    const gitStore = {
      data: null,        // the last snapshot for `sessionId`
      sessionId: '',
      loading: false,
      error: null,
      at: 0,             // when the last read finished (0 = never)
      listeners: [],
      get() {
        return { data: this.data, loading: this.loading, error: this.error, at: this.at, sessionId: this.sessionId }
      },
      emit() {
        const snap = this.get()
        this.listeners.forEach((fn) => { try { fn(snap) } catch (e) {} })
      },
      subscribe(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter((f) => f !== fn) }
      },
      // `force` bypasses the throttle (the header's ↻ and a session switch); a
      // soft refresh is skipped when one just happened, which is what keeps the
      // artifact poll from turning into a git-status loop.
      load(sessionId, force) {
        const sid = typeof sessionId === 'string' ? sessionId : ''
        const now = Date.now()
        if (!force && this.data && this.sessionId === sid && (now - this.at) < GIT_REFRESH_MIN_MS) {
          return Promise.resolve(this.data)
        }
        if (this.loading && this.sessionId === sid) return Promise.resolve(this.data)
        this.sessionId = sid
        this.loading = true
        this.emit()
        const url = '/dsh-sidebar-frog/git' + (sid ? '?sessionId=' + encodeURIComponent(sid) : '')
        return fetchJson(url).then((res) => {
          this.loading = false
          this.data = res && typeof res === 'object' ? res : null
          this.error = null
          this.at = Date.now()
          this.emit()
          return this.data
        }, (err) => {
          this.loading = false
          this.data = null
          this.error = err && err.message ? String(err.message) : String(err)
          this.at = Date.now()
          this.emit()
          return null
        })
      },
    }

    const useGit = (sessionId, artifactTick) => {
      const [state, setState] = React.useState(gitStore.get())
      React.useEffect(() => gitStore.subscribe(setState), [])
      // A session switch is a different workspace, so it is never throttled.
      React.useEffect(() => { gitStore.load(sessionId, true) }, [sessionId])
      // The ledger's list changed ⇒ the agent touched the workspace. `tick` is a
      // counter the panel bumps ONLY when its list actually differs, so this
      // fires on real activity rather than on every 2-second poll.
      React.useEffect(() => {
        if (artifactTick == null) return undefined
        gitStore.load(sessionId, false)
        return undefined
      }, [artifactTick])
      // The shell's session store emits as a conversation progresses, which is
      // the same "something is happening" signal when no ledger tick is handed
      // in (the native tab renders this pane on its own). The store's throttle in
      // `load` is what keeps that from becoming a git-status loop.
      React.useEffect(() => {
        let list
        try { list = ctx.get('sessions') && ctx.get('sessions').list } catch (e) {}
        if (!list || typeof list.subscribe !== 'function') return undefined
        return list.subscribe(() => { gitStore.load(sessionId, false) })
      }, [sessionId])
      React.useEffect(() => {
        const refresh = () => { gitStore.load(sessionId, false) }
        window.addEventListener('focus', refresh)
        document.addEventListener('visibilitychange', refresh)
        return () => {
          window.removeEventListener('focus', refresh)
          document.removeEventListener('visibilitychange', refresh)
        }
      }, [sessionId])
      return state
    }

    // Why the view has nothing to show. Each reason names the actual missing
    // thing, because "no repository" and "no git installed" look identical in an
    // empty panel and need completely different actions from the user.
    const GIT_ABSENT_TEXT = {
      'not-a-repo': '当前会话的工作目录不在 Git 仓库里。',
      'no-git': '系统里没有找到 git 可执行文件（PATH 上没有 git）。',
      'no-subprocess': '宿主没有提供子进程服务（ctx.subprocess），本插件不自己起进程，因此无法读取 Git 状态。',
      'bare': '这是一个裸仓库（bare）：没有工作区，也就没有可显示的改动。',
      'no-workspace': '工作区不可用：这个会话还没有可解析的工作目录。',
    }

    // The difference card for a mode that has no line-by-line content to show.
    const gitDiffNote = (compare) => {
      if (!compare) return ''
      if (compare.mode === 'binary') return '二进制文件：不显示逐行差异。'
      if (compare.mode === 'too-big') return '文件太大（' + Math.round((compare.size || 0) / 1024) + ' KB），不逐行比较。'
      if (compare.mode === 'same') return '与 HEAD 相同（可能只有权限位或换行的变化）。'
      return ''
    }

    // The status letter's tint, taken from the product's own state tokens so it
    // reads correctly in both themes: added/renamed are green, modified amber,
    // deleted red, a conflict inverts (solid red, white letter).
    const GIT_TONE_BY_LETTER = {
      A: 'add', C: 'add', M: 'mod', T: 'mod', D: 'del', R: 'ren', U: 'conflict', '?': 'new',
    }

    const GitPane = (props) => {
      // The native tab body is handed no props by the seat, so the pane reads the
      // active session itself — the same source the tree and the ledger use.
      const sessionId = props && props.sessionId ? props.sessionId : currentSessionId()
      const state = useGit(sessionId, props && props.artifactTick)
      const snap = state.data
      // The one open comparison, keyed by section + path: only one is ever shown,
      // because the panel is narrow and a nested accordion inside an accordion is
      // unreadable at this width.
      const [openKey, setOpenKey] = React.useState('')
      const [compare, setCompare] = React.useState(null)

      const toggle = (row, section) => {
        const key = section + ':' + row.path
        if (openKey === key) { setOpenKey(''); setCompare(null); return }
        setOpenKey(key)
        setCompare({ loading: true })
        const parts = ['path=' + encodeURIComponent(row.path)]
        if (sessionId) parts.push('sessionId=' + encodeURIComponent(sessionId))
        if (row.origPath) parts.push('origPath=' + encodeURIComponent(row.origPath))
        if (section === 'untracked') parts.push('untracked=1')
        fetchJson('/dsh-sidebar-frog/gitfile?' + parts.join('&')).then((res) => {
          setCompare(res && typeof res === 'object' ? res : { ok: false, error: '宿主没有返回内容' })
        }, (err) => {
          setCompare({ ok: false, error: err && err.message ? String(err.message) : String(err) })
        })
      }

      // ── Nothing loaded yet / the read failed ─────────────────────────────
      if (!snap) {
        if (state.error) {
          return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
            React.createElement('div', { className: 'artifacts-git-empty' },
              React.createElement('div', { className: 'artifacts-git-empty-title' }, '无法读取 Git 状态'),
              React.createElement('div', { className: 'artifacts-git-empty-note' }, state.error),
              React.createElement('button', {
                type: 'button', className: 'artifacts-iconbtn',
                onClick: () => gitStore.load(sessionId, true),
              }, '重试')))
        }
        return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
          React.createElement('div', { className: 'artifacts-git-empty' },
            React.createElement('div', { className: 'artifacts-git-empty-note' }, state.loading ? '正在读取 Git 状态…' : '尚无数据。')))
      }

      // ── Not a repository: say which reason, and stop ─────────────────────
      if (!snap.repo) {
        return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
          React.createElement('div', { className: 'artifacts-git-empty' },
            React.createElement('div', { className: 'artifacts-git-empty-title' }, '这里没有 Git 仓库'),
            React.createElement('div', { className: 'artifacts-git-empty-note' },
              GIT_ABSENT_TEXT[snap.reason] || '未检测到 Git 仓库。'),
            snap.cwd ? React.createElement('div', { className: 'artifacts-git-empty-path', title: snap.cwd }, snap.cwd) : null,
            React.createElement('button', {
              type: 'button', className: 'artifacts-iconbtn',
              onClick: () => gitStore.load(sessionId, true),
            }, '重新检测')))
      }

      const counts = snap.counts || gitCounts(snap.entries)
      const groups = gitSectionGroups(snap.entries)
      const ab = gitAheadBehindText(snap.ahead, snap.behind)

      const head = React.createElement('div', { className: 'artifacts-git-head' },
        React.createElement('span', { className: 'artifacts-git-branch', title: snap.root || '' }, gitHeadLabel(snap)),
        ab ? React.createElement('span', { className: 'artifacts-git-chip', title: '相对 ' + snap.upstream }, ab) : null,
        snap.detached ? React.createElement('span', { className: 'artifacts-git-chip is-warn' }, '游离') : null,
        React.createElement('span', { className: 'artifacts-git-summary' }, gitSummaryText(counts)),
        React.createElement('span', { className: 'artifacts-spacer' }),
        React.createElement('span', { className: 'artifacts-git-age', title: '上次读取 Git 状态的时间' },
          state.at ? relativeTime(state.at) : ''),
        React.createElement('button', {
          type: 'button',
          className: 'artifacts-iconbtn',
          title: '重新读取（git status）',
          'aria-label': '重新读取 Git 状态',
          disabled: !!state.loading,
          onClick: () => gitStore.load(sessionId, true),
        }, state.loading ? '读取中…' : '刷新'))

      // The upstream line is separate from the chips: a repository can be ahead,
      // behind, both or neither, and "which remote am I even comparing against"
      // deserves an answer that is not a tooltip.
      const upstreamLine = snap.upstream
        ? React.createElement('div', { className: 'artifacts-git-upstream' },
          '对照 ' + snap.upstream + (snap.remote ? '  ·  ' + snap.remote : ''),
          snap.ahead || snap.behind
            ? React.createElement('span', { className: 'artifacts-git-upstream-note' },
              '（' + (snap.ahead ? snap.ahead + ' 个提交未推送' : '') +
              (snap.ahead && snap.behind ? '，' : '') +
              (snap.behind ? snap.behind + ' 个提交未拉取' : '') + '）')
            : null)
        : React.createElement('div', { className: 'artifacts-git-upstream' }, '没有配置上游分支（@{upstream}）。')

      const body = groups.length
        ? groups.map((group) => React.createElement('div', { key: group.key, className: 'artifacts-git-section' },
          React.createElement('div', { className: 'artifacts-git-section-head' },
            React.createElement('span', { className: 'artifacts-git-section-title' }, group.title),
            React.createElement('span', { className: 'artifacts-git-section-count' }, group.rows.length),
            React.createElement('span', { className: 'artifacts-git-section-note' }, group.note)),
          group.rows.map((row) => {
            const key = group.key + ':' + row.path
            const letter = gitStatusLetter(row, group.key)
            const name = basename(row.path)
            const dir = row.path.slice(0, Math.max(0, row.path.length - name.length)).replace(/[\\/]+$/, '')
            const open = openKey === key
            return React.createElement('div', { key: key, className: 'artifacts-git-row-wrap' },
              React.createElement('button', {
                type: 'button',
                className: 'artifacts-git-row' + (open ? ' is-open' : ''),
                title: row.path + (row.origPath ? '  ←  ' + row.origPath : ''),
                'aria-expanded': open ? 'true' : 'false',
                onClick: () => toggle(row, group.key),
              },
                React.createElement('span', {
                  className: 'artifacts-git-letter artifacts-git-tone-' + (GIT_TONE_BY_LETTER[letter.letter] || 'mod'),
                  title: group.title + '：' + letter.label,
                }, letter.letter),
                React.createElement('span', { className: 'artifacts-git-path' },
                  React.createElement('span', { className: 'artifacts-git-name' }, name),
                  dir ? React.createElement('span', { className: 'artifacts-git-dir' }, dir) : null),
                row.origPath ? React.createElement('span', { className: 'artifacts-git-orig', title: '原路径 ' + row.origPath }, '← ' + basename(row.origPath)) : null,
              ),
              open ? React.createElement('div', { className: 'artifacts-git-diff' },
                compare && compare.loading ? React.createElement('div', { className: 'artifacts-git-empty-note' }, '正在读取差异…')
                  : !compare ? null
                    : compare.ok === false ? React.createElement('div', { className: 'artifacts-git-empty-note' }, compare.error || '读取差异失败')
                      : gitDiffNote(compare)
                        ? React.createElement('div', { className: 'artifacts-git-empty-note' }, gitDiffNote(compare))
                        // The SAME renderer the ledger uses, with its title naming
                        // this comparison: '编辑差异' would be a lie here, because
                        // nothing was edited by us — this is worktree vs HEAD.
                        : renderDiff({
                          before: compare.before, after: compare.after,
                          truncated: compare.truncated,
                          title: compare.mode === 'added' ? '新文件（未跟踪 / 未提交）' : compare.mode === 'deleted' ? '已删除（与 HEAD 相比）' : '与 HEAD 的差异',
                        })
              ) : null)
          })))
        : null

      return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native artifacts-git' },
        head,
        upstreamLine,
        snap.truncated ? React.createElement('div', { className: 'artifacts-git-truncated' },
          '改动文件过多，只列出前 ' + snap.entries.length + ' 项。') : null,
        React.createElement('div', { className: 'artifacts-git-list' },
          groups.length ? body : React.createElement('div', { className: 'artifacts-git-empty' },
            React.createElement('div', { className: 'artifacts-git-empty-title' }, '工作区干净'),
            React.createElement('div', { className: 'artifacts-git-empty-note' }, '没有已修改、已暂存或未跟踪的文件。'))),
      )
    }
