// Cardora Stripe Checkout — draft only; never deploy until Auth project alignment is verified.
// Required secrets: STRIPE_SECRET_KEY (sandbox), STRIPE_PRICE_BASIC/PRO/BUSINESS,
// SUPABASE_URL, SUPABASE_ANON_KEY, CARDORA_SITE_ORIGIN.
// Required: Edge Function verify_jwt=true, and user authentication from the SAME Supabase project.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const origin = Deno.env.get("CARDORA_SITE_ORIGIN") || "https://cardora-rose.vercel.app";
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store",
    "access-control-allow-origin": origin, "vary": "Origin",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS" }
});
Deno.serve(async (req) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== origin) return json({error:"INVALID_ORIGIN"},403);
  if (req.method === "OPTIONS") return json({ok:true});
  if (req.method !== "POST") return json({error:"METHOD_NOT_ALLOWED"},405);
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
  const {data:appUser,error:userError} = await client.from("users")
    .select("id,status").eq("auth_user_id",user.id).maybeSingle();
  if (userError || !appUser || appUser.status!=="active") return json({error:"CARDORA_USER_NOT_FOUND"},403);
  const {data:seller,error:sellerError} = await client.from("seller_profiles")
    .select("id,user_id").eq("user_id",appUser.id).maybeSingle();
  if (sellerError || !seller) return json({error:"SELLER_PROFILE_REQUIRED"},403);
  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode:"subscription",
      line_items:[{price:prices[tier],quantity:1}],
      client_reference_id:seller.id,
      customer_email:user.email || undefined,
      success_url:origin+"/?stripe_checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:origin+"/?stripe_checkout=cancel",
      metadata:{project:"cardora",seller_profile_id:seller.id,tier},
      subscription_data:{metadata:{project:"cardora",seller_profile_id:seller.id,tier}}
    });
    return json({checkout_url:session.url,environment:"sandbox"});
  } catch (e) {
    console.error("STRIPE_CHECKOUT_FAILED", e instanceof Error ? e.message : "unknown");
    return json({error:"CHECKOUT_FAILED"},502);
  }
});
