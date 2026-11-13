# Cardora Seller Subscription & Quota — Staging Implementation Report
Date: 2026-11-13
Environment: Staging Supabase project `fdkfquvzbswxocyrhduk`
Branch: `staging/order-safety-fixes`
Migration: `20261113_seller_subscription_quota_foundation`
GitHub migration commit: `53f970d24f04f665d34e2b9b96cab2ca170b30dc`

## Owner-approved default selected
The owner delegated the policy choice. Implemented recommended Policy C:
- At end of paid/trial entitlement and its grace period, effective listing quota falls back to Free (5).
- Existing listings are not automatically hidden, deleted, or paused.
- New listing creation is blocked when the seller already has 5 or more listings.
- Seller resubmission of an existing rejected listing remains an update to the same record and does not consume a new slot.
- Seller approval automatically creates a Free subscription record.
This is a seller-friendly behavior that avoids unexpected loss of listing visibility.

## Applied Staging changes
1. Created `seller_subscription_plans` catalog with:
   - Free RM0 / 5 listings
   - Basic RM29 / 30 listings
   - Pro RM79 / 150 listings
   - Business RM199 / 600 listings
   - MYR billing currency; trial 7 days; grace 7 days.
2. Created `seller_subscriptions` with lifecycle states, period dates, grace dates, history, and one-current-subscription partial unique index.
3. Created append-only-intent `seller_subscription_events` with unique idempotency key and optional link to the Staging test journal.
4. Enabled RLS and revoked all direct anon/authenticated/public table privileges on all three subscription tables.
5. Updated `admin_review_seller_application`:
   - Preserved admin authentication check and seller/agent role separation.
   - Only Seller approval creates/promotes Seller Profile.
   - Seller approval now creates a Free subscription if there is no current subscription.
   - Agent approval still does not create Seller Profile or Seller subscription.
6. Updated `create_seller_listing`:
   - Preserved authentication and approved Seller checks.
   - Locks Seller Profile row to serialize concurrent listing creations for a seller.
   - Creates a Free subscription fallback if a current subscription record is missing.
   - Counts seller-owned listings in pending_review, active, rejected, and suspended states.
   - Enforces quota in the same transaction as listing insert.
   - Writes listing currency USD and status pending_review.
   - Existing resubmission function was not changed.

## Verification
- Plan catalog returned all four expected rows and prices/limits.
- An authenticated synthetic rollback-only test successfully created a listing under Free entitlement, confirmed currency USD and status pending_review, and confirmed Free subscription bootstrap.
- A second rollback-only test created five synthetic listings in one transaction and verified the sixth create was rejected with LISTING_QUOTA_EXCEEDED.
- Both tests explicitly rolled back.
- Post-test counts remained unchanged:
  - listings: 5
  - listing_details: 0
  - orders: 1
  - order_items: 1
- Privilege check: anon cannot execute listing create or seller application review; authenticated can execute both. Admin role is still checked inside the review function.
- No Production changes. No Vercel deployment. No real payment processing or subscription activation.

## Important limitations / remaining work
- This migration establishes the plan catalog and quota foundation; it does not implement a paid subscription checkout or provider webhook.
- Seven-day trial and grace durations are stored as plan settings, but paid-plan trial start, payment confirmation, renewal, payment failure, grace transition, cancellation, and refund lifecycle handlers are not yet implemented.
- The current listing-create function calculates the effective Free quota after expiry but does not mutate the subscription status to expired or create a lifecycle event. A scheduled/service-side lifecycle processor and seller-readable subscription status view are still needed.
- Billing cadence (monthly) is not yet encoded; do not claim it is implemented until explicitly confirmed and added.
- No subscription charge has been made and no seller has been moved to a paid plan.
- Quota counts the four supported listing statuses. Existing Staging listings without a `listing_details` seller link are not attributable to any seller and therefore are not counted.
- Before Production rollout, review the migration against the complete Production schema and run a separately approved production migration plan. Production remains read-only.
