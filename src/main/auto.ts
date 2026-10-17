import { dispatchAutoProfiles } from './auto-dispatch'
// Che do TU DONG: cu moi N phut/gio chay lai cac task con thieu cho toi khi xong diem trong ngay.
//
// Yeu cau nguoi dung (2026-10-16):
//  1. Menu chon chu ky: moi 1 phut / moi 1 gio / moi 3 gio (hoac tat) -> tu chay lai den khi DU DIEM.
//  2. Acc gap van de proxy -> TU kiem tra toan bo proxy -> TU gan lai 3 proxy sach -> chay tiep.
//  3. Point nao sau 3 lan retry khong len -> ghi HO SO (escalation) de agent phan tich, chay lai demo;
//     neu khong co huong sua thi nguoi dung ho tro.
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { get } from './cache'
import { loadStore, updateProfile } from './profiles'
import { AUTO_INTERVALS, getSettings, setSettings } from './settings'
import { listProxies, preflightChain, resolveProxyChain, testAll } from './proxies'
import { runState, startRun } from './runner'
import type { Profile } from '../shared/types'
import { getPolicy, pausePolicy, policyPlan } from './policy-service'
import { accountPolicy, dayKey } from '../shared/policy-engine'

/**
 * Task auto quan ly — TRUNG DUNG voi kind ma runner hieu (`kinds.includes('desktop'|'mobile'|'daily'|'earn')`).
 * BUG 2026-10-16: truoc day dat ten 'dailySet'/'offers' -> runner khong nhan ra => auto KHONG BAO GIO chay
 * daily set, roi ghi ho so "khong len diem" sai. Doi ten cho khop runner.
 */
export type AutoTask = 'desktop' | 'mobile' | 'daily' | 'earn'

type Attempt = {
  at: string
  task: AutoTask
  pointsBefore: number | null
  pointsAfter: number | null
  gained: number
  taskProgressBefore: string | null
  taskProgressAfter: string | null
  proxy: string | null
  error?: string
}

export type TaskState = { tries: number; escalated: boolean; attempts: Attempt[]; lastProgress: string | null }
type AutoState = {
  date: string
  cycles: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  running: boolean
  /** thoi diem lan chay ke tiep (ISO) */
  nextAt: string | null
  remediations: number
  /** acc da thu task offers trong ngay (chi thu 1 lan, khong retry 3 lan) */
  triedOffers?: Record<string, boolean>
  /** acc dang cho nguoi dung xu ly XAC MINH/CAPTCHA thu cong (ISO) — tam bo qua khi chay tu dong */
  restricted?: Record<string, string>
  profiles: Record<string, Partial<Record<AutoTask, TaskState>>>
}

let state: AutoState = {
  date: '',
  cycles: 0,
  lastCycleAt: null,
  lastCycleResult: null,
  running: false,
  nextAt: null,
  remediations: 0,
  triedOffers: {},
  profiles: {}
}
let timer: NodeJS.Timeout | null = null
let stopRequested = false
let onEvent: ((msg: string) => void) | null = null
let onChanged: (() => void) | null = null

const todayKey = dayKey
const FILE = (): string => path.join(app.getPath('userData'), 'auto-state.json')
const ESC_DIR = (): string => path.join(app.getPath('userData'), 'escalations')

