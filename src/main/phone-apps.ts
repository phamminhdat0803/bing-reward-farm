// Do danh sach "ban Bing app" tren dien thoai Android qua adb de nguoi dung map vao tai khoan.
//
// Nguyen tac nguoi dung yeu cau (2026-10-15):
//  - Menu chi can NHAN DIEN + LIET KE cac app dang co qua adb; nguoi dung tu map tay vao account.
//  - App bi go / dien thoai mat ket noi thi KHONG xoa khoi danh sach, chi danh dau "mat ket noi".
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { adb, adbAvailable, deviceInfo, listDevices } from './adb'
import type { PhoneApp, PhoneDevice, PhoneSnapshot } from '../shared/types'

export type { PhoneApp, PhoneDevice, PhoneSnapshot }

type Store = { version: number; snapshot: PhoneSnapshot }

const FILE = (): string => path.join(app.getPath('userData'), 'phone-apps.json')

/** User 150 = Secure Folder (Knox chan adb) -> bo qua. */
const SKIP_USERS = new Set([150])

function load(): PhoneSnapshot | null {
  try {
    const st = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Store
    return st.snapshot ?? null
  } catch {
    return null
  }
}

function save(snap: PhoneSnapshot): void {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.writeFileSync(FILE(), `${JSON.stringify({ version: 1, snapshot: snap }, null, 2)}\n`, 'utf8')
  } catch {
    /* bo qua */
  }
}

/** Snapshot gan nhat (doc tu file) — UI hien duoc ca khi dien thoai dang khong ket noi. */
export function getPhoneSnapshot(): PhoneSnapshot {
  return (
    load() ?? {
      at: new Date().toISOString(),
      adbAvailable: adbAvailable(),
      devices: [],
      apps: []
    }
  )
}

async function listUsers(serial: string): Promise<{ id: number; name: string }[]> {
  const r = await adb(['-s', serial, 'shell', 'pm', 'list', 'users'], 15000)
  const out: { id: number; name: string }[] = []
  for (const line of r.out.split(/\r?\n/)) {
    const m = line.match(/UserInfo\{(\d+):([^:}]*)/)
    if (m) out.push({ id: Number(m[1]), name: m[2].trim() })
  }
  return out
}

/** `pm list packages --show-versioncode` -> [{pkg, versionCode}] */
async function listPackages(serial: string, user: number): Promise<{ pkg: string; versionCode: number | null }[]> {
  const r = await adb(['-s', serial, 'shell', 'pm', 'list', 'packages', '--user', String(user), '--show-versioncode'], 30000)
  const out: { pkg: string; versionCode: number | null }[] = []
  for (const line of r.out.split(/\r?\n/)) {
    const m = line.match(/package:(\S+)(?:\s+versionCode:(\d+))?/)
    if (m) out.push({ pkg: m[1], versionCode: m[2] ? Number(m[2]) : null })
  }
  return out
}

/**
 * Do lai danh sach thiet bi + cac ban Bing app.
 * App/thiet bi khong con thay se duoc danh dau online=false (KHONG bi xoa).
 */
