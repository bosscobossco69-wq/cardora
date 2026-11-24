#!/usr/bin/env node
// Real draft worker executed against synthetic Cardora Auth, DB and Resend adapters.
// No Stripe account, Supabase project, email recipient or network connection is used.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/cardora-payment-email-worker/index.ts','utf8'),{mode:'strip'})
  .replace(/^import \{createClient\} from .*;$/m,'const createClient=globalThis.__supabase;');
const token='synthetic-secret-of-at-least-32-characters-12345';
const env={
 CARDORA_PAYMENT_EMAIL_WORKER_VERIFIED:'true',CARDORA_AUTH_MIGRATION_VERIFIED:'true',
 CARDORA_PAYMENT_EMAIL_QUEUE_VERIFIED:'true',CARDORA_EMAIL_WORKER_TOKEN:token,
 SUPABASE_URL:'https://fake-cardora.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake_service',
 RESEND_API_KEY:'re_synthetic',CARDORA_FROM_EMAIL:'no-reply@example.invalid',
 CARDORA_ADMIN_EMAIL:'support@example.invalid'
};
const fixture=()=>({
 stripe_invoice_id:'in_synthetic001',
 seller_profile_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 stripe_subscription_id:'sub_synthetic001',
 plan_code:'basic',period_end:'2027-01-24T00:00:00.000Z'
});
async function run(opts={}){
 const state={outbox:opts.empty?null:{...fixture(),status:'pending'},requests:[],queries:[],updates:[]};
 const overrides={...env,...opts.env};
 let handler;
 const db={
  auth:{admin:{getUserById:async id=>{
   state.queries.push({kind:'auth',id});
   return {data:{user:{id,email:opts.invalidEmail?'invalid':'customer@example.invalid'}},error:null};
  }}},
  from(table){
   const filters=[],values={};let operation='select';
   const chain={
    select(){return chain},
    eq(col,value){filters.push([col,value]);return chain},
    order(){return chain},limit(){return chain},
    update(payload){operation='update';Object.assign(values,payload);return chain},
    // Supabase PostgREST updates are thenable even without .select()/.maybeSingle().
    // Model the final 'sent' update rather than silently skipping it.
    then(resolve,reject){
      if(operation!=='update')return Promise.resolve({data:null,error:null}).then(resolve,reject);
      state.updates.push({filters,values:{...values}});
      if(!state.outbox||filters.some(([k,v])=>state.outbox[k]!==v))
        return Promise.resolve({data:null,error:null}).then(resolve,reject);
      Object.assign(state.outbox,values);
      return Promise.resolve({data:null,error:null}).then(resolve,reject);
    },
    async maybeSingle(){
     state.queries.push({table,filters,operation});
     if(table==='cardora_payment_email_outbox'){
      if(operation==='update'){
       state.updates.push({filters,values});
       if(opts.claimMiss&&values.status==='sending')return {data:null,error:null};
       if(!state.outbox||filters.some(([k,v])=>state.outbox[k]!==v))return {data:null,error:null};
       Object.assign(state.outbox,values);return {data:{stripe_invoice_id:state.outbox.stripe_invoice_id},error:null};
      }
      return {data:state.outbox?.status==='pending'?{...state.outbox}:null,error:null};
     }
     if(table==='cardora_stripe_subscription_links'){
      return {data:{stripe_subscription_id:opts.wrongLink?'sub_other':fixture().stripe_subscription_id,
        plan_code:fixture().plan_code},error:null};
     }
     if(table==='seller_subscriptions'){
      return {data:{status:opts.cancelled?'cancelled':'active',plan_code:fixture().plan_code,
        current_period_ends_at:fixture().period_end},error:null};
     }
     if(table==='seller_profiles'){
      if(!filters.some(([column,id])=>column==='id'&&id===fixture().seller_profile_id))
        return {data:null,error:null};
      return {data:{user_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},error:null};
     }
     if(table==='users'){
      if(!filters.some(([column,id])=>column==='id'&&id==='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'))
        return {data:null,error:null};
      return {data:{auth_user_id:opts.missingAuth?null:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',status:opts.inactiveAccount?'disabled':'active'},error:null};
     }
     throw Error('Unexpected query '+table);
    }
   };return chain;
  }
 };
 const fetch=async(url,request)=>{
  state.requests.push({url,request});
  return opts.resendFailure?
    new Response('synthetic error',{status:503}):
    new Response(JSON.stringify({id:'email_synthetic001'}),{status:200});
 };
 runInNewContext(source,{Deno:{env:{get:k=>overrides[k]},serve:fn=>handler=fn},
  Request,Response,Headers,TextEncoder,Date,console:{error(){}},fetch,
  __supabase:(url,key)=>{assert.equal(url,env.SUPABASE_URL);assert.equal(key,env.SUPABASE_SERVICE_ROLE_KEY);return db;}});
 assert.equal(typeof handler,'function');
 const res=await handler(new Request('https://fake-cardora.invalid/worker',{
  method:'POST',headers:{'x-cardora-worker-token':opts.token||token}
 }));
 return {...state,status:res.status,body:await res.json()};
}
let cases=0;
const test=async(name,opts,status,code,count)=>{
 const v=await run(opts);assert.equal(v.status,status,name+' '+JSON.stringify(v.body));
 if(code)assert.equal(v.body.error,code,name);
 assert.equal(v.requests.length,count,name);
 cases++;console.log('PASS '+name);return v;
};
await test('disabled gate',{env:{CARDORA_PAYMENT_EMAIL_WORKER_VERIFIED:'false'}},503,'EMAIL_WORKER_DISABLED',0);
await test('no Auth alignment',{env:{CARDORA_AUTH_MIGRATION_VERIFIED:'false'}},503,'EMAIL_WORKER_DISABLED',0);
await test('wrong authorization',{token:'x'.repeat(token.length)},401,'UNAUTHORIZED',0);
await test('empty queue',{empty:true},200,null,0);
await test('competing worker already claimed invoice',{claimMiss:true},200,null,0);
await test('wrong seller subscription link',{wrongLink:true},409,'MEMBERSHIP_NO_LONGER_VERIFIED',0);
await test('canceled membership rejected',{cancelled:true},409,'MEMBERSHIP_NO_LONGER_VERIFIED',0);
await test('missing Auth identifier rejected',{missingAuth:true},409,'CUSTOMER_IDENTITY_UNVERIFIED',0);
await test('inactive Cardora account rejected',{inactiveAccount:true},409,'CUSTOMER_IDENTITY_UNVERIFIED',0);
await test('unusable recipient email rejected',{invalidEmail:true},409,'CUSTOMER_EMAIL_UNVERIFIED',0);
const good=await test('verified buyer gets one email',{ },200,null,1);
assert.equal(good.body.processed,1);
assert.equal(good.outbox.status,'sent');
assert.equal(good.outbox.resend_message_id,'email_synthetic001');
assert.deepEqual(JSON.parse(good.requests[0].request.body).to,['customer@example.invalid']);
assert.equal(good.requests[0].request.headers['Idempotency-Key'],'cardora-paid-in_synthetic001');
assert.deepEqual(good.queries.filter(q=>q.kind==='auth').map(q=>q.id),
 ['cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
assert.equal(good.requests[0].url,'https://api.resend.com/emails');
const sellerLookup=good.queries.find(q=>q.table==='seller_profiles');
const appUserLookup=good.queries.find(q=>q.table==='users');
assert.ok(sellerLookup.filters.some(([key,value])=>key==='id'&&value===fixture().seller_profile_id));
assert.ok(appUserLookup.filters.some(([key,value])=>key==='id'&&value==='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
console.log('PASS seller -> business user -> Auth user ownership chain');
cases++;console.log('PASS verified Auth email (never client-supplied) and idempotency');
const fail=await test('Resend rejects API request',{resendFailure:true},502,'EMAIL_PROVIDER_NOT_CONFIRMED',1);
assert.equal(fail.outbox.status,'sending'); // Stop automatic retry until manual reconciliation
cases++;console.log('PASS failed acknowledgment requires manual review, no automatic duplicate');
console.log('PASS '+cases+' payment email worker scenarios; all local fixtures, zero real messages');
