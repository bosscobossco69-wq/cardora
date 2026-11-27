import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../join.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({user={id:'synthetic-a',email:'a@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'},profile={id:'profile-a',status:'active',member_id:'TRX-SYNTHETIC'},error=null,signupMode='confirmation',loginMode='invalid',confirmMode='success',callbackSearch='',callbackHash=''}={}){
 const elements=new Map(),timers=[],delayed=new Map(),intervals=new Set();let authEvent,lookupGate=null,loginGate=null,logoutGate=null,logoutError=false,role='collector',now=100000;const logoutCalls=[];
 const node=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',textContent:'',checked:false,handlers:{},setAttribute(k,v){this[k]=v;},focus(){},reportValidity(){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);},addEventListener(k,v){this.handlers[k]=v;}});return elements.get(id);};
 const calls=[],signupCalls=[],resendCalls=[],confirmCalls=[],otpCalls=[];
 const auth={signInWithOtp:async(args)=>{otpCalls.push(args);return {error:null};},resend:async(args)=>{resendCalls.push(args);return {error:null};},verifyOtp:async(args)=>{confirmCalls.push(args);if(confirmMode==='error')return {error:{code:'otp_expired'}};user={id:'synthetic-a',email:confirmMode==='mismatch'?'other@example.invalid':args.email,email_confirmed_at:'2026-11-25T00:00:00Z'};return {data:{session:{}},error:null};},signInWithPassword:async()=>{if(loginGate)await loginGate;if(loginMode==='invalid')return {error:{code:'invalid_credentials'}};if(loginMode==='network')throw Error('offline network');user={id:'synthetic-a',email:'a@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'};return {data:{session:{}},error:null};},signUp:async(args)=>{signupCalls.push(args);if(signupMode==='error')return {error:{message:'offline failure'}};if(signupMode==='mismatch'){user={id:'wrong',email:'wrong@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'};return {data:{session:{}},error:null};}return {data:{session:null},error:null};},getUser:async()=>({data:{user},error:null}),onAuthStateChange(fn){authEvent=fn;},signOut:async(args)=>{logoutCalls.push(args);if(logoutGate)await logoutGate;if(logoutError)return {error:{code:'offline'}};user=null;authEvent('SIGNED_OUT',null);return {error:null};}};
 const client={auth,from(table){assert.equal(table,'users');return {select(fields){assert.equal(fields,'id,status,member_id,role');return {eq(key,value){assert.equal(key,'auth_user_id');calls.push(value);return {async maybeSingle(){const snapshot={data:profile,error};if(lookupGate)await lookupGate;return snapshot;}};}};}};}};
 vm.runInNewContext(script,{__CARDORA_JOIN_URL_JSON__:'https://example.invalid',__CARDORA_JOIN_KEY_JSON__:'offline',window:{supabase:{createClient:()=>client}},document:{documentElement:{},getElementById:node,querySelectorAll:()=>[],querySelector:()=>({value:role})},URLSearchParams,location:{origin:'https://preview.example.invalid',pathname:'/join.html',search:callbackSearch,hash:callbackHash},setTimeout:(fn,ms=0)=>{if(ms>=12000)delayed.set(fn,now+ms);else timers.push(fn);return fn;},clearTimeout:fn=>{delayed.delete(fn);const i=timers.indexOf(fn);if(i>=0)timers.splice(i,1);},setInterval:fn=>{intervals.add(fn);return fn;},clearInterval:fn=>intervals.delete(fn),Date:{now:()=>now}});
 const drain=async()=>{await tick();while(timers.length){timers.shift()();await tick();}await tick();};
 await drain();
 return {node,calls,signupCalls,resendCalls,confirmCalls,otpCalls,advance:ms=>{now+=ms;for(const [fn,at] of delayed)if(at<=now){delayed.delete(fn);fn();}for(const fn of intervals)fn();},drain,event:evt=>authEvent(evt,user?{user}:null),logoutCalls,holdLogout:p=>{logoutGate=p;},setLogoutError:v=>{logoutError=v;},setUser:v=>{user=v;},setProfile:v=>{profile=v;},setRole:v=>{role=v;},holdLookup:p=>{lookupGate=p;},holdLogin:p=>{loginGate=p;}};
}
const active=await fixture();
assert.equal(active.node('memberDetails').hidden,false);
assert.equal(active.node('memberMain')['data-member-view'],'active');
assert.equal(active.node('memberNumber').textContent,'TRX-SYNTHETIC');
assert.equal(active.node('memberEmail').textContent,'a@example.invalid');
assert.ok(active.calls.every(id=>id==='synthetic-a'));
assert.equal(active.node('application').hidden,true);
assert.equal(active.node('sessionCheck').hidden,true);
const checks=active.calls.length;
for(const evt of ['INITIAL_SESSION','SIGNED_IN','SIGNED_IN','TOKEN_REFRESHED']){active.event(evt);assert.equal(active.node('memberDetails').hidden,false);assert.equal(active.node('registration').hidden,true);}
await active.drain();assert.equal(active.calls.length,checks);
active.setRole('seller');active.node('roles').handlers.change();await active.drain();
assert.equal(active.node('application').hidden,false);
assert.equal(active.node('apply').hidden,true);
await active.node('logout').handlers.click();await active.drain();assert.equal(active.logoutCalls[0].scope,'local');assert.equal(active.node('registration').hidden,false);assert.equal(active.node('account').hidden,true);
assert.equal(active.node('memberDetails').hidden,true);
assert.equal(active.node('memberEmail').textContent,'');
assert.equal(active.node('memberMain')['data-member-view'],'entry');
assert.equal(active.node('memberNumber').textContent,'');
assert.equal(active.node('application').hidden,true);
for(const args of [{profile:null},{profile:{status:'suspended'}},{error:{message:'offline failure'}},{user:{id:'anonymous',is_anonymous:true}}]){
 const f=await fixture(args);assert.equal(f.node('memberMain')['data-member-view'],'entry');assert.equal(f.node('memberDetails').hidden,true);assert.equal(f.node('interestPanel').hidden,true);assert.equal(f.node('application').hidden,true);
}
const switching=await fixture();
let release;switching.holdLookup(new Promise(r=>{release=r;}));
switching.event('USER_UPDATED');await switching.drain();
switching.setUser({id:'synthetic-b',email:'b@example.invalid',email_confirmed_at:'2026-11-25T00:00:00Z'});
switching.setProfile({id:'profile-b',status:'active',member_id:'TRX-SECOND'});
switching.holdLookup(null);switching.event('SIGNED_IN');
assert.equal(switching.node('memberEmail').textContent,'');assert.equal(switching.node('memberMain')['data-member-view'],'entry');
await switching.drain();release();await tick();
assert.equal(switching.node('memberEmail').textContent,'b@example.invalid');assert.equal(switching.node('memberMain')['data-member-view'],'active');
assert.equal(switching.node('memberNumber').textContent,'TRX-SECOND');
assert.ok(switching.calls.includes('synthetic-b'));
console.log('PASS: active identity, inactive/missing/error/anonymous denial, logout, paused application and stale account switch (offline)');
const stalled=await fixture();let releaseStall;stalled.holdLookup(new Promise(r=>{releaseStall=r;}));stalled.event('USER_UPDATED');await stalled.drain();stalled.advance(12000);await stalled.drain();
assert.match(stalled.node('accountStatus').textContent,/timed out/);assert.equal(stalled.node('memberDetails').hidden,true);assert.equal(stalled.node('retryProfile').hidden,false);
stalled.holdLookup(null);stalled.node('retryProfile').handlers.click();await stalled.drain();assert.equal(stalled.node('memberDetails').hidden,false);releaseStall();await stalled.drain();
const logoutSlow=await fixture();let releaseLogout;logoutSlow.holdLogout(new Promise(r=>{releaseLogout=r;}));const logoutPromise=logoutSlow.node('logout').handlers.click();assert.equal(logoutSlow.node('logout').disabled,true);assert.match(logoutSlow.node('accountStatus').textContent,/Signing out/);await logoutSlow.node('logout').handlers.click();assert.equal(logoutSlow.logoutCalls.length,1);
logoutSlow.event('SIGNED_IN');logoutSlow.advance(12000);assert.match(logoutSlow.node('accountStatus').textContent,/not confirmed/);assert.equal(logoutSlow.node('registration').hidden,true);releaseLogout();await logoutPromise;await logoutSlow.drain();assert.equal(logoutSlow.node('registration').hidden,false);assert.equal(logoutSlow.node('memberDetails').hidden,true);
const logoutFailed=await fixture();logoutFailed.setLogoutError(true);await logoutFailed.node('logout').handlers.click();assert.match(logoutFailed.node('accountStatus').textContent,/Unable to sign out/);assert.equal(logoutFailed.node('logout').disabled,false);assert.equal(logoutFailed.node('registration').hidden,true);logoutFailed.setLogoutError(false);await logoutFailed.node('logout').handlers.click();assert.equal(logoutFailed.node('registration').hidden,false);
console.log('PASS: repeated auth events, timeout and retry, duplicate/slow/failed logout and verified local logout');

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
const shortPassword=await fixture({user:null});await register(shortPassword,{password:'Abc123!'});assert.equal(shortPassword.signupCalls.length,0);
const eightPassword=await fixture({user:null});await register(eightPassword,{password:'Abc123!X'});assert.equal(eightPassword.signupCalls.length,1);
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
assert.match(html,/<p id="loginStatus"[^>]*><\/p>\s*<button id="passwordSubmit" type="submit"><span data-l10n="\d+">Sign In<\/span><\/button>/);console.log('PASS: login pending, slow request, incorrect credentials, network failure and successful member access');

