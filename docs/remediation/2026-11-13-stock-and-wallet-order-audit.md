# Cardora inventory and wallet-order audit — 2026-11-13

**Branch:** `staging/order-safety-fixes`  
**Production project:** `crqqockaetgacddxkqpb` — read-only only  
**Staging project:** `fdkfquvzbswxocyrhduk` — synthetic tests only  
**No Production or Vercel changes were made.**

## Confirmed Production findings

### 1. Duplicate stock reservation in `create_market_order`

Production has an enabled `AFTER INSERT` trigger on `public.order_items`:

```sql
CREATE TRIGGER ptx_order_items_reserve
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.ptx_reserve_stock();
```

The trigger decrements `listings.inventory` once for each inserted order item, with a conditional stock check.

The Production function `create_market_order(jsonb)` inserts order items and then performs a second explicit `UPDATE listings SET inventory = inventory - quantity`. This is a confirmed duplicate decrement path.

**Minimal correction:** retain the existing trigger reservation and remove the explicit inventory UPDATE from `create_market_order`. Do not remove the trigger; other checkout paths rely on it. Before a production patch, also test aggregated duplicate listing IDs, insufficient stock, and concurrent checkout.

### 2. `create_order_with_wallet` has the same duplicate reservation code

It inserts each `order_items` row (trigger reservation), then separately decrements the listing in its loop. The explicit UPDATE is redundant and should be removed if this function is retained.

However, there are additional schema incompatibilities that must be fixed before this function can work:

- Production `wallet_transactions` has no `order_id` column, but this function inserts into `wallet_transactions(user_id, order_id, type, amount, balance_after, description)`.
- The Production `wallet_transactions.type` CHECK constraint permits only `deposit`, `withdrawal`, and `adjustment`, but this function inserts `order_hold`.

The wallet update and order-item writes are in one transaction, so the later invalid ledger INSERT should abort and roll back the preceding changes. This function must not be treated as a working wallet checkout path. Do not add a new `order_id` column or expand the type constraint merely to silence the error; first reconcile the canonical wallet ledger model and all readers/writers.

### 3. Production wallet transaction schema

Verified columns:
- `id`, `user_id`, `review_id`, `type`, `amount`, `balance_after`, `txid`, `description`, `created_at`

Verified type constraint:
- `type IN ('deposit','withdrawal','adjustment')`

## Staging verification performed

- Staging has the `order_items` AFTER INSERT stock reservation trigger.
- A transaction inserting quantity 3 against inventory 10 showed inventory 7, proving the trigger alone reserves once.
- A temporary, transaction-scoped wallet-order test function that used the trigger as the sole stock reservation completed its test path; its synthetic balance changed from 100 available / 0 held to 70 available / 30 held.
- The temporary function, synthetic listing/order, and balance changes were rolled back. No persistent test function or test order was left behind.
- Staging `wallet_transactions` also lacks `order_id` and has the same three-value type constraint. Staging does not contain Production's `create_market_order` or `create_order_with_wallet`, so it cannot directly execute those Production RPCs without additional schema/source recovery.

## Safe implementation decision

1. Do not apply a guessed replacement function to Staging: the two Production wallet RPCs are absent there, and the canonical original migration source is still unrecovered.
2. Recover the canonical function source and wallet-ledger design.
3. Prepare a reviewed Production SQL patch that removes duplicate stock updates from the two wallet functions and resolves the invalid `order_id` / `order_hold` ledger write in `create_order_with_wallet`.
4. Build matching isolated Staging schema and test both functions with synthetic users, including duplicate listing IDs, insufficient stock, rollback, and concurrent requests.
5. Production remains read-only until the exact patch and rollback plan are reviewed and separately approved.

## Important distinction

The trigger-only `create_order` path in Staging is not evidence that the Production wallet RPCs are fixed. It only verifies that the shared trigger decrements stock once when no second manual decrement is present.
