    // ── 用量 / 上下文：一个系统的 Tab，读系统自己的投影 ──────────────────────
    // The shell's session projections already carry everything a usage view
    // needs: the HOST is the only computation site, and the client holds finished
    // whole values per key (`key → { value, seq }`, higher seq wins). Our tab body
    // receives the framework's own `useProjection` hook as a STANDARD PROP — the
    // `sidebar.right.pane.tab` seat declares it — so this view costs no host code,
    // no route and no ledger of our own, and it cannot disagree with the ring
    // beside the composer: both read the same `contextPressure` /
    // `contextBreakdown` keys, and occupancy is computed with the product's own
    // rule (see contextOccupancy below).
    //
    // It is registered as a PAGE TYPE (`ctx.sidebarRightTabs` + the keyed seat),
    // NOT as another view inside a strip of our own: its chip, its tab chrome and
    // its fullscreen / float controls are then the shell's, identical to every
    // other tab in that column. That is the rule for this plugin's surfaces.
    //
    // `undefined` from useProjection uniformly means "capability absent" — the
    // host unit is unmounted, or no baseline/frame has carried the key yet — so
    // every field is optional and the body says which part is missing rather than
    // rendering a figure nobody reported.
    const USAGE_TAB_ID = 'dsh-sidebar-frog/usage'
    const USAGE_TAB_TITLE = '用量'

    // The three keys token-meter registers when the composition provides
    // `ctx.sessionProjections`. Registered as a list so the set is stated once.
    const USAGE_KEYS = ['contextPressure', 'contextBreakdown', 'tokenUsage']

    // Called at the top of the tab body, never conditionally: the prop is injected
    // by the seat and is therefore fixed for the life of the mounted instance, so
    // the hook count cannot change between renders. `null` means the seat did not
    // give us the framework hook, and every block then reports itself as absent.
    const useUsageProjections = (useProjection) => {
      if (typeof useProjection !== 'function') return null
      const pressure = useProjection('contextPressure')
      const breakdown = useProjection('contextBreakdown')
      const tokens = useProjection('tokenUsage')
      return { pressure: pressure || null, breakdown: breakdown || null, tokens: tokens || null }
    }

    // The product's own bounded-occupancy rule (ui-conversation's
    // contextOccupancy, reproduced so the two agree to the percentage): the NEXT
    // request's prompt is the figure to show, the provider's last sample is the
    // fallback, and both a numerator and the route capacity must be known before
    // anything is shown at all.
    const contextOccupancy = (pressure) => {
      if (!pressure) return null
      const usedTokens = pressure.projectedTokens == null ? pressure.pressureTokens : pressure.projectedTokens
      if (usedTokens == null || pressure.contextWindow == null) return null
      return {
        percent: Math.min(100, Math.round(usedTokens / pressure.contextWindow * 100)),
        usedTokens: usedTokens,
        contextWindow: pressure.contextWindow,
      }
    }

    // Whether the cumulative provider usage has anything to say yet.
    const usageTokensReported = (tokens) => !!tokens &&
      !!(tokens.uncachedInputTokens || tokens.outputTokens || tokens.cacheReadTokens || tokens.cacheWriteTokens)

    // Whether the session has any usage to show at all. The 用量 entry point is
    // hidden until this is true, following the product's own meter — which renders
    // nothing until a provider reports pressure and a route capacity: an entry that
    // opens onto three dashes is worse than no entry.
    const usageVisible = (usage) => {
      if (!usage) return false
      if (contextOccupancy(usage.pressure)) return true
      return usageTokensReported(usage.tokens)
    }

    // 1.2K / 3.4M — the compact form the product's meter uses (one decimal below
    // 100, none above, so a column of figures stays aligned).
    const formatTokens = (value) => {
      const n = typeof value === 'number' && isFinite(value) ? Math.max(0, value) : 0
      const scaled = (v) => (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))
      if (n < 1000) return String(Math.round(n))
      if (n < 1e6) return scaled(n / 1e3) + 'K'
      return scaled(n / 1e6) + 'M'
    }

    // The tab's identity. The TYPE (kind, title, guide entry) is registered with
    // every other view in src/client/native.js's FROG_TABS — one place that knows
    // the whole set and the guide's order — so this module owns only what is
    // specific to the usage view: the projection readers below and its body.
    const USAGE_TAB_KIND = 'frog-usage'

    // The tab BODY — the only place `useProjection` may be called, since the seat
    // injects that hook as a standard prop of exactly this component.
    const UsageTabBody = (props) => {
      const usage = useUsageProjections(props && props.useProjection)
      return React.createElement('div', { className: 'artifacts-panel artifacts-panel-native' },
        React.createElement(UsagePane, { usage: usage }),
      )
    }

    // The context composition's three parts, in the product's own order, labels
    // and colours — a reader who knows the composer's meter reads this one the
    // same way. `tone` picks the stylesheet's tint class.
    const USAGE_SEGMENTS = [
      { key: 'systemTokens', label: '系统提示词', tone: 'system' },
      { key: 'toolsTokens', label: '工具定义', tone: 'tools' },
      { key: 'messageTokens', label: '对话消息', tone: 'messages' },
    ]

    // The cumulative four buckets, disjoint by the projection's own contract
    // (reasoning tokens are already inside output and are not counted twice).
    const USAGE_BUCKETS = [
      { key: 'uncachedInputTokens', label: '未缓存输入' },
      { key: 'cacheReadTokens', label: '缓存读取' },
      { key: 'cacheWriteTokens', label: '缓存写入' },
      { key: 'outputTokens', label: '输出' },
    ]

    const UsagePane = (props) => {
      const usage = (props && props.usage) || {}
      const occ = contextOccupancy(usage.pressure)
      const bd = usage.breakdown || null
      const compositionTotal = bd ? (bd.systemTokens || 0) + (bd.toolsTokens || 0) + (bd.messageTokens || 0) : 0

      const head = React.createElement('div', { className: 'artifacts-usage-head' },
        React.createElement('span', { className: 'artifacts-usage-title' }, '上下文已用'),
        occ
          ? React.createElement('span', { className: 'artifacts-usage-percent' }, occ.percent + '%')
          : React.createElement('span', { className: 'artifacts-usage-muted' }, '系统尚未上报'),
        occ
          ? React.createElement('span', { className: 'artifacts-usage-figures' },
            formatTokens(occ.usedTokens) + ' / ' + formatTokens(occ.contextWindow))
          : null,
      )

      // The composition bar. Segments are proportional to the heuristic
      // composition only — the projection's contract is explicit that these are
      // approximations of what the context is MADE OF, never the billed total.
      const segments = compositionTotal > 0
        ? USAGE_SEGMENTS.map((seg) => {
          const value = bd[seg.key] || 0
          if (value <= 0) return null
          return React.createElement('div', {
            key: seg.key,
            className: 'artifacts-usage-seg artifacts-usage-tone-' + seg.tone,
            style: { width: (value / compositionTotal * 100) + '%' },
            title: seg.label + ' ' + formatTokens(value),
          })
        })
        : null

      const composition = React.createElement('div', { className: 'artifacts-usage-block' },
        React.createElement('div', { className: 'artifacts-usage-label' }, '上下文构成（启发式，非计费值）'),
        React.createElement('div', { className: 'artifacts-usage-track' }, segments),
        React.createElement('div', { className: 'artifacts-usage-legend' },
          USAGE_SEGMENTS.map((seg) => React.createElement('div', { key: seg.key, className: 'artifacts-usage-row' },
            React.createElement('span', { className: 'artifacts-usage-swatch artifacts-usage-tone-' + seg.tone, 'aria-hidden': 'true' }),
            React.createElement('span', { className: 'artifacts-usage-name' }, seg.label),
            React.createElement('span', { className: 'artifacts-usage-value' }, bd ? formatTokens(bd[seg.key] || 0) : '—'),
          )),
        ),
      )

      const tokens = usage.tokens || null
      const totals = React.createElement('div', { className: 'artifacts-usage-block' },
        React.createElement('div', { className: 'artifacts-usage-label' }, '累计用量（提供方上报）'),
        React.createElement('div', { className: 'artifacts-usage-legend' },
          USAGE_BUCKETS.map((bucket) => React.createElement('div', { key: bucket.key, className: 'artifacts-usage-row' },
            React.createElement('span', { className: 'artifacts-usage-name' }, bucket.label),
            React.createElement('span', { className: 'artifacts-usage-value' }, tokens ? formatTokens(tokens[bucket.key] || 0) : '—'),
          )),
        ),
      )

      return React.createElement('div', { className: 'artifacts-usage' },
        head,
        // Pressure and breakdown come from different projections updated
        // independently, so a composition without an occupancy figure is a real
        // state (and vice versa) — each block says so on its own.
        compositionTotal > 0 ? composition : React.createElement('div', { className: 'artifacts-usage-block' },
          React.createElement('div', { className: 'artifacts-usage-label' }, '上下文构成（启发式，非计费值）'),
          React.createElement('div', { className: 'artifacts-usage-muted' }, '系统尚未上报上下文构成。'),
        ),
        usageTokensReported(tokens) ? totals : React.createElement('div', { className: 'artifacts-usage-block' },
          React.createElement('div', { className: 'artifacts-usage-label' }, '累计用量（提供方上报）'),
          React.createElement('div', { className: 'artifacts-usage-muted' }, '系统尚未上报累计用量。'),
        ),
      )
    }
