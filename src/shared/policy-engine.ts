import type { Profile, CachedSnapshot } from './types'
import { DEFAULT_ACCOUNT_POLICY, type AccountPolicy, type AutomationPolicy, type PolicyPlan, type PolicyUsage } from './policy'

export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function emptyUsage(): PolicyUsage {
  return { searches: 0, sessions: 0, lastSessionAt: null, blockedUntil: null, failures: 0, lastReason: null }
}

/** Whitelist mọi trường tại biên IPC; không nhận prototype key hay số không hữu hạn. */
export function validatePolicy(input: unknown, profileIds?: Set<string>): AutomationPolicy {
  const object = (x: unknown): Record<string, unknown> => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Cấu hình phải là một đối tượng')
    return x as Record<string, unknown>
  }
  const boolean = (v: unknown): boolean => { if (typeof v !== 'boolean') throw new Error('Giá trị bật/tắt không hợp lệ'); return v }
  const number = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new Error(`Số phải là số nguyên từ ${min} đến ${max}`)
    return v
  }
  const choice = <T extends string>(v: unknown, options: readonly T[]): T => {
    if (!options.includes(v as T)) throw new Error('Lựa chọn không hợp lệ')
    return v as T
  }
  const time = (v: unknown): string => {
    if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('Giờ phải theo định dạng HH:mm')
    return v
  }
  const account = (raw: unknown): AccountPolicy => {
    const v = object(raw), tasks = object(v.tasks), bot = object(v.botRule)
    if (!Array.isArray(v.weekdays) || v.weekdays.length < 1 || v.weekdays.length > 7) throw new Error('Chọn ít nhất một ngày trong tuần')
    const pause = v.pauseUntil
    if (pause !== null && (typeof pause !== 'string' || !Number.isFinite(Date.parse(pause)))) throw new Error('Ngày tạm dừng không hợp lệ')
    return {
      mode: choice(v.mode, ['limited', 'monitor']), targetPercent: number(v.targetPercent, 0, 100),
      maxSearchesPerDay: number(v.maxSearchesPerDay, 0, 200), maxSessionsPerDay: number(v.maxSessionsPerDay, 1, 24),
      maxSearchesPerSession: number(v.maxSearchesPerSession, 1, 100), sessionGapMinutes: number(v.sessionGapMinutes, 0, 1440),
      startTime: time(v.startTime), endTime: time(v.endTime), weekdays: [...new Set(v.weekdays.map(d => number(d, 0, 6)))],
      tasks: { desktop: boolean(tasks.desktop), mobile: boolean(tasks.mobile), daily: boolean(tasks.daily), earn: boolean(tasks.earn) },
      botRule: { enabled: boolean(bot.enabled), threshold: number(bot.threshold, 0, 100), action: choice(bot.action, ['pause', 'reduce']),
        targetPercent: number(bot.targetPercent, 0, 100), maxAgeDays: number(bot.maxAgeDays, 1, 365), unknown: choice(bot.unknown, ['pause', 'base']) },
      pauseUntil: pause as string | null, stopOnNoCredit: boolean(v.stopOnNoCredit), cooldownMinutes: number(v.cooldownMinutes, 1, 1440),
      maxFailuresPerDay: number(v.maxFailuresPerDay, 1, 20), proxyRecovery: choice(v.proxyRecovery, ['pause', 'repair']), proxyCount: number(v.proxyCount, 1, 20)
    }
  }
  const v = object(input), overrides = object(v.overrides)
  if (v.version !== 1) throw new Error('Phiên bản cấu hình không hợp lệ')
  const clean: Record<string, AccountPolicy> = Object.create(null)
  if (Object.keys(overrides).length > 500) throw new Error('Quá nhiều cấu hình tài khoản')
  for (const [id, rule] of Object.entries(overrides)) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || (profileIds && !profileIds.has(id))) throw new Error('Tài khoản cấu hình không hợp lệ')
    clean[id] = account(rule)
  }
  return { version: 1, enabled: boolean(v.enabled), defaults: account(v.defaults), overrides: clean }
}

export function accountPolicy(config: AutomationPolicy, id: string): AccountPolicy {
  return Object.hasOwn(config.overrides, id) ? config.overrides[id] : config.defaults
}

