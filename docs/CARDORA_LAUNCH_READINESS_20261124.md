# Cardora payment / member / email release blockers (24 Nov 2026)
**DRAFT / READ-ONLY REVIEW.** Do not merge PR #6, deploy Edge Functions, run SQL on production, switch Stripe Live, or charge real customers on the strength of offline checks alone.

## Confirmed state
- Cardora Stripe **Live**: charges_enabled=true, payouts_enabled=true, default Maybank MYR last4 9629. Account eligibility is not website integration.
- Cardora Stripe **Sandbox**: standalone Basic RM29 Checkout completed with paid invoice and active Stripe subscription. It was not linked to a Cardora user; it did not fulfill Cardora membership or send a Cardora email.
- Stripe Sandbox classic webhook endpoints: **0** at last read.
- Supabase project `fdkfquvzbswxocyrhduk` has 4 currently deployed Edge Functions; Stripe Checkout, Stripe webhook and Cardora payment-email worker are **not deployed**.
- Cardora Vercel project `cardora` does have READY **preview** deployments. They are not evidence that Edge Functions or migrations have been released.
- The existing public frontend may still authenticate against legacy project `crqqockaetgacddxkqpb`; subscription tables reside in Cardora project `fdkfquvzbswxocyrhduk`. Old/new Auth identity mapping has not passed real-account verification.
- Cardora PR #6 passes offline signed-webhook handler, mocked Resend worker and disposable PostgreSQL contract tests. Such tests do **not** establish deliverability or production readiness.

## Read-only security advisors (Supabase, Cardora project)
- **INFO**: 25 tables have RLS enabled with no policies, including `seller_subscriptions`, `seller_subscription_plans`, and `seller_subscription_payment_intents`. This may be intentional server-only access. Do not grant blanket authenticated access to make the UI work.
- **WARN**: 8 security-definer functions executable by authenticated role. Review ownership, authorization conditions and least-privilege grants individually. These warnings alone are not proof of a vulnerability.
- **WARN**: compromised-password protection not enabled. Determine plan eligibility and use safer password settings.
- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable


## Auth cutover decision — free plan and non-destructive workflow
- Public Cardora preview/source currently signs into **legacy Supabase** `crqqockaetgacddxkqpb`; the **new** Cardora project `fdkfquvzbswxocyrhduk` owns `public.users`, seller records, and subscriptions. A valid session in the old project is **not** proof of new-project authorization.
- The draft staging builder points at the **new** project with a different browser storage key; its own-account **Check account link** panel performs read-only new Auth → `users.auth_user_id` → `seller_profiles.user_id` lookups. This has not been tested using a real new-project login.
- Existing legacy users cannot be linked by a matching email, guessed UUID, or unverified browser data. Preserve old login and order histories. An owner-approved migration would need a verified account-ownership procedure, conflict handling, a rollback plan, and confirmation of how existing active seller subscriptions are treated.
- The Stripe Checkout handler already uses new-project `auth.getUser()` and service-side membership ownership checks and refuses unapproved/unverified sellers; it remains locked behind `CARDORA_AUTH_MIGRATION_VERIFIED` and `CARDORA_CHECKOUT_RESERVATION_VERIFIED`. Never flip either flag before evidence and owner approval.
- **No-money next steps:** keep offline database and Edge-handler tests running, gather read-only new-project Auth/RLS health information, and complete owner-facing review of exact migration and webhook steps. **Live acceptance requires authorization** before modifying either existing project, deploying functions, creating webhooks, or sending real payment confirmations.
- **Release blocker:** as of this review, Stripe Checkout, signed webhook, and email worker are *not* deployed to the Cardora project. A READY Vercel Preview and passing offline checks do not allow paid seller subscriptions.

## Owner-approved Option B: existing Cardora project, sandbox-only test preparation
Permission received: test account and **Stripe Sandbox** test configuration are allowed. **No DB schema migration, Edge Function deployment, real-user mutation, Stripe Live change, production deployment or merger** without separate permission.

