/**
 * A minimal fake DOM, enough to run the popout page's inline script in Node.
 *
 * The popout tab is a separate document whose tree explorer lives entirely in
 * one inline <script>. Node can parse that script (scripts/check.js does), but
 * parsing proves nothing about behaviour — the collapse-all bug this harness was
 * written for was invisible to every existing check. So the script is executed
 * here against a permissive element stub: every `getElementById` returns a real
 * (if empty) node, so the wiring runs, and the tree body can then be inspected
 * row by row.
 *
 * Deliberate limitation: the stub does NOT parse the page's HTML, so an element
 * that only exists in the markup (`.tab[data-view="tree"]`) is missing here.
 * `checkIdsExistInMarkup()` in check.js covers that gap from the other side:
 * every id the script looks up must appear in the served HTML.
 */

class ClassList {
  constructor() { this.set = new Set() }
  add(...names) { names.forEach((n) => this.set.add(String(n))) }
  remove(...names) { names.forEach((n) => this.set.delete(String(n))) }
  contains(name) { return this.set.has(String(name)) }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(String(name)) : !!force
    if (on) this.set.add(String(name)); else this.set.delete(String(name))
    return on
  }
  get value() { return [...this.set].join(' ') }
  toString() { return this.value }
}

class Style {
  constructor() { this._props = {} }
  setProperty(k, v) { this._props[k] = String(v) }
  getPropertyValue(k) { return this._props[k] || '' }
  removeProperty(k) { delete this._props[k] }
}

