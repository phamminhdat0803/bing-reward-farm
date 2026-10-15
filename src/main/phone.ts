// Dieu khien Bing app tren dien thoai Android: mo app, vao trang Rewards, doc diem, diem danh.
//
// Kich ban da kiem chung tren Galaxy A31 (2026-10-15):
//  1. am start -n com.microsoft.bing/...LauncherAlias  (KHONG dung MainSapphireActivity: not exported)
//  2. cho UI idle -> uiautomator dump -> tap node text="Rewards" (the Rewards o trang chu)
//     (deep link bing://rewards KHONG mo duoc trang Rewards)
//  3. do `/proc/net/unix` tim @webview_devtools_remote_<pid> (pid doi moi lan app restart)
//  4. adb forward tcp:<port> localabstract:webview_devtools_remote_<pid> -> CDP vao mini-app HTML
//  5. doc diem: document.body.innerText, regex /(\d[\d.,]*)\s*điểm/
//  6. diem danh: click `div.daily-set .streak-card-wrapper.active` -> diem tang, class doi thanh "checked"
import { chromium } from 'playwright-core'
import { adb } from './adb'

const WEBVIEW_PREFIX = 'webview_devtools_remote_'

/** Doc cay UI cua man hinh hien tai (retry vi uiautomator hay tra rong khi UI dang animate). */
export async function dumpUi(serial: string, attempts = 5): Promise<string> {
  for (let i = 0; i < attempts; i += 1) {
    await adb(['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/brf_ui.xml'], 20000)
    const r = await adb(['-s', serial, 'shell', 'cat', '/sdcard/brf_ui.xml'], 20000)
    if (r.ok && r.out.length > 600) return r.out
    await new Promise((res) => setTimeout(res, 1200))
  }
  return ''
}

/** Tap vao node co text (hoac content-desc) khop chinh xac. */
export async function tapByText(serial: string, text: string): Promise<boolean> {
  const xml = await dumpUi(serial)
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<node[^>]*(?:text|content-desc)="${esc}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`)
  const m = xml.match(re)
  if (!m) return false
  const x = Math.round((Number(m[1]) + Number(m[3])) / 2)
  const y = Math.round((Number(m[2]) + Number(m[4])) / 2)
  await adb(['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], 10000)
  return true
}

/** Mo Bing app o 1 user (mac dinh user 0). Dung LauncherAlias — activity chinh KHONG exported. */
export async function launchBing(serial: string, user = 0, timeoutMs = 25000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const r = await adb(
      [
        '-s',
        serial,
        'shell',
        'am',
        'start',
        ...(user ? ['--user', String(user)] : []),
        '-a',
        'android.intent.action.MAIN',
        '-c',
        'android.intent.category.LAUNCHER',
        '-n',
        'com.microsoft.bing/com.microsoft.sapphire.app.main.LauncherAlias'
      ],
      20000
    )
    if (r.ok || /Warning: Activity not started/.test(r.out + (r.err ?? ''))) return true
    await new Promise((res) => setTimeout(res, 2000))
  }
  return false
}

/** Do socket webview devtools dang mo (theo pid). User 10 se co socket rieng. */
export async function findWebViewPids(serial: string): Promise<number[]> {
  const r = await adb(['-s', serial, 'shell', 'cat', '/proc/net/unix'], 15000)
  const pids = new Set<number>()
  for (const m of r.out.matchAll(new RegExp(`${WEBVIEW_PREFIX}(\\d+)`, 'g'))) pids.add(Number(m[1]))
  return Array.from(pids)
}

/**
 * Mo trang Rewards trong app va bat CDP.
 * Tra ve { ok, port, pid } — port la cong host da forward.
 */
export async function openRewardsCdp(
  serial: string,
  user: number,
  basePort = 9601
): Promise<{ ok: boolean; port?: number; pid?: number; error?: string }> {
  // 1. Mo app
  await launchBing(serial, user)
  await new Promise((res) => setTimeout(res, 6000))

  // 2. Bam the "Rewards" o trang chu (thu vai lan, app co the dang o man hinh khac)
  for (let i = 0; i < 3; i += 1) {
    if (await tapByText(serial, 'Rewards')) break
    await new Promise((res) => setTimeout(res, 3000))
  }
  await new Promise((res) => setTimeout(res, 6000))

  // 3. Do socket webview (pid doi theo lan chay)
  let pid: number | null = null
  for (let i = 0; i < 12; i += 1) {
    const pids = await findWebViewPids(serial)
    if (pids.length) {
      pid = pids[pids.length - 1]
      break
    }
    await new Promise((res) => setTimeout(res, 2000))
  }
  if (!pid) return { ok: false, error: 'khong thay socket webview_devtools_remote (trang Rewards chua mo?)' }

  // 4. Forward sang cong host
  for (let port = basePort; port < basePort + 10; port += 1) {
    await adb(['-s', serial, 'forward', '--remove', `tcp:${port}`], 8000)
    const f = await adb(['-s', serial, 'forward', `tcp:${port}`, `localabstract:${WEBVIEW_PREFIX}${pid}`], 10000)
    if (!f.ok) continue
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) {
        const list = (await res.json()) as { url?: string }[]
        if (list.some((t) => (t.url ?? '').includes('miniapps'))) return { ok: true, port, pid }
        if (list.length) return { ok: true, port, pid } // co target khac cung chap nhan
      }
    } catch {
      /* thu cong khac */
    }
  }
  return { ok: false, error: `forward duoc pid ${pid} nhung khong mo duoc CDP` }
}

