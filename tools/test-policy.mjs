import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const output = await build({ stdin: { contents: 'export * from "./src/shared/policy-engine"; export * from "./src/shared/policy"', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false })
const { DEFAULT_ACCOUNT_POLICY, evaluatePolicy, emptyUsage, validatePolicy, dayKey } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
const now = new Date(2026, 9, 16, 10)
const profile = { id: 'acc', name: 'Test', desktopMax: null, mobileMax: null }
const snapshot = () => ({ ok: true, signedIn: true, date: dayKey(now), desktop: { progress: 0, max: 90 }, mobile: { progress: 0, max: 60 }, dailySet: { progress: 3, max: 3 }, earn: { progress: 30, max: 30 }, serpBotScore: { value: 0.95, updatedAt: now.toISOString(), checkedAt: now.toISOString() } })
const config = (patch = {}) => ({ version: 1, enabled: true, defaults: { ...structuredClone(DEFAULT_ACCOUNT_POLICY), ...patch }, overrides: {} })
const plan = (patch = {}, cache = snapshot(), usage = emptyUsage(), date = now, acc = profile) => evaluatePolicy(config(patch), acc, cache, usage, date)

test('3 lượt/ngày là ngân sách chung, khác 3 phiên/ngày', () => {
  const p = plan({ maxSearchesPerDay: 3, maxSessionsPerDay: 3, maxSearchesPerSession: 3 }, snapshot(), { ...emptyUsage(), searches: 2 })
  assert.equal(p.allowance, 1)
  assert.deepEqual(p.tasks, ['desktop', 'mobile'])
  assert.equal(plan({}, snapshot(), { ...emptyUsage(), sessions: 3 }).status, 'goal-met')
})
test('20% tính đúng từng loại và không vượt trần tài khoản; không có mobile thì bỏ qua', () => {
  assert.equal(plan({ targetPercent: 20 }).desktopTarget, 18)
  assert.equal(plan({ targetPercent: 20 }).mobileTarget, 12)
  assert.equal(plan({ targetPercent: 50 }, snapshot(), emptyUsage(), now, { ...profile, desktopMax: 30 }).desktopTarget, 30)
  const cache = snapshot(); cache.mobile = null
  assert.equal(plan({}, cache).mobileSearches, 0)
})
test('bot score mới/cao giảm mục tiêu về 20%; giá trị 0 vẫn hợp lệ', () => {
  const botRule = { ...DEFAULT_ACCOUNT_POLICY.botRule, enabled: true }
  assert.equal(plan({ botRule }).effectivePercent, 20)
  const cache = snapshot(); cache.serpBotScore.value = 0
  assert.equal(plan({ botRule }, cache).botState, 'fresh')
  assert.equal(plan({ botRule }, cache).effectivePercent, 50)
  assert.equal(plan({ botRule: { ...botRule, action: 'pause' } }).status, 'paused')
})
test('score cũ/thiếu/nguồn ở tương lai không được coi là score mới chỉ vì vừa đọc', () => {
  const botRule = { ...DEFAULT_ACCOUNT_POLICY.botRule, enabled: true }
  for (const updatedAt of [null, '2026-04-09T00:00:00Z', new Date(now.getTime() + 86400000).toISOString()]) {
    const cache = snapshot(); cache.serpBotScore.updatedAt = updatedAt
    assert.equal(plan({ botRule }, cache).status, 'paused')
    assert.equal(plan({ botRule: { ...botRule, unknown: 'base' } }, cache).effectivePercent, 50)
  }
  const cache = snapshot(); cache.serpBotScore = null
  assert.equal(plan({ botRule }, cache).botState, 'unknown')
})
test('đạt ngân sách search vẫn có thể làm Daily set, bỏ điểm earn bị khoá', () => {
  const cache = snapshot(); cache.dailySet.progress = 0; cache.earn = { progress: 20, max: 30, blockedPoints: 10 }
  const p = plan({}, cache, { ...emptyUsage(), searches: 10 })
  assert.deepEqual(p.tasks, ['daily'])
  assert.equal(p.allowance, 0)
})
test('khung giờ, ngày trong tuần và khung qua nửa đêm', () => {
  assert.equal(plan({}, snapshot(), emptyUsage(), new Date(2026, 9, 16, 23)).status, 'waiting')
  assert.equal(plan({ startTime: '22:00', endTime: '06:00' }, snapshot(), emptyUsage(), new Date(2026, 9, 16, 23)).status, 'ready')
  assert.equal(plan({ weekdays: [0] }).status, 'waiting')
  assert.equal(plan({ startTime: '10:00', endTime: '10:00' }).status, 'ready')
})
test('nghỉ giữa phiên, tạm dừng có thời hạn và giới hạn lỗi', () => {
  assert.equal(plan({}, snapshot(), { ...emptyUsage(), lastSessionAt: now.toISOString(), sessions: 1 }).status, 'waiting')
  assert.equal(plan({ pauseUntil: new Date(now.getTime() + 1000).toISOString() }).status, 'paused')
  assert.equal(plan({}, snapshot(), { ...emptyUsage(), failures: 2 }).status, 'paused')
  assert.equal(plan({}, snapshot(), { ...emptyUsage(), blockedUntil: new Date(now.getTime() + 1000).toISOString() }).status, 'waiting')
})
test('thiếu snapshot hôm nay, chưa đăng nhập và chỉ theo dõi đều không chạy', () => {
  assert.equal(plan({}, null).status, 'paused')
  for (const patch of [{ signedIn: false }, { ok: false }, { date: '2026-10-15' }]) assert.equal(plan({}, { ...snapshot(), ...patch }).status, 'paused')
  assert.deepEqual(plan({ mode: 'monitor' }).tasks, [])
  assert.equal(evaluatePolicy({ ...config(), enabled: false }, profile, null, emptyUsage(), now).active, false)
})
test('cấu hình riêng chỉ áp dụng đúng tài khoản', () => {
  const c = config(); c.overrides.acc = { ...c.defaults, targetPercent: 20 }
  assert.equal(evaluatePolicy(c, profile, snapshot(), emptyUsage(), now).effectivePercent, 20)
  assert.equal(evaluatePolicy(c, { ...profile, id: 'other' }, snapshot(), emptyUsage(), now).effectivePercent, 50)
})
test('biên IPC chặn số sai, giờ sai, mảng rỗng, profile lạ và prototype key', () => {
  for (const patch of [{ targetPercent: 101 }, { maxSearchesPerDay: NaN }, { maxSearchesPerSession: 0 }, { sessionGapMinutes: -1 }, { startTime: '25:00' }, { weekdays: [] }, { weekdays: [7] }, { mode: 'unknown' }]) assert.throws(() => validatePolicy(config(patch)))
  const bad = config(); bad.overrides.unknown = bad.defaults
  assert.throws(() => validatePolicy(bad, new Set(['acc'])))
  const polluted = JSON.parse(JSON.stringify(config())); Object.defineProperty(polluted.overrides, '__proto__', { value: polluted.defaults, enumerable: true })
  assert.throws(() => validatePolicy(polluted))
  assert.equal(validatePolicy(config()).defaults.targetPercent, 50)
})
