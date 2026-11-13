# Cardora Staging — Seller, Agent & Subscription Scope Audit
Date: 2026-11-13
Branch: staging/order-safety-fixes
Target: Supabase Staging only (`fdkfquvzbswxocyrhduk`)

## Safety boundary
This is a read-only schema inventory. No Production changes, no Staging DDL/DML, no deployment, and no payment or payout activity were performed.

## Confirmed Staging schema
### Seller applications
The `public.seller_applications` table exists with:
- `id`, `user_id`, `status`, `created_at`
- applicant fields: `name`, `email`, `whatsapp`, `city`
- application fields: `role`, `shop_links`, `card_count`, `categories`, `monthly_volume`, `message`

The status CHECK permits only `pending`, `contacted`, `approved`, `rejected`.
The role column exists, but this inspection found no role CHECK constraint. Do not assume Agent-specific approval lifecycle is complete merely because role is present.

### Seller profiles
The `public.seller_profiles` table exists with:
- identity/status: `id`, `user_id`, `status`, `trust_level`, `verification_status`
- profile: `display_name`, `bio`
- financial/statistics fields: `security_deposit`, `available_balance`, `total_sales`, `completed_orders`
- timestamps: `created_at`, `updated_at`

`user_id` is unique and references `users(id)`.

## Confirmed missing Staging structures from this inventory
No public table names matching Agent or Subscription were found. The only matching seller-related tables were:
- `seller_applications`
- `seller_profiles`
- `public_seller_leaderboard`
- existing test-only seller fixture tables

The routine inventory found only `admin_review_seller_application` among Agent/Subscription/Seller-application-named routines.

This means Staging currently has no separately identifiable Agent profile, Agent service-order, Agent referral-attribution/reward, or seller-subscription tables/routines. This is a schema-name inventory, not proof that no related behavior exists anywhere in application code.

## Business rules to preserve
- Current platform commission: 0%.
- Future platform commission: 1%, inactive until explicit approval and effective-date publication.
- Agent referral share: 25% of actual platform commission only; payable is zero while platform commission is zero.
- Agent service fee: separate from referral reward.
- Consignment service fee: 15%, minimum USD10; keep separate from platform commission and Agent referral.
- Seller plans: Free RM0 / 5 listings; Basic RM29 / 30; Pro RM79 / 150; Business RM199 / 600.
- Trial: 7 days. Grace period: 7 days.
- Accounting base currency: MYR. USD is an international display/reference currency only at this stage. USDT is not enabled as a settlement currency.
- No real payment, refund, withdrawal, settlement, or payout is authorized by this audit.

## Next implementation sequence (Staging only)
1. Inspect and document the existing seller application review function, its ACL, and role-specific behavior. Preserve the already-applied fix that approving an Agent application must never create a Seller Profile.
2. Design Agent profile, Agent service order/fee, referral attribution, and referral payable records as separate domains. Do not conflate the Agent service fee with referral reward.
3. Design subscription plans, subscription lifecycle, listing quota enforcement, 7-day trial and 7-day grace. Do not activate paid subscription collection before payment-provider and ledger integration are verified.
4. Wire all financial effects through the service-only double-entry journal primitive with MYR as the initial ledger currency. Keep FX display-only until multi-currency settlement is explicitly approved.
5. Add synthetic Staging tests for idempotency, authorization, role separation, quota enforcement, cancellation/expiry, and ledger balancing. Preserve existing fixtures and rows.

## Explicitly not decided
- Agent service-fee rate/amount and exact beneficiary.
- Whether Agent service fees are charged per application, per service, or per successful transaction.
- Seller subscription cancellation, refund, proration, and renewal failure policy.
- Tax, shipping, discount and provider-fee treatment.
- Whether any future non-MYR seller payout rail is available and compliant.
These require explicit product/business decisions; do not invent defaults.
