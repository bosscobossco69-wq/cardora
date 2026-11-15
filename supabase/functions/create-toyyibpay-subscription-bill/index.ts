import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://cardora-rose.vercel.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("TOYYIBPAY_SANDBOX_SECRET_KEY");
  const category = Deno.env.get("TOYYIBPAY_SANDBOX_CATEGORY_CODE");
  if (!supabaseUrl || !anonKey || !serviceKey || !secret || !category) {
    return new Response(JSON.stringify({ error: "SANDBOX_PAYMENT_NOT_CONFIGURED" }), { status: 503, headers: cors });
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }), { status: 401, headers: cors });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response(JSON.stringify({ error: "INVALID_SESSION" }), { status: 401, headers: cors });

  let body: { plan_code?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "INVALID_JSON" }), { status: 400, headers: cors }); }
  const planCode = String(body.plan_code || "");
  const { data: intentRows, error: intentError } = await userClient.rpc("request_seller_subscription_upgrade", { p_plan_code: planCode });
  if (intentError || !intentRows?.length) return new Response(JSON.stringify({ error: intentError?.message || "PAYMENT_INTENT_FAILED" }), { status: 400, headers: cors });
  const intent = intentRows[0];

  const service = createClient(supabaseUrl, serviceKey);
  const callbackUrl = supabaseUrl + "/functions/v1/toyyibpay-subscription-callback";
  const form = new URLSearchParams({
    userSecretKey: secret,
    categoryCode: category,
    billName: "Cardora Seller Plan",
    billDescription: "Seller subscription " + intent.plan_code,
    billPriceSetting: "1",
    billPayorInfo: "0",
    billAmount: String(Math.round(Number(intent.amount) * 100)),
    billCallbackUrl: callbackUrl,
    billExternalReferenceNo: intent.payment_intent_id,
    billPaymentChannel: "0",
    billExpiryDays: "1",
  });

  let providerResponse: Response;
  let providerText: string;
  try {
    providerResponse = await fetch("https://dev.toyyibpay.com/index.php/api/createBill", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    providerText = await providerResponse.text();
  } catch {
    await service.from("seller_subscription_payment_intents").update({ status: "failed", metadata: { failure: "provider_unreachable" } }).eq("id", intent.payment_intent_id).eq("status", "created");
    return new Response(JSON.stringify({ error: "TOYYIBPAY_UNREACHABLE" }), { status: 502, headers: cors });
  }

  let parsed: any;
  try { parsed = JSON.parse(providerText); } catch { parsed = null; }
  const billCode = Array.isArray(parsed) ? parsed[0]?.BillCode : parsed?.BillCode;
  if (!providerResponse.ok || !billCode || parsed?.status === "error") {
    await service.from("seller_subscription_payment_intents").update({ status: "failed", metadata: { provider_error: String(providerText).slice(0, 500) } }).eq("id", intent.payment_intent_id).eq("status", "created");
    return new Response(JSON.stringify({ error: "TOYYIBPAY_BILL_CREATION_FAILED" }), { status: 502, headers: cors });
  }

  const { error: saveError } = await service.from("seller_subscription_payment_intents")
    .update({ provider_bill_code: String(billCode), status: "bill_created", metadata: { environment: "sandbox", checkout_url: "https://dev.toyyibpay.com/" + String(billCode) } })
    .eq("id", intent.payment_intent_id).eq("status", "created");
  if (saveError) return new Response(JSON.stringify({ error: "BILL_CREATED_BUT_NOT_SAVED" }), { status: 500, headers: cors });

  return new Response(JSON.stringify({
    payment_intent_id: intent.payment_intent_id,
    plan_code: intent.plan_code,
    amount: intent.amount,
    currency: intent.currency,
    checkout_url: "https://dev.toyyibpay.com/" + String(billCode),
    environment: "sandbox",
  }), { status: 200, headers: cors });
});