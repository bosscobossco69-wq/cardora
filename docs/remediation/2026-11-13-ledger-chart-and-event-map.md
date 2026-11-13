# Cardora ledger chart of accounts and business-event map

**Status:** Design specification for isolated Staging ledger; not a production accounting policy or payment activation approval.  
**Scope:** Builds on `cardora_test_accounts`, `cardora_test_journals`, `cardora_test_entries`, and `cardora_test_post_journal()`.  
**No live money movement:** All examples below are conceptual posting templates. Do not run them against Production.

## 1. Non-negotiable business rules

- Platform commission is currently **0%**.
- Future platform commission is **1%**, inactive until explicit approval and a customer-facing effective date.
- Agent referral reward is **25% of actual platform commission only**. At current 0% platform commission, referral payable is 0. At a future 1% rate, the maximum referral share is 0.25% of the eligible commission base, only when a valid referral is attributed.
- Consignment service fee is **15%, minimum USD 10**. This is a separate service-fee flow, not platform commission.
- Agent service fee and Agent referral reward must be separate account codes and event types.
- Seller subscriptions are separate from order commissions:
  - Free: RM0 / 5 listings
  - Basic: RM29 / 30 listings
  - Pro: RM79 / 150 listings
  - Business: RM199 / 600 listings
  - 7-day trial; 7-day grace period.
- Legacy test helpers using 8% / 92%, and old public copy mentioning 5%, are not valid calculation sources.

## 2. Chart-of-accounts template

Create actual account rows per currency and per owner where applicable. Do not mix currencies in one journal. Do not seed real users or sellers as accounts. The following codes are proposed stable identifiers; they are not balances.

| Code | Type | Owner | Meaning |
|---|---|---|---|
| `provider_clearing` | asset | provider | Funds confirmed by provider but not yet reconciled to bank |
| `platform_cash` | asset | platform | Reconciled platform-held cash |
| `seller_recovery_receivable` | asset | seller | Amount recoverable from a seller after a post-payout refund/dispute; use only after recovery policy approval |
| `buyer_wallet_liability` | liability | buyer | Available buyer wallet funds owed to buyer |
| `order_escrow_liability` | liability | platform | Buyer-funded order value held pending order outcome |
| `seller_payable` | liability | seller | Earned seller proceeds not yet paid |
| `seller_payout_reserved` | liability | seller | Seller payable reserved for an in-flight withdrawal |
| `buyer_refund_payable` | liability | buyer | Approved refund owed but not yet transmitted |
| `agent_referral_payable` | liability | agent | Earned referral share of actual platform commission |
| `agent_service_fee_payable` | liability | agent | Agent service-fee amount pending confirmed beneficiary/settlement rules |
| `subscription_deferred_revenue` | liability | platform | Subscription cash received but not yet recognized over the service period |
| `platform_commission_revenue` | revenue | platform | Actual marketplace commission only |
| `consignment_service_revenue` | revenue | platform | Consignment service fee only if Cardora is confirmed as beneficiary |
| `subscription_revenue` | revenue | platform | Earned subscription revenue recognized over the subscription term |
| `provider_fee_expense` | expense | provider | Payment-provider fee charged to Cardora |
| `payout_network_fee_expense` | expense | provider | Network/payout fee absorbed by Cardora, only when approved |

**Important unresolved classification:** The beneficiary of the 15% consignment service fee is not yet proven by the approved business rules. Until clarified, do not credit it directly to platform revenue. Keep it in a dedicated pending payable/clearing account or leave the flow unposted in test examples. Likewise, do not decide whether provider/network fees are absorbed by Cardora, passed to seller, or charged to buyer without an explicit fee policy.

## 3. Business event map

All entries in one event use one currency and must balance exactly.

### A. Buyer payment received for an order

When provider payment is verified (signature, provider transaction ID uniqueness, order ID, amount, currency, final status):

- Debit `provider_clearing`
- Credit `order_escrow_liability`

Do not post on a browser redirect or client-supplied “success” status. Provider webhook verification and reconciliation are prerequisites; this ledger function alone does not verify provider signatures.

### B. Buyer wallet top-up

After verified provider payment:

- Debit `provider_clearing`
- Credit that buyer's `buyer_wallet_liability`

A wallet top-up is a liability to the buyer, not platform revenue.

### C. Wallet-funded order

When buyer wallet funds are atomically reserved for an order:

- Debit buyer's `buyer_wallet_liability`
- Credit `order_escrow_liability`

If the order creation transaction fails, the reservation and journal must roll back together. Never update a displayed balance without the matching journal.

### D. Order completion / seller settlement

