// Quan ly danh sach profile: file JSON trong userData, cap phat cong CDP, thu muc profile.
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type Profile = {
  id: string
  name: string
  account: string
  profileDir: string
  cdpPort: number | null
  /** 'msedge' | 'chrome' */
  channel: string
  headless: boolean
  desktopMax?: number | null
  mobileMax?: number | null
  proxy?: string | null
  /** Id proxy trong kho (tab Proxy) — uu tien hon `proxy` */
  proxyId?: string | null
  /** Proxy du phong theo thu tu (sau proxy chinh) */
  proxyFallbacks?: string[] | null
  /**
   * Proxy song gan nhat (do preflight ghi nho). CHI la goi y uu tien khi launch,
   * KHONG thay the proxyId/proxyFallbacks cua nguoi dung.
   */
  lastGoodProxy?: string | null
  /** Serial thiet bi Android (adb devices) de chay pass mobile tren dien thoai that */
  deviceSerial?: string | null
  /** Cong CDP forward sang dien thoai (mac dinh 9411) */
  devicePort?: number | null
  /** User Android chua app (0 = chinh, 10 = work profile) */
  deviceUser?: number | null
  /** Package ban Bing app duoc map (com.microsoft.bing hoac dkapp.*) */
  devicePackage?: string | null
  note?: string
  createdAt: string
  lastRunAt: string | null
}

type Store = { version: number; portRange: [number, number]; profiles: Profile[] }

const FILE = (): string => path.join(app.getPath('userData'), 'profiles.json')
const DATA_DIR = (): string => path.join(app.getPath('userData'), 'profiles')

function defaults(): Store {
  return { version: 1, portRange: [9400, 9500], profiles: [] }
}

export function loadStore(): Store {
  try {
    const st = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Store
    if (!Array.isArray(st.profiles)) throw new Error('bad store')
    // Tuong thich nguoc: profile cu chua co channel -> msedge
    st.profiles = st.profiles.map((p) => ({ ...p, channel: p.channel ?? 'msedge' }))
    return st
  } catch {
    const st = defaults()
    // Profile mac dinh: tro vao profile da dang nhap cua repo bing-reward (neu co)
    const legacy = 'D:\\Workspace\\NodeJS\\bing-reward\\data\\profile'
    if (fs.existsSync(legacy)) {
      st.profiles.push({
        id: 'default',
        name: 'Tài khoản chính',
        account: 'Đạt Phạm',
        profileDir: legacy,
        cdpPort: 9400,
        channel: 'msedge',
        headless: false,
        note: 'Profile cũ từ D:\\Workspace\\NodeJS\\bing-reward (đã đăng nhập sẵn)',
        createdAt: new Date().toISOString(),
        lastRunAt: null
      })
    }
    saveStore(st)
    return st
  }
}

export function saveStore(st: Store): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true })
  fs.writeFileSync(FILE(), `${JSON.stringify(st, null, 2)}\n`, 'utf8')
}

export function allocatePort(st: Store): number {
  const used = new Set(st.profiles.map((p) => p.cdpPort).filter((p): p is number => typeof p === 'number'))
  for (let port = st.portRange[0]; port <= st.portRange[1]; port += 1) {
    if (!used.has(port)) return port
  }
  throw new Error('het cong CDP trong dai ' + st.portRange.join('-'))
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `profile-${Date.now()}`
  )
}

export function addProfile(input: Partial<Profile>): Profile {
  const st = loadStore()
  const name = (input.name || '').trim() || `Profile ${st.profiles.length + 1}`
  const id = input.id?.trim() || `${slugify(name)}`
  if (st.profiles.some((p) => p.id === id)) throw new Error(`id "${id}" da ton tai`)
  const port = input.cdpPort ?? allocatePort(st)
  const dir = input.profileDir?.trim() || path.join(DATA_DIR(), id)
  const p: Profile = {
    id,
    name,
    account: input.account ?? '',
    profileDir: dir,
    cdpPort: port,
    channel: input.channel ?? 'msedge',
    headless: input.headless ?? false,
    desktopMax: input.desktopMax ?? null,
    mobileMax: input.mobileMax ?? null,
    proxy: input.proxy ? input.proxy.trim() : null,
    deviceSerial: input.deviceSerial ?? null,
    devicePort: input.devicePort ?? 9411,
    deviceUser: input.deviceUser ?? null,
    devicePackage: input.devicePackage ?? null,
    proxyId: input.proxyId ?? null,
    proxyFallbacks: input.proxyFallbacks ?? null,
    note: input.note,
    createdAt: new Date().toISOString(),
    lastRunAt: null
  }
  st.profiles.push(p)
  saveStore(st)
  return p
}

export function updateProfile(id: string, patch: Partial<Profile>): Profile {
  const st = loadStore()
  const p = st.profiles.find((x) => x.id === id)
  if (!p) throw new Error(`khong thay profile "${id}"`)
  Object.assign(p, patch, { id: p.id })
  saveStore(st)
  return p
}

export function removeProfile(id: string, deleteDir = false): boolean {
  const st = loadStore()
  const p = st.profiles.find((x) => x.id === id)
  if (!p) return false
  st.profiles = st.profiles.filter((x) => x.id !== id)
  saveStore(st)
  if (deleteDir) {
    try {
      fs.rmSync(p.profileDir, { recursive: true, force: true })
    } catch {
      /* dang bi khoa */
    }
  }
  return true
}

export function getProfile(id: string): Profile | undefined {
  return loadStore().profiles.find((p) => p.id === id)
}

export function stateFile(profile: Profile): string {
  return path.join(app.getPath('userData'), 'state', `${profile.id}.json`)
}

export function logDir(profile: Profile): string {
  return path.join(app.getPath('userData'), 'logs', profile.id)
}
