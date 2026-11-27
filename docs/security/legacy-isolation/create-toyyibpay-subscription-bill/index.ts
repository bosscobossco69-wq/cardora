// Review-only replacement. Never import payment code or read credentials.
// Deliberate retirement of legacy sandbox payment path.
Deno.serve(() => new Response(
  '{"error":"LEGACY_PAYMENT_DISABLED"}',
  {status:410,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}}
));
