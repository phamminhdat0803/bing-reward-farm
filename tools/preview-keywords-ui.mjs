// Isolated renderer fixture: no Electron storage, accounts, or Rewards requests.
import { build } from 'esbuild'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const output = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {KeywordsPanel} from './src/renderer/src/components/KeywordsPanel';
let data = {version:1, keywords:Array.from({length:1500},(_,i)=>'How does scientific topic '+i+' work'),updatedAt:new Date().toISOString()};
data.usage=[{keyword:data.keywords[0],profileId:'demo-a',profileName:'Demo Account A',kind:'desktop',status:'used',at:new Date().toISOString()},{keyword:data.keywords[1],profileId:'demo-b',profileName:'Demo Account B',kind:'mobile',status:'reserved',at:new Date().toISOString()}];
let aiConfig={baseURL:'https://provider.example/v1',model:'',apiMode:'chat',hasKey:false,encryptionAvailable:true};
let aiJob={id:'',status:'idle',requested:0,keywords:[],batches:0,tokens:0,error:null,startedAt:null,updatedAt:null};
window.api = {
 getKeywordAiConfig:async()=>aiConfig,
 saveKeywordAiConfig:async(input)=>{aiConfig={baseURL:input.baseURL,model:input.model,apiMode:input.apiMode,hasKey:input.clearKey?false:!!input.apiKey||aiConfig.hasKey,encryptionAvailable:true};return aiConfig},
 testKeywordAi:async()=>({ok:true}),getKeywordAiJob:async()=>aiJob,
 startKeywordAi:async(input)=>{aiJob={...aiJob,id:'fixture-job',status:'running',requested:input.count,keywords:[],batches:0};setTimeout(()=>{aiJob={...aiJob,status:'completed',keywords:Array.from({length:input.count},(_,i)=>'How do ocean ecosystems work '+i),batches:Math.ceil(input.count/input.batchSize),tokens:1234}},250);return aiJob},
 stopKeywordAi:async()=>{aiJob={...aiJob,status:'stopped'};return aiJob},
 getKeywords:async()=>data,saveKeywords:async(text,mode)=>{const incoming=text.split('\\n').filter(Boolean);data={...data,keywords:mode==='replace'?incoming:[...new Set([...data.keywords,...incoming])]};return data},exportSave:async()=>({ok:true})};
createRoot(document.getElementById('root')).render(<KeywordsPanel/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
  alias: { '@renderer': path.resolve('src/renderer/src'), '@shared': path.resolve('src/shared') } })
const css = fs.readdirSync('out/renderer/assets').find(f => f.endsWith('.css'))
const server = http.createServer((req,res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); res.end(output.outputFiles[0].text); return }
  if (req.url === '/style.css') { res.setHeader('Content-Type','text/css'); res.end(fs.readFileSync(path.join('out/renderer/assets',css))); return }
  res.setHeader('Content-Type','text/html'); res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="height:100vh;display:flex;padding:10px"></div><script src="/bundle.js"></script></body></html>')
})
server.listen(9384, '127.0.0.1', () => console.log('Isolated keywords UI: http://127.0.0.1:9384'))
