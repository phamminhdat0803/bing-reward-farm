// "Keep earning" (/earn): cac the daily-offer gan `PUBL=RewardsDO` — click that vao the (mo tab moi)
// la duoc cong diem (do duoc 2026-10-13: 2 the +15d va 2 the +5d => +46 diem trong ~1 phut).
// The referral (/refer, referandearn) KHONG cong diem -> bo qua. Punchcard /quest/ de rieng.
import type { BrowserContext, Page } from 'playwright-core'
import { closeStrayPages, workPage } from './browser'
import { EARN_URL, readCounters } from './rewards'
import { cancellableSleep, randInt } from './logger'
import type { CoreConfig, EarnResult, Logger } from './types'

type OfferCard = {
  href: string
  text: string
  points: number | null
  /** Nguon tim thay: 'rewarddo' = PUBL=RewardsDO, 'scan' = quet rong */
  source?: 'rewarddo' | 'scan'
  /** The bi khoa boi cap do (vd "Silver level required") */
  locked: boolean
  lockReason: string | null
}

/** Doc cac the daily-offer chua hoan thanh trong muc "Keep earning" cua /earn. */
async function readOfferCards(
  page: Page
): Promise<{ cards: OfferCard[]; raw: { href: string; text: string; w: number; h: number }[] }> {
  return page.evaluate(() => {
    const norm = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim()
    const out: OfferCard[] = []
    const raw: { href: string; text: string; w: number; h: number }[] = []
    const seen = new Set<string>()

    // Ghi chu khoa cap do nam o the cha (khong nam trong <a>) nen phai doc ca container
    const LOCK =
      /(silver|gold|bronze|platinum)\s*(level)?\s*required|level\s*\d+\s*required|required\s*(silver|gold|level)|hạng\s*(bạc|vàng|đồng|kim cương)|yêu cầu\s*(cấp|hạng)|cần\s*(hạng|cấp)|đạt\s*(hạng|cấp)/i

    /**
     * Text cua the: di len toi da 3 cap nhung DUNG lai khi gap ancestor qua lon
     * (tranh lay text ca section -> nhieu the bi danh dau khoa oan).
     */
    const containerText = (a: HTMLAnchorElement): string => {
      const own = a.getBoundingClientRect()
      const ownArea = Math.max(1, own.width * own.height)
      let el: HTMLElement = a
      for (let i = 0; i < 3 && el.parentElement; i += 1) {
        const p: HTMLElement = el.parentElement
        const pr = p.getBoundingClientRect()
        if (i > 0 && pr.width * pr.height > ownArea * 6) break
        el = p
      }
      return norm(el.innerText || el.textContent).slice(0, 400)
    }

    const skip = (href: string, text: string): boolean =>
      /referandearn|\/refer\b|\/refer\?|\/quest\//i.test(href) || /completed|đã hoàn thành/i.test(text)

    const push = (a: HTMLAnchorElement, text: string, source: 'rewarddo' | 'scan'): void => {
      const href = a.href
      if (!href || seen.has(href)) return
      seen.add(href)
      const m = text.match(/\+\s*(\d{1,4})/) ?? text.match(/(\d{1,4})\s*(?:points?|điểm)/i)
      const lock = (text + ' ' + containerText(a)).match(LOCK)
      out.push({
        href,
        text: text.slice(0, 140),
        points: m ? Number(m[1]) : null,
        locked: Boolean(lock),
        lockReason: lock ? lock[0].replace(/\s+/g, ' ').trim() : null,
        source
      })
    }

    // 1) The chuan: daily offer gan PUBL=RewardsDO (VN/US) — uu tien truoc
    for (const el of Array.from(document.querySelectorAll('a[href*="PUBL=RewardsDO"]'))) {
      const a = el as HTMLAnchorElement
      const text = norm(a.innerText || a.textContent)
      if (skip(a.href, text)) continue
      push(a, text, 'rewarddo')
    }

    // 2) LUON quet rong them (truoc day chi quet khi KHONG co the PUBL nao => bo sot cac the 5 diem khac):
    //    moi the co nhan "+N" diem, kich thuoc hop ly, khong phai refer/quest/completed.
    for (const el of Array.from(document.querySelectorAll('a[href]'))) {
      const a = el as HTMLAnchorElement
      const href = a.href || ''
      if (!/^https?:/i.test(href)) continue
      const text = norm(a.innerText || a.textContent)
      if (!/\+\s*\d{1,4}/.test(text)) continue
      if (skip(href, text)) continue
      const rect = a.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (w < 60 || h < 24) continue
      raw.push({ href, text: text.slice(0, 90), w, h })
      push(a, text, 'scan')
    }

    return { cards: out, raw: raw.slice(0, 25) }
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
  /** Bao tien do ra UI: 'earn' + so the da xu ly / tong so the */
  onProgress?: (p: { kind: 'earn'; done: number; total: number; points: number | null; today: number | null; gained: number }) => void
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
      blocked: [],
      blockedPoints: 0,
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
    return { status: 'stopped', items: [], blocked: [], blockedPoints: 0, sectionBefore: null, sectionAfter: null, pointsBefore: snap.points, pointsAfter: snap.points, todayBefore: snap.todayPoints, todayAfter: snap.todayPoints }
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
    return { status: 'stopped', items: [], blocked: [], blockedPoints: 0, sectionBefore: null, sectionAfter: null, pointsBefore: snap.points, pointsAfter: snap.points, todayBefore: snap.todayPoints, todayAfter: snap.todayPoints }
  }

  const pointsBefore = snap.points
  const todayBefore = snap.todayPoints
  const sectionBefore = await readSectionProgress(page).catch(() => null)
  const cardScan = await readOfferCards(page).catch(() => ({ cards: [] as OfferCard[], raw: [] }))
  const cards = cardScan.cards
  const items: EarnResult['items'] = []

  log.info(
    `[earn] Keep earning ${sectionBefore ?? '?'} | ${cards.length} the tim thay (${cards.filter((c) => !c.locked).length} the mo duoc) | diem=${pointsBefore ?? '?'} hom-nay=${todayBefore ?? '?'}`
  )
  // Chan doan: liet ke tung the tim duoc (nguon, diem, co bi khoa khong)
  for (const c of cards.slice(0, 15)) {
    log.info(
      `[earn] the[${c.source ?? '?'}]: ${c.points ? `+${c.points}d ` : ''}${c.text.slice(0, 70)}${c.locked ? ` [KHOA: ${c.lockReason}]` : ' [MO]'}`
    )
  }
  if (cards.filter((c) => !c.locked).length === 0 && cardScan.raw.length > 0) {
    log.info(`[earn] khong co the mo duoc — ${cardScan.raw.length} ung vien co '+N' tren trang:`)
    for (const r of cardScan.raw.slice(0, 12)) {
      log.info(`[earn]   ung vien ${r.w}x${r.h}: ${r.text} | ${r.href.slice(0, 90)}`)
    }
  }

  const blocked: EarnResult['blocked'] = []
  const totalCards = cards.filter((c) => !c.locked).length
  let done = 0
  const emitEarn = (): void =>
    args.onProgress?.({
      kind: 'earn',
      done,
      total: totalCards,
      points: pointsBefore ?? null,
      today: todayBefore ?? null,
      gained: 0
    })
  emitEarn()
  for (const card of cards) {
    if (shouldStop?.()) {
      log.warn('[earn] nguoi dung dung')
      break
    }
    const label0 = (card.text || card.href).slice(0, 70)
    if (card.locked) {
      // The bi khoa cap do: khong click duoc, ghi lai de UI biet dang bi chan bao nhieu diem
      blocked.push({ label: label0, points: card.points, reason: card.lockReason ?? 'yêu cầu cấp độ' })
      log.info(
        `[earn] KHOA: ${label0}${card.points ? ` (+${card.points} điểm)` : ''} - ${card.lockReason ?? 'yêu cầu cấp độ'}`
      )
      continue
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

        // Task kieu wallpaper ("Get N points for a ... makeover"): phai CHO trang render roi bam
        // "Set as Wallpaper" moi tinh la hoan thanh (do 2026-10-14).
        const wallpaperBtn = tab
          .getByRole('button', {
            name: /set as wallpaper|set as background|use as wallpaper|đặt làm hình nền|làm hình nền/i
          })
          .first()
        let wallpaper = false
        try {
          if (await wallpaperBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
            await wallpaperBtn.click({ timeout: 8000 }).catch(() => {})
            wallpaper = true
            await cancellableSleep(1500, shouldStop)
            log.info(`[earn] wallpaper: da bam "Set as Wallpaper" sau ~${Math.round(cfg.earn.wallpaperWaitMs / 1000)}s cho`)
          } else {
            // Nut chua hien (anh con dang tao) -> cho toi wallpaperWaitMs roi bam lai
            const appeared = await wallpaperBtn
              .waitFor({ state: 'visible', timeout: cfg.earn.wallpaperWaitMs })
              .then(() => true)
              .catch(() => false)
            if (appeared) {
              await wallpaperBtn.click({ timeout: 8000 }).catch(() => {})
              wallpaper = true
              await cancellableSleep(1500, shouldStop)
              log.info('[earn] wallpaper: nut hien sau khi cho -> da bam')
            }
          }
        } catch {
          /* khong phai task wallpaper */
        }

        items.push({ label, href: card.href, points: card.points, visited: true })
        emitEarn()
        log.info(
          `[earn] da click${card.points ? ` +${card.points}d` : ''}: ${label}${opened ? ' [tab moi]' : ' [goto]'}${wallpaper ? ' + wallpaper' : ''}`
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
  const blockedPoints = blocked.reduce((sum, b) => sum + (b.points ?? 0), 0)
  log.info(
    `[earn] ket thuc: ${items.length} the | ${blocked.length} the bi khoa (${blockedPoints} diem khong kiem duoc do cap do) | Keep earning ${sectionBefore ?? '?'} -> ${sectionAfter ?? '?'} | diem ${pointsBefore ?? '?'} -> ${last?.points ?? '?'} (${gained >= 0 ? '+' : ''}${gained})`
  )

  return {
    status: items.length === 0 ? 'nothing-to-do' : gained > 0 ? 'credited' : 'visited-pending',
    items,
    blocked,
    blockedPoints,
    sectionBefore,
    sectionAfter,
    pointsBefore: pointsBefore ?? null,
    pointsAfter: last?.points ?? null,
    todayBefore: todayBefore ?? null,
    todayAfter: last?.todayPoints ?? null
  }
}
