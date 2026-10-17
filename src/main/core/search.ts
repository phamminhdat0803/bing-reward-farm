// 1 pass search: go tu khoa nhu nguoi that, nghi 15-30s, doc lai diem dinh ky.
// VN: khong co counter kieu US; diem = 3/search, tran ngay doc tu drawer breakdown.
import type { BrowserContext, Page } from 'playwright-core'
import { humanPause, humanType, workPage } from './browser'
import { fmtCounter, readCounters } from './rewards'
import { cancellableSleep, randInt, sleep } from './logger'
import type { CoreConfig, Logger, SearchPassResult, SearchProgress } from './types'

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

/** Ham THUAN de test duoc (khong can trinh duyet): url + text + co marker captcha hay khong. */
export function looksLikeRestriction(input: { url: string; text: string; hasMarkup: boolean }): boolean {
  // CHI soi host + path, KHONG soi query — neu khong thi tu khoa "captcha la gi" se bi coi la trang xac minh.
  try {
    const u = new URL(input.url)
    const host = u.hostname.toLowerCase()
    if (host.startsWith('consent.') || /challenge|captcha/i.test(host)) return true
    if (/\/(challenge|verify|sorry|captcha|blocked|error)(\/|$)/i.test(u.pathname)) return true
  } catch {
    /* url khong hop le -> bo qua phan url */
  }
  if (input.hasMarkup) return true
  return /unusual traffic|verify (that )?you are human|automated queries|temporarily restricted|too many requests|unusual search activity|xác minh bạn là con người|tạm thời bị hạn chế|nhập các ký tự|xác nhận bạn là người/i.test(
    input.text
  )
}

/**
 * Phat hien trang XAC MINH / CAPTCHA / gioi han cua Bing — dung chung moi noi can kiem.
 * 2026-10-17: truoc day chi kiem khi BO QUY TAC BAT va chi kiem TRUOC moi luot; CAPTCHA hien ngay sau Enter
 * bi coi la "khong thay ket qua" roi roi vao nhanh fallback URL (goto thang link search) => van gui tiep.
 */
export async function detectRestriction(page: Page): Promise<boolean> {
  const url = page.url()
  if (looksLikeRestriction({ url, text: '', hasMarkup: false })) return true
  const probe = await page
    .evaluate(() => {
      const text = (document.body?.innerText ?? '').slice(0, 4000)
      const marked = !!document.querySelector(
        '#b_captcha, #captcha, .captcha, iframe[src*="captcha"], iframe[src*="challenge"], iframe[title*="captcha" i], #enforcement, [data-testid*="captcha" i]'
      )
      return { text, marked }
    })
    .catch(() => null)
  if (!probe) return false
  return looksLikeRestriction({ url, text: probe.text, hasMarkup: probe.marked })
}

