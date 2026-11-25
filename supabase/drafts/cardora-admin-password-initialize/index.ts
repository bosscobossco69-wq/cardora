// DRAFT ONLY. Operator-only password initialization. Never deploy as a public reset flow.
// The project operator invokes this from the Supabase dashboard, not the Cardora website.
// Requires exact existing service-role credential; no custom bootstrap token or public CORS.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const PROJECT="https://fdkfquvzbswxocyrhduk.supabase.co";
const TARGET="2c1f0978-08ef-4120-a7d6-740a07edeec5";
const EMAIL="bosscobossco69@gmail.com";
const EXPIRES_AT=Date.parse("2026-11-25T02:00:00Z");
const respond=(status:number,code:string)=>new Response(JSON.stringify({code}),{
 status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
Deno.serve(async(req)=>{
 if(Date.now()>=EXPIRES_AT)return respond(410,"INITIALIZATION_EXPIRED");
 if(req.method!=="POST")return respond(405,"METHOD_NOT_ALLOWED");
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!key||Deno.env.get("SUPABASE_URL")!==PROJECT)return respond(503,"CONFIG_UNAVAILABLE");
 if(req.headers.get("authorization")!=="Bearer "+key)return respond(403,"OPERATOR_REQUIRED");
 try{
  const body=await req.json();
  if(!body||Object.keys(body).length!==1||typeof body.password!=="string")return respond(400,"INVALID_INPUT");
  const password=body.password;
  if(password.length<16||new TextEncoder().encode(password).length>72||password!==password.trim())
    return respond(400,"INVALID_PASSWORD_LENGTH");
  const client=createClient(PROJECT,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.admin.getUserById(TARGET);
  const user=data?.user;
  if(error||!user||user.id!==TARGET||user.email!==EMAIL||!user.email_confirmed_at||
    user.is_anonymous||user.last_sign_in_at||user.app_metadata?.cardora_bootstrap_completed===true)
    return respond(409,"INITIALIZATION_NOT_AVAILABLE");
  const profile=await client.from("users").select("role,status").eq("auth_user_id",TARGET).maybeSingle();
  if(profile.error||profile.data?.role!=="admin"||profile.data?.status!=="active")
    return respond(403,"TARGET_NOT_ACTIVE_ADMIN");
  const result=await client.auth.admin.updateUserById(TARGET,{
    password,app_metadata:{...user.app_metadata,cardora_bootstrap_completed:true}
  });
  if(result.error||result.data?.user?.id!==TARGET)return respond(503,"UPDATE_FAILED");
  return respond(200,"PASSWORD_INITIALIZED");
 }catch{return respond(503,"REQUEST_FAILED");}
});
