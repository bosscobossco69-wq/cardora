# Cardora — pre-release gate (2026-11-22)

**STATUS: NOT APPROVED FOR LIVE BILLING.** This file is an operator checklist, not proof of deployment.

## Already accomplished in PR #6
- Cardora Live Stripe product catalog verified directly: Basic MYR 29/month, Pro MYR 79/month, Business MYR 199/month.
- Sandbox Checkout, signature-verified webhook, risk queue and Customer Portal server code drafted with explicit fail-closed guards. New checkout/portal code has not been deployed or charged a customer.
- Cardora administrator overview drafted: new-project counts, source-separated legacy archive and explicit suspected-test markers. Ordinary visitors cannot access privileged data through the draft API.
- Replaced a malformed **37 KB** duplicated Stripe SQL draft with a **12 KB** single-definition migration. GitHub CI checks unique definitions, JavaScript syntax, and PostgreSQL SQL grammar without connecting to a database.
- Standalone /privacy.html and /terms.html draft pages created (both carry DRAFT notices and robots noindex). Do **NOT** submit them to Stripe as final until business identity and terms are verified.
- App code changes remain in the Draft PR only; not merged to production.

## Additional live read-only audit (2026-11-22)
- Vercel connector: accessible team **Pokemon Treasure** (`pokemon-treasure`) lists **only** `kenji-smart-tools`. Neither `cardora` nor `cardora-rose` is visible to this connected Vercel scope. The website may be on another account or team; do not create a duplicate project or claim deployment is possible from this connection.
- New Cardora Supabase security advisor reports 8 authenticated-callable SECURITY DEFINER functions. This is an advisory requiring per-function authorization review, not proof of external exploit.
- Read-only introspection found 3 admin moderation RPC functions checked role but **not** the admin user's active status: `admin_get_listing_review_queue`, `admin_review_listing`, `admin_review_seller_application`. The reviewed definitions were captured and hardened in `supabase/drafts/CARDORA_DRAFT_admin_active_status_guard.sql`, preserving parameter signatures, with role+active requirement and an upper bound of 100 listing queue rows. This is **not applied** to the active database.
- The PR offline GitHub workflow now parses both Stripe and admin SQL drafts with PostgreSQL grammar, and validates JavaScript syntax. Latest admin guard grammar run completed **successfully**, but this cannot substitute for database authorization tests.

## Vercel and Supabase live deployment verification (read-only; 2026-11-22)

- **ChatGPT Vercel authorization now works.** Verified team `pokemon-treasure`, project `cardora`, id `prj_6iPkqIVQOJbtBemiq9YJaIsq64mm`, and verified public domain `cardora-rose.vercel.app`. Earlier missing-project reports reflected incomplete connector authorization, not a deleted project.
- Vercel production on `main` is `READY`, deployment `dpl_HhJy33tmhKkFGMueP8oxYDGuBgGL` at commit `2f95809594699dcd67e729e24cb2259766e52428`. It still points to legacy Supabase Auth.
- PR #6 latest returned Preview is `READY` (deployment `dpl_H2iZSHipYRGvjBjyGVwe8qgyVmLm`), sourced from `draft/stripe-sandbox-subscriptions-20261121` commit `c8b8fbaf5f6a3bd9641b9c7aa229d845eefe16ce`. This **does not establish a working new-Supabase staging frontend**: Vercel public project environment-variable listing is empty; the `scripts/build-cardora-staging.mjs` builder is opt-in and cannot run without `CARDORA_STAGING_BUILD=YES`, new project URL and the public publishable key. Main source `index.html` still points to legacy Supabase. The deployment file-tree API cannot enumerate Git deployments (404) and is not evidence files are missing.
- Preview deploy is protected by Vercel SSO `all_except_custom_domains`. Do **not** bypass its protection to expose an untested admin UI.
- New Cardora Supabase Edge Functions currently deployed: `create-toyyibpay-subscription-bill`, `toyyibpay-subscription-callback`, `ai-support`, `ptx-email-otp`. The four draft functions `cardora-admin-overview`, `cardora-stripe-checkout`, `cardora-stripe-portal`, and `cardora-stripe-webhook` are **not deployed**. Do not enable their verification flags or assume they work.
- GitHub offline checks remain separate from runtime authentication, RLS and signed webhook tests. **No production SQL, GitHub merge, Edge Function deployment, Live payment or Vercel promotion was performed.**

### Safe next operator gates

1. Create a **nonproduction** isolated browser build and verify it actually contains `cardoraAdminOverview`, the new Supabase public URL, isolated auth storage and the correct CSP. Never overwrite the production HTML.
2. Verify all four new Supabase functions in a disposable staging environment, with role-based tests and approved secrets. No destructive test writes to either existing active Supabase project.
3. Test admin/new-user OAuth and email OTP, including refresh and wrong-project tokens; prove legacy history is read-only and client secrets never leak.
4. Complete Stripe Sandbox signed-webhook lifetime tests before deploying a separate Live billing implementation. Confirm real operator identity and legal documents.
5. After all gates pass, require an explicit release review for production migrations, domain cutover and charging customers.

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
