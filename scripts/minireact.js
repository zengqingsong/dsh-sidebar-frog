/**
 * A tiny hook runtime, just enough to mount one function component (the
 * sidebar's FileTree) in Node and drive it.
 *
 * The sidebar half of the plugin is React, so its tree behaviour (expand-all,
 * collapse-all, the remembered expansion) could not be exercised at all before
 * this: the checks in check.js only proved the bundle loads. This renders a
 * single component with the hooks it actually uses — useState / useEffect /
 * useRef / createElement — so a test can click the same buttons a user clicks
 * and read the rendered rows afterwards.
 *
 * Deliberately not React: no reconciliation, no children components, no
 * context. FileTree is a single component whose helper "components" are plain
 * functions returning elements, which is exactly the shape this supports.
 */

const flatten = (nodes, out = []) => {
  for (const n of nodes) {
    if (Array.isArray(n)) flatten(n, out)
    else if (n !== null && n !== undefined && n !== false && n !== true) out.push(n)
  }
  return out
}

export const createRenderer = (Component, props) => {
  let component = Component
  const hooks = []
  let hookIndex = 0
  let propsNow = props
  let dirty = false
  let unmounted = false
  let element = null
  const queues = { effects: [], cleanups: [] }
  const errors = []

  const React = {
    createElement: (type, elProps, ...children) => ({
      type,
      props: Object.assign({}, elProps || {}, { children: flatten(children) }),
    }),
    useState(init) {
      const i = hookIndex++
      if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init
      const set = (value) => {
        if (unmounted) return
        const next = typeof value === 'function' ? value(hooks[i]) : value
        if (!Object.is(next, hooks[i])) { hooks[i] = next; dirty = true }
      }
      return [hooks[i], set]
    },
    useRef(init) {
      const i = hookIndex++
      if (!(i in hooks)) hooks[i] = { current: init }
      return hooks[i]
    },
    useEffect(fn, deps) {
      const i = hookIndex++
      const prev = hooks[i]
      const changed = !prev || !deps || !prev.deps ||
        deps.length !== prev.deps.length || deps.some((d, k) => !Object.is(d, prev.deps[k]))
      if (!changed) return
      if (prev && typeof prev.cleanup === 'function') queues.cleanups.push(prev.cleanup)
      hooks[i] = { deps, fn, cleanup: prev ? prev.cleanup : undefined }
      queues.effects.push(i)
    },
    useMemo(fn) { return typeof fn === 'function' ? fn() : fn },
    useCallback(fn) { return fn },
  }

  const render = () => {
    if (unmounted) return element
    hookIndex = 0
    dirty = false
    try {
      element = component(propsNow)
    } catch (e) {
      errors.push(e)
      throw e
    }
    return element
  }

  const runEffects = () => {
    const effects = queues.effects.splice(0)
    for (const i of effects) {
      try {
        const cleanup = hooks[i].fn()
        if (typeof cleanup === 'function') hooks[i].cleanup = cleanup
      } catch (e) { errors.push(e) }
    }
    for (const c of queues.cleanups.splice(0)) { try { c() } catch (e) { errors.push(e) } }
  }

  const flush = () => {
    let guard = 0
    render()
    runEffects()
    while (dirty && guard < 50) { guard += 1; render(); runEffects() }
    return element
  }

  const api = {
    React,
    flush,
    errors,
    hooks,
    get element() { return element },
    // The component is loaded after the renderer exists: it needs this
    // renderer's React object at module scope.
    setComponent(fn) { component = fn },
    setProps(next) { propsNow = Object.assign({}, propsNow, next); dirty = true },
    unmount() {
      for (const h of hooks) if (h && typeof h.cleanup === 'function') { try { h.cleanup() } catch (e) {} }
      unmounted = true
    },
    // Every rendered element whose className contains `cls`.
    findAll(cls) {
      const out = []
      const walk = (node) => {
        if (!node || typeof node !== 'object') return
        const cn = node.props && node.props.className
        if (typeof cn === 'string' && cn.split(/\s+/).includes(cls)) out.push(node)
        for (const c of (node.props && node.props.children) || []) walk(c)
      }
      walk(element)
      return out
    },
    // Every rendered element with this title (the toolbar buttons).
    findByTitle(title) {
      const out = []
      const walk = (node) => {
        if (!node || typeof node !== 'object') return
        if (node.props && node.props.title === title) out.push(node)
        for (const c of (node.props && node.props.children) || []) walk(c)
      }
      walk(element)
      return out
    },
    // Text of every rendered element carrying `cls`.
    texts(cls) {
      return api.findAll(cls).map((el) => flatten([el.props.children]).map((c) => (typeof c === 'string' ? c : '')).join(''))
    },
    // Text of one element (its own string children, in order).
    textOf(el) {
      return flatten([el.props.children]).map((c) => (typeof c === 'string' ? c : '')).join('')
    },
  }
  return api
}

/** Wait for promises/timers to settle: `await settle(5)` flushes microtasks. */
export const settle = (rounds = 5) => new Promise((resolve) => {
  let left = rounds
  const step = () => { left -= 1; if (left <= 0) resolve(); else setTimeout(step, 0) }
  setTimeout(step, 0)
})
