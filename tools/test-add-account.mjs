#!/usr/bin/env node
// Test tu dong: mo hop "Them tai khoan" va kiem tra xem go duoc vao input khong.
// Chay: BRF_DEBUG=9222 npm run dev  (cua so rieng)  ->  node tools/test-add-account.mjs
import { chromium } from 'playwright-core'

const port = process.env.BRF_DEBUG_PORT ?? '9222'
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const ctx = browser.contexts()[0]
const pages = ctx.pages()
console.log(
  'pages:',
  pages.map((p) => p.url()).join(' | ')
)
const page = pages.find((p) => p.url().startsWith('http://localhost:5173')) ?? pages[0]
await page.bringToFront()

// 1. Mo hop them tai khoan
const addBtn = page.getByRole('button', { name: /Thêm tài khoản/ }).first()
console.log('nut Them tai khoan:', (await addBtn.count()) > 0)
await addBtn.click()
await page.waitForTimeout(1200)

const dlg = page.locator('[role="dialog"]').first()
console.log('dialog hien:', await dlg.isVisible().catch(() => false))

// 2. Chan doan lop phu tai vi tri input
const diag = await page.evaluate(() => {
  const input = document.querySelector('#a-name')
  if (!input) return { error: 'khong thay #a-name' }
  const r = input.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const top = document.elementFromPoint(cx, cy)
  const chain = (el) => {
    const out = []
    let cur = el
    while (cur && out.length < 6) {
      out.push(`${cur.tagName.toLowerCase()}${cur.id ? '#' + cur.id : ''}${cur.className ? '.' + String(cur.className).split(' ').slice(0, 3).join('.') : ''}`)
      cur = cur.parentElement
    }
    return out
  }
  return {
    inputRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    topElement: top ? chain(top) : null,
    isInputOnTop: top === input,
    disabled: input.disabled,
    readOnly: input.readOnly,
    pointerEvents: getComputedStyle(input).pointerEvents,
    dialogZ: (() => {
      const d = document.querySelector('[role="dialog"]')
      const o = document.querySelector('[data-slot="dialog-overlay"]')
      return { dialog: d ? getComputedStyle(d).zIndex : null, overlay: o ? getComputedStyle(o).zIndex : null }
    })()
  }
})
console.log('chan doan:', JSON.stringify(diag, null, 2))

// 3. Thu go that
try {
  await page.click('#a-name', { timeout: 4000 })
  const focused = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName)
  console.log('activeElement sau click:', focused)
  await page.keyboard.type('Test acc 003', { delay: 40 })
  const val = await page.inputValue('#a-name', { timeout: 3000 })
  console.log('gia tri sau khi go:', JSON.stringify(val))
  console.log(val === 'Test acc 003' ? 'KET QUA: GO DUOC ✔' : 'KET QUA: KHONG GO DUOC ✘')
} catch (e) {
  console.log('loi khi go:', String(e.message).slice(0, 200))
}

await browser.close().catch(() => {})
