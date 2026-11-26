import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../join.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({user={id:'synthetic-a',email:'a@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'},profile={id:'profile-a',status:'active',member_id:'TRX-SYNTHETIC'},error=null,signupMode='confirmation',loginMode='invalid'}={}){
 const elements=new Map(),timers=[];let authEvent,lookupGate=null,loginGate=null,role='collector';
 const node=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',textContent:'',checked:false,handlers:{},setAttribute(k,v){this[k]=v;},focus(){},addEventListener(k,v){this.handlers[k]=v;}});return elements.get(id);};
 const calls=[],signupCalls=[];
 const auth={signInWithPassword:async()=>{if(loginGate)await loginGate;if(loginMode==='invalid')return {error:{code:'invalid_credentials'}};if(loginMode==='network')throw Error('offline network');user={id:'synthetic-a',email:'a@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'};return {data:{session:{}},error:null};},signUp:async(args)=>{signupCalls.push(args);if(signupMode==='error')return {error:{message:'offline failure'}};if(signupMode==='mismatch'){user={id:'wrong',email:'wrong@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'};return {data:{session:{}},error:null};}return {data:{session:null},error:null};},getUser:async()=>({data:{user},error:null}),onAuthStateChange(fn){authEvent=fn;},signOut:async()=>{user=null;authEvent('SIGNED_OUT');return {error:null};}};
 const client={auth,from(table){assert.equal(table,'users');return {select(fields){assert.equal(fields,'id,status,member_id');return {eq(key,value){assert.equal(key,'auth_user_id');calls.push(value);return {async maybeSingle(){const snapshot={data:profile,error};if(lookupGate)await lookupGate;return snapshot;}};}};}};}};
 vm.runInNewContext(script,{__CARDORA_JOIN_URL_JSON__:'https://example.invalid',__CARDORA_JOIN_KEY_JSON__:'offline',window:{supabase:{createClient:()=>client}},document:{getElementById:node,querySelector:()=>({value:role})},location:{origin:'https://preview.example.invalid',pathname:'/join.html'},setTimeout:fn=>{timers.push(fn);return fn;},clearTimeout:fn=>{const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);}});
 const drain=async()=>{while(timers.length){timers.shift()();await tick();}await tick();};
 await drain();
 return {node,calls,signupCalls,drain,event:evt=>authEvent(evt),setUser:v=>{user=v;},setProfile:v=>{profile=v;},setRole:v=>{role=v;},holdLookup:p=>{lookupGate=p;},holdLogin:p=>{loginGate=p;}};
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
switching.setUser({id:'synthetic-b',email:'b@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'});
switching.setProfile({id:'profile-b',status:'active',member_id:'TRX-SECOND'});
switching.holdLookup(null);switching.event('SIGNED_IN');
assert.equal(switching.node('memberEmail').textContent,'');
await switching.drain();release();await tick();
assert.equal(switching.node('memberEmail').textContent,'b@example.invalid');
assert.equal(switching.node('memberNumber').textContent,'TRX-SECOND');
assert.ok(switching.calls.includes('synthetic-b'));
console.log('PASS: active identity, inactive/missing/error/anonymous denial, logout, paused application and stale account switch (offline)');

async function register(f,{consent=true,password='synthetic-password-2026'}={}){
 f.node('regEmail').value=' NEW@EXAMPLE.INVALID ';
 f.node('regPass').value=password;f.node('regConfirm').value=password;
 f.node('acceptTerms').checked=consent;
 const button={disabled:false};
 await f.node('register').handlers.submit({preventDefault(){},currentTarget:{querySelector:()=>button}});
 assert.equal(button.disabled,false);
 assert.equal(f.node('regPass').value,'');
 assert.equal(f.node('regConfirm').value,'');
}
const noConsent=await fixture({user:null});await register(noConsent,{consent:false});assert.equal(noConsent.signupCalls.length,0);
const signedIn=await fixture();await register(signedIn);assert.equal(signedIn.signupCalls.length,0);
const pending=await fixture({user:null});await register(pending);assert.equal(pending.signupCalls.length,1);assert.equal(pending.signupCalls[0].email,'new@example.invalid');assert.equal(pending.signupCalls[0].options.emailRedirectTo,'https://preview.example.invalid/join.html');assert.equal(pending.node('memberDetails').hidden,true);assert.match(pending.node('registerStatus').textContent,/confirmation link/);
const failed=await fixture({user:null,signupMode:'error'});await register(failed);assert.match(failed.node('registerStatus').textContent,/not completed/);
const mismatch=await fixture({user:null,signupMode:'mismatch'});await register(mismatch);await mismatch.drain();assert.equal(mismatch.node('memberDetails').hidden,true);assert.match(mismatch.node('registerStatus').textContent,/not completed/);
console.log('PASS: registration consent, existing session refusal, canonical redirect, pending confirmation, failure and wrong identity (offline)');

