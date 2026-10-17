// Isolated renderer fixture: no Electron storage, accounts, or Rewards requests.
import { build } from 'esbuild'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const output = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {LogDock} from './src/renderer/src/components/LogDock';
const lines=[{at:'2026-10-17 11:06:34',level:'info',profileId:'demo',msg:'[policy] {"status":"waiting","reason":"earn: chưa xác nhận hoàn thành (visited-pending) · đến 11:28:56","kinds":[],"target":80,"remaining":26}'}];
createRoot(document.getElementById('root')).render(<div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'end'}}><LogDock lines={lines} running={false} profileId="demo" profileName="Đạt Phạm" profileNames={{demo:'Đạt Phạm'}} defaultOpen={true} onNavigate={destination=>{document.title=destination}}/></div>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
  alias: { '@renderer': path.resolve('src/renderer/src'), '@shared': path.resolve('src/shared') } })
const css = fs.readdirSync('out/renderer/assets').find(f => f.endsWith('.css'))
const server = http.createServer((req,res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript; charset=utf-8'); res.end(output.outputFiles[0].text); return }
  if (req.url === '/style.css') { res.setHeader('Content-Type','text/css'); res.end(fs.readFileSync(path.join('out/renderer/assets',css))); return }
  res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<html><head><meta charset="UTF-8"><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="height:100vh;display:flex;padding:10px"></div><script src="/bundle.js"></script></body></html>')
})
server.listen(9387, '127.0.0.1', () => console.log('Isolated run guidance UI: http://127.0.0.1:9387'))
