#!/usr/bin/env node
// Phase 1: kiem chung Chromium co fallback proxy chain (--proxy-server="p1,p2") tren Edge 155 khong.
//   node tools/test-proxy-chain.mjs
import { chromium } from 'playwright-core'
import os from 'node:os'
import path from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const DEAD = 'http://127.0.0.1:9' // cong khong mo -> connection refused
const ALIVE = process.env.ALIVE || 'socks4://116.101.14.169:1100'

async function probe(label, args) {
  const dir = path.join(os.tmpdir(), `brf-chain-${label}-${Date.now()}`)
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: EDGE,
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', ...args]
  })
  let result
  const t0 = Date.now()
  try {
    const page = await ctx.newPage()
    await page.goto('http://ip-api.com/json', { waitUntil: 'domcontentloaded', timeout: 25000 })
    const txt = (await page.textContent('body')) || ''
    const ip = (txt.match(/"query":"([^"]+)"/) || [])[1] ?? null
    const country = (txt.match(/"country":"([^"]+)"/) || [])[1] ?? null
    result = { ok: true, ip, country, ms: Date.now() - t0 }
  } catch (e) {
    result = { ok: false, error: String(e.message).split('\n')[0].slice(0, 120), ms: Date.now() - t0 }
  }
  await ctx.close().catch(() => {})
  return result
}

const out = {}
out.baseline = await probe('base', []) // khong proxy -> IP that cua may
out.chain_dead_alive = await probe('chain', [`--proxy-server=${DEAD},${ALIVE}`])
out.dead_only = await probe('dead', [`--proxy-server=${DEAD}`])
out.alive_only = await probe('alive', [`--proxy-server=${ALIVE}`])

console.log(JSON.stringify({ dead: DEAD, alive: ALIVE, ...out }, null, 2))
console.log(
  '\nKET LUAN:',
  out.chain_dead_alive.ok && out.chain_dead_alive.ip && out.chain_dead_alive.ip !== out.baseline.ip
    ? 'CHAIN CO FALLBACK (proxy dau chet -> tu chay qua proxy sau)'
    : 'CHAIN KHONG FALLBACK (hoac proxy sau cung chet) — kiem tra lai'
)
