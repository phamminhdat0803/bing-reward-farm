import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

const modules = {
  './policy-service': 'export const getPolicy=()=>globalThis.policyHarness.config;export const policyPlan=()=>globalThis.policyHarness.plan;export const pausePolicy=()=>{globalThis.policyHarness.paused++}',
  './runner': 'export const runState=()=>globalThis.policyHarness.busy;export const startRun=async(p)=>{globalThis.policyHarness.started.push(structuredClone(p));globalThis.policyHarness.plan={...globalThis.policyHarness.plan,tasks:[],reason:"Đạt mục tiêu"};return {ok:true}}',
  './cache': 'export const get=()=>globalThis.policyHarness.cache',
  './profiles': 'export const loadStore=()=>({profiles:globalThis.policyHarness.profiles});export const updateProfile=(id,patch)=>{const p=globalThis.policyHarness.profiles.find(p=>p.id===id);Object.assign(p,patch);return p}',
  './proxies': 'export const listProxies=()=>globalThis.policyHarness.proxies;export const resolveProxyChain=p=>p.proxyId?[p.proxyId]:[];export const preflightChain=async chain=>({live:chain[0]==="dead"?[]:chain,dead:[]});export const testAll=async()=>({})',
  './settings': 'export const AUTO_INTERVALS=[0,60000,900000,3600000,10800000];export const getSettings=()=>globalThis.policyHarness.settings;export const setSettings=patch=>Object.assign(globalThis.policyHarness.settings,patch)',
  'electron': 'export const app={getPath:()=>globalThis.policyHarness.dir}'
}
const bundle = await build({ entryPoints: ['src/main/auto.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'auto-no-side-effects', setup(build) {
  build.onResolve({ filter: /^(electron|\.\/(policy-service|runner|cache|profiles|proxies|settings))$/ }, args => ({ path: args.path, namespace: 'mock' }))
  build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: modules[args.path], loader: 'js' }))
} }] })
const source = Buffer.from(bundle.outputFiles[0].text).toString('base64')
let seq = 0
async function isolated(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-auto-test-'))
  globalThis.policyHarness = { dir, config: { enabled: true, defaults: { proxyRecovery: 'pause', proxyCount: 1 }, overrides: {} }, plan: { active: true, tasks: ['desktop'], reason: 'Sẵn sàng' },
    cache: { points: 100, desktop: { progress: 0, max: 90 }, mobile: { progress: 0, max: 60 }, dailySet: { progress: 3, max: 3 } }, busy: { running: false, queued: false },
    profiles: [{ id: 'test', name: 'Test' }], proxies: [], started: [], paused: 0, settings: { autoEveryMs: 0 } }
  const auto = await import(`data:text/javascript;base64,${source}#${seq++}`)
  try { await fn(auto, globalThis.policyHarness) }
  finally {
    auto.stopAutoNow()
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.match(path.basename(dir), /^brf-auto-test-/)
    fs.rmSync(dir, { recursive: true, force: true }); delete globalThis.policyHarness
  }
}
test('scheduler dừng khi đạt mục tiêu riêng, không xếp bù tới đủ trần Rewards', () => isolated(async (auto, h) => {
  await auto.runAutoCycle('test')
  await auto.runAutoCycle('test')
  assert.equal(h.started.length, 1)
  assert.deepEqual(auto.pendingTasks(h.profiles[0]), [])
}))
test('scheduler không xếp thêm cho acc đang chạy/chờ; mobile theo trần riêng khi tắt policy', () => isolated(async (auto, h) => {
  h.busy.queued = true; await auto.runAutoCycle('test'); assert.equal(h.started.length, 0)
  h.config.enabled = false; h.plan.active = false; h.profiles[0].mobileMax = 0
  assert.equal(auto.pendingTasks(h.profiles[0]).includes('mobile'), false)
}))
test('phục hồi dùng profile vừa gán và không lấy proxy đã là dự phòng của acc khác', () => isolated(async (auto, h) => {
  h.config.defaults.proxyRecovery = 'repair'
  h.profiles[0].proxyId = 'dead'
  h.profiles.push({ id: 'other', name: 'Other', proxyFallbacks: ['http://used:8080'] })
  h.proxies = [{ id: 'used', url: 'http://used:8080', label: 'used', lastTest: { ok: true, latency: 1 } }, { id: 'free', url: 'http://free:8080', label: 'free', lastTest: { ok: true, latency: 10 } }]
  await auto.runAutoCycle('test')
  assert.equal(h.started[0].proxyId, 'free')
  assert.deepEqual(h.started[0].proxyFallbacks, [])
}))
test('chu kỳ không hợp lệ bị chặn; dừng lịch lưu trạng thái tắt', () => isolated(async (auto, h) => {
  assert.throws(() => auto.setAutoEvery(1))
  auto.setAutoEvery(900000)
  assert.equal(h.settings.autoEveryMs, 900000)
  auto.stopAutoNow()
  assert.equal(h.settings.autoEveryMs, 0)
  assert.equal(auto.autoStatus().nextAt, null)
}))
