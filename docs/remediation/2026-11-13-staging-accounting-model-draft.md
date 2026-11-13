# Cardora Staging Accounting Model — Design Decision Draft
Date: 2026-11-13
Branch: `staging/order-safety-fixes`
Status: design draft only; not an executable migration and not approval to activate payments.

## 1. What already exists in Staging

The isolated synthetic Staging project currently has 26 public tables, including:
- Production-shaped operational tables: `users`, `seller_profiles`, `orders`, `order_items`, `order_financials`, `wallet_transactions`, `withdrawal_requests`.
- Test-only finance tables: `test_order_seller_financials`, `test_financial_ledger`, `test_withdrawal_requests`, `test_withdrawal_ledger`, `test_withdrawal_idempotency`, `test_disputes`, and `test_payment_webhook_events`.
- Test-only routines: `ptx_test_settle_order`, `ptx_test_resolve_dispute_refund`, `ptx_test_request_withdrawal`, `ptx_test_resolve_withdrawal`, `ptx_test_claim_payment_event`, and `ptx_test_finalize_payment`.

These test fixtures and rows pre-exist this design pass and must be preserved. This pass did not insert, update, delete, or truncate anything in Staging.

## 2. Problems in the existing test model

1. `ptx_test_finalize_payment` hardcodes 8% platform fee / 92% seller net.
2. `ptx_test_settle_order` independently hardcodes the same 8% / 92% split. It writes seller settlement records and increments `seller_profiles.available_balance`.
3. `test_financial_ledger` is a seller settlement/reversal event table, not a balanced double-entry journal. It does not represent buyer funds, platform revenue, agent payable, provider clearing, or escrow.
4. `test_withdrawal_ledger` records withdrawal reserve/paid/reversed events but is also not a complete double-entry journal.
5. `ptx_test_resolve_dispute_refund` handles seller settlement reversal for a settled order, but it is not a complete buyer refund/provider refund implementation and does not cover partial refunds.
6. `ptx_test_resolve_withdrawal` handles paid/rejected test states; provider payout confirmation and provider idempotency are not integrated.
7. `ptx_test_finalize_payment` validates order amount/currency and webhook event state, but it is still a test helper, not proof of a real provider signature verification or production webhook.
8. The public `fees.html` still describes future 5% commission. That conflicts with the project decision that the future platform commission is 1%, inactive; current actual platform fee remains 0%.

Therefore these routines are useful test material but cannot be promoted unchanged.

## 3. Accounting domains (keep separate)

The final model must explicitly distinguish:

### A. Buyer funds
- Buyer available wallet balance (if wallet deposits are enabled in a future approved release).
- Buyer funds reserved for a specific order.
- External payment-provider funds pending settlement/chargeback.
- Do not mix the buyer's wallet liability with seller earnings.

### B. Seller proceeds
- Seller pending proceeds (order not yet released from buyer protection).
- Seller available proceeds (eligible for withdrawal).
- Seller payout reserved (withdrawal requested, not yet paid).
- Seller receivable/negative adjustment if a post-settlement refund is owed and available funds are insufficient; do not silently allow a negative balance without a documented recovery policy.

### C. Platform and partner earnings
- Platform commission revenue.
- Agent referral payable, funded only from the platform's commission share.
- Consignment service fee revenue, separate from marketplace commission.
- Subscription revenue, separate from per-order revenue.
- Provider/network fees, separately recorded and not silently netted against seller proceeds.

Every journal must be single-currency. Cross-currency conversion requires a separate FX event with source amount/currency, destination amount/currency, rate, provider/reference, and rounding record.

## 4. Approved business rules to preserve

- Current platform transaction commission: **0%**.
- Future platform commission: **1%**, inactive until an explicit approved activation and customer-facing effective date.
- Agent referral share: **25% of platform commission only**. At the future 1% commission this would be 0.25% of eligible item gross; while commission is 0%, agent referral payable is 0.
- Consignment service fee: **15%, minimum USD 10**, a separate service flow and not an extra marketplace commission. Exact charging point and currency conversion need to be represented explicitly in the consignment order/service agreement.
- Seller subscription plans: Free RM0 / 5 listings; Basic RM29 / 30 listings; Pro RM79 / 150 listings; Business RM199 / 600 listings.
- Subscription trial: 7 days; grace period: 7 days.
- Do not activate any fee or subscription charge merely by adding a ledger table.
- Do not treat the legacy 8% test calculation or public 5% draft text as approved policy.

## 5. Recommended double-entry journal events

The proposed journal is append-only. Each business event has a unique idempotency key, an external reference, currency, actor/source, and related order/withdrawal/refund IDs. Each journal has at least two entries; total debits equal total credits for that currency.

