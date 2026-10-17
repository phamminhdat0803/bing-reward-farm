import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { accountProxyCandidates, validateAccountProxyFill } from '../src/shared/account-proxy-fill.ts'

const proxy = (id, patch={}) => ({id,label:id,url:`http://${id}.example.test:8080`,createdAt:'2026-10-17',...patch})
const account = (id, patch={}) => ({id,name:id,proxyId:`old-${id}`,proxyFallbacks:[],...patch})
const stat = (item, ok=9, total=10) => ({id:item.id,url:item.url,ok,fail:total-ok,total})

test('candidate rotation excludes current chain, other accounts, disabled aliases and failures, then ranks history', () => {
  const items = ['old-a','old-fallback','owned','last-good','good','fresh','disabled','disabled-alias','failed','duplicate'].map(id=>proxy(id))
  items[6].status='blacklisted';items[7].url=items[6].url;items[8].lastTest={ok:false};items[9].url=items[4].url
  const profiles = [account('a',{proxyFallbacks:['old-fallback']}),account('b',{proxyId:'owned',lastGoodProxy:items[3].url})]
  const candidates = accountProxyCandidates(items,[stat(items[4])],profiles,'a')
  assert.deepEqual(candidates.map(item=>item.id),['good','fresh'])
  assert.deepEqual(accountProxyCandidates(items,[],profiles,'missing'),[])
  for (const count of [0,-1,1.5,21,NaN,'2']) assert.throws(()=>validateAccountProxyFill({profileId:'a',count}))
  assert.throws(()=>validateAccountProxyFill({profileId:' ',count:1}))
})

let serial = 0
async function service(harness) {
  const key = `accountFillHarness${++serial}`
  globalThis[key] = harness
  const h = `globalThis.${key}`
  const mocks = {
    './profiles':`export const loadStore=()=>({profiles:structuredClone(${h}.profiles)});export const updateProfile=(id,patch)=>{${h}.updates.push({id,patch});Object.assign(${h}.profiles.find(p=>p.id===id),patch)};`,
    './browsers':`export const browserState=async(p)=>({running:${h}.browser===p.id});`,
    './runner':`export const runState=id=>({running:${h}.run===id,queued:${h}.queued===id});`,
    './lock':`export const withProfileLock=async(id,fn)=>fn();`,
    './proxies':`export const listProxies=()=>structuredClone(${h}.items);export const clearActiveChain=id=>${h}.cleared.push(id);export const testAndSave=async(id)=>{${h}.tests.push(id);${h}.beforeChecks.push(structuredClone(${h}.profiles));return ${h}.check?await ${h}.check(id):{ok:true,latency:id==='fast'?20:100}};`,
    './proxy-history':`export const proxyStats=items=>items.map(p=>({id:p.id,url:p.url,total:10,ok:9,fail:1}));`
  }
  const built = await build({entryPoints:['src/main/proxy-auto-fill.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolate-account-fill',setup(b){
    b.onResolve({filter:/^\.\/(profiles|browsers|runner|lock|proxies|proxy-history)$/},args=>({path:args.path,namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path]}))
  }}]})
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
}
const harness = () => ({profiles:[account('a'),account('b')],items:['old-a','old-b','bad','slow','fast'].map(id=>proxy(id)),tests:[],updates:[],beforeChecks:[],cleared:[]})
async function finished(svc) {
  for(let i=0;i<150;i++) {
    const job=svc.accountProxyFillState()
    if(!['checking','stopping'].includes(job.status))return job
    await new Promise(resolve=>setTimeout(resolve,5))
  }
  throw new Error('Fixture job did not finish')
}

test('tests alternatives until N pass, saves only one selected account and reports fresh latency', async () => {
  const h=harness();h.check=async id=>({ok:id!=='bad',latency:id==='fast'?20:100})
  const svc=await service(h)
  const started=svc.startAccountProxyFill({profileId:'a',count:2})
  assert.throws(()=>svc.startProxyFill({count:1,minRate:90,minTests:10}),/Đang có/)
  assert.throws(()=>svc.startAccountProxyFill({profileId:'b',count:1}),/Đang có/)
  const job=await finished(svc)
  assert.equal(started.profileId,'a');assert.equal(job.status,'completed')
  assert.deepEqual(h.tests,['bad','slow','fast'])
  assert.ok(h.beforeChecks.every(profiles=>profiles[0].proxyId==='old-a'),'Do not persist provisional assignments')
  assert.equal(h.updates.length,1);assert.equal(h.updates[0].id,'a')
  assert.equal(h.profiles[0].proxyId,'fast');assert.deepEqual(h.profiles[0].proxyFallbacks,[h.items.find(item=>item.id==='slow').url])
  assert.equal(h.profiles[1].proxyId,'old-b');assert.deepEqual(job.assigned.map(item=>item.latency),[20,100])
  job.assigned[0].label='changed';assert.equal(svc.accountProxyFillState().assigned[0].label,'fast','Job snapshots are isolated')
  svc.startAccountProxyFill({profileId:'a',count:1})
  assert.equal((await finished(svc)).status,'completed')
  assert.deepEqual(h.profiles[0].proxyFallbacks,[],'Reducing to one proxy removes old backups')
})

test('shortage, connectivity failure and busy accounts preserve original assignments', async () => {
  for (const scenario of ['shortage','network','browser','run','queued']) {
    const h=harness()
    if(scenario==='shortage')h.items=h.items.slice(0,3)
    if(scenario==='network')h.check=async()=>({ok:false})
    if(['browser','run','queued'].includes(scenario))h[scenario]='a'
    const svc=await service(h)
    svc.startAccountProxyFill({profileId:'a',count:2})
    const job=await finished(svc)
    assert.equal(job.status,'failed',scenario);assert.equal(h.updates.length,0,scenario)
    assert.equal(h.profiles[0].proxyId,'old-a')
    if(scenario!=='network')assert.deepEqual(h.tests,[],scenario)
  }
})

test('cancellation waits for in-flight checks and never changes proxy settings', async () => {
  const h=harness();let release
  const gate=new Promise(resolve=>release=resolve)
  h.check=async()=>{await gate;return {ok:true,latency:15}}
  const svc=await service(h), job=svc.startAccountProxyFill({profileId:'a',count:2})
  while(!h.tests.length)await new Promise(resolve=>setTimeout(resolve,2))
  assert.equal(svc.cancelAccountProxyFill('wrong-job').status,'checking')
  assert.equal(svc.cancelAccountProxyFill(job.id).status,'stopping')
  release()
  assert.equal((await finished(svc)).status,'cancelled');assert.equal(h.updates.length,0)
})

test('edits, changed ownership, URL changes and disabling a verified proxy win over the assignment', async () => {
  for(const scenario of ['edit','owner','disabled','url','queued']) {
    const h=harness()
    h.check=async id=>{
      if(scenario==='edit')h.profiles[0].proxyId='manual-edit'
      if(scenario==='owner')h.profiles[1].proxyId=id
      if(scenario==='disabled')h.items.find(item=>item.id===id).status='unused'
      if(scenario==='url')h.items.find(item=>item.id===id).url='http://changed.example.test:80'
      if(scenario==='queued')h.queued='a'
      return {ok:true,latency:25}
    }
    const svc=await service(h);svc.startAccountProxyFill({profileId:'a',count:1})
    assert.equal((await finished(svc)).status,'failed',scenario);assert.equal(h.updates.length,0,scenario)
    assert.equal(h.profiles[0].proxyId,scenario==='edit'?'manual-edit':'old-a')
  }
})
