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


## Wallet payment methods: Apple Pay and Google Pay (21 Nov 2026)
- **Decision:** Stripe-hosted Checkout for Basic RM29 / Pro RM79 / Business RM199 subscriptions; allow compatible cards, Apple Pay and Google Pay through Stripe's eligible payment method selection.
- Existing Checkout session draft has `mode:"subscription"` and **does not force** `payment_method_types`, so there is no wallet-specific code requirement for the hosted flow. Do not assume wallets appear on every device or for every customer.
- Stripe documentation states hosted Checkout needs no extra Apple Pay domain registration (embedded Checkout/Elements have different requirements). If moving away from hosted Checkout, reassess domain registration and iframe/browser support.
- Stripe documentation lists Apple Pay and Google Pay as supporting recurring subscriptions, subject to device, browser, region, and wallet/card eligibility.
- **Sandbox QA gate:** after independent staging Auth migration, payment link setup and webhook deployment, verify (1) card checkout succeeds; (2) Apple Pay displays and completes on supported Apple device with card provisioned; (3) Google Pay displays and completes on supported Android/Chrome with eligible saved card; (4) wallets absent on noneligible devices while card payment remains available; (5) `invoice.paid` webhook applies membership exactly once; (6) payment failure, cancellation, renewal, and out-of-order delivery are handled; (7) zero live charges.
- Do not insert static payment badges promising all customers wallet availability until the device-based acceptance tests have passed.
- No changes to existing MYR amounts, subscription products, seller data, Live Stripe settings, or deployment in this revision.
- Official references: https://docs.stripe.com/apple-pay?platform=web ; https://docs.stripe.com/google-pay?platform=web ; https://docs.stripe.com/testing/wallets

## 22 November 2026 — additional draft checkout hardening
- Customer identity is verified with Supabase Auth `getUser()`; public users/seller rows are then resolved by a server-side service-role client **using only that verified Auth UUID**. No browser-provided seller or owner ID is trusted.
- Before creating Checkout, the server now fetches the selected Stripe Price and validates Sandbox-only, active, MYR, monthly recurring, and exact unit amount (RM29/RM79/RM199). This prevents accidentally accepting a wrong configured price ID.
- Added a fail-closed `CARDORA_CHECKOUT_RESERVATION_VERIFIED` flag. **Do not set it to true.** A read-before-create check and a one-hour idempotency key are insufficient to prevent concurrent first-time purchases; an atomic server-side reservation must be developed and integration-tested before lifting this gate.
- This change deliberately does **not** create or charge any payments and does **not** make Checkout production-ready. The next engineering requirement is transaction-safe reservation with expiry/recovery, verified against Stripe Checkout session lifecycle.
- Do not grant general users access to any Stripe service-role API. The server-side service key stays in function secrets only.

## 22 November 2026 — atomic Checkout reservation draft (not tested/deployed)
- Added `cardora_stripe_checkout_reservations`, keyed uniquely by seller, and service-role-only `cardora_reserve_stripe_checkout(uuid,text)`. Concurrent requests for the same seller/tier get one durable request UUID.
- Checkout uses that request UUID as its Stripe idempotency key. The same tier can retry the same request; a different tier is blocked. After **20 hours**, the reservation is **not automatically recycled**; a human must reconcile the Stripe Checkout Session/subscription and decide whether clearing it is safe.
- This intentionally favors preventing duplicate charges over automatic self-service retries. Missing/failed callbacks, sessions abandoned by a buyer, or an unknown Stripe response can leave a reservation that requires manual support.
- This is **not** evidence of race-free correctness yet: migration must be rehearsed in disposable staging and tested under simultaneous requests, Stripe API timeouts, retries, late webhook events and session expiration. The launch flag `CARDORA_CHECKOUT_RESERVATION_VERIFIED` MUST remain unset.
- No separate auto-release RPC exists. Do not delete reservations without verifying that the linked Stripe session is expired and no active subscription/payment exists.
- Back-end code still does not implement a seller subscription portal, automatic checkout recovery after a canceled session, or complete subscription lifecycle semantics.

## 22 November 2026 — signed Checkout reservation correlation
- Webhook reads `subscription.metadata.checkout_request_id` from the Stripe-retrieved subscription and requires a valid UUID for `invoice.paid`.
- The service-only SQL RPC now takes `p_checkout_request_id uuid` and compares it with the exact per-seller reservation `request_id`, tier and seller. An unrelated subscription cannot activate a membership based only on the seller ID and tier.
- Cancellation / payment-failed notifications still require matching an existing Stripe subscription link; no implicit user creation or free membership elevation.
- `invoice.paid` period semantics, Webhook ordering, and Stripe invoice API-version compatibility still require independent staging tests before enabling checkout.
- Both Edge Functions and migration remain unexecuted draft code; no Live/Sandbox payments have been generated by this patch.

## 22 November 2026 — event ordering watermark (draft only)
- `cardora_stripe_subscription_links.last_event_created` records the Stripe `event.created` Unix timestamp of the last applied event for a subscription.
- The service-only RPC now requires `p_event_created bigint`; after persisting an event receipt, it ignores events whose timestamp is older than or equal to the last applied event. This prevents stale failure/cancellation events from overriding a later paid event, including duplicate second-granularity events.
- **Known limitation:** different legitimate Stripe events can share the same second; the current policy ignores the second event rather than risk unauthorized elevation. This requires a reconciliation process and tests before launch.
- **Critical remaining gate:** `invoice.paid` currently calculates the credited period using the **retrieved subscription item's current period**, not the signed invoice line's actual paid period. Delayed invoice delivery could otherwise grant a later cycle than was actually paid. Must replace this with validated invoice-line period and amount before deployment.
- Neither the SQL migration nor Stripe Edge Functions have been run in a database or integration test. Vercel Preview status does not validate SQL or Stripe Webhook behavior.
