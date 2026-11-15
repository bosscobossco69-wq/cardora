# Cardora Agent Frontend Integration — Staging

Date: 2026-11-15  
Branch: `staging/order-safety-fixes`  
Scope: frontend integration only; no deployment

## Findings from existing source

The existing `index.html` already contained:
- An Agent navigation entry and an Agent route title.
- Legacy Agent / Agent Dashboard CSS and prototype sections.
- An application form that supports `role='agent'`.
- A generic Agent Referral Center placeholder that correctly stated the referral program was not active.
- An Admin applications queue.

However, the independent-page router mapped the Agent route to a legacy `section.agent` and the public application form was the actual working Agent onboarding route. The legacy dashboard styling did not represent a connected Agent dashboard.

## Changes committed

### Agent Program page
- Added a live Agent Program view to the existing independent-page router.
- Requires a signed-in account and reads the internal user row through `current_user_row_id`.
- Reads only the signed-in user's own `agent_profiles` row and latest own Agent application.
- Displays:
  - Agent application status if no approved profile exists.
  - Agent status, display name, referral code and profile creation date after approval.
  - Explicit notice that referral attribution, qualifying transactions, reward posting and payouts are not connected.
  - Current commission 0%, future 1% inactive, and planned Agent share 25% of actual platform commission only.
  - Agent service fee disclaimer separating service fees from referral rewards.
- Does not display invented referral counts, customer identities, earnings, balances or withdrawal controls.
- The application CTA opens the existing application form with Agent selected.

### Admin application review correction
- Existing admin application dropdown previously updated `seller_applications.status` directly.
- Direct status update would bypass `admin_review_seller_application`, meaning the new Agent Profile provisioning and existing Seller Profile / Free subscription provisioning could be skipped.
- Replaced the frontend status update with the guarded `admin_review_seller_application` RPC.
- The server function remains the authority for admin validation and profile creation.
- Prevented manually resetting an application to `pending`; pending is the initial submission state.
- Existing application queue refreshes after a successful RPC response.

## Verification performed

- Re-read the updated `index.html` from the Staging branch.
- Confirmed the Agent page queries `agent_profiles` using the current internal user ID.
- Confirmed the Agent application query is scoped to the current user and `role='agent'`.
- Confirmed the Agent page does not claim that the referral code tracks referrals or earns rewards.
- Confirmed the Admin UI calls `admin_review_seller_application` rather than directly updating the application table.
- Confirmed inline action quoting was corrected in the final committed source.

No live browser end-to-end test was run in this step; the UI needs preview testing after the user reviews the Staging branch. No Vercel deployment was performed.

## Deferred

- Referral attribution, qualification event and attribution window.
- Referral reward journal posting and payout.
- Agent service order workflow and service fee beneficiary.
- Agent performance statistics and referral customer data.

These remain blocked on the unresolved business rules in the Agent data model proposal.

## Safety boundary

- Staging GitHub branch only.
- Supabase Staging migration from the preceding task remains applied.
- Production remains read-only.
- No merge to main, no Vercel deployment, no live payments, no payouts.
