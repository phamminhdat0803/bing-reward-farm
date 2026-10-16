// Chạy app với BRF_DEBUG=9333, rồi node tools/test-rewards-summary-live.mjs.
// Mở đúng profile qua IP trực tiếp, không sửa cấu hình proxy đã lưu và không claim.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const app = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.BRF_DEBUG_PORT ?? 9333}`)
const page = app.contexts()[0].pages().find(p => /out\/renderer|localhost/.test(p.url()))
assert.ok(page, 'Không thấy cửa sổ app')
const profiles = await page.evaluate(() => window.api.listProfiles())
const proxyConfig = profiles.map(p => [p.id, p.proxy, p.proxyId, p.proxyFallbacks])
const results = []
const filterIds = process.argv.find(arg => arg.startsWith('--profiles='))?.slice('--profiles='.length).split(',')
for (const profile of process.argv.includes('--ui-only') ? [] : profiles.filter(p => !filterIds || filterIds.includes(p.id))) {
  const state = await page.evaluate(id => window.api.browserState(id), profile.id)
  assert.equal(state.running, false, `Đóng trình duyệt của ${profile.name} trước khi test trực tiếp`)
  const options = {
    headless: true,
    args: ['--no-proxy-server', `--remote-debugging-port=${profile.cdpPort}`]
  }
  if (profile.channel === 'coccoc') {
    options.executablePath = [
      path.join(process.env.LOCALAPPDATA, 'CocCoc/Browser/Application/browser.exe'),
      'C:/Program Files/CocCoc/Browser/Application/browser.exe',
      'C:/Program Files (x86)/CocCoc/Browser/Application/browser.exe'
    ].find(p => fs.existsSync(p))
    assert.ok(options.executablePath)
  } else options.channel = profile.channel
  const context = await chromium.launchPersistentContext(profile.profileDir, options)
  try {
    // App attach vào CDP này; các trình duyệt test luôn có --no-proxy-server.
    await page.evaluate(id => window.api.refreshPoints([id]), profile.id)
    const row = await page.evaluate(id => window.api.listState().then(rows => rows.find(r => r.id === id)), profile.id)
    const result = { name: profile.name, signedIn: row.cache?.signedIn, dailyStreak: row.cache?.dailyStreak, readyToClaim: row.cache?.readyToClaim, serpBotScore: row.cache?.serpBotScore, error: row.cache?.error }
    results.push(result)
    console.log(JSON.stringify(result))
    assert.equal(row.cache?.ok, true, `Không đọc được ${profile.name}`)
    assert.equal(row.cache?.signedIn, true)
    assert.ok(Object.hasOwn(row.cache, 'dailyStreak'))
    assert.ok(Object.hasOwn(row.cache, 'readyToClaim'))
    assert.ok(row.cache.serpBotScore?.checkedAt)
  } finally {
    await context.close()
  }
}
const after = await page.evaluate(() => window.api.listProfiles())
assert.deepEqual(after.map(p => [p.id, p.proxy, p.proxyId, p.proxyFallbacks]), proxyConfig)
await page.reload()
await page.getByRole('columnheader', { name: 'Daily streak', exact: true }).waitFor()
await page.getByRole('columnheader', { name: 'Ready to claim', exact: true }).waitFor()
assert.equal(await page.locator('tbody tr').first().locator('td').count(), 8)
const rows = await page.evaluate(() => window.api.listState())
for (const [i, row] of rows.entries()) {
  const cells = page.locator('tbody tr').nth(i).locator('td')
  assert.equal(await cells.nth(5).innerText(), `${row.cache.dailyStreak} ngày`)
  assert.equal(await cells.nth(6).innerText(), `${row.cache.readyToClaim} chờ nhận`)
  const botBadge = cells.nth(1).locator('[data-slot="bot-score-badge"]')
  await botBadge.waitFor()
  const score = row.cache.serpBotScore?.value
  assert.equal(await botBadge.innerText(), `Bot score ${score == null ? '—' : (score * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '%'}`)
}
await page.screenshot({ path: path.resolve('docs/screenshot-rewards-table.png') })
await page.locator('tbody tr').nth(1).click()
const summary = page.locator('[data-slot="rewards-summary"]')
await summary.waitFor({ state: 'visible' })
assert.match(await summary.innerText(), /Daily streak/)
assert.match(await summary.innerText(), /Ready to claim/)
assert.match((await summary.innerText()).replace(/\s+/g, ' '), new RegExp(`${rows[1].cache.dailyStreak} ngày liên tiếp`))
assert.match((await summary.innerText()).replace(/\s+/g, ' '), new RegExp(`${rows[1].cache.readyToClaim} chờ nhận`))
await page.locator('[data-slot="bot-score-details"]').waitFor({ state: 'visible' })
assert.match(await page.locator('[data-slot="bot-score-details"]').innerText(), /SERP bot score/)
const screenshot = path.resolve('docs/screenshot-rewards-summary.png')
await page.screenshot({ path: screenshot })
const originalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
await page.setViewportSize({ width: 1184, height: 760 })
const bounds = await summary.boundingBox()
assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1184, 'Hai card nằm trong drawer ở cửa sổ nhỏ')
assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false, 'Trang không cuộn toàn cục')
await page.keyboard.press('Escape')
const claimHeader = await page.getByRole('columnheader', { name: 'Ready to claim', exact: true }).boundingBox()
assert.ok(claimHeader.x + claimHeader.width <= 1184, 'Hai cột mới thấy ngay ở cửa sổ nhỏ')
for (const width of [1680, 1440, 1280, 1184]) {
  await page.setViewportSize({ width, height: 900 })
  const layout = await page.locator('[data-slot="accounts-table"]').evaluate(table => {
    const container = table.closest('[data-slot="table-container"]')
    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]')
    viewport.scrollLeft = 999
    const cells = [...table.querySelectorAll('tbody tr:first-child td')]
    const rect = table.getBoundingClientRect()
    return {
      tableWidth: rect.width,
      viewportWidth: viewport.clientWidth,
      contentWidth: viewport.scrollWidth,
      scrollLeft: viewport.scrollLeft,
      horizontalBars: container.querySelectorAll('[data-orientation="horizontal"]').length,
      overflowingCells: cells.map((cell, index) => ({ index, overflow: cell.scrollWidth - cell.clientWidth })).filter(c => c.overflow > 1),
      actionsVisible: [...cells.at(-1).querySelectorAll('button')].every(button => {
        const b = button.getBoundingClientRect()
        return b.left >= rect.left && b.right <= rect.right
      })
    }
  })
  assert.ok(layout.contentWidth <= layout.viewportWidth + 1, JSON.stringify({ width, ...layout }))
  assert.equal(layout.scrollLeft, 0)
  assert.equal(layout.horizontalBars, 0)
  assert.deepEqual(layout.overflowingCells, [], JSON.stringify({ width, ...layout }))
  assert.equal(layout.actionsVisible, true)
  console.log('Layout PASS:', JSON.stringify({ width, ...layout }))
  if (width === 1184) await page.screenshot({ path: path.resolve('docs/screenshot-rewards-table-compact.png') })
}
await page.setViewportSize(originalSize)
await page.locator('tbody tr').nth(1).click()
console.log('PASS: saved cache, unchanged proxy settings, 8 grouped columns, no horizontal scroll at 1184–1680px, drawer; screenshot:', screenshot)
process.exit(0)