async function doSearch(page: Page, q: string, cfg: CoreConfig, shouldStop?: () => boolean): Promise<string> {
  if (shouldStop?.()) return 'stopped'
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
    await cancellableSleep(randInt(250, 800), shouldStop)
    if (shouldStop?.()) return 'stopped'
    await page.keyboard.press('Enter')
    // KIEM NGAY SAU ENTER: CAPTCHA/gioi han thuong hien o day. Cho 0,7-1,6s roi doc trang;
    // neu co xac minh thi tra 'restricted' de vong lap DUNG NGAY (khong cho ket qua, khong fallback URL).
    await cancellableSleep(randInt(700, 1600), shouldStop)
    if (await detectRestriction(page)) return 'restricted'
    await page.waitForSelector(RESULTS, { timeout: 20000 })
  } catch (e) {
    if (shouldStop?.()) return 'stopped'
    // Truoc khi fallback URL: neu trang dang yeu cau xac minh thi KHONG duoc goto tiep (tranh gui them request)
    if (await detectRestriction(page)) return 'restricted'
    how = `url (${String((e as Error).message).split('\n')[0].slice(0, 60)})`
    await page
      .goto(`https://www.bing.com/search?q=${encodeURIComponent(q)}&FORM=QBLH`, { waitUntil: 'domcontentloaded' })
      .catch(() => {})
    if (await detectRestriction(page)) return 'restricted'
    await page.waitForSelector(RESULTS, { timeout: 20000 }).catch(() => {})
  }
  if (shouldStop?.()) return 'stopped'
  await cancellableSleep(randInt(900, 2200), shouldStop)
  if (shouldStop?.()) return 'stopped'
  await page.mouse.wheel(0, randInt(250, 1100)).catch(() => {})
  await humanPause(cfg, 'dwell', shouldStop)
  if (shouldStop?.()) return 'stopped'
  if (await detectRestriction(page)) return 'restricted'

  if (Math.random() < cfg.search.clickResultProbability) {
    // KHONG luon bam ket qua dau tien: chon trong 1..5 ket qua tu nhien dau, bo qua quang cao va link noi bo Bing.
    const pick = await page
      .evaluate(() => {
        const items = Array.from(document.querySelectorAll('#b_results > li.b_algo'))
          .filter((li) => !li.classList.contains('b_ad') && !li.querySelector('.b_adProviderText'))
          .slice(0, 5)
        const links = items
          .map((li) => li.querySelector('h2 a') as HTMLAnchorElement | null)
          .filter((a): a is HTMLAnchorElement => !!a && !!a.href && !/^https?:\/\/(www\.)?bing\.com\//i.test(a.href))
        if (!links.length) return null
        // Lech ve dau nhung KHONG phai luc nao cung so 1: trong so 3,2,2,1,1
        const weights = [3, 2, 2, 1, 1].slice(0, links.length)
        const total = weights.reduce((a, b) => a + b, 0)
        let r = Math.random() * total
        for (let i = 0; i < links.length; i += 1) {
          r -= weights[i]
          if (r <= 0) return i
        }
        return 0
      })
      .catch(() => null)
    if (pick != null) {
      const link = page.locator('#b_results > li.b_algo h2 a').nth(pick)
      if (await link.count().catch(() => 0)) {
        try {
          const [opened] = await Promise.all([
            page.context().waitForEvent('page', { timeout: 3500 }).catch(() => null),
            link.click({ timeout: 6000 }).catch(() => null)
          ])
          // Doc ket qua nhu nguoi that: o lai lau hon, cuon nhe truoc khi quay ve
          await cancellableSleep(randInt(6000, 22000), shouldStop)
          if (opened) {
            await opened.mouse?.wheel(0, randInt(200, 900)).catch(() => {})
            await cancellableSleep(randInt(800, 2500), shouldStop)
            await opened.close().catch(() => {})
          } else {
            await page.mouse.wheel(0, randInt(200, 900)).catch(() => {})
            await cancellableSleep(randInt(400, 1200), shouldStop)
            await page.goBack({ timeout: 10000 }).catch(() => {})
          }
          await cancellableSleep(randInt(600, 1600), shouldStop)
        } catch {
          /* bo qua */
        }
      }
    }
  }
  return how
}