async function confirmAction(f,resend=false,code='123456'){f.node('confirmEmail').value='new@example.invalid';f.node('confirmCode').value=code;const btn=f.node('resendSignup');btn.disabled=false;await f.node(resend?'resendSignup':'confirmSignup').handlers[resend?'click':'submit']({preventDefault(){},currentTarget:{querySelector:()=>btn}});assert.equal(btn.disabled,false);assert.equal(f.node('confirmCode').value,'');}
assert.equal(pending.node('signupHelp').open,true);assert.equal(pending.node('confirmEmail').value,'new@example.invalid');
const resent=await fixture({user:null});await confirmAction(resent,true);assert.equal(resent.resendCalls.length,1);assert.equal(resent.resendCalls[0].type,'signup');assert.equal(resent.resendCalls[0].options.emailRedirectTo,'https://preview.example.invalid/join.html');assert.equal(resent.signupCalls.length,0);assert.equal(resent.node('memberDetails').hidden,true);
for(const mode of ['success','error','mismatch']){const f=await fixture({user:null,confirmMode:mode});await confirmAction(f);await f.drain();assert.equal(f.confirmCalls.length,1);assert.equal(f.confirmCalls[0].type,'email');assert.equal(f.confirmCalls[0].email,'new@example.invalid');if(mode==='success'){assert.equal(f.node('memberDetails').hidden,false);assert.match(f.node('callbackStatus').textContent,/Email verified/);}else{assert.equal(f.node('memberDetails').hidden,true);assert.match(f.node('confirmStatus').textContent,/Confirmation failed/);}}
const invalidCode=await fixture({user:null});await confirmAction(invalidCode,false,'123');assert.equal(invalidCode.confirmCalls.length,0);
const existing=await fixture();await confirmAction(existing,true);assert.equal(existing.resendCalls.length,0);
const callbackBad=await fixture({user:null,callbackHash:'#error_code=otp_expired'});assert.match(callbackBad.node('callbackStatus').textContent,/could not be completed/);assert.equal(callbackBad.node('signupHelp').open,true);assert.equal(callbackBad.node('memberDetails').hidden,true);
const callbackMissing=await fixture({user:null,callbackSearch:'?code=synthetic'});assert.match(callbackMissing.node('callbackStatus').textContent,/No verified session/);
console.log('PASS: signup confirmation and resend, invalid or mismatched identity, missing/expired link state; no account bypass');

