// Chỉ thao tác form nháp rồi Huỷ; không mở browser Rewards, không lưu cấu hình tài khoản.
import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium } from 'playwright-core'

const app = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.BRF_DEBUG_PORT ?? 9366}`)
const page = app.contexts()[0].pages().find(p => /out\/renderer|localhost/.test(p.url()))
assert.ok(page)
const before = await page.evaluate(() => window.api.listProfiles())
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Thêm tài khoản', exact: true }).click()
const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Thêm tài khoản', exact: true }) })
const fill = dialog.locator('[data-slot="quick-proxy-fill"]')
const input = fill.getByRole('spinbutton', { name: 'Số proxy' })
const button = fill.getByRole('button', { name: 'Gán nhanh', exact: true })
await input.scrollIntoViewIfNeeded()
for (const count of [3, 2, 1]) {
  await input.fill(String(count))
  await button.click()
  await dialog.getByText(`Proxy dự phòng (${count - 1})`, { exact: true }).waitFor()
  console.log(`PASS: ${count} tổng = 1 chính + ${count - 1} dự phòng`)
}
for (const invalid of ['0', '', '1.5']) {
  await input.fill(invalid)
  assert.equal(await button.isDisabled(), true)
}
await input.fill('2')
await dialog.getByRole('button', { name: 'Đổi proxy', exact: true }).click()
const picker = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Chọn proxy', exact: true }) })
const pickerFill = picker.locator('[data-slot="quick-proxy-fill"]')
assert.equal(await pickerFill.getByRole('spinbutton', { name: 'Số proxy' }).inputValue(), '2')
await pickerFill.getByRole('spinbutton', { name: 'Số proxy' }).fill('1')
await pickerFill.getByRole('button', { name: 'Gán nhanh', exact: true }).click()
await picker.waitFor({ state: 'hidden' })
await dialog.getByText('Proxy dự phòng (0)', { exact: true }).waitFor()
assert.equal(await input.inputValue(), '1')
await input.scrollIntoViewIfNeeded()
await page.screenshot({ path: path.resolve('docs/screenshot-proxy-quick-count.png') })
await dialog.getByRole('button', { name: 'Huỷ', exact: true }).click()
assert.deepEqual(await page.evaluate(() => window.api.listProfiles()), before)
console.log('PASS: bộ chọn đồng bộ ở hai dialog, chặn số không hợp lệ, Huỷ không thay đổi tài khoản')
process.exit(0)
