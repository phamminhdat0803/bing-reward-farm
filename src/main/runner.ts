// Runner: doc trang thai (snapshot) va chay automation cho tung profile.
// Log stream qua onLine; snapshot phat qua onSnapshot.
import path from 'node:path'
import { app } from 'electron'
import type { Page } from 'playwright-core'
import { attachCdp, closeStrayPages, launchPersistent, newDeviceSession, workPage, type Session } from './core/browser'
import { exeForCached } from './browser-detect'
import * as cache from './cache'
import type { CachedSnapshot } from './cache'
import { runDailySet } from './core/daily'
import { runEarnPass } from './core/earn'
import { buildPool, makeQueryPicker } from './core/queries'
import { createLogger, sleep } from './core/logger'
import { EARN_URL, readBreakdown, readCounters } from './core/rewards'
import { runSearchPass } from './core/search'
import { dayRecord, loadState, rememberQuery, saveState, todayKey, usedQuerySet } from './core/state'
import { DEFAULTS, type CoreConfig, type Logger, type LogLine, type SearchProgress } from './core/types'
import { browserState, closeBrowser, markRun } from './browsers'
import { withProfileLock } from './lock'
import { getProfile, logDir, stateFile, updateProfile, type Profile } from './profiles'
import { clearActiveChain, preflightChain, resolveProxyChain, resolveProxyUrl, setActiveChain } from './proxies'
import { getSettings } from './settings'

export type Snapshot = {
  profileId: string
  at: string
  ok: boolean
  signedIn: boolean
  account: string
  points: number | null
  todayPoints: number | null
  desktop: { progress: number; max: number } | null
  mobile: { progress: number; max: number } | null
  offers: number | null
  /** Muc "Keep earning x/y" tren /earn — null nghia la tai khoan/khu vuc khong co muc nay */
  earn: {
    progress: number
    max: number
    /** Diem KHONG kiem duoc vi the bi khoa cap do (vd "Silver level required") */
    blockedPoints?: number
    blocked?: { label: string; points: number | null; reason: string }[]
  } | null
  month: number | null
  year: number | null
  lifetime: number | null
  searchStreak: { progress: number; max: number } | null
  dailySet: { progress: number; max: number } | null
  edgeMinutes: { progress: number; max: number } | null
  checkIn: { progress: number; max: number } | null
  level: string | null
  setLinks: { idx: number; href: string; text: string; reward: string | null }[]
  browser: { running: boolean; pid: number | null; cdpUrl: string | null }
  runs: { desktop: unknown; mobile: unknown; daily: unknown }
  error?: string
}

type Job = {
  startedAt: string
  kinds: string[]
  cancelled: boolean
  log: LogLine[]
  activeSession?: Session
}

const jobs = new Map<string, Job>()

// ---------------------------------------------------------------------------
// Mo hinh chay:
//   • TAI KHOAN KHAC NHAU  -> chay SONG SONG (moi acc mot lan rieng).
//   • CUNG MOT ACC, nhieu lenh -> xep HANG DOI rieng: acc do chay xong lenh truoc moi toi lenh sau.
//   • settings.maxParallelRuns > 0 = gioi han TONG tuy chon (0 = khong gioi han).
// ---------------------------------------------------------------------------
type RunHooks = {
  onLine?: (l: LogLine) => void
  onSnapshot?: (s: Snapshot) => void
  onStatusChange?: (profileId: string, running: boolean) => void
  onProgress?: (p: SearchProgress & { profileId: string }) => void
  onQueue?: (q: QueueView) => void
}
type PendingRun = { profile: Profile; kinds: string[]; hooks: RunHooks; queuedAt: number }
export type QueueView = {
  /** Acc dang chay + so lenh dang cho cua CHINH acc do */
  items: { profileId: string; name: string; pending: number; oldestWaitMs?: number }[]
  /** Acc phai cho slot vi cham gioi han TONG (chi khi maxParallelRuns > 0) */
  waiting: { profileId: string; name: string; position: number }[]
  max: number
}

const pendingByProfile = new Map<string, PendingRun[]>()
const waitingGlobal: PendingRun[] = []
let pumping = false

/** Hang doi theo tung acc (acc co lenh dang cho). */
export function queueState(): QueueView['items'] {
  const out: QueueView['items'] = []
  const now = Date.now()
  for (const [id, list] of pendingByProfile) {
    if (list.length === 0) continue
    out.push({
      profileId: id,
      name: list[0].profile.name,
      pending: list.length,
      oldestWaitMs: now - list[0].queuedAt
    })
  }
  return out
}

function waitingState(): QueueView['waiting'] {
  return waitingGlobal.map((w, i) => ({ profileId: w.profile.id, name: w.profile.name, position: i + 1 }))
}

export function queueView(): QueueView {
  return {
    items: queueState(),
    waiting: waitingState(),
    max: Math.max(0, getSettings().maxParallelRuns ?? 0)
  }
}

function notifyQueue(): void {
  const view = queueView()
  for (const list of pendingByProfile.values()) for (const p of list) p.hooks.onQueue?.(view)
  for (const w of waitingGlobal) w.hooks.onQueue?.(view)
}

