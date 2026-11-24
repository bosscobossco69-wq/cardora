// DRAFT ONLY — do not deploy until Cardora Auth, outbox SQL and Resend staging verified.
// Uses the authenticated Cardora seller identity, NEVER an email from a public request.
// Webhook only enqueues verified invoice; this worker sends via a protected test operation.
import {createClient} from "npm:@supabase/supabase-js@2.49.4";
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
Deno.serve(async(req)=>{
  if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
  if(Deno.env.get("CARDORA_PAYMENT_EMAIL_WORKER_VERIFIED")!=="true" ||
     Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED")!=="true" ||
     Deno.env.get("CARDORA_PAYMENT_EMAIL_QUEUE_VERIFIED")!=="true")
    return reply({error:"EMAIL_WORKER_DISABLED"},503);
  const expected=Deno.env.get("CARDORA_EMAIL_WORKER_TOKEN")||"";
  const supplied=req.headers.get("x-cardora-worker-token")||"";
  if(expected.length<32||supplied.length!==expected.length)return reply({error:"UNAUTHORIZED"},401);
  const encoder=new TextEncoder(),a=encoder.encode(expected),b=encoder.encode(supplied);
  let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];
  if(mismatch!==0)return reply({error:"UNAUTHORIZED"},401);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const resend=Deno.env.get("RESEND_API_KEY")||"";
  const from=Deno.env.get("CARDORA_FROM_EMAIL")||"";
  const replyTo=Deno.env.get("CARDORA_ADMIN_EMAIL")||"";
  if(!url||!key||!resend.startsWith("re_")||!validEmail(from)||!validEmail(replyTo))
    return reply({error:"EMAIL_WORKER_NOT_CONFIGURED"},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:pending,error:readError}=await db.from("cardora_payment_email_outbox")
    .select("stripe_invoice_id,seller_profile_id,stripe_subscription_id,plan_code,period_end")
    .eq("status","pending").order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(readError)return reply({error:"QUEUE_READ_FAILED"},500);
  if(!pending)return reply({ok:true,processed:0});
  // Compare-and-set prevents concurrent workers from both sending the same invoice.
  const {data:claimed,error:claimError}=await db.from("cardora_payment_email_outbox")
    .update({status:"sending",updated_at:new Date().toISOString()})
    .eq("stripe_invoice_id",pending.stripe_invoice_id).eq("status","pending")
    .select("stripe_invoice_id").maybeSingle();
  if(claimError)return reply({error:"QUEUE_CLAIM_FAILED"},500);
  if(!claimed)return reply({ok:true,processed:0});
  // Fail closed if membership has been revoked since enqueue.
  const {data:link,error:linkError}=await db.from("cardora_stripe_subscription_links")
    .select("stripe_subscription_id,plan_code").eq("seller_profile_id",pending.seller_profile_id).maybeSingle();
  const {data:membership,error:memberError}=await db.from("seller_subscriptions")
    .select("status,plan_code,current_period_ends_at").eq("seller_profile_id",pending.seller_profile_id)
    .eq("is_current",true).maybeSingle();
  if(linkError||memberError||link?.stripe_subscription_id!==pending.stripe_subscription_id||
     link?.plan_code!==pending.plan_code||membership?.status!=="active"||
     membership?.plan_code!==pending.plan_code||!membership?.current_period_ends_at||
     new Date(membership.current_period_ends_at).getTime()<new Date(pending.period_end).getTime())
    return reply({error:"MEMBERSHIP_NO_LONGER_VERIFIED",invoice_status:"sending_review_required"},409);
  const {data:seller,error:sellerError}=await db.from("seller_profiles")
    .select("user_id").eq("id",pending.seller_profile_id).maybeSingle();
  if(sellerError||!seller?.user_id)return reply({error:"SELLER_IDENTITY_UNAVAILABLE"},409);
  const {data:appUser,error:userError}=await db.from("users")
    .select("auth_user_id,status").eq("id",seller.user_id).maybeSingle();
  if(userError||appUser?.status!=="active"||!appUser.auth_user_id)
    return reply({error:"CUSTOMER_IDENTITY_UNVERIFIED"},409);
  const {data:authResult,error:authError}=await db.auth.admin.getUserById(appUser.auth_user_id);
  const email=authResult?.user?.email||"";
  if(authError||!validEmail(email))return reply({error:"CUSTOMER_EMAIL_UNVERIFIED"},409);
  const planName=({basic:"Basic",pro:"Pro",business:"Business"} as Record<string,string>)[pending.plan_code];
  if(!planName)return reply({error:"UNKNOWN_PLAN"},409);
  const result=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{"authorization":`Bearer ${resend}`,"content-type":"application/json",
      "Idempotency-Key":"cardora-paid-"+pending.stripe_invoice_id},
    body:JSON.stringify({
      from,to:[email],reply_to:replyTo,
      subject:"Cardora — "+planName+" membership payment confirmed",
      text:`Your Cardora ${planName} membership payment was confirmed and your membership is active.\nInvoice reference: ${pending.stripe_invoice_id}\nMembership valid until: ${new Date(pending.period_end).toISOString().slice(0,10)}\nFor subscription management or cancellations, please contact: ${replyTo}\nThis is an automated transactional message.`
    })
  });
  if(!result.ok){
    console.error("CARDORA_RESEND_PAYMENT_NOTIFICATION_FAILED",result.status);
    // Do not reset to pending automatically: delivery may have succeeded but
    // acknowledgement failed. Provider idempotency protects deliberate retries.
    return reply({error:"EMAIL_PROVIDER_NOT_CONFIRMED",invoice_status:"sending_review_required"},502);
  }
  const body=await result.json().catch(()=>({}));
  const {error:saveError}=await db.from("cardora_payment_email_outbox")
    .update({status:"sent",resend_message_id:typeof body.id==="string"?body.id:null,updated_at:new Date().toISOString()})
    .eq("stripe_invoice_id",pending.stripe_invoice_id).eq("status","sending");
  if(saveError)return reply({error:"EMAIL_SENT_RECORD_FAILED",invoice_status:"sending_review_required"},500);
  return reply({ok:true,processed:1});
});
