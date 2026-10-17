import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

test('global usage migrates history, claims exclusively, survives reload/day/import, and fails closed on corruption', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-keyword-usage-'))
  const output = await build({stdin:{contents:"export * from './src/main/keyword-usage';export * from './src/main/keywords';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'electron-test',setup(b){
    b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const app={getPath:()=>${JSON.stringify(dir)}}`}))
  }}]})
  let sequence=0
  const load=()=>import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}#${sequence++}`)
  try {
    fs.mkdirSync(path.join(dir,'state'))
    fs.writeFileSync(path.join(dir,'state','old-profile.json'),JSON.stringify({days:{'2026-10-01':{usedQueries:['historical query']}}}))
    const svc=await load()
    assert.equal(svc.usedKeywordKeys().has('historical query'),true)
    const a={id:'a',name:'Browser A'},b={id:'b',name:'Browser B'}
    const claims=await Promise.all([Promise.resolve().then(()=>svc.reserveKeyword('  How  do trees grow ',a,'desktop')),Promise.resolve().then(()=>svc.reserveKeyword('HOW DO TREES GROW',b,'mobile'))])
    assert.deepEqual(claims,[true,false])
    svc.markKeywordUsed('how do trees grow','b')
    assert.equal(svc.keywordUsage(['how do trees grow'])[0].status,'reserved')
    svc.markKeywordUsed('how do trees grow','a')
    svc.releaseKeyword('how do trees grow','a')
    assert.equal(svc.keywordUsage(['how do trees grow'])[0].status,'used')
    assert.equal(svc.reserveKeyword('how do trees grow',b,'mobile'),false)
    svc.saveKeywords('How do trees grow\nhistorical query\nnew query','replace')
    assert.equal(svc.getKeywords().usage.length,2)
    svc.saveKeywords('brand new query','replace')
    svc.saveKeywords('HOW DO TREES GROW','append')
    assert.equal(svc.getKeywords().usage.length,1)
    assert.equal(svc.reserveKeyword('never submitted',a,'desktop'),true)
    svc.releaseKeyword('never submitted','b')
    assert.equal(svc.reserveKeyword('never submitted',b,'mobile'),false)
    svc.releaseKeyword('never submitted','a')
    assert.equal(svc.reserveKeyword('never submitted',b,'mobile'),true)
    const fresh=await load()
    assert.equal(fresh.reserveKeyword('how do trees grow',b,'mobile'),false)
    assert.equal(fresh.reserveKeyword('never submitted',a,'desktop'),false,'uncertain in-flight claims stay blocked after restart')
    assert.equal(fresh.keywordUsage(['historical query'])[0].profileId,'old-profile')
    fs.appendFileSync(path.join(dir,'keyword-usage.jsonl'),'broken entry\n')
    const corrupt=await load()
    assert.throws(()=>corrupt.usedKeywordKeys(),/tránh tái sử dụng/)
  } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^brf-keyword-usage-/)
    fs.rmSync(dir,{recursive:true,force:true})
  }
})
