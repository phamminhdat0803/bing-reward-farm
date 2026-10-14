#!/usr/bin/env node
// Dat / khoi phuc chain proxy cho 1 profile de nghiem thu fallback.
//   node tools/set-chain.mjs set <profileId> <mainProxy> <fallback1,fallback2...>
//   node tools/set-chain.mjs restore
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'bing-reward-farm', 'profiles.json')
const BAK = path.join(os.tmpdir(), 'profiles-backup.json')
const mode = process.argv[2]

if (mode === 'restore') {
  if (!fs.existsSync(BAK)) {
    console.log('khong co backup')
    process.exit(1)
  }
  fs.copyFileSync(BAK, FILE)
  const j = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const t = j.profiles.find((p) => p.proxyFallbacks || p.proxy === 'http://127.0.0.1:9')
  console.log('restored. profile test con fallback?', !!t)
  process.exit(0)
}

const [, , , id, main, fallbacks] = process.argv
const raw = fs.readFileSync(FILE, 'utf8')
if (!fs.existsSync(BAK)) fs.writeFileSync(BAK, raw, 'utf8')
const j = JSON.parse(raw)
const p = j.profiles.find((x) => x.id === id)
if (!p) {
  console.log('khong thay profile', id)
  process.exit(1)
}
const old = { proxy: p.proxy ?? null, proxyId: p.proxyId ?? null }
p.proxyId = null
p.proxy = main
p.proxyFallbacks = fallbacks ? fallbacks.split(',').map((s) => s.trim()).filter(Boolean) : []
fs.writeFileSync(FILE, `${JSON.stringify(j, null, 2)}\n`, 'utf8')
console.log('SET', id, '| chinh =', main, '| du phong =', JSON.stringify(p.proxyFallbacks), '| truoc do:', JSON.stringify(old))