/** Sau khi 1 job ket thuc: chay lenh KE TIEP cua CHINH acc do (tuan tu trong cung acc). */
function pumpProfile(profileId: string): void {
  const list = pendingByProfile.get(profileId)
  const next = list?.shift()
  if (!next) {
    pendingByProfile.delete(profileId)
    notifyQueue() // BUG 2026-10-16: truoc day khong phat su kien -> UI giu badge "1 lenh cho" mai
    return
  }
  if (list && list.length === 0) pendingByProfile.delete(profileId)
  console.log('[queue] ' + next.profile.name + ': chay lenh ke tiep cua cung acc (con ' + (list?.length ?? 0) + ')')
  void startRunNow(next.profile, next.kinds, next.hooks).finally(() => notifyQueue())
  notifyQueue()
}

/**
 * Watchdog hang doi (2026-10-16): neu 1 acc co lenh cho ma KHONG co job nao chay -> chay tiep;
 * neu lenh cho treo qua lau (mac dinh 15 phut) thi bo va ghi log, tranh "treo 1 lenh mai".
 */
export function watchdogQueues(maxAgeMs = 15 * 60 * 1000): { pumped: string[]; dropped: string[] } {
  const pumped: string[] = []
  const dropped: string[] = []
  const now = Date.now()
  for (const [id, list] of Array.from(pendingByProfile.entries())) {
    if (!list.length) {
      pendingByProfile.delete(id)
      continue
    }
    if (jobs.has(id)) continue // acc dang chay -> de no tu pump khi xong
    const stale = list.filter((p) => now - p.queuedAt > maxAgeMs)
    if (stale.length) {
      const keep = list.filter((p) => now - p.queuedAt <= maxAgeMs)
      if (keep.length) pendingByProfile.set(id, keep)
      else pendingByProfile.delete(id)
      dropped.push(`${list[0].profile.name} (${stale.length} lệnh chờ > ${Math.round(maxAgeMs / 60000)} phút)`)
      console.log(`[queue] BO ${stale.length} lenh cho treo cua ${list[0].profile.name}`)
      notifyQueue()
      continue
    }
    pumped.push(list[0].profile.name)
    pumpProfile(id)
  }
  return { pumped, dropped }
}

/**
 * CHI DUNG CHO TEST (dev hook): bom 1 lenh cho gia vao hang doi cua 1 acc de kiem tra watchdog/UI.
 * `ageMs` = tuoi lenh cho (de gia lap lenh cho treo tu lau).
 */
export function debugPushPending(profileId: string, ageMs = 0, kinds: string[] = ['desktop']): boolean {
  const p = getProfile(profileId)
  if (!p) return false
  const list = pendingByProfile.get(profileId) ?? []
  list.push({ profile: p, kinds, hooks: {}, queuedAt: Date.now() - ageMs })
  pendingByProfile.set(profileId, list)
  notifyQueue()
  return true
}

/** Xoa lenh cho (1 acc hoac tat ca) — dung khi UI thay 1 lenh cho bi treo. */
export function clearQueue(profileId?: string): { cleared: number } {  let n = 0
  if (profileId) {
    n = pendingByProfile.get(profileId)?.length ?? 0
    pendingByProfile.delete(profileId)
  } else {
    for (const [, list] of pendingByProfile) n += list.length
    pendingByProfile.clear()
    n += waitingGlobal.length
    waitingGlobal.length = 0
  }
  notifyQueue()
  return { cleared: n }
}

/** Chay tiep cac acc dang cho SLOT (chi khi co gioi han tong). */
function pumpQueue(): void {
  if (pumping) return
  pumping = true
  try {
    const cap = Math.max(0, getSettings().maxParallelRuns ?? 0)
    while (waitingGlobal.length > 0 && (cap === 0 || jobs.size < cap)) {
      const next = waitingGlobal.shift()
      if (!next) break
      console.log('[queue] bat dau ' + next.profile.name + ' tu cho slot (con ' + waitingGlobal.length + ')')
      void startRunNow(next.profile, next.kinds, next.hooks)
    }
    notifyQueue()
  } finally {
    pumping = false
  }
}

export function runStateAll(): { running: string[] } & QueueView {
  return { running: Array.from(jobs.keys()), ...queueView() }
}

export function coreConfig(profile: Profile, overrides: Partial<CoreConfig['browser']> = {}): CoreConfig {
  const cfg: CoreConfig = JSON.parse(JSON.stringify(DEFAULTS))
  const channel = profile.channel ?? 'msedge'
  cfg.browser.profileDir = profile.profileDir
  cfg.browser.headless = profile.headless
  cfg.browser.channel = channel
  // Chain la nguon su that: sau preflight, proxy chinh phai la proxy SONG dau tien trong chain
  cfg.browser.proxyChain = resolveProxyChain(profile)
  cfg.browser.proxy = cfg.browser.proxyChain[0] ?? resolveProxyUrl(profile)
  // Dung dung file exe da do duoc (ho tro ca Brave/Coc Coc/Vivaldi... chu khong chi Edge/Chrome)
  cfg.browser.executablePath = exeForCached(channel)
  cfg.browser = { ...cfg.browser, ...overrides }
  cfg.log = { dir: logDir(profile), level: 'info' }
  cfg.queries.file = path.join(process.cwd(), 'data', 'queries.txt')
  return cfg
}