// Selector support: tag, #id, .class (repeatable), [attr] / [attr="value"] —
// including the doubled backslashes page.js writes into the attribute selector.
const parseSelector = (selector) => {
  const sel = String(selector).trim()
  const out = { tag: null, id: null, classes: [], attrs: [] }
  const m = /^([a-zA-Z][\w-]*)?(?:#([\w-]+))?((?:\.[\w-]+)*)((?:\[[^\]]*\])*)$/.exec(sel)
  if (!m) return null
  out.tag = m[1] ? m[1].toUpperCase() : null
  out.id = m[2] || null
  out.classes = (m[3].match(/\.[\w-]+/g) || []).map((c) => c.slice(1))
  for (const a of m[4].match(/\[[^\]]*\]/g) || []) {
    const am = /^\[([\w-]+)(?:=(["'])((?:\\.|(?!\2).)*)\2)?\]$/.exec(a)
    if (!am) return null
    const unescape = (v) => v.replace(/\\(.)/g, '$1')
    out.attrs.push([am[1], am[3] === undefined ? null : unescape(am[3])])
  }
  return out
}

const matches = (el, spec) => {
  if (!spec) return false
  if (spec.tag && el.tagName !== spec.tag) return false
  if (spec.id && el.getAttribute('id') !== spec.id) return false
  for (const c of spec.classes) if (!el.classList.contains(c)) return false
  for (const [k, v] of spec.attrs) {
    if (!el.hasAttribute(k)) return false
    if (v !== null && el.getAttribute(k) !== v) return false
  }
  return true
}

class Node {
  constructor(tag, doc) {
    this.tagName = String(tag || 'div').toUpperCase()
    this.doc = doc
    this.children = []
    this.parentNode = null
    this.attributes = Object.create(null)
    this.classList = new ClassList()
    this.style = new Style()
    this._text = ''
    this._listeners = Object.create(null)
    this.value = ''
    this.title = ''
    this.hidden = false
    this.tabIndex = -1
    this.disabled = false
  }
  get nodeType() { return 1 }
  // The standard DOM accessor a shared helper reaches for to find the document
  // it belongs to (src/shared/markdown.js uses it so the same code works in the
  // panel and in the popout page). The stub kept the document on `doc` only,
  // which silently made such a helper a no-op here.
  get ownerDocument() { return this.doc }
  get defaultView() { return this.doc && this.doc.defaultView ? this.doc.defaultView : null }
  get firstChild() { return this.children[0] || null }
  get lastChild() { return this.children[this.children.length - 1] || null }
  get childNodes() { return this.children }
  get textContent() {
    if (!this.children.length) return this._text
    return this._text + this.children.map((c) => c.textContent).join('')
  }
  set textContent(v) { this.children.length = 0; this._text = String(v == null ? '' : v) }
  get innerHTML() { return '' }
  set innerHTML(v) { this.children.length = 0; this._text = '' }
  get className() { return this.classList.value }
  set className(v) {
    this.classList = new ClassList()
    String(v || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c))
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  insertBefore(child, ref) {
    child.parentNode = this
    const at = ref ? this.children.indexOf(ref) : -1
    if (at < 0) this.children.push(child); else this.children.splice(at, 0, child)
    return child
  }
  removeChild(child) {
    const at = this.children.indexOf(child)
    if (at >= 0) { this.children.splice(at, 1); child.parentNode = null }
    return child
  }
  replaceChildren(...nodes) { this.children.length = 0; nodes.forEach((n) => this.appendChild(n)) }
  remove() { if (this.parentNode) this.parentNode.removeChild(this) }
  setAttribute(k, v) {
    if (k === 'class') { this.className = v; return }
    if (k === 'id') this.doc._registerId(String(v), this)
    this.attributes[k] = String(v)
  }
  getAttribute(k) {
    if (k === 'class') return this.classList.value
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null
  }
  hasAttribute(k) { return k === 'class' ? this.classList.set.size > 0 : Object.prototype.hasOwnProperty.call(this.attributes, k) }
  removeAttribute(k) { delete this.attributes[k] }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn) }
  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn)
  }
  // Fire the listeners registered for `type` (used by the tests to "click").
  //
  // Events BUBBLE: up the parent chain, then to the document, and
  // `stopPropagation()` stops that walk. Both matter to this plugin — the
  // popout's context menu delegates its clicks to the menu container (so a
  // button carries no listener of its own to fire) and a document-level
  // listener closes the menu, while the item's handler stops propagation so
  // that closing stays deliberate. A stub that only called the target's own
  // listeners therefore made a working delegated menu look broken.
  dispatch(type, event) {
    const ev = Object.assign({
      type, target: this, currentTarget: this, key: '', shiftKey: false, ctrlKey: false,
      metaKey: false, altKey: false, button: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0,
    }, event || {})
    const userPrevent = ev.preventDefault
    const userStop = ev.stopPropagation
    let stopped = false
    let immediate = false
    ev.preventDefault = () => { if (typeof userPrevent === 'function') userPrevent.call(ev) }
    ev.stopPropagation = () => { stopped = true; if (typeof userStop === 'function') userStop.call(ev) }
    ev.stopImmediatePropagation = () => { stopped = true; immediate = true }

    const fire = (node) => {
      ev.currentTarget = node
      // `onclick` runs before addEventListener listeners, as in a browser.
      if (type === 'click' && typeof node.onclick === 'function') {
        node.onclick(ev)
        if (immediate) return
      }
      const fns = node._listeners && node._listeners[type] ? node._listeners[type] : []
      for (const fn of fns.slice()) {
        fn(ev)
        if (immediate) return
      }
    }

    fire(this)
    for (let n = this.parentNode; n && !stopped; n = n.parentNode) fire(n)
    // The document is the top of a real event's propagation path but is not part
    // of the parentNode chain.
    if (!stopped && this.doc && this.doc !== this) fire(this.doc)
    return ev
  }
  click() { return this.dispatch('click') }
  focus() { this.doc.activeElement = this; this.dispatch('focus') }
  blur() { if (this.doc.activeElement === this) this.doc.activeElement = null }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true
    return false
  }
  closest(selector) {
    const spec = parseSelector(selector)
    for (let n = this; n; n = n.parentNode) if (n.tagName && matches(n, spec)) return n
    return null
  }
  _walk(out) {
    for (const c of this.children) { out.push(c); c._walk(out) }
    return out
  }
  querySelectorAll(selector) {
    const spec = parseSelector(selector)
    return this._walk([]).filter((el) => matches(el, spec))
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
  getBoundingClientRect() { return { x: 0, y: 0, width: 260, height: 380, top: 0, left: 0, right: 260, bottom: 380 } }
  scrollIntoView() {}
  get offsetWidth() { return 260 }
  get offsetHeight() { return 380 }
  get offsetTop() { return 0 }
  get offsetLeft() { return 0 }
  get clientWidth() { return 260 }
  get clientHeight() { return 380 }
  get scrollTop() { return 0 }
  set scrollTop(v) {}
  get dataset() {
    const attrs = this.attributes
    return new Proxy({}, {
      get: (_t, k) => {
        const key = 'data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
        return attrs[key]
      },
    })
  }
}

