// Probe trang Rewards trong Bing app (WebView da bat debugging).
// Chay: node tools/phone-rewards.mjs [port]   (mac dinh 9412)
// KHONG goi browser.close() — se tat WebView cua app dang chay.
import { chromium } from 'playwright-core'

const port = process.argv[2] ?? '9412'
const mode = process.argv[3] ?? 'dump'

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const ctx = browser.contexts()[0]
const pages = ctx.pages()
console.log('=== targets ===')
for (const p of pages) console.log('-', p.url().slice(0, 140))

const page = pages[0]
if (!page) {
  console.log('khong co page nao')
  process.exit(0)
}
await page.waitForTimeout(1200)

const info = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const text = clean(document.body.innerText)
  const clickable = [...document.querySelectorAll('button, [role="button"], a, [class*="button"], [class*="Button"]')]
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      text: clean(el.innerText).slice(0, 70),
      cls: String(el.className || '').slice(0, 80)
    }))
    .filter((x) => x.text)
  return { url: location.href, text, clickable: clickable.slice(0, 60) }
})

console.log('=== url ===')
console.log(info.url)
console.log('=== text (1800 ky tu dau) ===')
console.log(info.text.slice(0, 1800))
console.log('=== phan tu bam duoc ===')
for (const c of info.clickable) console.log(`[${c.tag}] "${c.text}"  .${c.cls}`)

if (mode === 'days') {
  const days = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const out = []
    for (const el of document.querySelectorAll('*')) {
      const t = clean(el.textContent)
      if (!/^Day \d$/.test(t)) continue
      const chain = []
      let cur = el
      for (let i = 0; i < 4 && cur; i += 1) {
        chain.push(
          `${cur.tagName.toLowerCase()}.${String(cur.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`
        )
        cur = cur.parentElement
      }
      const cell = el.closest('li,button,[class*="day"],[class*="Day"]') || el.parentElement
      const r = (cell || el).getBoundingClientRect()
      out.push({
        text: t,
        chain: chain.join(' < '),
        cellClass: cell ? String(cell.className || '') : null,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        cellText: cell ? clean(cell.textContent).slice(0, 40) : ''
      })
    }
    return out
  })
  console.log('=== cac o Day ===')
  for (const d of days) console.log(JSON.stringify(d))
}

if (mode === 'checkin') {
  const before = await page.evaluate(() => (document.body.innerText.match(/(\d[\d.,]*)\s*điểm/) || [])[1] ?? null)
  const r = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
    for (const el of document.querySelectorAll('*')) {
      if (!/^Day 1$/.test(clean(el.textContent))) continue
      const cell = el.closest('li,button,[class*="day"],[class*="Day"]') || el.parentElement
      const target = cell || el
      target.click()
      const rect = target.getBoundingClientRect()
      return { ok: true, cls: String(target.className || ''), rect: { x: Math.round(rect.x), y: Math.round(rect.y) } }
    }
    return { ok: false, error: 'khong thay o Day 1' }
  })
  console.log('=== bam diem danh ===')
  console.log(JSON.stringify(r))
  console.log('diem truoc:', before)
  await page.waitForTimeout(5000)
  const after = await page.evaluate(() => ({
    points: (document.body.innerText.match(/(\d[\d.,]*)\s*điểm/) || [])[1] ?? null,
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600)
  }))
  console.log('diem sau:', after.points)
  console.log('text sau:', after.text)
}

process.exit(0)