function loggerFor(profile: Profile, onLine?: (l: LogLine) => void, job?: Job) {
  return createLogger({
    dir: logDir(profile),
    level: 'info',
    profileId: profile.id,
    onLine: (l) => {
      job?.log.push(l)
      if (job && job.log.length > 500) job.log.splice(0, job.log.length - 500)
      onLine?.(l)
    }
  })
}

async function withSession<T>(profile: Profile, fn: (s: Session, kind: 'local' | 'cdp') => Promise<T>): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const st = await browserState(profile)
    if (st.running && st.cdpUrl) {
      const s = await attachCdp(st.cdpUrl)
      try {
        return await fn(s, 'cdp')
      } finally {
        await s.close()
      }
    }
    const cfg = coreConfig(profile, { headless: getSettings().runHeadless })
    try {
      const session = await launchPersistent(profile.profileDir, cfg, { mobile: false })
      try {
        return await fn(session, 'local')
      } finally {
        await session.close()
      }
    } catch (e) {
      lastError = e
      const msg = String((e as Error).message)
      if (!/existing browser session|already in use/i.test(msg)) throw e
      // Profile dang bi giu boi tien trinh khac: thu lai sau khi kiem tra lai xem co CDP khong
      await sleep(3000)
    }
  }
  throw lastError ?? new Error('khong mo duoc profile')
}

export async function snapshot(profile: Profile): Promise<Snapshot> {
  return withProfileLock(profile.id, () => snapshotUnlocked(profile))
}

/** Doc snapshot truc tiep tu session dang hoat dong (khong mo session moi). */
async function readSnapshotFromSession(
  s: Session,
  profile: Profile,
  log: Logger,
  existingPage?: Page
): Promise<Snapshot> {
  const base: Snapshot = {
    profileId: profile.id,
    at: new Date().toISOString(),
    ok: false,
    signedIn: false,
    account: profile.account,
    points: null,
    todayPoints: null,
    desktop: null,
    mobile: null,
    offers: null,
    earn: null,
    month: null,
    year: null,
    lifetime: null,
    searchStreak: null,
    dailySet: null,
    edgeMinutes: null,
    checkIn: null,
    level: null,
    setLinks: [],
    browser: { running: false, pid: null, cdpUrl: null },
    runs: { desktop: null, mobile: null, daily: null }
  }

  const bs = await browserState(profile)
  base.browser = { running: bs.running, pid: bs.pid, cdpUrl: bs.cdpUrl }

  const page = existingPage ?? (await workPage(s.context))
  const ownPage = !existingPage
  try {
    const snap = await readCounters(page, log, { quiet: true })
    const bd = await readBreakdown(page, log).catch(() => null)
    base.signedIn = snap.signedIn
    base.ok = snap.ok || !!bd
    base.points = snap.points
    base.todayPoints = bd?.todayPoints ?? snap.todayPoints
    base.desktop = bd?.desktop ?? null
    base.mobile = bd?.mobile ?? null
    base.offers = bd?.offers ?? null
    base.earn = bd?.earn ?? null
    base.month = bd?.month ?? null
    base.year = bd?.year ?? null
    base.lifetime = bd?.lifetime ?? null
    base.searchStreak = snap.counters.search
    base.dailySet = snap.counters.dailySet
    base.edgeMinutes = snap.counters.edgeMinutes
    base.checkIn = snap.counters.checkIn
    base.level = snap.level
    base.setLinks = snap.setLinks.map((l) => ({ idx: l.idx, href: l.href, text: l.text, reward: l.reward }))
    log.info(
      `snapshot OK: dang-nhap=${base.signedIn} diem=${base.points} hom-nay=${base.todayPoints} ` +
        `desktop=${base.desktop?.progress ?? '?'}/${base.desktop?.max ?? '?'} mobile=${base.mobile?.progress ?? '?'}/${base.mobile?.max ?? '?'} ` +
        `offers=${base.offers} keepEarning=${base.earn ? `${base.earn.progress}/${base.earn.max}` : 'n/a'} dailySet=${base.dailySet?.progress ?? '?'}/${base.dailySet?.max ?? '?'} links=${base.setLinks.length}`
    )
  } finally {
    if (ownPage) await page.close().catch(() => {})
  }

  const st = loadState(stateFile(profile))
  const rec = st.days[todayKey()]
  if (rec) base.runs = { desktop: rec.desktop, mobile: rec.mobile, daily: rec.daily }
  return base
}

