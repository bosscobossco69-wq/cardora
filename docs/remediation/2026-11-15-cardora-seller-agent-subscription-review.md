# Cardora Staging — Seller, Agent and Subscription Review
Date: 2026-11-15
Branch: staging/order-safety-fixes
Scope: Staging source and Staging Supabase only. Production was not modified.

## Changes made in this review

- Rebranded the Staging `index.html` public UI copy from Trixovel to Cardora.
- Preserved the existing Supabase auth storage key `trixovel-preview-supabase-auth-v1` to avoid breaking existing browser sessions.
- Replaced outdated 5% future platform commission and 100-free-listing copy with the confirmed 1% future commission (inactive), current 0% commission, and current Seller subscription tiers.
- Corrected Agent referral example: on an eligible USD 100 sale, if a 1% platform commission is later activated, platform commission is USD 1.00 and the 25% referral share is USD 0.25. At today's 0% commission, reward is zero.
- Clarified that Agent service fees are separate from Agent referral rewards.
- Kept the confirmed consignment quote at 15% of final sale, minimum USD 10, subject to written quote.
- Removed unverified fixed prices from Card Sourcing, Authenticity Check and Consolidated Shipping; these now require a written quote.
- Updated the seller listing form to show 0% current platform commission and USD listing currency.
- Rechecked `fees.html`; its Cardora brand, current 0%, future 1%, MYR subscription tiers and trial/grace wording match the current approved rules.

## Verified Staging database behavior

### Seller application and approval

- Frontend inserts a Seller/Agent application into `seller_applications` with `role='seller'` or `role='agent'` and `status='pending'`.
- Application submission requires a signed-in account and a linked internal user row.
- `admin_review_seller_application` requires the caller to be an admin and accepts approved/rejected/contacted.
- Approving a Seller creates/updates a Seller Profile and creates a Free subscription if no current subscription exists.
- Approving an Agent does not create a Seller Profile.
- The current review path is manual admin approval. Do not change to automatic approval without explicit business approval.
- Function ACL check: anon cannot execute; authenticated and service_role can execute. The function itself enforces the admin check.

### Seller listing and subscription quota

- `create_seller_listing` requires an authenticated user and an approved Seller Profile.
- New listing currency is USD.
- It locks the Seller Profile row and current subscription row before checking quota.
- If no current subscription exists, it creates a Free subscription.
- Listing quota is read from `seller_subscription_plans`.
- Usage currently counts listing statuses: `pending_review`, `active`, `rejected`, and `suspended`.
- When a paid plan is past its applicable grace period, or is expired/cancelled, the new-listing quota falls back to Free's 5 listings. Existing listings are not deleted by this function.
- `seller_resubmit_listing` only allows the owner to resubmit a rejected listing and returns it to `pending_review`; it does not create a new listing.
- Function ACL check: anon cannot execute; authenticated and service_role can execute.

### Verified plan rows

| Plan | Price | Currency | Listing limit | Trial | Grace |
|---|---:|---|---:|---:|---:|
| Free | RM0 | MYR | 5 | 7 days | 7 days |
| Basic | RM29 | MYR | 30 | 7 days | 7 days |
| Pro | RM79 | MYR | 150 | 7 days | 7 days |
| Business | RM199 | MYR | 600 | 7 days | 7 days |

## Remaining gaps / decisions

1. Agent application approval currently does not create an Agent Profile. The Agent module proposal remains design-only.
2. Agent referral attribution qualification, attribution window, fraud rules, reward release timing and payout method remain unresolved.
3. Agent service-fee beneficiary and payment responsibility remain unresolved. Do not treat the 15% consignment fee as platform commission or Agent referral reward.
4. The seller quota currently counts rejected and suspended listings. This is a live implementation behavior, not yet a user-confirmed business rule; confirm whether those statuses should consume quota.
5. Trial/grace handling should receive dedicated rollback-only tests for exact boundary timestamps and status combinations.
6. Seller application UI says applications are reviewed by hand; this matches the current admin-review database function. Any move to automatic approval requires an explicit policy decision.
7. No payment checkout or payout was enabled by this review.

## Safety boundaries

- Production Supabase remains read-only.
- No Production data or schema was changed.
- No real payment, refund, settlement, payout or wallet movement was performed.
- No Vercel deployment or merge to main was performed.
