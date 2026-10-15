// Dieu khien dien thoai Android qua ADB: liet ke thiet bi, lay thong tin, mo Chrome qua CDP,
// giu man hinh sang, mo URL. Dung cho pass "search mobile" tren may that.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** Duong dan adb: uu tien ban cai san, cuoi cung moi dua vao PATH. */
export function adbPath(): string {
  const candidates = [
    'C:\\platform-tools\\adb.exe',
    path.join(process.env.LOCALAPPDATA ?? '', 'Android\\Sdk\\platform-tools\\adb.exe'),
    path.join(process.env.USERPROFILE ?? '', 'AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'),
    'C:\\Android\\platform-tools\\adb.exe'
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return 'adb'
}

export function adbAvailable(): boolean {
  const p = adbPath()
  return p === 'adb' || fs.existsSync(p)
}

/** Chay 1 lenh adb, tra ve stdout (khong nem loi ra ngoai). */
export function adb(args: string[], timeoutMs = 20000): Promise<{ ok: boolean; out: string; err?: string }> {
  return new Promise((resolve) => {
    execFile(adbPath(), args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, out: String(stdout ?? ''), err: String(stderr || err.message).slice(0, 300) })
        return
      }
      resolve({ ok: true, out: String(stdout ?? '') })
    })
  })
}

export type AdbDevice = {
  serial: string
  state: string
  product?: string
  model?: string
  device?: string
  transportId?: string
}

/** `adb devices -l` -> danh sach thiet bi (ke ca unauthorized/offline). */
export async function listDevices(): Promise<AdbDevice[]> {
  const r = await adb(['devices', '-l'])
  if (!r.ok) return []
  const out: AdbDevice[] = []
  for (const line of r.out.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || /^List of devices/i.test(t)) continue
    const parts = t.split(/\s+/)
    if (parts.length < 2) continue
    const [serial, state, ...rest] = parts
    const dev: AdbDevice = { serial, state }
    for (const kv of rest) {
      const [k, v] = kv.split(':')
      if (k === 'product') dev.product = v
      else if (k === 'model') dev.model = v
      else if (k === 'device') dev.device = v
      else if (k === 'transport_id') dev.transportId = v
    }
    out.push(dev)
  }
  return out
}

export type DeviceInfo = {
  serial: string
  model: string
  android: string
  sdk: number
  batteryPct: number | null
  charging: boolean
  screenOn: boolean
  chromeVersion: string | null
  /** IP LAN cua dien thoai (rong = dang dung 4G hoac khong co WiFi) */
  wlanIp: string | null
  /** Ten nha mang di dong (rong = khong co SIM / dang WiFi-only) */
  carrier: string | null
}

async function prop(serial: string, key: string): Promise<string> {
  const r = await adb(['-s', serial, 'shell', 'getprop', key], 10000)
  return r.ok ? r.out.trim() : ''
}

/** Thong tin 1 thiet bi: model, Android, pin, man hinh, Chrome, IP WiFi, nha mang. */
export async function deviceInfo(serial: string): Promise<DeviceInfo> {
  const [model, androidV, sdkV, batteryRaw, powerRaw, pkgRaw, ipRaw, carrierRaw] = await Promise.all([
    prop(serial, 'ro.product.model'),
    prop(serial, 'ro.build.version.release'),
    prop(serial, 'ro.build.version.sdk'),
    adb(['-s', serial, 'shell', 'dumpsys', 'battery'], 12000),
    adb(['-s', serial, 'shell', 'dumpsys', 'power'], 12000),
    adb(['-s', serial, 'shell', 'dumpsys', 'package', 'com.android.chrome'], 20000),
    adb(['-s', serial, 'shell', 'ip', '-4', 'addr', 'show', 'wlan0'], 10000),
    prop(serial, 'gsm.operator.alpha')
  ])

  const level = batteryRaw.out.match(/level:\s*(\d+)/i)
  const charging = /AC powered:\s*true|USB powered:\s*true|Wireless powered:\s*true/i.test(batteryRaw.out)
  const wake = powerRaw.out.match(/mWakefulness=(\w+)/)
  const chrome = pkgRaw.out.match(/versionName=([\d.]+)/)
  const wlan = ipRaw.out.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/)

  return {
    serial,
    model: model || serial,
    android: androidV || '?',
    sdk: Number(sdkV) || 0,
    batteryPct: level ? Number(level[1]) : null,
    charging,
    screenOn: wake ? /awake/i.test(wake[1]) : false,
    chromeVersion: chrome ? chrome[1] : null,
    wlanIp: wlan ? wlan[1] : null,
    carrier: carrierRaw && carrierRaw !== 'null' && carrierRaw.replace(/[,\s]/g, '') ? carrierRaw : null
  }
}