export type PhoneRewards = {
  points: number | null
  todayPoints: string | null
  streak: string | null
  checkInAvailable: boolean
  /** Gia tri diem danh se nhan (5/10/15/50) neu con o active */
  nextValue: number | null
  raw: string
}

/** Doc trang Rewards qua CDP (KHONG dong browser cua app). */
export async function readRewards(port: number): Promise<PhoneRewards> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 })
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('miniapps')) ?? ctx.pages()[0]
  if (!page) throw new Error('khong thay trang Rewards trong WebView')
  await page.waitForTimeout(500)
  const data = await page.evaluate(() => {
    const txt = (document.body.innerText || '').replace(/\s+/g, ' ')
    const active = document.querySelector('div.daily-set .streak-card-wrapper.active') ||
      document.querySelector('.streak-card-wrapper.active')
    const wrap = active?.closest('.check-in-card')
    return {
      txt,
      activeValue: wrap ? Number((wrap.textContent || '').replace(/\D/g, '')) || null : null,
      checkInAvailable: !!active
    }
  })
  const pointsMatch = data.txt.match(/(\d[\d.,]*)\s*điểm/)
  const toNum = (s: string | undefined): number | null =>
    s ? Number(s.replace(/[.,]/g, '')) : null
  return {
    points: toNum(pointsMatch?.[1]),
    todayPoints: data.txt.match(/Điểm hôm nay\s*([\d/]+)/)?.[1] ?? null,
    streak: data.txt.match(/Chuỗi liên tiếp\s*([\d]+\s*day)/)?.[1] ?? null,
    checkInAvailable: data.checkInAvailable,
    nextValue: data.activeValue,
    raw: data.txt.slice(0, 400)
  }
}

