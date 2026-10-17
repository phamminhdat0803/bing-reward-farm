import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'
import { normalizeKeywords, keywordPrompt } from '../src/shared/keywords.ts'
const pickerBuild = await build({ entryPoints: ['src/main/core/queries.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { makeQueryPicker } = await import(`data:text/javascript;base64,${Buffer.from(pickerBuild.outputFiles[0].text).toString('base64')}`)

test('large AI lists normalize bullets, numbering, whitespace and case duplicates', () => {
  const text = Array.from({ length: 1500 }, (_, i) => `${i + 1}. how does topic ${i} work`).join('\r\n')
  const list = normalizeKeywords(`\uFEFF# heading\n\`\`\`text\n${text}\n* HOW DOES TOPIC 0 WORK\n\`\`\``)
  assert.equal(list.length, 1500)
  assert.equal(list[0], 'how does topic 0 work')
  assert.throws(() => normalizeKeywords('a'.repeat(301)))
  assert.throws(() => normalizeKeywords(Array.from({ length: 100001 }, (_, i) => `topic ${i}`).join('\n')))
  assert.match(keywordPrompt(2500, 'space and history'), /2500 distinct/)
  assert.match(keywordPrompt(2500, 'space and history'), /space and history/)
  for (const count of [0, -1, 1.5, NaN, 100001]) assert.throws(() => keywordPrompt(count, ''))
})

test('picker respects same-day history across case and stops without inventing queries', () => {
  const next = makeQueryPicker(['first query', 'second query', 'third query'], new Set(['FIRST QUERY']))
  assert.deepEqual(new Set([next(), next()]), new Set(['second query', 'third query']))
  assert.equal(next(), '')
  assert.equal(next(), '')
  assert.equal(makeQueryPicker([], new Set())(), '')
})

test('library persists 1500+ keywords, appends unique entries, replaces without touching daily history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-keywords-'))
  const output = await build({ entryPoints: ['src/main/keywords.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'electron-test', setup(b) {
      b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'mock' }))
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(dir)} }` }))
    } }] })
  try {
    const svc = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
    assert.deepEqual(svc.getKeywords().keywords, [])
    fs.writeFileSync(path.join(dir, 'history.json'), 'unchanged')
    const list = Array.from({ length: 1500 }, (_, i) => `meaningful query ${i}`)
    assert.equal(svc.saveKeywords(list.join('\n'), 'replace').keywords.length, 1500)
    assert.equal(svc.saveKeywords('MEANINGFUL QUERY 0\nnew topic', 'append').keywords.length, 1501)
    assert.equal(svc.getKeywords().keywords.length, 1501)
    assert.ok(svc.getKeywords().updatedAt)
    assert.throws(() => svc.saveKeywords('', 'replace'))
    assert.equal(svc.getKeywords().keywords.length, 1501)
    assert.deepEqual(svc.saveKeywords('fresh keyword', 'replace').keywords, ['fresh keyword'])
    assert.equal(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'), 'unchanged')
    assert.equal(fs.existsSync(path.join(dir, 'keywords.json.tmp')), false)
    fs.writeFileSync(path.join(dir, 'keywords.json'), 'broken')
    assert.throws(() => svc.getKeywords())
    assert.deepEqual(svc.saveKeywords('repair keyword', 'replace').keywords, ['repair keyword'])
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
    assert.match(path.basename(dir), /^brf-keywords-/)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
