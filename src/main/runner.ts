// Runner: doc trang thai (snapshot) va chay automation cho tung profile.
// Log stream qua onLine; snapshot phat qua onSnapshot.
import path from 'node:path'
import { app } from 'electron'
import { attachCdp, launchPersistent, newDeviceSession, type Session } from './core/browser'
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
import { DEFAULTS, type CoreConfig, type LogLine } from './core/types'
import { browserState, closeBrowser, markRun } from './browsers'
import { withProfileLock } from './lock'
import { logDir, stateFile, type Profile } from './profiles'
import { resolveProxyUrl } from './proxies'

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
  earn: { progress: number; max: number } | null
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
}

const jobs = new Map<string, Job>()

export function coreConfig(profile: Profile, overrides: Partial<CoreConfig['browser']> = {}): CoreConfig {
  const cfg: CoreConfig = JSON.parse(JSON.stringify(DEFAULTS))
  const channel = profile.channel ?? 'msedge'
  cfg.browser.profileDir = profile.profileDir
  cfg.browser.headless = profile.headless
  cfg.browser.channel = channel
  cfg.browser.proxy = resolveProxyUrl(profile)
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
    const cfg = coreConfig(profile, { headless: profile.headless })
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

/** Nhu snapshot() nhung khong lay khoa — dung khi da o trong khoa (vd tu trong run). */
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
    await withSession(profile, async (s) => {
      const page = await s.context.newPage()
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
        await page.close().catch(() => {})
      }
    })
  } catch (e) {
    const msg = String((e as Error).message)
    base.error = /existing browser session|already in use/i.test(msg)
      ? 'Profile đang được mở bởi cửa sổ Edge khác (không có CDP). Hãy đóng cửa sổ đó, hoặc dùng nút “Mở trình duyệt” để app mở kèm CDP rồi automation attach vào.'
      : msg.slice(0, 300)
    log.warn(`snapshot loi: ${base.error}`)
  }

  // Trang thai run trong ngay
  const st = loadState(stateFile(profile))
  const rec = st.days[todayKey()]
  if (rec) base.runs = { desktop: rec.desktop, mobile: rec.mobile, daily: rec.daily }
  return base
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

export function runState(profileId: string): { running: boolean; kinds: string[]; log: LogLine[] } {
  const job = jobs.get(profileId)
  return job
    ? { running: true, kinds: job.kinds, log: job.log.slice(-200) }
    : { running: false, kinds: [], log: [] }
}

export function stopRun(profileId: string): { ok: boolean } {
  const job = jobs.get(profileId)
  if (!job) return { ok: false }
  job.cancelled = true
  return { ok: true }
}

