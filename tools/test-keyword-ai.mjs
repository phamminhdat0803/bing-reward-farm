import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { build } from 'esbuild'
import { validateAiConfig, validateAiRequest } from '../src/shared/keyword-ai.ts'

const require = createRequire(import.meta.url)
const key = 'test-only-not-a-real-provider-key'
test('validate endpoint and input boundaries', () => {
  const cfg = {baseURL:'https://provider.test/v1/',model:'custom-model',apiMode:'chat'}
  assert.equal(validateAiConfig(cfg).baseURL, 'https://provider.test/v1')
  for (const baseURL of ['http://remote.test/v1','https://user:pass@remote.test/v1','https://remote.test/v1?key=x','https://remote.test/v1#x','https://remote.test/v1/chat/completions','file:///tmp']) assert.throws(()=>validateAiConfig({...cfg,baseURL}))
  assert.equal(validateAiConfig({...cfg,baseURL:'http://127.0.0.1:1234/v1'}).baseURL,'http://127.0.0.1:1234/v1')
  assert.throws(()=>validateAiRequest({count:10001,batchSize:100,language:'English',topics:''}))
})

test('real SDK against local mock: config encryption, both API modes, batches, cancel, errors, no auto-import', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'brf-ai-test-'))
  let behavior = 'normal', calls = [], serial = 0
  const server = http.createServer(async (req,res) => {
    let text = ''; for await (const chunk of req) text += chunk
    const body = JSON.parse(text)
    calls.push({path:req.url, body, auth:req.headers.authorization})
    if (behavior === 'hold') return
    res.setHeader('Content-Type','application/json')
    if (behavior === 'error') { res.writeHead(429); res.end(JSON.stringify({error:{message:`private provider data ${key}`}})); return }
    if (behavior === 'redirect') { res.writeHead(302,{Location:`http://127.0.0.1:${server.address().port}/stolen`}); res.end('{}'); return }
    const prompt = body.input ?? body.messages[0].content
    const amount = Number(prompt.match(/Generate (\d+)/)?.[1] ?? 1)
    const content = prompt.includes('exactly OK') ? 'OK' : Array.from({length:amount},()=>behavior==='repeat'?'how do trees grow':`how does scientific topic ${serial++} work`).join('\n')
    if(req.url.endsWith('/responses')) res.end(JSON.stringify({id:'response-test',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:content,annotations:[]}]}],usage:{total_tokens:30,input_tokens:10,output_tokens:20}}))
    else res.end(JSON.stringify({id:'chat-test',object:'chat.completion',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content}}],usage:{total_tokens:20}}))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`
  const output = await build({entryPoints:['src/main/keyword-ai.ts'],bundle:true,platform:'node',format:'cjs',write:false,external:['openai'],plugins:[{name:'electron',setup(b){
    b.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const app={getPath:()=>${JSON.stringify(dir)}};export const safeStorage={isEncryptionAvailable:()=>globalThis.__aiEncryption!==false,encryptString:s=>Buffer.from(s).map(x=>x^137),decryptString:b=>Buffer.from(b).map(x=>x^137).toString('utf8')};`}))
  }}]})
  const load = () => { const module={exports:{}}; new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports); return module.exports }
  const svc = load()
  const wait = async () => {
    for(let i=0;i<200;i++){const job=svc.getKeywordAiJob();if(job.status!=='running')return job;await new Promise(resolve=>setTimeout(resolve,15))}
    throw Error('Job timeout')
  }
  const config = {baseURL,model:'custom-model',apiMode:'chat',apiKey:key}
  const request = {count:25,batchSize:10,language:'Vietnamese',topics:'nature'}
  try {
    assert.equal(svc.getKeywordAiConfig().hasKey,false)
    globalThis.__aiEncryption=false
    assert.throws(()=>svc.saveKeywordAiConfig(config),/mã hoá/)
    globalThis.__aiEncryption=true
    const saved = svc.saveKeywordAiConfig(config)
    assert.equal(saved.hasKey,true)
    assert.ok(!JSON.stringify(saved).includes(key))
    assert.ok(!fs.readFileSync(path.join(dir,'keyword-ai.json'),'utf8').includes(key))
    assert.throws(()=>svc.saveKeywordAiConfig({...config,baseURL:baseURL+'/other',apiKey:undefined}),/nhập lại/)
    assert.deepEqual(await svc.testKeywordAi(),{ok:true})
    svc.startKeywordAi(request)
    assert.throws(()=>svc.startKeywordAi(request),/Đang có/)
    assert.throws(()=>svc.saveKeywordAiConfig(config),/Dừng/)
    let job=await wait()
    assert.equal(job.status,'completed');assert.equal(job.keywords.length,25);assert.equal(job.batches,3)
    assert.equal(job.tokens,60)
    assert.ok(calls.every(c=>c.path==='/v1/chat/completions'&&c.auth===`Bearer ${key}`))
    assert.match(calls[1].body.messages[0].content,/Vietnamese search queries/)
    assert.equal(fs.existsSync(path.join(dir,'keywords.json')),false,'AI must not import keywords automatically')
    assert.equal(load().getKeywordAiJob().keywords.length,25,'draft survives module reload')
    const beforeLarge = calls.length
    svc.startKeywordAi({...request,count:1501,batchSize:100})
    job=await wait()
    assert.equal(job.status,'completed');assert.equal(job.keywords.length,1501)
    assert.equal(calls.length-beforeLarge,16,'1501 queries are generated in bounded batches')
    svc.saveKeywordAiConfig({...config,apiMode:'responses',apiKey:undefined})
    svc.startKeywordAi({...request,count:12})
    job=await wait();assert.equal(job.status,'completed');assert.equal(job.keywords.length,12)
    assert.equal(calls.at(-1).path,'/v1/responses');assert.equal(calls.at(-1).body.store,false)
    behavior='error';const before=calls.length
    svc.startKeywordAi(request);job=await wait()
    assert.equal(job.status,'failed');assert.equal(calls.length,before+1,'no automatic billed retries')
    assert.match(job.error,/429/);assert.ok(!JSON.stringify(job).includes(key))
    behavior='repeat';svc.startKeywordAi(request);job=await wait()
    assert.equal(job.status,'failed');assert.equal(job.keywords.length,1);assert.equal(job.batches,4)
    behavior='hold';svc.startKeywordAi(request)
    await new Promise(resolve=>setTimeout(resolve,30));svc.stopKeywordAi();job=await wait();assert.equal(job.status,'stopped')
    behavior='redirect';const initial=calls.length
    svc.startKeywordAi(request);job=await wait();assert.equal(job.status,'failed');assert.equal(calls.length,initial+1)
    svc.saveKeywordAiConfig({...config,apiKey:undefined,clearKey:true});assert.equal(svc.getKeywordAiConfig().hasKey,false)
  } finally {
    svc.stopKeywordAi();delete globalThis.__aiEncryption
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.match(path.basename(dir),/^brf-ai-test-/)
    fs.rmSync(dir,{recursive:true,force:true})
  }
})
