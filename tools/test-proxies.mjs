#!/usr/bin/env node
// Test nhanh 1 danh sach proxy bang dung co che cua app (playwright request context).
//   node tools/test-proxies.mjs proxies.txt         (moi dong 1 proxy)
//   node tools/test-proxies.mjs --inline "socks5://1.2.3.4:1080"
import fs from 'node:fs'
import { request } from 'playwright-core'

function parseProxy(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const parts = s.split(':')
  if (parts.length === 4 && !s.includes('@') && !s.includes('//')) {
    const [host, port, user, pass] = parts
    return { server: `http://${host}:${port}`, username: user, password: pass }
  }
  const withScheme = /^(https?|socks4|socks5):\/\//i.test(s) ? s : `http://${s}`
  try {
    const u = new URL(withScheme)
    const server = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`
    const res = { server }
    if (u.username) res.username = decodeURIComponent(u.username)
    if (u.password) res.password = decodeURIComponent(u.password)
    return res
  } catch {
    return null
  }
}

async function testOne(raw) {
  const parsed = parseProxy(raw)
  if (!parsed) return { raw, ok: false, error: 'dinh dang khong hop le' }
  const t0 = Date.now()
  try {
    const req = await request.newContext({
      proxy: { server: parsed.server, username: parsed.username, password: parsed.password },
      timeout: 12000
    })
    try {
      const res = await req.get('http://ip-api.com/json', { timeout: 12000 })
      const latency = Date.now() - t0
      if (!res.ok()) return { raw, ok: false, latency, error: `HTTP ${res.status()}` }
      const d = await res.json().catch(() => null)
      if (d && (d.status === 'success' || d.query)) {
        return { raw, ok: true, ip: d.query, country: d.country, city: d.city, latency, server: parsed.server }
      }
      const fb = await req.get('https://api.ipify.org?format=json', { timeout: 6000 }).catch(() => null)
      if (fb && fb.ok()) {
        const j = await fb.json().catch(() => null)
        return { raw, ok: true, ip: j?.ip ?? 'N/A', latency, server: parsed.server }
      }
      return { raw, ok: true, ip: 'ket noi duoc', latency, server: parsed.server }
    } finally {
      await req.dispose().catch(() => {})
    }
  } catch (e) {
    const msg = String(e.message)
    const latency = Date.now() - t0
    let err = msg.slice(0, 90)
    if (/timeout/i.test(msg)) err = 'Timeout'
    else if (/ECONNREFUSED/i.test(msg)) err = 'Connection refused'
    else if (/407|proxy auth/i.test(msg)) err = 'Sai user/pass (407)'
    else if (/ENOTFOUND/i.test(msg)) err = 'DNS not found'
    return { raw, ok: false, latency, error: err, server: parsed.server }
  }
}

const args = process.argv.slice(2)
let list = []
const inlineIdx = args.indexOf('--inline')
if (inlineIdx >= 0) list = [args[inlineIdx + 1]]
else {
  const file = args[0]
  if (!file || !fs.existsSync(file)) {
    process.stdout.write('Thieu file danh sach proxy\n')
    process.exit(1)
  }
  list = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}
const limit = Number(process.env.LIMIT || list.length)
list = list.slice(0, limit)

const CONC = Number(process.env.CONC || 6)
process.stdout.write(`Test ${list.length} proxy (concurrency ${CONC})...\n`)
const results = []
let idx = 0
async function worker() {
  while (idx < list.length) {
    const i = idx
    idx += 1
    const r = await testOne(list[i])
    results[i] = r
    process.stdout.write(
      `${r.ok ? 'OK  ' : 'FAIL'} | ${String(r.latency ?? '').padStart(5)}ms | ${r.raw.slice(0, 44).padEnd(44)} | ${r.ok ? `${r.ip} ${r.country ?? ''} ${r.city ?? ''}` : r.error}\n`
    )
  }
}
await Promise.all(Array.from({ length: Math.min(CONC, list.length) }, () => worker()))

const ok = results.filter((r) => r.ok)
process.stdout.write(`\n== TONG KET: ${ok.length}/${list.length} chay duoc ==\n`)
for (const r of ok) process.stdout.write(`  ${r.raw}  ->  ${r.ip} ${r.country ?? ''} ${r.city ?? ''} (${r.latency}ms)\n`)
fs.writeFileSync('reports-proxy-test.json', JSON.stringify(results, null, 2), 'utf8')
