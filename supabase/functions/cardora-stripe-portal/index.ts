// Cardora Stripe Customer Portal — DRAFT, SANDBOX-ONLY, NOT DEPLOYED.
// The portal URL is issued ONLY for a verified logged-in seller and the exact
// Stripe customer already linked to that seller in the Cardora database.
// Required: verify_jwt=true; auth project alignment + SQL migration tested.
// NEVER use the public shared billing.stripe.com/p/login link to identify a seller.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const origin = Deno.env.get("CARDORA_SITE_ORIGIN") || "https://cardora-rose.vercel.app";
const respond = (body:unknown,status=200) => new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json","cache-control":"no-store",
    "access-control-allow-origin":origin,"vary":"Origin",
    "access-control-allow-headers":"authorization, apikey, content-type",
    "access-control-allow-methods":"POST, OPTIONS"}
});

Deno.serve(async(req)=>{
  if(req.headers.get("origin") && req.headers.get("origin")!==origin)
    return respond({error:"INVALID_ORIGIN"},403);
  if(req.method==="OPTIONS") return respond({ok:true});
  if(req.method!=="POST") return respond({error:"METHOD_NOT_ALLOWED"},405);
  // Separate explicit approval for portal integration; NEVER enable because a
  // Dashboard configuration was saved. Staging ownership tests come first.
  if(Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED")!=="true" ||
     Deno.env.get("CARDORA_PORTAL_VERIFIED")!=="true")
    return respond({error:"PORTAL_NOT_VERIFIED"},503);
  const secret=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!secret.startsWith("sk_test_")||!url||!anon||!serviceKey)
    return respond({error:"SANDBOX_NOT_CONFIGURED"},503);
  const bearer=req.headers.get("authorization")||"";
  if(!/^Bearer\s+\S+$/.test(bearer))return respond({error:"LOGIN_REQUIRED"},401);
  // No request body, URL, customer ID or seller ID is trusted.
  const auth=createClient(url,anon,{global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authError}=await auth.auth.getUser();
  if(authError||!user)return respond({error:"INVALID_SESSION"},401);
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:appUser,error:appError}=await service.from("users")
    .select("id,status").eq("auth_user_id",user.id).maybeSingle();
  if(appError||!appUser||appUser.status!=="active")
    return respond({error:"CARDORA_USER_NOT_FOUND"},403);
  const {data:seller,error:sellerError}=await service.from("seller_profiles")
    .select("id,user_id").eq("user_id",appUser.id).maybeSingle();
  if(sellerError||!seller)return respond({error:"SELLER_PROFILE_REQUIRED"},403);
  const {data:link,error:linkError}=await service.from("cardora_stripe_subscription_links")
    .select("stripe_customer_id,stripe_subscription_id,seller_profile_id")
    .eq("seller_profile_id",seller.id).maybeSingle();
  if(linkError)return respond({error:"SUBSCRIPTION_STATE_UNAVAILABLE"},503);
  if(!link)return respond({error:"NO_STRIPE_SUBSCRIPTION"},404);
  const customerId=link.stripe_customer_id||"";
  const subscriptionId=link.stripe_subscription_id||"";
  if(!/^cus_[A-Za-z0-9_]+$/.test(customerId)||
     !/^sub_[A-Za-z0-9_]+$/.test(subscriptionId)||
     link.seller_profile_id!==seller.id)
    return respond({error:"SUBSCRIPTION_LINK_INVALID"},503);
  try {
    const stripe=new Stripe(secret);
    // Revalidate exact Stripe object linkage before issuing a customer portal
    // token; a mismatched DB row must not grant access to another customer's data.
    const subscription=await stripe.subscriptions.retrieve(subscriptionId);
    const actualCustomer=typeof subscription.customer==="string"
      ?subscription.customer:subscription.customer?.id;
    if(subscription.livemode||actualCustomer!==customerId||
       subscription.metadata?.project!=="cardora"||
       subscription.metadata?.seller_profile_id!==seller.id)
      return respond({error:"STRIPE_CUSTOMER_OWNER_MISMATCH"},403);
    const customer=await stripe.customers.retrieve(customerId);
    if(customer.deleted||customer.livemode)
      return respond({error:"STRIPE_CUSTOMER_UNAVAILABLE"},503);
    const configId=Deno.env.get("STRIPE_PORTAL_CONFIGURATION_ID")||"";
    if(configId&&!configId.startsWith("bpc_"))
      return respond({error:"PORTAL_CONFIG_INVALID"},503);
    // No client-supplied return URL; keep users on the approved Cardora origin.
    const session=await stripe.billingPortal.sessions.create({
      customer:customerId,
      return_url:origin+"/",
      ...(configId?{configuration:configId}:{})
    });
    if(!session.url.startsWith("https://billing.stripe.com/"))
      return respond({error:"INVALID_PORTAL_URL"},502);
    return respond({portal_url:session.url,environment:"sandbox"});
  } catch(e) {
    console.error("STRIPE_PORTAL_FAILED",e instanceof Error?e.message:"unknown");
    return respond({error:"PORTAL_UNAVAILABLE"},502);
  }
});
