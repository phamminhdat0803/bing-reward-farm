import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const port = process.env.BRF_DEBUG_PORT ?? '9222'
let browser
for (let i = 0; i < 20; i++) {
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    break
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
  }
}

const ctx = browser.contexts()[0]
const pages = ctx.pages()
const page = pages.find((p) => p.url().startsWith('http://localhost:5173')) ?? pages[0]
await page.bringToFront()
await page.waitForTimeout(1000)

// Start run on ke-ao to show circle badge + running badge in screenshot
await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:start', {
    id: 'ke-ao',
    kinds: ['earn']
  })
})
await page.waitForTimeout(1500)

// Also open the browser dropdown so the screenshot shows "Mở trình duyệt (kèm CDP)" on 1 line
const browserDropdownBtn = page.getByTitle('Thao tác trình duyệt')
await browserDropdownBtn.click()
await page.waitForTimeout(600)

const imgBuffer = await page.screenshot()
const outDir = path.join(process.cwd(), 'docs')
const outFile = path.join(outDir, `screenshot-${Date.now()}.png`)
fs.writeFileSync(outFile, imgBuffer)
console.log(`Saved screenshot to ${outFile}`)

// Stop run
await page.keyboard.press('Escape')
await page.evaluate(async () => {
  return await window.electron.ipcRenderer.invoke('run:stop', 'ke-ao')
})
await browser.close()
