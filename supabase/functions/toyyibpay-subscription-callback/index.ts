import { createClient } from "npm:@supabase/supabase-js@2";
import md5 from "npm:js-md5@0.8.3";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("TOYYIBPAY_SANDBOX_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !secret) return json({ error: "SANDBOX_PAYMENT_NOT_CONFIGURED" }, 503);

  const form = await req.formData();
  const status = String(form.get("status") || "");
  const orderId = String(form.get("order_id") || "");
  const refNo = String(form.get("refno") || "");
  const billCode = String(form.get("billcode") || "");
  const receivedHash = String(form.get("hash") || "").toLowerCase();
  if (!status || !orderId || !refNo || !billCode || !receivedHash) return json({ error: "MISSING_CALLBACK_FIELDS" }, 400);

  const expected = md5(secret + status + orderId + refNo + "ok");
  if (expected !== receivedHash) return json({ error: "INVALID_CALLBACK_HASH" }, 401);
  if (status !== "1") return json({ received: true, payment_status: status });

  const service = createClient(supabaseUrl, serviceKey);
  const { data: intent, error: intentError } = await service.from("seller_subscription_payment_intents")
    .select("id,amount,currency,provider_bill_code,status,expires_at")
    .eq("id", orderId).maybeSingle();
  if (intentError || !intent) return json({ error: "PAYMENT_INTENT_NOT_FOUND" }, 404);
  if (intent.provider_bill_code !== billCode) return json({ error: "BILL_CODE_MISMATCH" }, 409);
  if (intent.status === "paid") return json({ received: true, already_processed: true });
  if (new Date(intent.expires_at).getTime() < Date.now()) return json({ error: "PAYMENT_INTENT_EXPIRED" }, 409);

  const verifyForm = new URLSearchParams({ billCode, userSecretKey: secret, billpaymentStatus: "1" });
  const verifyResponse = await fetch("https://dev.toyyibpay.com/index.php/api/getBillTransactions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyForm,
  });
  if (!verifyResponse.ok) return json({ error: "PROVIDER_VERIFICATION_UNAVAILABLE" }, 502);
  let transactions: any;
  try { transactions = await verifyResponse.json(); } catch { return json({ error: "INVALID_PROVIDER_RESPONSE" }, 502); }
  if (!Array.isArray(transactions)) return json({ error: "NO_VERIFIED_TRANSACTION" }, 409);

  const tx = transactions.find((t: any) =>
    String(t.billpaymentStatus) === "1" &&
    String(t.billExternalReferenceNo) === orderId &&
    String(t.billpaymentInvoiceNo || "") === refNo &&
    Math.abs(Number(t.billpaymentAmount) - Number(intent.amount)) < 0.005
  );
  if (!tx) return json({ error: "TRANSACTION_DETAILS_MISMATCH" }, 409);

  const { data: applied, error: applyError } = await service.rpc("apply_verified_seller_subscription_payment", {
    p_payment_intent_id: intent.id,
    p_provider_bill_code: billCode,
    p_provider_transaction_ref: refNo,
    p_verified_amount: Number(tx.billpaymentAmount),
    p_verified_currency: "MYR",
  });
  if (applyError || applied !== true) return json({ error: "SUBSCRIPTION_ACTIVATION_FAILED" }, 500);
  return json({ received: true, activated: true });
});