# Cardora Staging Remediation Plan

**Target branch:** `staging/order-safety-fixes`  
**Production database:** `crqqockaetgacddxkqpb` — read-only; no changes authorized or performed.  
**Isolated project:** `fdkfquvzbswxocyrhduk` — populated synthetic Staging project; latest check found 26 public tables and 17 recorded migrations.  
**Status:** Staging-only additive test schema/function work has been applied; Production remains read-only and no deployment has been performed.

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


## Deleted Supabase directory history recovery — 2026-11-10 (read-only)

A historical parent revision was located before commit `986e6790e6d321f652e9d86b87648e460da4aa14` ("Delete supabase directory"). Its parent is `f9b7e459b64f6368b9af7da915d7750693ff1b60`. The deleted `supabase/migrations` directory contained exactly three SQL files:

1. `202610210001_cardora_payment_ledger.sql` — blob SHA `61d7107e7b74345672ec2f0a8afde8e558b27bb4`. Payment/payout/ledger schema and service-role-only journal function. Header says review/apply only in a non-production project first; this is not a live payment integration.
2. `202610210002_cardora_privacy_controls.sql` — blob SHA `3211c66ed902fde6e251bd04ab6ec31a79cd234f`. Explicitly marked Draft only; policy acceptance and privacy request tables.
3. `202610210003_cardora_seller_leaderboard.sql` — blob SHA `b41ec674b42c21ec4446eaa6512c0eaa55dd8bf5`. Explicitly says not yet applied to any project; leaderboard tables and view.

The production project's current migration history contains 48 versions, but none of these three version identifiers appears in that list. Therefore these are recovered historical design/draft files, not missing applied migrations and not evidence of production schema state. Do not replay them or insert their version identifiers into migration history. Preserve them as reference material only; any future test must use an isolated non-production database after review.

The recovered parent directory also had `email-templates/` and `functions/` folders; their contents are separate from the three SQL migrations. The directory deletion removed 449 lines across the files listed in the deletion commit. This recovery does not resolve the missing source bodies for the 48 applied production migrations.


## Original repository cross-check — 2026-11-10 (read-only)

Checked the separate original repository `bosscobossco69-wq/pokemon-treasure` (default branch `main`, tree SHA `7f8fe630dbfd3f6c157e99d4ca320b070009afd6`). Its current recursive tree contains the legacy HTML application files and no `supabase/` directory or migration SQL. This repository therefore does not currently provide the missing applied migration bodies.

Cardora repository path history for `supabase/migrations` shows only the directory's appearance in the 2026-10-21 upload commit `8123cfcfccddd616986b9d313c29c703077a297f` and its removal in `986e6790e6d321f652e9d86b87648e460da4aa14`. The directory at its recovered parent revision held only the three draft/reference SQL files documented above. The 48 production-applied migrations (versions 2026-09-19 through 2026-11-09) are not present in this GitHub history path.

Conclusion: GitHub history searched so far has not yielded the original SQL bodies for the 48 applied production migrations. Continue with trusted local project archives, developer machine backups, Supabase CLI working directories, SQL Editor/deployment logs, or a separately retained repository/archive. If none exists, create a read-only reconstructed schema baseline from the current production catalog, label it explicitly as reconstructed (not original migration source), and review it before any use in the isolated test project. Never replay it against production.


## Extended catalog and privilege audit — 2026-11-10 (read-only)

### View exposure: public seller leaderboard
- public.public_seller_leaderboard is a simple view over seller_profiles selecting display_name, completed_orders and a derived verified flag, filtering active sellers with completed orders and a non-empty display name.
- The view has no security_invoker=true reloption in the inspected catalog. Ordinary PostgreSQL views execute with the view owner's privileges by default and can bypass underlying-table RLS for callers.
- Catalog ACL reports anon and authenticated with arwdDxtm on the view (including INSERT/UPDATE/DELETE privileges), in addition to SELECT. The view is a simple potentially-updatable view; the combination of owner-context view semantics and broad write grants is a critical exposure requiring isolated reproduction and dependency review.
- Do not test writes on production. In staging, verify whether the view is automatically updatable and whether writes can affect seller_profiles; then design a read-only, explicitly security-invoker view or revoke unnecessary privileges. No production fix is authorized here.

