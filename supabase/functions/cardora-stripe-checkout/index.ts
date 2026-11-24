// Cardora Stripe Checkout — draft only; never deploy until Auth project alignment is verified.
// Required secrets: STRIPE_SECRET_KEY (sandbox), STRIPE_PRICE_BASIC/PRO/BUSINESS,
// SUPABASE_URL, SUPABASE_ANON_KEY, CARDORA_SITE_ORIGIN.
// Required: Edge Function verify_jwt=true, and user authentication from the SAME Supabase project.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const configuredOrigin = Deno.env.get("CARDORA_SITE_ORIGIN") || "";
const productionHosts = new Set([
  "cardora-rose.vercel.app",
  "cardora-pokemon-treasure.vercel.app",
  "cardora-git-main-pokemon-treasure.vercel.app"
]);
// Sandbox checkout MUST use an explicitly configured isolated preview/staging origin.
// A production URL, wildcard, query, path, or HTTP origin fails closed.
const getStagingOrigin = (): string | null => {
  try {
    const url = new URL(configuredOrigin);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || url.port ||
        productionHosts.has(url.hostname) ||
        !(/\.vercel\.app$/.test(url.hostname) || /\.pages\.dev$/.test(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
};
const origin = getStagingOrigin();
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store",
    "access-control-allow-origin": origin || "", "vary": "Origin",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS" }
});
Deno.serve(async (req) => {
  if (!origin) return new Response(JSON.stringify({error:"STAGING_ORIGIN_NOT_CONFIGURED"}), {status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
  if (req.headers.get("origin") && req.headers.get("origin") !== origin) return json({error:"INVALID_ORIGIN"},403);
  if (req.method === "OPTIONS") return json({ok:true});
  if (req.method !== "POST") return json({error:"METHOD_NOT_ALLOWED"},405);
  if (Deno.env.get("CARDORA_AUTH_MIGRATION_VERIFIED") !== "true") return json({error:"AUTH_MIGRATION_NOT_VERIFIED"},503);
  // Never allow checkout until atomic reservation and race-condition tests pass.
  if (Deno.env.get("CARDORA_CHECKOUT_RESERVATION_VERIFIED") !== "true") return json({error:"SUBSCRIPTION_RESERVATION_NOT_VERIFIED"},503);
  const secret = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!secret.startsWith("sk_test_") || !url || !anon) return json({error:"SANDBOX_NOT_CONFIGURED"},503);
  const bearer = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/.test(bearer)) return json({error:"LOGIN_REQUIRED"},401);
  const client = createClient(url, anon, {global:{headers:{Authorization:bearer}}});
  const {data:{user},error:authError} = await client.auth.getUser();
  if (authError || !user) return json({error:"INVALID_SESSION"},401);
  let request: any;
  try {request=await req.json();} catch {return json({error:"INVALID_JSON"},400);}
  const tier = String(request?.tier || "").toLowerCase();
  if (!["basic","pro","business"].includes(tier)) return json({error:"INVALID_TIER"},400);
  const prices: Record<string,string> = {
    basic:Deno.env.get("STRIPE_PRICE_BASIC") || "",
    pro:Deno.env.get("STRIPE_PRICE_PRO") || "",
    business:Deno.env.get("STRIPE_PRICE_BUSINESS") || ""
  };
  if (!prices[tier].startsWith("price_")) return json({error:"PRICE_NOT_CONFIGURED"},503);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey) return json({error:"BILLING_SERVER_NOT_CONFIGURED"},503);
  // After Supabase Auth verifies the bearer JWT, resolve the owner server-side.
  // Do not rely on arbitrary client-provided IDs or public table RLS visibility.
  const service = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:appUser,error:userError} = await service.from("users")
    .select("id,status").eq("auth_user_id",user.id).maybeSingle();
  if (userError || !appUser || appUser.status!=="active") return json({error:"CARDORA_USER_NOT_FOUND"},403);
  const {data:seller,error:sellerError} = await service.from("seller_profiles")
    .select("id,user_id,status,verification_status").eq("user_id",appUser.id).maybeSingle();
  if (sellerError || !seller) return json({error:"SELLER_PROFILE_REQUIRED"},403);
  if (seller.status !== "approved" || seller.verification_status !== "verified")
    return json({error:"SELLER_NOT_APPROVED"},403);
  // The legacy Cardora/ToyyibPay membership table is a second source of
  // existing paid entitlements. Never create a new Stripe subscription while any
  // CURRENT membership row exists: a cutover requires reconciliation first.
  // This is service-side, not a browser-side "has subscription" claim.
  const {data:currentMemberships,error:membershipError} = await service.from("seller_subscriptions")
    .select("id,status,is_current").eq("seller_profile_id",seller.id)
    .eq("is_current",true).limit(2);
  if (membershipError) return json({error:"MEMBERSHIP_STATE_UNAVAILABLE"},503);
  if ((currentMemberships || []).length > 0)
    return json({error:"EXISTING_CARDORA_MEMBERSHIP_REQUIRES_RECONCILIATION"},409);
  // A billing link already present indicates an existing subscription: block a second Checkout.
  // Race-free prevention and managed upgrades still require a separate server reservation/lock.
  const {data:existing,error:existingError} = await service.from("cardora_stripe_subscription_links")
    .select("stripe_subscription_id").eq("seller_profile_id",seller.id).maybeSingle();
  if (existingError) return json({error:"SUBSCRIPTION_STATE_UNAVAILABLE"},503);
  if (existing) return json({error:"EXISTING_SUBSCRIPTION_MANAGE_IN_PORTAL"},409);
  try {
    const stripe = new Stripe(secret);
    // Stripe price IDs are server-selected but must also match the expected MYR recurring product.
    const expectedAmounts: Record<string,number> = {basic:2900,pro:7900,business:19900};
    const price = await stripe.prices.retrieve(prices[tier]);
    if (price.livemode || price.active!==true || price.currency!=="myr" ||
        price.unit_amount!==expectedAmounts[tier] ||
        price.recurring?.interval!=="month" || price.recurring?.interval_count!==1)
      return json({error:"PRICE_CONFIGURATION_MISMATCH"},503);
    // Database UNIQUE(seller_profile_id) atomically assigns one durable request ID.
    // Every retry for the same seller+tier uses exactly the same Stripe idempotency key.
    const {data:requestId,error:reservationError} = await service.rpc("cardora_reserve_stripe_checkout",{
      p_seller_profile_id:seller.id,p_tier_code:tier
    });
    if (reservationError || typeof requestId!=="string") {
      console.error("CHECKOUT_RESERVATION_FAILED",reservationError?.code || "invalid_result");
      return json({error:"CHECKOUT_RESERVATION_UNAVAILABLE"},409);
    }
    const session = await stripe.checkout.sessions.create({
      mode:"subscription",
      line_items:[{price:prices[tier],quantity:1}],
      client_reference_id:seller.id,
      customer_email:user.email || undefined,
      success_url:origin+"/?stripe_checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:origin+"/?stripe_checkout=cancel",
      metadata:{project:"cardora",seller_profile_id:seller.id,tier,checkout_request_id:requestId},
      subscription_data:{metadata:{project:"cardora",seller_profile_id:seller.id,tier,checkout_request_id:requestId}}
    },{idempotencyKey:`cardora_checkout_${requestId}`});
    return json({checkout_url:session.url,environment:"sandbox"});
  } catch (e) {
    console.error("STRIPE_CHECKOUT_FAILED", e instanceof Error ? e.message : "unknown");
    return json({error:"CHECKOUT_FAILED"},502);
  }
});
