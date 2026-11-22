# Cardora customers dashboard — live integration release gate
Status: BLOCKED / read-only PREVIEW and draft only, 2026-11-22.
Do not merge the Preview-only vercel.json into main.

## Direct read-only findings (canonical Supabase fdkfquvzbswxocyrhduk)
- public.users: 5 profiles; 1 active admin and 4 active ordinary users.
- 5 distinct normalized email addresses, 0 empty email addresses.
- All 5 public.users.auth_user_id values link to existing auth.users entries.
- 0 orphaned references; 0 linked unconfirmed email addresses.
- public.users has RLS enabled and users_select_own SELECT policy with auth_user_id=auth.uid().
- Deployed Edge Functions: ai-support, create-toyyibpay-subscription-bill, toyyibpay-subscription-callback, ptx-email-otp. cardora-admin-overview NOT deployed.
- No Supabase preview/development branches currently exist. Creating a branch can incur usage fees; do not create without approval.

## Why this is still not real live authorization signoff
- CI mock exercises the actual handler under simulated tokens/roles; it does NOT supply a real user JWT.
- A Magic Link login proves authentication, NOT that the admin overview route is activated.
- Existing production site cardora-rose.vercel.app still authenticates via the LEGACY Supabase project. New canonical identities may have different auth UUIDs; never reconcile them by email alone.
- Preview Vercel URL changes with each commit; the Edge Function's strict CARDORA_STAGING_SITE_ORIGIN must match the exact tested deployment origin, or CORS is correctly denied.
- New Preview uses sb_publishable_*; check that real Supabase Auth access tokens (not the publishable key) are sent in Authorization for functions.invoke. Supabase's platform verify_jwt mode supports user JWT when configured for the correct auth architecture. Don't disable gateway verification casually.
- The handler currently requires SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY server-only; verify these env names exist on the target runtime. Do not substitute a publishable key into Authorization, disclose server keys, or set keys in Vercel frontend.
- Both CARDORA_ADMIN_OVERVIEW_VERIFIED and CARDORA_AUTH_MIGRATION_VERIFIED are deliberately fail-closed until real identity verification is complete.
- Do not set CARDORA_LEGACY_READ_SERVICE_KEY without a separate least-privilege legacy data review.

## Required real-environment test matrix before enabling any customer endpoint
1. Obtain the exact intended fixed Preview origin and register it in new Supabase Auth redirect allowlist; verify same-browser Magic Link and JWT.
2. Deploy only to an isolated approved target, with any necessary per-hour branch costs explicitly approved first; do not change production DB or existing Edge Functions as a shortcut.
3. Test the REAL response to unauthenticated, malformed/expired JWT, normal customer, seller, disabled admin, valid active admin, and an unexpected Origin.
4. Assert 401/403 rejection without customer payload for nonadmin, exact allow-origin only for allowlisted preview, and no private cache.
5. Verify the active admin can read only 50 capped NEW profile rows with masked customer and seller-application emails, and historical legacy data is unavailable until independently approved.
6. Verify correct counts of new Supabase rows only; distinguish 1 admin + 4 users from actual paying customers (not established).
7. Record non-sensitive test evidence (status codes and counts only). No service keys, emails or JWTs in logs/screenshots.
8. Approve feature-gate activation and a rollback plan. Do not merge draft preview build override into production main.
9. Separately complete customer sign-up/password auth migration, email marketing opt-in, unsubscribe and sender domain setup before marketing email sends.

## Current decision
Do not deploy cardora-admin-overview yet; the operator requested continued review and the isolated real-world test target / fixed staging origin / JWT compatibility / migration gates are not verified. Continue with safe offline work and read-only inspections only.

Reference docs:
https://supabase.com/docs/guides/functions/auth-headers
https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
