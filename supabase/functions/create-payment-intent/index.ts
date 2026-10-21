// Cardora payment-intent endpoint contract — deliberately fail-closed until a provider adapter is implemented.
// No charge is created by this scaffold. Do not return a checkout URL or success status here.
const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CARDORA_ALLOWED_ORIGIN") ?? "https://example.invalid",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("Authorization");
  const apiKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!auth || !apiKey || !supabaseUrl) return json(503, { error: "server_auth_not_configured", payment_created: false });
  // Validate the caller's Supabase session. Do not trust user_id, amount or currency sent by the browser.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: auth, apikey: apiKey } });
  if (!userRes.ok) return json(401, { error: "authentication_required", payment_created: false });
  const user = await userRes.json();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json", payment_created: false }); }
  if (typeof body.order_id !== "string" || body.order_id.length < 1 || body.order_id.length > 100) return json(400, { error: "invalid_order_id", payment_created: false });
  const idem = req.headers.get("Idempotency-Key");
  if (!idem || idem.length < 12 || idem.length > 200) return json(400, { error: "valid_idempotency_key_required", payment_created: false });
  // TODO before enabling: fetch the order from the database using server-side credentials;
  // verify owner, inventory, order total, currency and order state; then create a provider intent
  // using a server-held secret and persist provider identifiers idempotently.
  console.warn("Cardora payment adapter not configured; authenticated request rejected without charge", { user_id: user.id, order_id: body.order_id });
  return json(503, { error: "payment_provider_not_configured", message: "No payment was created or charged. Cardora checkout is not enabled yet.", payment_created: false });
});
