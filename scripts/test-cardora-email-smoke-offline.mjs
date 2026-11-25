#!/usr/bin/env node
// Offline, no network: run the actual disabled-by-default Cardora Resend test endpoint.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const source=stripTypeScriptTypes(readFileSync('supabase/functions/cardora-email-smoke/index.ts','utf8'),{mode:'strip'});
const token='synthetic-token-that-is-at-least-thirty-two-bytes-long';
const base={
 CARDORA_EMAIL_SMOKE_ENABLED:'true',CARDORA_AUTH_MIGRATION_VERIFIED:'true',
 CARDORA_EMAIL_TEST_TOKEN:token,RESEND_API_KEY:'re_synthetic_only_not_real',
 CARDORA_FROM_EMAIL:'cardora@example.invalid',CARDORA_ADMIN_EMAIL:'admin@example.invalid'
};
async function invoke(overrides={},opts={}){
 const env={...base,...overrides},outgoing=[];let handler;
 const mockedFetch=async(url,request)=>{
   outgoing.push({url,request});
   return opts.providerFailure?new Response(JSON.stringify({message:'simulated failure'}),{status:500}):
    new Response(JSON.stringify({id:'email_mock_message_001'}),{status:200});
 };
 runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:f=>{handler=f}},
  Request,Response,Headers,TextEncoder,fetch:mockedFetch,
  console:{error(){}}});
 const headers=opts.tokenProvided===false?{}:{'x-cardora-test-token':opts.tokenValue??token};
 const res=await handler(new Request('https://example.invalid/functions/cardora-email-smoke',{method:opts.method||'POST',headers}));
 return {status:res.status,body:await res.json(),outgoing};
}
let tests=0;
async function check(name,overrides,opts,status,expectedCode,fetchCount=0){
 const x=await invoke(overrides,opts);assert.equal(x.status,status,name);
 if(expectedCode)assert.equal(x.body.error,expectedCode,name);
 assert.equal(x.outgoing.length,fetchCount,name);
 tests++;console.log('PASS '+name);return x;
}
await check('disabled by default',{CARDORA_EMAIL_SMOKE_ENABLED:''},{},503,'EMAIL_TEST_DISABLED');
await check('auth migration guarded',{CARDORA_AUTH_MIGRATION_VERIFIED:'false'},{},503,'AUTH_ALIGNMENT_REQUIRED');
await check('unauthorized request',{}, {tokenProvided:false},401,'UNAUTHORIZED');
await check('wrong length token',{}, {tokenValue:'short'},401,'UNAUTHORIZED');
await check('same length wrong token',{}, {tokenValue:'x'.repeat(token.length)},401,'UNAUTHORIZED');
await check('missing Resend key',{RESEND_API_KEY:''},{},503,'EMAIL_SMOKE_NOT_CONFIGURED');
await check('invalid recipient',{CARDORA_ADMIN_EMAIL:'invalid'},{},503,'EMAIL_SMOKE_NOT_CONFIGURED');
await check('only POST accepted',{}, {method:'GET'},405,'METHOD_NOT_ALLOWED');
const good=await check('authorized Resend mock accepted',{}, {},200,null,1);
assert.equal(good.body.accepted,true);
assert.equal(good.body.message_id,'email_mock_message_001');
assert.equal(good.outgoing[0].url,'https://api.resend.com/emails');
const outbound=JSON.parse(good.outgoing[0].request.body);
assert.deepEqual(outbound.to,['admin@example.invalid']);
assert.equal(outbound.from,'cardora@example.invalid');
assert.match(outbound.subject,/Sandbox/);
assert.doesNotMatch(JSON.stringify(outbound),/customer|invoice|real payment/i);
tests++;console.log('PASS fixed destination and non-payment content');
await check('provider error reported safely',{}, {providerFailure:true},502,'EMAIL_DELIVERY_REQUEST_FAILED',1);
console.log('PASS '+tests+' Cardora Resend handler cases; mock only; no email delivered');
