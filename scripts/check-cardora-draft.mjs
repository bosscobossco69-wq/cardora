#!/usr/bin/env node
// Cardora draft-only offline verification. Never connects to Supabase or Stripe.
// Run: node scripts/check-cardora-draft.mjs
import { readFileSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const repo=resolve('.');
const read=(path)=>readFileSync(resolve(path),'utf8');
const html=read('index.html');
const build=read('scripts/build-cardora-staging.mjs');
const queue=read('supabase/migrations/DRAFT_cardora_admin_seller_queue.sql');
const admin=read('supabase/migrations/DRAFT_cardora_auth_is_admin_compat.sql');
const checkout=read('supabase/functions/cardora-stripe-checkout/index.ts');
const webhook=read('supabase/functions/cardora-stripe-webhook/index.ts');
const portal=read('supabase/functions/cardora-stripe-portal/index.ts');
const overview=read('supabase/functions/cardora-admin-overview/index.ts');
const stripeSql=read('supabase/migrations/DRAFT_cardora_stripe_subscription_schema.sql');
const statusGuardSql=read('supabase/drafts/CARDORA_DRAFT_admin_active_status_guard.sql');
const privacyPolicy=read('privacy.html');
const sellerTerms=read('terms.html');
const approvedPlans=['basic','pro','business'];

const must=(condition,message)=>assert.ok(condition,message);
must(privacyPolicy.includes('DRAFT') && privacyPolicy.includes('nkj30733838@gmail.com'),
  'Privacy draft must be clearly marked and include current support contact');
must(sellerTerms.includes('DRAFT') && sellerTerms.includes('automatically'),
  'Recurring terms draft must disclose renewal and remain unpublished until reviewed');
must(sellerTerms.includes('MYR 29/month') && sellerTerms.includes('MYR 79/month')
  && sellerTerms.includes('MYR 199/month'),'Seller subscription monthly prices missing');
must(html.includes("storageKey:'cardora-supabase-auth-v1'"),'Legacy auth key drift');
// The new landing is informational until the actual subscription backend is verified.
must(html.includes('id="cardoraPremiumLanding"') &&
     html.includes('id="cardoraMembershipPreview"'),
  'Premium homepage or pricing section missing');
must(html.includes("onclick=\"ptxOpenAuth('register')\"") &&
     html.includes("onclick=\"ptxOpenAuth('login')\""),
  'Prominent registration/login controls not wired to existing auth UI');
must(html.includes('RM29') && html.includes('RM79') && html.includes('RM199'),
  'Preview membership prices missing');
must((html.match(/class="cp-locked" disabled aria-disabled="true"/g)||[]).length===3,
  'Unverified checkout buttons must remain disabled in all three plan cards');
must(html.includes('Create account with Google') &&
     html.includes('Email-code sign-up is not enabled yet.') &&
     html.includes('New to Cardora?'),
  'Cardora guest registration must disclose currently supported Google-only auth');
must(html.includes('href="terms.html" target="_blank" rel="noopener noreferrer"') &&
     html.includes('href="privacy.html" target="_blank" rel="noopener noreferrer"'),
  'Auth modal must link draft legal documents safely');
must((html.match(/data-ca-email-auth="off"/g)||[]).length===2,
  'Unverified email OTP UI must remain hidden in both sign-in and sign-up');
must(html.includes('id="cardoraPremiumMobileNavigationOverride"') &&
     html.includes('font-size:12px!important;width:auto!important') &&
     html.includes('button#ptxHeaderAuthButton'),
  'Mobile nav must override legacy zero-size labels for sign up, login and plans');
must(!html.includes('data-cardora-sandbox-tier='),
  'Live homepage must not expose sandbox purchase controls');

must(html.includes("rpc('current_user_row_id')") && html.includes('user_id:profileId'),'Form owner binding missing');
must(queue.includes("u.role='admin' and u.status='active'"),'Admin queue authority missing');
must(queue.includes("limit least(greatest(coalesce(p_limit,100),1),100)"),'Admin queue limit missing');
must(admin.includes("u.role = 'admin'") && admin.includes("u.status = 'active'"),'Admin check missing');
must(checkout.includes('CARDORA_CHECKOUT_RESERVATION_VERIFIED'),'Checkout safety gate absent');

must(checkout.includes('service.from("seller_subscriptions")') &&
     checkout.includes('.eq("seller_profile_id",seller.id)') &&
     checkout.includes('.eq("is_current",true).limit(2)') &&
     checkout.includes('MEMBERSHIP_STATE_UNAVAILABLE') &&
     checkout.includes('EXISTING_CARDORA_MEMBERSHIP_REQUIRES_RECONCILIATION'),
  'Checkout must refuse any existing current Cardora membership before taking another Stripe payment');
must(checkout.indexOf('service.from("seller_subscriptions")') <
     checkout.indexOf('stripe.checkout.sessions.create('),
  'Legacy membership reconciliation check must precede Stripe Checkout creation');


// Cross-project identity isolation: the legacy page must never be treated as
// entitlement proof in Cardora billing. The staging build must explicitly
// replace the old project and require a Cardora Auth owner identity.
must(html.includes('https://crqqockaetgacddxkqpb.supabase.co'),
  'Legacy public auth URL unexpectedly changed; migration requires a reviewed cutover');
must(build.includes('https://fdkfquvzbswxocyrhduk.supabase.co') &&
     build.includes('if(html.includes(oldProject)) fail('),
  'Staging must use canonical Cardora Auth and fail if legacy project remains');
must(build.includes("window.cardoraCheckAuthAlignment=async function()") &&
     build.includes("client.auth.getUser()") &&
     build.includes(".eq('auth_user_id',identity.user.id).maybeSingle()") &&
     build.includes(".eq('user_id',profile.id).limit(2)"),
  'Read-only Cardora user → seller profile alignment diagnostic missing');
must(build.includes("sessionData.user.is_anonymous") &&
     build.includes("Multiple seller profiles found. Manual review required.") &&
     build.includes("More than one visible seller profile is linked.") &&
     build.includes("s.verification_status==='verified'"),
  'Staging diagnostics must not approve anonymous, duplicate or unverified seller accounts');

must(checkout.includes('client.auth.getUser()') &&
     checkout.includes('.eq("auth_user_id",user.id).maybeSingle()') &&
     checkout.includes('.eq("user_id",appUser.id).maybeSingle()') &&
     checkout.includes('seller.status !== "approved" || seller.verification_status !== "verified"'),
  'Checkout must derive approved seller from server-verified Cardora Auth, never client-provided user identifiers');
must(checkout.includes('CARDORA_AUTH_MIGRATION_VERIFIED') &&
     webhook.includes('CARDORA_AUTH_MIGRATION_VERIFIED'),
  'Checkout and webhook must stay closed until same-project Auth migration is verified');


// Offline-check the actual checkout origin parser (not a duplicated approximation).
// This executes only a pure config function with a stubbed Deno.env, no network.
const originStart=checkout.indexOf('const configuredOrigin =');
const originEnd=checkout.indexOf('const json =',originStart);
must(originStart>=0 && originEnd>originStart,'Sandbox origin parser missing');
const originSource=checkout.slice(originStart,originEnd)
  .replace('const getStagingOrigin = (): string | null => {','const getStagingOrigin = () => {');
const testOrigin=(value)=>runInNewContext(originSource+'; origin;',{
  Deno:{env:{get:(name)=>name==='CARDORA_SITE_ORIGIN'?value:null}},
  URL
});
for(const [originValue,expected] of [
  ['',null],
  ['https://cardora-rose.vercel.app',null],
  ['https://cardora-pokemon-treasure.vercel.app',null],
  ['https://cardora-git-main-pokemon-treasure.vercel.app',null],
  ['https://cardora-preview-123.vercel.app','https://cardora-preview-123.vercel.app'],
  ['https://cardora-preview.pages.dev','https://cardora-preview.pages.dev'],
  ['http://cardora-preview-123.vercel.app',null],
  ['https://attacker.example.com',null],
  ['https://cardora-preview-123.vercel.app/path',null],
  ['https://cardora-preview-123.vercel.app/?token=1',null],
  ['https://username:password@cardora-preview-123.vercel.app',null]
]) assert.equal(testOrigin(originValue),expected,'Invalid origin acceptance: '+originValue);
must(checkout.includes('"access-control-allow-origin": origin || ""'),
  'Checkout CORS origin must not be nullable');

const portalOriginStart=portal.indexOf('const configuredOrigin =');
const portalOriginEnd=portal.indexOf('const respond =',portalOriginStart);
must(portalOriginStart>=0 && portalOriginEnd>portalOriginStart,'Portal origin parser missing');
const portalOriginSource=portal.slice(portalOriginStart,portalOriginEnd)
  .replace('const getStagingOrigin = (): string | null => {','const getStagingOrigin = () => {');
const testPortalOrigin=(value)=>runInNewContext(portalOriginSource+'; origin;',{
  Deno:{env:{get:(name)=>name==='CARDORA_SITE_ORIGIN'?value:null}},URL
});
for(const [originValue,expected] of [
  ['',null],
  ['https://cardora-rose.vercel.app',null],
  ['https://cardora-pokemon-treasure.vercel.app',null],
  ['https://cardora-git-main-pokemon-treasure.vercel.app',null],
  ['https://cardora-preview-123.vercel.app','https://cardora-preview-123.vercel.app'],
  ['https://cardora-preview.pages.dev','https://cardora-preview.pages.dev'],
  ['http://cardora-preview-123.vercel.app',null],
  ['https://attacker.example.com',null],
  ['https://cardora-preview-123.vercel.app/path',null],
  ['https://cardora-preview-123.vercel.app/?token=1',null],
  ['https://username:password@cardora-preview-123.vercel.app',null]
]) assert.equal(testPortalOrigin(originValue),expected,'Invalid portal origin: '+originValue);
must(portal.includes('STAGING_ORIGIN_NOT_CONFIGURED'),'Portal staging origin safeguard missing');


must(checkout.includes('CARDORA_AUTH_MIGRATION_VERIFIED'),'Checkout Auth safety gate absent');
must(checkout.includes('!secret.startsWith("sk_test_")'),'Checkout must stay Sandbox-only');
must(webhook.includes('!key.startsWith("sk_test_")'),'Webhook must stay Sandbox-only');
must(webhook.includes('constructEventAsync'),'Webhook signature validation absent');
for(const functionName of ['admin_get_listing_review_queue','admin_review_listing','admin_review_seller_application']){
  must(statusGuardSql.includes('CREATE OR REPLACE FUNCTION public.'+functionName),
    'Active-admin patch missing '+functionName);
}
for(const functionName of ['admin_get_listing_review_queue','admin_review_listing','admin_review_seller_application']){
  const body=statusGuardSql.split('CREATE OR REPLACE FUNCTION public.'+functionName+'(')[1]?.split('$function$;')[0]||'';
  must(/u\.auth_user_id\s*=\s*auth\.uid\(\)\s+and u\.role\s*=\s*'admin'\s+and u\.status='active'/.test(body),
    'Active admin identity check missing in '+functionName);
}
for(const guard of ["ACTIVE_LINKED_MEMBER_REQUIRED","SELLER_REACTIVATION_REQUIRES_REVIEW","AGENT_REACTIVATION_REQUIRES_REVIEW","where public.seller_profiles.status='approved'","and public.agent_profiles.status = 'active'"]){
  must(statusGuardSql.includes(guard),'Seller approval safeguard missing: '+guard);
}
must(statusGuardSql.includes('limit least(greatest(coalesce(p_limit,50),1),100)'),
  'Listing moderation queue should cap untrusted limit arguments');
must(overview.includes('CARDORA_ADMIN_OVERVIEW_VERIFIED'),'Admin overview verification gate missing');
must(overview.includes('CARDORA_AUTH_MIGRATION_VERIFIED'),'Admin overview auth gate missing');
must(overview.includes('authClient.auth.getUser()'),'Admin overview must verify JWT');
must(overview.includes('admin.role!=="admin"'),'Admin overview role gate missing');
must(overview.includes('admin.status!=="active"'),'Admin overview active gate missing');
must(overview.includes('legacy_project_included:false'),'Admin overview must not combine old data silently');
must(overview.includes('CARDORA_LEGACY_READ_SERVICE_KEY'),'Legacy credentials must remain on the server');
must(overview.includes('CARDORA_STAGING_SITE_ORIGIN'),'Preview origin configuration absent');
must(overview.includes('safeOrigins.has(origin)'),'Admin CORS allowlist guard missing');
must(!overview.includes('"access-control-allow-origin":"*"'),'Wildcard cross-origin access forbidden');

must(overview.includes('legacy_history:legacyHistory'),'Archived applications not separately returned');
must(overview.includes('suspected_test:classify(a)'),'Test-like applications must be marked for review');
must(overview.includes('available:false'),'Legacy outage must not look like an empty database');
must(overview.includes('source:"legacy"'),'Legacy source label absent');

must(overview.includes('eq("auth_user_id",authUser.id)'),'Admin overview identity matching missing');
must(portal.includes('CARDORA_PORTAL_VERIFIED'),'Portal failsafe verification gate missing');
must(portal.includes('CARDORA_AUTH_MIGRATION_VERIFIED'),'Portal migration gate missing');
must(portal.includes('!secret.startsWith("sk_test_")'),'Portal must remain Sandbox-only');
must(portal.includes('auth.auth.getUser()'),'Portal caller JWT verification missing');
must(portal.includes('eq("auth_user_id",user.id)'),'Portal owner account lookup missing');
must(portal.includes('eq("seller_profile_id",seller.id)'),'Portal billing-link lookup missing');
must(portal.includes('actualCustomer!==customerId'),'Stripe Customer/Subscription relationship not verified');
must(portal.includes('subscription.metadata?.seller_profile_id!==seller.id'),'Stripe seller ownership not checked');
must(portal.includes('return_url:origin+"/"'),'Portal must use server-owned return URL');
must(webhook.includes('stripe.invoices.listLineItems'),'Paid invoice period guard absent');
must(webhook.includes('p_checkout_request_id:validReservationId?checkoutRequestId:null'),'Webhook reservation mapping absent');
must(webhook.includes('p_event_created:event.created'),'Webhook event time missing');
must(stripeSql.includes('r.request_id=p_checkout_request_id'),'SQL reservation ID matching absent');
must(stripeSql.includes('p_event_created bigint'),'SQL event watermark missing');
must(stripeSql.includes('cardora_stripe_risk_review_events'),'Risk review table absent');
// The first draft contained repeated functions and malformed concatenation.
// Enforce exactly one definition and balanced named PL/pgSQL delimiters.
const once=(text,needle,label)=>{
  const n=text.split(needle).length-1;
  assert.equal(n,1,label+' must have exactly one definition, found '+n);
};
for(const [definition,label] of [
 ['create or replace function public.cardora_apply_verified_stripe_event','event application'],
 ['create or replace function public.cardora_reserve_stripe_checkout','reservation'],
 ['create or replace function public.cardora_record_verified_stripe_risk_event','risk event'],
 ['create table if not exists public.cardora_stripe_risk_review_events','risk table'],
 ['create table if not exists public.cardora_stripe_event_receipts','receipt table'],
 ['create table if not exists public.cardora_stripe_subscription_links','subscription links'],
 ['create table if not exists public.cardora_stripe_checkout_reservations','reservation table']
]) once(stripeSql,definition,label);
// Named PostgreSQL string delimiters must appear in matching pairs.
// Assemble tokens without literal dollar signs to avoid source transport bugs.
const dollar=String.fromCharCode(36);
for(const name of ['cardora_reservation','cardora_risk','cardora_event']){
  const token=dollar+name+dollar;
  assert.equal(stripeSql.split(token).length-1,2,'Unbalanced SQL delimiter '+name);
}
must(!stripeSql.includes('end; '+dollar+dollar+';'),
  'SQL draft uses older unchecked function delimiters');
must(stripeSql.includes('v_link.stripe_customer_id<>p_stripe_customer_id'),
  'Event must reject wrong Stripe customer');
must(stripeSql.includes('v_link.plan_code<>p_plan_code'),
  'Event must reject different subscription plan');
must(stripeSql.includes('p_period_end<v_sub_period_end') &&
     stripeSql.includes("p_period_end=v_sub_period_end and v_sub_status='active'"),
  'Historical payments must not shorten periods; equal-period payments can restore past_due memberships');
must(stripeSql.includes('current_review_mode=case when v_plan.review_mode'),
  'New paid subscription must derive review mode from plan');
for(const tier of approvedPlans) must(checkout.includes(tier) && webhook.includes(tier),'Tier missing: '+tier);

const testdir=mkdtempSync(join(tmpdir(),'cardora-draft-check-'));
try{
  cpSync(resolve(repo,'index.html'),join(testdir,'index.html'));
  cpSync(resolve(repo,'scripts/build-cardora-staging.mjs'),join(testdir,'build.mjs'));
  const run=(env)=>spawnSync(process.execPath,['build.mjs'],{
    cwd:testdir,env:{...process.env,...env},encoding:'utf8',timeout:15000
  });
  const disabled=run({CARDORA_STAGING_BUILD:'NO'});
  assert.notEqual(disabled.status,0,'Build must refuse no explicit opt-in');
  const mock={
    CARDORA_STAGING_BUILD:'YES',
    CARDORA_STAGING_SUPABASE_URL:'https://fdkfquvzbswxocyrhduk.supabase.co',
    CARDORA_STAGING_SUPABASE_ANON_KEY:'sb_publishable_cardora_offline_mock_only'
  };
  const valid=run(mock);
  assert.equal(valid.status,0,'Offline build failed: '+valid.stderr);
  const output=readFileSync(join(testdir,'dist-staging/index.html'),'utf8');
  must(output.includes('admin_get_seller_application_queue'),'Admin queue adapter absent');
  must(output.includes('admin_review_seller_application'),'Admin review adapter absent');
  must(output.includes('id="cardoraManageSandboxMembership"'),'Preview account membership button missing');

  for(const [tier,amount] of [['basic','RM29'],['pro','RM79'],['business','RM199']]){
    must(output.includes('data-cardora-sandbox-tier="'+tier+'"'),'Sandbox '+tier+' checkout button missing');
    must(output.includes('Test '+tier[0].toUpperCase()+tier.slice(1)+' '+amount),
      'Displayed sandbox '+tier+' price missing');
  }
  must(output.includes("client.functions.invoke('cardora-stripe-checkout'"),
    'Sandbox checkout invoke missing from staging');
  must(output.includes("destination.hostname!=='checkout.stripe.com'"),
    'Sandbox checkout redirects must validate Stripe hostname');
  must(output.includes("result.data?.environment!=='sandbox'"),
    'Staging must reject non-sandbox Checkout responses');
  must(output.includes("session.user?.id!==identity.user.id"),
    'Staging Checkout must require an authenticated Cardora owner session');
  must(!html.includes('data-cardora-sandbox-tier'),
    'Sandbox checkout controls leaked into live index.html');

  must(output.includes("client.functions.invoke('cardora-admin-overview'"),'Staging admin overview missing');
  must(output.includes('Archived applications — OLD database'),'Old application archive tab absent');
  must(output.includes('Possible TEST data — verify manually'),'Test flag presentation absent');
  must(output.includes('Legacy archive unavailable / not configured'),'Missing legacy data not shown as zero');
  must(!output.includes('CARDORA_LEGACY_READ_SERVICE_KEY'),'Legacy secret variable leaked into browser output');

  must(output.includes("id='cardoraAdminOverview'"),'Read-only overview mount missing');
  must(output.includes("apps.id='ptxIpAdminApplications'"),'Original application queue must remain visible');
  must(output.includes('if(window.ptxLoadAdminApplications)window.ptxLoadAdminApplications()'),'Application review loader lost');
  must(!html.includes('cardoraAdminOverview'),'Admin preview leaked into production source');
  must(output.includes("client.functions.invoke('cardora-stripe-portal'"),'Authenticated portal invocation missing');
  must(output.includes('if(result.error || !session?.access_token)'),'Portal session token check missing');
  must(output.includes("portalUrl.startsWith('https://billing.stripe.com/')"),'Portal destination guard missing');
  must(!html.includes('cardoraManageSandboxMembership'),'Membership preview leaked into committed production HTML');
  must(output.includes("s==='pending'?' disabled':''"),'Invalid pending status choice is enabled');
  must(output.includes("storageKey:'cardora-supabase-auth-v2-staging'"),'Auth storage isolation absent');
  must(!output.includes('crqqockaetgacddxkqpb'),'Old project left in staging output');
  must(output.includes(mock.CARDORA_STAGING_SUPABASE_ANON_KEY),'Mock public key not used');
  must(!output.includes('service_role') || !output.includes('sk_test_'),'A secret placeholder leaked into HTML');
  const refused=run({...mock,CARDORA_STAGING_SUPABASE_ANON_KEY:'sb_secret_forbidden'});
  assert.notEqual(refused.status,0,'Secret key must be rejected');
  console.log('PASS: offline staging build + admin RPC + Stripe guard checks; NO network or deployment.');
}finally{rmSync(testdir,{recursive:true,force:true});}
