# Cardora Staging — Seller Listing Currency & Quota Audit
Date: 2026-11-13
Branch: staging/order-safety-fixes
Target: Supabase Staging (`fdkfquvzbswxocyrhduk`)
Status: read-only audit; no schema/data changes.

## Confirmed listing schema
- `listings`: `id`, `title`, `price`, `currency`, `inventory`, `status`, `created_at`.
- The `currency` column is NOT NULL and defaults to `USD`.
- `listing_details` links each listing to a seller profile through `seller_id`; it stores card details, shipping fee/country, description, verification code/status, and timestamps.
- `seller_profiles` currently has no subscription plan, listing quota, subscription status, or subscription-period fields.

## Confirmed create_seller_listing behavior
The function:
1. Resolves the current internal user row.
2. Requires an approved Seller Profile.
3. Requires nonblank title, positive price, positive inventory, and nonnegative shipping fee.
4. Inserts a listing with currency hardcoded to `USDT` and status `pending_review`.
5. Inserts listing_details linked by Seller Profile ID.
6. Does not count existing listings or enforce any plan quota.
7. Does not check subscription status, trial, grace period, or expiry.

The function is SECURITY DEFINER, has an empty search_path, and is executable by authenticated users (as well as service_role/postgres), but not anon/PUBLIC. The function performs its own authenticated-user and approved-seller checks.

## Confirmed seller_resubmit_listing behavior
- Verifies the listing belongs to the current user through listing_details.seller_id -> seller_profiles.id -> seller_profiles.user_id.
- Allows resubmission only when listing status is rejected.
- Resets listing to pending_review and verification_status to pending.
- Does not create a new listing, so it should not consume an additional listing slot.
- Does not check subscription quota; it is an existing listing being resubmitted.

## Critical mismatch with the agreed currency decision
The agreed product direction is MYR as the initial accounting and preferred settlement currency; USD is display/reference only; USDT is not enabled as a settlement currency.
However, `create_seller_listing` currently hardcodes `listings.currency='USDT'`, while the column default is USD. This is an existing inconsistency. It was not changed in this audit because price currency and settlement currency need a clearly defined product rule and a safe migration plan. Do not silently replace USDT with MYR without reviewing existing listings and frontend currency display/checkout code.

## Subscription / quota rules to implement
- Free: RM0, maximum 5 active listings.
- Basic: RM29, maximum 30 active listings.
- Pro: RM79, maximum 150 active listings.
- Business: RM199, maximum 600 active listings.
- Trial: 7 days.
- Grace period: 7 days.

## Recommended quota semantics (proposal)
- Count listings that occupy seller capacity, not historical rows. Recommended counted statuses: `pending_review`, `active`, `rejected`, `suspended` only if the business wants rejected/suspended inventory to continue consuming capacity. This exact status treatment must be confirmed before coding.
- Resubmission of an existing rejected listing does not consume a second slot.
- Draft/deleted/archived statuses should not count only if those statuses are actually supported and deletion/archive semantics are defined.
- Enforce quota inside the database write function under a per-seller transaction lock; frontend checks are informational only.
- Count and insert must be atomic to prevent two concurrent listing requests from both passing the same last slot.
- Plan downgrade below current usage should not delete or hide products automatically. Block new listings until usage falls below the new limit.
- Trial grants access to the selected plan's quota for 7 days. At expiry, move to the documented grace state for 7 days. After grace, fall back to Free or pause excess listings according to an explicit policy; do not invent the behavior.

## Next implementation gates
1. Inspect frontend listing creation and currency display/checkout paths to determine where the hardcoded USDT assumption is consumed.
2. Confirm counted listing statuses and post-grace behavior before schema/function changes.
3. Design subscription plans, seller subscription lifecycle, immutable subscription payment events, and quota enforcement in Staging.
4. Keep paid plan activation gated on verified provider payment webhook + double-entry journal posting. Never grant a paid plan merely because the browser reports payment success.
5. Test concurrent listing creation at the final available slot, plan expiry, grace period, downgrade over-quota behavior, and resubmission without double-counting.
6. No Production changes, no real payments, and no Vercel deployment during this work.

## No changes made
No DDL/DML, no existing fixture changes, no Production access, and no payment or payout operations.
