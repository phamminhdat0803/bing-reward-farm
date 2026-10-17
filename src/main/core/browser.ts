// Mo / attach trinh duyet cho tung profile.
// - openCdpBrowser(): mo Edge THAT (co cua so) voi --remote-debugging-port => nguoi dung xem duoc,
//   va automation attach qua CDP (khong gianh profile).
// - launchPersistent(): mo profile bang playwright (khong CDP) khi khong can cua so.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium, devices } from 'playwright-core'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { cancellableSleep, pick, randInt, sleep } from './logger'
import type { CoreConfig } from './types'

export const MOBILE_DEVICES = ['Pixel 7', 'Pixel 5', 'Galaxy S9+']

export type ParsedProxy = {
  server: string
  username?: string
  password?: string
}

/**
 * Phan tich chuoi proxy:
 * - http://user:pass@host:port hoac socks5://user:pass@host:port
 * - host:port:user:pass (dinh dang pho bien tu cac nha cung cap proxy)
 * - http://host:port, socks5://host:port, host:port
 */
export function parseProxy(raw: string | null | undefined): ParsedProxy | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null

  // Dinh dang ip:port:user:pass
  const parts = s.split(':')
  if (parts.length === 4 && !s.includes('@') && !s.includes('//')) {
    const [host, port, user, pass] = parts
    return {
      server: `http://${host}:${port}`,
      username: user,
      password: pass
    }
  }

  try {
    // Ho tro http, https, socks4, socks5 (do that 2026-10-13: socks4:// chay duoc qua Playwright)
    const withScheme = /^(https?|socks4|socks5):\/\//i.test(s) ? s : `http://${s}`
    const u = new URL(withScheme)
    const server = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`
    const res: ParsedProxy = { server }
    if (u.username) res.username = decodeURIComponent(u.username)
    if (u.password) res.password = decodeURIComponent(u.password)
    return res
  } catch {
    return null
  }
}

export function findBrowserExe(channel: string): string | null {
  const local = process.env.LOCALAPPDATA || ''
  const candidates: Record<string, string[]> = {
    msedge: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    chrome: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(local, 'Google\\Chrome\\Application\\chrome.exe')
    ],
    coccoc: [
      path.join(local, 'CocCoc\\Browser\\Application\\browser.exe'),
      'C:\\Program Files\\CocCoc\\Browser\\Application\\browser.exe',
      'C:\\Program Files (x86)\\CocCoc\\Browser\\Application\\browser.exe'
    ],
    brave: [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      path.join(local, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
    ]
  }
  for (const p of candidates[channel] ?? []) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

const STEALTH = (): void => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] })
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).chrome ??= { runtime: {} }
}

function baseOptions(cfg: CoreConfig, mobile: boolean): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    headless: cfg.browser.headless,
    slowMo: cfg.browser.slowMoMs || 0,
    locale: 'vi-VN',
    timezoneId: 'Asia/Bangkok',
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      // Chan Edge tu dang nhap bang tai khoan Microsoft cua Windows (implicit sign-in)
      '--disable-features=msEdgeSidebarV2,Translate,msImplicitSignin,msaImplicitSignin,msEdgeIdentityFeature',
      '--disable-sync'
    ]
  }
  if (mobile) Object.assign(opts, devices[pick(MOBILE_DEVICES)])
  else opts.viewport = { width: 1366, height: 820 }

  const exe = cfg.browser.executablePath ?? findBrowserExe(cfg.browser.channel)
  if (exe) {
    opts.executablePath = exe
  } else if (['chrome', 'msedge', 'chromium', 'chrome-beta', 'msedge-beta', 'msedge-dev'].includes(cfg.browser.channel)) {
    opts.channel = cfg.browser.channel
  } else {
    const fallbackExe = findBrowserExe('msedge') ?? findBrowserExe('chrome')
    if (fallbackExe) opts.executablePath = fallbackExe
    else opts.channel = 'msedge'
  }

  // Chain: tu 2 proxy tro len -> dua vao --proxy-server="p1,p2" (Chromium tu fallback,
  // da do tren Edge 155). Playwright chi nhan 1 proxy nen khong dung opts.proxy khi co chain.
  const chain = (cfg.browser.proxyChain ?? []).filter(Boolean)
  if (chain.length > 1 && opts.args && !chain.some((p) => /@/.test(p))) {
    ;(opts.args as string[]).push(`--proxy-server=${chain.join(',')}`)
    opts.proxy = undefined
  }
  const parsed = parseProxy(cfg.browser.proxy)
  if (parsed) {
    opts.proxy = {
      server: parsed.server,
      username: parsed.username,
      password: parsed.password
    }
  }

  return opts
}

export type Session = {
  kind: 'local' | 'cdp'
  context: BrowserContext
  browser?: Browser
  close: () => Promise<void>
}

export async function launchPersistent(
  profileDir: string,
  cfg: CoreConfig,
  opts: { mobile?: boolean } = {}
): Promise<Session> {
  fs.mkdirSync(profileDir, { recursive: true })
  const ctx = await chromium.launchPersistentContext(profileDir, baseOptions(cfg, !!opts.mobile))
  ctx.setDefaultTimeout(30000)
  ctx.setDefaultNavigationTimeout(45000)
  await ctx.addInitScript(STEALTH)
  return { kind: 'local', context: ctx, close: async () => void (await ctx.close()) }
}

export async function attachCdp(endpoint: string): Promise<Session> {
  const browser = await chromium.connectOverCDP(endpoint)
  const ctx = browser.contexts()[0] ?? (await browser.newContext())
  ctx.setDefaultTimeout(30000)
  return {
    kind: 'cdp',
    browser,
    context: ctx,
    // KHONG goi browser.close(): se tat trinh duyet cua nguoi dung
    close: async () => {}
  }
}

export type OpenResult = { pid: number | null; cdpUrl: string; exe: string }

/** Mo trinh duyet that voi CDP de nguoi dung xem + automation attach vao. */
export function openCdpBrowser(
  profileDir: string,
  port: number,
  channel: string,
  startUrl: string,
  exeOverride?: string | null,
  proxyStr?: string | null,
  proxyChain?: string[] | null
): OpenResult {
  const exe = exeOverride ?? findBrowserExe(channel)
  if (!exe) throw new Error(`khong tim thay trinh duyet cho channel "${channel}"`)
  fs.mkdirSync(profileDir, { recursive: true })
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    // Khong cho Edge lay tai khoan Microsoft cua Windows de tu dang nhap profile moi
    '--disable-features=msImplicitSignin,msaImplicitSignin,msEdgeIdentityFeature',
    '--disable-sync'
  ]

  // Uu tien chuoi du phong: tu 2 proxy tro len thi dua ca danh sach cho Chromium tu fallback
  const chain = (proxyChain ?? []).filter(Boolean)
  const parsed = parseProxy(proxyStr)
  if (chain.length > 1 && !chain.some((p) => /@/.test(p))) {
    args.push(`--proxy-server=${chain.join(",")}`)
  } else if (parsed) {
    args.push(`--proxy-server=${parsed.server}`)
  }

  args.push(startUrl)

  const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
  child.unref()
  return { pid: child.pid ?? null, cdpUrl: `http://127.0.0.1:${port}`, exe }
}

