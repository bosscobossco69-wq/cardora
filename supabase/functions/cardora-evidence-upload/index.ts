// DRAFT ONLY. Never deploy before isolated staging authorization + Storage tests.
// Private evidence uploader; intentionally disabled unless the owner explicitly
// enables a tested nonproduction environment.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const PROJECT_URL = "https://fdkfquvzbswxocyrhduk.supabase.co";
const BUCKET = "cardora-listing-evidence";
const MAX_BYTES = 10 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const originAllowed = (origin: string | null) => {
  const expected = Deno.env.get("CARDORA_STAGING_SITE_ORIGIN") || "";
  return Boolean(expected && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(expected) && origin === expected);
};
const response = (status: number, error: string, origin: string | null) => {
  const headers = new Headers({"content-type":"application/json","cache-control":"no-store","vary":"Origin"});
  if (originAllowed(origin)) headers.set("access-control-allow-origin", origin!);
  return new Response(JSON.stringify({error}),{status,headers});
};
const sniff = (bytes: Uint8Array): {contentType:string,extension:string}|null => {
  if (bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff)
    return {contentType:"image/jpeg",extension:"jpg"};
  if (bytes.length>=8 && bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]))
    return {contentType:"image/png",extension:"png"};
  if (bytes.length>=12 &&
      new TextDecoder().decode(bytes.slice(0,4))==="RIFF" &&
      new TextDecoder().decode(bytes.slice(8,12))==="WEBP")
    return {contentType:"image/webp",extension:"webp"};
  return null;
};

Deno.serve(async (req) => {
  const origin=req.headers.get("origin");
  if(!originAllowed(origin)) return response(403,"ORIGIN_NOT_ALLOWED",origin);
  if(req.method==="OPTIONS"){
    return new Response(null,{status:204,headers:{
      "access-control-allow-origin":origin!,
      "access-control-allow-methods":"POST,OPTIONS",
      "access-control-allow-headers":"authorization,apikey,content-type",
      "vary":"Origin"
    }});
  }
  if(req.method!=="POST")return response(405,"METHOD_NOT_ALLOWED",origin);
  // Explicit hard-stop until private Storage policy, admin moderation and
  // orphan-asset lifecycle pass isolated integration tests.
  if(Deno.env.get("CARDORA_EVIDENCE_UPLOAD_VERIFIED")!=="true" ||
     Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED")!=="true" ||
     Deno.env.get("CARDORA_EVIDENCE_MODERATION_VERIFIED")!=="true")
    return response(503,"EVIDENCE_UPLOAD_NOT_VERIFIED",origin);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(url!==PROJECT_URL||!anon||!serviceKey)
    return response(503,"STAGING_BACKEND_MISCONFIGURED",origin);
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer\s+\S+$/.test(bearer))return response(401,"LOGIN_REQUIRED",origin);
  const identity=createClient(url,anon,{global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authErr}=await identity.auth.getUser();
  if(authErr||!user||user.is_anonymous)return response(401,"INVALID_SESSION",origin);
  const length=Number(req.headers.get("content-length")||0);
  if(length>MAX_BYTES+50_000)return response(413,"FILE_TOO_LARGE",origin);
  let body:FormData;
  try{body=await req.formData()}catch{return response(400,"INVALID_FORM",origin)}
  const listingId=body.get("listing_id"),side=body.get("side"),file=body.get("photo");
  if(typeof listingId!=="string"||!uuidPattern.test(listingId)||
     (side!=="front"&&side!=="back")||!(file instanceof File))
    return response(400,"INVALID_SUBMISSION",origin);
  if(!file.size||file.size>MAX_BYTES)return response(413,"FILE_TOO_LARGE",origin);
  const array= new Uint8Array(await file.arrayBuffer());
  const detected=sniff(array);
  if(!detected||file.type!==detected.contentType)
    return response(415,"INVALID_IMAGE_TYPE",origin);
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  // Never authorize from client-provided seller IDs, role claims or listing paths.
  const {data:profile,error:profileError}=await service.from("users")
    .select("id,status").eq("auth_user_id",user.id).maybeSingle();
  if(profileError||profile?.status!=="active")return response(403,"ACTIVE_USER_REQUIRED",origin);
  const {data:seller,error:sellerError}=await service.from("seller_profiles")
    .select("id,status").eq("user_id",profile.id).maybeSingle();
  if(sellerError||seller?.status!=="approved")return response(403,"APPROVED_SELLER_REQUIRED",origin);
  const {data:listing,error:listingError}=await service.from("listings")
    .select("id,status").eq("id",listingId).maybeSingle();
  const {data:detail,error:detailError}=await service.from("listing_details")
    .select("listing_id,seller_id").eq("listing_id",listingId).maybeSingle();
  if(listingError||detailError||listing?.status!=="pending_review"||
     detail?.seller_id!==seller.id)return response(403,"LISTING_NOT_OWNED_OR_PENDING",origin);
  // Immutable object names; no overwrite (a second submission must be reviewed).
  const key=`${user.id}/${listingId}/${side}.${detected.extension}`;
  const {error:uploadError}=await service.storage.from(BUCKET)
    .upload(key,array,{contentType:detected.contentType,upsert:false,cacheControl:"0"});
  if(uploadError)return response(409,"UPLOAD_REJECTED_OR_ALREADY_EXISTS",origin);
  const headers=new Headers({"content-type":"application/json","cache-control":"no-store",
    "access-control-allow-origin":origin!,"vary":"Origin"});
  return new Response(JSON.stringify({status:"stored_privately_pending_review",listing_id:listingId,side}),{status:201,headers});
});
