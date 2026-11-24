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