const visibility=await fixture({user:null});visibility.node('tabRegister').onclick();assert.equal(visibility.node('registerPanel').hidden,false);assert.equal(visibility.node('loginPanel').hidden,true);assert.equal(visibility.node('consentRow').hidden,false);assert.equal(visibility.node('signupHelp').hidden,true);for(const id of ['loginPass','regPass','regConfirm']){const input=visibility.node(id),toggle=visibility.node(id+'Toggle');input.value='synthetic-password';assert.equal(input.type,'password');toggle.handlers.click();assert.equal(input.type,'text');assert.equal(toggle['aria-pressed'],'true');assert.equal(input.value,'synthetic-password');toggle.handlers.click();assert.equal(input.type,'password');assert.equal(toggle['aria-pressed'],'false');}visibility.node('regPassToggle').handlers.click();visibility.node('tabLogin').onclick();assert.equal(visibility.node('regPass').type,'password');assert.equal(visibility.node('regPass').value,'');assert.equal(visibility.node('loginPanel').hidden,false);assert.equal(visibility.node('registerPanel').hidden,true);assert.equal(visibility.node('consentRow').hidden,true);visibility.node('forgotPassword').onclick();assert.equal(visibility.node('emailPanel').hidden,false);visibility.node('openConfirm').handlers.click();assert.equal(visibility.node('loginPanel').hidden,true);assert.equal(visibility.node('registerPanel').hidden,true);assert.equal(visibility.node('signupHelp').hidden,false);visibility.node('backLogin').handlers.click();assert.equal(visibility.node('signupHelp').hidden,true);assert.equal(visibility.node('loginPanel').hidden,false);assert.match(html,/<div class="google-wrap" hidden>/);for(const id of ['loginPass','regPass','regConfirm'])assert.match(html,new RegExp('id="'+id+'Toggle" aria-controls="'+id+'" aria-label="Show password" aria-pressed="false"'));console.log('PASS: accessible eye controls, login/register isolation, confirmation and recovery navigation');

