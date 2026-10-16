// Kieu dung chung giua main / preload / renderer
export type LogLine = { at: string; level: string; msg: string; profileId?: string }

export type Profile = {
  id: string
  name: string
  account: string
  profileDir: string
  cdpPort: number | null
  /** 'msedge' | 'chrome' — Chrome KHONG bi Windows tu gan tai khoan Microsoft */
  channel: string
  headless: boolean
  /** Tran diem desktop tuy chon: vd 30 (Level 1 / tai khoan moi), 90 (Level 2), hoac null (tu nhan dien) */
  desktopMax?: number | null
  /** Tran diem mobile tuy chon: vd 0 (Level 1 chua mo), 60 (Level 2), hoac null (tu nhan dien) */
  mobileMax?: number | null
  /** Chuoi proxy: vd http://host:port, socks5://host:port, hoac host:port:user:pass */
  proxy?: string | null
  /** Serial thiet bi Android (adb devices) de chay pass mobile tren dien thoai that */
  deviceSerial?: string | null
  /** Cong CDP forward sang dien thoai (mac dinh 9411) */
  devicePort?: number | null
  /** User Android chua app (0 = chinh, 10 = work profile) */
  deviceUser?: number | null
  /** Package cua ban Bing app duoc map cho tai khoan nay (com.microsoft.bing hoac dkapp.*) */
  devicePackage?: string | null
  /** Id proxy trong kho (tab "Proxy") — uu tien hon `proxy` */
  proxyId?: string | null
  /** Proxy du phong theo thu tu (sau proxy chinh) */
  proxyFallbacks?: string[] | null
  /** Proxy sống gần nhất (gợi ý ưu tiên khi chạy) */
  lastGoodProxy?: string | null
  note?: string
  createdAt: string
  lastRunAt: string | null
}

export type ProxyTestResult = {
  ok: boolean
  ip?: string
  country?: string
  city?: string
  latency?: number
  error?: string
}

export type ProxyTestProgress = {
  done: number
  total: number
  ok: number
  error: number
  id: string
  result: ProxyTestResult & { at: string }
}

export type Progress = { progress: number; max: number } | null

/** 1 proxy trong kho dung chung (tab "Proxy"). */
export type ProxyItem = {
  id: string
  label: string
  url: string
  note?: string
  /** Ket qua test gan nhat (luu kem thoi diem) */
  lastTest?: (ProxyTestResult & { at: string }) | null
  createdAt: string
}

export type Snapshot = {
  profileId: string
  at: string
  ok: boolean
  signedIn: boolean
  account: string
  points: number | null
  todayPoints: number | null
  desktop: Progress
  mobile: Progress
  offers: number | null
  /** "Keep earning x/y" trên /earn — null = tài khoản/khu vực không có mục này */
  earn:
    | (Progress & {
        /** Điểm KHÔNG kiếm được vì thẻ bị khoá cấp độ (vd "Silver level required") */
        blockedPoints?: number
        blocked?: { label: string; points: number | null; reason: string }[]
      })
    | null
  month: number | null
  year: number | null
  lifetime: number | null
  searchStreak: Progress
  dailySet: Progress
  edgeMinutes: Progress
  checkIn: Progress
  level: string | null
  setLinks: { idx: number; href: string; text: string; reward: string | null }[]
  browser: { running: boolean; pid: number | null; cdpUrl: string | null }
  runs: { desktop: unknown; mobile: unknown; daily: unknown }
  error?: string}

export type RunKind = 'desktop' | 'mobile' | 'daily'

export type CachedSnapshot = Snapshot & { cachedAt: string; date: string }

export type RowState = {
  id: string
  profile: Profile
  cache: CachedSnapshot | null
  browser: { running: boolean; pid: number | null; cdpUrl: string | null }
  run: { running: boolean; kinds: string[] }
  needsRefresh: boolean
  hasData: boolean
}

export type AppSettings = {
  /** true = het proxy thi dung profile, khong fallback DIRECT (mac dinh) */
  noDirectFallback?: boolean
  /** true = chay an (headless) khi automation */
  runHeadless?: boolean
  /** Số tài khoản chạy song song tối đa (mặc định 2) */
  maxParallelRuns?: number
  autoRefreshOnNewDay: boolean
  refreshGapMs: number
  /** Số tài khoản cập nhật point SONG SONG khi bấm "Cập nhật trạng thái" (1 = tuần tự) */
  refreshParallel?: number
  /** Chu kỳ chế độ tự động (ms): 0 = tắt, 60000 = mỗi phút, 3600000 = mỗi giờ, 10800000 = mỗi 3 giờ */
  autoEveryMs?: number
}

export type RefreshProgress = { done: number; total: number; profileId: string; parallel?: number }

export type DetectedBrowser = {
  id: string
  name: string
  exe: string
  version: string | null
  chromium: boolean
  autoSignInRisk: boolean
}

/** 1 thiet bi Android do duoc qua adb. */
export type PhoneDevice = {
  serial: string
  model: string
  android: string
  batteryPct: number | null
  charging: boolean
  screenOn: boolean
  chromeVersion: string | null
  status: 'online' | 'offline' | 'unauthorized'
  lastSeenAt: string
  error?: string
}

/** 1 ban Bing app tren dien thoai: app goc, ban work profile, hoac app clone (dkapp.*). */
export type PhoneApp = {
  id: string
  serial: string
  user: number
  pkg: string
  kind: 'bing' | 'clone'
  label: string
  /** versionCode — trung voi Bing thi gan nhu chac chan la ban clone cua Bing */
  version: string | null
  hint: string
  lastSeenAt: string
  online: boolean
}

export type PhoneSnapshot = {
  at: string
  adbAvailable: boolean
  devices: PhoneDevice[]
  apps: PhoneApp[]
  error?: string
}

/** 1 muc trong ngay (daily set link / keep-earning item) */
export type HistoryItem = { label: string; reward: string | null; visited: boolean }

/** Tong hop 1 nhom task trong 1 ngay */
export type HistoryTask = {
  done: number
  total: number | null
  pointsBefore: number | null
  pointsAfter: number | null
  gained: number | null
  items: HistoryItem[]
}

/** 1 luot chay (1 kind trong 1 lan bam Chay) */
export type HistoryRun = {
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
}

/** Lich su 1 ngay cua 1 tai khoan */
export type HistoryDay = {
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
  runs: HistoryRun[]
  warnings: string[]
}

export type HistoryData = {
  at: string
  days: HistoryDay[]
  profiles: { id: string; name: string; account: string }[]
}
