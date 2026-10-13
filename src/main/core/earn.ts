// "Keep earning" (/earn): cac the daily-offer gan `PUBL=RewardsDO` — click that vao the (mo tab moi)
// la duoc cong diem (do duoc 2026-10-13: 2 the +15d va 2 the +5d => +46 diem trong ~1 phut).
// The referral (/refer, referandearn) KHONG cong diem -> bo qua. Punchcard /quest/ de rieng.
import type { BrowserContext, Page } from 'playwright-core'
import { closeStrayPages, workPage } from './browser'
import { EARN_URL, readCounters } from './rewards'
import { cancellableSleep, randInt } from './logger'
import type { CoreConfig, EarnResult, Logger } from './types'

type OfferCard = { href: string; text: string; points: number | null }

/** Doc cac the daily-offer chua hoan thanh trong muc "Keep earning" cua /earn. */
async function readOfferCards(page: Page): Promise<OfferCard[]> {
  return page.evaluate(() => {
    const norm = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim()
    const out: OfferCard[] = []
    const seen = new Set<string>()

    const push = (href: string, text: string): void => {
      if (!href || seen.has(href)) return
      seen.add(href)
      const m = text.match(/\+\s*(\d{1,4})/) ?? text.match(/(\d{1,4})\s*(?:points?|điểm)/i)
      out.push({ href, text: text.slice(0, 140), points: m ? Number(m[1]) : null })
    }

    const skip = (href: string, text: string): boolean =>
      /referandearn|\/refer\b|\/refer\?|\/quest\//i.test(href) || /completed|đã hoàn thành/i.test(text)

    // 1) The chuan: daily offer gan PUBL=RewardsDO (VN/US)
    for (const el of Array.from(document.querySelectorAll('a[href*="PUBL=RewardsDO"]'))) {
      const a = el as HTMLAnchorElement
      const text = norm(a.innerText || a.textContent)
      if (skip(a.href, text)) continue
      push(a.href, text)
    }

    // 2) Du phong cho khu vuc khac (vd Dai Loan): the co nhan "+N" va tro toi bing.com search/spotlight
    if (out.length === 0) {
      for (const el of Array.from(document.querySelectorAll('a[href]'))) {
        const a = el as HTMLAnchorElement
        const href = a.href
        if (!/bing\.com\/(search|spotlight)\//i.test(href)) continue
        const text = norm(a.innerText || a.textContent)
        if (skip(href, text)) continue
        if (!/\+\s*\d{1,4}/.test(text)) continue
        const rect = a.getBoundingClientRect()
        if (rect.width < 80 || rect.height < 30) continue
        push(href, text)
      }
    }

    return out
  })
}

/** Doc chuoi "x/y" cua muc Keep earning (vd "5/45") de biet tien do. */
async function readSectionProgress(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const t = (document.body?.innerText || '').replace(/\s+/g, ' ')
    const m = t.match(/Keep earning\s*(\d{1,4}\s*\/\s*\d{1,4})/i)
    return m ? m[1].replace(/\s+/g, '') : null
  })
}

