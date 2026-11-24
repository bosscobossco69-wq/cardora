#!/usr/bin/env node
// Strictly preview-only read-only admin entrypoint, never an alternative production storefront.
// Auth-only requests: existing-user Email OTP/password and signOut;
// data read only through admin-verified cardora-admin-overview Edge Function. No application/order/payment mutation actions.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const fail=(m)=>{console.error('CARDORA PREVIEW BLOCKED:',m);process.exit(1)};
const previewEnv=process.env.VERCEL_ENV||'';
const previewBranch=process.env.VERCEL_GIT_COMMIT_REF||'';
if(process.env.CARDORA_PREVIEW_BUILD!=='YES')fail('explicit opt-in missing');
if(previewEnv!=='preview')fail('not in Vercel preview environment');
if(previewBranch!=='draft/stripe-sandbox-subscriptions-20261121')fail('wrong Git branch');
const url=(process.env.CARDORA_PREVIEW_SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.CARDORA_PREVIEW_SUPABASE_PUBLISHABLE_KEY||'';
if(url!=='https://fdkfquvzbswxocyrhduk.supabase.co')fail('wrong Supabase project');
if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))fail('public key required');
if(/service_role|sb_secret_|sk_live_|sk_test_/i.test(key))fail('secret refused');
const csp="default-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' "+url+"; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const data={url,key};
const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Cardora | Admin Preview</title>
<style>
:root{color-scheme:dark;--bg:#110f11;--panel:#1e1b1e;--line:#403532;--gold:#e4bf76;--text:#f8f3eb;--muted:#b8a8a1}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:radial-gradient(circle at 50% -10%,#382921 0,#171316 42%,#110f11 80%);min-height:100svh;color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[hidden]{display:none!important}
main{max-width:740px;margin:auto;padding:30px 18px 65px}
h1{font-size:clamp(28px,5vw,37px);line-height:1.15;letter-spacing:-.045em;margin:8px 0 12px}
h2{font-size:18px;margin:0 0 16px;letter-spacing:-.02em}
p,.muted,small{color:var(--muted)}p{margin:0 0 13px}small{font-size:12px}
.eyebrow{font-size:11px;letter-spacing:.16em;color:var(--gold);font-weight:800}
.warning{border:1px solid #655031;background:#302519aa;border-radius:12px;padding:12px 15px;color:#f1d49e;font-size:12px;line-height:1.5;margin:0 0 19px}
#loginState,#profileStatus,#resultStatus{color:#d5c2a0;font-size:13px;margin:14px 0;line-height:1.5}
#authSection{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:clamp(20px,5vw,30px);box-shadow:0 20px 55px #0005}
form{display:grid;gap:13px}label{display:grid;gap:8px;color:#e5d8cb;font-size:13px;font-weight:600}
input{background:#141215;border:1px solid #64514c;color:var(--text);border-radius:10px;padding:13px 14px;min-height:47px;font:inherit;outline:0;width:100%}
input:focus{border-color:var(--gold);box-shadow:0 0 0 3px #e4bf7625}
button{background:var(--gold);color:#231a17;border:0;border-radius:10px;min-height:46px;padding:12px 16px;font:700 14px/1.3 inherit;cursor:pointer}
button.secondary{background:#31282a;color:var(--text);border:1px solid var(--line)}button:disabled{opacity:.5;cursor:not-allowed}
button:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
#emailOtpForm button,#verifyOtpForm button,#loginForm button{width:100%;margin-top:4px}
#verifyOtpForm{border-top:1px solid var(--line);padding-top:16px;margin-top:16px}
.auth-help{font-size:12px;line-height:1.6;margin:12px 0;color:var(--muted)}
.password-fallback{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.password-fallback summary{color:var(--gold);font-size:13px;font-weight:700;cursor:pointer;list-style:none}
.password-fallback summary::-webkit-details-marker{display:none}.password-fallback form{margin-top:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.card{border:1px solid var(--line);background:var(--panel);padding:16px;border-radius:12px;color:var(--muted);font-size:13px}.value{color:var(--text);font-size:29px;font-weight:800}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}article{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:14px;margin:10px 0;overflow-wrap:anywhere}a{color:var(--gold)}
footer{border-top:1px solid var(--line);margin-top:34px;padding-top:16px;color:var(--muted);font-size:12px}
@media(max-width:480px){main{padding:24px 16px 50px}#authSection{border-radius:16px;padding:20px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:12px}.row button{flex:1}}
</style></head>
<body><main>
<div class="eyebrow">CARDORA · SECURE ACCESS</div>\n<h1>Admin dashboard</h1>
<div class="warning"><strong>Read-only preview.</strong> New registrations, seller approvals, orders, transfers and payments are disabled. Existing accounts only.</div>
<p id="loginState" role="status" aria-live="polite">Checking your session…</p>
<section id="authSection">
<h2>Sign in with email</h2>
<form id="emailOtpForm"><label>Email address<input id="otpEmail" autocomplete="email" type="email" required></label>
<button id="sendOtpButton" type="submit">Send sign-in code</button></form>
<form id="verifyOtpForm" hidden><label>Verification code<input id="otpToken" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required></label>
<button id="verifyOtpButton" type="submit">Verify & sign in</button></form>
<p class="auth-help">Existing Cardora accounts only. If you receive a sign-in link, open it in this browser. Email delivery and redirect URLs must be configured.</p>

<details class="password-fallback"><summary>Use a password instead</summary>
<form id="loginForm"><label>Email<input id="email" autocomplete="username" type="email" required></label>
<label>Password<input id="password" autocomplete="current-password" type="password" required></label>
<button id="loginButton" type="submit">Sign in</button></form></details>
<p class="auth-help">Google sign-in and new registration are disabled. Legacy admin access does not transfer automatically.</p>
</section>
<section id="overview" hidden><div class="row"><button id="refreshButton" type="button">Refresh overview</button><button class="secondary" id="logoutButton" type="button">Sign out</button></div>
<p id="profileStatus" role="status" aria-live="polite">Account link not yet verified.</p>\n<p id="resultStatus" role="status" aria-live="polite">Checking admin access…</p>
<div class="cards" id="cards"></div><section id="customers"><h2>Customers · Read-only</h2><p>Customer data is unavailable until the admin API is verified.</p></section><section id="applications"></section><section id="archive"></section></section>
<footer>Cardora preview · New Supabase project only. Archived records remain separate. No estimated statistics.</footer>
</main><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"></script>
<script>
(function(){
 'use strict';
 const config=${JSON.stringify(data)};
 const $=(id)=>document.getElementById(id);
 const client=window.supabase.createClient(config.url,config.key,{
   auth:{storageKey:'cardora-admin-readonly-preview-v1',flowType:'pkce',autoRefreshToken:true,persistSession:true}
 });
 const text=(target,content)=>{target.textContent=String(content)};
 const create=(tag,content,parent)=>{const n=document.createElement(tag);text(n,content);parent.appendChild(n);return n};
 const showAuth=(signedIn)=>{$('authSection').hidden=signedIn;$('overview').hidden=!signedIn};
 const metric=(label,value)=>{const item=create('div','',$('cards'));item.className='card';create('div',label,item);
   const v=create('div',value,item);v.className='value'};
 const renderApps=(id,title,apps)=>{
   const root=$(id);root.replaceChildren();create('h2',title,root);
   if(!Array.isArray(apps)||!apps.length){create('p','No records available',root);return}
   for(const a of apps){const entry=create('article','',root);
    create('strong',(a.name||'Applicant')+' · '+(a.role||'Unconfirmed'),entry);
    create('p',(a.status||'Unknown status')+' · '+(a.created_at||''),entry);
    if(a.email_masked)create('p',a.email_masked,entry);
    if(a.suspected_test)create('small','Possible test record · Review required',entry);
   }
 };
 async function load(){
   $('cards').replaceChildren();$('customers').replaceChildren();$('applications').replaceChildren();$('archive').replaceChildren();
   text($('resultStatus'),'Verifying admin access…');
   const {data:{session},error}=await client.auth.getSession();
   if(error||!session?.access_token){showAuth(false);text($('loginState'),'Sign in with an existing Cardora admin account.');return}
   const verified=await client.auth.getUser();
   if(verified.error||!verified.data?.user){showAuth(false);text($('loginState'),'Your session has expired.');return}
   showAuth(true);text($('loginState'),'Cardora session verified.');
   // Read ONLY this signed-in identity's profile, protected by users own-row RLS.
   // This browser-side check grants NO privileges. The Edge endpoint must
   // independently verify admin + active status for every request.
   text($('profileStatus'),'Checking your Cardora account link…');
   const profileResult=await client.from('users')
     .select('id,status,role').eq('auth_user_id',verified.data.user.id).maybeSingle();
   if(profileResult.error){
     text($('profileStatus'),'Your Cardora profile is unavailable. Check account permissions.');
     text($('resultStatus'),'Admin data was not requested: account validation failed.');
     return;
   }
   if(!profileResult.data){
     text($('profileStatus'),'This account has no linked Cardora profile. Legacy admin access is not transferred.');
     text($('resultStatus'),'Admin data was not requested.');
     return;
   }
   if(profileResult.data.status!=='active'||profileResult.data.role!=='admin'){
     text($('profileStatus'),'This account is not an active admin. No permissions were changed.');
     text($('resultStatus'),'Only active admins can view dashboard data.');
     return;
   }
   text($('profileStatus'),'Account verified. Requesting server-side admin authorization…');
   // Explicitly no database writes or privileged keys in this browser.
   const {data:result,error:invokeError}=await client.functions.invoke('cardora-admin-overview',{
     method:'POST',body:{},headers:{Authorization:'Bearer '+session.access_token}
   });
   if(invokeError||!result?.counts){
     // Only classify known response statuses/error codes; never echo raw error text,
     // response bodies, bearer tokens, private emails, or server-side credentials.
     const status=invokeError?.context?.status||0;
     const code=result?.error||'';
     if(status===401||code==='LOGIN_REQUIRED'||code==='INVALID_SESSION'){
       showAuth(false);
       text($('loginState'),'Session expired. Please sign in again.');
     }else if(status===403||code==='ADMIN_ONLY'){
       text($('resultStatus'),'Access denied. Admin permission is required.');
     }else if(code==='ADMIN_OVERVIEW_NOT_VERIFIED'){
       text($('resultStatus'),'Admin API has not passed release verification.');
     }else if(status===404){
       text($('resultStatus'),'Admin API is not deployed (404). Signing in does not grant access.');
     }else{
       text($('resultStatus'),'Admin data is unavailable. No artificial counts are shown.');
     }
     return;
   }
   const c=result.counts;
   for(const [label,value] of Object.entries({
     'Registered profiles':c.registered_profiles,'Sellers':c.sellers,'Agents':c.agents,
     'Applications':c.applications,'Pending':c.pending,'Approved':c.approved,
     'Seller applications':c.seller_applications,'Agent applications':c.agent_applications,
     'Listings':c.listings,'Orders':c.orders,'Subscriptions':c.subscription_records
   })) metric(label,value??'—');
   const customersRoot=$('customers');
   create('h2','Customers · Read-only',customersRoot);
   const roster=result.customers;
   if(!roster||!Array.isArray(roster.records)){
     create('p','Customer list is unavailable until the admin API is verified.',customersRoot);
   }else{
     create('p','Total profiles: '+roster.total_profiles+' · Limit: '+roster.limit+' (showing '+roster.displayed_count+' records). Not deduplicated customers.',customersRoot);
     create('p','Email outreach is disabled. Marketing consent is not configured.',customersRoot);
     if(!roster.records.length)create('p','No customer profiles available.',customersRoot);
     for(const u of roster.records){
       const item=create('article','',customersRoot);
       create('strong',(u.member_id||'No member ID')+' · '+(u.role||'User'),item);
       create('p','Created: '+(u.created_at||'Unknown')+' · Status: '+(u.status||'Unknown'),item);
       if(u.email_masked)create('p',u.email_masked,item);
       if(u.suspected_test)create('small','Possible test account · Review required',item);
       create('small','Outreach disabled · Consent not configured',item);
     }
   }
   renderApps('applications','New Cardora applications · Read-only',result.applications);
   const old=result.legacy_history;
   if(old?.available){
     renderApps('archive','Legacy applications · Archived',old.applications);
     const summary=create('p','Legacy applications: '+old.record_count+' records. Excluded from new totals.',$('archive'));
     $('archive').insertBefore(summary,$('archive').firstChild.nextSibling);
   }else create('p','Legacy archive is unavailable (not necessarily empty).',$('archive'));
   text($('resultStatus'),'Overview loaded · '+(result.updated_at||''));
 }
 $('emailOtpForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=$('sendOtpButton');button.disabled=true;
  text($('loginState'),'Sending a Cardora sign-in code…');
  try{
    const email=$('otpEmail').value.trim();
    const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}});
    if(error)throw error;
    $('verifyOtpForm').hidden=false;
    text($('loginState'),'If this account exists, check your inbox for a code or link. Never share codes.');
  }catch(err){text($('loginState'),'Unable to send a code. Check email delivery and redirect settings. No account was created.')}
  finally{button.disabled=false}
 });
 $('verifyOtpForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('verifyOtpButton');button.disabled=true;
  text($('loginState'),'Verifying your code…');
  try{
    const email=$('otpEmail').value.trim();
    const token=$('otpToken').value.trim();
    if(!/^[0-9]{6,12}$/.test(token))throw new Error('invalid code format');
    const {error}=await client.auth.verifyOtp({email,token,type:'email'});
    if(error)throw error;
    $('otpToken').value='';
    await load();
  }catch(err){text($('loginState'),'Verification failed. Check the code and try again.')}
  finally{button.disabled=false}
 });
 $('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginButton').disabled=true;text($('loginState'),'Verifying your account…');
  try{const {error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
      if(error)throw error;$('password').value='';await load();
  }catch(err){text($('loginState'),'Sign-in failed. Use an existing Cardora account with password access enabled.')}
  finally{$('loginButton').disabled=false}
 });
 $('refreshButton').addEventListener('click',load);
 $('logoutButton').addEventListener('click',async()=>{await client.auth.signOut();showAuth(false);text($('loginState'),'Signed out.')});
 load().catch(()=>{showAuth(false);text($('loginState'),'Unable to initialize sign-in.')});
})();
</script></body></html>`;
mkdirSync('dist-preview',{recursive:true});
writeFileSync('dist-preview/index.html',html,'utf8');
const joinTemplate=readFileSync('join-preview.html','utf8');
if(joinTemplate.split('__CARDORA_JOIN_URL_JSON__').length!==2 ||
   joinTemplate.split('__CARDORA_JOIN_KEY_JSON__').length!==2)
  fail('registration preview config markers missing');
if(!joinTemplate.includes('noindex,nofollow') ||
   !joinTemplate.includes('No purchases, seller subscription checkout'))
  fail('registration preview must advertise prelaunch status');
const join=joinTemplate
  .replace('__CARDORA_JOIN_URL_JSON__',JSON.stringify(url))
  .replace('__CARDORA_JOIN_KEY_JSON__',JSON.stringify(key));
writeFileSync('dist-preview/join.html',join,'utf8');
for(const legalPage of ['terms.html','privacy.html']){
  const source=readFileSync(legalPage,'utf8');
  if(!source.includes('noindex') || !source.includes('DRAFT'))
    fail('Legal preview must retain draft noindex label');
  writeFileSync('dist-preview/'+legalPage,source,'utf8');
}

console.log('PASS: read-only Cardora preview built for correct branch; no active database write or payments.');