const locale=await fixture({user:null});locale.node('languageSelect').value='ms';locale.node('languageSelect').handlers.change();locale.node('tabRegister').onclick();assert.equal(locale.node('authTitle').textContent,'Daftar akaun percuma');locale.node('regPass').value='synthetic-password';locale.node('languageSelect').value='zh';locale.node('languageSelect').handlers.change();assert.equal(locale.node('authTitle').textContent,'创建免费账户');assert.equal(locale.node('regPass').value,'synthetic-password');locale.node('languageSelect').value='en';locale.node('languageSelect').handlers.change();assert.equal(locale.node('authTitle').textContent,'Create your free account');assert.equal(locale.node('regPass').value,'synthetic-password');locale.node('languageSelect').value='th';locale.node('languageSelect').handlers.change();assert.equal(locale.node('authTitle').textContent,'สร้างบัญชีฟรีของคุณ');assert.equal(locale.node('regPass').value,'synthetic-password');locale.node('languageSelect').value='en';locale.node('languageSelect').handlers.change();assert.equal(locale.node('authTitle').textContent,'Create your free account');console.log('PASS: language switch preserves inputs and updates dynamic labels');


// Native single OTP input retains autofill and paste; six visual cells are non-interactive.
const premium=await fixture({user:null});
premium.node('otpCode').value='12a34-56';premium.node('otpCode').handlers.input();
assert.equal(premium.node('otpCode').value,'123456');assert.equal(premium.node('otpCodeCell5').textContent,'6');
premium.node('regPass').value='123456789012';premium.node('regPass').handlers.input();
assert.equal(premium.node('strengthBar1')['data-filled'],'true');
premium.node('tabLogin').onclick();assert.equal(premium.node('strengthBar0')['data-filled'],'false');
assert.match(html,/href="\/reset-password\.html"/);
assert.match(html,/prefers-reduced-motion:reduce/);
console.log('PASS: premium language selector, single accessible OTP input and advisory length meter');