export async function runEarnPass(args: {
  cfg: CoreConfig
  ctx: BrowserContext
  page?: Page
  log: Logger
  shouldStop?: () => boolean
}): Promise<EarnResult> {
  const { cfg, ctx, log, shouldStop } = args
  const page = args.page ?? (await workPage(ctx))
  const ownPage = !args.page
  page.setDefaultTimeout(30000)

  let snap = await readCounters(page, log, { quiet: true })
  if (!snap.signedIn) {
    if (ownPage) await page.close()
    return {
      status: 'not-signed-in',
      items: [],
      sectionBefore: null,
      sectionAfter: null,
      pointsBefore: null,
      pointsAfter: null,
      todayBefore: null,
      todayAfter: null
    }
  }

  await page.goto(EARN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await cancellableSleep(4000, shouldStop)
  if (shouldStop?.()) {
    if (ownPage) await page.close()
    return { status: 'stopped', items: [], sectionBefore: null, sectionAfter: null, pointsBefore: snap.points, pointsAfter: snap.points, todayBefore: snap.todayPoints, todayAfter: snap.todayPoints }
  }
  // cuon het trang cho lazy-render roi ve dau
  await page
    .evaluate(async () => {
      for (let i = 0; i < 8; i += 1) {
        window.scrollBy(0, 700)
        await new Promise((r) => setTimeout(r, 300))
      }
      window.scrollTo(0, 0)
    })
    .catch(() => {})
  await cancellableSleep(1500, shouldStop)
  if (shouldStop?.()) {
    if (ownPage) await page.close()
    return { status: 'stopped', items: [], sectionBefore: null, sectionAfter: null, pointsBefore: snap.points, pointsAfter: snap.points, todayBefore: snap.todayPoints, todayAfter: snap.todayPoints }
  }

  const pointsBefore = snap.points
  const todayBefore = snap.todayPoints
  const sectionBefore = await readSectionProgress(page).catch(() => null)
  const cards = await readOfferCards(page).catch(() => [] as OfferCard[])
  const items: EarnResult['items'] = []

  log.info(
    `[earn] Keep earning ${sectionBefore ?? '?'} | ${cards.length} the kiem duoc diem | diem=${pointsBefore ?? '?'} hom-nay=${todayBefore ?? '?'}`
  )

  let done = 0
  for (const card of cards) {
    if (shouldStop?.()) {
      log.warn('[earn] nguoi dung dung')
      break
    }
    if (done >= cfg.earn.maxItems) break
    done += 1
    const label = (card.text || card.href).slice(0, 70)
    try {
      const link = page.locator(`a[href="${card.href.replace(/"/g, '\\"')}"]`).first()
      let opened: Page | null = null
      if (await link.count()) {
        ;[opened] = await Promise.all([
          ctx.waitForEvent('page', { timeout: 12000 }).catch(() => null),
          link.click({ timeout: 12000 }).catch(() => null)
        ])
      }
      const tab: Page = opened ?? (await ctx.newPage())
      try {
        if (!opened) {
          // khong mo tab moi (hoac khong tim thay the) -> mo truc tiep URL offer
          await tab.goto(card.href, { waitUntil: 'domcontentloaded' }).catch(() => {})
        } else {
          await tab.waitForLoadState('domcontentloaded').catch(() => {})
        }
        await cancellableSleep(randInt(cfg.earn.waitAfterClickMs.min, cfg.earn.waitAfterClickMs.max), shouldStop)
        items.push({ label, href: card.href, points: card.points, visited: true })
        log.info(
          `[earn] da click${card.points ? ` +${card.points}d` : ''}: ${label}${opened ? ' [tab moi]' : ' [goto]'}`
        )
      } finally {
        await tab.close().catch(() => {})
        await closeStrayPages(ctx, page)
      }
      if (shouldStop?.()) break
      await page.bringToFront().catch(() => {})
      await cancellableSleep(randInt(800, 2000), shouldStop)
    } catch (e) {
      log.warn(`[earn] loi voi "${label}": ${String((e as Error).message).slice(0, 160)}`)
      items.push({ label, href: card.href, points: card.points, visited: false })
      await closeStrayPages(ctx, page)
    }
  }

  if (!shouldStop?.()) {
    await cancellableSleep(cfg.earn.settleMs, shouldStop)
  }
  const last = shouldStop?.() ? null : await readCounters(page, log, { quiet: true }).catch(() => null)
  const sectionAfter = shouldStop?.() ? null : await readSectionProgress(page).catch(() => null)
  if (ownPage) await page.close()

  const gained = (last?.points ?? 0) - (pointsBefore ?? 0)
  log.info(
    `[earn] ket thuc: ${items.length} the | Keep earning ${sectionBefore ?? '?'} -> ${sectionAfter ?? '?'} | diem ${pointsBefore ?? '?'} -> ${last?.points ?? '?'} (${gained >= 0 ? '+' : ''}${gained})`
  )

  return {
    status: items.length === 0 ? 'nothing-to-do' : gained > 0 ? 'credited' : 'visited-pending',
    items,
    sectionBefore,
    sectionAfter,
    pointsBefore: pointsBefore ?? null,
    pointsAfter: last?.points ?? null,
    todayBefore: todayBefore ?? null,
    todayAfter: last?.todayPoints ?? null
  }
}
