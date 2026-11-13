# Cardora wallet, settlement, dispute and withdrawal ledger audit — 2026-11-13

**Production project:** `crqqockaetgacddxkqpb` — read-only inspection only  
**Staging project:** `fdkfquvzbswxocyrhduk` — no schema or data changes in this audit  
**Branch:** `staging/order-safety-fixes`  
**No Production writes, Staging writes, deployments, payment calls, or money movement were performed.**

## Confirmed Production findings

### 1. Wallet ledger is not an order ledger
The Production `wallet_transactions` table contains:
`id, user_id, review_id, type, amount, balance_after, txid, description, created_at`.

Its type constraint permits only `deposit`, `withdrawal`, and `adjustment`. It has no `order_id` column.

The inspected wallet transaction writers are:
- `approve_wallet_deposit`
- `approve_wallet_review`
- `create_market_order`
- `create_order_with_wallet`

The first two record approved deposits. `create_market_order` records an `adjustment` when buyer balance is reduced and held_balance is increased. `create_order_with_wallet` attempts an `order_hold` row with an `order_id` column; both are incompatible with the live table schema and will cause the transaction to fail at that INSERT. Do not add columns or widen the type constraint without a deliberate ledger migration and reader/writer inventory.

### 2. Seller commission calculation conflicts across Production functions and public fee page
- `create_checkout_order` creates `order_financials` with `platform_fee=0` and `seller_net=0`.
- `record_order_payment` later sets `platform_fee=8% of item_subtotal` and `seller_net=92% of item_subtotal`.
- `confirm_order_received` independently calculates seller credit as `unit_price * quantity * 0.92`, rather than consuming the recorded `order_financials.seller_net`.
- The checked-in `fees.html` says the current fee is 0% and the planned seller commission is 5%, not active.

This is a confirmed three-way policy mismatch: database payment recording uses 8%, settlement hardcodes 8%, while the public fee page describes 0% current / 5% planned. It conflicts with the project decision that the current actual fee remains 0% and the future planned platform commission is 1% (inactive). Do not activate or silently choose a rate. Before any money flow is enabled, one authoritative fee policy must feed checkout, financial snapshot, settlement, seller display and agent referral calculation.

### 3. Order settlement is not ledger-complete
`confirm_order_received` marks the order settled, stamps `order_financials.settled_at`, and increments seller_profiles.available_balance using a hardcoded 92% calculation. It does not insert a seller credit / settlement row into `wallet_transactions`, nor does it decrement buyer `users.held_balance` in the inspected body.

Its current EXECUTE ACL lists postgres and service_role, not anon/authenticated. Treat this as a server-side callable function, not a direct browser RPC.

### 4. Dispute resolution changes status only
`admin_resolve_dispute` checks `is_admin()`, updates the dispute record, and changes order status for refund/release. It does not perform the corresponding buyer refund, held-balance release, seller debit/credit reversal, or ledger entries in the inspected body. Its EXECUTE ACL includes authenticated, but the body retains the admin guard. The 'partial' resolution option currently only records the resolution note/status; no partial amount calculation or transfer appears in the body.

### 5. Withdrawal request has no matching wallet ledger movement
`request_withdrawal` locks an approved seller profile, subtracts the requested amount from `seller_profiles.available_balance`, and creates a pending `withdrawal_requests` row. It does not insert a `wallet_transactions` entry. The inspected function has EXECUTE for postgres and service_role only. No withdrawal approve/reject processor was found among the specifically named Production functions checked in this pass; this is not proof that no external/manual processor exists.

## Important architecture distinction
Production has at least two balance domains:
- Buyer wallet: `users.balance` and `users.held_balance`.
- Seller earnings: `seller_profiles.available_balance`.

A single `wallet_transactions.balance_after` field currently represents buyer wallet changes, while seller earnings and withdrawals are updated separately without corresponding entries in that table. A correct ledger design must explicitly model these domains rather than assume one generic wallet balance.

## Safe next implementation sequence
1. Keep Production read-only. Recover any missing canonical migrations / payment provider source and identify every frontend/Edge Function caller.
2. Decide an authoritative accounting model: buyer available/held, order-level escrow/hold, seller pending/available, platform commission, agent share, consignment service fee, refunds, partial refunds, and withdrawal lifecycle. Each movement must be idempotent and traceable to an order or withdrawal.
3. Preserve current business decisions until deliberately approved: actual platform fee 0%; future platform commission 1% inactive; agent referral share 25% of platform commission only; consignment service fee 15%, minimum USD10; seller subscription tiers and trial/grace terms remain separate.
4. Reconcile public `fees.html` (currently says planned 5%) with the approved future 1% plan before publication; do not change it in this backend-only audit.
5. Build an additive synthetic Staging ledger model and tests for successful settlement, duplicate confirmation, full/partial refund, dispute release, rejected withdrawal balance restoration, approved withdrawal, retry/idempotency, and concurrent requests.
6. Only after review and explicit approval should a Production migration or deployment be considered.

## Verification limits
This pass inspected database catalog metadata and current function source, plus the Staging branch `fees.html` and project tree. It did not execute payment RPCs, mutate balances, run withdrawal processing, or inspect an external payment provider dashboard. The original canonical Production migration SQL remains unrecovered.


## Historical ledger design recovered after this audit pass

A deleted historical repository revision contains `202610210001_cardora_payment_ledger.sql` (blob SHA `61d7107e7b74345672ec2f0a8afde8e558b27bb4`). Its own header explicitly labels it a payment/payout/ledger foundation, not a live integration, and says to review/apply only in a non-production project.

The draft proposes a more complete architecture than the live `wallet_transactions` table:
- provider payment transactions with provider IDs and idempotency keys;
- payout requests with explicit review/processing states and idempotency;
- ledger accounts, journals and entries using balanced debit/credit double-entry postings;
- provider event de-duplication and signature-verification status;
- refund transaction records;
- a service-role-only `cardora_private.post_ledger_journal` routine that checks journal balance and currency;
- append-only journal/entry history with reversals rather than edits;
- browser roles cannot write financial rows.

Important limitation: this file is a recovered historical draft/reference, not one of the 48 currently recorded Production migrations. Its presence does not prove these tables or functions exist in Production, and it must not be replayed against Production or silently treated as approved final accounting policy. It is a useful starting design for a separately reviewed synthetic Staging implementation.

The draft's event types include buyer_payment, platform_fee, seller_payable, seller_payout, refund, chargeback, adjustment and agent_commission. Agent commission still must be derived from the approved project rule (25% of actual platform commission) and remain inactive while platform commission is 0%; consignment service fee and seller subscriptions are separate business flows.
