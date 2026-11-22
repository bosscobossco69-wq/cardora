#!/usr/bin/env node
// Offline staging-only build of Cardora's single-file frontend.
// This script does not access Supabase, Stripe, GitHub or Vercel and never changes index.html.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const fail = (msg) => { console.error('STAGING BUILD BLOCKED: ' + msg); process.exit(1); };
if (process.env.CARDORA_STAGING_BUILD !== 'YES') fail('Explicit CARDORA_STAGING_BUILD=YES required');
const projectUrl = (process.env.CARDORA_STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const anonKey = process.env.CARDORA_STAGING_SUPABASE_ANON_KEY || '';
if (projectUrl !== 'https://fdkfquvzbswxocyrhduk.supabase.co') fail('Only the known Cardora project URL is accepted');
if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(anonKey) && !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(anonKey))
  fail('Require a Supabase public anon/publishable key (never service_role or secret key)');
if (/service_role|sb_secret_/i.test(anonKey)) fail('Secret key refused');
const src = resolve('index.html');
let html = readFileSync(src, 'utf8');
const oldUrl = 'https://crqqockaetgacddxkqpb.supabase.co';
const oldProject = 'crqqockaetgacddxkqpb';
const exact = (needle, expected) => {
  const count = html.split(needle).length-1;
  if(count !== expected) fail('Expected '+expected+' occurrences of '+needle+', found '+count);
};
exact("const PTX_SUPABASE_URL='"+oldUrl+"';",1);
exact("const PTX_SUPABASE_KEY='",1);
exact("storageKey:'cardora-supabase-auth-v1'",1);
exact("connect-src 'self' "+oldUrl,1);
// The source contains the old project URL both in JS and in CSP; reject surprises.
exact(oldUrl,2);
html = html.replace("const PTX_SUPABASE_URL='"+oldUrl+"';", "const PTX_SUPABASE_URL='"+projectUrl+"';");
html = html.replace(/const PTX_SUPABASE_KEY='[^']*';/, () => "const PTX_SUPABASE_KEY='"+anonKey+"';");
html = html.replace("storageKey:'cardora-supabase-auth-v1'","storageKey:'cardora-supabase-auth-v2-staging'");
html = html.replace("connect-src 'self' "+oldUrl,"connect-src 'self' "+projectUrl);
// Staging-only admin compatibility adapter. Keep production index.html unchanged.
// The public table has own-row RLS and cannot serve the admin review queue.
// Never broaden table RLS: use an admin-role checked SECURITY DEFINER RPC.
const oldQueue = `const r=await window.ptxSupabase.from('seller_applications')
     .select('id,created_at,name,email,whatsapp,city,role,shop_links,card_count,categories,monthly_volume,message,status')
     .order('created_at',{ascending:false}).limit(100);`;
const newQueue = `const r=await window.ptxSupabase.rpc('admin_get_seller_application_queue',{p_limit:100});`;
exact(oldQueue,1);
html=html.replace(oldQueue,newQueue);
const oldReview = `const r=await window.ptxSupabase.from('seller_applications').update({status:status}).eq('id',id).select('id');
   if(r.error)throw r.error;
   if(!r.data||!r.data.length)throw new Error('no row updated');`;
const newReview = `const r=await window.ptxSupabase.rpc('admin_review_seller_application',{p_application_id:id,p_status:status,p_note:null});
   if(r.error)throw r.error;
   if(r.data!==true)throw new Error('review not confirmed');`;
