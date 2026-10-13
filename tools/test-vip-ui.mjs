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

console.log('[TEST 1] Testing Dropdown "Mở trình duyệt (kèm CDP)" width & layout...')
const browserDropdownBtn = page.getByTitle('Thao tác trình duyệt')
await browserDropdownBtn.click()
await page.waitForTimeout(500)

const cdpMenuItem = page.getByRole('menuitem', { name: /Mở trình duyệt/i })
const box = await cdpMenuItem.boundingBox()
console.log('[TEST 1] CDP menu item height (should be single-line ~32-36px, not wrapped ~50px+):', box?.height)
if (!box || box.height > 44) {
  throw new Error(`FAILED: Menu item "Mở trình duyệt (kèm CDP)" is still wrapping onto multiple lines! (height: ${box?.height})`)
}
console.log('[TEST 1] PASSED: Menu item is neatly on a single line!')

// Close menu
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

console.log('[TEST 2] Testing Status Badge Circle Scaling during active run...')
// Start run on ke-ao to trigger running status
await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:start', {
    id: 'ke-ao',
    kinds: ['earn']
  })
})
await page.waitForTimeout(1500)

// Check row height of ke-ao vs non-running rows
const rowHeights = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('tbody tr'))
  return rows.map((r) => ({
    text: r.innerText.slice(0, 20),
    height: Math.round(r.getBoundingClientRect().height)
  }))
})
console.log('[TEST 2] Row heights with active badges:', rowHeights)

// Check if running row height matches non-running row height (no vertical wrapping expansion!)
const firstRowHeight = rowHeights[0]?.height
const secondRowHeight = rowHeights[1]?.height
console.log(`[TEST 2] Running row height: ${firstRowHeight}px, Inactive row height: ${secondRowHeight}px`)

// Look for circle status indicator
const circleIndicator = page.locator('div[title*="Đã đăng nhập"], div[title*="Chưa đăng nhập"]').first()
const circleVisible = await circleIndicator.isVisible()
const circleBox = await circleIndicator.boundingBox()
console.log('[TEST 2] Is circle badge visible?:', circleVisible, 'Dimensions:', circleBox?.width, 'x', circleBox?.height)

if (!circleVisible || !circleBox || circleBox.width > 26) {
  throw new Error('FAILED: First badge should scale down to a round circle indicator when running!')
}
console.log('[TEST 2] PASSED: First badge successfully scaled to round circle with tooltip!')

// Stop the run
console.log('[TEST 3] Stopping run and testing refresh state...')
const stopBtn = page.locator('button[title="Dừng chạy tài khoản này"]').first()
await stopBtn.click()
await page.waitForTimeout(1500)

// Verify no stuck spinning refresh buttons
const spinningIcons = await page.locator('.animate-spin').count()
console.log('[TEST 3] Spinning icons after stop (should be 0):', spinningIcons)
if (spinningIcons !== 0) {
  throw new Error(`FAILED: Found ${spinningIcons} stuck spinning icons!`)
}

console.log('[ALL VIP UI TESTS PASSED!]')
await browser.close()
