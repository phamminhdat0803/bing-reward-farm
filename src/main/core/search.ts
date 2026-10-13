// 1 pass search: go tu khoa nhu nguoi that, nghi 15-30s, doc lai diem dinh ky.
// VN: khong co counter kieu US; diem = 3/search, tran ngay doc tu drawer breakdown.
import type { BrowserContext, Page } from 'playwright-core'
import { humanPause, humanType } from './browser'
import { fmtCounter, readCounters } from './rewards'
import { randInt, sleep } from './logger'
import type { CoreConfig, Logger, SearchPassResult } from './types'

const HOME = 'https://www.bing.com/?FORM=Z9FD1'
const BOX = '#sb_form_q'
const RESULTS = '#b_results, #b_content'

async function gotoHome(page: Page): Promise<void> {
  await page.goto(HOME, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(BOX, { timeout: 20000 }).catch(() => {})
}

async function dismissBanners(page: Page): Promise<void> {
  const sels = [
    '#bnp_btn_accept',
    '#wcpConsentBtn',
    'button:has-text("Accept")',
    'button:has-text("Chấp nhận")',
    'button:has-text("Đồng ý")'
  ]
  for (const sel of sels) {
    try {
      const l = page.locator(sel).first()
      if ((await l.count()) && (await l.isVisible())) {
        await l.click({ timeout: 2500 })
        await sleep(300)
      }
    } catch {
      /* bo qua banner */
    }
  }
}

async function doSearch(page: Page, q: string, cfg: CoreConfig): Promise<string> {
  if (!/^https?:\/\/(www\.)?bing\.com\//.test(page.url()) || page.url().includes('rewards.bing.com')) {
    await gotoHome(page)
  }
  let how = 'typed'
  try {
    await dismissBanners(page)
    const box = page.locator(BOX).first()
    await box.waitFor({ state: 'visible', timeout: 8000 })
    await box.click({ timeout: 8000 })
    await box.fill('')
    await humanType(cfg, box, q)
    await sleep(randInt(250, 800))
    await page.keyboard.press('Enter')
    await page.waitForSelector(RESULTS, { timeout: 20000 })
  } catch (e) {
    how = `url (${String((e as Error).message).split('\n')[0].slice(0, 60)})`
    await page
      .goto(`https://www.bing.com/search?q=${encodeURIComponent(q)}&FORM=QBLH`, { waitUntil: 'domcontentloaded' })
      .catch(() => {})
    await page.waitForSelector(RESULTS, { timeout: 20000 }).catch(() => {})
  }
  await sleep(randInt(900, 2200))
  await page.mouse.wheel(0, randInt(250, 1100)).catch(() => {})
  await humanPause(cfg, 'dwell')

  if (Math.random() < cfg.search.clickResultProbability) {
    const link = page.locator('#b_results h2 a').first()
    if (await link.count().catch(() => 0)) {
      await link.click({ timeout: 8000 }).catch(() => {})
      await sleep(randInt(1500, 4000))
      await page.goBack({ timeout: 15000 }).catch(() => {})
      await sleep(randInt(600, 1500))
    }
  }
  return how
}

export async function runSearchPass(args: {
  cfg: CoreConfig
  ctx: BrowserContext
  log: Logger
  kind: 'desktop' | 'mobile'
  target: number
  nextQuery: () => string
  rememberQuery: (q: string) => void
  preparePage?: (page: Page) => Promise<void>
  shouldStop?: () => boolean
}): Promise<SearchPassResult> {
  const { cfg, ctx, log, kind, target, nextQuery, rememberQuery, preparePage, shouldStop } = args
  const page = await ctx.newPage()
  page.setDefaultTimeout(30000)
  if (preparePage) await preparePage(page)

  const first = await readCounters(page, log, { quiet: true })
  if (!first.signedIn) {
    await page.close()
    return {
      kind,
      searches: 0,
      status: 'not-signed-in',
      pointsBefore: null,
      pointsAfter: null,
      todayBefore: null,
      todayAfter: null,
      counterBefore: 'n/a',
      counterAfter: 'n/a'
    }
  }

  const planned = Math.min(target, cfg.search.maxSearchesPerPass)
  const pointsBefore = first.points
  const todayBefore = first.todayPoints
  log.info(
    `[${kind}] diem=${pointsBefore ?? '?'} hom-nay=${todayBefore ?? '?'} ` +
      `streak=${fmtCounter(first.counters.search)} -> du kien ${planned} search`
  )

  if (planned <= 0) {
    log.info(`[${kind}] bo qua: muc tieu search = 0 (da dat tran hoac chua mo)`)
    await page.close()
    return {
      kind,
      searches: 0,
      status: 'max-reached',
      pointsBefore,
      pointsAfter: pointsBefore,
      todayBefore,
      todayAfter: todayBefore,
      counterBefore: fmtCounter(first.counters.search),
      counterAfter: fmtCounter(first.counters.search)
    }
  }

  let searches = 0
  let stall = 0
  let status = 'done'
  let lastPoints = pointsBefore ?? 0
  let lastToday = todayBefore ?? 0

  await gotoHome(page)

  for (let i = 0; i < planned; i += 1) {
    if (shouldStop?.()) {
      status = 'cancelled'
      log.warn(`[${kind}] nguoi dung dung - ket thuc som sau ${searches} search`)
      break
    }
    const q = nextQuery()
    try {
      const how = await doSearch(page, q, cfg)
      rememberQuery(q)
      searches += 1
      log.debug(`[${kind}] ${i + 1}/${planned}: ${q} [${how}]`)
    } catch (e) {
      log.warn(`[${kind}] loi khi search "${q}": ${String((e as Error).message).slice(0, 160)}`)
    }

    if (searches > 0 && searches % cfg.search.checkPointsEvery === 0) {
      const snap = await readCounters(page, log, { quiet: true }).catch(() => null)
      if (!snap?.signedIn) {
        status = 'check-failed'
        log.warn(`[${kind}] khong doc duoc diem giua pass`)
        continue
      }
      const pts = snap.points ?? lastPoints
      const today = snap.todayPoints ?? lastToday
      const gained = pts - lastPoints + (today - lastToday)
      log.info(
        `[${kind}] sau ${searches} search: diem=${pts} (+${pts - (pointsBefore ?? pts)}) hom-nay=${today} ` +
          `streak=${fmtCounter(snap.counters.search)}`
      )
      if (gained > 0) stall = 0
      else {
        stall += 1
        if (stall >= cfg.search.stallLimit) {
          log.warn(`[${kind}] diem khong tang sau ${stall} lan kiem tra - dung`)
          status = 'stalled'
          break
        }
      }
      lastPoints = pts
      lastToday = today
      await gotoHome(page).catch(() => {})
    }

    if (i < planned - 1) await sleep(randInt(cfg.search.minDelayMs, cfg.search.maxDelayMs))
  }

  const last = await readCounters(page, log, { quiet: true }).catch(() => null)
  await page.close()
  return {
    kind,
    searches,
    status,
    pointsBefore,
    pointsAfter: last?.points ?? null,
    todayBefore,
    todayAfter: last?.todayPoints ?? null,
    counterBefore: fmtCounter(first.counters.search),
    counterAfter: fmtCounter(last?.counters.search ?? null)
  }
}
