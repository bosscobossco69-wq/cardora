import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const assets={'trixovel-logo':'d45a2841d628156361aa93bcf460ec0e135ec997478fb8b0d442ddbc6ecac194','pokemon-art':'513c9dc0b0bd9c001b476aa2dd4933add973e6e73daa40be503810e54b4ba925','one-piece-art':'945cb7d2b6ae743bc64b6158ce4d72e19e9683f8656661fc378996e4b84e9064','yugioh-art':'198ffa57a7a3f015187edaf8929d779e1313a14a2a8b5b0a342b47a90bc65bc5'};
Object.assign(assets,{"final-hero-mobile":"8a196157728b05204d22c15f1cd9342e7cfc0a9fea1de4f7e346ae4a6d976ecf","final-hero-desktop":"e322840ed0534c77d709ada279ef77f21b1830a3a6a4a7cc8a3c618e84c55a85","final-hero-tablet":"58d81d692ac4fbb55e6cd8f9878cf0c0146f25285224efe6b46d7a0aea2beb03","final-category-pokemon":"e76d2c205e3286b6fb1fccbed025960e86534d38149edb6135fb678e55b629f5","final-category-one-piece":"fc3f4a6d4fce6c032308439be9221edc1927cff3ea2033ec73e6e724b4b9b924","final-category-yugioh":"76c3fc9f7d6a6879077f791af964a9a1c2e1c790fe54e3321679f91127a30f55"});
for(const [name,expected] of Object.entries(assets)){
 const svg=fs.readFileSync('assets/brand/'+name+'.svg','utf8'),m=svg.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)"/);
 assert.ok(m,name);assert.equal(createHash('sha256').update(Buffer.from(m[1],'base64')).digest('hex'),expected,name);assert.doesNotMatch(svg,/<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/i);
}
console.log('PASS: all ten local image assets match source byte hashes');
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
  return {overflow:document.documentElement.scrollWidth>innerWidth+1,brand:!!brand&&box.width>0&&box.right<=innerWidth+1&&box.left>=-1,mark:mark?.textContent,font:mark&&getComputedStyle(mark).fontFamily,logo:visiblePixels(logo),pictures:[...document.querySelectorAll('.world-art img')].map(visiblePixels),hero:visiblePixels(document.querySelector('.hero-brand-image')),lang:document.documentElement.lang,heroSource:document.querySelector('.hero-brand-image')?.currentSrc,categoryGrid:document.querySelector('.world-grid')?getComputedStyle(document.querySelector('.world-grid')).gridTemplateColumns:'',appLinks:[...document.querySelectorAll('.partner-banner')].map(a=>a.getAttribute('href'))};
 }
 async function check(file,width,lang){
  const r=await evaluate('('+inspect.toString()+')()');
  assert.equal(r.overflow,false,file+' '+width+' '+lang+' horizontal overflow');assert.ok(r.brand&&r.mark==='TRIXOVEL'&&r.font.includes('Georgia')&&r.logo>100,file+' '+width+' logo/font '+JSON.stringify(r));
  if(file==='index.html'){assert.ok(r.hero>100&&r.pictures.length===3&&r.pictures.every(p=>p>500),'all category artwork visible '+width);assert.ok(r.heroSource.endsWith('/final-hero-'+(width>=1024?'desktop':width>=600?'tablet':'mobile')+'.svg'),'correct reference art '+width);assert.equal(r.categoryGrid.split(' ').length,3,'three-column categories');assert.deepEqual(r.appLinks,['/global-launch.html?kind=seller#application','/global-launch.html?kind=partner#application']);if(lang)assert.equal(r.lang,lang==='zh'?'zh-Hans':lang)}
  console.log('PASS: '+file+' '+width+'px '+(lang||'')+' logo/font/images/layout');
 }
 for(const width of [320,390,768,1440]){
  await load('index.html',width);
  for(const lang of ['en','zh','ms','th']){await evaluate('document.getElementById('+JSON.stringify(lang)+').click();true');await check('index.html',width,lang)}
 }
 for(const file of ['join.html','collection-preview.html','global-launch.html','application-review.html','growth-admin.html','packs-live-preview.html','reset-password.html']){
  for(const width of [390,1440]){await load(file,width);await check(file,width)}
 }

 // Expose the signed-out panels solely for layout tests; auth SDK/network remain blocked.
 function inspectAuth(register){
  const $=id=>document.getElementById(id);
  $('sessionCheck').hidden=true;$('registration').hidden=false;$('loginPanel').hidden=register;$('registerPanel').hidden=!register;$('consentRow').hidden=!register;
  const panel=$('registration'),form=$(register?'register':'login'),submit=form.querySelector('button[type=submit]'),close=panel.querySelector('.auth-close'),bounds=panel.getBoundingClientRect();
  const fields=[...form.querySelectorAll('input[type=email],input[type=password]')];
  const boxes=fields.map(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>=50&&r.left>=bounds.left&&r.right<=bounds.right});
  return {overflow:document.documentElement.scrollWidth>innerWidth+1,panel:bounds.left>=0&&bounds.right<=innerWidth+1,fields:boxes,button:submit.getBoundingClientRect().height>=50,close:close.getAttribute('href')==='/',consent:!register||($('consentRow').getBoundingClientRect().bottom<=submit.getBoundingClientRect().top),google:document.querySelector('.google-wrap').hidden&&$('googleLogin').disabled};
 }
 for(const width of [320,390,768,1440]){
  await load('join.html',width);
  for(const register of [false,true]){
   const r=await evaluate('('+inspectAuth.toString()+')('+register+')');
   assert.ok(!r.overflow&&r.panel&&r.fields.length===(register?3:2)&&r.fields.every(Boolean)&&r.button&&r.close&&r.consent&&r.google,'auth panel '+width+' '+register+' '+JSON.stringify(r));
   console.log('PASS: visible '+(register?'registration':'login')+' form '+width+'px layout and accessible controls');
  }
 }

}finally{ws?.close();browser.kill();await new Promise(r=>server.close(r));try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
console.log('ALL RESPONSIVE BRAND BROWSER CHECKS PASSED');
