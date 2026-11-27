import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync('launch-applications.js','utf8'), locales=fs.readFileSync('launch-locales.js','utf8'),sql=fs.readFileSync('docs/security/global-launch-intake-review.sql','utf8');
const ctx={window:{}};vm.runInNewContext(locales,ctx);
const words=ctx.window.TRXLaunchWords;
for(const path of ['global-launch.html','application-review.html']){
 const html=fs.readFileSync(path,'utf8');
 assert.match(html,/content="noindex,nofollow"/);
 assert.match(html,/value="th">ภาษาไทย/);
 assert.match(html,/launch-locales\.js/);
 for(const m of html.matchAll(/data-t="([^"]+)"/g)){assert.equal(words[m[1]]?.length,4,m[1]);assert.ok(words[m[1]].every(v=>typeof v==='string'&&v.trim()),m[1]);}
}
assert.match(js,/const APPLICATIONS_OPEN=(?:true|false)/);
assert.match(js,/cardora_launch_applications/);
assert.doesNotMatch(js,/\.from\(['"](?:seller_applications|seller_profiles|agent_profiles|seller_subscriptions|wallet_transactions)['"]\)|\.rpc\(|innerHTML|service_role|sb_secret_/);
assert.match(sql,/unique\(owner_id,kind\)/);
assert.match(sql,/grant update \(status\)/);
assert.match(sql,/owner_id<>\(select auth\.uid\(\)\)/);
assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/(?:insert into|update|alter table|grant[^;\n]+on)\s+public\.(?:users|seller_applications|seller_profiles|agent_profiles|seller_subscriptions|wallet_transactions)\b/i);
const nodes=new Map(),storage=new Map(),dataNodes=[{dataset:{t:'title'},textContent:''}];
function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,checked:false,events:{},children:[],addEventListener(k,fn){this.events[k]=fn;},replaceChildren(){this.children=[]},append(v){this.children.push(v)}});return nodes.get(id);}
let authCalls=0,dbCalls=0,fetchCalls=0;
const win={TRXLaunchWords:words,supabase:{createClient:()=>({auth:{getUser(){authCalls++;throw Error('closed gate');},onAuthStateChange(){authCalls++;}},from(){dbCalls++;throw Error('closed gate');}})}};
const document={body:{dataset:{mode:'public'}},documentElement:{},hidden:true,getElementById:node,querySelectorAll:()=>dataNodes,addEventListener(){}};
const run=vm.createContext({window:win,document,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Intl,Date,AbortController,setTimeout,clearTimeout,setInterval(){},fetch(){fetchCalls++;throw Error('unexpected network')}});
vm.runInContext(js.replace('const APPLICATIONS_OPEN=true','const APPLICATIONS_OPEN=false'),run);
assert.equal(document.documentElement.lang,'en');assert.equal(node('submit').disabled,true);
node('lang').value='th';node('lang').events.change();
assert.equal(document.documentElement.lang,'th');assert.equal(dataNodes[0].textContent,words.title[3]);assert.equal(storage.get('trixovel-language'),'th');
node('consent').checked=true;await node('applicationForm').events.submit({preventDefault(){}});
await node('reload').events.click();
assert.equal(authCalls,0);assert.equal(dbCalls,0);assert.equal(fetchCalls,0);
assert.equal(node('submit').disabled,true);assert.equal(node('appStatus').textContent,words.pending[3]);
assert.equal(node('registered').textContent,'—');
console.log('PASS: four languages, preview gate, no application writes, no fake stats, independent intake');

