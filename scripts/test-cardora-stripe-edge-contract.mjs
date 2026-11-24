#!/usr/bin/env node
// No real Stripe API, Supabase project, or payment is contacted.
// Execute the actual draft handlers against synthetic adapters and real Stripe signature verification.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import Stripe from 'stripe';

const origin='https://cardora-staging-preview.vercel.app';
const seller='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const reservation='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sub='sub_cardora_mock001', customer='cus_cardora_mock001';
const prices={basic:['price_mock_basic',2900],pro:['price_mock_pro',7900],business:['price_mock_business',19900]};
const whsec='whsec_synthetic_never_exported',verifier=new Stripe('sk_test_synthetic_never_sent');
const settings={CARDORA_SITE_ORIGIN:origin,CARDORA_AUTH_MIGRATION_VERIFIED:'true',CARDORA_CHECKOUT_RESERVATION_VERIFIED:'true',
 STRIPE_SECRET_KEY:'sk_test_synthetic_never_sent',STRIPE_WEBHOOK_SECRET:whsec,SUPABASE_URL:'https://invalid.example',
 SUPABASE_ANON_KEY:'synthetic_public',SUPABASE_SERVICE_ROLE_KEY:'synthetic_service',
 STRIPE_PRICE_BASIC:prices.basic[0],STRIPE_PRICE_PRO:prices.pro[0],STRIPE_PRICE_BUSINESS:prices.business[0],
 STRIPE_DB_PLAN_BASIC:'basic',STRIPE_DB_PLAN_PRO:'pro',STRIPE_DB_PLAN_BUSINESS:'business'};
