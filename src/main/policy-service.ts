import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { get as cached } from './cache'
import { loadState } from './core/state'
import { loadStore, stateFile, type Profile } from './profiles'
import { accountPolicy, dayKey, emptyUsage, evaluatePolicy, validatePolicy } from '../shared/policy-engine'
import { DEFAULT_AUTOMATION_POLICY, type AutomationPolicy, type PolicyPlan, type PolicyUsage } from '../shared/policy'

const file = (name: string): string => path.join(app.getPath('userData'), name)
function read<T>(name: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')) as T }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(fallback)
    console.error('[policy]', JSON.stringify({ event: 'read-failed', file: name }))
    throw new Error(`Không đọc được ${name}; tạm dừng để tránh mất hạn mức đã ghi`)
  }
}
function write(name: string, value: unknown): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  const target = file(name)
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(`${target}.tmp`, target)
}
export function getPolicy(): AutomationPolicy {
  const config = validatePolicy(read('automation-policy.json', DEFAULT_AUTOMATION_POLICY))
  const existing = new Set(loadStore().profiles.map(profile => profile.id))
  for (const id of Object.keys(config.overrides)) if (!existing.has(id)) delete config.overrides[id]
  return config
}
export function savePolicy(input: unknown): AutomationPolicy {
  const clean = validatePolicy(input, new Set(loadStore().profiles.map(p => p.id)))
  write('automation-policy.json', clean)
  console.info('[policy]', JSON.stringify({ event: 'config-saved', enabled: clean.enabled, overrides: Object.keys(clean.overrides).length }))
  return clean
}
type UsageStore = { date: string; profiles: Record<string, PolicyUsage> }
function store(): UsageStore {
  const data = read<UsageStore>('policy-usage.json', { date: dayKey(), profiles: {} })
  if (!data || typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles)) throw new Error('Hạn mức đã lưu bị lỗi; cần kiểm tra policy-usage.json')
  if (!Number.isFinite(Date.parse(`${data.date}T00:00:00`))) throw new Error('Ngày hạn mức đã lưu không hợp lệ')
  if (data.date !== dayKey()) return { date: dayKey(), profiles: Object.create(null) }
  data.profiles = Object.assign(Object.create(null), data.profiles)
  return data
}
function usageFor(data: UsageStore, profile: Profile): PolicyUsage {
  const day = loadState(stateFile(profile)).days[dayKey()]
  const runs = (day?.runs ?? []) as { summary?: Record<string, { searches?: number }> }[]
  const searchesInRuns = runs.reduce((n, r) => n + (r.summary?.desktop?.searches ?? 0) + (r.summary?.mobile?.searches ?? 0), 0)
  const observed = Math.max(day?.usedQueries?.length ?? 0, searchesInRuns, (day?.desktop?.searches ?? 0) + (day?.mobile?.searches ?? 0))
  const observedSessions = runs.filter(r => (r.summary?.desktop?.searches ?? 0) + (r.summary?.mobile?.searches ?? 0) > 0).length
  const usage = Object.hasOwn(data.profiles, profile.id) ? data.profiles[profile.id] : emptyUsage()
  if (![usage.searches, usage.sessions, usage.failures].every(v => Number.isSafeInteger(v) && v >= 0) ||
    [usage.lastSessionAt, usage.blockedUntil].some(v => v !== null && (typeof v !== 'string' || !Number.isFinite(Date.parse(v))))) throw new Error('Hạn mức tài khoản bị lỗi; tạm dừng để kiểm tra')
  return { ...usage, searches: Math.max(usage.searches, observed), sessions: Math.max(usage.sessions, observedSessions) }
}
export function policyPlan(profile: Profile, config = getPolicy()): PolicyPlan {
  return evaluatePolicy(config, profile, cached(profile.id), usageFor(store(), profile))
}
export function previewPolicy(input?: unknown): PolicyPlan[] {
  const profiles = loadStore().profiles
  const config = input === undefined ? getPolicy() : validatePolicy(input, new Set(profiles.map(p => p.id)))
  return profiles.map(p => policyPlan(p, config))
}
export type PolicyCursor = { date: string; searches: number; sessionStarted: boolean }
/** Ghi ngân sách TRƯỚC mỗi lần gửi search; thất bại cũng được tính để tránh retry vô hạn. */
export function reservePolicySearch(profile: Profile, cursor: PolicyCursor, kind: 'desktop' | 'mobile'): boolean {
  const config = getPolicy()
  if (!config.enabled || cursor.date !== dayKey()) return false
  const data = store(), usage = usageFor(data, profile)
  const rule = accountPolicy(config, profile.id)
  const guardUsage = cursor.sessionStarted ? { ...usage, sessions: Math.max(0, usage.sessions - 1), lastSessionAt: null } : usage
  const plan = evaluatePolicy(config, profile, cached(profile.id), guardUsage)
  if (!plan.tasks.includes(kind) || cursor.searches >= rule.maxSearchesPerSession) return false
  if (!cursor.sessionStarted) { usage.sessions += 1; usage.lastSessionAt = new Date().toISOString() }
  usage.searches += 1
  data.profiles[profile.id] = usage
  write('policy-usage.json', data)
  cursor.sessionStarted = true
  cursor.searches += 1
  return true
}
export function pausePolicy(profile: Profile, reason: string): void {
  const config = getPolicy()
  if (!config.enabled) return
  const rule = accountPolicy(config, profile.id), data = store(), usage = usageFor(data, profile)
  usage.failures += 1
  usage.blockedUntil = new Date(Date.now() + rule.cooldownMinutes * 60000).toISOString()
  usage.lastReason = reason
  data.profiles[profile.id] = usage
  write('policy-usage.json', data)
  console.warn('[policy]', JSON.stringify({ event: 'paused', profileId: profile.id, reason, until: usage.blockedUntil, failures: usage.failures }))
}
export function finishPolicyRun(profile: Profile, summary: Record<string, unknown>): void {
  const config = getPolicy()
  if (!config.enabled) return
  const rule = accountPolicy(config, profile.id)
  for (const kind of ['desktop', 'mobile', 'daily', 'earn']) {
    const result = summary[kind] as { status?: string; searches?: number; pointsBefore?: number; pointsAfter?: number } | undefined
    if (!result) continue
    if (result.status === 'restricted') return // Đã ghi lỗi ở thời điểm phát hiện xác minh.
    if (['proxy-failed', 'check-failed', 'not-signed-in', 'stalled'].includes(result.status ?? '')) {
      pausePolicy(profile, `${kind}: ${result.status}`); return
    }
    if (['desktop', 'mobile'].includes(kind) && rule.stopOnNoCredit && (result.searches ?? 0) > 0 && (result.pointsBefore == null || result.pointsAfter == null || result.pointsAfter <= result.pointsBefore)) {
      pausePolicy(profile, 'Chưa thấy điểm tăng sau phiên — nghỉ để chờ dữ liệu cập nhật'); return
    }
    if (['daily', 'earn'].includes(kind) && result.status && !['done', 'credited', 'nothing-to-do', 'cancelled'].includes(result.status)) {
      pausePolicy(profile, `${kind}: chưa xác nhận hoàn thành (${result.status})`); return
    }
  }
}
export function resumePolicy(id: string): void {
  const profile = loadStore().profiles.find(p => p.id === id)
  if (!profile) throw new Error('Không tìm thấy tài khoản')
  const data = store(), usage = usageFor(data, profile)
  data.profiles[id] = { ...usage, failures: 0, blockedUntil: null, lastReason: null }
  write('policy-usage.json', data)
  console.info('[policy]', JSON.stringify({ event: 'resumed', profileId: id, searchesRetained: usage.searches, sessionsRetained: usage.sessions }))
}