/** Bam diem danh neu con o active. Tra ve diem truoc/sau. */
export async function doCheckIn(port: number): Promise<{
  ok: boolean
  before: number | null
  after: number | null
  gained: number
  alreadyDone: boolean
  error?: string
}> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 })
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().includes('miniapps')) ?? ctx.pages()[0]
  if (!page) return { ok: false, before: null, after: null, gained: 0, alreadyDone: false, error: 'khong thay trang Rewards' }
  await page.waitForTimeout(400)

  const readPoints = async (): Promise<number | null> => {
    const t = await page.evaluate(() => (document.body.innerText.match(/(\d[\d.,]*)\s*điểm/) || [])[1] ?? null)
    return t ? Number(t.replace(/[.,]/g, '')) : null
  }
  const before = await readPoints()

  const box = await page.evaluate(() => {
    const el =
      document.querySelector('div.daily-set .streak-card-wrapper.active') ||
      document.querySelector('.streak-card-wrapper.active')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  if (!box) return { ok: true, before, after: before, gained: 0, alreadyDone: true }

  await page.mouse.click(box.x, box.y)
  await page.waitForTimeout(6000)
  const after = await readPoints()
  return {
    ok: true,
    before,
    after,
    gained: before != null && after != null ? after - before : 0,
    alreadyDone: false
  }
}

/** Tat forward cua cac cong da dung. */
export async function closePhoneCdp(serial: string, ports: number[]): Promise<void> {
  for (const p of ports) await adb(['-s', serial, 'forward', '--remove', `tcp:${p}`], 8000)
}

export type PhoneAccount = {
  signedIn: boolean
  /** Email acc đang đăng nhập trong Bing app (doc tu panel avatar) */
  email: string | null
  name: string | null
  points: number | null
  todayPoints: string | null
  streak: string | null
  raw: string
  error?: string
}

/** Vi tri avatar tai khoan o goc trai tren man hinh home cua Bing app (1080x2400). */
const AVATAR = { x: 75, y: 131 }

/**
 * Doc acc DANG dang nhap trong Bing app: mo app -> tap avatar -> panel hien ten + email + diem + chuoi.
 * Kich ban chot 2026-10-15: khong bind app vao acc; app tu nhan dien acc nao dang mo.
 */
export async function readSignedInAccount(serial: string, user = 0): Promise<PhoneAccount> {
  const empty: PhoneAccount = {
    signedIn: false,
    email: null,
    name: null,
    points: null,
    todayPoints: null,
    streak: null,
    raw: ''
  }
  await launchBing(serial, user)
  await new Promise((r) => setTimeout(r, 7000))

  const read = (xml: string): PhoneAccount => {
    const email = xml.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? null
    if (!email) return empty
    const texts = Array.from(xml.matchAll(/text="([^"]{1,60})"/g)).map((m) => m[1])
    const idx = texts.findIndex((t) => t === email)
    const name = idx > 0 ? texts[idx - 1] : null
    return {
      signedIn: true,
      email,
      name,
      points: Number(xml.match(/(\d[\d.,]*)\s*Tổng số điểm/)?.[1]?.replace(/[.,]/g, '') ?? '') || null,
      todayPoints: xml.match(/(\d+\/\d+)\s*Điểm hằng ngày/)?.[1] ?? null,
      streak: xml.match(/(\d+)\s*ngày/)?.[1] ? `${xml.match(/(\d+)\s*ngày/)?.[1]} ngày` : null,
      raw: texts.slice(0, 14).join(' | ')
    }
  }

  // Panel co the dang mo san
  let xml = await dumpUi(serial)
  if (!/[\w.+-]+@[\w.-]+\.\w+/.test(xml)) {
    for (let i = 0; i < 3; i += 1) {
      await adb(['-s', serial, 'shell', 'input', 'tap', String(AVATAR.x), String(AVATAR.y)], 10000)
      await new Promise((r) => setTimeout(r, 3500))
      xml = await dumpUi(serial)
      if (/[\w.+-]+@[\w.-]+\.\w+/.test(xml)) break
    }
  }
  const res = read(xml)
  // Dong panel cho gon man hinh
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
  return res.signedIn ? res : { ...res, raw: xml.slice(0, 200) }
}

/** Mo panel tai khoan (avatar) roi vao Cai dat. */
async function openAccountSettings(serial: string): Promise<boolean> {
  await launchBing(serial, 0)
  await new Promise((r) => setTimeout(r, 6000))
  await adb(['-s', serial, 'shell', 'input', 'tap', String(AVATAR.x), String(AVATAR.y)], 10000)
  await new Promise((r) => setTimeout(r, 3500))
  if (!(await tapByText(serial, 'Cài đặt'))) return false
  await new Promise((r) => setTimeout(r, 3500))
  const xml = await dumpUi(serial)
  return /Cài đặt|Tài khoản|Tài khoản/.test(xml)
}

/** Dang xuat acc hien tai: avatar -> Cai dat -> Dang xuat (1 tap, khong co dialog xac nhan). */
export async function signOutBing(serial: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await openAccountSettings(serial))) return { ok: false, error: 'khong mo duoc man hinh Cai dat cua Bing app' }
  if (!(await tapByText(serial, 'Đăng xuất'))) return { ok: false, error: 'khong thay nut Dang xuat' }
  await new Promise((r) => setTimeout(r, 5000))
  const xml = await dumpUi(serial)
  const ok = /Đăng nhập/.test(xml) && !/Đăng xuất/.test(xml)
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
  return ok ? { ok: true } : { ok: false, error: 'bam Dang xuat nhung man hinh chua doi sang Dang nhap' }
}

