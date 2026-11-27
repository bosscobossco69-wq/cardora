import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('home-preview.html','utf8');
const root=fs.readFileSync('index.html','utf8');
assert.match(root,/href="\/join\.html"/);assert.match(root,/>TRIXOVEL</);
assert.match(root,/<meta name="robots" content="index,follow">/);
assert.match(root,/<link rel="canonical" href="https:\/\/trixovel\.com\/">/);
assert.doesNotMatch(root,/<meta[^>]*name="robots"[^>]*noindex/);
const sitemap=fs.readFileSync('sitemap.xml','utf8');
assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]),['https://trixovel.com/']);
assert.match(fs.readFileSync('robots.txt','utf8'),/Sitemap: https:\/\/trixovel\.com\/sitemap\.xml/);
for(const page of ['join.html','reset-password.html','collection-preview.html','packs-live-preview.html','home-preview.html'])assert.match(fs.readFileSync(page,'utf8'),/noindex,nofollow/);
for(const page of ['fees.html','listing-guide.html','sar-sir-ar-difference.html','how-to-spot-a-fake-pokemon-card.html','pokemon-card-numbers-explained.html']){
 const content=fs.readFileSync(page,'utf8');assert.match(content,/<meta name="robots" content="noindex,follow">/);
 assert.ok(content.includes('<link rel="canonical" href="https://trixovel.com/'+page+'">'));
 assert.doesNotMatch(content,/cardora-rose\.vercel\.app/);
}

assert.doesNotMatch(root,/crqqockaetgacddxkqpb/);
const statsScript=page=>page.match(/<script>([\s\S]*?)<\/script>/)[1].split('// Read only the public singleton aggregate. No session token, no user table.')[1];
assert.ok(statsScript(root));const securityPart=x=>x.slice(0,x.indexOf('function renderStats()'))+x.slice(x.indexOf('async function refreshStats()'),x.indexOf('for(const id of',x.indexOf('async function refreshStats()')));assert.equal(securityPart(statsScript(root)),securityPart(statsScript(html)));
for(const target of ['/collection-preview.html#search','/collection-preview.html#cert-heading','/collection-preview.html#saved','/join.html','/packs-live-preview.html'])assert.ok(root.includes('href="'+target+'"'));
assert.match(root,/Browse without an account/);assert.match(root,/游客免费浏览/);assert.match(root,/no purchase or stream is available/);
const sql=fs.readFileSync('supabase/drafts/CARDORA_DRAFT_community_snapshot.sql','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.match(html,/href="https:\/\/cardora-rose\.vercel\.app\/join\.html"/);
assert.match(html,/noindex,nofollow/);
assert.match(sql,/enable row level security/);
assert.match(sql,/security invoker/);
assert.match(sql,/grant select on public\.cardora_community_snapshot to anon, authenticated/);
assert.match(sql,/revoke all on function cardora_metrics_private\.refresh_community_snapshot\(\) from public, anon, authenticated/);
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',setAttribute(){},addEventListener(){}});return elements.get(id)};
const document={hidden:true,documentElement:{},querySelectorAll:()=>[],getElementById:get,addEventListener(){}};
let interval;
const context=vm.createContext({document,Intl,Date,AbortController,setTimeout,clearTimeout,setInterval:(fn,ms)=>{interval=ms},fetch:()=>{throw Error('network forbidden in offline test')}});
vm.runInContext(script,context);
assert.equal(interval,60000);
const now=Date.parse('2026-11-25T16:00:02Z');
const row={registered_members:3,verified_members:2,new_today:1,day_myt:'2026-11-26',measured_at:'2026-11-25T16:00:00Z'};
context.row=row;context.now=now;
const valid=()=>vm.runInContext('validSnapshot(row,now)',context);
assert.equal(valid(),true);
for(const patch of [{registered_members:-1},{verified_members:4},{new_today:4},{registered_members:'3'},{day_myt:'2026-11-25'},{measured_at:'2026-11-25T15:50:00Z'},{measured_at:'2026-11-25T16:01:00Z'}]){
context.row={...row,...patch};assert.equal(valid(),false,JSON.stringify(patch));}
vm.runInContext('renderStats()',context);
for(const id of ['members','verified','today'])assert.equal(get(id).textContent,'—');
vm.runInContext(root.match(/<script>([\s\S]*?)<\/script>/)[1],vm.createContext({document,Intl,Date,AbortController,setTimeout,clearTimeout,setInterval:(fn,ms)=>{assert.equal(ms,60000)},fetch:()=>{throw Error('network forbidden in offline test')}}));
console.log('Offline community homepage checks passed');

assert.match(root,/id="ms"/);assert.match(root,/Ahli berdaftar/);assert.match(root,/trixovel-language/);

const thai=JSON.parse(root.match(/const th=(\{[^\n]*?\});/)[1]);
const malay=JSON.parse(root.match(/const ms=(\{[^\n]*?\});/)[1]);
assert.deepEqual(Object.keys(thai).sort(),Object.keys(malay).sort());
for(const v of Object.values(thai))assert.match(v,/[\u0e00-\u0e7f]/);
assert.match(root,/id="th" type="button" aria-pressed="false">ไทย/);
const langNodes=new Map();const saved=new Map();const el=id=>{if(!langNodes.has(id))langNodes.set(id,{textContent:'',attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){(this.handlers[k]??=[]).push(fn)}});return langNodes.get(id);};
const dataNodes=[...root.matchAll(/data-t="([^"]+)"[^>]*>([^<]*)</g)].map(m=>({dataset:{t:m[1]},textContent:m[2]}));
const langDoc={hidden:true,documentElement:{},getElementById:el,querySelectorAll:()=>dataNodes,addEventListener(){}};
const langCtx=vm.createContext({document:langDoc,Intl,Date,AbortController,setTimeout,clearTimeout,setInterval(){},fetch:()=>{throw Error('offline')},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});
vm.runInContext(root.match(/<script>([\s\S]*?)<\/script>/)[1],langCtx);
assert.equal(langDoc.documentElement.lang,'en');
for(const cb of el('th').handlers.click)cb();
assert.equal(langDoc.documentElement.lang,'th');assert.equal(saved.get('trixovel-language'),'th');
assert.equal(dataNodes.find(n=>n.dataset.t==='headline').textContent,thai.headline);
for(const cb of el('en').handlers.click)cb();
assert.equal(langDoc.documentElement.lang,'en');assert.equal(saved.get('trixovel-language'),'en');
console.log('PASS: Thai homepage labels, English default, language switch and persistence');
