// Isolated renderer fixture: no Electron storage, accounts, or Rewards requests.
import { build } from 'esbuild'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const output = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import App from './src/renderer/src/App';
let settings={autoRefreshOnNewDay:false,refreshGapMs:800,refreshParallel:3,maxParallelRuns:0,autoEveryMs:900000,autoParallelRuns:1,runHeadless:false,noDirectFallback:true};
let fillState={running:false,done:0,total:0,rows:[]};
const api={proxyAutoFillState:async()=>fillState,proxyAutoFill:async()=>{fillState={running:false,done:3,total:3,rows:[{profileId:'a',name:'Demo A',status:'ok',message:'Đã gán 1 proxy và xác nhận truy cập Bing thành công.',proxies:['Reliable proxy']},{profileId:'b',name:'Demo B',status:'skipped',message:'Browser đang mở; giữ nguyên proxy.',proxies:[]},{profileId:'c',name:'Demo C',status:'failed',message:'Không đủ proxy đạt tiêu chí; giữ nguyên cấu hình.',proxies:[]}]};return fillState},listState:async()=>[],getSettings:async()=>settings,setSettings:async patch=>{settings={...settings,...patch};return settings},detectBrowsers:async()=>[],listProxies:async()=>[],proxyHealth:async()=>({}),runQueue:async()=>({items:[],waiting:[],max:0}),detectPhoneApps:async()=>({devices:[]}),autoStatus:async()=>({cycles:0,running:false,lastCycleAt:null,lastCycleResult:null,nextAt:null,remediations:0,everyMs:900000,enabled:true}),autoEscalations:async()=>[]};
window.api=new Proxy(api,{get:(target,key)=>target[key]??(String(key).startsWith('on')?()=>()=>{}:async()=>[])});
createRoot(document.getElementById('root')).render(<App/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
  alias: { '@renderer': path.resolve('src/renderer/src'), '@shared': path.resolve('src/shared') } })
const css = fs.readdirSync('out/renderer/assets').find(f => f.endsWith('.css'))
const server = http.createServer((req,res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); res.end(output.outputFiles[0].text); return }
  if (req.url === '/style.css') { res.setHeader('Content-Type','text/css'); res.end(fs.readFileSync(path.join('out/renderer/assets',css))); return }
  res.setHeader('Content-Type','text/html'); res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="height:100vh;display:flex;padding:10px"></div><script src="/bundle.js"></script></body></html>')
})
server.listen(9386, '127.0.0.1', () => console.log('Isolated auto scheduling settings UI: http://127.0.0.1:9386'))
