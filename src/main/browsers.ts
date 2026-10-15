// Quan ly tien trinh trinh duyet cho tung profile (mo bang CDP de vua xem vua automation).
import { execFileSync, spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright-core'
import { EARN_URL } from './core/rewards'
import { findBrowserExe, openCdpBrowser, parseProxy, waitForCdp } from './core/browser'
import { exeFor } from './browser-detect'
import { allocatePort, loadStore, saveStore, type Profile } from './profiles'
import { resolveProxyChain, resolveProxyUrl } from './proxies'
import { withProfileLock } from './lock'

export type BrowserState = {
  running: boolean
  pid: number | null
  cdpUrl: string | null
  port: number | null
  startedAt: string | null
  managed: boolean
}

const running = new Map<string, BrowserState>()

/**
 * Cong con MO khong? Kiem tra kieu TCP connect (nhanh, ~ms) thay vi HTTP /json/version:
 * vua mo trinh duyet thi endpoint HTTP co the ban/treo => neu dung HTTP de ket luan
 * "da dong" se bao sai (bang hien 'chua mo' ngay sau khi mo).
 */
export function portOpen(port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    if (!port || port <= 0) {
      resolve(false)
      return
    }
    const sock = net.connect({ host: '127.0.0.1', port })
    let settled = false
    const done = (v: boolean): void => {
      if (settled) return
      settled = true
      sock.destroy()
      resolve(v)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
  })
}

/** So lan lien tiep khong thay cong CDP -> tranh ket luan som do 1 lan ban. */
const closeStrikes = new Map<string, number>()

export async function cdpAlive(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(600) })
    if (res.ok) return true
  } catch {
    /* port dong */
  }
  return false
}

export async function ensurePort(profile: Profile): Promise<number> {
  if (profile.cdpPort) return profile.cdpPort
  const st = loadStore()
  const port = allocatePort(st)
  const p = st.profiles.find((x) => x.id === profile.id)
  if (p) {
    p.cdpPort = port
    saveStore(st)
  }
  return port
}

/** Tien trinh con song khong (chi la kiem tra phu). */
function pidAlive(pid: number | null): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function browserState(profile: Profile): Promise<BrowserState> {
  const mem = running.get(profile.id)
  if (mem?.running) {
    // Cong CDP (kieu TCP) la bang chung that: nguoi dung bam X thi cong tat.
    // Nhung KHONG ket luan ngay sau 1 lan fail: vua mo browser thi endpoint con ban
    // => phai fail 2 lan lien tiep moi coi la da dong (tranh bao sai 'chua mo').
    const port = mem.port ?? profile.cdpPort ?? 0
    if (await portOpen(port)) {
      closeStrikes.delete(profile.id)
      return { ...mem, running: true }
    }
    const strikes = (closeStrikes.get(profile.id) ?? 0) + 1
    closeStrikes.set(profile.id, strikes)
    if (strikes < 2 && pidAlive(mem.pid)) return { ...mem, running: true }
    running.delete(profile.id)
    closeStrikes.delete(profile.id)
    return {
      running: false,
      pid: null,
      cdpUrl: null,
      port: profile.cdpPort ?? null,
      startedAt: null,
      managed: false
    }
  }
  // Co the trinh duyet do nguoi dung tu mo (hoac con song sau khi app tat)
  if (profile.cdpPort && (await cdpAlive(profile.cdpPort))) {
    const state: BrowserState = {
      running: false,
      pid: null,
      cdpUrl: `http://127.0.0.1:${profile.cdpPort}`,
      port: profile.cdpPort,
      startedAt: null,
      managed: false
    }
    running.set(profile.id, state)
    return { ...state, running: true }
  }
  return { running: false, pid: null, cdpUrl: null, port: profile.cdpPort ?? null, startedAt: null, managed: false }
}

export async function openBrowser(profile: Profile): Promise<BrowserState & { exe?: string }> {
  return withProfileLock(profile.id, () => openBrowserUnlocked(profile))
}

