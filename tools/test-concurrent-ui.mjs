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

console.log('[TEST] Checking UI when 1 profile starts running...')

// Start run on ke-ao (earn)
await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:start', {
    id: 'ke-ao',
    kinds: ['earn']
  })
})

await page.waitForTimeout(1200)

const diag = await page.evaluate(async () => {
  const st = await window.api.listState()
  return {
    rows: st.map((r) => ({ id: r.id, running: r.run.running })),
    buttons: Array.from(document.querySelectorAll('button')).map((b) => b.innerText || b.getAttribute('title'))
  }
})
console.log('[TEST DIAG]:', diag)

// 1. Verify toolbar still has Run button AND has Stop button
const toolbarRunBtn = page.getByRole('button', { name: /^Chạy/i }).first()
const toolbarStopBtn = page.getByRole('button', { name: /Dừng chạy/i }).first()

const isRunVisible = await toolbarRunBtn.isVisible()
const isStopVisible = await toolbarStopBtn.isVisible()

console.log('[TEST] Toolbar Run button visible while running?:', isRunVisible)
console.log('[TEST] Toolbar Stop button visible while running?:', isStopVisible)

if (!isRunVisible || !isStopVisible) {
  throw new Error('FAILED: Toolbar should display BOTH Run button and Stop button while a job is running!')
}

// 2. Verify Table action buttons
const rows = page.locator('tbody tr')
const rowCount = await rows.count()
console.log(`[TEST] Found ${rowCount} rows in table`)

// On ke-ao row, there should be a Stop button (title includes "Dừng chạy")
const stopRowBtn = page.locator('button[title="Dừng chạy tài khoản này"]')
const isStopRowBtnVisible = await stopRowBtn.first().isVisible()
console.log('[TEST] Stop button visible on running row?:', isStopRowBtnVisible)
if (!isStopRowBtnVisible) {
  throw new Error('FAILED: Running row should display Stop button!')
}

// On other rows, there should be a Play button (title includes "Chạy automation")
const otherRowPlayBtn = page.locator('button[title*="Chạy automation"]').first()
const isOtherRowPlayVisible = await otherRowPlayBtn.isVisible()
console.log('[TEST] Play button visible on other rows?:', isOtherRowPlayVisible)
if (!isOtherRowPlayVisible) {
  throw new Error('FAILED: Non-running rows should still have Run button available!')
}

// 3. Stop the running job
console.log('[TEST] Clicking Stop button on running row...')
await stopRowBtn.first().click()
await page.waitForTimeout(1500)

const stopAfter = await stopRowBtn.count()
console.log('[TEST] Stop button count after stopping (should be 0):', stopAfter)

console.log('[ALL UI CONCURRENCY TESTS PASSED!]')
await browser.close()
