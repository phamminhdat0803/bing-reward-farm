#!/usr/bin/env node
// Tim proxy CON SONG va QUA DUOC Bing trong kho (de nghiem thu fallback).
//   node tools/find-live-proxy.mjs [soLuongCanTim]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { request } from 'playwright-core'

const FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'bing-reward-farm', 'proxies.json')
const want = Number(process.argv[2] ?? 3)
const items = JSON.parse(fs.readFileSync(FILE, 'utf8')).items.map((p) => p.url)

function parse(raw) {
  const s = String(raw || '').trim()
  const withScheme = /^(https?|socks4|socks5):\/\//i.test(s) ? s : `http://${s}`
  try {
    const u = new URL(withScheme)
    return { server: `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}` }
  } catch {
    return null
  }
}

async function probe(url) {
  const p = parse(url)
  if (!p) return null
  const t0 = Date.now()
  try {
    const req = await request.newContext({ proxy: { server: p.server }, timeout: 12000 })
    try {
      const res = await req.get('https://www.bing.com/?FORM=Z9FD1', { timeout: 12000 })
      if (res.status() >= 400) return null
      const ipRes = await req.get('http://ip-api.com/json', { timeout: 8000 }).catch(() => null)
      const d = ipRes && ipRes.ok() ? await ipRes.json().catch(() => null) : null
      return { url, ms: Date.now() - t0, ip: d?.query ?? null, country: d?.country ?? null }
    } finally {
      await req.dispose().catch(() => {})
    }
  } catch {
    return null
  }
}

const live = []
const CONC = 8
let i = 0
async function worker() {
  while (i < items.length && live.length < want) {
    const idx = i
    i += 1
    const r = await probe(items[idx])
    if (r) {
      live.push(r)
      console.log(`LIVE (${live.length}/${want}) ${r.url} -> ${r.ip ?? '?'} ${r.country ?? ''} ${r.ms}ms`)
    }
  }
}
await Promise.all(Array.from({ length: CONC }, () => worker()))

console.log(`\n== ${live.length}/${items.length} proxy vua song vua qua duoc Bing ==`)
fs.writeFileSync(path.join(os.tmpdir(), 'brf-live-proxies.json'), JSON.stringify(live, null, 2), 'utf8')
for (const l of live) console.log('  ' + l.url)
