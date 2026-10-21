// Cardora seller payout request contract — intentionally fail-closed until a provider adapter is implemented.
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
  if (!auth || !apiKey || !supabaseUrl) return json(503, { error: "server_auth_not_configured", payout_request_created: false });
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: auth, apikey: apiKey } });
  if (!userRes.ok) return json(401, { error: "authentication_required", payout_request_created: false });
  const user = await userRes.json();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json", payout_request_created: false }); }
  if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) return json(400, { error: "valid_currency_required", payout_request_created: false });
  const idem = req.headers.get("Idempotency-Key");
  if (!idem || idem.length < 12 || idem.length > 200) return json(400, { error: "valid_idempotency_key_required", payout_request_created: false });
  // TODO: calculate eligible balance from posted ledger entries; never accept amount or destination
  // as authoritative from the client. Verify seller onboarding, KYC/AML requirements, payout account,
  // sanctions/region eligibility, holds, reserves and provider rules before creating a payout request.
  console.warn("Cardora payout adapter not configured; no payout request created", { seller_id: user.id, currency: body.currency });
  return json(503, { error: "payout_provider_not_configured", message: "No payout request was created and no money was transferred.", payout_request_created: false });
});
