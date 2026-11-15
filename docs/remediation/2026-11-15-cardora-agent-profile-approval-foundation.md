# Cardora Agent Profile Approval Foundation — Staging

Date: 2026-11-15  
Branch: `staging/order-safety-fixes`  
Supabase project: Staging `fdkfquvzbswxocyrhduk`  
Status: additive migration applied and rollback-only synthetic tests passed

## Scope completed

- Added `public.agent_profiles` with UUID primary key, unique user and application links, lifecycle status, unique server-generated referral code, display name, and timestamps.
- Kept Agent identity separate from `seller_profiles`.
- Updated `admin_review_seller_application` so a manually approved Agent application creates or reactivates exactly one Agent Profile.
- Preserved Seller approval behavior: Seller approval still creates/updates a Seller Profile and creates the Free subscription when none is current.
- Preserved the internal admin authorization check and fixed empty search_path.
- Revoked table writes from browser roles. Authenticated users can only SELECT their own Agent Profile through the RLS policy. Service role retains server-side access.
- Explicitly revoked function execution from PUBLIC and anon; authenticated and service_role can call it, with the admin check enforced inside the function.
- No balance field was added.

## Verification

Rollback-only synthetic test passed:
1. Agent approval creates one active Agent Profile.
2. Agent approval does not create a Seller Profile.
3. Repeating Agent approval remains idempotent (one Agent Profile).
4. Seller approval still creates a Seller Profile.
5. Seller approval still creates a current Free subscription.

The synthetic Auth users, internal users, applications, and profiles were created only inside the test transaction and were rolled back. No synthetic rows were retained.

Post-migration security advisor review:
- The new Agent Profile table has an own-profile SELECT policy.
- Advisor output still reports pre-existing SECURITY DEFINER functions callable by authenticated users, including the admin review function. This function intentionally retains authenticated EXECUTE because the application invokes it through the authenticated session and enforces an admin-role check inside the function. Other reported functions are outside this change.
- Advisor output also includes pre-existing RLS-enabled tables without policies; these were not modified in this task.

## Deferred by design

Not implemented:
- Referral attribution and qualification rules.
- Referral reward calculations or payouts.
- Agent service orders and service-fee events.
- Agent dashboard RPCs or raw referral-customer data access.
- Reviewer audit columns.

These depend on unresolved business decisions documented in `docs/remediation/2026-11-13-agent-module-data-model-proposal.md`. No service fee beneficiary, attribution window, qualification event, payout threshold, or tax treatment has been invented.

## Safety boundary

- Staging only.
- Production remains read-only.
- No merge to main, no Vercel deployment, no real payment, no balance mutation, and no payout.
- Manual admin approval remains in place; no auto-approval was introduced.
