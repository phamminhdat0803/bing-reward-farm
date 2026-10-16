import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ProxyStat,
  HistoryTask,
  AppSettings,
  DetectedBrowser,
  LogLine,
  Profile,
  ProxyItem,
  ProxyTestProgress,
  ProxyTestResult,
  PhoneSnapshot,
  RefreshProgress,
  RowState,
  Snapshot
} from '../shared/types'

const api = {
  listProfiles: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
  addProfile: (input: Partial<Profile>): Promise<Profile> => ipcRenderer.invoke('profiles:add', input),
  updateProfile: (id: string, patch: Partial<Profile>): Promise<Profile> =>
    ipcRenderer.invoke('profiles:update', { id, patch }),
  removeProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('profiles:remove', id),

  openBrowser: (id: string): Promise<{ ok: boolean; cdpUrl?: string; pid?: number; error?: string }> =>
    ipcRenderer.invoke('browser:open', id),
  closeBrowser: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('browser:close', id),
  browserState: (id: string): Promise<{ running: boolean; pid: number | null; cdpUrl: string | null }> =>
    ipcRenderer.invoke('browser:state', id),
  signOut: (id: string): Promise<{ ok: boolean; cleared: number; error?: string }> =>
    ipcRenderer.invoke('browser:signout', id),
  resetProfile: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('profiles:reset', id),
  /** Kiem tra ket noi proxy (tra ve IP, vi tri, do tre ms) */
  testProxy: (proxyStr: string): Promise<ProxyTestResult> => ipcRenderer.invoke('proxy:test', proxyStr),

  // ---------- Kho proxy (tab "Proxy") ----------
  listProxies: (): Promise<ProxyItem[]> => ipcRenderer.invoke('proxies:list'),
  addProxy: (input: Partial<ProxyItem>): Promise<{ ok: boolean; item?: ProxyItem; error?: string }> =>
    ipcRenderer.invoke('proxies:add', input),
  /** Them nhieu proxy 1 luc (moi phan tu 1 dong proxy) */
  addProxyBulk: (
    lines: string[]
  ): Promise<{ ok: boolean; added?: number; skipped?: number; items?: ProxyItem[]; error?: string }> =>
    ipcRenderer.invoke('proxies:addBulk', lines),
  updateProxy: (
    id: string,
    patch: Partial<ProxyItem>
  ): Promise<{ ok: boolean; item?: ProxyItem; error?: string }> =>
    ipcRenderer.invoke('proxies:update', { id, patch }),
  removeProxy: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('proxies:remove', id),
  /** Xoá nhiều proxy 1 lúc */
  removeProxies: (ids: string[]): Promise<{ ok: boolean; removed?: number; error?: string }> =>
    ipcRenderer.invoke('proxies:removeBulk', ids),
  /** Test 1 proxy trong kho va luu ket qua */
  testSavedProxy: (id: string): Promise<ProxyTestResult> => ipcRenderer.invoke('proxies:test', id),
  testAllProxies: (filterIds?: string[]): Promise<Record<string, ProxyTestResult>> =>
    ipcRenderer.invoke('proxies:testAll', filterIds),
  cancelTestAll: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('proxies:cancelTestAll'),
  /** Lang nghe tien do kiem tra tung proxy trong lo */
  onTestProgress: (cb: (p: ProxyTestProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: ProxyTestProgress): void => cb(p)
    ipcRenderer.on('proxies:testProgress', handler)
    return () => ipcRenderer.removeListener('proxies:testProgress', handler)
  },
  /** Trang thai suc khoe proxy da do (key = proxyId) */
  /** Bao khi suc khoe proxy thay doi (test xong, health loop do xong) */
  onHealthChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('proxies:healthChanged', handler)
    return () => ipcRenderer.removeListener('proxies:healthChanged', handler)
  },
  proxyHealth: (): Promise<
    Record<string, { status: string; ip?: string; country?: string; latency?: number; error?: string; checkedAt: string }>
  > => ipcRenderer.invoke('proxies:health'),
  /** Dò các trình duyệt đang cài trên máy */
  detectBrowsers: (force = false): Promise<DetectedBrowser[]> => ipcRenderer.invoke('browsers:detect', force),

  /** Danh sách thiết bị Android + các bản Bing app (app gốc / work profile / clone) do adb dò được */
  listPhoneApps: (force = false): Promise<PhoneSnapshot> => ipcRenderer.invoke('phone:list', force),
  detectPhoneApps: (): Promise<PhoneSnapshot> => ipcRenderer.invoke('phone:detect'),
  /** Điểm danh acc ĐANG đăng nhập trong Bing app trên điện thoại */
  checkInPhone: (
    serial: string,
    user = 0
  ): Promise<{
    ok: boolean
    account: string | null
    pointsBefore: number | null
    pointsAfter: number | null
    gained: number
    alreadyDone: boolean
    todayPoints: string | null
    streak: string | null
    error?: string
  }> => ipcRenderer.invoke('phone:checkin', { serial, user }),
  /** Mở Bing app trên điện thoại (để đăng nhập acc cần điểm danh) */
  openPhoneBing: (serial: string, user = 0): Promise<boolean> => ipcRenderer.invoke('phone:openBing', { serial, user }),
  /** Đọc acc ĐANG đăng nhập trong Bing app: tên + email + điểm + điểm hôm nay + chuỗi */
  readPhoneAccount: (
    serial: string,
    user = 0
  ): Promise<{
    signedIn: boolean
    email: string | null
    name: string | null
    points: number | null
    todayPoints: string | null
    streak: string | null
    raw: string
    error?: string
  }> => ipcRenderer.invoke('phone:account', { serial, user }),
  /** Đăng xuất acc hiện tại trên Bing app (1 tap, không có dialog) */
  signOutPhone: (serial: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('phone:signout', { serial }),
  /** Mở form đăng nhập Microsoft và điền sẵn email acc kế tiếp */
  signInPhone: (serial: string, email?: string | null): Promise<{ ok: boolean; typedEmail?: boolean; error?: string }> =>
    ipcRenderer.invoke('phone:signin', { serial, email: email ?? null }),
  /** Đọc trang tài khoản Bing app: acc đang đăng nhập + danh sách acc ĐÃ LƯU trên máy (chuyển 1 tap, không cần mật khẩu) */
  listPhoneAccounts: (
    serial: string
  ): Promise<{
    ok: boolean
    signedInEmail: string | null
    signedInName: string | null
    accounts: { name: string; email: string }[]
    canAddAccount: boolean
    raw: string
    error?: string
  }> => ipcRenderer.invoke('phone:accounts', { serial }),
  /** Chuyển acc trên điện thoại bằng cách chọn trong danh sách đã lưu */
  switchPhoneAccount: (serial: string, email: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('phone:switch', { serial, email }),
  /** Chạy cả danh sách: chuyển acc → điểm danh từng acc */
  autoCheckInPhone: (
    serial: string,
    targets: { email: string; name?: string }[]
  ): Promise<
    {
      email: string
      name?: string
      ok: boolean
      switched: boolean
      gained: number
      alreadyDone: boolean
      points: number | null
      error?: string
    }[]
  > => ipcRenderer.invoke('phone:autoCheckin', { serial, targets }),
  /** Tiến độ chạy tự động (1 sự kiện / acc) */
  onPhoneAutoProgress: (
    cb: (p: {
      row: { email: string; name?: string; ok: boolean; switched: boolean; gained: number; alreadyDone: boolean; points: number | null; error?: string }
      index: number
      total: number
    }) => void
  ): (() => void) => {
    type Progress = {
      row: { email: string; name?: string; ok: boolean; switched: boolean; gained: number; alreadyDone: boolean; points: number | null; error?: string }
      index: number
      total: number
    }
    const h = (_e: Electron.IpcRendererEvent, p: Progress): void => cb(p)
    ipcRenderer.on('phone:autoProgress', h)
    return () => ipcRenderer.removeListener('phone:autoProgress', h)
  },
  /** Chỉ đọc trạng thái Rewards của acc đang đăng nhập */
  readPhone: (
    serial: string,
    user = 0
  ): Promise<{
    ok: boolean
    points: number | null
    todayPoints: string | null
    streak: string | null
    canCheckIn: boolean
    error?: string
  }> => ipcRenderer.invoke('phone:read', { serial, user }),

  snapshot: (id: string): Promise<Snapshot> => ipcRenderer.invoke('rewards:snapshot', id),
  openLoginWindow: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('rewards:login-window', id),

  /** Bang trang thai doc tu cache — KHONG mo trinh duyet */
  listState: (): Promise<RowState[]> => ipcRenderer.invoke('state:list'),
  /** Mo trinh duyet de lay point (chi khi nguoi dung bam) */
  refreshPoints: (ids: string[]): Promise<{ ok: boolean; count: number }> =>
    ipcRenderer.invoke('rewards:refresh', ids),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  /** Lịch sử chạy đọc từ state/<id>.json: mỗi ngày 1 dòng tổng hợp + danh sách run */
  listHistory: (opts?: { profileId?: string; days?: number }): Promise<{
    at: string
    profiles: { id: string; name: string; account: string }[]
    days: {
      date: string
      profileId: string
      name: string
      account: string
      desktop: HistoryTask
      mobile: HistoryTask
      daily: HistoryTask
      earn: HistoryTask
      gained: number | null
      pointsFirst: number | null
      pointsLast: number | null
      runs: {
        at: string
        date: string
        profileId: string
        kind: string
        searches: number | null
        status: string
        pointsBefore: number | null
        pointsAfter: number | null
        gained: number | null
        counterBefore: string | null
        counterAfter: string | null
      }[]
      warnings: string[]
    }[]
  }> => ipcRenderer.invoke('history:list', opts ?? {}),  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),

  // ---------- Che do tu dong ----------
  /** Trang thai che do tu dong: chu ky, vong da chay, lan chay toi, so lan xu ly proxy */
  autoStatus: (): Promise<{
    date: string
    cycles: number
    lastCycleAt: string | null
    lastCycleResult: string | null
    running: boolean
    nextAt: string | null
    remediations: number
    everyMs: number
    enabled: boolean
  }> => ipcRenderer.invoke('auto:status'),
  /** Dat chu ky tu dong (ms; 0 = tat) */
  autoSetEvery: (ms: number): Promise<{ everyMs: number; enabled: boolean; nextAt: string | null }> =>
    ipcRenderer.invoke('auto:setEvery', ms),
  /** Chay 1 vong ngay */
  autoRunNow: (): Promise<{ cycles: number; detail: string[] }> => ipcRenderer.invoke('auto:runNow'),
  /** Dung hen gio */
  autoStop: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('auto:stop'),
  /** Danh sach ho so can agent phan tich (task khong len diem sau 3 lan) */
  autoEscalations: (): Promise<
    { file: string; profile: string; task: string; tries: number; at: string; summary: string }[]
  > => ipcRenderer.invoke('auto:escalations'),
  /** Task con thieu cua tung acc (theo so lieu da luu) */
  autoPending: (): Promise<Record<string, string[]>> => ipcRenderer.invoke('auto:pending'),
  /** Chon N proxy sach (da test OK, ping thap, chua acc nao dung) */
  autoPickClean: (n = 3): Promise<{ id: string; label: string; latency: number | null }[]> =>
    ipcRenderer.invoke('auto:pickClean', n),
  onAutoChanged: (
    cb: (s: { cycles: number; running: boolean; nextAt: string | null; enabled: boolean; everyMs: number }) => void
  ): (() => void) => {
    type AutoEvent = { cycles: number; running: boolean; nextAt: string | null; enabled: boolean; everyMs: number }
    const h = (_e: Electron.IpcRendererEvent, s: AutoEvent): void => cb(s)
    ipcRenderer.on('auto:changed', h)
    return () => ipcRenderer.removeListener('auto:changed', h)
  },
  onRefreshProgress: (cb: (p: RefreshProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: RefreshProgress): void => cb(p)
    ipcRenderer.on('refresh:progress', handler)
    return () => ipcRenderer.removeListener('refresh:progress', handler)
  },
  onRefreshDone: (cb: () => void): (() => void) => {    const handler = (): void => cb()
    ipcRenderer.on('refresh:done', handler)
    return () => ipcRenderer.removeListener('refresh:done', handler)
  },

  startRun: (id: string, kinds: string[]): Promise<{ ok: boolean; runId?: string; error?: string }> =>
    ipcRenderer.invoke('run:start', { id, kinds }),
  stopRun: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('run:stop', id),
  /** Xoá lệnh chờ (1 acc hoặc tất cả) — dùng khi badge "N lệnh chờ" bị treo */
  clearQueue: (profileId?: string): Promise<{ cleared: number }> => ipcRenderer.invoke('run:clearQueue', profileId),

  // ---------- Lịch sử proxy + export ----------
  /** Thống kê test từng proxy: số lần sống/chết, tỉ lệ, chuỗi thất bại, cờ "10 lần đều chết" */
  proxyStats: (): Promise<ProxyStat[]> => ipcRenderer.invoke('proxy:stats'),
  /** Xoá lịch sử test (1 hoặc nhiều proxy; bỏ trống = tất cả) */
  proxyHistoryClear: (ids?: string[]): Promise<{ cleared: number }> => ipcRenderer.invoke('proxy:historyClear', ids),
  /** Lưu file qua hộp thoại Save (CSV / JSON / log) */
  exportSave: (opts: {
    name: string
    content: string
    ext?: 'csv' | 'json' | 'txt'
  }): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export:save', opts),
  /** Log tài khoản dạng text (số liệu, tiến độ, proxy, lịch sử, hồ sơ, log thô) */
  exportAccountsLog: (profileId?: string): Promise<string> => ipcRenderer.invoke('export:accountsLog', profileId),
  runState: (id: string): Promise<{ running: boolean; kinds: string[]; log: LogLine[] }> =>
    ipcRenderer.invoke('run:state', id),

  onLog: (cb: (line: LogLine) => void): (() => void) => {
    const handler = (_e: unknown, line: LogLine): void => cb(line)
    ipcRenderer.on('log:line', handler)
    return () => ipcRenderer.removeListener('log:line', handler)
  },
  onRunStatus: (cb: (data: { profileId: string; running: boolean }) => void): (() => void) => {
    const handler = (_e: unknown, data: { profileId: string; running: boolean }): void => cb(data)
    ipcRenderer.on('run:status', handler)
    return () => ipcRenderer.removeListener('run:status', handler)
  },
  /** Tien do trong luc search (moi search 1 lan) */
  onRunProgress: (
    cb: (p: { profileId: string; kind: string; done: number; total: number; points: number | null; today: number | null; gained: number }) => void
  ): (() => void) => {
    const handler = (_e: unknown, p: { profileId: string; kind: string; done: number; total: number; points: number | null; today: number | null; gained: number }): void => cb(p)
    ipcRenderer.on('run:progress', handler)
    return () => ipcRenderer.removeListener('run:progress', handler)
  },
  /** Hang doi chay (gioi han so job song song) */
  onRunQueue: (
    cb: (p: {
      items: { profileId: string; name: string; pending: number }[]
      waiting: { profileId: string; name: string; position: number }[]
      max: number
    }) => void
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: {
        items: { profileId: string; name: string; pending: number }[]
        waiting: { profileId: string; name: string; position: number }[]
        max: number
      }
    ): void => cb(p)
    ipcRenderer.on('run:queue', handler)
    return () => ipcRenderer.removeListener('run:queue', handler)
  },
  runQueue: (): Promise<{
    running: string[]
    items: { profileId: string; name: string; pending: number }[]
    waiting: { profileId: string; name: string; position: number }[]
    max: number
  }> => ipcRenderer.invoke('run:queue'),
  /** Trang thai trinh duyet thay doi (vd nguoi dung dong cua so) */
  onBrowserState: (cb: (p: { profileId: string; running: boolean }) => void): (() => void) => {
    const handler = (_e: unknown, p: { profileId: string; running: boolean }): void => cb(p)
    ipcRenderer.on('browser:state', handler)
    return () => ipcRenderer.removeListener('browser:state', handler)
  },
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const handler = (_e: unknown, snap: Snapshot): void => cb(snap)
    ipcRenderer.on('rewards:snapshot', handler)
    return () => ipcRenderer.removeListener('rewards:snapshot', handler)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
