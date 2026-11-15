# ToyyPay Seller Subscription Sandbox

This integration is deployed to the Cardora Staging Supabase project only. It uses the ToyyPay sandbox host and never activates a subscription from a browser redirect.

## Required Supabase Edge Function secrets

Set these in Supabase Dashboard → Project Settings → Edge Functions → Secrets:
- `TOYYIBPAY_SANDBOX_SECRET_KEY`: secret key from the ToyyPay developer/sandbox account.
- `TOYYIBPAY_SANDBOX_CATEGORY_CODE`: category code created inside that same sandbox account.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically. Never place these values in GitHub or browser code.

## Functions

- `create-toyyibpay-subscription-bill` (JWT required): accepts `{ "plan_code": "ai_basic" }`, creates a server-priced payment intent, creates a bill at `https://dev.toyyibpay.com`, stores the bill code, and returns the sandbox checkout URL.
- `toyyibpay-subscription-callback` (public provider callback): validates ToyyibPay's MD5 callback hash, then independently calls `getBillTransactions` and checks successful status, external reference, invoice reference and exact MYR amount before invoking the service-role-only activation RPC.

## Safety

- No production ToyyPay endpoint or credentials are used.
- No browser-supplied amount is accepted.
- The return URL is not treated as proof of payment.
- Payment activation is idempotent and only callable by service role.
- If required sandbox secrets are missing, functions fail closed with `SANDBOX_PAYMENT_NOT_CONFIGURED`.
- No automatic recurring charge is configured.