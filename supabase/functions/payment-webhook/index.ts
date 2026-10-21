// Provider webhook endpoint scaffold. Must remain disabled for financial state changes until
// the chosen provider's signature-verification SDK and event mapping are implemented.
const corsHeaders = { "Content-Type": "application/json; charset=utf-8" };
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const provider = Deno.env.get("CARDORA_PAYMENT_PROVIDER");
  const webhookSecret = Deno.env.get("CARDORA_PROVIDER_WEBHOOK_SECRET");
  if (!provider || !webhookSecret) {
    return json(503, { error: "webhook_provider_not_configured", processed: false, financial_state_changed: false });
  }
  // IMPORTANT: a secret existing is not sufficient. Implement the provider-specific signature
  // verification over the raw request body before parsing or trusting any event fields.
  // Then verify amount/currency/order/merchant, deduplicate provider event ID, update status
  // idempotently, and post balanced ledger entries in one database transaction.
  return json(501, { error: "provider_signature_adapter_not_implemented", processed: false, financial_state_changed: false });
});
