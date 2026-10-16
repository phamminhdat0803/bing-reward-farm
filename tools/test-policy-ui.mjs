// Kiểm tra cài đặt bằng cache và form; không gửi search hoặc mở browser Rewards.
import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium } from 'playwright-core'

const app = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.BRF_DEBUG_PORT ?? 9377}`)
const page = app.contexts()[0].pages().find(page => /out\/renderer|localhost/.test(page.url()))
const before = await page.evaluate(() => window.api.getAutomationPolicy())
const settingsBefore = await page.evaluate(() => window.api.getSettings())
const profiles = await page.evaluate(() => window.api.listProfiles())
assert.ok(profiles.length)
let restored = false
try {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click()
  const panel = page.locator('[data-slot="policy-settings"]')
  await panel.getByRole('heading', { name: 'Cài đặt kịch bản', exact: true }).waitFor()
  await panel.locator('[data-preset="three-searches"]').click()
  assert.equal(await panel.getByRole('spinbutton', { name: 'Tổng lượt tìm kiếm / ngày', exact: true }).inputValue(), '3')
  assert.equal(await panel.getByRole('spinbutton', { name: 'Số lượt tối đa / phiên', exact: true }).inputValue(), '3')
  await panel.locator('[data-preset="bot-reduce"]').click()
  assert.equal(await panel.getByRole('spinbutton', { name: 'Mục tiêu khi score cao (%)', exact: true }).inputValue(), '20')
  assert.equal(await panel.getByRole('switch', { name: 'Áp dụng quy tắc Bot score', exact: true }).isChecked(), true)
  await panel.getByRole('spinbutton', { name: 'Tổng lượt tìm kiếm / ngày', exact: true }).fill('3')
  const enable = panel.getByRole('switch', { name: 'Bật bộ quy tắc', exact: true })
  if (!await enable.isChecked()) await enable.click()
  await panel.getByRole('button', { name: 'Xem trước', exact: true }).click()
  await panel.locator('tbody tr').first().waitFor()
  assert.equal(await panel.locator('tbody tr').count(), profiles.length)
  assert.deepEqual(await page.evaluate(() => window.api.getAutomationPolicy()), before, 'Xem trước không tự lưu')
  await panel.locator('#policy-scope').selectOption(profiles[0].id)
  await panel.getByRole('switch', { name: 'Dùng cấu hình riêng', exact: true }).check()
  await panel.locator('[data-preset="daily-only"]').click()
  assert.equal(await panel.getByRole('switch', { name: 'Search desktop', exact: true }).isChecked(), false)
  assert.equal(await panel.getByRole('switch', { name: 'Daily set', exact: true }).isChecked(), true)
  // Lưu thử khi bộ quy tắc TẮT; chu kỳ giữ nguyên, không khởi chạy nhiệm vụ.
  if (await enable.isChecked()) await enable.click()
  await panel.getByRole('button', { name: 'Lưu cài đặt', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-slot="policy-settings"]')?.textContent?.includes('Cài đặt đã lưu'))
  const saved = await page.evaluate(() => window.api.getAutomationPolicy())
  assert.equal(saved.enabled, false)
  assert.equal(saved.defaults.maxSearchesPerDay, 3)
  assert.equal(saved.overrides[profiles[0].id].tasks.desktop, false)
  assert.equal((await page.evaluate(() => window.api.getSettings())).autoEveryMs, settingsBefore.autoEveryMs)
  const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  for (const width of [1680, 1184]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const body = panel.locator('[data-slot="scroll-area-viewport"]').first()
    await body.evaluate(el => { el.scrollTop = 0 })
    assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    await page.screenshot({ path: path.resolve(`docs/screenshot-policy-${width}.png`) })
  }
  await page.setViewportSize(originalSize)
  await page.evaluate(config => window.api.saveAutomationPolicy(config), before)
  restored = true
  console.log('PASS: 6 mẫu, 3 lượt/ngày, quy tắc 20%, cấu hình riêng, xem trước không lưu, lưu/khôi phục, không tràn ở 1184–1680px')
} finally {
  if (!restored) await page.evaluate(config => window.api.saveAutomationPolicy(config), before)
}
await page.reload()
await page.getByRole('button', { name: 'Cài đặt', exact: true }).click()
process.exit(0)