function loadState(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as AutoState
    state = { ...state, ...raw }
  } catch {
    /* chua co */
  }
  if (state.date !== todayKey()) {
    // ngay moi -> reset tien do retry
    state = { date: todayKey(), cycles: 0, lastCycleAt: null, lastCycleResult: null, running: false, nextAt: null, remediations: 0, profiles: {} }
  }
}
function saveState(): void {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.writeFileSync(FILE(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  } catch {
    /* bo qua */
  }
}

export function setAutoNotifier(fn: ((msg: string) => void) | null, changed: (() => void) | null = null): void {
  onEvent = fn
  onChanged = changed
}
const log = (m: string): void => {
  console.log(`[auto] ${m}`)
  onEvent?.(m)
}

export function autoStatus(): AutoState & { everyMs: number; enabled: boolean } {
  const s = getSettings()
  return { ...state, everyMs: s.autoEveryMs, enabled: s.autoEveryMs > 0 }
}

/** Task con thieu cua 1 acc theo so lieu da luu (khong mo trinh duyet). */
export function pendingTasks(profile: Profile): AutoTask[] {
  const plan = policyPlan(profile)
  if (plan.active) return plan.tasks
  const c = get(profile.id)
  if (!c) return ['desktop', 'mobile', 'daily']
  const out: AutoTask[] = []
  const dMax = Math.min(profile.desktopMax ?? 90, c.desktop?.max ?? profile.desktopMax ?? 90)
  if ((c.desktop?.progress ?? 0) < dMax) out.push('desktop')

  // MOBILE: chi xep lich khi acc THUC SU co diem mobile (max > 0 doc tu snapshot).
  // BUG 2026-10-16 (tu 4 ho so leo thang sai): acc Level 1 / Taiwan co mobile max = 0 nhung truoc day
  // van lay `profile.mobileMax ?? 60` -> chay 3 lan vo ich roi ghi ho so "khong len diem".
  const mMax = Math.min(profile.mobileMax ?? c.mobile?.max ?? 0, c.mobile?.max ?? 0)
  if (mMax > 0 && (c.mobile?.progress ?? 0) < mMax) out.push('mobile')

  if ((c.dailySet?.progress ?? 0) < (c.dailySet?.max ?? 3)) out.push('daily')

  // Keep earning (la 1 kind that cua runner, co diem that: vd 20/30, 10/80)
  if (c.earn && c.earn.max > 0 && c.earn.progress < c.earn.max) out.push('earn')
  return out
}

function progressOf(profileId: string, task: AutoTask): string | null {
  const c = get(profileId)
  if (!c) return null
  if (task === 'desktop') return `${c.desktop?.progress ?? 0}/${c.desktop?.max ?? '?'}`
  if (task === 'mobile') return `${c.mobile?.progress ?? 0}/${c.mobile?.max ?? '?'}`
  if (task === 'daily') return `${c.dailySet?.progress ?? 0}/${c.dailySet?.max ?? 3}`
  return c.earn ? `${c.earn.progress}/${c.earn.max}` : '—'
}

/** Nhan dien loai task tu ten hien thi (UI cu co the gui 'dailySet'/'offers'). */
export function normalizeTask(t: string): AutoTask | null {
  const s = t.toLowerCase()
  if (s === 'desktop') return 'desktop'
  if (s === 'mobile') return 'mobile'
  if (s === 'daily' || s === 'dailyset') return 'daily'
  if (s === 'earn' || s === 'offers') return 'earn'
  return null
}

/** Chon 3 proxy sach: da test OK, ping thap, chua bi acc khac dung. */
export function pickCleanProxies(count = 3): { id: string; label: string; latency: number | null }[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new Error('Số proxy phải từ 1 đến 20')
  const st = loadStore()
  const proxies = listProxies()
  const byId = new Map(proxies.map(proxy => [proxy.id, proxy]))
  const used = new Set<string>()
  for (const p of st.profiles) {
    if (p.proxyId && byId.has(p.proxyId)) used.add(byId.get(p.proxyId)!.url)
    if (p.proxy) used.add(p.proxy)
    for (const f of p.proxyFallbacks ?? []) used.add(byId.get(f)?.url ?? f)
  }
  const seen = new Set<string>()
  return proxies
    .filter((p) => (!p.status || p.status === 'active') && p.lastTest?.ok && !used.has(p.url))
    .sort((a, b) => (a.lastTest?.latency ?? 99999) - (b.lastTest?.latency ?? 99999))
    .filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true })
    .slice(0, count)
    .map((p) => ({ id: p.id, label: p.label, latency: p.lastTest?.latency ?? null }))
}