### Column-level table grants
- information_schema.role_column_grants shows widespread column-level INSERT/SELECT/UPDATE grants to anon and authenticated across business tables, including listings, orders, order_items, order_financials, order_shipping, wallet_reviews, wallet_transactions, withdrawal_requests, seller_profiles, listing media/reviews, disputes, carts, chat, card requests/scans, and listing submissions.
- This is a privilege inventory, not proof that all rows are reachable: RLS policies still apply to tables with RLS enabled. Broad column grants materially increase the impact of any permissive or incorrectly scoped policy and should be reduced to least privilege after mapping actual frontend/API usage.
- The leaderboard view is a separate concern because ordinary view security semantics can bypass base-table RLS; its anon/authenticated ACL is explicitly broad.

### Wallet review trigger correction
- Earlier notes described the own-row UPDATE policy as a possible path to changing sensitive review fields. The extended trigger inventory confirms an enabled BEFORE UPDATE OR DELETE trigger ptx_guard_wallet_reviews calling ptx_guard_wallet_reviews().
- The inspected function raises 'Admin access required' whenever public.is_admin() is false. Therefore, the prior statement that a non-admin user may be able to update their own wallet review fields is not established and is likely blocked by this trigger. Keep it as a staging regression test, not a confirmed exploit.
- The authenticated/anon column grants remain broader than necessary and should still be reviewed. The trigger is SECURITY DEFINER but performs an admin check and returns OLD/NEW; do not weaken or remove it without a replacement guard.

### Storage policies and buckets
- Both buckets remain private: deposit-proofs (5 MiB; JPEG/PNG/WebP/HEIC) and listing-media (10 MiB; JPEG/PNG/WebP).
- deposit-proofs: authenticated users may upload under a first-level folder matching their auth UID; reads are limited to own folder or is_admin().
- listing-media: authenticated users may upload and read under their own UID folder; admin ALL policy checks users.role='admin'.
- No public bucket setting was found. No Storage policy or bucket was modified.

### Function EXECUTE ACL snapshot
- The inspected sensitive order/payment/withdrawal functions (create_order, create_market_order, create_order_with_wallet, create_checkout_order, record_order_payment, request_withdrawal, confirm_order_received) currently show EXECUTE for postgres and service_role, not anon or authenticated.
- admin_resolve_dispute currently shows EXECUTE for authenticated as well as postgres and service_role; its body calls is_admin() before resolving. Retain server-side authorization checks and test this path with non-admin/admin synthetic users.
- current_user_row_id and is_admin are executable by authenticated users as helper functions. This is not itself evidence of privilege escalation; review their returned data and caller assumptions.

### Revised priority
1. Critical: public_seller_leaderboard ordinary view semantics plus anon/authenticated write ACL.
2. High: widespread anon/authenticated column-level CRUD grants; correlate each with RLS policy and actual client usage.
3. High: direct withdrawal_requests INSERT policy field integrity; test synthetic processed/paid metadata attempts.
4. High: duplicate inventory decrement in wallet order RPCs.
5. Medium: duplicate auth signup triggers; consolidate only after staging signup regression tests.
6. Corrected: wallet_reviews non-admin own-row UPDATE exploit is not confirmed because the enabled guard trigger rejects non-admin UPDATE/DELETE.

### Scope and safety confirmation
- All catalog queries in this section were SELECT-only against production project crqqockaetgacddxkqpb.
- No production rows, schema, grants, policies, views, functions, buckets, or deployments were changed.
- This remains a reconstructed audit record, not a recovered migration set. The empty isolated project fdkfquvzbswxocyrhduk has not been modified.


### Leaderboard view privilege verification — 2026-11-10 (read-only)

A second catalog pass confirmed the exact PostgreSQL view capability and underlying RLS context:
- `information_schema.views` reports `is_updatable=YES`, `is_insertable_into=YES`, `is_trigger_updatable=NO`, and `is_trigger_deletable=NO` for `public_seller_leaderboard`.
- `pg_relation_is_updatable(view_oid, true)` returned bitmask `28`; combined with the information_schema flags, this confirms the view is automatically updatable/insertable.
- Effective privilege checks return true for anon and authenticated for SELECT, INSERT, UPDATE, and DELETE on the view.
- Its only reloption is `security_barrier=true`; this is not equivalent to `security_invoker=true` and does not make the view honor caller RLS on the base table.
- `seller_profiles` has RLS enabled (but FORCE ROW LEVEL SECURITY is false). Its inspected policies include authenticated own-profile INSERT constrained to pending/default-zero fields; SELECT for own row or users.role='admin'; and UPDATE for users.role='admin'. No general authenticated UPDATE policy was shown.