async function openBrowserUnlocked(profile: Profile): Promise<BrowserState & { exe?: string }> {
  const st = await browserState(profile)
  if (st.running) return st

  const channel = profile.channel ?? 'msedge'
  const exe = (await exeFor(channel)) ?? findBrowserExe(channel)
  if (!exe) throw new Error(`khong tim thay trinh duyet "${channel}" tren may`)
  const port = await ensurePort(profile)
  // Mo thu cong cung phai dung dung kho proxy: proxyId -> url, va chuoi du phong
  const proxyUrl = resolveProxyUrl(profile)
  const proxyChain = resolveProxyChain(profile)
  const res = openCdpBrowser(profile.profileDir, port, channel, EARN_URL, exe, proxyUrl, proxyChain)
  if (proxyChain.length > 1) {
    console.log("[proxy] mo browser voi chain " + proxyChain.length + " proxy: " + proxyChain.join(" , "))
  }
  const ok = await waitForCdp(res.cdpUrl, 30000)
  if (!ok) throw new Error(`CDP khong len o cong ${port} (kiem tra profile co bi khoa khong)`)

  const parsed = parseProxy(proxyUrl)
  if (parsed?.username && parsed?.password) {
    try {
      const browser = await chromium.connectOverCDP(res.cdpUrl)
      const ctx = browser.contexts()[0]
      if (ctx) {
        await ctx.setHTTPCredentials({
          username: parsed.username,
          password: parsed.password
        })
      }
    } catch {
      /* bo qua */
    }
  }

  const state: BrowserState = {
    running: true,
    pid: res.pid,
    cdpUrl: res.cdpUrl,
    port,
    startedAt: new Date().toISOString(),
    managed: true
  }
  running.set(profile.id, state)
  return { ...state, running: true, exe: res.exe }
}

/** Tim PID cua tien trinh dang listen tren cong (browser mo bang --remote-debugging-port). */
function pidListeningOn(port: number): number | null {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true })
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i)
      if (m && Number(m[1]) === port) return Number(m[2])
    }
  } catch {
    /* bo qua */
  }
  return null
}

function killTree(pid: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })
}

/**
 * Dong trinh duyet cua 1 profile.
 * Truong hop THUONG GAP: browser do nguoi dung tu mo, hoac app vua khoi dong lai
 * (map `running` rong) => khong biet pid. Truoc day ham nay tra {ok:false} va KHONG lam gi
 * (nut "Dong trinh duyet" nhu bi liet). Gio lan luot: pid da luu -> PID theo cong CDP -> nho CDP tu tat.
 */
export async function closeBrowser(profileId: string): Promise<{ ok: boolean; error?: string }> {
  const profile = loadStore().profiles.find((p) => p.id === profileId) ?? null
  const mem = running.get(profileId)
  running.delete(profileId)
  closeStrikes.delete(profileId)

  const port = mem?.port ?? profile?.cdpPort ?? null
  let pid = mem?.pid ?? null
  if (!pid && port) pid = pidListeningOn(port)

  if (pid) {
    await killTree(pid)
    return { ok: true }
  }

  // Khong tim thay tien trinh: nho CDP bao browser tu dong (browser mo tay khong co pid trong map)
  if (port && (await cdpAlive(port))) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 })
      await browser.close()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: `không đóng được qua CDP: ${String((e as Error).message).slice(0, 120)}` }
    }
  }

  return { ok: false, error: 'không thấy trình duyệt nào đang mở cho tài khoản này' }
}

/**
 * Kiem tra lai cac browser dang duoc coi la mo (dinh ky tu index.ts).
 * Tra ve danh sach vua phat hien DA DONG (CDP tat) de UI cap nhat ngay.
 */
export async function verifyRunningBrowsers(profiles: Profile[]): Promise<{ id: string; name: string }[]> {
  const closed: { id: string; name: string }[] = []
  for (const p of profiles) {
    if (!running.get(p.id)?.running) continue
    // Dung chung browserState de huong dung logic (portOpen + 2 lan fail lien tiep)
    // eslint-disable-next-line no-await-in-loop
    const st = await browserState(p)
    if (!st.running) closed.push({ id: p.id, name: p.name })
  }
  return closed
}

export function markRun(profileId: string): void {
  const st = loadStore()
  const p = st.profiles.find((x) => x.id === profileId)
  if (p) {
    p.lastRunAt = new Date().toISOString()
    saveStore(st)
  }
}
