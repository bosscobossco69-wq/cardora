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
  <p class="ptx-muted" style="margin-top:6px">TEST only: Basic RM29, Pro RM79, Business RM199 per month. Requires isolated sandbox, verified seller and server-side billing gates. No Live payments.</p>
  <div role="group" aria-label="Sandbox seller subscription plans" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
    <button type="button" class="ptx-btn" data-cardora-sandbox-tier="basic" onclick="cardoraStartSandboxCheckout('basic')">Test Basic RM29</button>
    <button type="button" class="ptx-btn" data-cardora-sandbox-tier="pro" onclick="cardoraStartSandboxCheckout('pro')">Test Pro RM79</button>
    <button type="button" class="ptx-btn" data-cardora-sandbox-tier="business" onclick="cardoraStartSandboxCheckout('business')">Test Business RM199</button>
  </div>
  <div id="cardoraSandboxCheckoutStatus" class="ptx-muted" role="status" aria-live="polite" style="margin-top:8px"></div>
  <button class="ptx-btn" id="cardoraManageSandboxMembership" type="button" onclick="cardoraOpenSandboxMembership()" style="width:100%;margin-top:8px">Manage test membership</button>
  <div id="cardoraManageSandboxStatus" class="ptx-muted" role="status" aria-live="polite" style="margin-top:8px"></div>