export async function detectPhoneApps(): Promise<PhoneSnapshot> {
  const prev = load()
  const now = new Date().toISOString()
  const snap: PhoneSnapshot = { at: now, adbAvailable: adbAvailable(), devices: [], apps: [] }

  if (!adbAvailable()) {
    snap.error = 'khong tim thay adb (C:\\platform-tools\\adb.exe hoac PATH)'
    // Giu lai toan bo du lieu cu, chi danh dau mat ket noi
    snap.devices = (prev?.devices ?? []).map((d) => ({ ...d, status: 'offline' as const }))
    snap.apps = (prev?.apps ?? []).map((a) => ({ ...a, online: false }))
    save(snap)
    return snap
  }

  const devices = await listDevices()
  if (!devices.length) {
    snap.error = 'khong thay thiet bi nao qua adb (kiem tra cap USB + USB debugging)'
    snap.devices = (prev?.devices ?? []).map((d) => ({ ...d, status: 'offline' as const }))
    snap.apps = (prev?.apps ?? []).map((a) => ({ ...a, online: false }))
    save(snap)
    return snap
  }

  for (const d of devices) {
    if (d.state !== 'device') {
      snap.devices.push({
        serial: d.serial,
        model: d.model ?? d.serial,
        android: '?',
        batteryPct: null,
        charging: false,
        screenOn: false,
        chromeVersion: null,
        status: d.state === 'unauthorized' ? 'unauthorized' : 'offline',
        lastSeenAt: now,
        error: d.state === 'unauthorized' ? 'chua bam Allow USB debugging tren dien thoai' : `adb state=${d.state}`
      })
      continue
    }

    let info: Awaited<ReturnType<typeof deviceInfo>> | null = null
    try {
      info = await deviceInfo(d.serial)
    } catch {
      /* van liet ke thiet bi */
    }
    snap.devices.push({
      serial: d.serial,
      model: info?.model ?? d.model ?? d.serial,
      android: info?.android ?? '?',
      batteryPct: info?.batteryPct ?? null,
      charging: info?.charging ?? false,
      screenOn: info?.screenOn ?? false,
      chromeVersion: info?.chromeVersion ?? null,
      status: 'online',
      lastSeenAt: now
    })

    // Cac user co the chua app
    const users = (await listUsers(d.serial)).filter((u) => !SKIP_USERS.has(u.id))
    const found: { user: number; pkg: string; versionCode: number | null }[] = []
    for (const u of users) {
      const pkgs = await listPackages(d.serial, u.id)
      for (const p of pkgs) {
        if (p.pkg === 'com.microsoft.bing' || p.pkg.startsWith('dkapp.')) {
          found.push({ user: u.id, pkg: p.pkg, versionCode: p.versionCode })
        }
      }
    }

    // versionCode cua Bing tren chinh may nay -> clone trung ma nay gan nhu chac chan la ban clone cua Bing
    const bingCodes = new Set(
      found.filter((f) => f.pkg === 'com.microsoft.bing' && f.versionCode != null).map((f) => String(f.versionCode))
    )

    for (const f of found) {
      const isBing = f.pkg === 'com.microsoft.bing'
      const vc = f.versionCode != null ? String(f.versionCode) : null
      const hint = isBing
        ? f.user === 0
          ? 'Bing gốc (user 0)'
          : `Bing ở user ${f.user} (work profile)`
        : vc && bingCodes.has(vc)
          ? `⚡ Clone trùng versionCode với Bing (${vc}) — gần như chắc chắn là bản Bing clone`
          : `Clone — versionCode ${vc ?? '?'} (app khác, vd Telegram)`
      snap.apps.push({
        id: `${d.serial}|${f.user}|${f.pkg}`,
        serial: d.serial,
        user: f.user,
        pkg: f.pkg,
        kind: isBing ? 'bing' : 'clone',
        label: isBing ? 'Microsoft Bing' : f.pkg,
        version: vc,
        hint,
        lastSeenAt: now,
        online: true
      })
    }
  }

  // Giu lai cac muc cu khong con thay (mat ket noi / app bi go) — danh dau offline
  const seenDevices = new Set(snap.devices.map((d) => d.serial))
  for (const old of prev?.devices ?? []) {
    if (!seenDevices.has(old.serial)) {
      snap.devices.push({ ...old, status: 'offline', error: 'mất kết nối (không thấy qua adb)' })
    }
  }
  const seenApps = new Set(snap.apps.map((a) => a.id))
  for (const old of prev?.apps ?? []) {
    if (!seenApps.has(old.id)) {
      snap.apps.push({ ...old, online: false, hint: `${old.hint} · MẤT KẾT NỐI hoặc app đã bị gỡ` })
    }
  }

  save(snap)
  return snap
}
