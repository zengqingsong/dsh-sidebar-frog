/**
 * Scratch probe: the Markdown rendering work, against the GUI the user is
 * looking at (a running `dsh web`).
 *
 *   node scripts/_probe-md.js [url] [check|skin]
 *
 *  check — the README's badge links and <picture> logo block render, and the
 *          document-relative images actually LOAD (through /media).
 *  skin  — the document skin setting reaches a rendered document: the picker in
 *          the settings panel, the injected stylesheet, and the root's class.
 */
import { launch } from './cdp.js'
import { readSecret, mintCookie } from '../../../dsh-classroom/tools/auth.js'

const url = process.argv[2] || 'http://127.0.0.1:3080/'
const phase = process.argv[3] || 'check'
const wanted = process.argv[4] || 'github'
const cookie = mintCookie('127.0.0.1:3080', readSecret())

const s = await launch({ width: 1600, height: 950 })
if (!s) { console.error('no browser'); process.exit(3) }
const errors = []
s.on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)))
s.on('Runtime.consoleAPICalled', (p) => {
  const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
  if (p.type === 'error') errors.push('ERR ' + text)
})
const log = (...a) => console.log(...a)
const wait = (ms) => s.wait(ms)
const ev = (expr) => s.evaluate(expr)

const loadApp = async () => {
  await s.waitFor('document.readyState === "complete"', { timeout: 30000, label: 'load' })
  await wait(6000)
  await ev(`(() => {
    for (const w of ['继续', '跳过', '开始使用', '知道了']) {
      const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === w)
      if (el) { el.click(); return w }
    }
    return null
  })()`)
  await wait(1500)
}
const clickText = (text) => ev(`(() => {
  const want = ${JSON.stringify(text)}
  const candidates = [...document.querySelectorAll('button,a,[role="button"],[role="tab"],li')]
    .filter((n) => (n.innerText || '').trim() === want)
  const el = candidates[0] || [...document.querySelectorAll('*')]
    .filter((n) => (n.innerText || '').trim() === want)
    .sort((a, b) => a.innerText.length - b.innerText.length)[0]
  if (!el) return null
  el.click()
  return want
})()`)
const openColumn = () => ev(`(() => {
  const ours = document.querySelector('[data-frog-footer="files"]')
  if (ours) { ours.click(); return 'frog-footer' }
  const shell = document.querySelector('[aria-label="打开右侧边栏"]')
  if (shell) { shell.click(); return 'shell-expand' }
  return null
})()`)
const openReadme = async () => {
  const p = await ev(`(() => {
    const row = [...document.querySelectorAll('[data-path]')].find((r) => /README\\.md$/i.test(r.getAttribute('data-path')))
    if (!row) return null
    row.click()
    return row.getAttribute('data-path')
  })()`)
  await wait(6000)
  return p
}
const skinState = () => ev(`(() => {
  const root = document.querySelector('.artifacts-markdown')
  const styleEl = document.getElementById('dsh-sidebar-frog-skin')
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const h1 = cs(root ? root.querySelector('h1') : null)
  const img = cs(root ? root.querySelector('img') : null)
  return {
    rootClass: root ? root.className : null,
    stored: localStorage.getItem('dsh-sidebar-frog:settings'),
    tag: !!styleEl,
    githubCss: styleEl ? styleEl.textContent.indexOf('.md-skin-github h1') >= 0 : false,
    h1Border: h1 ? h1.borderBottomStyle + ' ' + h1.borderBottomWidth : null,
    imgDisplay: img ? img.display : null,
  }
})()`)

try {
  await s.send('Network.enable')
  await s.send('Network.setCookie', { name: cookie.name, value: cookie.value, url })
  await s.navigate(url)
  await loadApp()

  if (phase === 'skin') {
    // 1. The picker, in the settings panel, exactly where a user finds it.
    await clickText('设置')
    await wait(2500)
    await clickText('可弹出式侧边栏')
    await wait(1500)
    log('picker: ' + JSON.stringify(await ev(`(() => {
      const chips = [...document.querySelectorAll('.artifacts-chip[data-frog-skin]')]
      return chips.length
        ? {
          found: true,
          chips: chips.map((c) => c.getAttribute('data-frog-skin') + (c.classList.contains('is-on') ? '(on)' : '')),
          pressed: chips.filter((c) => c.getAttribute('aria-pressed') === 'true').length,
        }
        : { found: false, titles: [...document.querySelectorAll('.artifacts-settitle')].map((n) => n.innerText.trim()) }
    })()`)))
    // 2. The click a user makes on one skin chip: a real click through the input
    //    pipeline, at the chip's own centre (scrolled into view first — this
    //    section sits below the fold, and a click at an off-screen y hits nothing).
    await ev(`(() => {
      const el = document.querySelector('.artifacts-chip[data-frog-skin=${JSON.stringify(wanted)}]')
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' })
      return true
    })()`)
    await wait(600)
    const box = await s.center('.artifacts-chip[data-frog-skin=' + JSON.stringify(wanted) + ']')
    log('chip box: ' + JSON.stringify(box))
    if (box) {
      await s.click(box.x, box.y)
      await wait(1000)
    }
    log('after click → ' + JSON.stringify(await ev(`(() => {
      const chips = [...document.querySelectorAll('.artifacts-chip[data-frog-skin]')]
      const styleEl = document.getElementById('dsh-sidebar-frog-skin')
      return {
        stored: localStorage.getItem('dsh-sidebar-frog:settings'),
        marked: chips.filter((c) => c.classList.contains('is-on')).map((c) => c.getAttribute('data-frog-skin')),
        styleTag: !!styleEl,
        css: styleEl ? styleEl.textContent.slice(0, 42) : '',
      }
    })()`)))
    // 3. The rendered document wears the skin.
    await ev(`(() => {
      const el = document.querySelector('[aria-label="关闭"]') || [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === '关闭')
      if (el) el.click()
      return !!el
    })()`)
    await wait(1200)
    await openColumn()
    await wait(2500)
    await openReadme()
    log('document: ' + JSON.stringify(await skinState()))
  } else {
    await openColumn()
    await wait(2500)
    log('README → ' + JSON.stringify(await openReadme()))
    log('DOM: ' + JSON.stringify(await ev(`(() => {
      const root = document.querySelector('.artifacts-markdown')
      if (!root) return { markdown: false }
      return {
        pictures: root.querySelectorAll('picture').length,
        sources: [...root.querySelectorAll('picture source')].map((s) => ({ media: s.getAttribute('media'), srcset: (s.getAttribute('srcset') || '').slice(0, 90) })),
        images: [...root.querySelectorAll('img')].slice(0, 6).map((i) => ({
          src: (i.getAttribute('src') || '').slice(0, 90), w: i.naturalWidth, h: i.naturalHeight, inLink: !!i.closest('a'),
        })),
        escaped: (root.innerHTML.match(/&lt;(picture|source)/g) || []).length,
        leaks: /(^|[^\\w])A\\d+([^\\w]|$)/.test(root.innerText || ''),
      }
    })()`), null, 1))
  }

  log('--- console errors ---')
  log(errors.slice(0, 20).join('\n') || '(none)')
  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-md.png')
} catch (e) {
  log('FAILED: ' + (e && e.message))
  log(errors.slice(0, 20).join('\n') || '(none)')
} finally {
  await s.close()
}