</div>
`+accountAnchor);
const portalScript = `<script>
window.cardoraStartSandboxCheckout = async function(tier){
  const allowed=['basic','pro','business'];
  const status=document.getElementById('cardoraSandboxCheckoutStatus');
  const buttons=[...document.querySelectorAll('[data-cardora-sandbox-tier]')];
  if(!status || !allowed.includes(tier)) return;
  buttons.forEach(button=>button.disabled=true);
  status.textContent='Checking Cardora sandbox seller eligibility…';
  try{
    const client=window.ptxSupabase;
    if(!client || client.supabaseUrl!=='https://fdkfquvzbswxocyrhduk.supabase.co')
      throw new Error('BLOCKED: Cardora Sandbox must use the approved project.');
    const {data:identity,error:identityError}=await client.auth.getUser();
    if(identityError || !identity?.user || identity.user.is_anonymous)
      throw new Error('Sign in to your new Cardora test account first.');
    const {data:sessionData,error:sessionError}=await client.auth.getSession();
    const session=sessionData?.session;
    if(sessionError || !session?.access_token || session.user?.id!==identity.user.id)
      throw new Error('Your Cardora session is invalid. Please sign in again.');
    const result=await client.functions.invoke('cardora-stripe-checkout',{
      method:'POST',body:{tier},headers:{Authorization:'Bearer '+session.access_token}
    });
    if(result.error){
      const code=String(result.data?.error || result.error?.context?.status || 'CHECKOUT_UNAVAILABLE');
      if(code.includes('AUTH_MIGRATION_NOT_VERIFIED') || code.includes('SUBSCRIPTION_RESERVATION_NOT_VERIFIED'))
        throw new Error('Sandbox billing is still blocked pending identity and database tests.');
      throw new Error('Sandbox Checkout unavailable ('+code+'). No payment was started.');
    }
    const url=String(result.data?.checkout_url || '');
    const destination=new URL(url);
    if(destination.protocol!=='https:' || destination.hostname!=='checkout.stripe.com' ||
       result.data?.environment!=='sandbox')
      throw new Error('Invalid Stripe test Checkout destination.');
    status.textContent='Opening Stripe Sandbox Checkout…';
    window.location.assign(destination.href);
  }catch(error){
    status.textContent=error instanceof Error?error.message:'Checkout unavailable.';
  }finally{
    buttons.forEach(button=>button.disabled=false);
  }
};
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
    // Old listing_submissions queue is incompatible with canonical Cardora listings.
    // It is intentionally hidden rather than presented as a working moderation tool.
    const oldQueue=document.getElementById('ptxSubmissionQueue');
    if(oldQueue)oldQueue.textContent='Legacy submission review is disabled in staging. Use the canonical pending-listing moderation workflow once verified.';
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
       line('p',a.email_masked||'',div);
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
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:root()});
   if(error)throw error;
   feedback('cardoraPwLoginStatus','If the account exists, a password-reset link will be emailed.');
 }catch(_error){feedback('cardoraPwLoginStatus','Reset request unavailable. Please retry later.')}
 finally{button.disabled=false}
});
// Register recovery listener when the Supabase client becomes ready.
let recoveryListenerRegistered=false;
let recoveryChecks=0;
const initRecovery=()=>{
 if(recoveryListenerRegistered)return;
 const client=endpoint();
 if(!client){
   if(++recoveryChecks<40)setTimeout(initRecovery,250);
   else feedback('cardoraPwLoginStatus','Authentication is unavailable. Refresh the page.');
   return;
 }
 recoveryListenerRegistered=true;
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
html=html.replace('</body>',resetForm+passwordAuthScript+'</body>');

// This canonical Supabase project currently grants NO INSERT on
// public.listing_submissions and has NO insert RLS policy. Do not pretend that
// the seller review queue works, or widen table privileges to make it work.
// Preserve the source implementation for a later reviewed submission endpoint.
const oldListingSubmissionButton='<button class="ptx-btn" onclick="ptxSubmitListing()">Submit for Review</button>';
exact(oldListingSubmissionButton,1);
html=html.replace(oldListingSubmissionButton,
  '<button class="ptx-btn" type="button" onclick="cardoraShowSubmissionUnavailable()">Submit for Review (not live)</button>'+
  '<p class="ptx-muted">Listing submission is unavailable in this test environment. Your details will not be submitted or saved.</p>'+
  '<button class="ptx-btn alt" id="cardoraSellerEligibilityButton" type="button" onclick="cardoraCheckSellerEligibility()">Check seller eligibility (read-only)</button>'+
  '<p id="cardoraSellerEligibilityResult" class="ptx-muted" role="status" aria-live="polite"></p>');
const listingUnavailableScript=`<script>
window.cardoraShowSubmissionUnavailable=function(){
 const reason='Seller listing submissions are not connected to the new Cardora review queue yet. Nothing has been submitted. Please keep a copy of your information and try again after launch.';
 if(typeof window.ptxToast==='function')window.ptxToast(reason);
 else window.alert(reason);
};
window.cardoraCheckSellerEligibility=async function(){
 const status=document.getElementById('cardoraSellerEligibilityResult');
 const button=document.getElementById('cardoraSellerEligibilityButton');
 if(!status||!button)return;
 button.disabled=true;
 status.textContent='Checking your seller status (read-only)…';
 try {
   const client=window.ptxSupabase;
   if(!client){status.textContent='Authentication unavailable. Nothing was submitted.';return}
   const {data:sessionData,error:sessionError}=await client.auth.getUser();
   if(sessionError||!sessionData?.user){status.textContent='Sign in to check your seller status. Nothing was submitted.';return}
   // Only select the caller's profile, subject to users_select_own RLS.
   const {data:profile,error:userError}=await client.from('users')
     .select('id,status').eq('auth_user_id',sessionData.user.id).maybeSingle();
   if(userError||!profile){status.textContent='Your Cardora profile is unavailable. Nothing was submitted.';return}
   if(profile.status!=='active'){status.textContent='Your account is not active. Listing submission remains unavailable.';return}
   const {data:sellers,error:sellerError}=await client.from('seller_profiles')
     .select('id,status').eq('user_id',profile.id).limit(5);
   if(sellerError){status.textContent='Seller status could not be checked. Nothing was submitted.';return}
   if(!sellers?.some(s=>s.status==='approved')){
     status.textContent='No approved seller profile is linked to this account. Apply for seller approval first. Nothing was submitted.';
     return;
   }
   status.textContent='Your seller profile is approved. Listing submission is still paused until photos, moderation and the server-side review flow are verified. Nothing was submitted.';
 }catch(_error){
   status.textContent='Eligibility check unavailable. Nothing was submitted.';
 }finally{button.disabled=false}
};
</script>`;
exact('</body>',1);
html=html.replace('</body>',listingUnavailableScript+'</body>');

// Photos currently exist only as local browser object URLs. No Storage bucket
// exists in the canonical project; NEVER imply a preview is an uploaded listing.
// This staging-only safeguard validates files before the legacy preview runs.
const oldFrontInput='accept="image/*" id="ptxFrontInput"';
const oldBackInput='accept="image/*" id="ptxBackInput"';
exact(oldFrontInput,1);exact(oldBackInput,1);
html=html.replace(oldFrontInput,'accept="image/jpeg,image/png,image/webp" id="ptxFrontInput"');
html=html.replace(oldBackInput,'accept="image/jpeg,image/png,image/webp" id="ptxBackInput"');
const photoNoteAnchor='<div class="ptx-uploadgrid">';
exact(photoNoteAnchor,1);
html=html.replace(photoNoteAnchor,
  '<p class="ptx-muted" role="note"><b>Local preview only:</b> photos stay in this browser and are NOT uploaded, stored, verified or submitted. PNG, JPEG or WebP, max 10 MB per image. No sale will be published.</p>'+
  '<p id="cardoraPhotoValidationStatus" role="status" aria-live="polite" class="ptx-muted"></p>'+photoNoteAnchor);
const photoPreviewGuard=`<script>
(function(){
'use strict';
const oldPhoto=window.ptxPhoto;
if(typeof oldPhoto!=='function')return;
const allowed=new Set(['image/jpeg','image/png','image/webp']);
const maxSize=10*1024*1024;
const status=()=>document.getElementById('cardoraPhotoValidationStatus');
window.ptxPhoto=function(input,target){
 const el=document.getElementById(target);
 const file=input?.files?.[0];
 if(!el||!file)return;
 if(!allowed.has(file.type)||file.size<1||file.size>maxSize){
   // The existing clear handler releases any previously generated object URL.
   window.ptxPhotoClear?.(input.id,target);
   const line=status();
   if(line)line.textContent='Photo rejected. Use a non-empty PNG, JPEG or WebP under 10 MB. Nothing has been uploaded.';
   return;
 }
 oldPhoto(input,target);
 const front=document.getElementById('ptxFrontInput')?.files?.[0];
 const back=document.getElementById('ptxBackInput')?.files?.[0];
 const line=status();
 if(line)line.textContent=(front&&back?'Both local photos selected.':'Select both sides of the card.')+' Photos are NOT uploaded or submitted.';
};
})();
</script>`;
exact('</body>',1);
html=html.replace('</body>',photoPreviewGuard+'</body>');

// Staging-only own-account alignment diagnostic; does not migrate accounts.
const authCheckButton = '<button class="ptx-btn" onclick="ptxLogout()" style="width:100%;margin-top:12px" type="button">Sign Out</button>';
exact(authCheckButton,1);
html=html.replace(authCheckButton,
  '<div class="ptx-card" style="margin-top:12px">'+
  '<b>Cardora account alignment (read-only)</b>'+
  '<p class="ptx-muted">Check the NEW Cardora Auth and your own profile. Old accounts are not automatically transferred.</p>'+
  '<button class="ptx-btn alt" id="cardoraAuthAlignmentButton" type="button" onclick="cardoraCheckAuthAlignment()">Check account link</button>'+
  '<p id="cardoraAuthAlignmentResult" role="status" aria-live="polite" class="ptx-muted"></p>'+
  '</div>'+authCheckButton);
const authAlignmentScript="<script>\nwindow.cardoraCheckAuthAlignment=async function(){\n const result=document.getElementById('cardoraAuthAlignmentResult');\n const button=document.getElementById('cardoraAuthAlignmentButton');\n if(!result||!button)return;\n button.disabled=true;\n result.textContent='Verifying the new Cardora identity and profile…';\n try {\n   const client=window.ptxSupabase;\n   if(!client||client.supabaseUrl!=='https://fdkfquvzbswxocyrhduk.supabase.co'){\n     result.textContent='BLOCKED: This page is not connected to the new Cardora database.';\n     return;\n   }\n   const {data:identity,error:authError}=await client.auth.getUser();\n   if(authError||!identity?.user||identity.user.is_anonymous){\n     result.textContent='Not signed in to new Cardora Auth. Legacy sign-in does not transfer.';\n     return;\n   }\n   const {data:profile,error:profileError}=await client.from('users')\n     .select('id,status,role').eq('auth_user_id',identity.user.id).maybeSingle();\n   if(profileError){\n     result.textContent='New Cardora Auth verified, but own profile cannot be read. Check users RLS.';\n     return;\n   }\n   if(!profile){\n     result.textContent='New Cardora Auth verified, but no linked profile exists. Never grant admin access from matching emails.';\n     return;\n   }\n   if(profile.status!=='active'){\n     result.textContent='Cardora profile is inactive. Contact an administrator; no permission was changed.';\n     return;\n   }\n   const {data:seller,error:sellerError}=await client.from('seller_profiles')\n     .select('status,verification_status').eq('user_id',profile.id).limit(1);\n   if(sellerError){\n     result.textContent='Active Cardora profile found. Seller status unavailable; check seller_profiles RLS.';\n     return;\n   }\n   const approved=!!seller?.some(s=>s.status==='approved');\n   result.textContent='New Cardora Auth and active profile linked. Seller status: '+\n     (approved?'approved':'not approved')+\n     '. This read-only check never grants admin access or enables payments.';\n }catch(_error){\n   result.textContent='Account verification unavailable. No account or permissions were changed.';\n }finally{button.disabled=false}\n};\n</script>";
exact('</body>',1);
html=html.replace('</body>',authAlignmentScript+'</body>');

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
