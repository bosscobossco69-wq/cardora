// Cardora management overview — DRAFT ONLY; NOT DEPLOYED.
// Administrator-only, read-only statistics from the NEW Cardora Supabase project.
// The old pokemon-treasure-demo project is intentionally not silently combined.
// Never put SUPABASE_SERVICE_ROLE_KEY into browser JavaScript.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const allowedOrigin=Deno.env.get("CARDORA_SITE_ORIGIN")||"https://cardora-rose.vercel.app";
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":"no-store, private","vary":"Origin",
 "access-control-allow-origin":allowedOrigin,
 "access-control-allow-headers":"authorization, apikey, content-type",
 "access-control-allow-methods":"POST, OPTIONS"}
});
Deno.serve(async(request)=>{
 if(request.headers.get("origin")&&request.headers.get("origin")!==allowedOrigin)
   return respond({error:"INVALID_ORIGIN"},403);
 if(request.method==="OPTIONS")return respond({ok:true});
 if(request.method!=="POST")return respond({error:"METHOD_NOT_ALLOWED"},405);
 // Independent QA gate. Must remain off until auth, admin and CORS tests pass.
 if(Deno.env.get("CARDORA_ADMIN_OVERVIEW_VERIFIED")!=="true"||
    Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED")!=="true")
   return respond({error:"ADMIN_OVERVIEW_NOT_VERIFIED"},503);
 const projectUrl=Deno.env.get("SUPABASE_URL")||"";
 if(projectUrl!=="https://fdkfquvzbswxocyrhduk.supabase.co")
   return respond({error:"CARDORA_PROJECT_MISMATCH"},503);
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!anon||!serviceKey)return respond({error:"CONFIG_UNAVAILABLE"},503);
 const authorization=request.headers.get("authorization")||"";
 if(!/^Bearer\s+\S+$/.test(authorization))
   return respond({error:"LOGIN_REQUIRED"},401);
 const authClient=createClient(projectUrl,anon,{
   global:{headers:{Authorization:authorization}},
   auth:{persistSession:false,autoRefreshToken:false}
 });
 const verified=await authClient.auth.getUser();
 const authUser=verified.data?.user;
 if(verified.error||!authUser)return respond({error:"INVALID_SESSION"},401);
 const adminClient=createClient(projectUrl,serviceKey,{
   auth:{persistSession:false,autoRefreshToken:false}
 });
 // Role derives solely from protected public.users, NEVER client claims or email.
 const {data:admin,error:roleError}=await adminClient.from("users")
   .select("id,role,status").eq("auth_user_id",authUser.id).maybeSingle();
 if(roleError)return respond({error:"AUTHORIZATION_UNAVAILABLE"},503);
 if(!admin||admin.role!=="admin"||admin.status!=="active")
   return respond({error:"ADMIN_ONLY"},403);
 // Legacy is history ONLY. Credentials stay server-side and read-only queries
 // never update old applications, users, wallets or permissions.
 const legacyUrl="https://crqqockaetgacddxkqpb.supabase.co";
 const legacyKey=Deno.env.get("CARDORA_LEGACY_READ_SERVICE_KEY")||"";
 const legacy=legacyKey?createClient(legacyUrl,legacyKey,{
   auth:{persistSession:false,autoRefreshToken:false}
 }):null;
 const classify=(r:{name?:string|null;email?:string|null})=>
   /(^|[^a-z])(test|demo|sample)([^a-z]|$)/i.test((r.name||"")+" "+(r.email||""))||
   /@example\.(com|org|net)$/i.test(r.email||"");
 const count=async(table:string,filter?:{field:string,value:string})=>{
   let query=adminClient.from(table).select("id",{head:true,count:"exact"});
   if(filter)query=query.eq(filter.field,filter.value);
   const r=await query;
   if(r.error)throw new Error("count failed for "+table);
   return r.count??0;
 };
 try {
   const [registered,sellers,agents,applications,pending,approved,
     sellerApplications,agentApplications,listings,orders,subscriptions]=
    await Promise.all([
     count("users"),count("seller_profiles"),count("agent_profiles"),
     count("seller_applications"),
     count("seller_applications",{field:"status",value:"pending"}),
     count("seller_applications",{field:"status",value:"approved"}),
     count("seller_applications",{field:"role",value:"seller"}),
     count("seller_applications",{field:"role",value:"agent"}),
     count("listings"),count("orders"),count("seller_subscriptions")
    ]);
   const details=await adminClient.from("seller_applications")
     .select("id,created_at,name,email,role,status")
     .order("created_at",{ascending:false}).limit(50);
   if(details.error)throw new Error("application list unavailable");
   // Keep source-specific records, never silently merging different identities.
   // A test flag is a review cue, not proof that a customer is fake.
   const canonical=(details.data||[]).map(a=>({
      ...a,source:"cardora",suspected_test:classify(a)
   }));
   let legacyHistory:{source:string;available:boolean;error?:string;applications:unknown[];
      record_count:number|null;suspected_test_count:number|null}={
       source:"pokemon-treasure-demo",available:false,
       error:"NOT_CONFIGURED",applications:[],record_count:null,
       suspected_test_count:null
   };
   if(legacy){
     const [legacyRows,legacyCount]=await Promise.all([
       legacy.from("seller_applications").select("id,created_at,name,email,role,status")
         .order("created_at",{ascending:false}).limit(50),
       legacy.from("seller_applications").select("id",{head:true,count:"exact"})
     ]);
     if(legacyRows.error||legacyCount.error){
       legacyHistory.error="LEGACY_READ_UNAVAILABLE";
     }else{
       const apps=(legacyRows.data||[]).map(a=>({
         ...a,source:"legacy",suspected_test:classify(a)
       }));
       legacyHistory={source:"pokemon-treasure-demo",available:true,
         applications:apps,record_count:legacyCount.count??0,
         suspected_test_count:apps.filter(a=>a.suspected_test).length};
     }
   }
   return respond({
     source:"cardora_supabase",legacy_project_included:false,
     updated_at:new Date().toISOString(),
     counts:{registered_profiles:registered,sellers,agents,applications,
       pending,approved,seller_applications:sellerApplications,
       agent_applications:agentApplications,listings,orders,subscription_records:subscriptions},
     // Admin-only; do not log or cache personal application information.
     applications:canonical,legacy_history:legacyHistory,
     labels:{canonical:"Cardora (new)",legacy:"Old archive: pokemon-treasure-demo"},
     test_classification:"Name/email pattern only. Human review required; totals include test rows.",
     suspected_test_applications_in_recent_50:canonical.filter(a=>a.suspected_test).length,
     note:"Separate new and old sources; no deduplicated unique customer total or revenue."
   });
 } catch(e){
   console.error("CARDORA_ADMIN_OVERVIEW_FAILED",e instanceof Error?e.message:"unknown");
   return respond({error:"OVERVIEW_UNAVAILABLE"},503);
 }
});