exact(oldReview,1);
html=html.replace(oldReview,newReview);
// New Cardora RPC accepts contacted/approved/rejected, but not a transition
// back to pending. Keep pending visible for existing applications as a
// disabled selection; prevent unsupported requests and misleading UI.
const oldOptions=`+['pending','contacted','approved','rejected'].map(function(s){return '<option value="'+s+'"'+(a.status===s?' selected':'')+'>'+s+'</option>'}).join('')`;
const newOptions=`+['pending','contacted','approved','rejected'].map(function(s){return '<option value="'+s+'"'+(a.status===s?' selected':'')+(s==='pending'?' disabled':'')+'>'+s+'</option>'}).join('')`;
exact(oldOptions,1);
html=html.replace(oldOptions,newOptions);
// Preview-only membership control. Supabase Functions adds the authenticated JWT;
// the Edge Function independently authenticates the owner and fails closed until QA.
// Keep the live index.html untouched.
const accountAnchor = '<button class="ptx-btn" onclick="ptxLogout()" style="width:100%;margin-top:12px" type="button">Sign Out</button>';
exact(accountAnchor,1);
html=html.replace(accountAnchor, `<div class="ptx-card" style="margin-top:12px">
  <b>Seller membership (Sandbox Preview)</b>
  <p class="ptx-muted" style="margin-top:6px">Manage a linked TEST subscription only. Live payments are not enabled.</p>
  <button class="ptx-btn" id="cardoraManageSandboxMembership" type="button" onclick="cardoraOpenSandboxMembership()" style="width:100%;margin-top:8px">Manage test membership</button>
  <div id="cardoraManageSandboxStatus" class="ptx-muted" role="status" aria-live="polite" style="margin-top:8px"></div>
</div>
`+accountAnchor);
const portalScript = `<script>
window.cardoraOpenSandboxMembership = async function(){
  const button=document.getElementById('cardoraManageSandboxMembership');
  const status=document.getElementById('cardoraManageSandboxStatus');
  if(!button || !status) return;
  button.disabled=true;
  status.textContent='Checking your seller subscription…';
  try{
    const client=window.ptxSupabase;
    if(!client) throw new Error('Login is unavailable.');
    const result=await client.auth.getSession();
    const session=result.data?.session;
    if(result.error || !session?.access_token)
      throw new Error('Please sign in to Cardora first.');
    const response=await client.functions.invoke('cardora-stripe-portal',{
      method:'POST',body:{},headers:{Authorization:'Bearer '+session.access_token}
    });
    if(response.error) {
      const reason=response.data?.error||'PORTAL_UNAVAILABLE';
      if(reason==='PORTAL_NOT_VERIFIED')throw new Error('Sandbox portal is not enabled until security testing is complete.');
      if(reason==='NO_STRIPE_SUBSCRIPTION')throw new Error('No linked test subscription found.');
      throw new Error('Portal unavailable. No payment was initiated.');
    }
    const portalUrl=response.data?.portal_url||'';
    if(!portalUrl.startsWith('https://billing.stripe.com/'))
      throw new Error('Invalid portal destination.');
    // Never grant membership from a redirect or trust client-provided owner IDs.
    window.location.assign(portalUrl);
  }catch(error){
    status.textContent=error instanceof Error?error.message:'Portal unavailable.';
  }finally{
    button.disabled=false;
  }
};
</script>`;
exact('</body>',1);
html=html.replace('</body>',portalScript+'\n</body>');
// Read-only admin overview in the isolated staging build, never index.html.
const oldAdminHook=`    const apps=document.createElement('div');apps.id='ptxIpAdminApplications';host.appendChild(apps);
    if(window.ptxLoadAdminDeposits)window.ptxLoadAdminDeposits();
    if(window.ptxLoadSubmissionQueue)window.ptxLoadSubmissionQueue();
    if(window.ptxLoadAdminApplications)window.ptxLoadAdminApplications();`;
const newAdminHook=`    const overview=document.createElement('div');overview.id='cardoraAdminOverview';host.appendChild(overview);
    if(window.cardoraLoadAdminOverview)window.cardoraLoadAdminOverview();
    const apps=document.createElement('div');apps.id='ptxIpAdminApplications';host.appendChild(apps);
    if(window.ptxLoadAdminDeposits)window.ptxLoadAdminDeposits();
    if(window.ptxLoadSubmissionQueue)window.ptxLoadSubmissionQueue();
    if(window.ptxLoadAdminApplications)window.ptxLoadAdminApplications();`;
