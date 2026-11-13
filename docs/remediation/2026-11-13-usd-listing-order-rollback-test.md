# Cardora Staging — USD Listing-to-Order Rollback Test
Date: 2026-11-13
Branch: staging/order-safety-fixes
Target: Supabase Staging (`fdkfquvzbswxocyrhduk`)

## Test performed
A synthetic approved Seller account already present in Staging was used by setting transaction-local JWT claims. Within one explicit database transaction:
1. Called the repaired `create_seller_listing` function to create a synthetic listing priced at USD 2.50.
2. Verified the listing currency was USD.
3. Changed only the temporary test listing to active so the existing order-creation routine could accept it.
4. Called `create_order` for quantity 1.
5. Verified the new order currency was USD.
6. Verified `order_items.unit_price` was 2.50.
7. Rolled back the entire transaction.

No test row was retained and no real payment was made.

## Result
The database accepted the synthetic Seller listing and order creation without error. The validation query completed and the transaction was rolled back. The test therefore exercised:
- seller listing creation -> USD denomination
- order creation -> USD currency propagation
- order item -> USD-denominated unit price

The SQL tool did not return NOTICE output, so the report relies on successful completion of the DO block (which raises an exception on any failed assertion) and the post-rollback row counts.

## Post-rollback integrity check
- listings: 5 (same as before)
- listing_details: 0 (same as before)
- orders: 1 (same as before)
- order_items: 1 (same as before)
- listings with currency other than USD: 0

All prior Staging fixtures remained unchanged.

## Security and scope
- The repaired function remains SECURITY DEFINER with empty search_path.
- anon EXECUTE = false.
- authenticated EXECUTE = true (function internally requires an authenticated approved Seller).
- service_role EXECUTE = true.
- Security advisor was run. It still reports pre-existing findings: RLS-enabled/no-policy INFO items, six authenticated SECURITY DEFINER routines (including the intended seller/order/admin RPCs) and leaked-password protection disabled. No unrelated ACLs or Auth settings were changed.
- Production remained read-only; no Vercel deployment; no real money movement.

## Conclusion
The targeted Staging correction is applied and the synthetic rollback-only listing-to-order currency propagation test passed. This does not prove payment-provider support for USD presentment or MYR settlement; those remain separate integration requirements.
