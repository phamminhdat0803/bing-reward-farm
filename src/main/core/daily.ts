// Daily set: 3 hoat dong/ngay (~30 diem). PHAI click that vao the (mo tab moi);
// page.goto(href) KHONG duoc Rewards tinh. Sau moi the doc lai counter "Activity: x/3".
import type { BrowserContext, Page } from 'playwright-core'
import { closeStrayPages, workPage } from './browser'
import { readCounters } from './rewards'
import { cancellableSleep, randInt } from './logger'
import type { CoreConfig, DailySetResult, Logger } from './types'

export async function runDailySet(args: {
  cfg: CoreConfig
  ctx: BrowserContext
  page?: Page
  log: Logger
  shouldStop?: () => boolean
  /** Bao tien do ra UI: 'daily' + so muc da xu ly / tong so muc */
  onProgress?: (p: { kind: 'daily'; done: number; total: number; points: number | null; today: number | null; gained: number }) => void
}): Promise<DailySetResult> {
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
      activityBefore: 0,
      activityAfter: 0,
      pointsBefore: null,
      pointsAfter: null
    }
  }

  const target = snap.counters.dailySet?.max ?? 3
  const activityBefore = snap.counters.dailySet?.progress ?? 0
  const pointsBefore = snap.points
  const items: DailySetResult['items'] = []
  const tried = new Set<string>()
  let guard = 0

  log.info(`[daily] diem=${pointsBefore} Activity=${activityBefore}/${target} (${snap.setLinks.length} link)`)

  if (activityBefore >= target) {
    log.info(`[daily] daily set da hoan thanh (${activityBefore}/${target}), khong can click them`)
    if (ownPage) await page.close()
    return {
      status: 'already-completed',
      items: [],
      activityBefore,
      activityAfter: activityBefore,
      pointsBefore: pointsBefore ?? null,
      pointsAfter: pointsBefore ?? null
    }
  }

  while ((snap.counters.dailySet?.progress ?? 0) < target && guard < cfg.daily.maxItems) {
    if (shouldStop?.()) {
      log.warn('[daily] nguoi dung dung')
      break
    }
    const link = snap.setLinks.find((l) => !tried.has(l.href))
    if (!link) {
      log.warn('[daily] khong con link moi')
      break
    }
    guard += 1
    tried.add(link.href)
    const label = (link.text || link.href).slice(0, 70)
    try {
      const anchors = page.locator('a[href*="bing.com/search"]')
      const n = await anchors.count()
      let opened: Page | null = null
      if (n > link.idx) {
        ;[opened] = await Promise.all([
          ctx.waitForEvent('page', { timeout: 12000 }).catch(() => null),
          anchors.nth(link.idx).click({ timeout: 12000 }).catch(() => null)
        ])
      }
      if (!opened) {
        await page
          .evaluate((h) => {
            const a = Array.from(document.querySelectorAll('a[href]')).find(
              (x) => (x as HTMLAnchorElement).href === h
            ) as HTMLAnchorElement | undefined
            a?.click()
          }, link.href)
          .catch(() => {})
        opened = await ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null)
      }
      const tab: Page = opened ?? page
      await tab.waitForLoadState('domcontentloaded').catch(() => {})
      await cancellableSleep(randInt(cfg.daily.waitAfterClickMs.min, cfg.daily.waitAfterClickMs.max), shouldStop)
      items.push({ label, href: link.href, visited: true, reward: link.reward })
      args.onProgress?.({
        kind: 'daily',
        done: items.length,
        total: target,
        points: pointsBefore ?? null,
        today: null,
        gained: 0
      })
      log.info(`[daily] da click: ${label}${link.reward ? ` (+${link.reward})` : ''}${opened ? ' [tab moi]' : ''}`)
      if (opened) await opened.close().catch(() => {})
      await closeStrayPages(ctx, page)
      if (shouldStop?.()) break
      await page.bringToFront().catch(() => {})
      snap = await readCounters(page, log, { quiet: true })
      log.info(`[daily] -> Activity ${snap.counters.dailySet?.progress ?? '?'}/${target}`)
    } catch (e) {
      log.warn(`[daily] loi voi "${label}": ${String((e as Error).message).slice(0, 160)}`)
      items.push({ label, href: link.href, visited: false })
      await closeStrayPages(ctx, page)
    }
  }

  if (!shouldStop?.()) {
    await cancellableSleep(cfg.daily.settleMs, shouldStop)
  }
  const last = shouldStop?.() ? null : await readCounters(page, log, { quiet: true }).catch(() => null)
  const activityAfter = last?.counters.dailySet?.progress ?? activityBefore
  if (ownPage) await page.close()
  return {
    status: activityAfter > activityBefore ? 'credited' : 'visited-pending',
    items,
    activityBefore,
    activityAfter,
    pointsBefore: pointsBefore ?? null,
    pointsAfter: last?.points ?? null
  }
}
