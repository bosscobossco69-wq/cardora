import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../join-preview.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({user={id:'synthetic-a',email:'a@example.invalid'},profile={id:'profile-a',status:'active',member_id:'TRX-SYNTHETIC'},error=null}={}){
 const elements=new Map(),timers=[];let authEvent,lookupGate=null,role='collector';
 const node=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',textContent:'',checked:false,handlers:{},setAttribute(){},focus(){},addEventListener(k,v){this.handlers[k]=v;}});return elements.get(id);};
 const calls=[];
 const auth={getUser:async()=>({data:{user},error:null}),onAuthStateChange(fn){authEvent=fn;},signOut:async()=>{user=null;authEvent('SIGNED_OUT');return {error:null};}};
 const client={auth,from(table){assert.equal(table,'users');return {select(fields){assert.equal(fields,'id,status,member_id');return {eq(key,value){assert.equal(key,'auth_user_id');calls.push(value);return {async maybeSingle(){const snapshot={data:profile,error};if(lookupGate)await lookupGate;return snapshot;}};}};}};}};
 vm.runInNewContext(script,{__CARDORA_JOIN_URL_JSON__:'https://example.invalid',__CARDORA_JOIN_KEY_JSON__:'offline',window:{supabase:{createClient:()=>client}},document:{getElementById:node,querySelector:()=>({value:role})},setTimeout:fn=>timers.push(fn)});
 const drain=async()=>{while(timers.length){timers.shift()();await tick();}await tick();};
 await drain();
 return {node,calls,drain,event:evt=>authEvent(evt),setUser:v=>{user=v;},setProfile:v=>{profile=v;},setRole:v=>{role=v;},holdLookup:p=>{lookupGate=p;}};
}
const active=await fixture();
assert.equal(active.node('memberDetails').hidden,false);
assert.equal(active.node('memberNumber').textContent,'TRX-SYNTHETIC');
assert.equal(active.node('memberEmail').textContent,'a@example.invalid');
assert.ok(active.calls.every(id=>id==='synthetic-a'));
assert.equal(active.node('application').hidden,true);
active.setRole('seller');active.node('roles').handlers.change();await active.drain();
assert.equal(active.node('application').hidden,false);
assert.equal(active.node('apply').hidden,true);
await active.node('logout').handlers.click();await active.drain();
assert.equal(active.node('memberDetails').hidden,true);
assert.equal(active.node('memberEmail').textContent,'');
assert.equal(active.node('memberNumber').textContent,'');
assert.equal(active.node('application').hidden,true);
for(const args of [{profile:null},{profile:{status:'suspended'}},{error:{message:'offline failure'}},{user:{id:'anonymous',is_anonymous:true}}]){
 const f=await fixture(args);assert.equal(f.node('memberDetails').hidden,true);assert.equal(f.node('interestPanel').hidden,true);assert.equal(f.node('application').hidden,true);
}
const switching=await fixture();
let release;switching.holdLookup(new Promise(r=>{release=r;}));
switching.event('USER_UPDATED');await switching.drain();
switching.setUser({id:'synthetic-b',email:'b@example.invalid'});
switching.setProfile({id:'profile-b',status:'active',member_id:'TRX-SECOND'});
switching.holdLookup(null);switching.event('SIGNED_IN');
assert.equal(switching.node('memberEmail').textContent,'');
await switching.drain();release();await tick();
assert.equal(switching.node('memberEmail').textContent,'b@example.invalid');
assert.equal(switching.node('memberNumber').textContent,'TRX-SECOND');
assert.ok(switching.calls.includes('synthetic-b'));
console.log('PASS: active identity, inactive/missing/error/anonymous denial, logout, paused application and stale account switch (offline)');