Assessment: the mismatch is confirmed at the catalog/privilege level: the leaderboard view is insertable and updatable by browser roles while the base table has restrictive RLS. Since the ordinary view executes with owner privileges by default, the view may provide a route around the base-table policy model. Exact data mutation impact still requires synthetic staging reproduction; no write exploit has been run or claimed as demonstrated.

Staging-only validation plan:
1. Build a minimal synthetic seller_profiles fixture with two users and representative RLS policies in the isolated database (do not copy production rows).
2. Create an equivalent view owned by a controlled test role, first matching the current security_barrier-only definition.
3. Under anon and authenticated JWT contexts, test SELECT and attempted INSERT/UPDATE/DELETE through the view; inspect base rows after each transaction.
4. Repeat with a security-invoker view and least-privilege SELECT-only grants; confirm caller RLS applies and writes are denied.
5. Inspect frontend references to the view and preserve its required public leaderboard SELECT behavior before proposing a production migration.

No production view, grants, policies, table, or data were modified. The isolated project remains untouched pending explicit approval for test DDL.


### Frontend dependency check for leaderboard view — 2026-11-10 (read-only)

Inspected the staging branch `index.html` around the leaderboard loader (lines 211-228). The only discovered client call to `public_seller_leaderboard` is a read query selecting exactly `display_name,completed_orders,verified`, ordered by completed_orders and limited to 25 rows. No client-side INSERT, UPDATE, or DELETE call against this view was found in the inspected file. The homepage uses the view as a public leaderboard and displays only those projected fields.

Remediation implication:
- Preserve the public SELECT behavior required by the homepage; do not blindly convert to security_invoker=true because the current seller_profiles SELECT policy is own-row/admin-only and would likely make the public leaderboard empty for anon users.
- First candidate for isolated validation: retain the narrowly projected owner-context view for public SELECT, but revoke INSERT, UPDATE, and DELETE from anon/authenticated and confirm the view owner and base-table projection expose no additional sensitive columns.
- Alternative: security-invoker view only if a deliberate public-read policy and the minimum necessary base-table SELECT column grants are designed and tested without exposing seller_profiles through the Data API.
- Check all frontend files and any external consumers before finalizing; the current scan covered the staging index.html loader.

No production or isolated database changes were made. The above are remediation candidates only, pending a complete consumer/role review and explicit approval for isolated test DDL.


## Staging schema correction and Seller/Listing workflow repair — 2026-11-13

This section supersedes earlier statements above that the isolated project was empty or untouched. A fresh catalog check found that project `fdkfquvzbswxocyrhduk` already contained a partial synthetic schema and test fixtures. It is not a clean copy of Production.

### Pre-change findings
- Staging had users, seller_applications, seller_profiles, listings, orders, order_items, test_listing_sellers and other test-only tables, but no `listing_details`.
- Staging had `create_order` plus `ptx_reserve_stock`; this path relies on the order_items AFTER INSERT trigger and does not perform a second manual inventory decrement.
- Staging had no Seller application review, seller listing creation, listing review queue, listing review, or seller resubmission functions.
- Production `admin_review_seller_application` approved every application role by creating/updating seller_profiles, so approving an Agent application could incorrectly create/promote a Seller Profile.
- Production `seller_resubmit_listing` compared `listing_details.seller_id` (a seller_profiles.id) to `current_user_row_id()` (a users.id), an incorrect ID-domain comparison.
- Production `admin_get_listing_review_queue` joined `seller_profiles.user_id` to `listing_details.seller_id`; the correct relation is `seller_profiles.id = listing_details.seller_id`.
- Production `seller_applications.status` permits pending/contacted/approved/rejected, while the review function also accepted needs_info. That status is inconsistent with the table constraint.

### Applied staging migration
- Added `supabase/migrations/20261113045016_cardora_staging_seller_listing_workflow_fixes.sql` on branch `staging/order-safety-fixes`.
- Applied the same migration to the isolated Staging Supabase project only; migration history records `20261113045016_cardora_staging_seller_listing_workflow_fixes`.
- Added the missing `listing_details` table with `seller_id -> seller_profiles.id`, enabled RLS, and added a read policy for the owning seller or admin.
- Added/fixed the Seller application approval function so only role=seller creates/promotes seller_profiles; approved Agent applications do not.
- Used the existing valid application statuses. `contacted` is the waiting-for-information state; `needs_info` remains invalid until the schema and UI are deliberately migrated together.
- Added seller listing creation, admin review queue, admin listing review, and seller resubmission functions. Seller ownership is checked by joining seller_profiles.id to listing_details.seller_id and seller_profiles.user_id to current_user_row_id().
- Function EXECUTE grants are limited to authenticated/service_role; anonymous execution is revoked. Admin functions perform an explicit users.role='admin' check.

