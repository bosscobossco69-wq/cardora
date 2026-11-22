#!/usr/bin/env node
// Cardora draft-only offline verification. Never connects to Supabase or Stripe.
// Run: node scripts/check-cardora-draft.mjs
import { readFileSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo=resolve('.');
const read=(path)=>readFileSync(resolve(path),'utf8');
const html=read('index.html');
const build=read('scripts/build-cardora-staging.mjs');
const queue=read('supabase/migrations/DRAFT_cardora_admin_seller_queue.sql');
const admin=read('supabase/migrations/DRAFT_cardora_auth_is_admin_compat.sql');
const checkout=read('supabase/functions/cardora-stripe-checkout/index.ts');
const webhook=read('supabase/functions/cardora-stripe-webhook/index.ts');
const portal=read('supabase/functions/cardora-stripe-portal/index.ts');
const stripeSql=read('supabase/migrations/DRAFT_cardora_stripe_subscription_schema.sql');
const approvedPlans=['basic','pro','business'];

const must=(condition,message)=>assert.ok(condition,message);
must(html.includes("storageKey:'cardora-supabase-auth-v1'"),'Legacy auth key drift');
must(html.includes("rpc('current_user_row_id')") && html.includes('user_id:profileId'),'Form owner binding missing');
must(queue.includes("u.role='admin' and u.status='active'"),'Admin queue authority missing');
must(queue.includes("limit least(greatest(coalesce(p_limit,100),1),100)"),'Admin queue limit missing');
must(admin.includes("u.role = 'admin'") && admin.includes("u.status = 'active'"),'Admin check missing');
must(checkout.includes('CARDORA_CHECKOUT_RESERVATION_VERIFIED'),'Checkout safety gate absent');
must(checkout.includes('CARDORA_AUTH_MIGRATION_VERIFIED'),'Checkout Auth safety gate absent');
must(checkout.includes('!secret.startsWith("sk_test_")'),'Checkout must stay Sandbox-only');
must(webhook.includes('!key.startsWith("sk_test_")'),'Webhook must stay Sandbox-only');
must(webhook.includes('constructEventAsync'),'Webhook signature validation absent');
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
