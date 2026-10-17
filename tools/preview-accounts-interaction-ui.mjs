// Render the real App with in-memory accounts and a fake IPC boundary. No user data or Rewards requests.
import { build } from 'esbuild'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const output = await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import App from './src/renderer/src/App';
import {TooltipProvider} from './src/renderer/src/components/ui/tooltip';
const now=new Date().toISOString();
const names=['An Nguyễn','Bình Trần','Chi Lê','Dũng Phạm','Hà Đỗ'];
let rows=names.map((name,i)=>({id:'demo-'+i,profile:{id:'demo-'+i,name,account:'account'+i+'@example.test',profileDir:'C:/demo/account-'+i,channel:'chrome',headless:false,cdpPort:9400+i,desktopMax:90,mobileMax:60,createdAt:now,lastRunAt:null},cache:{profileId:'demo-'+i,date:now.slice(0,10),cachedAt:now,signedIn:i!==3,points:1200+i*100,todayPoints:i*3,level:'Level 2',desktop:{progress:i*3,max:90},mobile:{progress:0,max:60},dailySet:{progress:0,max:3},earn:{progress:0,max:45},offers:0,runs:{desktop:null,mobile:null,daily:null}},browser:{running:i===2,pid:null,cdpUrl:null},run:{running:i===4,kinds:i===4?['desktop']:[]},needsRefresh:false,hasData:true}));
let proxyJob=null,proxyJobSequence=0;
const calls=[];window.fixture={calls,proxyJobMode:'success',replaceRows(next){rows=next;listeners.onSnapshot?.()},rows:()=>rows};
const listeners={};
const read={listState:()=>rows,getSettings:()=>({autoRefreshOnNewDay:false,refreshGapMs:1000,noDirectFallback:true,autoEveryMs:0}),detectBrowsers:()=>[],listProxies:()=>[],proxyHealth:()=>({}),runQueue:()=>({items:[],waiting:[],max:0}),detectPhoneApps:()=>({devices:[],apps:[]}),autoStatus:()=>({enabled:false,running:false,cycles:0,everyMs:0,nextAt:null,remediations:0}),autoEscalations:()=>[],proxyAutoFillState:()=>({running:false,done:0,total:0,rows:[]})};
read.listHistory=()=>({at:now,days:[],profiles:[]});
read.accountProxyFillState=()=>structuredClone(proxyJob);
read.listProxies=()=>proxyJob?.assigned.map(item=>({id:item.proxyId,label:item.label,url:'http://'+item.proxyId+'.example.test:80',createdAt:now,lastTest:{ok:true,latency:item.latency,at:now}}))??[];
window.api=new Proxy({}, {get(_,name){if(name.startsWith('on'))return cb=>{listeners[name]=cb;return()=>delete listeners[name]};if(read[name])return async()=>read[name]();return async(...args)=>{
  calls.push({name,args});
  if(name==='accountProxyFill'){
    const {profileId,count}=args[0],job={id:'fixture-'+(++proxyJobSequence),profileId,name:rows.find(row=>row.id===profileId).profile.name,count,status:'checking',total:count+1,checked:0,attempts:[],assigned:[],message:'Đang kiểm tra truy cập Bing…'};proxyJob=job;
    if(window.fixture.proxyJobMode!=='slow')setTimeout(()=>{
      if(job.status!=='checking')return;
      job.attempts=[{proxyId:'failed',label:'Proxy không đạt',ok:false,checkedAt:now},...Array.from({length:count},(_,i)=>({proxyId:'checked-'+i,label:'Proxy demo '+(i+1),ok:true,latency:45+i*10,checkedAt:now}))];job.checked=count+1;
      if(window.fixture.proxyJobMode==='failed'){job.status='failed';job.message='Không đủ proxy đạt. Giữ nguyên cấu hình.';return}
      job.status='completed';job.assigned=job.attempts.filter(item=>item.ok);job.message='Đã gán '+count+' proxy và xác nhận truy cập Bing thành công.';
      rows=rows.map(row=>row.id===profileId?{...row,profile:{...row.profile,proxyId:'checked-0',proxyFallbacks:job.assigned.slice(1).map(item=>'http://'+item.proxyId+'.example.test:80')}}:row);
    },600);
    return structuredClone(job);
  }
  if(name==='accountProxyFillCancel'){if(proxyJob?.id===args[0]){const job=proxyJob;job.status='stopping';job.message='Đang dừng…';setTimeout(()=>{job.status='cancelled';job.message='Đã dừng kiểm tra. Giữ nguyên proxy tài khoản.'},100)}return structuredClone(proxyJob)}
  if(name==='removeProfile')rows=rows.filter(row=>row.id!==args[0]);if(name==='getProfile')return rows.find(row=>row.id===args[0])?.profile;return {ok:true}
}}});
createRoot(document.getElementById('root')).render(<React.StrictMode><TooltipProvider><App/></TooltipProvider></React.StrictMode>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', write: false,
alias: { '@renderer': path.resolve('src/renderer/src'), '@shared': path.resolve('src/shared') } })
const css = fs.readdirSync('out/renderer/assets').find(file => file.endsWith('.css'))
const server = http.createServer((req, res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(output.outputFiles[0].text);return}
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(fs.readFileSync(path.join('out/renderer/assets',css)));return}
  if(req.url.endsWith('.woff2') || req.url.endsWith('.woff')){res.setHeader('Content-Type',req.url.endsWith('.woff2')?'font/woff2':'font/woff');res.end(fs.readFileSync(path.join('out/renderer/assets',path.basename(req.url))));return}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>')
})
server.listen(9388,'127.0.0.1',()=>console.log('Isolated account interactions: http://127.0.0.1:9388'))