/** Nhu snapshot() nhung khong lay khoa — dung khi da o trong khoa nhung CHUA mo session. */
async function snapshotUnlocked(profile: Profile): Promise<Snapshot> {
  const log = loggerFor(profile)
  const base: Snapshot = {
    profileId: profile.id,
    at: new Date().toISOString(),
    ok: false,
    signedIn: false,
    account: profile.account,
    points: null,
    todayPoints: null,
    desktop: null,
    mobile: null,
    offers: null,
    earn: null,
    month: null,
    year: null,
    lifetime: null,
    searchStreak: null,
    dailySet: null,
    edgeMinutes: null,
    checkIn: null,
    level: null,
    setLinks: [],
    browser: { running: false, pid: null, cdpUrl: null },
    runs: { desktop: null, mobile: null, daily: null }
  }

  const bs = await browserState(profile)
  base.browser = { running: bs.running, pid: bs.pid, cdpUrl: bs.cdpUrl }

  try {
    return await withSession(profile, async (s) => {
      const page = await workPage(s.context)
      return readSnapshotFromSession(s, profile, log, page)
    })
  } catch (e) {
    const msg = String((e as Error).message)
    base.error = /existing browser session|already in use/i.test(msg)
      ? 'Profile đang được mở bởi cửa sổ Edge khác (không có CDP). Hãy đóng cửa sổ đó, hoặc dùng nút “Mở trình duyệt” để app mở kèm CDP rồi automation attach vào.'
      : msg.slice(0, 300)
    log.warn(`snapshot loi: ${base.error}`)
    return base
  }
}

/** Mo cua so dang nhap (giu mo) cho profile. */
export async function openLoginWindow(profile: Profile): Promise<{ ok: boolean; error?: string }> {
  const log = loggerFor(profile)
  const cfg = coreConfig(profile, { headless: false })
  try {
    const s = await launchPersistent(profile.profileDir, cfg, { mobile: false })
    const page = await s.context.newPage()
    await page.goto(EARN_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
    log.info('da mo cua so de dang nhap - dang nhap xong thi dong cua so')
    // Giu cua so: chi dong khi nguoi dung dong
    s.context.on('close', () => {})
    const closed = new Promise<void>((r) => s.context.on('close', () => r()))
    const check = setInterval(async () => {
      try {
        if (page.isClosed()) return
        const snap = await readCounters(page, log, { quiet: true }).catch(() => null)
        if (snap?.signedIn) {
          log.info(`dang nhap OK - diem=${snap.points ?? '?'} (cookie ${snap.authHits.join(',')})`)
        }
      } catch {
        /* bo qua */
      }
    }, 15000)
    await closed
    clearInterval(check)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 300) }
  }
}

export function runState(profileId: string): {
  running: boolean
  queued: boolean
  queuePosition: number | null
  kinds: string[]
  log: LogLine[]
} {
  const pending = pendingByProfile.get(profileId)?.length ?? 0
  const waitPos = waitingGlobal.findIndex((w) => w.profile.id === profileId)
  const queued = pending > 0 || waitPos >= 0
  const queuePosition = pending > 0 ? pending : waitPos >= 0 ? waitPos + 1 : null
  const job = jobs.get(profileId)
  if (!job || job.cancelled) return { running: false, queued, queuePosition, kinds: [], log: job?.log.slice(-200) ?? [] }
  return { running: true, queued, queuePosition, kinds: job.kinds, log: job.log.slice(-200) }
}

export function stopRun(profileId: string): { ok: boolean } {
  const job = jobs.get(profileId)
  if (!job) return { ok: false }
  job.cancelled = true
  if (job.activeSession) {
    // Ngat context ngay de Playwright thoat moi thao tac dang cho (sleep, wait, goto)
    void job.activeSession.context.close().catch(() => {})
  }
  return { ok: true }
}

export async function startRun(
  profile: Profile,
  kinds: string[],
  hooks: RunHooks = {}
): Promise<{ ok: boolean; runId?: string; error?: string; queued?: boolean; position?: number }> {
  // CUNG ACC dang chay -> xep hang doi rieng cho acc nay (tuan tu).
  // (Truoc day bao loi 'dang chay'; nay chap nhan xep hang de chay lan luot.)
  if (jobs.has(profile.id)) {
    const list = pendingByProfile.get(profile.id) ?? []
    list.push({ profile, kinds, hooks, queuedAt: Date.now() })
    pendingByProfile.set(profile.id, list)
    const position = list.length
    console.log('[queue] ' + profile.name + ': xep lenh thu ' + position + ' cho cung acc (acc dang chay)')
    hooks.onLine?.({
      at: new Date().toISOString(),
      level: 'info',
      msg: `[queue] ${profile.name}: xếp lệnh thứ ${position} cho cùng acc (acc đang chạy)`,
      profileId: profile.id
    })
    notifyQueue()
    return { ok: true, queued: true, position }
  }
  // Gioi han TONG (tuy chon) -> phai cho slot
  const cap = Math.max(0, getSettings().maxParallelRuns ?? 0)
  if (cap > 0 && jobs.size >= cap) {
    waitingGlobal.push({ profile, kinds, hooks, queuedAt: Date.now() })
    const position = waitingGlobal.length
    console.log('[queue] ' + profile.name + ' cho slot (dang chay ' + jobs.size + '/' + cap + ')')
    hooks.onLine?.({
      at: new Date().toISOString(),
      level: 'info',
      msg: `[queue] ${profile.name} chờ slot (đang chạy ${jobs.size}/${cap})`,
      profileId: profile.id
    })
    notifyQueue()
    return { ok: true, queued: true, position }
  }
  void startRunNow(profile, kinds, hooks)
  return { ok: true }
}

