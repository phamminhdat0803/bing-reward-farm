import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchAutoProfiles } from '../src/main/auto-dispatch.ts'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { build } from 'esbuild'

test('saved auto parallelism survives reload; old/invalid settings remain sequential', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brf-auto-settings-'))
  const output=await build({entryPoints:['src/main/settings.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-electron',setup(b){
    b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const app={getPath:()=>${JSON.stringify(dir)}}`}))
  }}]})
  const source=Buffer.from(output.outputFiles[0].text).toString('base64')
  try {
    const svc=await import(`data:text/javascript;base64,${source}#first`)
    assert.equal(svc.getSettings().autoParallelRuns,1)
    svc.setSettings({autoParallelRuns:3})
    const reloaded=await import(`data:text/javascript;base64,${source}#second`)
    assert.equal(reloaded.getSettings().autoParallelRuns,3)
    for(const value of [0,-1,11,2.5,NaN])assert.throws(()=>svc.setSettings({autoParallelRuns:value}))
    fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({autoEveryMs:900000}))
    assert.equal(svc.getSettings().autoParallelRuns,1)
    fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({autoParallelRuns:100}))
    assert.equal(svc.getSettings().autoParallelRuns,1)
  } finally {
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^brf-auto-settings-/)
    fs.rmSync(dir,{recursive:true,force:true})
  }
})

test('pool keeps all workers joined after an error and obeys concurrency', async () => {
  let active=0, peak=0
  const started=[],finished=[],errors=[]
  await dispatchAutoProfiles([0,1,2,3,4],2,async profile=>{
    started.push(profile);active++;peak=Math.max(peak,active)
    await new Promise(resolve=>setTimeout(resolve,profile===0?2:12))
    active--;finished.push(profile)
    if(profile===0)throw Error('isolated failure')
  },()=>false,(profile)=>errors.push(profile))
  assert.equal(peak,2);assert.equal(active,0)
  assert.deepEqual(started,[0,1,2,3,4]);assert.equal(finished.length,5);assert.deepEqual(errors,[0])
})

test('stop prevents new dispatch and waits for workers already started', async () => {
  let stop=false,finished=0
  const started=[]
  await dispatchAutoProfiles([0,1,2,3,4],2,async profile=>{
    started.push(profile)
    await new Promise(resolve=>setTimeout(resolve,5))
    stop=true;finished++
  },()=>stop,()=>{})
  assert.deepEqual(started,[0,1]);assert.equal(finished,2)
})
