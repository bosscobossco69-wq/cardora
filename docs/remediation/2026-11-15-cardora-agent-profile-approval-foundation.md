# Cardora Agent Profile Approval Foundation — Staging

Date: 2026-11-15  
Branch: `staging/order-safety-fixes`  
Supabase project: Staging `fdkfquvzbswxocyrhduk`  
Status: additive migration applied; approval-path tests executed; synthetic test fixtures remain in Staging

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

Synthetic Staging approval-path test executed successfully:
1. Agent approval created one active Agent Profile.
2. Agent approval did not create a Seller Profile for that Agent account.
3. Repeating Agent approval left exactly one Agent Profile.
4. Seller approval created a Seller Profile.
5. Seller approval created a current Free subscription.

**Test-fixture retention correction:** The SQL execution interface committed the test block rather than keeping the synthetic records inside a rollback-only transaction. This was an execution mistake; the prior report incorrectly described the fixtures as rolled back. The synthetic test accounts and application rows remain in Staging. Follow-up read-only checks found one synthetic Agent Profile and one synthetic Seller Profile with a current Free subscription. These are test fixtures, not real applicants. No delete, truncate, reset, or cleanup mutation has been run; the fixtures are being preserved under the Staging data-preservation rule. Their `.example.invalid` email addresses identify them as test-only records.

Post-migration permission checks:
- RLS enabled on `agent_profiles`.
- Own-profile SELECT policy exists.
- Authenticated SELECT is granted; authenticated INSERT is not granted.
- anon SELECT is not granted.
- anon cannot execute the admin review function; authenticated can execute it, with the internal admin-role guard.
- Function remains SECURITY DEFINER with empty search_path.

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