export async function waitForCdp(endpoint: string, timeoutMs = 30000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${endpoint}/json/version`).catch(() => null)
    if (!res) return { ok: false } as never
      if (res.ok) return true
    } catch {
      /* chua len */
    }
    await sleep(500)
  }
  return false
}

export async function workPage(ctx: BrowserContext, reuse = true): Promise<Page> {
  const pages = ctx.pages()
  if (reuse) {
    const blank = pages.find((p) => p.url() === 'about:blank' || !p.url())
    if (blank) return blank
    if (pages.length > 0) return pages[0]
  }
  return ctx.newPage()
}

/** Dong moi tab about:blank hoac tab tro khong can thiet, chi giu lai 1 tab dang lam viec. */
export async function closeStrayPages(ctx: BrowserContext, keepPage?: Page): Promise<void> {
  const pages = ctx.pages()
  for (const p of pages) {
    if (keepPage && p === keepPage) continue
    if (p.url() === 'about:blank' || !p.url() || p.isClosed()) {
      await p.close().catch(() => {})
    }
  }
}

/**
 * Cuon nhu nguoi that: dua chuot vao vung noi dung roi lan NHIEU NHIP nho (60-220 px/nhip, nghi 40-160 ms),
 * thinh thoang lan lo roi keo lai, thinh thoang dung PageDown. Tra ve tong so px da cuon.
 * 2026-10-17: truoc day chi co 1 cu wheel(0, 250-1100) = lan mot phat het nua trang (khong giong nguoi),
 * va cho con tro khong nam tren vung cuon duoc thi wheel bi nuot (khong cuon gi).
 */
export async function humanScroll(
  page: Page,
  opts: { minPx?: number; maxPx?: number; shouldStop?: () => boolean; onTick?: (kind: 'wheel' | 'page') => void } = {}
): Promise<number> {
  const minPx = opts.minPx ?? 300
  const maxPx = opts.maxPx ?? 1400
  const total = randInt(Math.min(minPx, maxPx), Math.max(minPx, maxPx))
  const vp = page.viewportSize() ?? { width: 1366, height: 820 }
  // Wheel chi an khi con tro nam trong vung noi dung
  await page.mouse
    .move(
      randInt(Math.round(vp.width * 0.25), Math.round(vp.width * 0.75)),
      randInt(Math.round(vp.height * 0.3), Math.round(vp.height * 0.7))
    )
    .catch(() => {})

  const ticks = randInt(3, 8)
  let moved = 0
  for (let i = 0; i < ticks; i += 1) {
    if (opts.shouldStop?.()) break
    const remaining = Math.max(0, total - moved)
    if (remaining === 0) break
    const step = Math.min(220, Math.max(60, Math.round((remaining / (ticks - i)) * (0.7 + Math.random() * 0.6))))
    if (Math.random() < 0.1) {
      await page.keyboard.press('PageDown').catch(() => {})
      moved += Math.round(vp.height * 0.8)
      opts.onTick?.('page')
    } else {
      await page.mouse.wheel(0, step).catch(() => {})
      moved += step
      opts.onTick?.('wheel')
    }
    await sleep(randInt(40, 160))
  }

  // Thinh thoang lan lo roi keo lai (giong nguoi doc)
  if (!opts.shouldStop?.() && Math.random() < 0.15) {
    await page.mouse.wheel(0, randInt(80, 250)).catch(() => {})
    await sleep(randInt(120, 320))
    await page.mouse.wheel(0, -randInt(60, 200)).catch(() => {})
    await sleep(randInt(80, 200))
  }
  return moved
}

export async function humanPause(
  cfg: CoreConfig,
  which: 'delay' | 'dwell' = 'delay',
  shouldStop?: () => boolean
): Promise<void> {
  const range = which === 'dwell' ? cfg.search.dwellMs : { min: cfg.search.minDelayMs, max: cfg.search.maxDelayMs }
  await cancellableSleep(randInt(range.min, range.max), shouldStop)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function humanType(cfg: CoreConfig, locator: any, text: string, timeout = 8000): Promise<void> {
  await locator.click({ timeout })
  await sleep(randInt(120, 420))
  const { min, max } = cfg.search.typeDelayMs
  let i = 0
  while (i < text.length) {
    const n = randInt(3, 6)
    await locator.pressSequentially(text.slice(i, i + n), { delay: randInt(min, max) })
    i += n
    if (Math.random() < 0.35) await sleep(randInt(180, 700))
  }
}

/** Gia lap mobile bang CDP (dung cho che do attach CDP hoac local page). */
export async function newDeviceSession(page: Page): Promise<unknown> {
  const session = await page.context().newCDPSession(page)
  const deviceName = pick(MOBILE_DEVICES)
  const dev = devices[deviceName]
  const isPixel = deviceName.startsWith('Pixel')
  await session.send('Emulation.setUserAgentOverride', {
    userAgent: dev.userAgent,
    // client hints: thieu "mobile: true" thi Bing coi la desktop
    userAgentMetadata: {
      platform: 'Android',
      platformVersion: '14',
      architecture: '',
      model: isPixel ? deviceName : 'SM-G965U',
      mobile: true,
      brands: [
        { brand: 'Chromium', version: '130' },
        { brand: 'Google Chrome', version: '130' }
      ]
    }
  })
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: dev.viewport.width,
    height: dev.viewport.height,
    deviceScaleFactor: dev.deviceScaleFactor,
    mobile: true
  })
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  return session
}