export const createDom = () => {
  const listeners = Object.create(null)
  const byId = new Map()
  const document = {
    documentElement: null,
    body: null,
    head: null,
    activeElement: null,
    hidden: false,
    _registerId(id, el) { byId.set(id, el) },
    getElementById(id) {
      const key = String(id)
      if (byId.has(key)) return byId.get(key)
      const el = new Node('div', document)
      el.setAttribute('id', key)
      document.body.appendChild(el)
      return el
    },
    createElement(tag) { return new Node(tag, document) },
    createElementNS(_ns, tag) { return new Node(tag, document) },
    createTextNode(text) { const n = new Node('#text', document); n._text = String(text); return n },
    querySelector(sel) { return document.body.querySelector(sel) },
    querySelectorAll(sel) { return document.body.querySelectorAll(sel) },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn) },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn) },
    dispatch(type, event) {
      const ev = Object.assign({ type, target: document, preventDefault() {}, stopPropagation() {} }, event || {})
      for (const fn of (listeners[type] || []).slice()) fn(ev)
      return ev
    },
    get _listeners() { return listeners },
  }
  document.documentElement = new Node('html', document)
  document.body = new Node('body', document)
  document.head = new Node('head', document)
  document.documentElement.appendChild(document.head)
  document.documentElement.appendChild(document.body)
  return document
}

/**
 * Run the popout page's inline scripts in a stub environment.
 *
 * `options.fetch` maps a URL to a payload; `options.storage` seeds
 * localStorage. `expose` names the functions/vars the tests need, which are
 * appended to the script as a `return {...}` (the page script is plain
 * top-level code, so this is the only way in).
 */
export const bootPage = (html, options = {}) => {
  const document = createDom()
  const store = Object.assign({}, options.storage)
  const calls = []
  const timers = []
  const wrap = (t) => { if (t && typeof t.unref === 'function') t.unref(); return t }
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
  }
  const fetchImpl = (url, init) => {
    const u = String(url)
    calls.push(u)
    let payload = { ok: false, error: 'no fixture for ' + u }
    let status = 200
    const routes = options.routes || {}
    for (const [prefix, handler] of Object.entries(routes)) {
      if (u.indexOf(prefix) === 0) {
        const out = handler(u, init)
        if (out && out.__status) { status = out.__status; payload = out.body } else payload = out
        break
      }
    }
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload)),
    })
  }
  const windowListeners = Object.create(null)
  const window = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    addEventListener: (type, fn) => { (windowListeners[type] = windowListeners[type] || []).push(fn) },
    removeEventListener: (type, fn) => { windowListeners[type] = (windowListeners[type] || []).filter((f) => f !== fn) },
    dispatch(type, event) {
      const ev = Object.assign({ type, target: window, preventDefault() {}, stopPropagation() {} }, event || {})
      for (const fn of (windowListeners[type] || []).slice()) fn(ev)
      return ev
    },
    localStorage,
    requestAnimationFrame: (fn) => wrap(setTimeout(fn, 0)),
    cancelAnimationFrame: (id) => clearTimeout(id),
  }
  const location = { search: options.search || '', href: 'http://127.0.0.1:3080/dsh-sidebar-frog', hash: '' }
  const navigator = { clipboard: { writeText: () => Promise.resolve() }, userAgent: 'node' }
  const getComputedStyle = () => ({ getPropertyValue: () => '' })

  const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\ssrc=/.test(m[1]) && m[2].trim())
  if (!blocks.length) throw new Error('no inline script in the page')
  const expose = options.expose || []
  // `extra` runs inside the page script's scope, so it can define accessors for
  // closure variables the tests need to read (the page keeps its tree state in
  // plain `var`s, not on an object).
  const body = blocks.map((m) => m[2]).join('\n;\n') +
    (options.extra ? '\n;\n' + options.extra : '') +
    (expose.length ? `\n;return {${expose.join(', ')}};` : '')
  // eslint-disable-next-line no-new-func
  const run = new Function(
    'window', 'document', 'localStorage', 'fetch', 'location', 'navigator',
    'getComputedStyle', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console',
    body,
  )
  const timersSet = []
  const wrappedSetTimeout = (fn, ms) => { const t = setTimeout(fn, ms); timersSet.push(t); return t }
  const wrappedSetInterval = (fn, ms) => { const t = setInterval(fn, ms); if (t.unref) t.unref(); timersSet.push(t); return t }
  const api = run(
    window, document, localStorage, fetchImpl, location, navigator, getComputedStyle,
    wrappedSetTimeout, clearTimeout, wrappedSetInterval, clearInterval, console,
  )
  return {
    api: api || {},
    document,
    window,
    store,
    calls,
    timers: timersSet,
    els: (id) => document.getElementById(id),
    // Visible tree rows: data-path in DOM order (what the user sees).
    rows: () => {
      const body = document.getElementById('treeBody')
      return body.querySelectorAll('.tree-row').map((el) => ({
        path: el.getAttribute('data-path'),
        depth: Number(el.getAttribute('data-depth')),
        open: el.getAttribute('aria-expanded'),
        dir: el.classList.contains('tree-dir'),
        name: (el.querySelector('.tree-name') || {}).textContent || '',
      }))
    },
    stop() { for (const t of timersSet) { clearTimeout(t); clearInterval(t) } },
  }
}