export async function startRun(
  profile: Profile,
  kinds: string[],
  hooks: { onLine?: (l: LogLine) => void; onSnapshot?: (s: Snapshot) => void } = {}
): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (jobs.has(profile.id)) return { ok: false, error: 'profile nay dang chay' }
  const job: Job = { startedAt: new Date().toISOString(), kinds, cancelled: false, log: [] }
  jobs.set(profile.id, job)
  const log = loggerFor(profile, hooks.onLine, job)

  void withProfileLock(profile.id, async () => {
    try {
      const st = loadState(stateFile(profile))
      const rec = dayRecord(st)
      const cfg = coreConfig(profile)
      const pool = buildPool(cfg.queries.file)
      const nextQuery = makeQueryPicker(pool, usedQuerySet(rec))
      const shouldStop = (): boolean => job.cancelled
      const summary: Record<string, unknown> = {}

      const doDesktop = kinds.includes('desktop')
      const doMobile = kinds.includes('mobile')
      const doDaily = kinds.includes('daily')
      const doEarn = kinds.includes('earn')

      const cached = cache.get(profile.id)
      const per = cfg.search.pointsPerSearch ?? 3

      // Mức trần dự kiến: ưu tiên profile cấu hình -> cache Rewards -> mặc định (Level 2: 90/60; nếu Level 1 / <= 30 thì mobile là 0)
      const expectedDesktopMax = profile.desktopMax ?? cached?.desktop?.max ?? 90
      const expectedMobileMax = profile.mobileMax ?? cached?.mobile?.max ?? (expectedDesktopMax <= 30 ? 0 : 60)

      let desktopTarget = Math.ceil(Math.max(0, expectedDesktopMax - (cached?.desktop?.progress ?? 0)) / per)
      let mobileTarget = expectedMobileMax > 0 ? Math.ceil(Math.max(0, expectedMobileMax - (cached?.mobile?.progress ?? 0)) / per) : 0

      if (doDesktop || doDaily || doEarn) {
        await withSession(profile, async (s, kind) => {
          const page = await s.context.newPage()
          const log2 = loggerFor(profile, hooks.onLine, job)
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
            }
          } finally {
            await page.close().catch(() => {})
          }

          if (doDesktop) {
            summary.desktop = await runSearchPass({
              cfg,
              ctx: s.context,
              log: log2,
              kind: 'desktop',
              target: desktopTarget,
              nextQuery,
              rememberQuery: (q) => rememberQuery(rec, q),
              shouldStop
            })
            rec.desktop = {
              searches: (summary.desktop as { searches: number }).searches,
              pointsBefore: (summary.desktop as { pointsBefore: number | null }).pointsBefore,
              pointsAfter: (summary.desktop as { pointsAfter: number | null }).pointsAfter
            }
            saveState(stateFile(profile), st)
            hooks.onSnapshot?.(await snapshotUnlocked(profile).catch(() => null as unknown as Snapshot))
          }
          void kind

          if (doDaily && !shouldStop()) {
            summary.daily = await runDailySet({ cfg, ctx: s.context, log: log2, shouldStop })
            rec.daily = {
              items: (summary.daily as { items: unknown[] }).items,
              pointsBefore: (summary.daily as { pointsBefore: number | null }).pointsBefore,
              pointsAfter: (summary.daily as { pointsAfter: number | null }).pointsAfter
            }
            saveState(stateFile(profile), st)
            hooks.onSnapshot?.(await snapshotUnlocked(profile).catch(() => null as unknown as Snapshot))
          }

          // "Keep earning" tren /earn: cac the daily offer click la duoc cong diem
          if (doEarn && !shouldStop()) {
            summary.earn = await runEarnPass({ cfg, ctx: s.context, log: log2, shouldStop })
            rec.earn = {
              items: (summary.earn as { items: unknown[] }).items,
              pointsBefore: (summary.earn as { pointsBefore: number | null }).pointsBefore,
              pointsAfter: (summary.earn as { pointsAfter: number | null }).pointsAfter,
              sectionBefore: (summary.earn as { sectionBefore: string | null }).sectionBefore,
              sectionAfter: (summary.earn as { sectionAfter: string | null }).sectionAfter
            }
            saveState(stateFile(profile), st)
            hooks.onSnapshot?.(await snapshotUnlocked(profile).catch(() => null as unknown as Snapshot))
          }
        })
      }

      if (doMobile && !shouldStop()) {
        if (mobileTarget <= 0) {
          log.info(`[mobile] bo qua search mobile vi tran = 0 (Level 1 / tai khoan moi chua mo) hoac da dat tran`)
        } else {
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
          try {
            const log2 = loggerFor(profile, hooks.onLine, job)
            summary.mobile = await runSearchPass({
              cfg,
              ctx: session.context,
              log: log2,
              kind: 'mobile',
              target: mobileTarget,
              nextQuery,
              rememberQuery: (q) => rememberQuery(rec, q),
              shouldStop,
              preparePage: kind === 'cdp' ? (p) => newDeviceSession(p).then(() => undefined) : undefined
            })
            rec.mobile = {
              searches: (summary.mobile as { searches: number }).searches,
              pointsBefore: (summary.mobile as { pointsBefore: number | null }).pointsBefore,
              pointsAfter: (summary.mobile as { pointsAfter: number | null }).pointsAfter
            }
            saveState(stateFile(profile), st)
          } finally {
            await session.close().catch(() => {})
          }
        }
      }

      rec.runs.push({ at: new Date().toISOString(), summary })
      saveState(stateFile(profile), st)
      markRun(profile.id)
      log.info(`ket thuc run: ${JSON.stringify(summary).slice(0, 400)}`)
      const finalSnap = await snapshotUnlocked(profile).catch(() => null as unknown as Snapshot)
      if (finalSnap) {
        cache.put(finalSnap)
        hooks.onSnapshot?.(finalSnap)
      }
    } catch (e) {
      const msg = String((e as Error).message)
      // Nguoi dung tat cua so trinh duyet giua luc chay -> Playwright nem "Target page, context or browser has been closed"
      if (/has been closed|Target closed|browser has been closed|context.*closed/i.test(msg)) {
        log.warn(
          'run dung giua chung: cua so trinh duyet da bi dong. Bam "Mo trinh duyet" de mo lai kem CDP roi chay tiep — ' +
            'lan chay nay dung lai, khong mat du lieu da ghi.'
        )
      } else {
        log.error(`run loi: ${msg.slice(0, 300)}`)
      }
    } finally {
      jobs.delete(profile.id)
    }
  })

  return { ok: true, runId: `${profile.id}-${Date.now()}` }
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

/** Cap nhat lan luot nhieu profile (moi profile mot lan mo trinh duyet). */
export async function refreshMany(
  profiles: Profile[],
  hooks: {
    onLine?: (l: LogLine) => void
    onSnapshot?: (s: Snapshot) => void
    onProgress?: (done: number, total: number, profileId: string) => void
    gapMs?: number
  } = {}
): Promise<CachedSnapshot[]> {
  const out: CachedSnapshot[] = []
  for (const [i, p] of profiles.entries()) {
    try {
      out.push(await refresh(p, hooks))
    } catch (e) {
      hooks.onLine?.({
        at: new Date().toISOString(),
        level: 'error',
        msg: `cap nhat ${p.name} loi: ${String((e as Error).message).slice(0, 200)}`,
        profileId: p.id
      })
    }
    hooks.onProgress?.(i + 1, profiles.length, p.id)
    if (i < profiles.length - 1) await sleep(hooks.gapMs ?? 2000)
  }
  return out
}

