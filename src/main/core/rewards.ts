// Doc diem / tien do tu Microsoft Rewards.
// BAI HOC (2026-10-13, VN):
//  - /api/getuserinfo... tra 401 KE CA khi da dang nhap => khong dung API.
//  - Trang thai dang nhap xac dinh bang cookie: _C_Auth, MSPAuth, MSPProf, WLSSC, .MSA.Auth
//  - Tran ngay nam trong drawer "Points breakdown" tren /earn (khong co API, phai click + doc DOM).
import type { BrowserContext, Page } from 'playwright-core'
import { sleep } from './logger'
import type { Logger, Progress } from './types'

export const REWARDS_URL = 'https://rewards.bing.com/'
export const DASHBOARD_URL = 'https://rewards.bing.com/dashboard'
export const EARN_URL = 'https://rewards.bing.com/earn'

const AUTH_COOKIES = ['_C_Auth', 'MSPAuth', 'MSPProf', 'WLSSC', 'RPSSecAuth', 'JWT-Session', '.MSA.Auth', 'SUID']

const num = (s: unknown): number => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0

export async function authCookieNames(ctx: BrowserContext): Promise<string[]> {
  const cookies = await ctx.cookies([
    'https://www.bing.com',
    'https://rewards.bing.com',
    'https://login.live.com'
  ])
  const names = new Set(cookies.map((c) => c.name))
  return AUTH_COOKIES.filter((n) => names.has(n))
}

/** Parser thuan tuy tren text trang dashboard. */
export function parseRewardsText(text: string): {
  points: number | null
  todayPoints: number | null
  level: string | null
  search: Progress
  dailySet: Progress
  edgeMinutes: Progress
  checkIn: Progress
  bingStar: Progress
} {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const pickPair = (label: string): Progress => {
    const m = t.match(new RegExp(`${label}\\s*:?\\s*(\\d[\\d.,]*)\\s*\\/\\s*(\\d[\\d.,]*)`, 'i'))
    return m ? { progress: num(m[1]), max: num(m[2]) } : null
  }
  const points = t.match(/Available points\s*([\d.,]+)/i)
  const today = t.match(/Today.s points\s*([\d.,]+)/i)
  const level = t.match(/(Bronze|Silver|Gold)\s*Member/i)
  return {
    points: points ? num(points[1]) : null,
    todayPoints: today ? num(today[1]) : null,
    level: level ? level[1] : null,
    search: pickPair('Search'),
    dailySet: pickPair('Activity'),
    edgeMinutes: pickPair('Minutes'),
    checkIn: pickPair('Check-in'),
    bingStar: pickPair('Earned last month')
  }
}

export type Breakdown = {
  todayPoints: number | null
  desktop: Progress
  mobile: Progress
  offers: number | null
  month: number | null
  year: number | null
  lifetime: number | null
  /** Muc "Keep earning x/y" tren /earn (the daily offer) */
  earn: Progress
}

/** Parser thuan tuy cho drawer "Points breakdown". */
export function parseBreakdownText(text: string): Breakdown {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const pair = (pattern: string): Progress => {
    const m = t.match(new RegExp(`${pattern}\\s*(\\d[\\d.,]*)\\s*\\/\\s*(\\d[\\d.,]*)`, 'i'))
    return m ? { progress: num(m[1]), max: num(m[2]) } : null
  }
  const one = (label: string): number | null => {
    const m = t.match(new RegExp(`${label}(?:\\s*Points)?\\s*:?\\s*(\\d[\\d.,]*)`, 'i'))
    return m ? num(m[1]) : null
  }

  // Desktop search: uu tien "Desktop Bing search", roi "PC search", "Tim kiem tren PC",
  // va truong hop Dai Loan / khu vuc chi hien "Bing search" (khong phai "Mobile Bing search")
  const desktop =
    pair('Desktop Bing search') ??
    pair('PC search') ??
    pair('Tìm kiếm trên PC') ??
    pair('(?<!Mobile\\s+)Bing search')

  const mobile =
    pair('Mobile Bing search') ??
    pair('Tìm kiếm trên thiết bị di động') ??
    pair('Mobile search')

  return {
    todayPoints: one("Today's points"),
    desktop,
    mobile,
    offers: one('Offers'),
    month: one('This month'),
    year: one('This year'),
    lifetime: one('Lifetime'),
    earn: pair('Keep earning')
  }
}

export function fmtCounter(c: Progress): string {
  return c ? `${c.progress}/${c.max}` : 'n/a'
}

export function remaining(c: Progress): number | null {
  if (!c) return null
  return Math.max(0, c.max - c.progress)
}

export type DashboardDom = {
  url: string
  title: string
  text: string
  links: { idx: number; href: string; text: string; target: string; reward: string | null }[]
}

