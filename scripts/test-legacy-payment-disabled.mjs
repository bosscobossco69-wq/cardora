import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const slug of ['create-toyyibpay-subscription-bill','toyyibpay-subscription-callback']){
 const code=fs.readFileSync('docs/security/legacy-isolation/'+slug+'/index.ts','utf8');
 assert.doesNotMatch(code,/\bimport\s|\bfetch\s*\(|Deno\.env|createClient|\.rpc\s*\(|\.from\s*\(/);
 let handler,calls=0;
 const deny=()=>{calls++;throw Error('Unexpected network or secret access');};
 vm.runInNewContext(code,{Response,Deno:{serve:f=>{handler=f;},env:{get:deny}},fetch:deny,console:{log:deny,error:deny}});
 for (const method of ['GET','POST','OPTIONS','PUT','DELETE','PATCH']){
  for(const headers of [{},{authorization:'Bearer synthetic',origin:'https://example.invalid'},{'content-type':'application/json'}]){
   const req=new Request('https://example.invalid/legacy?bill=synthetic',{method,headers,...(['GET','OPTIONS'].includes(method)?{}:{body:'malformed sensitive test data'} )});
   const res=await handler(req);assert.equal(res.status,410);assert.equal(res.headers.get('cache-control'),'no-store');
   assert.deepEqual(await res.json(),{error:'LEGACY_PAYMENT_DISABLED'});
   assert.equal(req.bodyUsed,false);
  }
 }
 assert.equal(calls,0);
 console.log('PASS: '+slug+' returns 410 for 18 request shapes without secrets, body reads, network or DB');
}