/** Kiem tra toan bo proxy roi gan lai 3 proxy sach cho acc. */
let repairQueue: Promise<void> = Promise.resolve()
function remediateProxies(profile: Profile): Promise<{ ok: boolean; detail: string }> {
  const result = repairQueue.then(() => remediateProxiesUnlocked(profile))
  repairQueue = result.then(() => {}, () => {})
  return result
}
async function remediateProxiesUnlocked(profile: Profile): Promise<{ ok: boolean; detail: string }> {
  if (stopRequested) return { ok: false, detail: 'Đã dừng lịch; không gán lại proxy' }
  const config = getPolicy(), rule = accountPolicy(config, profile.id)
  if (config.enabled && rule.proxyRecovery === 'pause') {
    pausePolicy(profile, 'Proxy lỗi — tạm dừng theo cấu hình, không tự gán lại')
    return { ok: false, detail: 'tạm dừng theo quy tắc proxy' }
  }
  state.remediations += 1
  log(`${profile.name}: proxy loi -> kiem tra toan bo kho proxy`)
  await testAll(15)
  if (stopRequested) return { ok: false, detail: 'Đã dừng lịch; không gán lại proxy' }
  const clean = pickCleanProxies(config.enabled ? rule.proxyCount : 3)
  if (!clean.length) {
    // Het proxy sach -> day la viec CAN NGUOI HO TRO (them proxy), ghi ho so rieng
    const alive = listProxies().filter((p) => (!p.status || p.status === 'active') && p.lastTest?.ok).length
    const file = path.join(ESC_DIR(), `${state.date}-${profile.id}-proxy.json`)
    try {
      fs.mkdirSync(ESC_DIR(), { recursive: true })
      fs.writeFileSync(
        file,
        `${JSON.stringify(
          {
            kind: 'bing-reward-farm/escalation',
            createdAt: new Date().toISOString(),
            profile: { id: profile.id, name: profile.name, account: profile.account },
            task: 'proxy',
            summary:
              `Kho proxy KHÔNG còn proxy sạch nào cho acc ${profile.name}: đã test toàn bộ ${listProxies().length} proxy, ` +
              `chỉ ${alive} con sống. Cần người dùng bổ sung proxy mới (hoặc tắt "chặn fallback DIRECT" nếu chấp nhận dùng IP thật).`,
            goiYChoNguoiDung: [
              'Nhập thêm proxy vào tab Proxy (dán danh sách, bấm Kiểm tra tất cả).',
              'Hoặc tắt "Không fallback DIRECT" trong Cài đặt chạy nếu chấp nhận chạy bằng IP nhà.',
              `Kho hiện có: ${listProxies().length} proxy, sống: ${alive}.`
            ],
            alive
          },
          null,
          2
        )}\n`,
        'utf8'
      )
      log(`${profile.name}: HẾT proxy sạch -> đã ghi hồ sơ cần người dùng bổ sung proxy`)
    } catch {
      /* bo qua */
    }
    return { ok: false, detail: `hết proxy sạch (${alive}/${listProxies().length} sống) — cần thêm proxy` }
  }
  updateProfile(profile.id, {
    proxyId: clean[0].id,
    proxyFallbacks: clean.slice(1).map((c) => listProxies().find(p => p.id === c.id)!.url)
  })
  const detail = clean.map((c) => `${c.label}${c.latency != null ? ` (${c.latency}ms)` : ''}`).join(', ')
  log(`${profile.name}: da gan lai proxy sach: ${detail}`)
  return { ok: true, detail }
}

