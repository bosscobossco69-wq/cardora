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
assert.match(js,/const APPLICATIONS_OPEN=false/);
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
vm.runInContext(js,run);
assert.equal(document.documentElement.lang,'en');assert.equal(node('submit').disabled,true);
node('lang').value='th';node('lang').events.change();
assert.equal(document.documentElement.lang,'th');assert.equal(dataNodes[0].textContent,words.title[3]);assert.equal(storage.get('trixovel-language'),'th');
node('consent').checked=true;await node('applicationForm').events.submit({preventDefault(){}});
await node('reload').events.click();
assert.equal(authCalls,0);assert.equal(dbCalls,0);assert.equal(fetchCalls,0);
assert.equal(node('submit').disabled,true);assert.equal(node('appStatus').textContent,words.pending[3]);
assert.equal(node('registered').textContent,'—');
console.log('PASS: four languages, preview gate, no application writes, no fake stats, independent intake');
