import { chromium } from 'playwright-core'

const port = process.env.BRF_DEBUG_PORT ?? '9555'
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
await new Promise((r) => setTimeout(r, 2000))
const pages = ctx.pages()
console.log('pages:', pages.map((p) => p.url()).join(' | '))
const page = pages.find((p) => p.url().includes('localhost:5173')) ?? pages[0]
await page.bringToFront()
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(1000)

console.log('[TEST 1] Testing that calling refreshPoints on an account cleans up properly after completion...')

const res = await page.evaluate(async () => {
  return await window.api.refreshPoints(['thap-vu'])
})
console.log('[TEST 1] refreshPoints result:', res)

// Wait 800ms for React state to settle
await page.waitForTimeout(800)

// Check toolbar refresh button state
const toolbarBtn = page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true })
const isToolbarVisible = await toolbarBtn.isVisible()
console.log('[TEST 1] Toolbar button shows "Cập nhật trạng thái":', isToolbarVisible)
if (!isToolbarVisible) {
  throw new Error('FAILED: Toolbar button not visible!')
}

// Check that there is NO spinning icon inside toolbar button
const toolbarSpinning = await toolbarBtn.locator('.animate-spin').count()
console.log('[TEST 1] Spinning icon inside toolbar button count:', toolbarSpinning)
if (toolbarSpinning !== 0) {
  throw new Error('FAILED: Toolbar button still has .animate-spin icon!')
}

const isToolbarReady = await toolbarBtn.isEnabled()
console.log('[TEST 2] Toolbar button is enabled and not disabled:', isToolbarReady)

console.log('[TEST 3] Testing table row refresh buttons...')
// Table rows should not have any spinning icons
const tableSpinning = await page.locator('tbody .animate-spin').count()
console.log('[TEST 3] Table spinning icons count:', tableSpinning)
if (tableSpinning !== 0) {
  throw new Error('FAILED: Found spinning icons in table rows!')
}

console.log('[ALL REFRESH SPINNING FIX TESTS PASSED!]')
await browser.close()
