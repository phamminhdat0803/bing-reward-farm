import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

const output = await build({ entryPoints: ['src/main/policy-service.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'isolated-electron', setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const app = { getPath: () => process.env.BRF_POLICY_TEST_DIR }', loader: 'js' }))
  } }] })
const source = Buffer.from(output.outputFiles[0].text).toString('base64')
let seq = 0
const date = new Date(); const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const profile = { id: 'test', name: 'Test', account: '', profileDir: '', cdpPort: 9400, channel: 'chrome', headless: false, createdAt: '', lastRunAt: null }
const defaults = { mode: 'limited', targetPercent: 100, maxSearchesPerDay: 3, maxSessionsPerDay: 3, maxSearchesPerSession: 3, sessionGapMinutes: 0, startTime: '00:00', endTime: '00:00', weekdays: [0,1,2,3,4,5,6], tasks: { desktop: true, mobile: true, daily: false, earn: false }, botRule: { enabled: false, threshold: 80, action: 'reduce', targetPercent: 20, maxAgeDays: 30, unknown: 'pause' }, pauseUntil: null, stopOnNoCredit: true, cooldownMinutes: 60, maxFailuresPerDay: 2, proxyRecovery: 'pause', proxyCount: 1 }
async function isolated(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-policy-test-'))
  process.env.BRF_POLICY_TEST_DIR = dir
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ version: 1, portRange: [9400,9500], profiles: [profile] }))
  fs.writeFileSync(path.join(dir, 'cache.json'), JSON.stringify({ version: 1, items: { test: { ok: true, signedIn: true, date: today, desktop: { progress: 0, max: 90 }, mobile: { progress: 0, max: 60 }, dailySet: { progress: 3, max: 3 }, earn: null } } }))
  const load = () => import(`data:text/javascript;base64,${source}#${seq++}`)
  try { await fn(await load(), dir, load) }
  finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.match(path.basename(dir), /^brf-policy-test-/)
    fs.rmSync(dir, { recursive: true, force: true }); delete process.env.BRF_POLICY_TEST_DIR
  }
}
const cursor = () => ({ date: today, searches: 0, sessionStarted: false })

test('ngân sách chung desktop/mobile giữ qua reload và chặn lượt thứ 4', () => isolated(async (svc, dir, reload) => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: {} })
  const run = cursor()
  assert.equal(svc.reservePolicySearch(profile, run, 'desktop'), true)
  assert.equal(svc.reservePolicySearch(profile, run, 'mobile'), true)
  assert.equal(svc.reservePolicySearch(profile, run, 'desktop'), true)
  assert.equal(svc.reservePolicySearch(profile, run, 'mobile'), false)
  const fresh = await reload()
  assert.equal(fresh.policyPlan(profile).usage.searches, 3)
  assert.equal(fresh.reservePolicySearch(profile, cursor(), 'desktop'), false)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'policy-usage.json'), 'utf8')).profiles.test.sessions, 1)
}))
test('không lên điểm thì nghỉ; gỡ chờ không xóa lượt hoặc phiên đã dùng', () => isolated(async svc => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: {} })
  svc.reservePolicySearch(profile, cursor(), 'desktop')
  svc.finishPolicyRun(profile, { desktop: { status: 'done', searches: 1, pointsBefore: 100, pointsAfter: 100 } })
  assert.equal(svc.policyPlan(profile).status, 'waiting')
  assert.equal(svc.reservePolicySearch(profile, cursor(), 'desktop'), false)
  svc.resumePolicy('test')
  assert.equal(svc.policyPlan(profile).usage.searches, 1)
  assert.equal(svc.policyPlan(profile).usage.sessions, 1)
  assert.equal(svc.policyPlan(profile).usage.failures, 0)
}))
test('đọc lịch sử trước khi bật quy tắc; sang ngày mới reset ngân sách', () => isolated(async (svc, dir) => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: {} })
  fs.mkdirSync(path.join(dir, 'state'))
  fs.writeFileSync(path.join(dir, 'state/test.json'), JSON.stringify({ version: 1, days: { [today]: { usedQueries: ['a','b','c','d'], runs: [] } } }))
  assert.equal(svc.policyPlan(profile).usage.searches, 4)
  assert.equal(svc.policyPlan(profile).allowance, 0)
  fs.unlinkSync(path.join(dir, 'state/test.json'))
  fs.writeFileSync(path.join(dir, 'policy-usage.json'), JSON.stringify({ date: '2020-01-01', profiles: { test: { searches: 999 } } }))
  assert.equal(svc.policyPlan(profile).usage.searches, 0)
}))
test('file hỏng không âm thầm reset quota; cấu hình sai không ghi đè', () => isolated(async (svc, dir) => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: {} })
  assert.throws(() => svc.savePolicy({ version: 1, enabled: true, defaults: { ...defaults, maxSearchesPerDay: -1 }, overrides: {} }))
  assert.equal(svc.getPolicy().defaults.maxSearchesPerDay, 3)
  fs.writeFileSync(path.join(dir, 'policy-usage.json'), '{bad json')
  assert.throws(() => svc.policyPlan(profile), /Không đọc được/)
}))
test('cấu hình đổi sang theo dõi giữa phiên chặn search kế tiếp', () => isolated(async svc => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: {} })
  const run = cursor(); assert.equal(svc.reservePolicySearch(profile, run, 'desktop'), true)
  svc.savePolicy({ version: 1, enabled: true, defaults: { ...defaults, mode: 'monitor' }, overrides: {} })
  assert.equal(svc.reservePolicySearch(profile, run, 'desktop'), false)
}))

test('mất bộ đếm cuối phiên cũng nghỉ, ngày/record hỏng không reset ngầm', () => isolated(async (svc, dir) => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: {} })
  svc.finishPolicyRun(profile, { desktop: { status: 'done', searches: 1, pointsBefore: 100, pointsAfter: null } })
  assert.equal(svc.policyPlan(profile).status, 'waiting')
  fs.writeFileSync(path.join(dir, 'policy-usage.json'), JSON.stringify({ date: '2026-99-99', profiles: {} }))
  assert.throws(() => svc.policyPlan(profile))
}))

test('xoá tài khoản không để cấu hình mồ côi chặn lần Lưu tiếp theo', () => isolated(async (svc, dir) => {
  svc.savePolicy({ version: 1, enabled: true, defaults, overrides: { test: defaults } })
  fs.writeFileSync(path.join(dir, 'profiles.json'), JSON.stringify({ version: 1, portRange: [9400,9500], profiles: [] }))
  const config = svc.getPolicy()
  assert.deepEqual(Object.keys(config.overrides), [])
  assert.doesNotThrow(() => svc.savePolicy(config))
}))