const unconfirmed=await fixture({user:{id:'not-confirmed',email:'pending@example.invalid'}});
assert.equal(unconfirmed.node('memberDetails').hidden,true);
assert.equal(unconfirmed.node('interestPanel').hidden,true);
await register(unconfirmed);assert.equal(unconfirmed.signupCalls.length,0);
assert.match(html,/sb_publishable_/);
assert.doesNotMatch(html,/crqqockaetgacddxkqpb|sb_secret_|sk_live_|seller_applications'\)\.insert/);
console.log('PASS: production-derived release keeps unverified accounts outside member view and excludes legacy/secret/write endpoints');

assert.match(html,/id="freeInvite"/);assert.match(html,/id="inviteLink" readonly value="https:\/\/trixovel\.com\/join\.html"/);assert.match(html,/navigator\.share\(/);assert.match(html,/navigator\.clipboard\?\.writeText/);assert.match(html,/不记录推荐归属，不产生佣金/);assert.doesNotMatch(html,/publicInvite[^\n]*(member_id|auth_user_id|access_token)/);console.log('PASS: public invitation uses fixed canonical URL without member identifier or payout');

const memberTools=html.slice(html.indexOf('<div id="memberDetails" hidden>'),html.indexOf('<p id="accountStatus"'));for(const target of ['/collection-preview.html#search','/collection-preview.html#saved','/collection-preview.html#cert-heading','#freeInvite'])assert.ok(memberTools.includes('href="'+target+'"'));assert.match(memberTools,/not linked to your account/);assert.match(memberTools,/are not active/);console.log('PASS: active member tools and honest local storage limitations');

assert.match(html,/Welcome to Trixovel/);assert.match(html,/storageKey:'cardora-member-v1'/);assert.match(html,/emailRedirectTo:location.origin\+'\/join.html'/);assert.match(html,/const googlePreviewVerified=false/);assert.match(html,/const publicInvite='https:\/\/trixovel\.com\/join\.html'/);console.log('PASS: TRIXOVEL public brand and stable existing account identity');

async function beginLogin(f){f.node('loginEmail').value='a@example.invalid';f.node('loginPass').value='synthetic-password';const button={disabled:false,textContent:'Sign In'};const promise=f.node('login').handlers.submit({preventDefault(){},currentTarget:{querySelector:()=>button}});return {button,promise};}
const badLogin=await fixture({user:null});let unblock;badLogin.holdLogin(new Promise(r=>{unblock=r;}));const attempt=await beginLogin(badLogin);assert.equal(attempt.button.disabled,true);assert.match(badLogin.node('loginStatus').textContent,/Signing in/);await badLogin.drain();assert.match(badLogin.node('loginStatus').textContent,/Still connecting/);unblock();await attempt.promise;assert.equal(attempt.button.disabled,false);assert.equal(attempt.button.textContent,'Sign In');assert.equal(badLogin.node('loginPass').value,'');assert.equal(badLogin.node('loginStatus')['data-state'],'error');assert.match(badLogin.node('loginStatus').textContent,/incorrect email or password/);assert.equal(badLogin.node('memberDetails').hidden,true);
for(const mode of ['network','success']){const f=await fixture({user:null,loginMode:mode});const a=await beginLogin(f);await a.promise;assert.equal(a.button.disabled,false);assert.equal(f.node('loginPass').value,'');if(mode==='network'){assert.match(f.node('loginStatus').textContent,/connection/);assert.equal(f.node('memberDetails').hidden,true);}else{assert.equal(f.node('memberDetails').hidden,false);assert.equal(f.node('memberNumber').textContent,'TRX-SYNTHETIC');}}
assert.match(html,/<p id="loginStatus"[^>]*><\/p>\s*<button type="submit">Sign In<\/button>/);console.log('PASS: login pending, slow request, incorrect credentials, network failure and successful member access');