/**
 * Mo form dang nhap Microsoft va DIEN SAN email (nguoi dung chi con nhap mat khau).
 * `adb shell input text` khong go duoc ky tu dac biet => chi dien email da kiem tra.
 */
export async function startSignIn(serial: string, email?: string | null): Promise<{ ok: boolean; typedEmail?: boolean; error?: string }> {
  if (!(await openAccountSettings(serial))) return { ok: false, error: 'khong mo duoc Cai dat' }
  if (!(await tapByText(serial, 'Đăng nhập'))) return { ok: false, error: 'khong thay nut Dang nhap' }
  await new Promise((r) => setTimeout(r, 6000))
  let typedEmail = false
  if (email && /^[\w.+-]+@[\w.-]+\.\w+$/.test(email)) {
    // o nhap email cua form Microsoft (EditText dau tien)
    const xml = await dumpUi(serial)
    const m = xml.match(/<node[^>]*class="android\.widget\.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (m) {
      const x = Math.round((Number(m[1]) + Number(m[3])) / 2)
      const y = Math.round((Number(m[2]) + Number(m[4])) / 2)
      await adb(['-s', serial, 'shell', 'input', 'tap', String(x), String(y)], 10000)
      await new Promise((r) => setTimeout(r, 1200))
      await adb(['-s', serial, 'shell', 'input', 'text', email.replace(/[@]/g, '\\@')], 15000)
      typedEmail = true
    }
  }
  return { ok: true, typedEmail }
}

export type CheckInResult = {
  ok: boolean
  /** Tai khoan dang dang nhap trong Bing app luc chay */
  account: string | null
  pointsBefore: number | null
  pointsAfter: number | null
  gained: number
  alreadyDone: boolean
  todayPoints: string | null
  streak: string | null
  error?: string
}

/**
 * Diem danh cho TAI KHOAN DANG DANG NHAP trong Bing app tren dien thoai.
 * Kich ban nguoi dung chot 2026-10-15: 1 ban Bing app, diem danh xong thi DOI ACC tren dien thoai
 * roi chay tiep — khong bind app vao acc nao.
 */
export async function checkInCurrentBingAccount(serial: string, user = 0): Promise<CheckInResult> {
  const empty: CheckInResult = {
    ok: false,
    account: null,
    pointsBefore: null,
    pointsAfter: null,
    gained: 0,
    alreadyDone: false,
    todayPoints: null,
    streak: null
  }

  const cdp = await openRewardsCdp(serial, user, 9601)
  if (!cdp.ok || !cdp.port) return { ...empty, error: cdp.error ?? 'khong mo duoc trang Rewards' }

  try {
    const before = await readRewards(cdp.port)
    const res = await doCheckIn(cdp.port)
    const after = await readRewards(cdp.port)
    return {
      ok: res.ok,
      account: after.raw.match(/([\w.+-]+@[\w.-]+)/)?.[1] ?? null,
      pointsBefore: res.before ?? before.points,
      pointsAfter: res.after ?? after.points,
      gained: res.gained,
      alreadyDone: res.alreadyDone,
      todayPoints: after.todayPoints,
      streak: after.streak,
      error: res.error
    }
  } finally {
    await closePhoneCdp(serial, [cdp.port])
  }
}

/** Chi doc trang thai Rewards cua acc dang dang nhap (khong bam gi). */
export async function readCurrentBingAccount(
  serial: string,
  user = 0
): Promise<{ ok: boolean; points: number | null; todayPoints: string | null; streak: string | null; canCheckIn: boolean; error?: string }> {
  const cdp = await openRewardsCdp(serial, user, 9611)
  if (!cdp.ok || !cdp.port) {
    return { ok: false, points: null, todayPoints: null, streak: null, canCheckIn: false, error: cdp.error }
  }
  try {
    const r = await readRewards(cdp.port)
    return {
      ok: true,
      points: r.points,
      todayPoints: r.todayPoints,
      streak: r.streak,
      canCheckIn: r.checkInAvailable
    }
  } catch (e) {
    return { ok: false, points: null, todayPoints: null, streak: null, canCheckIn: false, error: String((e as Error).message).slice(0, 150) }
  } finally {
    await closePhoneCdp(serial, [cdp.port])
  }
}