async function readDashboard(page: Page): Promise<DashboardDom> {
  return page.evaluate(async () => {
    const norm = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim()
    const t0 = Date.now()
    while (Date.now() - t0 < 15000 && !/Available points/i.test(document.body?.innerText || '')) {
      await new Promise((r) => setTimeout(r, 300))
    }
    const links = Array.from(document.querySelectorAll('a[href*="bing.com/search"]')).map((a, idx) => ({
      idx,
      href: (a as HTMLAnchorElement).href,
      text: norm(a.textContent).slice(0, 90),
      target: a.getAttribute('target') || '',
      reward: (norm(a.closest('div')?.textContent || '').match(/\+(\d+)/) || [])[1] ?? null
    }))
    return {
      url: location.href,
      title: document.title,
      text: norm(document.body?.innerText || '').slice(0, 6000),
      links
    }
  }) as Promise<DashboardDom>
}

export type CountersSnapshot = {
  ok: boolean
  signedIn: boolean
  authHits: string[]
  points: number | null
  todayPoints: number | null
  level: string | null
  counters: {
    pc: Progress
    search: Progress
    dailySet: Progress
    edge: Progress
    edgeMinutes: Progress
    checkIn: Progress
    mobile: Progress
  }
  setLinks: DashboardDom['links']
  parsed: ReturnType<typeof parseRewardsText>
}

export async function readCounters(
  page: Page,
  log?: Logger,
  opts: { quiet?: boolean } = {}
): Promise<CountersSnapshot> {
  const note = (msg: string): void => (opts.quiet ? log?.debug(msg) : log?.warn(msg))
  const ctx = page.context()
  const authHits = await authCookieNames(ctx).catch(() => [])

  if (!/rewards\.bing\.com\/(dashboard|earn)/.test(page.url())) {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await sleep(1500)
  } else if (page.url().includes('/earn')) {
    await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await sleep(1200)
  }

  const dom = await readDashboard(page)
  const parsed = parseRewardsText(dom.text)
  const signedIn = authHits.length > 0 && (parsed.points !== null || /Dashboard|Earn/i.test(dom.title))
  note(
    `rewards: cookies=${authHits.join(',') || 'none'} url=${dom.url} points=${parsed.points} ` +
      `search=${fmtCounter(parsed.search)} dailyset=${fmtCounter(parsed.dailySet)} links=${dom.links.length}`
  )

  return {
    ok: parsed.points !== null,
    signedIn,
    authHits,
    points: parsed.points,
    todayPoints: parsed.todayPoints,
    level: parsed.level,
    counters: {
      pc: parsed.search,
      search: parsed.search,
      dailySet: parsed.dailySet,
      edge: parsed.edgeMinutes,
      edgeMinutes: parsed.edgeMinutes,
      checkIn: parsed.checkIn,
      mobile: null
    },
    setLinks: dom.links,
    parsed
  }
}

/** Mo drawer "Points breakdown" (nguon su that ve tran ngay) va doc DOM. */
export async function readBreakdown(page: Page, log?: Logger): Promise<Breakdown & { raw: string | null; opened: boolean }> {
  if (!page.url().includes('/earn')) {
    await page.goto(EARN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await sleep(2500)
  }
  await page.waitForSelector('text=/Points breakdown/i', { timeout: 20000 }).catch(() => {})

  let text: string | null = null
  try {
    await page.getByText('Points breakdown', { exact: false }).first().click({ timeout: 8000 })
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
    await sleep(1500)
    text = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]')
      return d ? (d as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : null
    })
  } catch (e) {
    log?.warn(`khong mo duoc drawer breakdown: ${String((e as Error).message).slice(0, 120)}`)
  }

  let fallbackToday: number | null = null
  try {
    fallbackToday = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('p')).find((x) => /Today.s points/i.test(x.textContent || ''))
      const v = p?.parentElement?.parentElement?.querySelector('p.text-pageHeader') ?? null
      return v ? Number((v.textContent || '').replace(/[^\d]/g, '')) : null
    })
  } catch {
    /* bo qua */
  }
  await page.keyboard.press('Escape').catch(() => {})

  const parsed: Breakdown = text
    ? parseBreakdownText(text)
    : { todayPoints: null, desktop: null, mobile: null, offers: null, month: null, year: null, lifetime: null, earn: null }
  if (parsed.todayPoints === null) parsed.todayPoints = fallbackToday

  // "Keep earning x/y" nam tren than trang /earn (khong nam trong drawer)
  if (!parsed.earn) {
    parsed.earn = await page
      .evaluate(() => {
        const t = (document.body?.innerText || '').replace(/\s+/g, ' ')
        const m = t.match(/Keep earning\s*(\d{1,4})\s*\/\s*(\d{1,4})/i)
        return m ? { progress: Number(m[1]), max: Number(m[2]) } : null
      })
      .catch(() => null)
  }

  log?.info(
    `breakdown: hom-nay=${parsed.todayPoints} desktop=${fmtCounter(parsed.desktop)} mobile=${fmtCounter(parsed.mobile)} ` +
      `offers=${parsed.offers} keepEarning=${fmtCounter(parsed.earn)} thang=${parsed.month} lifetime=${parsed.lifetime}`
  )
  return { ...parsed, raw: text, opened: !!text }
}
