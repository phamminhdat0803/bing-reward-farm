// Isolated renderer fixture: no Electron storage, accounts, or Rewards requests.
import { build } from 'esbuild'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const output = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ProxyPanel} from './src/renderer/src/components/ProxyPanel';
let items = Array.from({length:1000},(_,i)=>({id:'proxy-'+i,label:'Proxy '+String(i).padStart(4,'0'),url:'socks5://example'+i+'.test:1080',note:i%3===0?'Example note':'',createdAt:'',lastTest:{ok:i%2===0,latency:123,ip:'192.0.2.1',at:new Date().toISOString()}}));
window.api = {proxyAutoFillState:async()=>({running:false,done:0,total:0,rows:[]}),listProxies:async()=>items,proxyStats:async()=>[],onTestProgress:()=>()=>{}};
createRoot(document.getElementById('root')).render(<ProxyPanel rows={[]} onChanged={()=>{}}/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
  alias: { '@renderer': path.resolve('src/renderer/src'), '@shared': path.resolve('src/shared') } })
const css = fs.readdirSync('out/renderer/assets').find(f => f.endsWith('.css'))
const server = http.createServer((req,res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); res.end(output.outputFiles[0].text); return }
  if (req.url === '/style.css') { res.setHeader('Content-Type','text/css'); res.end(fs.readFileSync(path.join('out/renderer/assets',css))); return }
  res.setHeader('Content-Type','text/html'); res.end('<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="height:100vh;display:flex;padding:10px"></div><script src="/bundle.js"></script></body></html>')
})
server.listen(9385, '127.0.0.1', () => console.log('Isolated proxy virtual scroll UI: http://127.0.0.1:9385'))
