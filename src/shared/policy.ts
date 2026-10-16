export type AccountPolicy = {
  mode: 'limited' | 'monitor'
  targetPercent: number
  maxSearchesPerDay: number
  maxSessionsPerDay: number
  maxSearchesPerSession: number
  sessionGapMinutes: number
  startTime: string
  endTime: string
  weekdays: number[]
  tasks: { desktop: boolean; mobile: boolean; daily: boolean; earn: boolean }
  botRule: {
    enabled: boolean
    threshold: number
    action: 'pause' | 'reduce'
    targetPercent: number
    maxAgeDays: number
    unknown: 'pause' | 'base'
  }
  pauseUntil: string | null
  stopOnNoCredit: boolean
  cooldownMinutes: number
  maxFailuresPerDay: number
  proxyRecovery: 'pause' | 'repair'
  proxyCount: number
}

export type AutomationPolicy = { version: 1; enabled: boolean; defaults: AccountPolicy; overrides: Record<string, AccountPolicy> }
export type PolicyUsage = {
  searches: number
  sessions: number
  lastSessionAt: string | null
  blockedUntil: string | null
  failures: number
  lastReason: string | null
}
export type PolicyTask = 'desktop' | 'mobile' | 'daily' | 'earn'
export type PolicyPlan = {
  profileId: string
  name: string
  active: boolean
  status: 'legacy' | 'ready' | 'waiting' | 'paused' | 'goal-met'
  reason: string
  notes: string[]
  tasks: PolicyTask[]
  effectivePercent: number
  desktopTarget: number
  mobileTarget: number
  desktopSearches: number
  mobileSearches: number
  allowance: number
  remainingToday: number
  usage: PolicyUsage
  botState: 'off' | 'fresh' | 'high' | 'stale' | 'unknown'
}

export const DEFAULT_ACCOUNT_POLICY: AccountPolicy = {
  mode: 'limited', targetPercent: 50, maxSearchesPerDay: 10, maxSessionsPerDay: 3,
  maxSearchesPerSession: 4, sessionGapMinutes: 120, startTime: '08:00', endTime: '22:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6], tasks: { desktop: true, mobile: true, daily: true, earn: true },
  botRule: { enabled: false, threshold: 80, action: 'reduce', targetPercent: 20, maxAgeDays: 30, unknown: 'pause' },
  pauseUntil: null, stopOnNoCredit: true, cooldownMinutes: 60, maxFailuresPerDay: 2,
  proxyRecovery: 'pause', proxyCount: 1
}

export const DEFAULT_AUTOMATION_POLICY: AutomationPolicy = { version: 1, enabled: false, defaults: DEFAULT_ACCOUNT_POLICY, overrides: {} }

export const POLICY_PRESETS = [
  { id: 'monitor', label: 'Chỉ theo dõi', description: 'Không chạy nhiệm vụ; vẫn cập nhật dữ liệu khi bạn yêu cầu.', patch: { mode: 'monitor' } },
  { id: 'three-searches', label: '3 lượt / ngày', description: 'Tổng desktop + mobile tối đa 3 lượt tìm kiếm trong ngày.', patch: { mode: 'limited', maxSearchesPerDay: 3, maxSearchesPerSession: 3, maxSessionsPerDay: 1, targetPercent: 100 } },
  { id: 'three-sessions', label: '3 phiên / ngày', description: 'Mỗi phiên tối đa 3 lượt; cách nhau ít nhất 3 giờ.', patch: { mode: 'limited', maxSearchesPerDay: 9, maxSearchesPerSession: 3, maxSessionsPerDay: 3, sessionGapMinutes: 180 } },
  { id: 'twenty-percent', label: 'Mục tiêu 20%', description: 'Dừng ở 20% hạn mức điểm tìm kiếm của từng loại.', patch: { mode: 'limited', targetPercent: 20 } },
  { id: 'bot-reduce', label: 'Score cao → 20%', description: 'Ngưỡng tự chọn; score cũ hoặc thiếu sẽ tạm dừng.', patch: { mode: 'limited', botRule: { ...DEFAULT_ACCOUNT_POLICY.botRule, enabled: true, action: 'reduce', targetPercent: 20 } } },
  { id: 'daily-only', label: 'Chỉ Daily set', description: 'Tắt search và Keep earning, giữ nhiệm vụ Daily set.', patch: { mode: 'limited', tasks: { desktop: false, mobile: false, daily: true, earn: false } } }
] satisfies { id: string; label: string; description: string; patch: Partial<AccountPolicy> }[]
