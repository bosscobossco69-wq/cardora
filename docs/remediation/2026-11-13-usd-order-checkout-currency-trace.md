# Cardora Staging — USD Order & Checkout Currency Trace
Date: 2026-11-13
Branch: staging/order-safety-fixes
Target: Supabase Staging (`fdkfquvzbswxocyrhduk`)
Status: read-only inspection; no database or application changes.

## Confirmed currency data
Current Staging rows:
- `listings`: 5 rows, all `USD`.
- `orders`: 1 row, `USD`.
- `order_financials`: 1 row, `USD`.

This is consistent with the user's clarification that Cardora listing prices are denominated in USD, not USDT. Existing fixture rows were not changed.

## Confirmed order creation function
Staging contains `public.create_order(jsonb,numeric)`. It:
1. Requires an authenticated user and locks the user's internal row.
2. Validates item IDs and quantities.
3. Reads the currency from the selected listings.
4. Rejects a basket with more than one listing currency (`MIXED_CURRENCY_NOT_ALLOWED`).
5. Writes the selected listing currency directly into `orders.currency`.
6. Copies listing prices into `order_items.unit_price` and calculates order total in that same currency.
7. Ignores client-supplied shipping in this preview build because there is no verified shipping-rate engine.
8. Does not perform payment capture or settlement.

Thus the inspected Staging order-creation path preserves USD from listing -> order -> order item price. No automatic USD-to-MYR conversion is performed in this function.

## Confirmed schema defaults
- `listings.currency`: NOT NULL, default `USD`.
- `orders.currency`: NOT NULL, default `USD`.
- `order_financials.currency`: NOT NULL, default `USD`.

## Important scope distinction
- Listing/order denomination: USD.
- Platform base accounting / Malaysia settlement direction: MYR, as discussed with the user.
These are distinct. A real payment/settlement integration must explicitly record provider-presentment currency, settlement currency, FX rate/source/timestamp, and any conversion fee. The current Staging create_order function is only an order-creation preview and does not establish that any payment provider accepts USD or settles MYR.

## Known outstanding issues
- `create_seller_listing` still hardcodes `currency='USDT'`, despite the listings column default and current fixtures using USD. This is a confirmed Staging bug and should be changed to USD in a narrowly scoped migration after confirming dependent code.
- The inspected Staging schema contains `order_financials` with USD default, but the earlier audit found financial finalization helpers that hardcode an 8% fee / 92% seller net. Those values conflict with the agreed current 0% / future 1% commission policy and must not be activated.
- Staging inspection found `create_order` but did not find the separate production-oriented `create_checkout_order`, `create_market_order`, `create_order_with_wallet`, or `record_order_payment` routines in this query. Do not assume their Production behavior is represented in Staging.
- No provider signature verification, actual payment capture, payout, or MYR FX settlement was tested or performed.

## Next safe steps
1. Inspect application source for checkout/payment currency handling and identify any remaining USDT literals.
2. Change only the Staging `create_seller_listing` currency literal from USDT to USD in an additive migration, then test a synthetic listing and ensure it propagates USD into orders.
3. Design explicit FX/settlement fields and payment-provider capability checks before claiming USD collection with MYR settlement is operational.
4. Keep Production read-only and do not deploy or process real funds.
