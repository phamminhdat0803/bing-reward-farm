import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { parseProxyCsv } from '../src/shared/proxy-csv.ts'
import { selectQuickProxies } from '../src/renderer/src/lib/proxy-quick-fill.ts'
import { proxyTestCandidates } from '../src/shared/proxy-testing.ts'

test('744 stored proxies produce exactly 546 eligible IDs; empty/blacklist selections never become test-all', () => {
  const items = Array.from({ length: 744 }, (_, i) => ({ id: String(i), url: `http://host${i}:80`, status: i < 198 ? 'blacklisted' : undefined }))
  assert.equal(proxyTestCandidates(items).length, 546)
  assert.equal(proxyTestCandidates(items, items.map(p => p.id)).length, 546)
  assert.deepEqual(proxyTestCandidates(items, []), [])
  assert.deepEqual(proxyTestCandidates(items, ['0', '197', 'missing']), [])
  assert.deepEqual(proxyTestCandidates([...items, { id: 'alias', url: items[0].url }], ['alias']), [])
})

test('mixed full and selected batches never request or update a blacklisted proxy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-proxy-test-'))
  const output = await build({ entryPoints: ['src/main/proxies.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'mixed-batch', setup(b) {
      b.onResolve({ filter: /^(electron|playwright-core)$|\/core\/browser$|\/proxy-test$|\/proxy-history$/ }, args => ({ path: args.path, namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
        args.path === 'electron' ? `export const app = {getPath: () => ${JSON.stringify(dir)}}` :
        args.path === 'playwright-core' ? 'export const request = {newContext: async ({proxy}) => {globalThis.__proxyRequests.push(proxy.server); return {get:async()=>({status:()=>200}),dispose:async()=>{}}}}' :
        args.path.endsWith('browser') ? 'export const parseProxy = url => ({server:url})' :
        args.path.endsWith('proxy-test') ? 'export const testProxy = async url => {globalThis.__proxyRequests.push(url);return {ok:true}}' :
        'export const recordProxyTest = id => globalThis.__proxyHistory.push(id)', loader: 'js' }))
    } }] })
  globalThis.__proxyRequests = []; globalThis.__proxyHistory = []
  try {
    const items = Array.from({ length: 744 }, (_, i) => ({id:String(i),label:String(i),url:`http://host${i}:80`,createdAt:'',status:i<198?'blacklisted':undefined}))
    fs.writeFileSync(path.join(dir, 'proxies.json'), JSON.stringify({version:1,items}))
    const svc = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
    const progress = []
    const result = await svc.testAll(15, undefined, p => progress.push(p))
    assert.equal(Object.keys(result).length, 546)
    assert.equal(progress.length, 546)
    assert.ok(progress.every(p => p.total === 546 && Number(p.id) >= 198))
    assert.equal(progress.at(-1).done, 546)
    assert.equal(globalThis.__proxyRequests.length, 546 * 2)
    assert.ok(globalThis.__proxyRequests.every(url => Number(url.match(/host(\d+)/)[1]) >= 198))
    assert.ok(globalThis.__proxyHistory.every(id => Number(id) >= 198))
    assert.ok(svc.listProxies().slice(0,198).every(p => !p.lastTest && p.status === 'blacklisted'))
    globalThis.__proxyRequests.length = 0
    assert.deepEqual(await svc.testAll(15, []), {})
    assert.deepEqual(await svc.testAll(15, ['0','197']), {})
    assert.equal(globalThis.__proxyRequests.length, 0)
    assert.deepEqual(Object.keys(await svc.testAll(15, ['0', '198'])), ['198'])
    assert.equal(globalThis.__proxyRequests.length, 2)
  } finally {
    delete globalThis.__proxyRequests; delete globalThis.__proxyHistory
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.match(path.basename(dir), /^brf-proxy-test-/)
    fs.rmSync(dir, {recursive:true, force:true})
  }
})

test('CSV export round trip: BOM, quoted commas, quotes, multiline notes, status', () => {
  assert.deepEqual(parseProxyCsv('\uFEFFten,url,note,status\r\n"A, ""B""",socks5://host:1080,"line 1\nline 2",blacklisted\r\n'), [
    { label: 'A, "B"', url: 'socks5://host:1080', note: 'line 1\nline 2', status: 'blacklisted' }
  ])
  assert.equal(parseProxyCsv('proxy;name\nhost:8080;Example')[0].status, 'active')
  for (const csv of ['label\nabc', 'url\ninvalid', 'url,status\nhost:80,nope', 'url\n"broken']) assert.throws(() => parseProxyCsv(csv))
})

test('disabled proxies never enter quick assignment even with successful cached tests', () => {
  const make = status => ({ id: status, url: `${status}:80`, label: status, status, lastTest: { ok: true } })
  assert.deepEqual(selectQuickProxies(['unused', 'blacklisted', 'active'].map(make), [], undefined, 3).map(p => p.id), ['active'])
})

test('persistent exclusions apply to single, batch, health and CSV duplicate import without network', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-proxy-test-'))
  const output = await build({ entryPoints: ['src/main/proxies.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'isolate', setup(b) {
      b.onResolve({ filter: /^(electron|playwright-core)$|\/core\/browser$|\/proxy-test$|\/proxy-history$/ }, args => ({ path: args.path, namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
        args.path === 'electron' ? `export const app = { getPath: () => ${JSON.stringify(dir)} }` :
        args.path === 'playwright-core' ? 'export const request = {newContext: () => {throw new Error("NETWORK MUST NOT RUN")}}' :
        args.path.endsWith('browser') ? 'export const parseProxy = () => {throw new Error("NETWORK MUST NOT RUN")}' :
        args.path.endsWith('proxy-test') ? 'export const testProxy = () => {throw new Error("NETWORK MUST NOT RUN")}' :
        'export const recordProxyTest = () => {throw new Error("HISTORY MUST NOT CHANGE")}', loader: 'js' }))
    } }] })
  try {
    const svc = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
    const item = svc.addProxy({ url: 'host:80', label: 'Keep me' })
    svc.updateProxy(item.id, { status: 'blacklisted' })
    assert.equal((await svc.testAndSave(item.id)).ok, false)
    assert.deepEqual(await svc.testAll(3), {})
    assert.deepEqual(await svc.testAll(3, [item.id]), {})
    await assert.rejects(svc.checkProxyHealth(item.url), /blacklist/)
    assert.deepEqual(svc.importProxyCsv('url,status\nhost:80,active\nother:80,unused'), { added: 1, skipped: 1 })
    assert.equal(svc.getProxy(item.id).status, 'blacklisted')
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'proxies.json'))).items[0].status, 'blacklisted')
    assert.equal(svc.getProxy(item.id).lastTest, undefined)
    svc.updateProxy(item.id, { status: 'active' })
    assert.equal(svc.getProxy(item.id).status, 'active')
    assert.throws(() => svc.importProxyCsv('url\nvalid:80\ninvalid'))
    assert.equal(svc.listProxies().length, 2)
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.match(path.basename(dir), /^brf-proxy-test-/)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
