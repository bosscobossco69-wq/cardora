# Cardora — pre-release gate (2026-11-22)

**STATUS: NOT APPROVED FOR LIVE BILLING.** This file is an operator checklist, not proof of deployment.

## Already accomplished in PR #6
- Cardora Live Stripe product catalog verified directly: Basic MYR 29/month, Pro MYR 79/month, Business MYR 199/month.
- Sandbox Checkout, signature-verified webhook, risk queue and Customer Portal server code drafted with explicit fail-closed guards. New checkout/portal code has not been deployed or charged a customer.
- Cardora administrator overview drafted: new-project counts, source-separated legacy archive and explicit suspected-test markers. Ordinary visitors cannot access privileged data through the draft API.
- Replaced a malformed **37 KB** duplicated Stripe SQL draft with a **12 KB** single-definition migration. GitHub CI checks unique definitions, JavaScript syntax, and PostgreSQL SQL grammar without connecting to a database.
- Standalone /privacy.html and /terms.html draft pages created (both carry DRAFT notices and robots noindex). Do **NOT** submit them to Stripe as final until business identity and terms are verified.
- App code changes remain in the Draft PR only; not merged to production.

## Hard blockers to finish safely
1. **Database isolation:** User currently has two active free Supabase projects; there is no disposable staging project. DO NOT run migrations on either active project to simulate staging, create a duplicate administrator, or reset accounts. Set up authorized isolated test environment or reliable reversible snapshot with real tests first.
2. **Auth cutover:** Old public website signs into `crqqockaetgacddxkqpb`, while canonical Cardora data is in `fdkfquvzbswxocyrhduk`. The one overlapping email maps to different Auth UUIDs. Do not copy roles or passwords by email. Verify a new-project admin can actually sign in on a nonproduction origin and access review endpoints, and that ordinary users cannot.
3. **Legacy history:** Existing old applications must remain read-only; the optional legacy server key is a powerful credential and must be replaced with a least-privilege read-only approach before real production use.
4. **Actual payments:** Sandbox success, failure, duplicate event, renew, cancel-at-period-end, payment failure recovery, dispute/refund and Cross-user seller authorization tests MUST be performed using the signed webhook and staging DB. The Checkout reservation is intentionally manual-reconciliation-only; it may block repeat purchases until an administrator reviews it.
5. **Source project compatibility:** Existing site's seller application list, listing/approval, orders, account and payment code must pass authenticated browser testing against the canonical project. Do not enable buyer-to-seller payouts, old wallet, ToyyibPay or any untested payment service.
6. **Legal identity:** Legal operator's true name/address/registration eligibility, customer service method, actual privacy/cookie notice, refund/cancellation terms and Malaysia tax responsibilities need human review. A brand name is not a legal entity by itself.
7. **Vercel access/deploy:** Vercel app connector currently cannot find a project by `cardora` or `cardora-rose` in its connected scope. Prior preview attempts were rate-limited. Do not invent a Preview URL, merge PR #6 or promote to production until the correct Vercel project is accessible and an authenticated preview passes tests.

## Exact production-cutover order (only after blockers cleared)
- Obtain an immutable backup/snapshot of both active databases; verify restore procedure and customer identity mappings.
- Apply only reviewed migration(s) in disposable staging; verify RLS, grants, SQL functions, OAuth and Webhook/Portal endpoint secret ownership.
- Complete GitHub static checks plus end-to-end sandbox tests with distinct admin, buyer, seller and attacker accounts.
- Publish and manually verify legal pages with real operator identity and customer support contact. Set matching public URLs in Stripe.
- Confirm Live Stripe account onboarding/payments, 3 recurring Live price IDs and webhook endpoint. Create a **separate audited Live implementation**; never disable the Sandbox-only sk_test guard by simply substituting sk_live.
- Stage production build without domain switch, confirm original login and historical data, test payment with an approved small live charge/refund, then deploy with rollback and monitoring.
- Only then allow real subscriptions on the storefront and mark this release gate complete.

## Operator URLs
- Current website (still old-auth-backed): https://cardora-rose.vercel.app/
- Draft PR: https://github.com/bosscobossco69-wq/cardora/pull/6
- Canonical database: https://supabase.com/dashboard/project/fdkfquvzbswxocyrhduk
- Legacy archive: https://supabase.com/dashboard/project/crqqockaetgacddxkqpb

## One-time release status
Code draft: updated. Automated static / grammar checks: passing on last checked commit. Real authentication, database migration execution, buyer/seller payments and new website admin preview: **not verified**. Production writes, merge, deployment or Live charges: **not performed**.
