import fs from 'node:fs'
import path from 'node:path'
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

console.log('[TEST 1] Triggering run for ke-ao with already-completed tasks [desktop, daily, mobile]...')
const res1 = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:start', {
    id: 'ke-ao',
    kinds: ['desktop', 'daily', 'mobile']
  })
})
console.log('[TEST 1] Response:', res1)
await page.waitForTimeout(1500)

// Check log file
const logDir = path.join(process.env.APPDATA, 'bing-reward-farm', 'logs', 'ke-ao')
const todayLog = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`)
const logContent = fs.readFileSync(todayLog, 'utf8')
const lastLines = logContent.split(/\r?\n/).slice(-10).join('\n')
console.log('[TEST 1] Last log lines:\n' + lastLines)

if (!logContent.includes('Tat ca cac task yeu cau (desktop, daily, mobile) deu da hoan thanh! Khong can chay nua.')) {
  throw new Error('TEST 1 FAILED: Did not skip completed tasks!')
}
console.log('[TEST 1] PASSED!')

console.log('[TEST 2] Triggering run for ke-ao with [desktop, daily, earn, mobile]...')
const res2 = await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:start', {
    id: 'ke-ao',
    kinds: ['desktop', 'daily', 'earn', 'mobile']
  })
})
console.log('[TEST 2] Response:', res2)
await page.waitForTimeout(2000)

const logContent2 = fs.readFileSync(todayLog, 'utf8')
if (logContent2.includes('Bat dau chay cac task con thieu: earn')) {
  console.log('[TEST 2] PASSED: Detected only "earn" is missing and only queued "earn"!')
} else {
  throw new Error('TEST 2 FAILED: Did not selectively target missing earn task!')
}

// Stop the test run
await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:stop', 'ke-ao')
})

console.log('[ALL TESTS PASSED]')
await browser.close()
