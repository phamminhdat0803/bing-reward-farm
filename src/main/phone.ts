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

/**
 * Bo dau + lowercase de so khop text trong dump uiautomator.
 * BAY: dump tra ve Unicode dang NFD ("Cài đặt" = c + a + dau + ...) nen so khop chuoi tho hay bi truot.
 */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/** Cac node text + toa do trong dump. */
function textNodes(xml: string): { text: string; x: number; y: number }[] {
  const out: { text: string; x: number; y: number }[] = []
  for (const m of xml.matchAll(/<node[^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g)) {
    out.push({
      text: m[1],
      x: Math.round((Number(m[2]) + Number(m[4])) / 2),
      y: Math.round((Number(m[3]) + Number(m[5])) / 2)
    })
  }
  return out
}

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

/** Tap vao node co text (hoac content-desc) khop — so sanh BO DAU de khong truot vi NFD. */
export async function tapByText(serial: string, text: string, fuzzy = false): Promise<boolean> {
  const xml = await dumpUi(serial)
  const want = norm(text)
  const hit = textNodes(xml).find((n) => (fuzzy ? norm(n.text).includes(want) : norm(n.text) === want))
  if (!hit) return false
  await adb(['-s', serial, 'shell', 'input', 'tap', String(hit.x), String(hit.y)], 10000)
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
  // 1. Dua app ve TRANG CHU that su: sau khi chuyen acc app dang o trang tai khoan nen the "Rewards" khong co.
  //    force-stop roi mo lai la cach chac chan nhat (khong xoa du lieu gi cua app).
  await adb(['-s', serial, 'shell', 'am', 'force-stop', 'com.microsoft.bing'], 15000)
  await new Promise((res) => setTimeout(res, 2500))
  await launchBing(serial, user)
  await new Promise((res) => setTimeout(res, 8000))

  // 2. Bam the "Rewards" o trang chu (thu vai lan, so khop bo dau)
  for (let i = 0; i < 4; i += 1) {
    if (await tapByText(serial, 'Rewards', true)) break
    await new Promise((res) => setTimeout(res, 3000))
  }
  await new Promise((res) => setTimeout(res, 7000))

  // 3. Do socket webview (pid doi theo lan chay) — thu tu MOI NHAT truoc, bo qua socket da chet
  const candidates: number[] = []
  for (let i = 0; i < 12; i += 1) {
    const pids = await findWebViewPids(serial)
    for (const p of pids) if (!candidates.includes(p)) candidates.push(p)
    if (candidates.length) break
    await new Promise((res) => setTimeout(res, 2000))
  }
  if (!candidates.length) return { ok: false, error: 'khong thay socket webview_devtools_remote (trang Rewards chua mo?)' }
  candidates.reverse()

  // 4. Forward sang cong host va kiem tra target song
  let port = basePort
  for (const pid of candidates) {
    for (let p = port; p < basePort + 12; p += 1) {
      await adb(['-s', serial, 'forward', '--remove', `tcp:${p}`], 8000)
      const f = await adb(['-s', serial, 'forward', `tcp:${p}`, `localabstract:${WEBVIEW_PREFIX}${pid}`], 10000)
      if (!f.ok) continue
      try {
        const res = await fetch(`http://127.0.0.1:${p}/json/list`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          const list = (await res.json()) as { url?: string }[]
          if (list.some((t) => (t.url ?? '').includes('miniapps'))) return { ok: true, port: p, pid }
          if (list.length) {
            // socket song nhung chua phai mini-app Rewards -> ghi nho lam phuong an du phong
            port = p + 1
          }
        }
      } catch {
        /* socket chet -> thu pid khac */
      }
    }
  }
  return { ok: false, error: 'co socket webview nhung khong mo duoc CDP trang Rewards' }
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
  if (!(await tapByText(serial, 'Cai dat', true))) return false
  await new Promise((r) => setTimeout(r, 3500))
  const xml = await dumpUi(serial)
  return norm(xml).includes('tai khoan')
}

/** Dang xuat acc hien tai: avatar -> Cai dat -> Dang xuat (1 tap, khong co dialog xac nhan). */
export async function signOutBing(serial: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await openAccountSettings(serial))) return { ok: false, error: 'khong mo duoc man hinh Cai dat cua Bing app' }
  if (!(await tapByText(serial, 'Dang xuat', true))) return { ok: false, error: 'khong thay nut Dang xuat' }
  await new Promise((r) => setTimeout(r, 5000))
  const xml = await dumpUi(serial)
  const flat = norm(xml)
  const ok = flat.includes('dang nhap') && !flat.includes('dang xuat')
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
  if (!(await tapByText(serial, 'Dang nhap', true))) return { ok: false, error: 'khong thay nut Dang nhap' }
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

export type AccountPage = {
  ok: boolean
  /** Acc dang dang nhap theo trang tai khoan (neu co) */
  signedInEmail: string | null
  signedInName: string | null
  /** Danh sach acc DA LUU tren may (chon 1 tap la vao, khong can mat khau) */
  accounts: { name: string; email: string }[]
  canAddAccount: boolean
  raw: string
  error?: string
}

/** Mo trang Cai dat cua Bing app: avatar -> Cai dat (so khop bo dau). */
async function openSettingsPage(serial: string): Promise<string> {
  await launchBing(serial, 0)
  await new Promise((r) => setTimeout(r, 6000))
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
  await new Promise((r) => setTimeout(r, 1500))

  let xml = ''
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await adb(['-s', serial, 'shell', 'input', 'tap', String(AVATAR.x), String(AVATAR.y)], 10000)
    await new Promise((r) => setTimeout(r, 3500))
    if (!(await tapByText(serial, 'Cai dat', true))) {
      await adb(['-s', serial, 'shell', 'input', 'tap', String(AVATAR.x), String(AVATAR.y)], 10000)
      await new Promise((r) => setTimeout(r, 3500))
      await tapByText(serial, 'Cai dat', true)
    }
    await new Promise((r) => setTimeout(r, 4000))
    xml = await dumpUi(serial)
    if (norm(xml).includes('tong quat') || norm(xml).includes('tai khoan microsoft')) return xml
  }
  return xml
}