export function evaluatePolicy(config: AutomationPolicy, profile: Profile, cache: CachedSnapshot | null, usage: PolicyUsage, now = new Date()): PolicyPlan {
  const policy = accountPolicy(config, profile.id) ?? DEFAULT_ACCOUNT_POLICY
  const plan: PolicyPlan = {
    profileId: profile.id, name: profile.name, active: config.enabled, status: config.enabled ? 'ready' : 'legacy',
    reason: config.enabled ? 'Sẵn sàng theo quy tắc' : 'Chưa bật quy tắc; dùng cách chạy hiện tại', notes: [], tasks: [],
    effectivePercent: policy.targetPercent, desktopTarget: 0, mobileTarget: 0, desktopSearches: 0, mobileSearches: 0,
    allowance: 0, remainingToday: Math.max(0, policy.maxSearchesPerDay - usage.searches), usage, botState: 'off'
  }
  if (!config.enabled) return plan
  const block = (reason: string, status: PolicyPlan['status'] = 'paused'): PolicyPlan => ({ ...plan, status, reason, tasks: [] })
  if (policy.mode === 'monitor') return block('Chỉ theo dõi — không chạy nhiệm vụ')
  if (policy.pauseUntil && Date.parse(policy.pauseUntil) > now.getTime()) return block(`Tạm dừng đến ${new Date(policy.pauseUntil).toLocaleString('vi-VN')}`)
  if (usage.failures >= policy.maxFailuresPerDay) return block('Đạt giới hạn lỗi trong ngày; cần kiểm tra trước khi tiếp tục')
  if (usage.blockedUntil && Date.parse(usage.blockedUntil) > now.getTime()) return block(`${usage.lastReason ?? 'Đang nghỉ'} · đến ${new Date(usage.blockedUntil).toLocaleTimeString('vi-VN')}`, 'waiting')
  if (!policy.weekdays.includes(now.getDay())) return block('Hôm nay nằm ngoài lịch đã chọn', 'waiting')
  const minutes = now.getHours() * 60 + now.getMinutes()
  const minute = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const start = minute(policy.startTime), end = minute(policy.endTime)
  if (start !== end && !(start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end)) return block(`Ngoài khung giờ ${policy.startTime}–${policy.endTime}`, 'waiting')
  if (!cache || !cache.ok || !cache.signedIn || cache.date !== dayKey(now)) return block('Cần cập nhật trạng thái đăng nhập và hạn mức của hôm nay')
  if (policy.botRule.enabled) {
    const score = cache.serpBotScore
    const sourceTime = score?.updatedAt ? Date.parse(score.updatedAt) : NaN
    const valid = score?.value != null && Number.isFinite(score.value) && score.value >= 0 && score.value <= 1
    const fresh = valid && Number.isFinite(sourceTime) && sourceTime <= now.getTime() + 300000 && now.getTime() - sourceTime <= policy.botRule.maxAgeDays * 86400000
    plan.botState = !valid ? 'unknown' : !fresh ? 'stale' : score!.value! * 100 >= policy.botRule.threshold ? 'high' : 'fresh'
    if (!fresh) {
      if (policy.botRule.unknown === 'pause') return block(plan.botState === 'stale' ? 'Bot score đã cũ/không có thời gian nguồn; cần kiểm tra' : 'Chưa đọc được Bot score; cần kiểm tra')
      plan.notes.push('Bot score thiếu/cũ: dùng mục tiêu cơ bản theo lựa chọn của bạn')
    } else if (plan.botState === 'high') {
      if (policy.botRule.action === 'pause') return block('Bot score đạt ngưỡng bạn đặt; tạm dừng nhiệm vụ')
      plan.effectivePercent = Math.min(policy.targetPercent, policy.botRule.targetPercent)
      plan.notes.push(`Bot score đạt ngưỡng: giảm mục tiêu search còn ${plan.effectivePercent}%`)
    }
  }
  const target = (configured: number | null | undefined, actual: number | undefined): number =>
    Math.max(0, Math.floor(Math.min(configured ?? actual ?? 0, (actual ?? 0) * plan.effectivePercent / 100) / 3) * 3)
  plan.desktopTarget = policy.tasks.desktop ? target(profile.desktopMax, cache.desktop?.max) : 0
  plan.mobileTarget = policy.tasks.mobile ? target(profile.mobileMax, cache.mobile?.max) : 0
  plan.desktopSearches = policy.tasks.desktop ? Math.floor(Math.max(0, plan.desktopTarget - (cache.desktop?.progress ?? 0)) / 3) : 0
  plan.mobileSearches = policy.tasks.mobile ? Math.floor(Math.max(0, plan.mobileTarget - (cache.mobile?.progress ?? 0)) / 3) : 0
  let sessionReason = ''
  if (usage.sessions >= policy.maxSessionsPerDay) sessionReason = 'Đủ số phiên tìm kiếm trong ngày'
  else if (usage.lastSessionAt && now.getTime() - Date.parse(usage.lastSessionAt) < policy.sessionGapMinutes * 60000) sessionReason = 'Chưa đến khoảng cách giữa hai phiên tìm kiếm'
  plan.allowance = sessionReason ? 0 : Math.min(plan.remainingToday, policy.maxSearchesPerSession)
  if (plan.allowance > 0) {
    if (plan.desktopSearches > 0) plan.tasks.push('desktop')
    if (plan.mobileSearches > 0) plan.tasks.push('mobile')
  }
  if (policy.tasks.daily && cache.dailySet && cache.dailySet.progress < cache.dailySet.max) plan.tasks.push('daily')
  const earn = cache.earn
  if (policy.tasks.earn && earn && earn.progress < Math.max(0, earn.max - (earn.blockedPoints ?? 0))) plan.tasks.push('earn')
  if (sessionReason) plan.notes.push(sessionReason)
  if (!plan.remainingToday) plan.notes.push('Đã dùng hết ngân sách lượt tìm kiếm hôm nay')
  if (!plan.tasks.length) return block(sessionReason || 'Đã đạt mục tiêu hoặc không còn nhiệm vụ phù hợp', sessionReason && usage.sessions < policy.maxSessionsPerDay ? 'waiting' : 'goal-met')
  plan.reason = plan.notes[0] ?? 'Sẵn sàng theo quy tắc'
  return plan
}