/** Than chay that su (truoc day la phan than cua startRun). */
async function startRunNow(
  profile: Profile,
  kinds: string[],
  hooks: RunHooks = {}
): Promise<void> {
  const job: Job = { startedAt: new Date().toISOString(), kinds, cancelled: false, log: [] }
  jobs.set(profile.id, job)
  hooks.onStatusChange?.(profile.id, true)
  const log = loggerFor(profile, hooks.onLine, job)
  log.info(`[run] che do hien thi: ${getSettings().runHeadless ? 'AN (headless)' : 'HIEN cua so'}`)

  void withProfileLock(profile.id, async () => {
    try {
      // ---- Preflight proxy: chan run khi toan bo proxy chet (no-direct BAT) ----
      const chainAll = resolveProxyChain(profile)
      if (chainAll.length > 0) {
        const { live, dead } = await preflightChain(chainAll)
        for (const d of dead) log.warn(`[proxy] chet: ${d.proxy} - ${d.error ?? 'khong ro'}`)
        if (live.length === 0) {
          const noDirect = getSettings().noDirectFallback !== false
          if (noDirect) {
            log.error(
              `[proxy] DUNG profile: ca ${chainAll.length} proxy deu chet - KHONG fallback DIRECT (no-direct dang BAT, doi trong Cai dat)`
            )
            hooks.onStatusChange?.(profile.id, false)
            jobs.delete(profile.id)
            return
          }
          log.warn(
            `[proxy] ca ${chainAll.length} proxy deu chet nhung no-direct dang TAT -> chay bang IP cua may (khong khuyen nghi)`
          )
          setActiveChain(profile.id, []) // chain rong = khong dung proxy nao cho lan chay nay
        } else {
        log.info(`[proxy] chain ${live.length}/${chainAll.length} proxy song: ${live.join(' , ')}`)
        // Chain thuc te cho lan launch nay: bo proxy chet, proxy song dau tien len lam chinh
        setActiveChain(profile.id, live)
          if (live.length !== chainAll.length) {
            const oldMain = resolveProxyUrl(profile)
            // CHI ghi nho proxy song gan nhat lam GOI Y uu tien cho lan sau.
            // TUYET DOI khong ghi lai proxyId/proxy/proxyFallbacks o day: lam vay se XOA MAT
            // danh sach proxy du phong nguoi dung da them (loi da gap: them fallback -> chay 1 lan
            // -> thoat app -> mat het).
            updateProfile(profile.id, { lastGoodProxy: live[0] })
            log.info(
              `[proxy] doi proxy chinh cho lan chay nay: ${oldMain ?? '(khong)'} -> ${live[0]} (giu nguyen cau hinh da luu)`
            )
          }
        }
      }

      const st = loadState(stateFile(profile))
      const rec = dayRecord(st)
      const cfg = coreConfig(profile)
      const pool = buildPool(cfg.queries.file)
      const nextQuery = makeQueryPicker(pool, usedQuerySet(rec))
      const shouldStop = (): boolean => job.cancelled
      const summary: Record<string, unknown> = {}

      let doDesktop = kinds.includes('desktop')
      let doMobile = kinds.includes('mobile')
      let doDaily = kinds.includes('daily')
      let doEarn = kinds.includes('earn')

      const cached = cache.get(profile.id)
      const per = cfg.search.pointsPerSearch ?? 3
      const isToday = cached && cached.date === todayKey()
      let lastSnap: Snapshot | null = null

      // Mức trần dự kiến: ưu tiên profile cấu hình -> cache Rewards -> mặc định (Level 2: 90/60; nếu Level 1 / <= 30 thì mobile là 0)
      const expectedDesktopMax = profile.desktopMax ?? cached?.desktop?.max ?? 90
      const expectedMobileMax = profile.mobileMax ?? cached?.mobile?.max ?? (expectedDesktopMax <= 30 ? 0 : 60)

      let desktopTarget = Math.ceil(Math.max(0, expectedDesktopMax - (cached?.desktop?.progress ?? 0)) / per)
      let mobileTarget = expectedMobileMax > 0 ? Math.ceil(Math.max(0, expectedMobileMax - (cached?.mobile?.progress ?? 0)) / per) : 0

      // 1. Kiểm tra trước theo cache hôm nay: Task nào xong rồi thì loại bỏ ngay
      if (isToday) {
        if (doDesktop && cached.desktop && cached.desktop.progress >= expectedDesktopMax) {
          log.info(`[desktop] da dat tran (${cached.desktop.progress}/${expectedDesktopMax}) tu cache hom nay - bo qua`)
          doDesktop = false
        }
        if (doMobile && (expectedMobileMax === 0 || (cached.mobile && cached.mobile.progress >= expectedMobileMax))) {
          log.info(`[mobile] da dat tran (${cached.mobile?.progress ?? 0}/${expectedMobileMax}) hoac khong ho tro mobile - bo qua`)
          doMobile = false
        }
        if (doDaily && cached.dailySet && cached.dailySet.progress >= (cached.dailySet.max ?? 3)) {
          log.info(`[daily] daily set da xong (${cached.dailySet.progress}/${cached.dailySet.max}) tu cache hom nay - bo qua`)
          doDaily = false
        }
        if (doEarn && cached.earn && cached.earn.max > 0 && cached.earn.progress >= cached.earn.max) {
          log.info(`[earn] Keep earning da dat tran (${cached.earn.progress}/${cached.earn.max}) tu cache hom nay - bo qua`)
          doEarn = false
        }
      }

      // Neu tat ca task deu da hoan thanh -> ket thuc ngay, khong can mo trinh duyet
      if (!doDesktop && !doMobile && !doDaily && !doEarn) {
        log.info(`[run] Tat ca cac task yeu cau (${kinds.join(', ')}) deu da hoan thanh! Khong can chay nua.`)
        hooks.onStatusChange?.(profile.id, false)
        return
      }

      const pendingTasks = [doDesktop && 'desktop', doDaily && 'daily', doEarn && 'earn', doMobile && 'mobile'].filter(Boolean).join(', ')
      log.info(`[run] Bat dau chay cac task con thieu: ${pendingTasks}`)

      if (doDesktop || doDaily || doEarn) {
        try {
          await withSession(profile, async (s) => {
            job.activeSession = s
            const page = await workPage(s.context)
            await closeStrayPages(s.context, page)
            const log2 = loggerFor(profile, hooks.onLine, job)

            // Neu cache chua phai hom nay: doc breakdown tren trang /earn de cap nhat tran va loai task da xong
            if (!isToday) {
              try {
                const bd = await readBreakdown(page, log2).catch(() => null)
                if (bd) {
                  const dMax = profile.desktopMax ?? bd.desktop?.max ?? expectedDesktopMax
                  const mMax = profile.mobileMax ?? bd.mobile?.max ?? (dMax <= 30 ? 0 : expectedMobileMax)

                  const dRem = bd.desktop ? Math.max(0, dMax - bd.desktop.progress) : Math.max(0, dMax - (cached?.desktop?.progress ?? 0))
                  const mRem = bd.mobile ? Math.max(0, mMax - bd.mobile.progress) : (mMax > 0 ? Math.max(0, mMax - (cached?.mobile?.progress ?? 0)) : 0)

                  desktopTarget = Math.ceil(dRem / per)
                  mobileTarget = mMax > 0 ? Math.ceil(mRem / per) : 0
                  log2.info(
                    `tran ngay: desktop ${bd.desktop?.progress ?? '?'}/${dMax} mobile ${bd.mobile?.progress ?? '?'}/${mMax} => can ${desktopTarget} desktop + ${mobileTarget} mobile search`
                  )
                  if (doDesktop && dRem <= 0) {
                    log2.info(`[desktop] da dat tran (${bd.desktop?.progress ?? dMax}/${dMax}) - bo qua`)
                    doDesktop = false
                  }
                  if (doMobile && (mMax === 0 || mRem <= 0)) {
                    log2.info(`[mobile] da dat tran (${bd.mobile?.progress ?? 0}/${mMax}) - bo qua`)
                    doMobile = false
                  }
                  if (doEarn && bd.earn && bd.earn.max > 0 && bd.earn.progress >= bd.earn.max) {
                    log2.info(`[earn] Keep earning da dat tran (${bd.earn.progress}/${bd.earn.max}) - bo qua`)
                    doEarn = false
                  }
                }
              } catch {
                /* bo qua */
              }
            }

            if (doDesktop && desktopTarget > 0 && !shouldStop()) {
              summary.desktop = await runSearchPass({
                cfg,
                ctx: s.context,
                page,
                log: log2,
                kind: 'desktop',
                target: desktopTarget,
                nextQuery,
                rememberQuery: (q) => rememberQuery(rec, q),
                shouldStop,
                onProgress: (pr) => hooks.onProgress?.({ ...pr, profileId: profile.id })
              })
              rec.desktop = {
                searches: (summary.desktop as { searches: number }).searches,
                pointsBefore: (summary.desktop as { pointsBefore: number | null }).pointsBefore,
                pointsAfter: (summary.desktop as { pointsAfter: number | null }).pointsAfter
              }
              saveState(stateFile(profile), st)
              const snap = await readSnapshotFromSession(s, profile, log2, page).catch(() => null)
              if (snap) {
                // Dinh kem so diem bi khoa cap do de UI hien "bao nhieu diem dang bi chan"
                const earnRes = summary.earn as {
                  blockedPoints?: number
                  blocked?: { label: string; points: number | null; reason: string }[]
                }
                if (snap.earn) {
                  snap.earn.blockedPoints = earnRes?.blockedPoints ?? 0
                  snap.earn.blocked = earnRes?.blocked ?? []
                }
                lastSnap = snap
                cache.put(snap)
                hooks.onSnapshot?.(snap)
              }
            }

            if (doDaily && !shouldStop()) {
              summary.daily = await runDailySet({
                cfg,
                ctx: s.context,
                page,
                log: log2,
                shouldStop,
                onProgress: (pr) => hooks.onProgress?.({ ...pr, profileId: profile.id })
              })
              rec.daily = {
                items: (summary.daily as { items: unknown[] }).items,
                pointsBefore: (summary.daily as { pointsBefore: number | null }).pointsBefore,
                pointsAfter: (summary.daily as { pointsAfter: number | null }).pointsAfter
              }
              saveState(stateFile(profile), st)
              const snap = await readSnapshotFromSession(s, profile, log2, page).catch(() => null)
              if (snap) {
                // Dinh kem so diem bi khoa cap do de UI hien "bao nhieu diem dang bi chan"
                const earnRes = summary.earn as {
                  blockedPoints?: number
                  blocked?: { label: string; points: number | null; reason: string }[]
                }
                if (snap.earn) {
                  snap.earn.blockedPoints = earnRes?.blockedPoints ?? 0
                  snap.earn.blocked = earnRes?.blocked ?? []
                }
                lastSnap = snap
                cache.put(snap)
                hooks.onSnapshot?.(snap)
              }
            }

            if (doEarn && !shouldStop()) {
              summary.earn = await runEarnPass({
                cfg,
                ctx: s.context,
                page,
                log: log2,
                shouldStop,
                onProgress: (pr) => hooks.onProgress?.({ ...pr, profileId: profile.id })
              })
              rec.earn = {
                items: (summary.earn as { items: unknown[] }).items,
                pointsBefore: (summary.earn as { pointsBefore: number | null }).pointsBefore,
                pointsAfter: (summary.earn as { pointsAfter: number | null }).pointsAfter,
                sectionBefore: (summary.earn as { sectionBefore: string | null }).sectionBefore,
                sectionAfter: (summary.earn as { sectionAfter: string | null }).sectionAfter
              }
              saveState(stateFile(profile), st)
              const snap = await readSnapshotFromSession(s, profile, log2, page).catch(() => null)
              if (snap) {
                // Dinh kem so diem bi khoa cap do de UI hien "bao nhieu diem dang bi chan"
                const earnRes = summary.earn as {
                  blockedPoints?: number
                  blocked?: { label: string; points: number | null; reason: string }[]
                }
                if (snap.earn) {
                  snap.earn.blockedPoints = earnRes?.blockedPoints ?? 0
                  snap.earn.blocked = earnRes?.blocked ?? []
                }
                lastSnap = snap
                cache.put(snap)
                hooks.onSnapshot?.(snap)
              }
            }

            await closeStrayPages(s.context, page)
          })
        } finally {
          job.activeSession = undefined
        }
      }

      if (doMobile && mobileTarget > 0 && !shouldStop()) {
        const bs = await browserState(profile)
        let session: Session
        let kind: 'local' | 'cdp'
        if (bs.running && bs.cdpUrl) {
          session = await attachCdp(bs.cdpUrl)
          kind = 'cdp'
        } else {
          session = await launchPersistent(profile.profileDir, cfg, { mobile: true })
          kind = 'local'
        }
        job.activeSession = session
        try {
          const log2 = loggerFor(profile, hooks.onLine, job)
          const page = await workPage(session.context)
          await closeStrayPages(session.context, page)
          summary.mobile = await runSearchPass({
            cfg,
            ctx: session.context,
            page,
            log: log2,
            kind: 'mobile',
            target: mobileTarget,
            nextQuery,
            rememberQuery: (q) => rememberQuery(rec, q),
            shouldStop,
            onProgress: (pr) => hooks.onProgress?.({ ...pr, profileId: profile.id }),
            preparePage: kind === 'cdp' ? (p) => newDeviceSession(p).then(() => undefined) : undefined
          })
          rec.mobile = {
            searches: (summary.mobile as { searches: number }).searches,
            pointsBefore: (summary.mobile as { pointsBefore: number | null }).pointsBefore,
            pointsAfter: (summary.mobile as { pointsAfter: number | null }).pointsAfter
          }
          saveState(stateFile(profile), st)
          const snap = await readSnapshotFromSession(session, profile, log2, page).catch(() => null)
          if (snap) {
            lastSnap = snap
            cache.put(snap)
            hooks.onSnapshot?.(snap)
          }
        } finally {
          job.activeSession = undefined
          await session.close().catch(() => {})
        }
      }

      rec.runs.push({ at: new Date().toISOString(), summary })
      saveState(stateFile(profile), st)
      markRun(profile.id)
      log.info(`ket thuc run: ${JSON.stringify(summary).slice(0, 400)}`)
      if (lastSnap) {
        cache.put(lastSnap)
        hooks.onSnapshot?.(lastSnap)
      }
    } catch (e) {
      const msg = String((e as Error).message)
      if (job.cancelled || /has been closed|Target closed|browser has been closed|context.*closed/i.test(msg)) {
        log.warn('run da duoc dung lai theo yeu cau.')
      } else {
        log.error(`run loi: ${msg.slice(0, 300)}`)
      }
    } finally {
      jobs.delete(profile.id)
      clearActiveChain(profile.id)
      hooks.onStatusChange?.(profile.id, false)
      pumpProfile(profile.id)
      pumpQueue()
    }
  })

  return
}

