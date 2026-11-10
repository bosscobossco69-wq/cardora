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


## Additional read-only verification — 2026-11-10

### Auth user creation triggers
- Both `on_auth_user_created` and `ptx_on_auth_user_created` are enabled on `auth.users`.
- Their functions both insert into `public.users` and both use `ON CONFLICT (auth_user_id)`, so the inspected definitions do not demonstrate duplicate rows. They are redundant competing profile-creation paths and should be consolidated only after confirming signup behavior and trigger order in staging.
- `handle_new_auth_user` sets deterministic member_id, role='user', status='active'; `ptx_handle_new_user` uses a random member_id and leaves role/status to defaults. Because both are enabled, actual resulting profile values depend on trigger execution order and conflict handling. Add signup tests before changing either trigger.

### Withdrawal and wallet review access
- `request_withdrawal` locks the approved seller row, subtracts available_balance only when sufficient, then creates a pending withdrawal request. Its inspected function body has no exception handler that credits funds back.
- Direct table grants are broader than the visible RLS policies: anon has table-level CRUD grants on seller_profiles, wallet_reviews and withdrawal_requests; authenticated has CRUD grants on these tables. RLS still applies, but broad grants are unnecessary exposure and need a table/column privilege plus policy matrix before any change.
- `wallet_reviews` has an authenticated own-row UPDATE policy. Verify column-level grants and whether users can alter status, amount, review outcome, transaction identifiers or approval metadata. Do not assume RLS alone prevents changing sensitive columns.
- `withdrawal_requests` own INSERT policy checks owner and amount >= 100, but does not constrain status or other submitted fields. Table-level grants include INSERT; inspect column privileges and test whether clients can forge request state/metadata.

### Source recovery result
- Checked all six visible repository branches, including `ai/trixovel-safe-audit` and `ai-admin-preview`; none contains `supabase/migrations`, `.sql` migration files, or Edge Function source.
- The `ai-admin-preview` branch contains a security review document only. It records that the configured production project is `crqqockaetgacddxkqpb` and the separate Cardora project is `fdkfquvzbswxocyrhduk`; do not switch the live site based on project naming.
- Supabase migration history confirms 48 version/name records, but does not provide the SQL bodies. Canonical migration source is still missing.
- GitHub code search did not return source matches for `create_market_order`; this does not prove the source is absent from private backups or local developer machines.

### Next read-only checks
- Inspect column-level grants for `wallet_reviews` and `withdrawal_requests`.
- Inspect constraints/defaults and exact columns for those tables.
- Inspect `create_market_order` and `create_order_with_wallet` full definitions side-by-side to document exactly where duplicate stock decrement occurs.
- Search trusted local/backup sources for the 48 migration SQL files and deployed Edge Function source. Do not reconstruct and apply migrations to production.


## Critical write-path findings — 2026-11-10 (read-only)

### Confirmed duplicate inventory decrement details
- `create_market_order`: inserts `order_items` (which fires the enabled AFTER INSERT reservation trigger), then separately updates `listings.inventory = inventory - quantity`.
- `create_order_with_wallet`: inserts each `order_items` row (trigger decrement), then separately decrements `listings.inventory` in the same loop.
- These are confirmed double-decrement paths when the trigger fires. Do not run these wallet checkout RPCs in production until corrected. Their current EXECUTE grants were previously verified as service_role-only, but server-side callers may still invoke them.

### Wallet review direct update risk
- `wallet_reviews` has an authenticated own-row UPDATE policy and authenticated table/column UPDATE grants. The visible policy checks only row ownership; it does not constrain changes to `amount`, `review_type`, `status`, `txid`, `reviewed_at`, or `screenshot_url`.
- Treat this as a high-priority integrity risk: an authenticated user may be able to alter their own review state/financial metadata, subject to the exact PostgREST role and policy evaluation. Reproduce only with synthetic records in staging.

### Withdrawal direct insert risk
- `withdrawal_requests` has authenticated INSERT grants across its columns. Its own-row INSERT policy checks only `user_id=current_user_row_id()` and `amount >= 100`; it does not constrain `status`, `txid`, `processed_at`, `network_fee`, or `service_fee`.
- Treat direct client INSERT as a high-priority integrity risk: test whether a caller can create a request already marked processed/paid or populate transaction metadata. Reproduce only in staging.
- The secure `request_withdrawal` function is a separate path that debits approved seller available balance and creates a pending request; it does not make the direct table INSERT policy safe.

### Registration trigger conclusion
- Both signup triggers are enabled, but both functions use `ON CONFLICT(auth_user_id)`; duplicate rows are not proven. Their differing member_id / role / status behavior is redundant and should be consolidated in staging after signup regression tests.

### Immediate staging test matrix
1. Create synthetic buyer and seller accounts.
2. Test wallet review insert/update attempts: change amount, status, review_type, txid and screenshot URL after insert.
3. Test withdrawal insert attempts with status='processed'/'paid', non-null txid and processed_at; verify they are rejected.
4. Test stock reservation for both wallet RPCs and confirm exactly one decrement per quantity.
5. Test signup and verify exactly one profile row with stable member_id, role and status.
6. Never run these negative tests against production data.


## Edge Function source recovery — 2026-11-10

Recovered deployed source snapshots directly from the configured production Supabase project's Edge Function metadata and committed them to the isolated GitHub staging branch. No secrets or environment variable values were copied.

Files added:
- `supabase/functions/ptx-email-otp/index.ts` — deployed version 6, source SHA-256 `341b96e2b39c5cf93389fb9811de4f6c8e4edabe1ff950f1666632ecac05feb0`
- `supabase/functions/ptx-email-otp/deno.json` — deployed import map/config (`{}`)
- `supabase/functions/ai-support/index.ts` — deployed version 12, source SHA-256 `e8a537608df58f4c9f70fe2e42feef024f22fdf6f160171ebdae8fdca9d3b724`

These are source snapshots, not deployed changes. The production functions remain unchanged.

### Edge Function remediation candidates
- OTP function: uses `Math.random()` for an 8-digit code; send throttling uses read-then-insert (race-prone); failed-attempt increments are read-then-write (race-prone); CORS origin is wildcard; email copy still says Pokémon Treasure. It hashes codes and expires them after 10 minutes, and limits failed attempts to 5 in the inspected flow.
- AI support: in-memory IP rate limiting is instance-local; trusts the first `x-forwarded-for` value; wildcard CORS; response fallback includes an anonymous provider. Keep the Preview-only safety prompt and explicit statement that payments/refunds/payouts are not live. Review provider data handling, abuse controls, request body limits, and trusted proxy behavior before any changes.
- Keep all secrets in Supabase/Vercel secret stores; never commit secret values.

## Migration source recovery status
- Edge Function code recovery is now complete for the two currently deployed functions.
- The 48 database migration SQL bodies remain unrecovered. Migration history only exposes version/name metadata. Continue searching trusted local backups, original SQL editor/deployment logs, or developer archives; any reconstructed baseline must be labeled reconstruction and reviewed before applying to the empty test project.
