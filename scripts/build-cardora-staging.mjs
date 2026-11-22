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
 line('p','New Cardora database only. Legacy registrations and applications are NOT included.');
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
   line('h3','Recent applications (up to 50)');
   for(const a of (response.data.applications||[])){
     const div=document.createElement('div');div.className='ptx-ip-card';root.appendChild(div);
     line('strong',(a.name||'Applicant')+' · '+(a.role||'unknown'),div);
     line('p',(a.status||'unknown')+' · '+(a.created_at||''),div);
     line('p',a.email||'',div);
   }
   const refresh=document.createElement('button');refresh.type='button';refresh.className='ptx-btn';
   refresh.textContent='Refresh overview';refresh.onclick=window.cardoraLoadAdminOverview;
   root.appendChild(refresh);
 } catch(e){state.textContent='Admin overview unavailable. No data was changed.'}
};
</script>`;
exact('</body>',1);
html=html.replace('</body>',adminOverviewScript+'\n</body>');
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