// Shared email, one visible sign-in field, explicit OTP method, expiration and cooldown.
const otp=await fixture({user:null,confirmMode:'error'});
otp.node('loginEmail').value='otp@example.invalid';otp.node('loginEmail').handlers.input();
for(const id of ['regEmail','confirmEmail','otpEmail'])assert.equal(otp.node(id).value,'otp@example.invalid');
otp.node('emailToggle').onclick();assert.equal(otp.node('emailPanel').hidden,false);assert.equal(otp.node('loginPasswordRow').hidden,true);
assert.equal(otp.node('passwordSubmit').hidden,true);assert.equal(otp.node('loginPass').required,false);
assert.match(html,/<input id="otpEmail" type="hidden">/);
const otpSubmit=(f,id)=>f.node(id).handlers.submit({preventDefault(){},currentTarget:{querySelector:()=>f.node(id+'TestButton')}});
await otpSubmit(otp,'otpSend');assert.equal(otp.otpCalls.length,1);assert.equal(otp.otpCalls[0].email,'otp@example.invalid');assert.equal(otp.otpCalls[0].options.shouldCreateUser,false);
assert.equal(otp.node('otpVerify').hidden,false);assert.equal(otp.node('otpSendButton').disabled,true);
await otpSubmit(otp,'otpSend');assert.equal(otp.otpCalls.length,1);
otp.node('otpCode').value='123456';await otpSubmit(otp,'otpVerify');assert.match(otp.node('otpStatus').textContent,/invalid or expired/);assert.equal(otp.node('otpCode').value,'');assert.equal(otp.node('memberDetails').hidden,true);
otp.advance(60000);assert.equal(otp.node('otpSendButton').disabled,false);await otpSubmit(otp,'otpSend');assert.equal(otp.otpCalls.length,2);
otp.node('loginEmail').value='other@example.invalid';otp.node('loginEmail').handlers.input();assert.equal(otp.node('otpVerify').hidden,true);
otp.node('passwordMode').onclick();assert.equal(otp.node('loginPasswordRow').hidden,false);assert.equal(otp.node('emailPanel').hidden,true);assert.equal(otp.node('loginPass').required,true);
const otpGood=await fixture({user:null});otpGood.node('loginEmail').value='a@example.invalid';otpGood.node('emailToggle').onclick();await otpSubmit(otpGood,'otpSend');otpGood.node('otpCode').value='123456';await otpSubmit(otpGood,'otpVerify');assert.equal(otpGood.node('memberDetails').hidden,false);assert.equal(otpGood.node('memberNumber').textContent,'TRX-SYNTHETIC');
console.log('PASS: shared email, OTP method, resend cooldown, invalid code and verified member access (offline)');