### Staging-only regression results
A rollback-clean DO-block test completed successfully:
1. Approved a synthetic Agent application while temporarily setting the fixture profile to pending; the Seller Profile remained pending (Agent approval did not promote it).
2. Created a seller listing and verified listing_details.seller_id equals seller_profiles.id.
3. Verified the admin review queue returns the seller display name through the corrected ID join.
4. Resubmitted a rejected listing as its owning seller; status returned to pending_review.
5. A separate rollback-clean stock test created an active test listing with inventory 5, created an order for quantity 2, and verified inventory became exactly 3 (one reservation, not two).

All test-created applications, listings and orders were removed at the end of their test blocks. The existing synthetic seller ledger fixture and test financial data were preserved.

### Remaining work
- Production remains read-only and unchanged. Do not apply this migration to Production.
- The staging seller/listing migration is a test implementation, not yet a Production release.
- Next inspect Production wallet checkout RPC call paths and design the duplicate stock-decrement correction in a separate Staging migration; do not change the already-working Staging `create_order` + trigger path.
- Review the full application UI status labels before deciding whether to add a `needs_info` state; do not silently change the current allowed status set.
- Do not change approved subscription prices, agent referral share, consignment fee, or any platform fee as part of this workflow repair.


## Staging reality correction — 2026-11-13

An earlier opening note in this plan incorrectly described the isolated project as empty. That statement is obsolete. Current live inspection shows a populated synthetic Staging project with 26 public tables and 17 recorded migrations. Staging includes synthetic seller/financial test fixtures; preserve them.

### Seller/listing workflow staging work
- Migration `20261113045016_cardora_staging_seller_listing_workflow_fixes` is present in Staging and on this branch.
- It adds the missing Staging `listing_details` test table and fixes Seller-only profile creation on approval, seller-profile ID joins, admin review queue, listing review and rejected-listing resubmission.
- Transactional tests verified Seller listing creation and rejected-listing resubmission; test rows were rolled back.
- A trigger-only stock test verified quantity 3 reduces inventory from 10 to 7. Test rows were rolled back.

### Wallet order audit update — 2026-11-13
- Production `create_market_order` and `create_order_with_wallet` both duplicate the stock trigger decrement with manual inventory UPDATE statements.
- Production `create_order_with_wallet` additionally references a nonexistent `wallet_transactions.order_id` column and inserts `type='order_hold'`, which violates the existing CHECK constraint allowing only deposit/withdrawal/adjustment.
- Staging lacks both Production wallet RPCs and is not yet schema-equivalent; no guessed RPC replacement was applied.
- See `docs/remediation/2026-11-13-stock-and-wallet-order-audit.md` for exact findings and safe remediation sequence.
- No Production database writes, Production branch changes, or deployments have occurred.


### Wallet, settlement, dispute and withdrawal audit — 2026-11-13
- Production wallet_transactions has only buyer wallet deposit/adjustment writers and no order_id; allowed types are deposit/withdrawal/adjustment. create_order_with_wallet's order_hold insert is schema-incompatible.
- create_checkout_order initializes order_financials platform_fee/seller_net to zero; record_order_payment changes them to 8% / 92%; confirm_order_received separately hardcodes seller credit at 92%. Checked-in fees.html says current 0% and planned 5%, while the approved project decision is current 0% and future 1% inactive. This policy mismatch must be resolved before any payment activation.
- confirm_order_received increments seller available_balance but does not release buyer users.held_balance or add a corresponding seller ledger entry in its inspected body.
- admin_resolve_dispute only updates dispute/order statuses for refund/release/partial; no corresponding balance or ledger movements appear in its body.
- request_withdrawal deducts seller available_balance and creates a pending withdrawal request but does not create a matching wallet_transactions entry. No named approve/reject withdrawal processor was found in this pass; an external/manual processor was not ruled out.
- Production has separate buyer balances (users.balance / held_balance) and seller earnings (seller_profiles.available_balance); the current wallet_transactions table does not represent both domains as a unified traceable ledger.
- See `docs/remediation/2026-11-13-wallet-settlement-ledger-audit.md` for verified source details, limitations and safe implementation sequence.
- No Production writes, Staging schema/data changes, deployments, payment calls, or money movement occurred.