exact(oldAdminHook,1);
html=html.replace(oldAdminHook,newAdminHook);
const adminOverviewScript=`<script>
window.cardoraLoadAdminOverview=async function(){
 const root=document.getElementById('cardoraAdminOverview');
 if(!root)return;
 root.replaceChildren();
 const line=(tag,value,parent=root)=>{const el=document.createElement(tag);el.textContent=String(value);parent.appendChild(el);return el};
 line('h2','Cardora Admin Overview — preview');
 line('p','New Cardora statistics are authoritative here. Old applications appear separately as read-only history; counts are not combined. Registered-user totals are not deduplicated across projects.');
 const state=line('p','Checking admin authorization…');
 try {
   const client=window.ptxSupabase;
   const session=(await client?.auth.getSession())?.data?.session;
   if(!session?.access_token){state.textContent='Sign in with a Cardora administrator account.';return}
   const response=await client.functions.invoke('cardora-admin-overview',{
     method:'POST',body:{},headers:{Authorization:'Bearer '+session.access_token}
   });
   if(response.error||!response.data?.counts){
     state.textContent='Administrator overview is not available until secure testing and deployment.';
     return;
   }
   state.textContent='Updated: '+new Date(response.data.updated_at).toLocaleString();
   const c=response.data.counts;
   const cards=[
     ['Registered profiles',c.registered_profiles],['Seller profiles',c.sellers],
     ['Approved agent profiles',c.agents],['Seller/agent applications',c.applications],
     ['Pending applications',c.pending],['Approved applications',c.approved],
     ['Seller applications',c.seller_applications],['Agent applications',c.agent_applications],
     ['Listings',c.listings],['Orders',c.orders],['Subscription records',c.subscription_records]
   ];
   const grid=document.createElement('div');grid.className='ptx-ip-grid';root.appendChild(grid);
   for(const [label,n] of cards){
     const cell=document.createElement('div');cell.className='ptx-ip-card';grid.appendChild(cell);
     line('div',label,cell);line('strong',n,cell);
   }
   line('h3','Cardora applications — new database (up to 50)');
   line('p','Raw totals include test records. A test-looking flag is not a confirmed classification.');
   const renderApplications=(arr,source)=>{
     if(!arr.length)line('p','No records displayed for '+source);
     for(const a of arr){
       const div=document.createElement('div');div.className='ptx-ip-card';root.appendChild(div);
       line('strong',(a.name||'Applicant')+' · '+(a.role||'unknown'),div);
       line('p',source+' · '+(a.status||'unknown')+' · '+(a.created_at||''),div);
       line('p',a.email||'',div);
       if(a.suspected_test)line('p','Possible TEST data — verify manually',div);
     }
   };
   renderApplications(response.data.applications||[],'Cardora new');
   line('h3','Archived applications — OLD database');
   const history=response.data.legacy_history;
   if(!history?.available){
     line('p','Legacy archive unavailable / not configured. No old records were merged or deleted.');
   }else{
     line('p','Old project application rows: '+history.record_count+'. Not counted as new Cardora applications.');
     renderApplications(history.applications||[],'Old archive');
   }
   const refresh=document.createElement('button');refresh.type='button';refresh.className='ptx-btn';
   refresh.textContent='Refresh overview';refresh.onclick=window.cardoraLoadAdminOverview;
   root.appendChild(refresh);
 } catch(e){state.textContent='Admin overview unavailable. No data was changed.'}
};
</script>`;
exact('</body>',1);
html=html.replace('</body>',adminOverviewScript+'\n</body>');
// Customer password-auth UI exists ONLY in the opt-in staging build; the live
// index.html and the currently deployed admin-only Preview are unchanged.
const authLoginAnchor='<div class="ptx-auth-note">New to Trixovel?</div>';
const authRegisterAnchor='<div class="ptx-auth-note">Already have an account?</div>';
exact(authLoginAnchor,1);
exact(authRegisterAnchor,1);
const pwFormStyle='style="display:grid;gap:9px;margin:14px 0;text-align:left"';
const loginPw=`<div class="ptx-auth-note">Or sign in with your email and password.</div>
<form id="cardoraPwLoginForm" ${pwFormStyle}>
<label>Email<input type="email" id="cardoraPwLoginEmail" autocomplete="username" required maxlength="254"></label>
<label>Password<input type="password" id="cardoraPwLoginPassword" autocomplete="current-password" required></label>
<button class="ptx-auth-main" type="submit">Sign in with password</button>
</form>
<button id="cardoraPwForgot" type="button" class="ptx-auth-switch">Forgot password?</button>
<div id="cardoraPwLoginStatus" role="status" aria-live="polite" class="ptx-auth-note"></div>`;
const registerPw=`<div class="ptx-auth-note">Or create an account using your own password. Email confirmation may be required.</div>
<form id="cardoraPwRegisterForm" ${pwFormStyle}>
<label>Email<input type="email" id="cardoraPwRegisterEmail" autocomplete="email" required maxlength="254"></label>
<label>Password (12 characters minimum)<input type="password" id="cardoraPwRegisterPassword" autocomplete="new-password" required minlength="12"></label>
<label>Confirm password<input type="password" id="cardoraPwRegisterConfirm" autocomplete="new-password" required minlength="12"></label>
<button class="ptx-auth-main" type="submit">Create account with password</button>
</form>
<div class="ptx-auth-note">Promotional emails are not automatically enabled by registration.</div>
<div id="cardoraPwRegisterStatus" role="status" aria-live="polite" class="ptx-auth-note"></div>`;
html=html.replace(authLoginAnchor,loginPw+authLoginAnchor);
html=html.replace(authRegisterAnchor,registerPw+authRegisterAnchor);
const resetForm=`<section id="cardoraPwRecovery" hidden style="position:fixed;inset:0;z-index:9999;background:#080711;padding:24px;overflow:auto;color:white">
<div style="max-width:400px;margin:5vh auto;padding:18px;background:#17112a;border-radius:18px">
<h2>Set a new password</h2><p>Choose a new password for your existing account.</p>
<form id="cardoraPwRecoveryForm" ${pwFormStyle}>
<label>New password<input type="password" id="cardoraPwRecoveryPassword" autocomplete="new-password" minlength="12" required></label>
<label>Confirm password<input type="password" id="cardoraPwRecoveryConfirm" autocomplete="new-password" minlength="12" required></label>
<button type="submit" class="ptx-auth-main">Save new password</button>
</form><p id="cardoraPwRecoveryStatus" role="status"></p>
</div></section>`;
const passwordAuthScript=`<script>
(function(){
'use strict';
const field=id=>document.getElementById(id);
const endpoint=()=>window.ptxSupabase;
const feedback=(id,message)=>{const el=field(id);if(el)el.textContent=message};
const pwValid=p=>typeof p==='string'&&p.length>=12&&p.length<=128;
const root=()=>location.origin+location.pathname;
const submit=async (formId,statusId,operation)=>{
 const form=field(formId);if(!form)return;
 form.addEventListener('submit',async event=>{
   event.preventDefault();
   const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
   feedback(statusId,'Processing securely…');
   try{const client=endpoint();if(!client)throw Error('Authentication unavailable.');
     await operation(client);
   }catch(_error){feedback(statusId,'Request not completed. Please check the details, your connection, or try later.')}
   finally{if(button)button.disabled=false}
 });
};
submit('cardoraPwLoginForm','cardoraPwLoginStatus',async client=>{
 const email=field('cardoraPwLoginEmail').value.trim();
 const password=field('cardoraPwLoginPassword').value;
 const {data,error}=await client.auth.signInWithPassword({email,password});
 field('cardoraPwLoginPassword').value='';
 if(error||!data?.session){feedback('cardoraPwLoginStatus','Sign-in failed. Check email/password, and confirm your email if required.');return}
 await window.ptxUpdateAuthUI(data.session);
 window.ptxCloseAuth();
 feedback('cardoraPwLoginStatus','Signed in.');
});
submit('cardoraPwRegisterForm','cardoraPwRegisterStatus',async client=>{
 const email=field('cardoraPwRegisterEmail').value.trim();
 const password=field('cardoraPwRegisterPassword').value;
 const confirm=field('cardoraPwRegisterConfirm').value;
 if(!pwValid(password)||password!==confirm){feedback('cardoraPwRegisterStatus','Use 12–128 characters and enter matching passwords.');return}
 const {data,error}=await client.auth.signUp({email,password,
   options:{emailRedirectTo:root()}});
 field('cardoraPwRegisterPassword').value='';
 field('cardoraPwRegisterConfirm').value='';
 if(error){feedback('cardoraPwRegisterStatus','Registration unavailable. Try an existing account or contact support.');return}
 feedback('cardoraPwRegisterStatus',data?.session?
   'Account created. You can now use your password.':
   'If registration is accepted, check your email to confirm your account before signing in.');
 if(data?.session){await window.ptxUpdateAuthUI(data.session);window.ptxCloseAuth()}
});
field('cardoraPwForgot')?.addEventListener('click',async()=>{
 const email=field('cardoraPwLoginEmail').value.trim();
 if(!email){feedback('cardoraPwLoginStatus','Enter your email above to request a reset link.');return}
 const button=field('cardoraPwForgot');button.disabled=true;
 try{const client=endpoint();if(!client)throw Error('Unavailable');
   await client.auth.resetPasswordForEmail(email,{redirectTo:root()});
   feedback('cardoraPwLoginStatus','If the account exists, a password-reset link will be emailed.');
 }catch(_error){feedback('cardoraPwLoginStatus','Reset request unavailable. Please retry later.')}
 finally{button.disabled=false}
});
const initRecovery=()=>{
 const client=endpoint();
 if(!client){setTimeout(initRecovery,150);return}
 client.auth.onAuthStateChange((event)=>{
   if(event==='PASSWORD_RECOVERY'){field('cardoraPwRecovery').hidden=false;}
 });
};
initRecovery();
submit('cardoraPwRecoveryForm','cardoraPwRecoveryStatus',async client=>{
 const password=field('cardoraPwRecoveryPassword').value;
 const confirm=field('cardoraPwRecoveryConfirm').value;
 if(!pwValid(password)||password!==confirm){feedback('cardoraPwRecoveryStatus','Use 12–128 matching characters.');return}
 const {error}=await client.auth.updateUser({password});
 field('cardoraPwRecoveryPassword').value='';field('cardoraPwRecoveryConfirm').value='';
 if(error){feedback('cardoraPwRecoveryStatus','Could not update password. Request a fresh recovery link.');return}
 feedback('cardoraPwRecoveryStatus','Password updated. You can now sign in.');
 field('cardoraPwRecovery').hidden=true;
 await client.auth.signOut();
});
})();
</script>`;
exact('</body>',1);
html=html.replace('</body>',resetForm+passwordAuthScript+'\\n</body>');

// Block preview functionality until separate testing of privilege-sensitive flows.
const oldReviewRpc=`rpc('admin_review_seller_application'`;
if(!html.includes(oldReviewRpc) || !html.includes("rpc('admin_get_seller_application_queue'"))
  fail('Admin RPC staging adapter missing');
// Extra guard: must not silently leave a backend pointed at legacy database.
if(html.includes(oldProject)) fail('Legacy project reference remains in staging build; inspect source manually');
if(!html.includes("connect-src 'self' "+projectUrl)) fail('Staging CSP not applied');
const out = resolve('dist-staging/index.html');
mkdirSync(resolve('dist-staging'),{recursive:true});
writeFileSync(out,html,{encoding:'utf8',flag:'w'});
console.log('Staging-only frontend created at dist-staging/index.html; do not publish until OAuth/RLS tests pass.');
