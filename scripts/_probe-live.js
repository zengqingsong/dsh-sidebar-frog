/**
 * Scratch probe (not part of the suite): drive the GUI the USER is looking at
 * (a running `dsh web`) with a real browser, so a failure that only exists in
 * the real shell can be seen instead of guessed at.
 *
 *   node scripts/_probe-live.js [url] [takeover|products|boot]
 *
 * Auth: `dsh web` answers 401 without its signed browser-session cookie. The
 * cookie is re-minted from the secret in `$DSH_HOME/.credentials.yaml` with the
 * helper the classroom project already reverse-engineered, so the running
 * server is NOT touched or restarted.
 */
import { launch } from './cdp.js'
import { readSecret, mintCookie, authorityOf } from '../../../dsh-classroom/tools/auth.js'

const url = process.argv[2] || 'http://127.0.0.1:3080/'
const phase = process.argv[3] || 'takeover'

const cookie = mintCookie(authorityOf(url), readSecret())
const s = await launch({ width: 1600, height: 950 })
if (!s) {
  console.error('no browser')
  process.exit(3)
}
const errors = []
s.on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)))
s.on('Runtime.consoleAPICalled', (p) => {
  const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
  if (p.type === 'error') errors.push('ERR ' + text)
})

const log = (...a) => console.log(...a)
const wait = (ms) => s.wait(ms)
const evaluate = (expr) => s.evaluate(expr)

const dump = async (label) => {
  const info = await evaluate(`(() => {
    const txt = (el) => (el ? (el.innerText || el.getAttribute('aria-label') || '').trim() : null)
    return {
      notice: txt(document.querySelector('.artifacts-notice-pill')),
      treeRows: document.querySelectorAll('[data-path]').length,
      ourTree: !!document.querySelector('.artifacts-tree'),
      productTree: document.querySelectorAll('[data-files-entry]').length,
      frogFooter: document.querySelectorAll('[data-frog-footer]').length,
      tabChips: [...document.querySelectorAll('[role="tab"]')].map(txt).filter(Boolean),
      columnState: [...document.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).filter((v) => v && v.indexOf('侧边栏') >= 0),
    }
  })()`)
  log('=== ' + label + ' === ' + JSON.stringify(info))
  return info
}

const installRecorder = () => evaluate(`(() => {
  window.__notes = []
  window.__tabs = []
  const snap = () => {
    const pill = document.querySelector('.artifacts-notice-pill')
    if (pill) {
      const t = (pill.innerText || '').trim()
      if (t && window.__notes[window.__notes.length - 1] !== t) window.__notes.push(t)
    }
    const chips = [...document.querySelectorAll('[role="tab"]')].map((e) => (e.innerText || '').trim()).filter(Boolean)
    if (chips.length && window.__tabs[window.__tabs.length - 1] !== chips.join('|')) window.__tabs.push(chips.join('|'))
  }
  snap()
  new MutationObserver(snap).observe(document.body, { childList: true, subtree: true, characterData: true })
  return true
})()`)

const notes = () => evaluate('window.__notes || []')
const chips = () => evaluate('window.__tabs || []')
const layoutStores = () => evaluate(`(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (k && k.indexOf('sidebar-right') >= 0) out[k.slice(-12)] = String(localStorage.getItem(k)).slice(0, 700)
  }
  return out
})()`)

const loadApp = async () => {
  await s.waitFor('document.readyState === "complete"', { timeout: 30000, label: 'load' })
  await wait(6000)
  await evaluate(`(() => {
    const want = ['继续', '跳过', '开始使用', '知道了']
    for (const w of want) {
      const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === w)
      if (el) { el.click(); return w }
    }
    return null
  })()`)
  await wait(1500)
}

