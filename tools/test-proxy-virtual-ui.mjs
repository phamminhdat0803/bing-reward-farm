// Start `node tools/preview-proxy-virtual-ui.mjs` first; fixture has no real user data or network checks.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1184, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:9385')
  const rows = page.locator('[data-proxy-id]')
  const viewport = page.locator('[data-slot="table-container"] [data-slot="scroll-area-viewport"]')
  await rows.first().waitFor()
  assert.ok(await rows.count() < 40, 'Only viewport rows plus overscan should mount')
  await page.getByRole('checkbox', { name: 'Chọn tất cả proxy đang hiển thị', exact: true }).click()
  assert.equal((await page.locator('[data-slot="proxy-selection-count"]').innerText()).trim(), '1000 proxy đã chọn')
  for (const width of [1184, 1664]) {
    await page.setViewportSize({ width, height: 800 })
    for (const top of [20000, 999999]) {
      await viewport.evaluate((element, scrollTop) => { element.scrollTop = scrollTop }, top)
      await page.waitForFunction(() => {
        const viewport = document.querySelector('[data-slot="table-container"] [data-slot="scroll-area-viewport"]')
        const first = document.querySelector('[data-proxy-id]')
        const index = Number(first?.getAttribute('data-proxy-id')?.split('-')[1])
        return first?.getBoundingClientRect().height === 56 && (viewport.scrollTop > 50000 ? index > 900 : index > 300 && index < 400)
      })
      assert.ok(await rows.count() < 40)
      const measurements = await rows.evaluateAll(elements => elements.map(e => e.getBoundingClientRect().height))
      assert.ok(measurements.every(height => height === 56), JSON.stringify({width,top,measurements}))
      const offset = await viewport.evaluate(element => element.querySelector('thead').getBoundingClientRect().top - element.getBoundingClientRect().top)
      assert.ok(Math.abs(offset) <= 1, 'Header must remain sticky')
    }
    assert.equal(await page.locator('[data-proxy-id="proxy-999"]').getAttribute('data-state'), 'selected')
  }
  await page.getByPlaceholder('Tìm tên, URL, IP, quốc gia...').fill('example999.test')
  await page.waitForFunction(() => document.querySelectorAll('[data-proxy-id]').length === 1)
  assert.equal(await viewport.evaluate(e => e.scrollTop), 0)
  await page.getByRole('button', { name: 'Thao tác với Proxy 0999', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Copy chuỗi proxy', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[data-proxy-id="proxy-999"]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy chuỗi proxy', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByPlaceholder('Tìm tên, URL, IP, quốc gia...').fill('not-found')
  await page.getByText('Không có proxy nào khớp với bộ lọc hiện tại.').waitFor()
  assert.equal(await rows.count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: 1000 proxies, <40 mounted rows, 56px rows, end reached, sticky header, selection preserved, filter reset and both menus; 1184/1664px.')
} finally {
  await browser.close()
}
