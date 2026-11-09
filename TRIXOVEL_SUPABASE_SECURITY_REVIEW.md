# Trixovel Supabase Security Advisor Review

Date: 9 November 2026
Scope: Supabase project metadata, Edge Function inventory and Supabase security advisors. Read-only review only.

## Confirmed application backend

The current `ai-admin-preview` HTML configures:
- Supabase URL: `https://crqqockaetgacddxkqpb.supabase.co`
- Project ref: `crqqockaetgacddxkqpb`
- Project name: `pokemon-treasure-demo`
- Status: `ACTIVE_HEALTHY`

A separate project exists:
- Project ref: `fdkfquvzbswxocyrhduk`
- Project name: `cardora`
- Status: `ACTIVE_HEALTHY` in project metadata, but advisor inspection reports it is currently hibernated and will wake on a supported request.
- Its Edge Function inventory is empty.

The current site is therefore configured to the first project. Do not switch projects without confirming the intended production data source.

## Edge Functions on the configured project

- `ptx-email-otp` — ACTIVE, version 6, verify_jwt=false
- `ai-support` — ACTIVE, version 12, verify_jwt=true

The OTP function being public is not automatically a vulnerability; it must implement its own abuse controls, OTP expiry, rate limiting, enumeration resistance and strict input validation. Review its source before relying on it.

## Security Advisor findings on configured project

### Warning — 34 SECURITY DEFINER functions executable by anon
Advisor reports 34 public SECURITY DEFINER RPC functions executable by the `anon` role. Examples include admin review/resolve functions, seller application/listing functions, order creation/chat, order receipt confirmation, payment recording and withdrawal request functions.

This is a high-priority authorization audit. A SECURITY DEFINER function can intentionally be exposed if it performs robust internal identity/role/ownership checks. The advisor finding alone does not prove exploitability. For every function:
- Verify `auth.uid()` is required where appropriate.
- Verify admin role from a trusted server-side table/claim, not caller-supplied parameters.
- Verify seller/buyer ownership and participant membership.
- Reject anonymous callers for private/admin mutations.
- Revoke public/anon execution only after confirming intended callers and app dependencies.
- Add explicit grants to `authenticated` or a narrow role as appropriate.

Do not mass-revoke or edit functions blindly; that can break login, seller listings, orders, dispute workflows and admin tools.

### Info — RLS enabled without policies on two tables
Advisor reports RLS enabled but no policies on:
- `public.admin_users`
- `public.ptx_email_otps`

This can intentionally deny direct API access, but should be checked against the actual RPC/Edge Function access model. Do not add broad policies just to clear the warning.

### Warning — Leaked password protection disabled
Supabase Auth leaked-password protection is disabled. Enable after checking the project's authentication policy and testing sign-up/password-reset behavior.

## Database inspection limitation

The database table introspection and migration listing calls failed with PostgreSQL authentication error `28P01`. This report does not claim to have inspected function bodies, table columns, constraints or RLS policy SQL.

## Recommended remediation sequence

1. Restore read-only database schema inspection without sharing passwords or service-role keys in chat.
2. Export/inspect definitions for all 34 flagged SECURITY DEFINER functions.
3. Build a call matrix: anon vs authenticated vs admin; identify browser calls and Edge Function calls.
4. Prepare a least-privilege grant/revoke migration in a development database branch.
5. Add negative tests proving anon cannot approve listings, resolve disputes, confirm orders, record payments or request withdrawals.
6. Re-run security advisors and functional tests before production rollout.
7. Review OTP function abuse protections and enable leaked-password protection after a controlled auth test.

## No changes made

- No SQL, migration, grant, revoke or policy change executed.
- No Supabase Auth setting changed.
- No Edge Function deployed or replaced.
- No project URL or key changed.
- No GitHub production branch changed.
- No Vercel deployment triggered.
- No theme or UI changes.
