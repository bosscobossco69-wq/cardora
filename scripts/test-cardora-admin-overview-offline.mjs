#!/usr/bin/env node
// Deterministic offline contract tests for the actual (un-deployed) Edge Function.
// No Supabase credentials, network requests, production SQL or email.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const path="supabase/functions/cardora-admin-overview/index.ts";
let source=readFileSync(path,"utf8")
  .replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2\.49\.4";\s*/m,"")
  .replace("const respond=(value:unknown,status=200)=>","const respond=(value,status=200)=>")
  .replace("const classify=(r:{name?:string|null;email?:string|null})=>","const classify=(r)=>")
  .replace("const count=async(table:string,filter?:{field:string,value:string})=>","const count=async(table,filter)=>")
  .replace("const maskEmail=(value:string|null)=>","const maskEmail=(value)=>")
  .replace("const maskApplication=(a:{email?:string|null})=>","const maskApplication=(a)=>")
  .replace(/let legacyHistory:\{[\s\S]*?\}=\{/,"let legacyHistory={");
assert.ok(!source.includes("import { createClient }"));
assert.ok(!source.includes("value:unknown"));
assert.ok(!source.includes("let legacyHistory:"));

const origin="https://cardora-test.example";
function harness({role="admin",status="active",verified="user-1",
  gate=true,projectCorrect=true,roleError=false,rosterError=false,
  canRead=true}={}){
  let handler;
  let reads=0;
  let authCalls=0;
  const values={
    CARDORA_SITE_ORIGIN:"https://cardora-rose.vercel.app",
    CARDORA_STAGING_SITE_ORIGIN:origin,
    CARDORA_ADMIN_OVERVIEW_VERIFIED:gate?"true":"false",
    CARDORA_AUTH_MIGRATION_VERIFIED:gate?"true":"false",
    SUPABASE_URL:projectCorrect?"https://fdkfquvzbswxocyrhduk.supabase.co":"https://wrong.supabase.co",
    SUPABASE_ANON_KEY:"anon-offline-fake",
    SUPABASE_SERVICE_ROLE_KEY:"service-offline-fake",
    CARDORA_LEGACY_READ_SERVICE_KEY:""
  };
  const query=(table)=>{
    let head=false;
    const chain={
      select(_fields,opts){head=!!opts?.head;return this},
      eq(){return this},
      order(){return this},
      limit(){return Promise.resolve(
        rosterError&&table==="users"?
         {data:null,error:{message:"denied"}}:
         table==="users"?
          {data:[{id:"u1",member_id:"C001",email:"jane@example.com",role:"buyer",status:"active",created_at:"2026-11-01"}],error:null}:
         table==="seller_applications"?
          {data:[{id:"a1",name:"Seller Test",email:"seller@example.com",role:"seller",status:"pending",created_at:"2026-11-01"}],error:null}:
          {data:[],error:null}
      )},
      maybeSingle(){return Promise.resolve(roleError?
        {data:null,error:{message:"denied"}}:
        {data:{id:"u1",role,status},error:null})},
      then(resolve,reject){
        return Promise.resolve({count:canRead?1:null,error:canRead?null:{message:"denied"}})
          .then(resolve,reject);
      }
    };
    reads++;
    return chain;
  };
  const createClient=(_url,key)=>key==="anon-offline-fake"?
    {auth:{getUser:async()=>{authCalls++;return verified?
      {data:{user:{id:verified}},error:null}:
      {data:{user:null},error:{message:"bad token"}}}}}:
    {from:query};
  const context={
    Headers,Response,Date,URL,console:{error(){}},
    Deno:{env:{get:(key)=>values[key]??""},serve:(callback)=>{handler=callback}},
    createClient
  };
  vm.runInNewContext(source,context,{filename:path,timeout:1000});
  assert.equal(typeof handler,"function");
  async function call({method="POST",site=origin,token="Bearer user-token"}={}){
    const headers=new Headers();
    if(site!==null)headers.set("Origin",site);
    if(token!==null)headers.set("Authorization",token);
    const res=await handler(new Request("https://example.invalid", {method,headers}));
    const body=await res.json();
    return {status:res.status,headers:res.headers,body};
  }
  return {call,getReads:()=>reads,getAuthCalls:()=>authCalls};
}

let checks=0;
async function check(name,args,request,expected,assertExtra){
 const h=harness(args);
 const response=await h.call(request);
 assert.equal(response.status,expected,name);
 if(assertExtra)assertExtra(response,h);
 console.log("PASS",name);
 checks++;
}
await check("untrusted origin gets 403 and no CORS permission",{},
 {site:"https://attacker.example"},403,({headers},h)=>{
 assert.equal(headers.has("access-control-allow-origin"),false);
 assert.equal(h.getReads(),0);
});
await check("preflight for allowed preview",{},
 {method:"OPTIONS",token:null},200,({headers},h)=>{
 assert.equal(headers.get("access-control-allow-origin"),origin);
 assert.equal(h.getReads(),0);
});
await check("wrong method rejected",{},
 {method:"GET"},405);
await check("feature gates fail closed",{gate:false},{},503,(_response,h)=>{
 assert.equal(h.getReads(),0);
});
await check("wrong Supabase project rejected",{projectCorrect:false},{},503);
await check("no token rejected",{}, {token:null},401,(_response,h)=>{
 assert.equal(h.getReads(),0);
});
await check("invalid token rejected",{verified:null},{},401,(_response,h)=>{
 assert.equal(h.getReads(),0);
});
await check("ordinary customer denied",{role:"user"},{},403,(_response,h)=>{
 assert.equal(h.getReads(),1); // only protected role lookup
});
await check("seller denied",{role:"seller"},{},403);
await check("inactive administrator denied",{role:"admin",status:"disabled"},{},403);
await check("database role lookup unavailable returns 503",{roleError:true},{},503);
await check("read failure returns 503 without data",{canRead:false},{},503,({body})=>{
 assert.equal(body.error,"OVERVIEW_UNAVAILABLE");
});
await check("active admin obtains only masked email",{},{},200,({body},h)=>{
 assert.equal(body.customers.records.length,1);
 assert.equal(body.customers.records[0].email_masked,"j***@example.com");
 assert.equal(body.customers.records[0].email,undefined);
 assert.equal(body.customers.marketing_available,false);
 assert.equal(body.customers.followup_available,false);
 assert.equal(JSON.stringify(body).includes("jane@example.com"),false);
 assert.equal(body.applications.length,1);
 assert.equal(body.applications[0].email_masked,"s***@example.com");
 assert.equal(body.applications[0].email,undefined);
 assert.equal(JSON.stringify(body).includes("seller@example.com"),false);
 assert.equal(body.legacy_history.available,false);
 assert.ok(h.getReads()>1);
});
await check("customer roster query failure refuses result",{rosterError:true},{},503);
console.log("PASS",checks,"isolated admin overview contract tests, no live requests");
