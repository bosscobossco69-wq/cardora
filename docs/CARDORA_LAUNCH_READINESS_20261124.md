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

## Required isolated acceptance gates
1. Approve an **isolated** persistent test backend distinct from either active production Supabase project. No assumed free Supabase branching; paid upgrade is not authorized.
2. Establish isolated Auth identity and seller approval; verify `auth.users.id -> public.users.auth_user_id -> seller_profiles.user_id` using a synthetic test seller, and verify ownership denials and appropriate SELECT policies.
3. Apply and verify draft migrations **only** in that isolated database, including replay/cancel/renewal and mail outbox unique invoice checks.
4. Deploy isolated Stripe test-key-only Checkout/webhook/worker with explicit verified domain and secret values, never printed in GitHub logs.
5. Create a fresh Stripe Sandbox session **linked to the synthetic approved seller**, pay with a test card, verify signed `invoice.paid` delivered to webhook, actual membership activated and outbox contains one row.
6. Use a verified Resend sender domain and deliver one test notification to the approved test mailbox; confirm delivery at mailbox, not only Resend API acceptance. Confirm no duplicate after Stripe retry.
7. Review cancellation / portal / refund / dispute workflows and customer support contact and cancelation terms. Reconcile existing seller memberships before any release.
8. Only after owner approval consider a separate **Live** rollout plan; never copy Sandbox subscription objects to Live and never turn on seller marketplace Connect charges unintentionally.

**Latest inspection did not alter live data, bank settings, webhook configuration or production code.**