Let eligible commission base be `B`, platform rate be `r`, and attributed referral share be `q` (0.25 only when a valid agent referral is attributable; otherwise 0). Current `r=0`; future `r=0.01` remains inactive.

- Platform commission = `B × r`
- Agent referral payable = `(B × r) × q`
- Seller payable = `B - (B × r)`

At current 0%: seller payable is the full eligible base; platform commission and Agent referral payable are zero.

At future 1% with an eligible referral: seller payable 99%, platform commission revenue 0.75%, Agent referral payable 0.25% of B. Without an eligible referral, Agent payable is zero and platform retains the full 1%.

Conceptual journal:
- Debit `order_escrow_liability` for the amount being settled
- Credit seller's `seller_payable`
- Credit `platform_commission_revenue` for actual commission less referral share
- Credit `agent_referral_payable` for the earned referral share

The eligible commission base, shipping/tax inclusion, discount treatment, rounding, partial shipment, and order-level split rules must be finalized before executable settlement code. Do not assume shipping or taxes are commissionable.

### E. Consignment service

Calculate the service fee using the approved 15% / USD10 minimum rule, but do not treat it as platform commission or Agent referral base.

Before posting revenue, confirm:
- Who is the legal/economic beneficiary (Cardora or Agent)?
- Is the minimum applied per consignment order, per item, or per service?
- Which currency and FX rate source apply if the sale is not USD?
- Is the fee withheld from seller proceeds or charged separately?

Until these are decided, use a dedicated suspense/payable design and do not recognize platform revenue.

### F. Seller subscription

At successful subscription payment:
- Debit `provider_clearing` (or buyer/platform cash source)
- Credit `subscription_deferred_revenue`

As service time is earned:
- Debit `subscription_deferred_revenue`
- Credit `subscription_revenue`

The plan price, listing quota, trial start/end, grace period, renewal, cancellation, upgrade/downgrade proration, tax, and refund policy must come from one authoritative subscription record. Trial and grace periods must not fabricate cash receipts or revenue.

### G. Refunds and disputes

- Before seller settlement, refund from escrow: debit `order_escrow_liability`, credit `buyer_refund_payable`; on confirmed provider refund, debit `buyer_refund_payable`, credit `provider_clearing` (or cash settlement account).
- Wallet refund: debit `order_escrow_liability`, credit buyer's `buyer_wallet_liability`.
- After seller payout, do not silently create a negative balance or debit an unrelated account. Use `seller_recovery_receivable` only after seller recovery, reserve, and dispute policy is explicitly approved.
- Partial refunds require explicit line-level allocation and idempotency; changing order status alone is not a refund.

### H. Seller withdrawal

On approved withdrawal reservation:
- Debit seller's `seller_payable`
- Credit seller's `seller_payout_reserved`

On confirmed payout:
- Debit seller's `seller_payout_reserved`
- Credit `platform_cash` / provider clearing

On rejected/cancelled payout:
- Debit seller's `seller_payout_reserved`
- Credit seller's `seller_payable`

Do not post “paid” based only on an admin button. Require provider payout reference and reconciliation. Fee allocation (seller vs platform) remains a policy decision.

## 4. Mandatory invariants

1. Every posted journal balances per currency: total debit = total credit.
2. A journal contains exactly one currency; no implicit FX conversion.
3. Every financial event has a unique idempotency key and stable external reference.
4. Provider event ID and provider transaction ID are unique where applicable.
5. Order, payment, refund, dispute, settlement and payout status changes are atomic with their journals.
6. Posted entries are immutable; corrections use linked reversal journals, never UPDATE/DELETE.
7. No seller available balance or buyer wallet balance changes without a matching ledger event.
8. Agent referral payable derives only from actual platform commission, never consignment service fees or subscriptions unless a separate approved referral rule is introduced.
9. Subscription revenue, consignment fees, provider fees, platform commission and Agent rewards remain separate.
10. No financial posting from frontend/browser roles; service-side callers must verify authorization and source events.

## 5. Decisions required before production-grade posting functions

These are deliberately left unresolved rather than guessed:

- Commission base: item subtotal only, or include shipping/tax? How discounts and refunds alter the base?
- Consignment fee beneficiary and minimum-fee application unit.
- Provider and network fee payer.
- Refund after seller payout: recovery/negative balance/reserve policy.
- Subscription recognition, cancellation, renewal and proration policy.
- Supported settlement currencies, rounding scale, FX source and FX spread treatment.
- Whether seller payout is external provider settlement or internal wallet credit.

## 6. Implementation boundary

This document is a design map only. The current Staging ledger tables are empty and the posting function is a primitive. No chart rows, balances, real payment events, checkout wiring, webhook verification, refund execution, settlement, or payout have been activated. Production remains read-only.
