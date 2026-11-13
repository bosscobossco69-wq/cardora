# Cardora Seller Subscription & Listing Quota — Staging Design
Date: 2026-11-13
Branch: staging/order-safety-fixes
Status: design only; no DDL/DML applied.

## 1. Existing Staging facts
- No public table/routine with a Subscription name was found in the prior schema inventory.
- `seller_profiles` has no plan, quota, subscription status, trial dates, grace dates, or renewal dates.
- `create_seller_listing` now writes listing currency USD (fixed in Staging migration `20261113_fix_seller_listing_currency_usd`).
- `create_seller_listing` currently requires an approved Seller Profile and validates title, positive price, positive inventory, and nonnegative shipping fee.
- It does not check a subscription plan, current quota, trial, grace, or expiry.
- `seller_resubmit_listing(uuid)` changes an existing rejected listing back to pending_review; it does not insert another listing.
- Listing status CHECK permits exactly: `pending_review`, `active`, `rejected`, `suspended`.
- All 5 existing synthetic Staging listings are currently active.
- Existing RLS: public/anon can read active listings; authenticated sellers can read their own listing_details; sellers can read their own seller_profiles. No direct seller insert policy was found for listings.

## 2. User-approved plan catalog
| Plan | Price | Listing limit |
|---|---:|---:|
| Free | RM0 | 5 |
| Basic | RM29 | 30 |
| Pro | RM79 | 150 |
| Business | RM199 | 600 |

Trial = 7 days. Grace period = 7 days.
These are MYR subscription prices. Product/listing prices remain USD. Do not conflate subscription billing currency with listing denomination.

## 3. Proposed data model
### `seller_subscription_plans`
Seeded catalog, not user-editable:
- `code text primary key` (free/basic/pro/business)
- `name text not null`
- `price numeric(12,2) not null`
- `billing_currency char(3) not null default 'MYR'`
- `listing_limit integer not null`
- `trial_days integer not null default 7`
- `grace_days integer not null default 7`
- `is_active boolean not null default true`
- `created_at, updated_at timestamptz`

### `seller_subscriptions`
One current subscription row per seller (or append-only subscription periods plus a current pointer; choose append-only history as preferred):
- `id uuid primary key`
- `seller_profile_id uuid not null references seller_profiles(id)`
- `plan_code text not null references seller_subscription_plans(code)`
- `status text not null`: trialing, active, past_due, grace, expired, cancelled
- `started_at timestamptz not null`
- `trial_ends_at timestamptz`
- `current_period_starts_at timestamptz`
- `current_period_ends_at timestamptz`
- `grace_ends_at timestamptz`
- `cancel_at_period_end boolean not null default false`
- `created_at, updated_at timestamptz`
Unique/partial constraint to prevent more than one current subscription per seller. Do not store a mutable wallet balance here.

### `seller_subscription_events`
Append-only lifecycle/payment event log:
- `id uuid primary key`
- `subscription_id uuid not null references seller_subscriptions(id)`
- `event_type text not null`: trial_started, payment_confirmed, renewal_confirmed, payment_failed, grace_started, plan_changed, cancelled, expired, refunded
- `amount numeric(12,2)`
- `currency char(3)` (MYR for initial billing)
- `provider text`
- `provider_event_id text`
- `journal_id uuid references cardora_test_journals(id)`
- `idempotency_key text not null unique`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
Payment/renewal events may be appended only by trusted server-side verified webhook processing. A browser return URL is not proof of payment.

## 4. Listing quota semantics — recommended default
Count one slot for each listing owned by the seller in any of the four currently supported statuses:
- pending_review
- active
- rejected
- suspended

Rationale: each record represents a seller-created listing and consumes catalog capacity; rejection/resubmission does not create a second listing. Suspended or rejected listings can be edited/resubmitted but still occupy the same slot. This avoids users evading limits by cycling status.

The existing `seller_resubmit_listing` function does not insert a row, so it should not increment usage. It should remain allowed for an existing listing, including when the seller is over quota, because it does not consume a new slot.

No draft/deleted/archived statuses exist in the current listings CHECK constraint. Do not invent or count unsupported states.

## 5. Quota enforcement design
- Resolve the authenticated user and approved Seller Profile inside the database function.
- Lock the Seller Profile row `FOR UPDATE` before counting listings, serializing concurrent listing creates for that seller.
- Resolve the effective plan and status at database time.
- Trialing subscription: use the selected plan quota until trial expiry.
- Active subscription: use plan quota while the paid period is current.
- Past_due/grace: preserve the paid plan quota until `grace_ends_at`.
- Count all four supported listing statuses for the seller using `listing_details.seller_id = seller_profiles.id`.
- Reject new listings if usage >= quota.
- Perform count and insert in the same transaction.
- Resubmitting an existing rejected listing does not create a new slot and does not require a second quota check.
- Plan downgrade below current usage must not delete/hide listings automatically; block additional listings until usage falls below the new limit.

## 6. Unresolved policy gate — do not code a guessed behavior
What happens after the 7-day grace period ends?
Options requiring owner approval:
A. Automatically revert to Free (5 slots), keep all existing listings visible, block new listings while usage >= 5.
B. Keep listings visible but pause excess listings until the seller chooses a plan.
C. Keep all existing listings active and block only new listings until usage <= Free limit.

A and C are close in user-facing behavior but differ in subscription lifecycle/status and visibility semantics. Do not silently implement one.

Also unresolved:
- Whether Free plan starts automatically on Seller approval or only when the Seller first opens subscription settings.
- Whether a paid subscription can start immediately during a trial and how unused trial days are handled.
- Renewal failure retry schedule and when grace begins.
- Refund/proration/cancellation policy.
- Exact treatment of provider fees and tax.
- Whether subscription is billed monthly (assumed by price presentation, but billing cadence not yet explicitly confirmed).

## 7. Security and payment requirements
- RLS enabled on new tables.
- No anon direct access or browser write grants to plan/subscription/payment tables.
- Sellers can read only their own effective subscription summary through a scoped view/RPC.
- Plan catalog is read-only to clients.
- Subscription status changes from payment confirmation only after verified provider signature, amount, currency, order/subscription reference, and idempotency checks.
- Financial entries use the service-only double-entry journal primitive.
- Initial subscription billing currency is MYR; listings/orders remain USD. Any provider conversion/FX must be explicit and recorded.
- Do not activate paid subscriptions or claim real payment support until provider capabilities and webhook verification are implemented and tested.

## 8. Next implementation sequence
1. Confirm post-grace behavior and Free-plan auto-enrollment.
2. Add plan catalog + subscription lifecycle schema in additive Staging migration.
3. Seed the four plan catalog rows (static product config only; no financial transaction).
4. Add service-only subscription lifecycle functions and seller-readable scoped status view.
5. Update `create_seller_listing` to enforce quota under Seller Profile row lock.
6. Run rollback-only tests: plan limits, final-slot concurrency, trial expiry, grace expiry, downgrade over quota, resubmission without double counting, and unauthorized access.
7. Production remains read-only; no Vercel deployment and no real payment processing.
