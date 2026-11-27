import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const assets={'trixovel-logo':'d45a2841d628156361aa93bcf460ec0e135ec997478fb8b0d442ddbc6ecac194','pokemon-art':'513c9dc0b0bd9c001b476aa2dd4933add973e6e73daa40be503810e54b4ba925','one-piece-art':'945cb7d2b6ae743bc64b6158ce4d72e19e9683f8656661fc378996e4b84e9064','yugioh-art':'198ffa57a7a3f015187edaf8929d779e1313a14a2a8b5b0a342b47a90bc65bc5'};
for(const [name,expected] of Object.entries(assets)){
 const svg=fs.readFileSync('assets/brand/'+name+'.svg','utf8'),m=svg.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
 assert.ok(m,name);assert.equal(createHash('sha256').update(Buffer.from(m[1],'base64')).digest('hex'),expected,name);assert.doesNotMatch(svg,/<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/i);
}
console.log('PASS: four local image assets match source byte hashes');
const root=process.cwd(),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{const u=new URL(req.url,'http://localhost');let p=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!p.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');res.end(fs.readFileSync(p))}catch{res.statusCode=404;res.end('Not found')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));assert.ok(chrome,'Chromium required');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'trx-browser-'));
const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{await delay(100)}}assert.ok(port,'debug port');
 const target=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');assert.ok(target);
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);const f=pending.get(m.id);if(f){pending.delete(m.id);m.error?f.reject(Error(JSON.stringify(m.error))):f.resolve(m.result)}});
 function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('timeout '+method))},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})}
 async function evaluate(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 await cmd('Page.enable');await cmd('Network.enable');await cmd('Network.setBlockedURLs',{urls:['https://*','http://*.supabase.co/*']});
 async function load(file,width){
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await cmd('Page.navigate',{url:origin+'/'+file});
  let ready=false;for(let i=0;i<100;i++){try{ready=await evaluate('location.href.startsWith('+JSON.stringify(origin+'/'+file)+') && document.readyState==="complete"');if(ready)break}catch{}await delay(100)}assert.ok(ready,file+' ready');
  await evaluate('document.fonts.ready.then(()=>true)');await evaluate('Promise.all([...document.images].map(i=>i.decode().catch(()=>null))).then(()=>true)');
 }
 function inspect(){
  const brand=document.querySelector('.trx-brand'),logo=brand?.querySelector('img'),mark=brand?.querySelector('.trx-wordmark'),box=brand?.getBoundingClientRect();
  function visiblePixels(i){if(!i||!i.complete||!i.naturalWidth)return 0;const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.drawImage(i,0,0,32,32);return [...x.getImageData(0,0,32,32).data].filter((v,k)=>k%4===3&&v>100).length}
  return {overflow:document.documentElement.scrollWidth>innerWidth+1,brand:!!brand&&box.width>0&&box.right<=innerWidth+1&&box.left>=-1,mark:mark?.textContent,font:mark&&getComputedStyle(mark).fontFamily,logo:visiblePixels(logo),pictures:[...document.querySelectorAll('.world-art img')].map(visiblePixels),hero:visiblePixels(document.querySelector('.hero-brand-image')),lang:document.documentElement.lang};
 }
 async function check(file,width,lang){
  const r=await evaluate('('+inspect.toString()+')()');
  assert.equal(r.overflow,false,file+' '+width+' '+lang+' horizontal overflow');assert.ok(r.brand&&r.mark==='TRIXOVEL'&&r.font.includes('Georgia')&&r.logo>100,file+' '+width+' logo/font '+JSON.stringify(r));
  if(file==='index.html'){assert.ok(r.hero>100&&r.pictures.length===3&&r.pictures.every(p=>p>500),'all category artwork visible '+width);if(lang)assert.equal(r.lang,lang==='zh'?'zh-Hans':lang)}
  console.log('PASS: '+file+' '+width+'px '+(lang||'')+' logo/font/images/layout');
 }
 for(const width of [320,390,768,1440]){
  await load('index.html',width);
  for(const lang of ['en','zh','ms','th']){await evaluate('document.getElementById('+JSON.stringify(lang)+').click();true');await check('index.html',width,lang)}
 }
 for(const file of ['join.html','collection-preview.html','global-launch.html','application-review.html','growth-admin.html','packs-live-preview.html','reset-password.html']){
  for(const width of [390,1440]){await load(file,width);await check(file,width)}
 }
}finally{ws?.close();browser.kill();await new Promise(r=>server.close(r));try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
console.log('ALL RESPONSIVE BRAND BROWSER CHECKS PASSED');
