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
:root{color-scheme:dark;--bg:#080711;--panel:#201a2b;--line:#42334b;--gold:#f3ca7d;--text:#f7f2eb;--muted:#c9c2d0}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:radial-gradient(circle at 70% -12%,#342346 0,#171125 38%,#080711 76%);min-height:100svh;color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[hidden]{display:none!important}
main{max-width:740px;margin:auto;padding:30px 18px 65px}
h1{font-size:clamp(28px,5vw,37px);line-height:1.15;letter-spacing:-.045em;margin:8px 0 12px}
h2{font-size:18px;margin:0 0 16px;letter-spacing:-.02em}
p,.muted,small{color:var(--muted)}p{margin:0 0 13px}small{font-size:12px}
.eyebrow{font-size:11px;letter-spacing:.16em;color:var(--gold);font-weight:800}
.warning{border:1px solid #7b6236;background:#2b231e;border-radius:12px;padding:12px 15px;color:#f4dfba;font-size:12px;line-height:1.5;margin:0 0 19px}
#loginState,#profileStatus,#resultStatus{color:#c9c2d0;font-size:13px;margin:14px 0;line-height:1.5}
#authSection{background:linear-gradient(135deg,#201a2b 0%,#110e19 95%);border:1px solid var(--line);border-radius:20px;padding:clamp(20px,5vw,30px);box-shadow:0 20px 55px #0005}
form{display:grid;gap:13px}label{display:grid;gap:8px;color:#f5e9d6;font-size:13px;font-weight:600}
input{background:#110e19;border:1px solid #655670;color:var(--text);border-radius:10px;padding:13px 14px;min-height:47px;font:inherit;outline:0;width:100%}
input:focus{border-color:var(--gold);box-shadow:0 0 0 3px #f3ca7d25}
button{background:var(--gold);color:#1a1321;border:0;border-radius:10px;min-height:46px;padding:12px 16px;font:700 14px/1.3 inherit;cursor:pointer}
button.secondary{background:#2d2537;color:var(--text);border:1px solid var(--line)}button:disabled{opacity:.5;cursor:not-allowed}
button:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
#emailOtpForm button,#verifyOtpForm button,#loginForm button{width:100%;margin-top:4px}
#verifyOtpForm{border-top:1px solid var(--line);padding-top:16px;margin-top:16px}
.auth-help{font-size:12px;line-height:1.6;margin:12px 0;color:var(--muted)}
.password-fallback{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.password-fallback summary{color:var(--gold);font-size:13px;font-weight:700;cursor:pointer;list-style:none}
.password-fallback summary::-webkit-details-marker{display:none}.password-fallback form{margin-top:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.card{border:1px solid var(--line);background:#211a2b;padding:16px;border-radius:12px;color:var(--muted);font-size:13px}.value{color:var(--text);font-size:29px;font-weight:800}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}article{border:1px solid var(--line);background:#211a2b;border-radius:12px;padding:14px;margin:10px 0;overflow-wrap:anywhere}a{color:var(--gold)}
footer{border-top:1px solid var(--line);margin-top:34px;padding-top:16px;color:var(--muted);font-size:12px}
@media(max-width:480px){main{padding:24px 16px 50px}#authSection{border-radius:16px;padding:20px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card{padding:12px}.row button{flex:1}}
body:has(#overview:not([hidden])) main{max-width:1240px}
.dashboard-nav{display:flex;gap:8px;overflow-x:auto;padding:8px 0 16px;scrollbar-width:thin}
.dashboard-nav a{flex-shrink:0;text-decoration:none;background:#211a2b;border:1px solid var(--line);border-radius:9px;padding:10px 13px;font-size:13px;font-weight:700}
.dashboard-nav a:focus-visible{outline:2px solid var(--gold)}
#overview .cards{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
#overview .card{background:linear-gradient(140deg,#2a2038,#1a1523);min-width:0}
#overview .value{color:var(--gold);font-variant-numeric:tabular-nums}
.dashboard-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:20px}
.dashboard-panel{min-width:0;border:1px solid var(--line);background:#14101e;border-radius:16px;padding:20px;scroll-margin-top:16px}
.dashboard-panel.wide{grid-column:1/-1}
.dashboard-panel article{margin:8px 0;background:#20192a}
.dashboard-panel article p{font-size:13px;margin:5px 0}
.dashboard-panel h2{color:var(--gold)}
#customerSearch{margin:10px 0}
#customerFilter{color:var(--muted);background:#110e19;border:1px solid var(--line);border-radius:10px;padding:12px;font:inherit;width:100%}
.module-note{font-size:12px;color:var(--muted)}
@media(max-width:650px){.dashboard-grid{grid-template-columns:1fr}.dashboard-panel{padding:15px}#overview .cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
<section id="overview" hidden><p id="activeAccount" role="status" aria-live="polite"></p><div class="row"><button id="refreshButton" type="button">Refresh overview</button><button class="secondary" id="logoutButton" type="button">Sign out</button></div>
<p id="profileStatus" role="status" aria-live="polite">Account link not yet verified.</p>\n<p id="resultStatus" role="status" aria-live="polite">Checking admin access…</p>
<nav class="dashboard-nav" aria-label="Management modules">
<a href="#cards">Overview</a><a href="#customerPanel">Customers / CRM</a><a href="#applications">Applications</a><a href="#sellers">Sellers</a><a href="#agents">Agents</a><a href="#listings">Listings</a><a href="#orders">Orders</a><a href="#subscriptions">Subscriptions</a><a href="#finance">Finance</a><a href="#security">AI security</a><a href="#archive">Archive</a>
</nav><p id="calendarNote" class="module-note">Business calendar · Malaysia (UTC+8)</p>
<div class="cards" id="cards"></div>
<div class="dashboard-grid">
<section id="customerPanel" class="dashboard-panel wide"><h2>Customer management / CRM</h2><label>Find a customer in loaded records<input id="customerSearch" type="search" placeholder="Member ID or masked email"></label><label>Account filter<select id="customerFilter"><option value="all">All loaded profiles</option><option value="active">Active profiles</option><option value="test">Possible test accounts</option><option value="non_test">Not flagged (not verified customers)</option></select></label><p id="customerMatch" role="status"></p><section id="customers"><h2>Customers · Read-only</h2><p>Customer data is unavailable until the admin API is verified.</p></section></section>
<section id="applications" class="dashboard-panel wide"></section>
<section id="sellers" class="dashboard-panel"></section><section id="agents" class="dashboard-panel"></section>
<section id="listings" class="dashboard-panel"></section><section id="orders" class="dashboard-panel"></section>
<section id="subscriptions" class="dashboard-panel"></section><section id="finance" class="dashboard-panel"><h2>Finance</h2><p>Stripe revenue not connected. No estimated figures.</p></section>
<section id="security" class="dashboard-panel"><h2>AI security review</h2><p>Not connected. Test account flags require human review; no automated approvals.</p></section><section id="archive" class="dashboard-panel"></section>
</div></section>
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
 const modules=['sellers','agents','listings','orders','subscriptions'];
 const moduleTitles={sellers:'Sellers',agents:'Agents',listings:'Listings',orders:'Orders',subscriptions:'Subscription records'};
 const formatDate=(v)=>{if(!v)return 'Unknown date';const d=new Date(v);return Number.isNaN(d.getTime())?'Unknown date':d.toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'});};
 const renderModule=(id,mod,fields)=>{
   const root=$(id);root.replaceChildren();create('h2',moduleTitles[id]+' · Read-only',root);
   if(!mod?.available||!Array.isArray(mod.records)){create('p','Data not available. No count inferred.',root);return}
   create('p','Recent '+mod.records.length+' records · maximum '+mod.limit,root);
   if(!mod.records.length)create('p','No records returned.',root);
   for(const record of mod.records){const entry=create('article','',root);
     for(const [field,label] of fields){let v=record[field];if(field==='created_at')v=formatDate(v);
       if(v!==null&&v!==undefined)create('p',label+': '+String(v),entry);}
   }
 };
 let loadGeneration=0, displayedUserId=null, customerRows=null;
 function renderCustomers(){
   const root=$('customers');root.replaceChildren();create('h2','Customers · Read-only',root);
   text($('customerMatch'),'');
   if(!customerRows){create('p','Customer data unavailable.',root);return;}
   const search=$('customerSearch').value.trim().toLowerCase(),filter=$('customerFilter').value;
   const visible=customerRows.records.filter(u=>(!search||((u.member_id||'')+' '+(u.email_masked||'')).toLowerCase().includes(search))&&
    (filter==='all'||(filter==='active'&&u.status==='active')||(filter==='test'&&u.suspected_test)||(filter==='non_test'&&!u.suspected_test)));
   text($('customerMatch'),visible.length+' matching loaded records / '+customerRows.displayed_count+' loaded / '+customerRows.total_profiles+' total profiles');
   create('p','Email outreach is disabled. Marketing consent is not configured.',root);
   if(!visible.length)create('p','No matching loaded profiles.',root);
   for(const u of visible){const item=create('article','',root);
     create('strong',(u.member_id||'No member ID')+' · '+(u.role||'User'),item);
     create('p','Created: '+formatDate(u.created_at)+' · Status: '+(u.status||'Unknown'),item);
     if(u.email_masked)create('p',u.email_masked,item);
     if(u.suspected_test)create('small','Possible test account · Review required',item);
     create('small','Outreach disabled · Consent not configured',item);
   }
 }
 $('customerSearch').addEventListener('input',renderCustomers);
 $('customerFilter').addEventListener('change',renderCustomers);
 function clearOverview(){
   $('cards').replaceChildren();$('customers').replaceChildren();$('applications').replaceChildren();$('archive').replaceChildren();
   customerRows=null;$('customerSearch').value='';$('customerFilter').value='all';renderCustomers();
   for(const id of modules)renderModule(id,null,[]);
   text($('calendarNote'),'Business calendar · Malaysia (UTC+8) · data unavailable');
   text($('activeAccount'),'');text($('profileStatus'),'Account link not yet verified.');
 }
 function invalidateOverview(){loadGeneration++;displayedUserId=null;clearOverview();}
 async function load(){
   const generation=++loadGeneration;
   const current=()=>generation===loadGeneration;
   displayedUserId=null;clearOverview();
   text($('resultStatus'),'Verifying admin access…');
   const {data:{session},error}=await client.auth.getSession();
   if(!current())return;
   if(error||!session?.access_token){showAuth(false);text($('loginState'),'Sign in with an existing Cardora admin account.');return}
   const verified=await client.auth.getUser(session.access_token);
   if(!current())return;
   if(verified.error||!verified.data?.user||verified.data.user.is_anonymous||verified.data.user.id!==session.user?.id){showAuth(false);text($('loginState'),'Your session has expired.');return}
   displayedUserId=verified.data.user.id;
   showAuth(true);text($('loginState'),'Cardora session verified.');
   text($('activeAccount'),'Signed in as '+verified.data.user.email+' · Switch accounts with Sign out.');
   // Read ONLY this signed-in identity's profile, protected by users own-row RLS.
   // This browser-side check grants NO privileges. The Edge endpoint must
   // independently verify admin + active status for every request.
   text($('profileStatus'),'Checking your Cardora account link…');
   const profileResult=await client.from('users')
     .select('id,status,role').eq('auth_user_id',verified.data.user.id).maybeSingle();
   if(!current())return;
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
   if(!current())return;
   const latest=await client.auth.getSession();
   if(!current())return;
   if(latest.error||latest.data?.session?.user?.id!==displayedUserId){
     invalidateOverview();showAuth(false);text($('loginState'),'Session changed. Please sign in again.');return;
   }
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
     }else if(status===503||code==='ADMIN_OVERVIEW_NOT_VERIFIED'){
       text($('resultStatus'),'Admin API has not passed release verification.');
     }else if(status===404){
       text($('resultStatus'),'Admin API returned 404. Check the request URL, target deployment and function routing; the cause is not confirmed.');
     }else{
       text($('resultStatus'),'Admin data is unavailable. No artificial counts are shown.');
     }
     return;
   }
   const c=result.counts;
   const activity=result.activity;
   text($('calendarNote'),'Malaysia business calendar · '+(activity?.date||'Date unavailable')+' · profile creation counts are not unique Auth registrations');
   metric('Profiles created today',activity?.profiles_today??'—');metric('Profiles created yesterday',activity?.profiles_yesterday??'—');
   metric('Applications today',activity?.applications_today??'—');metric('Applications yesterday',activity?.applications_yesterday??'—');
   for(const [label,value] of Object.entries({
     'Registered profiles':c.registered_profiles,'Sellers':c.sellers,'Agents':c.agents,
     'Applications':c.applications,'Pending':c.pending,'Approved':c.approved,
     'Seller applications':c.seller_applications,'Agent applications':c.agent_applications,
     'Listings':c.listings,'Orders':c.orders,'Subscriptions':c.subscription_records
   })) metric(label,value??'—');
   const roster=result.customers;
   customerRows=roster&&Array.isArray(roster.records)?roster:null;renderCustomers();
   const m=result.modules||{};
   renderModule('sellers',m.sellers,[['display_name','Name'],['status','Status'],['verification_status','Verification'],['trust_level','Trust'],['created_at','Created']]);
   renderModule('agents',m.agents,[['display_name','Name'],['status','Status'],['created_at','Created']]);
   renderModule('listings',m.listings,[['title','Title'],['status','Status'],['price','Price'],['currency','Currency'],['inventory','Inventory'],['created_at','Created']]);
   renderModule('orders',m.orders,[['order_id','Order'],['status','Status'],['total','Order total (not revenue)'],['currency','Currency'],['created_at','Created']]);
   renderModule('subscriptions',m.subscriptions,[['plan_code','Plan'],['status','Status'],['is_current','Current'],['created_at','Created']]);
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
    const email=$('otpEmail').value.trim().toLowerCase();
    const {data:current,error:currentError}=await client.auth.getUser();
    if(currentError && currentError.name!=='AuthSessionMissingError')throw currentError;
    if(current?.user && current.user.email?.toLowerCase()!==email){
      // Never request a code while another identity remains signed in.
      const {error:outError}=await client.auth.signOut();
      if(outError)throw outError;
      const {data:afterLogout}=await client.auth.getSession();
      if(afterLogout?.session)throw new Error('ACCOUNT_SWITCH_NOT_CONFIRMED');
    }
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
    const {data:verifiedOtp,error}=await client.auth.verifyOtp({email,token,type:'email'});
    if(error)throw error;
    // A successful OTP must identify the requested email, not a cached session.
    const {data:identity,error:identityError}=await client.auth.getUser();
    if(identityError || !identity?.user || identity.user.email?.toLowerCase()!==email.toLowerCase()){
      await client.auth.signOut();
      showAuth(false);
      throw new Error('EMAIL_IDENTITY_MISMATCH');
    }
    $('otpToken').value='';
    await safeLoad();
  }catch(err){text($('loginState'),'Verification failed. Check the code and try again.')}
  finally{button.disabled=false}
 });
 $('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginButton').disabled=true;text($('loginState'),'Verifying your account…');
  try{const email=$('email').value.trim().toLowerCase();
      const {error}=await client.auth.signInWithPassword({email,password:$('password').value});
      if(error)throw error;
      const {data:identity}=await client.auth.getUser();
      if(!identity?.user || identity.user.email?.toLowerCase()!==email){
        await client.auth.signOut();throw new Error('EMAIL_IDENTITY_MISMATCH');
      }
      $('password').value='';await safeLoad();
  }catch(err){text($('loginState'),'Sign-in failed. Use an existing Cardora account with password access enabled.')}
  finally{$('loginButton').disabled=false}
 });
 function safeLoad(){const pending=load();const generation=loadGeneration;return pending.catch(()=>{if(generation!==loadGeneration)return;invalidateOverview();showAuth(false);text($('loginState'),'Unable to verify the current session. Please sign in again.');});}
 $('refreshButton').addEventListener('click',safeLoad);
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'||(displayedUserId&&session?.user?.id!==displayedUserId)){
   invalidateOverview();showAuth(false);text($('resultStatus'),'Admin data cleared.');
   text($('loginState'),'Session changed. Please sign in again.');
  }
 });
 $('logoutButton').addEventListener('click',async()=>{
  invalidateOverview();
  text($('resultStatus'),'Admin data cleared.');
  const {error}=await client.auth.signOut();
  if(error){text($('loginState'),'Unable to sign out. Please retry.');return}
  $('cards').replaceChildren();$('customers').replaceChildren();$('applications').replaceChildren();$('archive').replaceChildren();
  $('otpToken').value='';$('verifyOtpForm').hidden=true;
  text($('activeAccount'),'');showAuth(false);text($('loginState'),'Signed out. You can now enter a different email.');
 });
 safeLoad();
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