export function writeEscalation(profile: Profile, task: AutoTask, ts: TaskState): string {
  const dir = ESC_DIR()
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${state.date}-${profile.id}-${task}.json`)
  const snap = get(profile.id)
  const doc = {
    kind: 'bing-reward-farm/escalation',
    createdAt: new Date().toISOString(),
    profile: { id: profile.id, name: profile.name, account: profile.account, desktopMax: profile.desktopMax, mobileMax: profile.mobileMax },
    task,
    tries: ts.tries,
    lastProgress: ts.lastProgress,
    /** Ngu canh luc leo thang — agent can de doi chieu selector / gioi han cua acc */
    context: {
      snapshotAt: snap?.at ?? null,
      level: snap?.level ?? null,
      desktop: snap?.desktop ?? null,
      mobile: snap?.mobile ?? null,
      dailySet: snap?.dailySet ?? null,
      offers: snap?.offers ?? null,
      earn: snap?.earn ? { progress: snap.earn.progress, max: snap.earn.max, blockedPoints: snap.earn.blockedPoints ?? 0 } : null,
      setLinks: snap?.setLinks?.length ?? 0,
      searchStreak: snap?.searchStreak ?? null,
      browser: snap?.browser ?? null
    },
    /** Tom tat cho agent doc nhanh */
    summary:
      `Task "${task}" của acc ${profile.name} (${profile.account}) đã chạy ${ts.tries} lần mà điểm KHÔNG tăng ` +
      `(tiến độ vẫn ${ts.lastProgress ?? '?'}). Cần phân tích: selector/điều kiện đếm điểm, trang Rewards có đổi DOM, ` +
      `acc bị giới hạn cấp độ/khu vực, hay proxy bị chặn.`,
    goiYChoAgent: [
      'Chạy lại demo: npm run dev + chạy 1 pass cho acc này, xem log logs/<id>/<ngay>.log và snapshot từng bước.',
      'Kiểm tra DOM /rewards (dialog Points breakdown) xem nhãn có đổi so với selector hiện tại.',
      'Đối chiếu điểm trước/sau từng search trong attempts bên dưới để biết có tăng thật hay chỉ trễ báo cáo (1-2 phút).',
      'Nếu acc bị khoá cấp độ/khu vực (Silver level required / vùng Taiwan) thì ghi nhận là không có điểm để lấy.'
    ],
    attempts: ts.attempts
  }
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  log(`${profile.name}: task "${task}" thất bại ${ts.tries} lần -> đã ghi hồ sơ ${path.basename(file)}`)
  return file
}

export function listEscalations(): { file: string; profile: string; task: string; tries: number; at: string; summary: string }[] {
  try {
    return fs
      .readdirSync(ESC_DIR())
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const d = JSON.parse(fs.readFileSync(path.join(ESC_DIR(), f), 'utf8')) as {
            profile?: { name?: string }
            task?: string
            tries?: number
            createdAt?: string
            summary?: string
          }
          return {
            file: path.join(ESC_DIR(), f),
            profile: d.profile?.name ?? '?',
            task: d.task ?? '?',
            tries: d.tries ?? 0,
            at: d.createdAt ?? '',
            summary: d.summary ?? ''
          }
        } catch {
          return null
        }
      })
      .filter((x): x is { file: string; profile: string; task: string; tries: number; at: string; summary: string } => x !== null)
      .sort((a, b) => b.at.localeCompare(a.at))
  } catch {
    return []
  }
}

/** Chay 1 vong cho TAT CA acc: xu ly proxy neu can, chay task con thieu, dem retry, ghi escalation. */
export async function runAutoCycle(reason = 'theo chu ky'): Promise<{ cycles: number; detail: string[] }> {
  if (state.running) return { cycles: state.cycles, detail: ['dang chay, bo qua vong nay'] }
  stopRequested = false
  if (state.date !== todayKey()) loadState()
  state.running = true
  const detail: string[] = []
  try {
    const profiles = loadStore().profiles
    log(`vong ${state.cycles + 1} (${reason}) — ${profiles.length} acc`)
    const settings = getSettings()
    const requested = settings.autoParallelRuns ?? 1
    const parallel = Math.max(1, Math.min(requested, settings.maxParallelRuns > 0 ? settings.maxParallelRuns : requested))
    log(`Điều phối lịch: ${parallel === 1 ? 'tuần tự' : `song song tối đa ${parallel} tài khoản`}`)
    const runProfile = async (initialProfile: Profile): Promise<void> => {
      let profile = initialProfile
      if (stopRequested) { detail.push('Đã dừng lịch; không bắt đầu tài khoản tiếp theo'); return }
      const busy = runState(profile.id)
      if (busy.running || busy.queued) { detail.push(`${profile.name}: đang chạy/chờ, không xếp thêm`); return }
      const pend = pendingTasks(profile)
      if (!pend.length) {
        detail.push(`${profile.name}: ${getPolicy().enabled ? policyPlan(profile).reason : 'đủ điểm'}`)
        return
      }
      // Dang cho nguoi dung xu ly XAC MINH -> khong chay tiep (tranh gui search khi trang dang bat xac minh)
      const restrictedAt = state.restricted?.[profile.id]
      if (restrictedAt) {
        detail.push(
          `${profile.name}: tạm bỏ qua — đang chờ bạn xử lý XÁC MINH thủ công (từ ${new Date(restrictedAt).toLocaleTimeString('vi-VN')})`
        )
        return
      }
      // --- proxy: kiem tra chain, remediate neu chet het ---
      let chain = resolveProxyChain(profile)
      if (chain.length) {
        const pre = await preflightChain(chain)
        if (!pre.live.length) {
          const fix = await remediateProxies(profile)
          detail.push(`${profile.name}: proxy chết hết -> ${fix.ok ? `gán lại ${fix.detail}` : fix.detail}`)
          if (!fix.ok) return
          const fresh = loadStore().profiles.find((p) => p.id === profile.id) ?? profile
          chain = resolveProxyChain(fresh)
          profile = fresh
        }
      }
      // --- chay ---
      const taskState = (task: AutoTask): TaskState => {
        const per = (state.profiles[profile.id] ??= {})
        return (per[task] ??= { tries: 0, escalated: false, attempts: [], lastProgress: null })
      }
      const runnable = pend.filter((t) => !taskState(t).escalated)
      if (!runnable.length) {
        detail.push(`${profile.name}: ${pend.length} task đã leo thang, chờ phân tích`)
        return
      }
      if (stopRequested) return
      const latestState = runState(profile.id)
      if (latestState.running || latestState.queued) { detail.push(`${profile.name}: đã có lượt chạy/chờ, không xếp thêm`); return }
      const before = get(profile.id)
      const beforeProgress = Object.fromEntries(runnable.map((t) => [t, progressOf(profile.id, t)]))
      log(`${profile.name}: chạy ${runnable.join(', ')} (còn thiếu ${pend.length} task)`)
      // Gom log cua run de dinh kem vao ho so leo thang (agent can biet vi sao that bai)
      const runLog: string[] = []
      const res = await startRun(profile, runnable, {
        onLine: (l) => {
          if (l.level === 'error' || l.level === 'warn') runLog.push(`[${l.level}] ${l.msg.slice(0, 220)}`)
          if (runLog.length > 40) runLog.shift()
          if (l.level === 'error') log(`${profile.name}: ${l.msg.slice(0, 160)}`)
        }
      })
      if (!res.ok) {
        for (const t of runnable) {
          const ts = taskState(t)
          ts.tries += 1
          ts.attempts.push({
            at: new Date().toISOString(),
            task: t,
            pointsBefore: before?.points ?? null,
            pointsAfter: null,
            gained: 0,
            taskProgressBefore: beforeProgress[t] ?? null,
            taskProgressAfter: null,
            proxy: chain[0] ?? null,
            error: res.error ?? 'khong start duoc run'
          })
          if (ts.tries >= 3 && !ts.escalated) {
            ts.escalated = true
            writeEscalation(profile, t, ts)
          }
        }
        detail.push(`${profile.name}: không chạy được (${res.error ?? '?'})`)
        return
      }
      // cho run xong (startRun tra ve ngay khi bat dau)
      while (!stopRequested && (runState(profile.id).running || runState(profile.id).queued)) {
        await new Promise((r) => setTimeout(r, 3000))
      }
      if (stopRequested) return
      if (getPolicy().enabled) {
        detail.push(`${profile.name}: ${policyPlan(profile).reason}`)
        return
      }
      // diem bao cao tre 1-2 phut -> cho them roi doc lai
      for (let elapsed = 0; elapsed < 90000 && !stopRequested; elapsed += 3000) {
        await new Promise((r) => setTimeout(r, 3000))
      }
      if (stopRequested) return
      const after = get(profile.id)

      // Run co the dung giua chung vi CA 3 PROXY DEU CHET -> day la loi HA TANG, khong tinh la loi task.
      const proxyAbort = runLog.some((l) => /ca 3 proxy deu chet|DUNG profile/i.test(l))
      if (proxyAbort) {
        const fix = await remediateProxies(profile)
        detail.push(
          `${profile.name}: run dừng vì proxy chết giữa chừng -> ${fix.ok ? `đã gán lại ${fix.detail}` : fix.detail} (không tính là lỗi task)`
        )
        return
      }

      // Bing yeu cau XAC MINH/CAPTCHA -> KHONG tinh la loi task, va TAM BO QUA acc nay cho toi khi nguoi dung xu ly.
      const restricted = runLog.some((l) => /XÁC MINH|CAPTCHA/i.test(l))
      if (restricted) {
        ;(state.restricted ??= {})[profile.id] = new Date().toISOString()
        saveState()
        detail.push(
          `${profile.name}: Bing yêu cầu XÁC MINH — tạm bỏ qua tài khoản này cho tới khi bạn xử lý thủ công (không tính là lỗi task)`
        )
        log(`${profile.name}: cần xử lý xác minh thủ công trong trình duyệt — đã tạm bỏ qua khi chạy tự động`)
        onChanged?.()
        return
      }
      // Chay sach (khong bi xac minh) -> tu go co "dang cho xu ly"
      if (state.restricted?.[profile.id]) {
        delete state.restricted[profile.id]
        saveState()
        log(`${profile.name}: đã chạy sạch trở lại — gỡ trạng thái chờ xử lý xác minh`)
      }

      for (const t of runnable) {
        const ts = taskState(t)
        const progAfter = progressOf(profile.id, t)
        const gained = (after?.points ?? 0) - (before?.points ?? 0)
        const grew = progAfter !== beforeProgress[t]
        ts.attempts.push({
          at: new Date().toISOString(),
          task: t,
          pointsBefore: before?.points ?? null,
          pointsAfter: after?.points ?? null,
          gained,
          taskProgressBefore: beforeProgress[t] ?? null,
          taskProgressAfter: progAfter,
          proxy: chain[0] ?? null,
          error: runLog.length ? runLog.slice(-6).join(' | ').slice(0, 500) : undefined
        })
        ts.lastProgress = progAfter
        if (grew) {
          ts.tries = 0
          detail.push(`${profile.name}/${t}: +${gained} điểm (${beforeProgress[t]} → ${progAfter})`)
        } else {
          ts.tries += 1
          detail.push(`${profile.name}/${t}: KHÔNG tăng (lần ${ts.tries}/3)`)
          if (ts.tries >= 3 && !ts.escalated) {
            ts.escalated = true
            writeEscalation(profile, t, ts)
            detail.push(`${profile.name}/${t}: đã ghi hồ sơ để agent phân tích`)
          }
        }
      }
    }
    await dispatchAutoProfiles(profiles, parallel, runProfile, () => stopRequested, (profile, error) => {
      const message = String((error as Error).message).slice(0, 160)
      detail.push(`${profile.name}: lỗi điều phối (${message})`)
      log(`${profile.name}: lỗi điều phối (${message})`)
    })
    state.cycles += 1
    state.lastCycleAt = new Date().toISOString()
    state.lastCycleResult = detail.join(' · ').slice(0, 2000)
    log(`xong vong ${state.cycles}: ${state.lastCycleResult.slice(0, 300)}`)
  } catch (e) {
    detail.push(`loi vong chay: ${String((e as Error).message).slice(0, 160)}`)
    log(`loi vong chay: ${String((e as Error).message).slice(0, 200)}`)
  } finally {
    state.running = false
    state.nextAt = getSettings().autoEveryMs > 0 ? new Date(Date.now() + getSettings().autoEveryMs).toISOString() : null
    saveState()
    onChanged?.()
  }
  return { cycles: state.cycles, detail }
}

/** Khoi dong lai vong hen gio theo cai dat hien tai. */
export function startAutoLoop(): void {
  loadState()
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  const every = getSettings().autoEveryMs
  if (every <= 0) {
    state.nextAt = null
    saveState()
    log('che do tu dong: TAT')
    onChanged?.()
    return
  }
  state.nextAt = new Date(Date.now() + every).toISOString()
  saveState()
  timer = setInterval(() => {
    void runAutoCycle('hẹn giờ').then(() => {
      // neu doi chu ky thi vong lap se duoc khoi dong lai
    })
  }, every)
  log(`che do tu dong: moi ${Math.round(every / 60000)} phút (lần tới ${new Date(state.nextAt).toLocaleTimeString('vi-VN')})`)
  onChanged?.()
}

/** Bat/tat hoac doi chu ky tu UI. */
export function setAutoEvery(everyMs: number): AutoState & { everyMs: number; enabled: boolean } {
  if (!(AUTO_INTERVALS as readonly number[]).includes(everyMs)) throw new Error('Chu kỳ tự động không hợp lệ')
  if (everyMs === 0) stopRequested = true
  setSettings({ autoEveryMs: everyMs })
  startAutoLoop()
  return autoStatus()
}

export function stopAutoNow(): void {
  stopRequested = true
  if (timer) clearInterval(timer)
  timer = null
  setSettings({ autoEveryMs: 0 })
  state.nextAt = null
  saveState()
  onChanged?.()
  log('đã dừng hẹn giờ tự động')
}
