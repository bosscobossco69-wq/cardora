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


## 22 November 2026 — read-only Auth and feature-compatibility preflight

### Verified live database inventory (aggregate counts only)
| Dataset | Legacy `pokemon-treasure-demo` | New `cardora` |
|---|---:|---:|
| Auth users | 2 | 5 |
| `public.users` profiles | 2 | 5 |
| `seller_applications` | 3 | 2 |
| `listing_submissions` | 1 | 0 |
| `listings` | 0 | 5 |
| `orders` | 0 | 1 |
| `admin_users` | 2 | **table absent** |
| `seller_subscriptions` | Not used by legacy website | 2 |

Read-only `SELECT count(*)` was used; no production data was edited, and no personally identifying user rows were exported. These counts are a point-in-time snapshot, not a migration or backup.

### Browser code confirmed from draft branch `index.html`
- Auth URL is still legacy `crqqockaetgacddxkqpb`. The browser uses `signInWithOAuth({provider:'google'})`, `signInWithOtp({shouldCreateUser:true})`, PKCE callbacks, `localStorage` auth key `cardora-supabase-auth-v1`, and `rpc('is_admin')` for admin UI visibility.
- Orders, seller profile, seller applications, listing review, wallet and legacy `ai-support` functionality all depend on the selected Supabase project. Replacing the URL globally redirects **all** these operations, not just Login.
- The frontend has wallet/admin interactions and legacy service function paths. A preview pointed at the new Cardora project is **not** read-only unless these flows are explicitly isolated/disabled.
- New Cardora backend has no `admin_users` table. Legacy admin status must **never** be copied on email match alone. Approved users and admin grants require independent verification against the correct Auth UUID and separate explicit authorization.

### Fail-closed migration requirements before any staging rollout
1. Preserve old website and both backend databases unchanged. Snapshot Auth account mapping, admins, seller applications, reviews, orders and existing subscription relationships, with explicit rollback.
2. Test in an independent disposable database, using artificial accounts, not old refresh tokens, password hashes or production wallet balances.
3. Record a verified one-to-one mapping old Auth UUID -> new Auth UUID for accounts that have been re-authenticated and proven to belong to the same person. Do not match by email alone; never assign admin/seller privileges via email.
4. Test new project OAuth redirect, email OTP, RLS and admin RPC. Deny access until role ownership is verifiable. Recheck seller approval/KYC and subscription ownership separately.
5. Audit every query/RPC/Edge Function called by `index.html` against the new project before switching its URL. In particular: applications, listings, orders, review queues, old wallet and AI support.
6. For Preview builds, explicitly disable side-effecting legacy wallet/admin/order paths and never use the new production Cardora project for destructive migration tests.
7. Confirm fallback behavior for no profile, signed-out sessions, expired access token, two tabs, PKCE redirect, missing admin RPC and mismatched seller profile. Re-run mobile navigation/refresh.
8. Only after isolated testing and explicit authorization should any production Auth migration or deployment be considered.

**Release blocker remains:** no isolated Supabase staging available on the user's current Free tier; avoid changing either live project to run this test. Supabase Preview branching requires a paid plan; the user does not want to upgrade, and local Docker is unavailable.

## 22 November 2026 — quick RLS / admin compatibility check (READ ONLY)
- Inspected new Cardora `pg_policies` for `users`, `seller_profiles`, `seller_applications`, `listings` and `seller_subscriptions` without executing changes.
- `users_select_own` restricts the browser to `auth_user_id=auth.uid()`.
- `seller_profiles_select_own` and the seller application's select/insert policies require `user_id=current_user_row_id()`.
- `listings_select_active` allows public reads only when listing status is active.
- **Confirmed blocker:** none of the examined policies grants browser administrators general seller-applications listing or seller-profile access. The frontend's `rpc('is_admin')` is only a visibility check and **does not grant RLS access**. The staged `is_admin()` compatibility SQL alone therefore cannot make the old admin review interface work against new Cardora.
- Review of any admin-facing SELECT, UPDATE and rejection/approval operation needs separate authorization design, explicit review of privileged RPCs and ownership constraints, and isolated integration tests. Do **not** open `SELECT` on sellers/applications to all authenticated users.
- No `seller_subscriptions` public RLS policy was returned by this narrow policy query; verify which privileged server RPC is authorized to change subscription status rather than attempting direct browser writes.
- For admin dashboard compatibility, keep `is_admin()` role-check **separate** from privileged review actions. Prefer narrowly scoped `SECURITY DEFINER` RPCs with `auth.uid()`-based role checks and explicit column/row allowlists, not broad admin RLS bypass.
- No GitHub main, Supabase roles/policies/data or Vercel deployment changed. **Still a release blocker.**
