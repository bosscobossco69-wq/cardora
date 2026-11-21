# Cardora auth cutover: draft-only checklist

**Do not merge or deploy this PR until the staging account migration and login tests pass.**
Current production frontend points to old Supabase `crqqockaetgacddxkqpb`; new Cardora seller subscriptions are in `fdkfquvzbswxocyrhduk`.

## Checked
- New Cardora's previously missing `public.users` profile was repaired and confirmed by SQL (5 Auth, 5 profiles, 0 orphan users).
- Old website calls `rpc('is_admin')`; new project uses `public.users.role='admin'` and lacks `is_admin()`. Staged draft SQL provides a restricted compatibility function.
- Old browser CSP `connect-src` lists only the old Supabase project.
- The existing PKCE client uses `localStorage` key `cardora-supabase-auth-v1`.
- Two emails are shared across Auth projects, but their UUIDs differ. Do NOT transfer privileges by email alone.

## Staging cutover steps
1. Snapshot old and new Auth/profile/seller mappings and preserve rollback. Do not copy Auth passwords or refresh tokens or old wallet balances.
2. Configure Google OAuth provider/approved redirect URI in the **new** Supabase Auth dashboard, and verify native email OTP settings.
3. Apply and review the `is_admin` compatibility function **to staging only**. Test signed-out, member and admin sessions. Do not use user_metadata as authority.
4. Use a staging-only build with new Supabase project URL and matching **public anon/publishable** key. Set CSP `connect-src` to include the new project's URL. Change `storageKey` to `cardora-supabase-auth-v2` so legacy JWTs cannot contaminate the new project session.
5. Ensure allowed PKCE redirect URL includes exact staging origin. Validate both Email OTP and Google OAuth, including direct refresh/back navigation, on mobile.
6. Confirm `rpc('is_admin')` and remaining admin/seller API calls; old and new projects have different RPC and application review semantics.
7. Ensure a logged-in seller maps to `public.users.auth_user_id` and `seller_profiles.user_id`; verify matching tier and billing review mode.
8. Test migration and rollback with test accounts only. Approval needed for production account migration and production cutover.
9. Finish Stripe Sandbox checkout, signed webhook, subscriber lifecycle and Apple Pay/Google Pay testing before Live switch.

## Explicit prohibitions
- Never put Stripe secret keys, Supabase service-role keys or OAuth client secrets in browser code or public repo.
- Do not enable Stripe Live, database wallet flow, ToyyibPay or auto-credit.
- No new production deployment, SQL execution or GitHub main changes are authorized by this document.
