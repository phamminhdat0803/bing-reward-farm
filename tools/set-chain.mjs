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

// KHOI PHUC AN TOAN: chi sua proxy/proxyId/proxyFallbacks cua acc da test, KHONG ghi de ca file
if (mode === 'restore') {
  if (!fs.existsSync(BAK)) {
    console.log('khong co backup')
    process.exit(1)
  }
  const cur = JSON.parse(fs.readFileSync(FILE, 'utf8'))
  const bak = JSON.parse(fs.readFileSync(BAK, 'utf8'))
  let n = 0
  const ids = (process.env.RESTORE_IDS || 'default,thap-vu,tien-at-duong,ke-ao,datkenhtg').split(',')
  for (const id of ids) {
    const c = cur.profiles.find((p) => p.id === id.trim())
    const b = bak.profiles.find((p) => p.id === id.trim())
    if (!c || !b) continue
    c.proxy = b.proxy ?? null
    c.proxyId = b.proxyId ?? null
    c.proxyFallbacks = b.proxyFallbacks ?? null
    n += 1
  }
  fs.writeFileSync(FILE, JSON.stringify(cur, null, 2) + '\n', 'utf8')
  console.log('restored (surgical) ' + n + ' profile: chi 3 truong proxy')
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