const recoveryHtml=readFileSync(new URL('../reset-password.html',import.meta.url),'utf8');
const recoveryScript=[...recoveryHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
async function recoveryFixture({origin='https://trixovel.com',search='',wrong=false,otpError=false,updateError=false,logoutError=false,prefill=''}={}){
 const nodes=new Map(),calls=[],timers=[];let callback,session=null,created=0,storedEmail=prefill;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:['verification','change','cancel'].includes(id),value:'',textContent:'',disabled:false,type:'password',handlers:{},setAttribute(k,v){this[k]=v},addEventListener(k,v){this.handlers[k]=v}});return nodes.get(id)};
 const makeUser=(email='test@example.invalid',id='synthetic-recovery')=>({id,email,email_confirmed_at:'2026-11-25T00:00:00Z'});
 function setSession(u){session=u?{user:u,access_token:'synthetic-token'}:null}
 const auth={
  getSession:async()=>({data:{session},error:null}),
  getUser:async()=>({data:{user:session?.user||null},error:null}),
  resetPasswordForEmail:async(email,options)=>{calls.push(['request',email,options]);return {error:null}},
  verifyOtp:async(args)=>{calls.push(['verify',args]);if(otpError)return {error:{code:'otp_expired'}};setSession(makeUser(wrong?'other@example.invalid':args.email));callback?.('SIGNED_IN',session);return {data:{session},error:null}},
  updateUser:async(args)=>{calls.push(['update',args]);return {error:updateError?{code:'weak_password'}:null}},
  signOut:async({scope})=>{calls.push(['logout',scope]);if(logoutError&&scope==='global')return {error:{code:'offline'}};setSession(null);callback?.('SIGNED_OUT',null);return {error:null}},
  onAuthStateChange(fn){callback=fn}
 };
 vm.runInNewContext(recoveryScript,{window:{supabase:{createClient:(_url,_key,options)=>{created++;assert.equal(options.auth.storageKey,'trixovel-recovery-v1');return {auth}}}},document:{getElementById:node,querySelectorAll:()=>[],documentElement:{}},location:{origin,pathname:'/reset-password.html',search,hash:''},URLSearchParams,setTimeout:fn=>{timers.push(fn)},localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:()=>storedEmail,removeItem:()=>{storedEmail='';}},Date});
 const submit=async id=>node(id).handlers.submit?.({preventDefault(){}});
 const drain=async()=>{while(timers.length)await timers.shift()();await tick()};
 return {node,calls,submit,drain,created,stored:()=>storedEmail,setSession:(u)=>setSession(u),event:(name)=>callback?.(name,session),makeUser};
}
const previewRecovery=await recoveryFixture({origin:'https://preview.example.invalid'});
assert.equal(previewRecovery.created,0);assert.equal(previewRecovery.node('send').disabled,true);await previewRecovery.submit('request');assert.equal(previewRecovery.calls.length,0);
const prefilled=await recoveryFixture({prefill:'test@example.invalid'});assert.equal(prefilled.node('email').value,'test@example.invalid');assert.equal(prefilled.stored(),'');assert.equal(prefilled.calls.length,0);
const ordinary=await recoveryFixture();ordinary.setSession(ordinary.makeUser());ordinary.event('SIGNED_IN');ordinary.event('INITIAL_SESSION');assert.equal(ordinary.node('change').hidden,true);await ordinary.submit('change');assert.equal(ordinary.calls.length,0);
async function requestRecovery(f){f.node('email').value='test@example.invalid';await f.submit('request');assert.equal(f.calls.find(c=>c[0]==='request')[2].redirectTo,'https://trixovel.com/reset-password.html');f.node('code').value='123456'}
const good=await recoveryFixture();await requestRecovery(good);await good.submit('verification');assert.equal(good.calls.find(c=>c[0]==='verify')[1].type,'recovery');assert.equal(good.node('change').hidden,false);
good.node('password').value='synthetic-new-password';good.node('confirmation').value='mismatch';await good.submit('change');assert.equal(good.calls.filter(c=>c[0]==='update').length,0);
good.node('password').value=good.node('confirmation').value='Abc123!';await good.submit('change');assert.equal(good.calls.filter(c=>c[0]==='update').length,0);good.node('password').value=good.node('confirmation').value='Abc123!X';await good.submit('change');assert.equal(good.calls.filter(c=>c[0]==='update').length,1);assert.ok(good.calls.some(c=>c[0]==='logout'&&c[1]==='global'));assert.equal(good.node('password').value,'');assert.match(good.node('status').textContent,/Password updated/);
for(const opts of [{wrong:true},{otpError:true}]){const f=await recoveryFixture(opts);await requestRecovery(f);await f.submit('verification');assert.equal(f.node('change').hidden,true);await f.submit('change');assert.equal(f.calls.filter(c=>c[0]==='update').length,0)}
const changed=await recoveryFixture();await requestRecovery(changed);await changed.submit('verification');changed.setSession(changed.makeUser('other@example.invalid','other-user'));changed.node('password').value=changed.node('confirmation').value='synthetic-new-password';await changed.submit('change');assert.equal(changed.calls.filter(c=>c[0]==='update').length,0);
const link=await recoveryFixture({search:'?code=synthetic'});link.setSession(link.makeUser());link.event('SIGNED_IN');assert.equal(link.node('change').hidden,true);link.event('PASSWORD_RECOVERY');await link.drain();assert.equal(link.node('change').hidden,false);
const noLink=await recoveryFixture();noLink.setSession(noLink.makeUser());noLink.event('PASSWORD_RECOVERY');await noLink.drain();assert.equal(noLink.node('change').hidden,true);
const failedUpdate=await recoveryFixture({updateError:true});await requestRecovery(failedUpdate);await failedUpdate.submit('verification');failedUpdate.node('password').value=failedUpdate.node('confirmation').value='synthetic-new-password';await failedUpdate.submit('change');assert.match(failedUpdate.node('status').textContent,/not completed/);assert.equal(failedUpdate.node('password').value,'');
assert.doesNotMatch(recoveryHtml,/sb_secret_|service_role|sk_live_/);
console.log('PASS: recovery preview blocked, OTP and PKCE event verification, identity mismatch and normal-session denial, password mismatch, update and logout (mocked)');

