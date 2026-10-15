// Bam diem danh (check-in) trong trang Rewards cua Bing app qua WebView CDP.
// Chay: node tools/phone-checkin.mjs [port] [--dry]
import { chromium } from 'playwright-core'

const port = process.argv[2] ?? '9412'
const dry = process.argv.includes('--dry')

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const page = browser.contexts()[0].pages()[0]
await page.waitForTimeout(1200)

const state = async () =>
  page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
    const points = (document.body.innerText.match(/(\d[\d.,]*)\s*điểm/) || [])[1] ?? null
    const active = document.querySelector('.streak-card-wrapper.active')
    const cells = [...document.querySelectorAll('.streak-card-wrapper')].map((el) => ({
      cls: String(el.className),
      value: clean(el.innerText)
    }))
    const today = (document.body.innerText.match(/Điểm hôm nay\s*([\d/]+)/) || [])[1] ?? null
    return { points, today, hasActive: !!active, cells }
  })

const before = await state()
console.log('=== TRUOC ===')
console.log('diem:', before.points, '| hom nay:', before.today, '| co o active:', before.hasActive)
console.log('cac o:', JSON.stringify(before.cells))

if (!before.hasActive) {
  console.log('=> Hom nay khong con o nao active (co the da diem danh roi).')
  process.exit(0)
}
if (dry) {
  console.log('=> --dry: khong bam.')
  process.exit(0)
}

const box = await page.evaluate(() => {
  const el = document.querySelector('.streak-card-wrapper.active')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
console.log('=== BAM vao o active tai', JSON.stringify(box), '===')
await page.mouse.click(box.x, box.y)
await page.waitForTimeout(6000)

const after = await state()
console.log('=== SAU ===')
console.log('diem:', after.points, '| hom nay:', after.today, '| con o active:', after.hasActive)
console.log('cac o:', JSON.stringify(after.cells))
const toast = await page.evaluate(() =>
  [...document.querySelectorAll('[class*="toast"],[class*="Toast"],[class*="message"],[role="alert"]')]
    .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5)
)
console.log('thong bao:', JSON.stringify(toast))
process.exit(0)
