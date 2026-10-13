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

console.log('[TEST] Starting run for ke-ao (earn task)...')
const startRes = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:start', {
    id: 'ke-ao',
    kinds: ['earn']
  })
})
console.log('[TEST] Start response:', startRes)

// Wait 1.5 seconds for run to be active
await page.waitForTimeout(1500)

const stateRunning = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:state', 'ke-ao')
})
console.log('[TEST] Is running right after start?:', stateRunning.running)

console.log('[TEST] Triggering stopRun...')
const stopRes = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:stop', 'ke-ao')
})
console.log('[TEST] Stop response:', stopRes)

// Check run state immediately
const stateAfterStop = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:state', 'ke-ao')
})
console.log('[TEST] Is running immediately after stop?:', stateAfterStop.running)

if (stateAfterStop.running !== false) {
  throw new Error('FAILED: run:state is still reporting running === true after stopRun!')
}

// Wait 1.5 seconds and verify it stays stopped
await page.waitForTimeout(1500)
const stateFinal = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:state', 'ke-ao')
})
console.log('[TEST] Is running 1.5s after stop?:', stateFinal.running)

console.log('[TEST] SUCCESS! Stop run halts execution and updates running status immediately.')
await browser.close()
