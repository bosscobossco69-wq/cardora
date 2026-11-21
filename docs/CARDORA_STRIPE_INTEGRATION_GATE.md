# Cardora Stripe Billing — integration gate (DRAFT, NOT DEPLOYED)

## Current state (21 November 2026)
- Dedicated **Cardora Sandbox** has three verified recurring MYR prices:
  - Basic RM29: `price_1UdnAbDNJlzqcLqZXDlS9GUX`
  - Pro RM79: `price_1UdnAdDNJlzqcLqZqsTsG6wj`
  - Business RM199: `price_1UdnAeDNJlzqcLqZQ3Vkd2xp`
- Live Stripe business KYC verified, but do NOT use Live in this draft.
- GitHub `index.html` currently authenticates against **crqqockaetgacddxkqpb** (`pokemon-treasure-demo`).
- The **fdkfquvzbswxocyrhduk** (`cardora`) Supabase project contains the seller subscription schema.
- Therefore real-site authentication cannot safely map to that subscription database today.
- ToyyibPay Edge Functions remain deployed and need a separate approved disable operation. Old wallets must stay disabled, with data retained.
- Current frontend CSP `connect-src` only allows the legacy Supabase origin. This needs review when switching backend.
- Stripe Webhook endpoint not created because no verified deployed HTTPS receiver exists.

## Files staged by this PR
- `supabase/functions/cardora-stripe-checkout/index.ts`: login-validated, seller-bound Stripe-hosted checkout, sandbox-only key guard.
- `supabase/functions/cardora-stripe-webhook/index.ts`: Stripe signature verification, server-side price whitelist, sync by invoice paid/failed/deleted, service-role-only DB RPC.
- `supabase/migrations/DRAFT_cardora_stripe_subscription_schema.sql`: **NOT EXECUTED**; private payment event receipt, Stripe subscription link, idempotent RPC.

## Hard gates BEFORE any deployment, SQL, or accepting payment
1. Decide account/Auth migration path for existing users. Do NOT change URL or anon key globally without migrating Auth users, relationships, roles, and policy checks with tested rollback.
2. Confirm actual rows in `seller_subscription_plans`, including Basic/Pro/Business plan codes and price/currency. Map `STRIPE_DB_PLAN_*` to real existing plan codes; no assumption of their values.
3. Review SQL against actual constraints, subscription uniqueness indexes, and RLS; apply only after full backup to a disposable Supabase branch. Validate rollback.
4. Validate Stripe's invoice event API shapes against the selected API version and SDK. Test invoices, retries, out-of-order delivery, canceled subscription, and account changes.
5. Check current subscription lifecycle logic, trials, grace-period rules, seller permissions, and cancel-at-period-end handling. This draft deliberately does not implement customer portal or portal cancellation updates.
6. Deploy sandbox-only Edge Functions **only to an isolated staging Supabase project** after relevant Auth migration and secret provisioning. Set checkout function `verify_jwt=true`; webhook `verify_jwt=false` (it verifies Stripe signature instead).
7. Configure the named variables in the staging Edge Function environment, never in frontend or GitHub:
   `STRIPE_SECRET_KEY` (sk_test only), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASIC`,
   `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_DB_PLAN_BASIC`,
   `STRIPE_DB_PLAN_PRO`, `STRIPE_DB_PLAN_BUSINESS`, `CARDORA_SITE_ORIGIN`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
8. Only after staging receiver is live, create a **sandbox-only** Stripe Webhook destination for
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`;
   secure signing secret; confirm deliveries and retries in Stripe Workbench.
9. Wire the frontend seller subscription button to checkout using the user's logged-in JWT; only navigate to the returned HTTPS Stripe Checkout URL. Do not grant access from browser redirect.
10. Keep Live checkout, old wallets, buyer-to-seller payouts, Stripe Connect distributions, and ToyyibPay disabled until independently verified.
11. Verify with test cards: success, decline, retry, duplicated webhook, canceled/replaced plan, price tampering, user A accessing user B, and legacy-user migration. Check RLS advisors.
12. Confirm Malaysian tax treatment independently before going Live; "not SST registered" is not a general determination for all sales taxes.

## Known draft gaps
- No production front-end wiring or DNS changes, by design.
- No real payment simulation completed.
- The current event strategy needs invoice/period contract tests and explicit ordering protection.
- Original site uses legacy Auth; this is a BLOCKER, not a minor config change.
- No Stripe Portal or plan upgrade/proration/discount policy yet.

This is a review branch only. No SQL was executed, no Supabase Edge Functions deployed, and no Stripe Live payments or Webhook endpoints created.

## 21 Nov audit hardening (draft branch only)
- Checkout explicitly fails closed unless `CARDORA_AUTH_MIGRATION_VERIFIED=true`; this flag MUST NOT be enabled until Auth mapping is actually verified.
- Checkout requires seller `status=approved` and `verification_status=verified`. Confirm exact enum values and seller onboarding policy in a staging database before enabling the flag.
- Existing subscription links are blocked; a one-hour Stripe idempotency key reduces repeated session requests, but does **not** replace a transactional reservation. Concurrent first-time sessions remain a **blocking issue**.
- Webhook ignores `invoice.paid` when Stripe currently marks subscription not active/trialing, and also fails closed until migration is confirmed.
- Draft SQL rejects replacement of an existing Stripe subscription and will not shorten an already recorded paid billing period.
- **Still blocking:** Stripe event ordering for failures and cancellation, exact Stripe SDK invoice payload compatibility, race-free session creation, subscription cancellation portal, service policy eligibility, and database Auth migration.
- **Security note:** A checkout success redirect is never proof of payment; only signature-checked server notifications may update membership.
- **Review requirement:** Staged migration has not been executed. The code has not passed integration or build tests. No Stripe webhook endpoint exists.