### Live read-only prerequisites verified on 24 Nov 2026
- Cardora Supabase `fdkfquvzbswxocyrhduk`: `ACTIVE_HEALTHY`, PostgreSQL 17, no development branches. There is no existing cost-free branch to use.
- `public.users.auth_user_id` is **UNIQUE** and a foreign key to `auth.users(id)`; `public.seller_profiles.user_id` is **UNIQUE** and a foreign key to `public.users(id)`. This supports one Auth identity → one app user → one seller profile, but does NOT provision those rows automatically.
- `users_select_own`: only authenticated clients matching `auth.uid() = users.auth_user_id` can SELECT. `seller_profiles_select_own`: only authenticated clients matching `seller_profiles.user_id = current_user_row_id()` can SELECT. No client INSERT/UPDATE policy was observed for these two tables.
- `seller_subscriptions` has RLS with **no** direct client policies; server-side membership fulfillment is required. Missing Stripe tables/functions must not be assumed installed.
- Stripe Cardora Sandbox account `acct_1UbuWvDNJlzqcLqZ`: actual three active MYR monthly prices verified (2900, 7900, 19900 minor units); classic Webhook endpoints: **zero**. Stripe Live was not changed.

### Safe preparation sequence and stop conditions
1. Obtain a **real test mailbox owned by the merchant** and an Auth registration method. A guessed `@example.invalid` mailbox cannot satisfy an email verification flow. Never put credentials or email tokens in GitHub commits.
2. Register **one** new Cardora Auth test user via Supabase Auth, ideally using a browser sign-up with email verification (or Google OAuth only if callback allowlisting is verified). Because current integration does not have a connected Auth-admin user-creation capability, there is **no newly created test Auth user** yet.
3. Before inserting a test `public.users` row, verify the newly created `auth.users.id` exists and has no `public.users.auth_user_id` match. Choose role `buyer` (or the least-privileged actual allowed role), status `active`, and a new unique `member_id`. New account linking must use exact verified Auth UID, **never email matching**. Create a related seller profile **only** for the approved test identity; never promote a pre-existing user to admin.
4. Verify own-row SELECT succeeds and cross-user SELECT fails under RLS. No elevated role or test money/credits should be assigned. Record only anonymous result booleans; do not print tokens or personal data.
5. **STOP: separate approval required** before any draft SQL migration or Supabase Edge Function deployment. The Stripe Sandbox Webhook cannot point to a nonexistent deployed function. Do not create a dead endpoint just to show configuration.
6. Once the backend release is separately authorized and deployed, register a Sandbox-only signed webhook endpoint for `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `checkout.session.completed`, and relevant risk events. Verify all destination secrets and test signed delivery before enabling checkout gates.
7. Use a verified test seller with **no existing current subscription**. Verify invoice fulfillment, retries/dedup, customer portal, cancellation, and test email arrival. Never use Sandbox results as proof Live is ready.

**This preparation round performed read-only catalogue/RLS inspection and draft documentation only; no real or test accounts, webhook endpoints, DB writes or deployments were created.**

## Required isolated acceptance gates
1. Use **GitHub Actions disposable PostgreSQL 17** for no-cost schema, contract, idempotency and replay regression tests. This is not a persistent Supabase Auth/Edge/Stripe webhook environment. A persistent isolated Supabase backend would require separate availability/funding approval; **do not create or upgrade a project** as part of the current RM0 plan. A temporary synthetic account in the existing Cardora project must **not** be created unless the owner explicitly authorizes changes to that live project.
2. Establish isolated Auth identity and seller approval; verify `auth.users.id -> public.users.auth_user_id -> seller_profiles.user_id` using a synthetic test seller, and verify ownership denials and appropriate SELECT policies.
3. Apply and verify draft migrations **only** in that isolated database, including replay/cancel/renewal and mail outbox unique invoice checks.
4. Deploy isolated Stripe test-key-only Checkout/webhook/worker with explicit verified domain and secret values, never printed in GitHub logs.
5. Create a fresh Stripe Sandbox session **linked to the synthetic approved seller**, pay with a test card, verify signed `invoice.paid` delivered to webhook, actual membership activated and outbox contains one row.
6. Use a verified Resend sender domain and deliver one test notification to the approved test mailbox; confirm delivery at mailbox, not only Resend API acceptance. Confirm no duplicate after Stripe retry.
7. Review cancellation / portal / refund / dispute workflows and customer support contact and cancelation terms. Reconcile existing seller memberships before any release.
8. Only after owner approval consider a separate **Live** rollout plan; never copy Sandbox subscription objects to Live and never turn on seller marketplace Connect charges unintentionally.

**Latest inspection did not alter live data, bank settings, webhook configuration or production code.**