/** Danh thuc man hinh + giu sang (tranh ngu giua pass). */
export async function wakeDevice(serial: string): Promise<void> {
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], 10000)
  await adb(['-s', serial, 'shell', 'svc', 'power', 'stayon', 'true'], 10000)
}

/**
 * Bat remote debugging cua Chrome tren dien thoai qua ADB forward.
 * LUU Y do that tren may nguoi dung (2026-10-15):
 *  - Chrome KHONG phai trinh duyet mac dinh (Opera moi la mac dinh) => phai mo DUNG package Chrome,
 *    neu khong socket `chrome_devtools_remote` khong bao gio xuat hien.
 *  - Socket chi mo khi Chrome dang chay => phai kiem tra `/proc/net/unix` truoc khi forward.
 */
export async function forwardChrome(
  serial: string,
  port: number
): Promise<{ ok: boolean; version?: string; error?: string }> {
  await adb(['-s', serial, 'forward', '--remove', `tcp:${port}`], 8000)
  const fwd = await adb(['-s', serial, 'forward', `tcp:${port}`, 'localabstract:chrome_devtools_remote'], 10000)
  if (!fwd.ok) return { ok: false, error: fwd.err ?? 'khong forward duoc cong CDP' }

  const started = Date.now()
  let chromeLaunched = false
  while (Date.now() - started < 30000) {
    const version = await cdpVersion(port)
    if (version) return { ok: true, version }

    // Chrome chua chay -> mo Chrome that (khong dung intent VIEW vi se mo trinh duyet mac dinh)
    if (!chromeLaunched || !(await chromeSocketOpen(serial))) {
      await openChrome(serial, 'https://www.bing.com/')
      chromeLaunched = true
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return {
    ok: false,
    error:
      'Chrome tren dien thoai chua mo cong devtools. Kiem tra: USB debugging da bat, da mo Chrome it nhat 1 lan, man hinh dang mo khoa.'
  }
}

async function cdpVersion(port: number): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const j = (await res.json()) as { Browser?: string }
    return j.Browser ?? 'unknown'
  } catch {
    return null
  }
}

/** Socket `@chrome_devtools_remote` da mo chua (Chrome dang chay + USB debugging bat). */
export async function chromeSocketOpen(serial: string): Promise<boolean> {
  const r = await adb(['-s', serial, 'shell', 'cat', '/proc/net/unix'], 10000)
  return /chrome_devtools_remote/.test(r.out)
}

/** Mo DUNG Chrome (khong phai trinh duyet mac dinh) voi 1 URL. */
export async function openChrome(serial: string, url: string): Promise<void> {
  const r = await adb(
    ['-s', serial, 'shell', 'am', 'start', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', url],
    15000
  )
  if (!r.ok) {
    // May khac co the dat ten activity khac -> thu intent VIEW nhung ep package Chrome
    await adb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-p', 'com.android.chrome'], 15000)
  }
}

/** Mo URL bang trinh duyet mac dinh cua may (co the la Opera/Coc Coc...). */
export async function openUrl(serial: string, url: string): Promise<void> {
  await adb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url], 12000)
}

/** Tat forward khi khong dung nua. */
export async function removeForward(serial: string, port: number): Promise<void> {
  await adb(['-s', serial, 'forward', '--remove', `tcp:${port}`], 8000)
}

/** Go khoa man hinh neu co (chi hoat dong khi khong dat PIN bao mat). */
export async function unlockDevice(serial: string): Promise<void> {
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'], 8000)
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_MENU'], 8000)
}
