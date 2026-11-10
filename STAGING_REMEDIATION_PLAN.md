# Cardora Staging Remediation Plan

**Target branch:** `staging/order-safety-fixes`  
**Production database:** `crqqockaetgacddxkqpb` — read-only; no changes authorized or performed.  
**Isolated project:** `fdkfquvzbswxocyrhduk` — currently empty (0 public tables, 0 recorded migrations).  
**Status:** planning and source recovery only; no schema/function changes, deployment, or production writes.

## Safety rules

- Preserve all production records and the legacy wallet decision: disabled; do not delete historical data.
- Do not connect the preview frontend to production for checkout tests.
- Do not enable real deposits, payment confirmation, refunds, settlement, or payouts.
- Never grant browser roles broad execution rights to SECURITY DEFINER functions.
- Test only with synthetic users, listings, orders, and balances in the isolated project.
- Production changes require a separate, explicit approval after review of exact SQL/code, impact, and rollback.

## Verified high-priority findings

1. `order_items` AFTER INSERT trigger `ptx_order_items_reserve` is enabled and decrements listing inventory.
2. `create_market_order` and `create_order_with_wallet` also decrement inventory manually before/around order-item inserts; this duplicates the trigger reservation.
3. `create_order` and `create_checkout_order` rely on the trigger and do not show the same second decrement.
4. Frontend calls `create_order`, while authenticated users do not have EXECUTE permission. Do not solve by granting direct client execution.
5. `confirm_order_received` is service-role-only but credits seller available balance without corresponding held-balance release / ledger reconciliation in its inspected body.
6. Dispute refund/release/partial paths do not implement complete financial ledger movements.
7. Recent database logs included six `permission denied for table users` errors in the inspected 24-hour window. Existing RLS permits own-row reads; diagnose request JWT/role and exact query before changing grants.
8. Production migration history has 48 entries, but this GitHub repository tree has no `supabase/migrations` or Edge Function source directory. The isolated `cardora` Supabase project has no public tables and no migrations. Reconstructing schema from live production is not a safe substitute for recovering canonical migration sources.

## Required source recovery before implementation

- Recover the exact 48 migration SQL files from the original trusted source / deployment history.
- Recover deployed Edge Function source and configuration from the authoritative source repository or secure backup.
- Compare recovered migrations against production migration versions and schema; do not replay anything on production.
- Build the isolated project from reviewed migrations only; do not copy production business rows or secrets.
- Verify that Preview environment variables point exclusively to the isolated project.

## Staging implementation sequence

### A. Inventory reservation
- Select one reservation mechanism for every checkout path.
- Recommended design: one atomic, row-locked / conditional inventory reservation routine shared by all checkout entry points; remove duplicate manual or trigger reservation only after all call paths are mapped.
- Preserve rollback semantics: failed order creation must restore stock automatically.
- Tests: single item, multiple items, insufficient stock, concurrent checkout, duplicate retry, transaction rollback.

### B. Safe order creation entry point
- Implement an authenticated server-side Edge Function / backend endpoint.
- Verify JWT server-side; derive buyer identity from verified auth context, never from client-supplied user IDs.
- Validate listing status, quantity, currency, price from database, shipping rules, and idempotency.
- Keep privileged RPC execution server-side only; never expose service-role credentials to browser code.
- Tests: anonymous request, wrong owner, tampered price, invalid listing, duplicate request, expired JWT, valid buyer.

### C. Settlement and ledger
- Keep preview order states clearly labeled as simulation.
- Do not credit seller available balance until the accounting model is specified and reconciled.
- For wallet-funded orders, reconcile buyer held funds, seller net, platform fee, refunds, and immutable ledger entries in one idempotent transaction.
- External payment must be verified by a provider webhook (signature, provider transaction ID uniqueness, order, amount, currency, final status).
- Do not enable payout until a compliant provider and legal operating requirements are satisfied.
- Tests: repeated confirmation, partial refund, full refund, dispute resolution, ledger balance invariants.

### D. Users read failure
- Capture request role, JWT presence/expiry, exact query, and PostgREST error context in staging.
- Confirm own-row RLS behavior under authenticated JWT.
- Use minimal safe profile fields or a narrow server-side profile endpoint; never expose balance or privileged fields merely to clear a permission error.

## Acceptance criteria

- No production database writes, production deployment, or main-branch changes.
- All staging tests pass with synthetic data.
- No duplicate inventory decrement under concurrent load.
- Browser roles cannot invoke privileged order/payment/settlement functions.
- No seller balance changes without balanced, idempotent ledger entries.
- Preview UI never represents simulated state as real money movement.
- A reviewed rollback plan exists for every staging migration.