/** Dang xuat khoi Microsoft/Bing trong profile (xoa toan bo cookie cua profile do). */
export async function signOut(
  profile: Profile,
  hooks: { onLine?: (l: LogLine) => void } = {}
): Promise<{ ok: boolean; cleared: number; error?: string }> {
  const log = loggerFor(profile, hooks.onLine)
  let session: Session | null = null
  try {
    const bs = await browserState(profile)
    if (bs.running && bs.cdpUrl) {
      session = await attachCdp(bs.cdpUrl)
    } else {
      session = await launchPersistent(profile.profileDir, coreConfig(profile, { headless: true }), { mobile: false })
    }
    const cookies = await session.context.cookies()
    await session.context.clearCookies()
    log.info(`dang xuat: da xoa ${cookies.length} cookie trong profile "${profile.name}"`)
    return { ok: true, cleared: cookies.length }
  } catch (e) {
    log.error(`dang xuat loi: ${String((e as Error).message).slice(0, 200)}`)
    return { ok: false, cleared: 0, error: String((e as Error).message).slice(0, 200) }
  } finally {
    if (session && session.kind === 'local') await session.close().catch(() => {})
  }
}

/** Xoa sach du lieu profile (lam lai tu dau) — dung khi profile bi dinh tai khoan sai. */
export async function resetProfile(profile: Profile): Promise<{ ok: boolean; error?: string }> {
  try {
    await closeBrowser(profile.id)
    await sleep(1500)
    const fs = await import('node:fs')
    fs.rmSync(profile.profileDir, { recursive: true, force: true })
    fs.mkdirSync(profile.profileDir, { recursive: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 200) }
  }
}

