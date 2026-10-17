import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

const stubs = {
  './browser': 'export const humanPause=async()=>{}; export const humanType=async()=>{}; export const workPage=async()=>{throw Error("Không mở browser trong test")}',
  './logger': 'export const cancellableSleep=async()=>{};export const sleep=async()=>{}; export const randInt=(a)=>a;',
  './rewards': 'export const fmtCounter=(v)=>v?`${v.progress}/${v.max}`:"n/a";export const readCounters=async()=>({signedIn:true,points:100,todayPoints:0,counters:{search:{progress:0,max:1}}});'
}
const output = await build({ entryPoints: ['src/main/core/search.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'no-browser-test', setup(build) {
  build.onResolve({ filter: /^\.\/(browser|logger|rewards)$/ }, args => ({ path: args.path, namespace: 'stub' }))
  build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }))
} }] })
const { runSearchPass } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
async function run({ allowance = 3, restriction = false, emptyKeywords = false, queries, reserveQuery, releaseQuery } = {}) {
  const rememberedQueries = []
  let url = 'about:blank', submitted = 0, remembered = 0, reserved = 0, restrictions = 0
  const locator = { first() { return this }, count: async () => 0, waitFor: async () => {}, click: async () => {}, fill: async () => {} }
  const page = { setDefaultTimeout() {}, goto: async value => { url = value }, url: () => url, textContent: async () => '{"query":"127.0.0.1"}',
    waitForSelector: async () => {}, locator: () => locator, evaluate: async () => restriction, mouse: { wheel: async () => {} }, keyboard: { press: async () => { submitted++ } } }
  const result = await runSearchPass({ cfg: { search: { maxSearchesPerPass: 40, checkPointsEvery: 5, stallLimit: 20, minDelayMs: 0, maxDelayMs: 0, clickResultProbability: 0 } },
    ctx: {}, page, kind: 'desktop', log: { info() {}, warn() {}, error() {}, debug() {} }, target: 30, nextQuery: () => queries ? (queries.shift() ?? '') : emptyKeywords ? '' : 'test', reserveQuery, releaseQuery, rememberQuery: q => { remembered++; rememberedQueries.push(q) },
    beforeSearch: () => reserved < allowance ? (reserved++, true) : false, onRestriction: () => { restrictions++ }
  })
  return { result, submitted, remembered, rememberedQueries, reserved, restrictions }
}
test('hook ngân sách dừng core sau đúng 3 lượt, không cố chạy tới 30', async () => {
  const r = await run()
  assert.equal(r.submitted, 3); assert.equal(r.remembered, 3); assert.equal(r.result.searches, 3); assert.equal(r.result.status, 'policy-limit')
})
test('hết ngân sách không gửi thêm truy vấn; xác minh không tiêu hao lượt hay tự vượt', async () => {
  const empty = await run({ allowance: 0 }); assert.equal(empty.submitted, 0)
  const challenge = await run({ restriction: true }); assert.equal(challenge.submitted, 0); assert.equal(challenge.reserved, 0); assert.equal(challenge.restrictions, 1); assert.equal(challenge.result.status, 'restricted')
})


test('hết từ khoá dừng trước khi gửi search hoặc trừ ngân sách', async () => {
  const r = await run({ emptyKeywords: true })
  assert.equal(r.result.status, 'keywords-exhausted')
  assert.equal(r.result.searches, 0)
  assert.equal(r.submitted, 0)
  assert.equal(r.reserved, 0)
  assert.equal(r.remembered, 0)
})


test('hai pass cùng chọn một từ: giữ chỗ trước request, pass sau lấy từ khác; hết quota trả lại chỗ chưa gửi', async () => {
  const held = new Set()
  const reserveQuery = q => { if (held.has(q)) return false; held.add(q); return true }
  const releaseQuery = q => held.delete(q)
  const [a,b] = await Promise.all([
    run({allowance:1,queries:['shared query','second query','third query'],reserveQuery,releaseQuery}),
    run({allowance:1,queries:['shared query','second query','third query'],reserveQuery,releaseQuery})
  ])
  const sent = [...a.rememberedQueries,...b.rememberedQueries]
  assert.equal(sent.length,2);assert.equal(new Set(sent).size,2)
  assert.equal(held.size,2)
  held.clear()
  const denied = await run({allowance:0,queries:['unused query'],reserveQuery,releaseQuery})
  assert.equal(denied.submitted,0);assert.equal(held.size,0)
})
