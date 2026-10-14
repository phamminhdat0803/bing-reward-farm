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
  /** Id proxy trong kho (tab "Proxy") — uu tien hon `proxy` */
  proxyId?: string | null
  /** Proxy du phong theo thu tu (sau proxy chinh) */
  proxyFallbacks?: string[] | null
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
  earn: Progress
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
  autoRefreshOnNewDay: boolean
  refreshGapMs: number
}

export type RefreshProgress = { done: number; total: number; profileId: string }

export type DetectedBrowser = {
  id: string
  name: string
  exe: string
  version: string | null
  chromium: boolean
  autoSignInRisk: boolean
}