// Exercise the real enabled application UI against disposable in-memory fixtures.
// No production account, network, email, or persistent data is used.
function activeFixture(mode,user,role,seed=[]){
 const records=seed.map(x=>({...x})), nodes=new Map(), mutations=[], calls=[];
 let authListener, current=user, currentRole=role, confirmDecision=true;
 function element(){return {value:'',checked:false,disabled:false,textContent:'',children:[],events:{},addEventListener(k,fn){this.events[k]=fn;},append(v){this.children.push(v);},replaceChildren(){this.children=[]},reportValidity(){return true}}}
 const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const document={body:{dataset:{mode}},documentElement:{},hidden:true,getElementById:node,createElement:element,querySelectorAll:()=>[],addEventListener(){}};
 function from(table){
  calls.push(table);assert.ok(['users','cardora_launch_applications'].includes(table));
  let operation='read',payload=null,filters=[];
  const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},insert(p){operation='insert';payload=p;return q},update(p){operation='update';payload=p;return q},async maybeSingle(){return {data:{role:currentRole,status:'active'},error:null}},async single(){if(operation==='insert'){const r={...payload,id:'fixture-'+records.length,status:'pending'};records.push(r);mutations.push(['insert',r]);return {data:r,error:null}}if(operation==='update'){const r=records.find(r=>filters.every(f=>f(r)));if(!r)return {data:null,error:{code:'not_found'}};Object.assign(r,payload);mutations.push(['update',r]);return {data:{...r},error:null}}throw Error('unexpected single')},then(resolve,reject){return Promise.resolve({data:records.filter(r=>filters.every(f=>f(r))).map(r=>({...r})),error:null}).then(resolve,reject)}};
  return q;
 }
 const win={TRXLaunchWords:words,confirm:()=>confirmDecision,supabase:{createClient:()=>({auth:{async getUser(){return {data:{user:current},error:null}},onAuthStateChange(fn){authListener=fn}},from})}};
 const store=new Map();const context=vm.createContext({window:win,document,location:{search:'?kind=partner'},URLSearchParams,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},Intl,Date,AbortController,setTimeout,clearTimeout,setInterval(){},fetch(){throw Error('offline fixture')}});
 vm.runInContext(js.replace('const APPLICATIONS_OPEN=false','const APPLICATIONS_OPEN=true'),context);
 return {node,records,mutations,calls,async reload(){await node('reload').events.click()},async submit(){await node('applicationForm').events.submit({preventDefault(){}})},signOut(){current=null;authListener('SIGNED_OUT')},denyConfirm(){confirmDecision=false}};
}
const ordinary={id:'fixture-a',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false};
const adminUser={id:'fixture-admin',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false};
const member=activeFixture('public',ordinary,'user');
await member.reload();
assert.equal(member.node('submit').disabled,false);assert.equal(member.node('kind').value,'partner');
function fill(kind){Object.assign(member.node('kind'),{value:kind});for(const [id,value] of Object.entries({appName:'Synthetic shop',region:'Test',contact:'fixture@example.invalid',categories:'Pokemon',details:'Synthetic'}))member.node(id).value=value}
fill('seller');await member.submit();assert.equal(member.mutations.length,0,'consent required');
member.node('consent').checked=true;await member.submit();assert.equal(member.records.length,1);assert.equal(member.records[0].consent_version,'application-v1');assert.equal(member.node('appStatus').textContent,words.saved[0]);
fill('seller');member.node('consent').checked=true;await member.submit();assert.equal(member.records.length,1,'duplicate blocked');
fill('partner');member.node('consent').checked=true;await member.submit();assert.equal(member.records.length,2);
const denied=activeFixture('admin',ordinary,'user',member.records);await denied.reload();assert.equal(denied.node('records').children.length,0);assert.equal(denied.node('appStatus').textContent,words.noAccess[0]);assert.equal(denied.calls.includes('cardora_launch_applications'),false);
const reviewer=activeFixture('admin',adminUser,'admin',member.records);await reviewer.reload();assert.equal(reviewer.node('records').children.length,2);
const buttons=reviewer.node('records').children[0].children.at(-1).children;
await buttons[1].events.click();assert.equal(reviewer.records[0].status,'accepted');assert.equal(reviewer.mutations.length,1);assert.equal(reviewer.node('records').children.length,1);
member.signOut();assert.equal(member.node('records').children.length,0);assert.equal(member.node('submit').disabled,true);
console.log('PASS: enabled member submits seller and partner with consent, duplicate blocked, nonadmin denied, admin review, logout clears records (offline fixtures)');