const hub=html.slice(html.indexOf('<div id="memberDetails" hidden>'),html.indexOf('<p id="accountStatus"'));
assert.ok(html.indexOf('<section id="account" hidden>')<html.indexOf('<section id="interestPanel" hidden>'));
assert.ok(html.indexOf('id="memberMain" data-member-view="entry"')>=0);
for(const target of ['/collection-preview.html#search','/collection-preview.html#saved','/collection-preview.html#cert-heading','/packs-live-preview.html','#memberProfile','#freeInvite','/'])assert.ok(hub.includes('href="'+target+'"'),target);
assert.equal([...hub.matchAll(/class="hub-tile hub-locked"/g)].length,4);
assert.doesNotMatch(hub,/class="hub-tile hub-locked"[^>]*href/);assert.match(hub,/<div id="profileEditor"[^>]* hidden>/);assert.match(hub,/<button id="profileSave" type="submit" disabled>/);
assert.match(hub,/On this device only/);assert.match(hub,/Concept preview · no purchase or stream/);
const allIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(allIds.length,new Set(allIds).size);
const dictionaries={};for(const m of script.matchAll(/(?:const staticL10n=|Object\.assign\(staticL10n,)(\{[^\n]*?\})(?:;|\);)/g))Object.assign(dictionaries,JSON.parse(m[1]));
for(const m of html.matchAll(/data-l10n="(\d+)"/g)){assert.equal(dictionaries[m[1]]?.length,4,'translation '+m[1]);assert.ok(dictionaries[m[1]].every(v=>typeof v==='string'&&v.trim().length>0));}
for(const page of ['collection-preview.html','packs-live-preview.html']){const content=readFileSync(new URL('../'+page,import.meta.url),'utf8');assert.match(content,/<a href="\/join\.html"><span data-l10n="\d+">Member center<\/span><\/a>/);assert.match(content,/noindex,nofollow/);assert.match(content,/trixovel-language/);}
console.log('PASS: member hub navigation, locked features, existing identity gates, unique IDs and four-language labels');

for(const m of script.matchAll(/(?:const messageL10n=|Object\.assign\(messageL10n,)(\{[^\n]*?\})(?:;|\);)/g))for(const [k,v] of Object.entries(JSON.parse(m[1]))){assert.equal(v.length,4,k);assert.match(v[3],/[\u0e00-\u0e7f]/,k);}
for(const page of ['reset-password.html','collection-preview.html','packs-live-preview.html']){
const content=readFileSync(new URL('../'+page,import.meta.url),'utf8');
const match=content.match(page==='reset-password.html'?/words=(\{[^\n]*?\});/:/(?:const staticL10n=|const words=)(\[\[[^\n]*?\]\]);/);
assert.ok(match,page);for(const v of Object.values(JSON.parse(match[1]))){assert.equal(v.length,4,page);assert.ok(v[3].trim(),page);}
assert.match(content,/trixovel-language/);
assert.match(content,page==='reset-password.html'?/option value="th">ภาษาไทย/:/id="langTh"/);
}
console.log('PASS: Thai auth messages and four-locale page dictionaries');