const passes=[];
function setup(path,options={}){
 const env={...settings,...options.env},calls=[],rpcCalls=[];
 class StubStripe {
  static createSubtleCryptoProvider(){return Stripe.createSubtleCryptoProvider()}
  constructor(key){
   assert.match(key,/^sk_test_/);
   this.webhooks=verifier.webhooks;
   this.prices={retrieve:async id=>{
    const found=Object.values(prices).find(p=>p[0]===id);
    assert.ok(found,'unexpected stripe test price');
    return {active:true,livemode:false,currency:'myr',unit_amount:found[1],recurring:{interval:'month',interval_count:1}};
   }};
   this.checkout={sessions:{create:async(body,opts)=>{
    calls.push({body,opts});return {url:'https://checkout.stripe.com/c/pay/cs_test_synthetic'}
   }}};
   this.subscriptions={retrieve:async()=>({id:sub,livemode:false,status:options.subscriptionStatus||'active',customer,
    metadata:{project:'cardora',seller_profile_id:seller,tier:'basic',checkout_request_id:reservation},
    items:{data:[{id:'si_mock1',price:{id:prices.basic[0]}}]}})};
   this.invoices={retrieve:async id=>({id,livemode:false,status:'paid',currency:'myr',amount_paid:2900,collection_method:'charge_automatically',
    parent:{subscription_details:{subscription:sub}}}),
    listLineItems:async()=>({has_more:false,data:[{pricing:{price_details:{price:prices.basic[0]}},
     parent:{subscription_item_details:{subscription:sub,subscription_item:'si_mock1',proration:false}},
     period:{start:1795478400,end:1798070400},currency:'myr',amount:2900}]})};
  }
 }
 const lookups=[];
 const createClient=(url)=>({
  auth:{getUser:async()=>({data:{user:options.sessionInvalid?null:{id:owner,email:'synthetic@example.invalid'}},error:null})},
  from(table){
   const predicates=[];
   const chain={select(){return chain},eq(column,value){predicates.push([column,value]);return chain},async maybeSingle(){
    lookups.push({url,table,predicates});
    if(url!==env.SUPABASE_URL)return {data:null,error:{message:'wrong project'}};
    if(table==='users'){
      // Synthetic fixture implements actual auth_user_id filter rather than
      // returning a row for any query, including cross-project identity.
      if(!predicates.some(([col,id])=>col==='auth_user_id'&&id===owner))
        return {data:null,error:null};
      return {data:options.userMissing?null:{id:owner,status:'active'},error:null};
    }
    if(table==='seller_profiles'){
      if(!predicates.some(([col,id])=>col==='user_id'&&id===owner)||options.sellerMissing)
        return {data:null,error:null};
      return {data:{id:seller,user_id:owner,status:options.unapproved?'pending':'approved',
        verification_status:options.unapproved?'unverified':'verified'},error:null};
    }
    if(table==='cardora_stripe_subscription_links')
      return {data:options.existing?{stripe_subscription_id:sub}:null,error:null};
    throw Error('unexpected table: '+table)
   }};return chain;
  },
  async rpc(name,payload){
   rpcCalls.push({name,payload});
   if(name==='cardora_reserve_stripe_checkout')return {data:reservation,error:null};
   if(['cardora_apply_verified_stripe_event','cardora_record_verified_stripe_risk_event'].includes(name))
     return {data:true,error:null};
   throw Error('unexpected rpc: '+name);
  }
 });
 let code=readFileSync(path,'utf8')
  .replace(/^import Stripe from .*;$/m,'const Stripe=globalThis.__stripe;')
  .replace(/^import \{ createClient \} from .*;$/m,'const createClient=globalThis.__supabase;');
 code=stripTypeScriptTypes(code,{mode:'strip'});
 let handler;
 runInNewContext(code,{Deno:{env:{get:k=>env[k]},serve:f=>{handler=f}},Request,Response,URL,Headers,
  __stripe:StubStripe,__supabase:createClient,console:{error(){},log(){}}});
 assert.equal(typeof handler,'function');
 return {handler,calls,rpcCalls,lookups};
}
const checkoutFile='supabase/functions/cardora-stripe-checkout/index.ts';
async function checkout(tier,opts={}){
 const test=setup(checkoutFile,opts);
 const res=await test.handler(new Request(origin+'/functions',{method:'POST',
  headers:{Origin:origin,Authorization:'Bearer synthetic', 'content-type':'application/json'},body:JSON.stringify({tier})}));
 return {status:res.status,body:await res.json(),...test};
}
for(const [tier,config] of Object.entries(prices)){
 const x=await checkout(tier);assert.equal(x.status,200,JSON.stringify(x.body));
 assert.equal(x.body.environment,'sandbox');
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].body.line_items[0].price,config[0]);
 assert.equal(x.calls[0].body.client_reference_id,seller);
 assert.equal(x.calls[0].body.subscription_data.metadata.checkout_request_id,reservation);
 assert.equal(x.calls[0].opts.idempotencyKey,'cardora_checkout_'+reservation);
 assert.equal(x.lookups.length,3);
 assert.deepEqual(x.lookups.map(q=>q.table),['users','seller_profiles','cardora_stripe_subscription_links']);
 assert.ok(x.lookups.every(q=>q.url===settings.SUPABASE_URL));
 assert.equal(x.lookups[0].predicates.find(([k])=>k==='auth_user_id')?.[1],owner);
 assert.equal(x.lookups[1].predicates.find(([k])=>k==='user_id')?.[1],owner);
 assert.equal(x.lookups[2].predicates.find(([k])=>k==='seller_profile_id')?.[1],seller);
 passes.push('Checkout '+tier+' RM'+config[1]/100);
}
for(const [label,opts,status] of [
 ['Auth gate',{env:{CARDORA_AUTH_MIGRATION_VERIFIED:'false'}},503],
 ['reservation gate',{env:{CARDORA_CHECKOUT_RESERVATION_VERIFIED:'false'}},503],
 ['Live key rejection',{env:{STRIPE_SECRET_KEY:'sk_live_fake'}},503],
 ['seller approval',{unapproved:true},403],
 ['existing subscription',{existing:true},409],
 ['missing account',{userMissing:true},403],
 ['missing linked seller',{sellerMissing:true},403],
 ['invalid session',{sessionInvalid:true},401],
 ['production origin',{env:{CARDORA_SITE_ORIGIN:'https://cardora-rose.vercel.app'}},503]]){
 const x=await checkout('basic',opts);assert.equal(x.status,status,label+' '+JSON.stringify(x.body));
 assert.equal(x.calls.length,0);passes.push(label);
}
const webhookFile='supabase/functions/cardora-stripe-webhook/index.ts';
async function webhook(type,object,opts={}){
 const test=setup(webhookFile,opts);
 const payload=JSON.stringify({id:'evt_synthetic1',type,livemode:false,created:1795478400,data:{object}});
 const signature=verifier.webhooks.generateTestHeaderString({payload,secret:whsec});
 const res=await test.handler(new Request(origin+'/webhook',{method:'POST',body:payload,
  headers:{'stripe-signature':opts.badSignature?'t=1,v1=bad':signature}}));
 return {status:res.status,body:await res.json(),...test};
}
{
 const x=await webhook('checkout.session.completed',{mode:'subscription',payment_status:'paid',subscription:sub});
 assert.equal(x.status,200);assert.equal(x.body.awaiting_invoice,true);assert.equal(x.rpcCalls.length,0);
 passes.push('Checkout redirect never grants membership');
}
{
 const invoice={id:'in_synthetic1',parent:{subscription_details:{subscription:sub}}};
 const x=await webhook('invoice.paid',invoice);
 assert.equal(x.status,200,JSON.stringify(x.body));
 assert.equal(x.rpcCalls.length,1);
 assert.equal(x.rpcCalls[0].name,'cardora_apply_verified_stripe_event');
 assert.equal(x.rpcCalls[0].payload.p_kind,'paid');
 assert.equal(x.rpcCalls[0].payload.p_seller_profile_id,seller);
 assert.equal(x.rpcCalls[0].payload.p_checkout_request_id,reservation);
 passes.push('Signed invoice.paid produces verified membership RPC');
 const bad=await webhook('invoice.paid',invoice,{badSignature:true});
 assert.equal(bad.status,400);assert.equal(bad.rpcCalls.length,0);
 passes.push('Invalid Stripe signature rejected');
}
{
 const x=await webhook('invoice.payment_failed',{id:'in_failed',subscription:sub},{subscriptionStatus:'active'});
 assert.equal(x.status,200);assert.equal(x.body.ignored_stale_failure,true);assert.equal(x.rpcCalls.length,0);
 passes.push('Stale payment failure ignored');
}
{
 const x=await webhook('customer.subscription.deleted',{id:sub},{subscriptionStatus:'canceled'});
 assert.equal(x.status,200);assert.equal(x.rpcCalls[0].payload.p_kind,'canceled');
 passes.push('Signed cancellation routes to database');
 const stale=await webhook('customer.subscription.deleted',{id:sub},{subscriptionStatus:'active'});
 assert.equal(stale.status,200);assert.equal(stale.body.ignored_stale_deletion,true);
 passes.push('Stale cancellation ignored');
}
{
 const x=await webhook('invoice.paid',{id:'in_mock',subscription:sub},{env:{CARDORA_AUTH_MIGRATION_VERIFIED:'false'}});
 assert.equal(x.status,503);assert.equal(x.rpcCalls.length,0);
 passes.push('Webhook Auth gate remains closed');
}
console.log('PASS '+passes.length+' Edge Function contract scenarios; mocked Stripe API, real SDK signature verification, no network or charges');
for(const item of passes)console.log('PASS '+item);
