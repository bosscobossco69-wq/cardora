# Cardora Staging — Seller Application Review Function Audit
Date: 2026-11-13
Branch: staging/order-safety-fixes
Target: Supabase Staging only (`fdkfquvzbswxocyrhduk`)

## Scope and safety
Read-only inspection of `public.admin_review_seller_application(uuid,text,text)`. No database writes, no Production access, no deployment, and no payment activity.

## Verified function behavior
The function is SECURITY DEFINER and sets an empty search_path. It:
1. Checks that the caller's authenticated user row has `role = 'admin'`.
2. Accepts only `approved`, `rejected`, or `contacted`. The table CHECK constraint supports the same persisted status set plus `pending`.
3. Locks the selected application row with `FOR UPDATE`.
4. Rejects approval when `user_id` is null.
5. On approval, accepts only role `seller` or `agent` (null role defaults to seller).
6. Updates application status and optionally appends an Admin note to `message`.
7. Creates/updates a `seller_profiles` row only when the approved application role is `seller`.
8. Agent approval does not create a Seller Profile.

## Important limitation
Agent approval currently only changes the application status. This function does not create an Agent Profile, Agent service account, referral code, referral attribution record, Agent service order, fee payable, or referral reward record. Agent approval therefore is not yet a complete Agent onboarding workflow.

## Execution permissions
The function is executable by `authenticated`, `service_role`, and `postgres`; not executable by `anon` or PUBLIC. The function performs its own admin-role check before changing data. Keep this check and do not broaden access to anonymous callers.

## Current conclusions
- The prior Staging correction is present: Agent approval cannot accidentally create a Seller Profile.
- Seller approval path exists and creates/updates Seller Profile.
- Agent onboarding remains incomplete and needs a separate Agent profile/workflow.
- No change is recommended to this function in this audit. First design the Agent profile and lifecycle tables, then add a narrowly scoped role-aware onboarding implementation and tests.

## Required tests before implementation is accepted
- Admin can approve Seller application and exactly one Seller Profile exists.
- Admin can approve Agent application and no Seller Profile is created; exactly one Agent Profile is created once Agent onboarding is implemented.
- Non-admin authenticated caller cannot review an application.
- Anonymous caller cannot execute the function.
- Repeated approval is idempotent and does not create duplicate profiles.
- Rejected/contacted applications do not create profiles or financial records.
- All tests use synthetic Staging records and roll back or preserve existing fixtures.