const profileSource=readFileSync(new URL('../member-profile.js',import.meta.url),'utf8');
const schema=readFileSync(new URL('../docs/security/member-profile-schema-review.sql',import.meta.url),'utf8');
assert.match(html,/profileEditor\?\.open\(confirmed\.id\)/);assert.match(html,/function clearMember\(\)\{ profileEditor\?\.clear\(\)/);
assert.match(schema,/enable row level security/);assert.match(schema,/force row level security/);
assert.match(schema,/grant update \(nickname,region,bio,avatar\) on public\.cardora_member_details to authenticated/);
assert.match(schema,/email_confirmed_at is not null/);assert.match(schema,/coalesce\(a\.is_anonymous, false\) = false/);assert.match(schema,/u\.status = 'active'/);
assert.equal([...schema.matchAll(/owner_id = \(select auth\.uid\(\)\)/g)].length,4);
assert.doesNotMatch(schema.replace(/^--.*$/gm,''),/grant[^;\n]+on public\.users/i);assert.doesNotMatch(profileSource,/localStorage\.setItem|innerHTML|service_role|sb_secret_/);
function profileFixture({record=null,unavailable=false}={}){
 const nodes=new Map(),calls=[];let identity='a',readGate=null,writeGate=null,row=record;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:true,hidden:true,events:{},addEventListener(k,fn){this.events[k]=fn;}});return nodes.get(id);};
 const window={};vm.runInNewContext(profileSource,{window});
 const client={from(table){assert.equal(table,'cardora_member_details');return {select(fields){assert.equal(fields,'owner_id,nickname,region,bio,avatar');return {eq(key,id){assert.equal(key,'owner_id');calls.push({op:'read',id});return {async maybeSingle(){if(readGate)await readGate;return {data:row,error:unavailable?{code:'PGRST205'}:null};}};}};},insert(v){calls.push({op:'insert',v});return {select(){return {async single(){if(writeGate)await writeGate;row=v;return {data:v,error:null};}};}};},update(v){return {eq(key,id){assert.equal(key,'owner_id');calls.push({op:'update',id,v});return {select(){return {async single(){if(writeGate)await writeGate;row={owner_id:id,...v};return {data:row,error:null};}};}};}};}};}};
 const editor=window.TRXMemberProfile({client,document:{getElementById:node},verify:async()=>identity?{id:identity,email_confirmed_at:'verified'}:null,timeout:p=>p});
 return {editor,node,calls,setIdentity:id=>identity=id,setReadGate:p=>readGate=p,setWriteGate:p=>writeGate=p,setRow:v=>row=v,save:()=>node('profileForm').events.submit({preventDefault(){}})};
}
const pf=profileFixture();await pf.editor.open('a');assert.equal(pf.node('profileSave').disabled,false);pf.editor.setLanguage('th');assert.equal(pf.node('profileEditStatus').textContent,'โปรไฟล์ของคุณเป็นส่วนตัว');pf.node('profileNickname').value='นักสะสม';pf.node('profileRegion').value='Thailand';pf.node('profileBio').value='Card collector';pf.node('profileAvatar').value='gem';await pf.save();assert.equal(pf.calls.at(-1).op,'insert');assert.equal(pf.calls.at(-1).v.owner_id,'a');assert.equal(pf.node('profileEditStatus').textContent,'บันทึกโปรไฟล์แล้ว');pf.node('profileNickname').value='New name';await pf.save();assert.equal(pf.calls.at(-1).op,'update');assert.equal(pf.calls.at(-1).id,'a');assert.equal('owner_id' in pf.calls.at(-1).v,false);
const bad=pf.calls.length;pf.node('profileAvatar').value='https://evil.invalid';await pf.save();assert.equal(pf.calls.length,bad);pf.editor.clear();assert.equal(pf.node('profileNickname').value,'');assert.equal(pf.node('profileEditor').hidden,true);assert.equal(pf.node('profileSave').disabled,true);
const unavailableProfile=profileFixture({unavailable:true});await unavailableProfile.editor.open('a');assert.equal(unavailableProfile.node('profileSave').disabled,true);await unavailableProfile.save();assert.equal(unavailableProfile.calls.length,1);
const cross=profileFixture({record:{owner_id:'b',nickname:'private other',region:'',bio:'',avatar:'star'}});await cross.editor.open('a');assert.equal(cross.node('profileSave').disabled,true);assert.equal(cross.node('profileNickname').value,'');
const stale=profileFixture({record:{owner_id:'a',nickname:'private a',region:'',bio:'',avatar:'star'}});let unblockRead;stale.setReadGate(new Promise(r=>unblockRead=r));const pendingRead=stale.editor.open('a');await tick();stale.editor.clear();stale.setIdentity('b');unblockRead();await pendingRead;assert.equal(stale.node('profileNickname').value,'');assert.equal(stale.node('profileEditor').hidden,true);
console.log('PASS: profile private editor, four-language status, owner-bound writes, unavailable schema, stale session and SQL draft constraints');
