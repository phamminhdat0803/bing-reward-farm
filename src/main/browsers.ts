// Quan ly tien trinh trinh duyet cho tung profile (mo bang CDP de vua xem vua automation).
import { spawn } from 'node:child_process'
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

export async function browserState(profile: Profile): Promise<BrowserState> {
  const mem = running.get(profile.id)
  if (mem && mem.pid) {
    try {
      process.kill(mem.pid, 0)
      return { ...mem, running: true }
    } catch {
      running.delete(profile.id)
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

export async function closeBrowser(profileId: string): Promise<{ ok: boolean }> {
  const mem = running.get(profileId)
  running.delete(profileId)
  if (!mem?.pid) return { ok: false }
  await new Promise<void>((resolve) => {
    const child = spawn('taskkill', ['/PID', String(mem.pid), '/T', '/F'], { stdio: 'ignore' })
    child.on('exit', () => resolve())
    child.on('error', () => resolve())
  })
  return { ok: true }
}

export function markRun(profileId: string): void {
  const st = loadStore()
  const p = st.profiles.find((x) => x.id === profileId)
  if (p) {
    p.lastRunAt = new Date().toISOString()
    saveStore(st)
  }
}