| Business event | Debit | Credit |
|---|---|---|
| External buyer payment confirmed | Provider clearing asset | Order funds held / escrow liability |
| Internal wallet order reserve | Buyer wallet liability | Order funds held / escrow liability |
| Order release / seller settlement | Order funds held liability | Seller payable + platform commission revenue + agent payable (when applicable) |
| Pre-settlement refund | Order funds held liability | Provider clearing / buyer wallet liability |
| Post-settlement refund | Seller payable/receivable + platform fee reversal + agent payable reversal as applicable | Provider clearing / buyer wallet liability |
| Withdrawal request | Seller available payable | Seller payout-reserved payable |
| Withdrawal rejected/canceled | Seller payout-reserved payable | Seller available payable |
| Withdrawal provider-confirmed paid | Seller payout-reserved payable | Provider clearing asset |
| Consignment service completed | Buyer/client receivable or clearing | Consignment service revenue + applicable seller/consignor payable |
| Subscription payment confirmed | Provider clearing asset | Subscription revenue / deferred revenue according to service period |

The exact treatment of shipping, taxes, payment provider fees, chargebacks, refunds after seller withdrawal, and negative seller balances must be explicitly decided before executable SQL is written. The table is a design map, not an assertion that all these accounts or events exist today.

## 6. Settlement calculation and multi-seller orders

- Freeze item price, quantity, currency, shipping allocation, seller identity, and applicable fee policy in an order-level financial snapshot when the order is paid.
- Compute each seller's gross from that seller's order items, not from the order total if multiple sellers exist.
- Compute the platform commission from eligible item gross only; do not charge commission on shipping unless a separately approved policy says so.
- With current 0% policy: platform commission = 0 and agent referral payable = 0.
- With future 1% policy after activation: platform commission = eligible item gross × 1%; agent payable = platform commission × 25%; platform retained share = platform commission − agent payable.
- Round at the documented currency precision and store the exact calculation inputs/results. Ensure the sum of seller net + platform fee + agent payable + any separately defined shipping/tax allocations reconciles to the paid order amount.
- A multi-seller order needs one seller-level financial snapshot per seller and journal allocations that sum to the order-level totals.

## 7. Refund, dispute and withdrawal invariants

- A settlement can post only once per order/seller/currency; retries return the original result and do not credit balances twice.
- A refund can post only once per provider refund ID/idempotency key. Cumulative successful refunds cannot exceed the captured payment.
- Partial refunds require an explicit amount and allocation across seller proceeds, platform commission, agent payable, shipping, and provider fees. A status-only 'partial' resolution is not sufficient.
- A dispute release/refund decision must perform its corresponding journal entries and state transition in the same database transaction.
- A withdrawal request reserves seller proceeds exactly once. Repeated request with the same idempotency key and same payload returns the same request; same key with different payload is rejected.
- Rejected/canceled withdrawals restore reserved seller proceeds exactly once. Paid withdrawals require verified provider payout confirmation and unique provider payout ID.
- Mutable balance columns may remain as cached projections for performance, but the journal is authoritative. A reconciliation query must continuously compare projections to journal-derived balances.

## 8. Security and operational requirements

- Browser roles cannot insert/update/delete journals, entries, provider events, payment state, refund state, or payout state.
- Privileged functions must be service-role-only or called through an authenticated server-side Edge Function with verified identity and role checks. Never expose service-role credentials to the browser.
- Provider webhook signatures must be verified before event claim/finalization; deduplicate by provider + provider event ID; reject event ID reuse with a different payload hash.
- All financial state transitions use row locks/conditional state changes and unique constraints to prevent races.
- Journal rows are immutable; corrections are reversing journals, not updates/deletes.
- Store provider IDs and minimal audit metadata; do not store card data, private keys, API secrets, or unnecessary sensitive payloads.

## 9. Staging implementation plan (not yet applied)

1. Preserve all existing `test_*` tables and fixtures. Do not repurpose them as production schema.
2. Add a new isolated `cardora_test_*` double-entry journal model only after reviewing exact DDL, grants, RLS, and rollback plan.
3. Seed synthetic accounts only; no copied Production users, seller records, payment records, or secrets.
4. Implement service-only test routines for payment confirmation, seller settlement, pre/post-settlement full refund, partial refund, dispute release, withdrawal reserve/reject/pay, agent commission accrual, consignment fee, and subscription payment.
5. Add invariant tests: balanced journals; no cross-currency journal; idempotent retries; concurrent duplicate settlement/refund/withdrawal; projection reconciliation; no negative funds outside approved policy.
6. Only after test results and explicit review, decide whether to replace/retire earlier test helpers. Do not drop them in this pass.
7. Production stays read-only and no deployment occurs until separately approved.

## 10. Current status

- This document is a design decision draft only.
- No Staging DDL/DML was executed in this pass.
- No Production DDL/DML was executed.
- No payment, refund, settlement, withdrawal payout, or real money movement was performed.


## 11. Privilege review of existing Staging test helpers

A catalog-only check confirmed:
- All seven `ptx_test_*` routines are SECURITY DEFINER and their EXECUTE ACLs list postgres and service_role only; anon/authenticated are not listed.
- The existing `test_*` finance tables have RLS enabled and table grants shown only for postgres and service_role; anon/authenticated grants were not present in the inspected role-table-grant result.
- This is a positive containment property for the current test helpers, but it does not make their 8% logic or incomplete ledger semantics suitable for production.
- Keep the same service-only boundary for any new `cardora_test_*` journal writer. Browser users should receive only narrowly scoped read access to their own non-sensitive payment/payout status after identity and ownership policies are designed.
