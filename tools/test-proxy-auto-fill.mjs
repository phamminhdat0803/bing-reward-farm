import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'
import { rankedReliableProxies } from '../src/shared/proxy-auto-fill.ts'

const options={count:1,minRate:90,minTests:10}
const proxy=(id)=>({id,url:`http://${id}:80`,label:id,lastTest:{ok:true,latency:10}})
const stat=(p,ok,fail)=>({id:p.id,url:p.url,ok,fail,total:ok+fail})
test('90% with 10 samples qualifies; excludes small samples, rounding, disabled, failed and occupied',()=>{
  const items=['best','nine','small','rounded','disabled','failed','occupied'].map(proxy)
  items[4].status='blacklisted';items[5].lastTest.ok=false
  const stats=items.map(p=>stat(p,9,1));stats[0]=stat(items[0],19,1);stats[2]=stat(items[2],1,0);stats[3]=stat(items[3],17,2)
  assert.deepEqual(rankedReliableProxies(items,stats,options,new Set([items[6].url])).map(p=>p.id),['best','nine'])
})

test('bulk fill reserves uniquely, checks Bing after assignment, skips busy and restores failed accounts',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brf-proxy-fill-'))
  const h={profiles:[{id:'a',name:'A',proxyId:'old-a',proxyFallbacks:['old-fallback']},{id:'b',name:'B',proxyId:'old-b'},{id:'busy',name:'Busy',proxyId:'owned'}],items:['high','next','owned','bad'].map(proxy),tests:[],updates:[]}
  globalThis.fillHarness=h
  const mocks={
    './profiles':`export const loadStore=()=>({profiles:structuredClone(globalThis.fillHarness.profiles)});export const updateProfile=(id,patch)=>{const h=globalThis.fillHarness;h.updates.push({id,patch});Object.assign(h.profiles.find(p=>p.id===id),patch)};`,
    './browsers':`export const browserState=async()=>({running:false});`,
    './runner':`export const runState=id=>({running:id==='busy',queued:false});`,
    './lock':`export const withProfileLock=async(id,fn)=>fn();`,
    './proxies':`export const listProxies=()=>globalThis.fillHarness.items;export const clearActiveChain=()=>{};export const testAndSave=async(id)=>{const h=globalThis.fillHarness;h.tests.push(id);if(!h.profiles.some(p=>p.proxyId===id))throw Error('must assign before check');return {ok:id!=='next'}};`,
    './proxy-history':`export const proxyStats=items=>items.map((p,i)=>({id:p.id,url:p.url,total:10,ok:10-i%2,fail:i%2}));`
  }
  const out=await build({entryPoints:['src/main/proxy-auto-fill.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolate',setup(b){
    b.onResolve({filter:/^\.\/(profiles|browsers|runner|lock|proxies|proxy-history)$/},args=>({path:args.path,namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path]}))
  }}]})
  try{
    const svc=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)
    svc.startProxyFill(options);assert.throws(()=>svc.startProxyFill(options),/Đang có/)
    for(let i=0;i<100&&svc.proxyFillState().running;i++)await new Promise(r=>setTimeout(r,5))
    const result=svc.proxyFillState()
    assert.equal(result.running,false);assert.equal(result.done,3)
    assert.deepEqual(result.rows.map(r=>r.status),['ok','failed','skipped'])
    assert.equal(h.profiles[0].proxyId,'high');assert.deepEqual(h.profiles[0].proxyFallbacks,[])
    assert.equal(h.profiles[1].proxyId,'old-b');assert.equal(h.profiles[2].proxyId,'owned')
    assert.deepEqual(h.tests,['high','next'])
    const before=h.updates.length
    svc.startProxyFill({...options,count:20})
    for(let i=0;i<100&&svc.proxyFillState().running;i++)await new Promise(r=>setTimeout(r,5))
    assert.equal(h.updates.length,before,'shortage leaves all original assignments intact')
  }finally{
    delete globalThis.fillHarness
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^brf-proxy-fill-/)
    fs.rmSync(dir,{recursive:true,force:true})
  }
})
