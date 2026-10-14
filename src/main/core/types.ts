// Kieu dung chung cho core automation (port tu D:\Workspace\NodeJS\bing-reward).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogLine = { at: string; level: LogLevel; msg: string; profileId?: string }

export type Logger = {
  debug: (m: string) => void
  info: (m: string) => void
  warn: (m: string) => void
  error: (m: string) => void
}

export type Progress = { progress: number; max: number } | null

export type CoreConfig = {
  browser: {
    channel: string
    headless: boolean
    profileDir: string
    executablePath: string | null
    cdpPort?: number | null
    proxy?: string | null
    /** Chuoi proxy theo thu tu uu tien (chinh + du phong) -> --proxy-server="p1,p2" */
    proxyChain?: string[]
    slowMoMs: number
  }
  search: {
    desktop: boolean
    mobile: boolean
    desktopTarget: number
    mobileTarget: number
    pointsPerSearch: number
    maxSearchesPerPass: number
    checkPointsEvery: number
    stallLimit: number
    minDelayMs: number
    maxDelayMs: number
    typeDelayMs: { min: number; max: number }
    dwellMs: { min: number; max: number }
    clickResultProbability: number
  }
  daily: {
    enabled: boolean
    maxItems: number
    waitAfterClickMs: { min: number; max: number }
    settleMs: number
  }
  /** Muc "Keep earning" tren /earn: cac the daily offer (PUBL=RewardsDO) click la duoc cong diem */
  earn: {
    enabled: boolean
    maxItems: number
    waitAfterClickMs: { min: number; max: number }
    settleMs: number
    /** Task kieu wallpaper ("Set as Wallpaper"): cho toi da bao nhieu ms truoc khi bam nut */
    wallpaperWaitMs: number
  }
  queries: { file?: string; mixGenerator: boolean }
  log: { dir: string; level?: LogLevel }
}

export const DEFAULTS: CoreConfig = {
  browser: {
    channel: 'msedge',
    headless: false,
    profileDir: '',
    executablePath: null,
    cdpPort: null,
    slowMoMs: 0
  },
  search: {
    desktop: true,
    mobile: true,
    desktopTarget: 30,
    mobileTarget: 20,
    pointsPerSearch: 3,
    maxSearchesPerPass: 40,
    checkPointsEvery: 5,
    stallLimit: 5,
    minDelayMs: 15000,
    maxDelayMs: 30000,
    typeDelayMs: { min: 45, max: 170 },
    dwellMs: { min: 4000, max: 12000 },
    clickResultProbability: 0.15
  },
  daily: {
    enabled: true,
    maxItems: 6,
    waitAfterClickMs: { min: 5000, max: 10000 },
    settleMs: 45000
  },
  earn: {
    enabled: true,
    maxItems: 12,
    waitAfterClickMs: { min: 5000, max: 9000 },
    settleMs: 20000,
    wallpaperWaitMs: 20000
  },
  queries: { mixGenerator: true },
  log: { dir: '', level: 'info' }
}

/** Tien do trong luc search — day ra UI sau moi search */
export type SearchProgress = {
  /** desktop | mobile = luot search; earn = Keep earning; daily = Daily set */
  kind: 'desktop' | 'mobile' | 'earn' | 'daily'
  done: number
  total: number
  points: number | null
  today: number | null
  gained: number
}

export type SearchPassResult = {
  kind: 'desktop' | 'mobile'
  searches: number
  status: string
  pointsBefore: number | null
  pointsAfter: number | null
  todayBefore: number | null
  todayAfter: number | null
  counterBefore: string
  counterAfter: string
}

export type DailySetResult = {
  status: string
  items: { label: string; href: string; visited: boolean; reward?: string | null }[]
  activityBefore: number
  activityAfter: number
  pointsBefore: number | null
  pointsAfter: number | null
}

export type EarnResult = {
  status: string
  items: { label: string; href: string; points: number | null; visited: boolean }[]
  /** The bi khoa (vd "Silver level required") — khong the kiem diem hom nay */
  blocked: { label: string; points: number | null; reason: string }[]
  /** Tong diem dang bi khoa boi cap do */
  blockedPoints: number
  /** "x/y" cua muc Keep earning neu doc duoc */
  sectionBefore: string | null
  sectionAfter: string | null
  pointsBefore: number | null
  pointsAfter: number | null
  todayBefore: number | null
  todayAfter: number | null
}