export async function runSearchPass(args: {
  cfg: CoreConfig
  ctx: BrowserContext
  page?: Page
  log: Logger
  kind: 'desktop' | 'mobile'
  target: number
  nextQuery: () => string
  rememberQuery: (q: string) => void
  reserveQuery?: (q: string) => boolean
  releaseQuery?: (q: string) => void
  preparePage?: (page: Page) => Promise<void>
  shouldStop?: () => boolean
  /** Bao tien do ra UI (goi sau moi search + sau moi lan doc counter) */
  onProgress?: (p: SearchProgress) => void
  beforeSearch?: () => boolean
  onRestriction?: () => void
}): Promise<SearchPassResult> {
  const { cfg, ctx, log, kind, target, nextQuery, rememberQuery, preparePage, shouldStop } = args
  const page = args.page ?? (await workPage(ctx))
  const ownPage = !args.page
  page.setDefaultTimeout(30000)
  if (preparePage) await preparePage(page)

  // Xac minh IP dau ra thuc te NGAY dau pass, TRUOC khi kiem tra dang nhap:
  // doi proxy/chain co the lam Bing coi la phien la => van phai co bang chung IP de chan doan.
  try {
    await page.goto('http://ip-api.com/json', { waitUntil: 'domcontentloaded', timeout: 20000 })
    const txt = (await page.textContent('body')) || ''
    const ip = (txt.match(/"query":"([^"]+)"/) || [])[1]
    const cc = (txt.match(/"country":"([^"]+)"/) || [])[1]
    if (ip) log.info(`[${kind}] IP dau ra thuc te: ${ip}${cc ? ` (${cc})` : ''}`)
    else log.warn(`[${kind}] khong doc duoc IP dau ra (proxy tra ve du lieu la)`)
  } catch (e) {
    log.warn(
      `[${kind}] khong kiem tra duoc IP dau ra: ${String((e as Error).message).split('\n')[0].slice(0, 90)}`
    )
  }

  const first = await readCounters(page, log, { quiet: true })
  if (!first.signedIn) {
    if (ownPage) await page.close()
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
    if (ownPage) await page.close()
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

  // Bao tien do ra UI sau MOI search (diem lay tu lan doc counter gan nhat, khong spam request)
  const emit = (): void =>
    args.onProgress?.({
      kind,
      done: searches,
      total: planned,
      points: lastPoints,
      today: lastToday,
      gained: lastPoints - (pointsBefore ?? lastPoints)
    })

  await gotoHome(page)
  emit()

  // Nhip doc diem: lech ngau nhien quanh cfg.search.checkPointsEvery (±40%) thay vi dung N co dinh
  const baseEvery = Math.max(1, cfg.search.checkPointsEvery)
  const nextEvery = (): number => {
    const n = randInt(Math.max(1, Math.round(baseEvery * 0.6)), Math.max(2, Math.round(baseEvery * 1.4)))
    return n
  }
  let nextCheckAt = nextEvery()

  for (let i = 0; i < planned; i += 1) {
    if (shouldStop?.()) {
      status = 'cancelled'
      log.warn(`[${kind}] nguoi dung dung - ket thuc som sau ${searches} search`)
      break
    }
    let q = nextQuery()
    if (!q) {
      status = 'keywords-exhausted'
      log.warn(`[${kind}] Đã hết từ khoá chưa dùng trong kho chung. Nạp thêm tại tab Từ khoá.`)
      break
    }
    // KIEM XAC MINH/GIOI HAN *LUON* (khong phu thuoc bo quy tac co bat hay khong):
    // dang o trang xac minh ma van gui search tiep la lam nang them muc do bi chan.
    if (await detectRestriction(page)) {
      status = 'restricted'
      args.onRestriction?.()
      log.error(`[${kind}] Bing yêu cầu XÁC MINH (CAPTCHA/giới hạn) — DỪNG NGAY, không gửi thêm search. Kiểm tra thủ công trong trình duyệt rồi chạy lại.`)
      break
    }
    // Shared, synchronous claim closes the race after the async restriction check.
    while (q && args.reserveQuery && !args.reserveQuery(q)) q = nextQuery()
    if (!q) {
      status = 'keywords-exhausted'
      log.warn(`[${kind}] Đã hết từ khoá chưa dùng trong kho chung. Nạp thêm tại tab Từ khoá.`)
      break
    }
    if (args.beforeSearch && !args.beforeSearch()) {
      args.releaseQuery?.(q)
      status = 'policy-limit'
      log.info(`[${kind}] đã hết ngân sách phiên/ngày hoặc quy tắc đang dừng`)
      break
    }
    try {
      const how = await doSearch(page, q, cfg, shouldStop)
      if (shouldStop?.()) {
        status = 'cancelled'
        log.warn(`[${kind}] nguoi dung dung - ket thuc som sau ${searches} search`)
        break
      }
      if (how === 'restricted') {
        // CAPTCHA hien NGAY SAU Enter -> dung luot, khong di tiep, khong fallback URL
        status = 'restricted'
        args.onRestriction?.()
        args.releaseQuery?.(q)
        log.error(
          `[${kind}] Bing yêu cầu XÁC MINH ngay sau khi gửi từ khoá — DỪNG LUÔN (đã gửi ${searches} search). ` +
            `Mở trình duyệt của tài khoản này để xử lý thủ công rồi chạy lại.`
        )
        break
      }
      rememberQuery(q)
      searches += 1
      log.debug(`[${kind}] ${i + 1}/${planned}: ${q} [${how}]`)
    } catch (e) {
      const msg = String((e as Error).message)
      log.warn(`[${kind}] loi khi search "${q}": ${msg.slice(0, 160)}`)
      // Loi mang/proxy: proxy chet, proxy chan bing, chain het proxy... => dung luot ngay,
      // KHONG de chay 30 search vo ich va khong bao gio fallback DIRECT.
      if (
        /ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_PROXY_AUTH|ERR_SOCKS_CONNECTION_FAILED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_EMPTY_RESPONSE|ERR_INTERNET_DISCONNECTED/i.test(
          msg
        )
      ) {
        status = 'proxy-failed'
        log.error(
          `[${kind}] loi mang/proxy (${msg.split('\n')[0].slice(0, 100)}) - dung luot, khong fallback DIRECT`
        )
        break
      }
    }

    // Doc diem dinh ky NHUNG lech nhau (khong dung nhip co dinh N search) — giam tinh "may moc"
    if (searches >= nextCheckAt) {
      if (shouldStop?.()) {
        status = 'cancelled'
        break
      }
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
      nextCheckAt = searches + nextEvery()
      emit()
      await gotoHome(page).catch(() => {})
    } else {
      emit()
    }

    if (i < planned - 1) await cancellableSleep(randInt(cfg.search.minDelayMs, cfg.search.maxDelayMs), shouldStop)
  }

  const last = shouldStop?.() ? null : await readCounters(page, log, { quiet: true }).catch(() => null)
  if (ownPage) await page.close()
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