try {
  await s.send('Network.enable')
  await s.send('Network.setCookie', { name: cookie.name, value: cookie.value, url })
  if (phase === 'products') {
    await s.navigate(url)
    await loadApp()
    await evaluate(`localStorage.setItem('dsh-sidebar-frog:settings', JSON.stringify({ nativeFileTree: false }))`)
  }
  await s.navigate(url)
  await loadApp()
  await dump('loaded')

  if (phase === 'boot') {
    log('entry ids: ' + JSON.stringify(await evaluate('window.__DSH_BOOT__.entries.map((e) => e.id)')))
    log('batches: ' + JSON.stringify(await evaluate('window.__DSH_BOOT__.batches')))
  } else {
    await installRecorder()
    log('boot rev: ' + JSON.stringify(await evaluate('window.__DSH_BOOT__.rev')))

    const opened = await evaluate(`(() => {
      const ours = document.querySelector('[data-frog-footer="files"]')
      if (ours) { ours.click(); return 'frog-footer' }
      const shell = document.querySelector('[aria-label="打开右侧边栏"]')
      if (shell) { shell.click(); return 'shell-expand' }
      return null
    })()`)
    log('column open → ' + JSON.stringify(opened))
    await wait(2500)
    await dump('column-open')

    // The product column seeds its GUIDE page; open the 工作区文件 capsule from it.
    const guide = await evaluate(`(() => {
      const all = [...document.querySelectorAll('*')]
        .filter((el) => /^(工作区文件|文件)$/.test((el.innerText || '').trim()))
        .filter((el) => el.offsetParent !== null)
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect()
          return ra.width * ra.height - rb.width * rb.height
        })
      if (!all.length) return { found: 0 }
      all[0].click()
      return { tag: all[0].tagName, text: (all[0].innerText || '').trim(), found: all.length }
    })()`)
    log('guide click → ' + JSON.stringify(guide))
    await wait(2500)
    await dump('after-guide-click')

    const clicked = await evaluate(`(() => {
      const ours = [...document.querySelectorAll('[data-path]')].find((r) => !r.classList.contains('artifacts-tree-dir'))
      if (ours) { ours.click(); return { which: 'ours', path: ours.getAttribute('data-path') } }
      const prod = document.querySelector('[data-files-entry="file"]')
      if (prod) { prod.click(); return { which: 'product', path: prod.getAttribute('data-files-path') } }
      return null
    })()`)
    log('file click → ' + JSON.stringify(clicked))
    await wait(700)
    await dump('after-click')
    log('notices: ' + JSON.stringify(await notes()))
    log('tab chips: ' + JSON.stringify(await chips()))
    await wait(2500)
    log('notices(later): ' + JSON.stringify(await notes()))
    log('tab chips(later): ' + JSON.stringify(await chips()))
    log('layouts: ' + JSON.stringify(await layoutStores()))
    log('page after click: ' + JSON.stringify(await evaluate('(document.body.innerText || "").slice(0, 900)')))

    // The other consumer of the same session read: @引用 into the composer.
    await evaluate(`(() => {
      const chip = [...document.querySelectorAll('[role="tab"]')].find((e) => (e.innerText || '').trim() === '文件')
      if (chip) chip.click()
      return !!chip
    })()`)
    await wait(1500)
    const quoted = await evaluate(`(() => {
      const row = [...document.querySelectorAll('[data-path]')].find((r) => !r.classList.contains('artifacts-tree-dir'))
      if (!row) return null
      const btn = row.querySelector('.artifacts-tree-ref')
      if (!btn) return 'no-ref-button'
      btn.click()
      return 'clicked'
    })()`)
    log('@引用 → ' + JSON.stringify(quoted))
    await wait(900)
    log('notices(@引用): ' + JSON.stringify(await notes()))
    log('composer draft: ' + JSON.stringify(await evaluate(
      'String((document.querySelector("textarea") || {}).value || "").slice(0, 120)')))

    // The README itself, through the shell's document tab (which uses OUR lent
    // Markdown renderer for .md): the badge links and the <picture> logo block.
    await evaluate(`(() => {
      const chip = [...document.querySelectorAll('[role="tab"]')].find((e) => (e.innerText || '').trim() === '文件')
      if (chip) chip.click()
      return !!chip
    })()`)
    await wait(1200)
    const readme = await evaluate(`(() => {
      const row = [...document.querySelectorAll('[data-path]')].find((r) => /README\\.md$/i.test(r.getAttribute('data-path')))
      if (!row) return null
      row.click()
      return row.getAttribute('data-path')
    })()`)
    log('README click → ' + JSON.stringify(readme))
    await wait(4000)
    const dom = await evaluate(`(() => {
      const root = document.querySelector('.artifacts-markdown')
      if (!root) return { markdown: false, body: (document.body.innerText || '').slice(0, 200) }
      const pics = [...root.querySelectorAll('picture')]
      const imgs = [...root.querySelectorAll('img')]
      return {
        markdown: true,
        pictures: pics.length,
        sources: pics.map((p) => {
          const s = p.querySelector('source')
          return s ? { media: s.getAttribute('media'), srcset: s.getAttribute('srcset') } : null
        }),
        images: imgs.slice(0, 6).map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight, inLink: !!i.closest('a') })),
        escapedTags: (root.innerHTML.match(/&lt;picture|&lt;source/g) || []).length,
        tokenLeak: (root.innerHTML.match(/\\u0001|\\u0002/g) || []).length,
        tokenText: /(^|[^\\w])A\\d+([^\\w]|$)/.test(root.innerText || ''),
      }
    })()`)
    log('README DOM: ' + JSON.stringify(dom, null, 1))
  }

  log('--- console errors ---')
  log(errors.slice(0, 30).join('\n') || '(none)')
  await s.screenshot('D:/ai/dsh-plugin/dsh-sidebar-frog/dsh-sidebar-frog/docs/_probe-live.png')
} catch (e) {
  log('FAILED: ' + (e && e.message))
  log(errors.slice(0, 30).join('\n') || '(none)')
} finally {
  await s.close()
}