export const APP_PATHS = {
  dataDir: (): string => path.join(app.getPath('userData'), 'data')
}

/** Cap nhat so lieu cho 1 profile: MO TRINH DUYET, doc, roi ghi cache. */
export async function refresh(
  profile: Profile,
  hooks: { onLine?: (l: LogLine) => void; onSnapshot?: (s: Snapshot) => void } = {}
): Promise<CachedSnapshot> {
  const snap = await snapshot(profile)
  const cached = cache.put(snap)
  hooks.onSnapshot?.(snap)
  return cached
}

/**
 * Cap nhat so lieu cho NHIEU profile — chay SONG SONG co gioi han.
 * Moi profile la 1 user-data-dir + 1 cua so rieng nen khong dung nhau; `withProfileLock`
 * chi khoa theo tung profile. `parallel` = so acc mo cung luc (1 = tuan tu nhu truoc).
 * `gapMs` chi de lech nhip khoi dong giua cac worker (tranh mo 5 trinh duyet cung 1 giay).
 */
export async function refreshMany(
  profiles: Profile[],
  hooks: {
    onLine?: (l: LogLine) => void
    onSnapshot?: (s: Snapshot) => void
    onProgress?: (done: number, total: number, profileId: string) => void
    gapMs?: number
    parallel?: number
  } = {}
): Promise<CachedSnapshot[]> {
  const total = profiles.length
  if (!total) return []

  const requested = hooks.parallel ?? getSettings().refreshParallel ?? 3
  const limit = Math.max(1, Math.min(requested, total))
  const stagger = hooks.gapMs ?? getSettings().refreshGapMs ?? 800

  const results: (CachedSnapshot | null)[] = new Array(total).fill(null)
  let cursor = 0
  let done = 0

  hooks.onProgress?.(0, total, profiles[0].id)
  if (limit > 1) {
    hooks.onLine?.({
      at: new Date().toISOString(),
      level: 'info',
      msg: `cap nhat song song ${limit} tai khoan cung luc (tong ${total})`
    })
  }

  const worker = async (slot: number): Promise<void> => {
    // Lech nhip khoi dong theo slot de khong mo qua nhieu trinh duyet cung luc
    if (slot > 0 && stagger > 0) await sleep(stagger * slot)
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= total) return
      const p = profiles[i]
      try {
        results[i] = await refresh(p, hooks)
      } catch (e) {
        hooks.onLine?.({
          at: new Date().toISOString(),
          level: 'error',
          msg: `cap nhat ${p.name} loi: ${String((e as Error).message).slice(0, 200)}`,
          profileId: p.id
        })
      }
      done += 1
      hooks.onProgress?.(done, total, p.id)
    }
  }

  await Promise.all(Array.from({ length: limit }, (_, k) => worker(k)))
  return results.filter((r): r is CachedSnapshot => !!r)
}