/** Nut o hang "Tai khoan Microsoft" trong trang Cai dat (doi giua Dang xuat / Dang nhap). */
const ACCT_BTN = { x: 890, y: 425 }

/**
 * Mo DANH SACH ACC DA LUU tren may ("Chon mot tai khoan de dang nhap").
 * Chuoi da kiem chung 2026-10-15: Cai dat -> nut hang tai khoan (neu dang dang nhap thi bam = dang xuat)
 * -> bam lai nut do (= Dang nhap) -> hien danh sach acc da luu, chon 1 tap la vao, KHONG can mat khau.
 */
async function openAccountList(serial: string): Promise<string> {
  let xml = await openSettingsPage(serial)
  if (norm(xml).includes('dang xuat')) {
    await adb(['-s', serial, 'shell', 'input', 'tap', String(ACCT_BTN.x), String(ACCT_BTN.y)], 10000)
    await new Promise((r) => setTimeout(r, 6000))
    xml = await dumpUi(serial)
  }
  if (!norm(xml).includes('chon mot tai khoan')) {
    await adb(['-s', serial, 'shell', 'input', 'tap', String(ACCT_BTN.x), String(ACCT_BTN.y)], 10000)
    await new Promise((r) => setTimeout(r, 7000))
    xml = await dumpUi(serial)
  }
  return xml
}

/** Doc acc dang dang nhap (panel avatar) + danh sach acc da luu tren may. */
export async function readAccountPage(serial: string): Promise<AccountPage> {
  const fail: AccountPage = { ok: false, signedInEmail: null, signedInName: null, accounts: [], canAddAccount: false, raw: '' }
  const cur = await readSignedInAccount(serial, 0)
  const xml = await openAccountList(serial)
  if (!xml) return { ...fail, error: 'khong doc duoc trang tai khoan' }

  const nodes = textNodes(xml)
  const accounts: { name: string; email: string }[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(nodes[i].text)) {
      const email = nodes[i].text
      if (!accounts.some((a) => a.email === email)) accounts.push({ name: nodes[i - 1]?.text ?? '', email })
    }
  }
  return {
    ok: accounts.length > 0 || nodes.some((n) => norm(n.text).includes('chon mot tai khoan')),
    signedInEmail: cur.email,
    signedInName: cur.name,
    accounts,
    canAddAccount: nodes.some((n) => norm(n.text).includes('them tai khoan')),
    raw: nodes.slice(0, 20).map((n) => n.text).join(' | ')
  }
}

/**
 * Chuyen acc: mo danh sach acc da luu -> bam dung email -> xac nhan "Da dang nhap voi tu cach".
 * Acc phai co trong danh sach da luu (them 1 lan bang "Them tai khoan" tren may la du).
 */
export async function switchToAccount(serial: string, email: string): Promise<{ ok: boolean; error?: string }> {
  const xml = await openAccountList(serial)
  const node = textNodes(xml).find((n) => norm(n.text) === norm(email))
  if (!node) {
    await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
    const have = textNodes(xml)
      .filter((n) => /^[\w.+-]+@/.test(n.text))
      .map((n) => n.text)
    return {
      ok: false,
      error: `acc ${email} chua co trong danh sach da luu tren may${have.length ? ` (may co: ${have.join(', ')})` : ''}`
    }
  }
  await adb(['-s', serial, 'shell', 'input', 'tap', String(node.x), String(node.y)], 10000)
  await new Promise((r) => setTimeout(r, 8000))

  const after = await dumpUi(serial)
  const flat = norm(after)
  const ok = flat.includes('da dang nhap voi tu cach') || textNodes(after).some((n) => norm(n.text) === norm(email))
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
  await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'], 8000)
  return ok ? { ok: true } : { ok: false, error: 'bam acc nhung chua thay xac nhan dang nhap' }
}

export type AutoCheckInRow = {
  email: string
  name?: string
  ok: boolean
  switched: boolean
  gained: number
  alreadyDone: boolean
  points: number | null
  error?: string
}

/**
 * Chay ca danh sach: voi moi email -> chuyen acc tren dien thoai -> diem danh -> ghi ket qua.
 * onProgress duoc goi sau moi acc de UI cap nhat.
 */
export async function autoCheckInAll(
  serial: string,
  targets: { email: string; name?: string }[],
  onProgress?: (row: AutoCheckInRow, index: number, total: number) => void
): Promise<AutoCheckInRow[]> {
  const out: AutoCheckInRow[] = []
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]
    const row: AutoCheckInRow = {
      email: t.email,
      name: t.name,
      ok: false,
      switched: false,
      gained: 0,
      alreadyDone: false,
      points: null
    }
    try {
      const sw = await switchToAccount(serial, t.email)
      row.switched = sw.ok
      if (!sw.ok) {
        row.error = sw.error
      } else {
        const res = await checkInCurrentBingAccount(serial, 0)
        row.ok = res.ok
        row.gained = res.gained
        row.alreadyDone = res.alreadyDone
        row.points = res.pointsAfter
        row.error = res.error
      }
    } catch (e) {
      row.error = String((e as Error).message).slice(0, 150)
    }
    out.push(row)
    onProgress?.(row, i + 1, targets.length)
  }
  return out
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
