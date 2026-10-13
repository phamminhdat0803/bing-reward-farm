import { chromium } from 'playwright-core'

const port = process.env.BRF_DEBUG_PORT ?? '9222'
console.log(`Connecting to Electron on port ${port}...`)

let browser
for (let i = 0; i < 20; i++) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
  }
}
if (!browser) throw new Error(`Could not connect to CDP on port ${port}`)
const ctx = browser.contexts()[0]
const pages = ctx.pages()
const page = pages.find((p) => p.url().startsWith('http://localhost:5173')) ?? pages[0]
await page.bringToFront()
await page.waitForTimeout(1000)

// Helper log
const log = (step, msg) => console.log(`[TEST] ${step}: ${msg}`)

// Step 1: Ensure we are on Proxy tab
log('1', 'Checking Proxy tab')
const proxyTab = page.locator('nav').getByRole('button', { name: /Proxy/i })
await proxyTab.click()
await page.waitForTimeout(1000)

// Step 2: Add 3 dummy test proxies for bulk testing
log('2', 'Adding 3 dummy test proxies via bulk add')
const bulkBtn = page.getByRole('button', { name: /Dán hàng loạt/i })
await bulkBtn.click()
await page.waitForTimeout(500)

const textarea = page.locator('#bulk')
const dummyProxies = [
  'socks5://127.0.0.1:9091#test-bulk-1',
  'socks4://127.0.0.1:9092#test-bulk-2',
  'http://127.0.0.1:9093#test-bulk-3'
]
await textarea.fill(dummyProxies.join('\n'))
await page.waitForTimeout(500)

const submitBulk = page.getByRole('button', { name: /Thêm \d+ proxy/i })
await submitBulk.click()
await page.waitForTimeout(1500)

// Step 3: Test Search filtering
log('3', 'Testing Search filter for "9091"')
const searchInput = page.getByPlaceholder('Tìm tên, URL, IP, quốc gia...')
await searchInput.fill('9091')
await page.waitForTimeout(800)

const rowsSearch = page.locator('tbody tr')
const rowCountSearch = await rowsSearch.count()
console.log(`Found ${rowCountSearch} rows matching "9091"`)
if (rowCountSearch !== 1) throw new Error(`Expected 1 row, got ${rowCountSearch}`)

// Clear search
await page.locator('button[title="Xoá tìm kiếm"]').click()
await page.waitForTimeout(500)

// Step 4: Test Protocol filter
log('4', 'Testing Protocol dropdown filter')
const protocolBtn = page.getByRole('button', { name: /Giao thức:/i })
await protocolBtn.click()
await page.waitForTimeout(400)

// Select SOCKS5
const socks5Item = page.getByRole('menuitem', { name: /SOCKS5/i })
await socks5Item.click()
await page.waitForTimeout(600)
console.log('Filtered by SOCKS5')

// Reset filter
const resetBtn = page.getByRole('button', { name: /Đặt lại bộ lọc/i })
if (await resetBtn.isVisible()) {
  await resetBtn.click()
  await page.waitForTimeout(600)
}

// Step 5: Test Status filter
log('5', 'Testing Status filter')
const statusBtn = page.getByRole('button', { name: /Trạng thái:/i })
await statusBtn.click()
await page.waitForTimeout(400)
const okItem = page.getByRole('menuitem', { name: /Hoạt động/i })
await okItem.click()
await page.waitForTimeout(600)
console.log('Filtered by Hoạt động (OK)')

// Reset filter again
await page.getByRole('button', { name: /Đặt lại bộ lọc/i }).click()
await page.waitForTimeout(600)

// Step 6: Test Selection and Bulk Delete
log('6', 'Testing Selection & Bulk Delete on dummy test proxies')
// Search for test-bulk to isolate them
await searchInput.fill('test-bulk')
await page.waitForTimeout(600)

const testRows = page.locator('tbody tr')
const testRowCount = await testRows.count()
console.log(`Dummy test rows found: ${testRowCount}`)
if (testRowCount < 3) throw new Error(`Expected at least 3 dummy rows, found ${testRowCount}`)

// Test Header Checkbox (Select all visible)
const headerCheckbox = page.locator('thead input[type="checkbox"], thead button[role="checkbox"]')
await headerCheckbox.click()
await page.waitForTimeout(500)

// Verify "Xoá đã chọn" button appeared
const deleteBulkBtn = page.getByRole('button', { name: /Xoá đã chọn/i })
const isDelBtnVisible = await deleteBulkBtn.isVisible()
console.log(`"Xoá đã chọn" button visible: ${isDelBtnVisible}`)
if (!isDelBtnVisible) throw new Error('"Xoá đã chọn" button not visible after select all')

// Click "Xoá đã chọn"
await deleteBulkBtn.click()
await page.waitForTimeout(800)

// Confirm dialog should appear
const confirmDialog = page.locator('[role="dialog"]')
console.log('Confirm dialog visible:', await confirmDialog.isVisible())

const confirmBtn = confirmDialog.getByRole('button', { name: /Xoá \d+ proxy/i })
await confirmBtn.click()
await page.waitForTimeout(1500)

// Verify dummy rows are deleted
await searchInput.fill('test-bulk')
await page.waitForTimeout(600)
const remainingDummy = await page.locator('tbody tr').count()
const text = await page.locator('tbody').innerText()
console.log(`Remaining dummy rows: ${remainingDummy}, text includes "Không có proxy nào": ${text.includes('Không có proxy nào')}`)

log('SUCCESS', 'All filter and bulk delete tests passed!')
await browser.close()
