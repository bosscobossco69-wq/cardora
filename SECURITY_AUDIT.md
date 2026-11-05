# Trixovel / Cardora — Security Audit Snapshot

**Date:** 2026-11-05  
**Code branch reviewed:** `ai/trixovel-safe-audit`  
**Repository:** `bosscobossco69-wq/cardora`  
**Database inspected read-only:** Supabase project ref `crqqockaetgacddxkqpb`

> Scope warning: the inspected Supabase project is named `pokemon-treasure-demo` and may be shared with Pokémon Treasure. No database changes, data edits, deployments, paid branch creation, or exploit tests were performed. This report is based on read-only schema, policy, privilege, trigger, and function inspection plus the current Git branch files. It is not a penetration test or a claim that the whole system is secure.

## Executive summary

**Do not enable real deposits, external payment confirmation, or seller withdrawals until the critical findings below are fixed and tested in an isolated development database.**

The current GitHub repository branch contains static HTML pages and SEO assets; it does not contain the database migrations or source code for the deployed Edge Functions. The Supabase project has 38 recorded migrations and two active Edge Functions, which were inspected through the Supabase tools.

## Critical findings

### C-01 — Authenticated users can update privileged fields in their own user row

- `users_update_own` allows UPDATE when `auth_user_id = auth.uid()`.
- `anon` and `authenticated` have table UPDATE privileges on `users`, including `role`, `balance`, `held_balance`, `status`, and `auth_user_id`.
- The policy's WITH CHECK only ensures the row still belongs to the current auth user; it does not restrict which columns can change.
- Several admin-facing functions and policies check `users.role = 'admin'` rather than the dedicated `admin_users` membership check. A user changing their own role could therefore satisfy those role-based checks. This does not automatically satisfy functions that call `is_admin()`, which checks `admin_users`.

**Recommended fix:** revoke direct client UPDATE on sensitive columns; expose a narrowly scoped profile-update function or column grants for safe profile fields only. Make every admin authorization path use one authoritative server-side admin membership check. Add regression tests proving users cannot change role, balance, held balance, status, or auth_user_id.

### C-02 — Seller profile self-insert does not constrain approval or balance fields

- `seller_profiles_insert_own` checks only `user_id = current_user_row_id()`.
- The table grants INSERT/UPDATE/DELETE to anon and authenticated roles; RLS still applies, but the authenticated self-insert policy does not constrain `status`, `verification_status`, `available_balance`, `security_deposit`, `total_sales`, or `completed_orders`.
- No trigger was found on `seller_profiles` to normalize or reject privileged values.
- The table's admin update policy checks `users.role = 'admin'`, which is also affected by C-01.

**Recommended fix:** remove direct client INSERT/UPDATE/DELETE; create seller profiles only in a trusted admin/server workflow. Enforce server-owned status and balance fields with constraints and a single controlled function.

### C-03 — Client-callable order payment function can mark a pending order paid without verifying payment

- `record_order_payment(p_order_id, p_txid)` checks that the caller owns a pending order, then sets status to `paid`.
- The function does not validate a payment-provider webhook, signature, transaction status, amount, or currency.
- The supplied `p_txid` is not used in the function body.
- The function is executable by authenticated users (and has an anon EXECUTE grant, although its auth/profile check prevents an anonymous caller from proceeding).

**Recommended fix:** remove client permission to mark an order paid. Only a server-verified payment webhook or trusted server-side payment verification function may transition an order to paid. Validate signature, provider transaction ID uniqueness, order ID, amount, currency, and final provider status.

## High-priority findings

### H-01 — Wallet order functions decrement inventory twice

- An AFTER INSERT trigger `ptx_order_items_reserve` calls `ptx_reserve_stock()`, which decrements listing inventory.
- Both `create_market_order` and `create_order_with_wallet` also manually decrement inventory after inserting `order_items`.
- Calling either function therefore causes the trigger and the function body to decrement stock for the same line item.

**Recommended fix:** keep exactly one stock-reservation mechanism. Prefer the trigger or an explicit locked update, not both. Add tests for one-item and multi-item orders, concurrent checkouts, rollback on insufficient stock, and exact inventory deltas.

### H-02 — Admin checks are inconsistent

- Some functions use `public.is_admin()` (checks `admin_users.auth_user_id`).
- At least `admin_get_listing_review_queue` and both overloads of `admin_review_listing_media` check `users.role = 'admin'`.
- RLS policies on seller profiles and withdrawal requests also check `users.role = 'admin'`.

**Recommended fix:** standardize all privileged operations on one trusted admin membership source. Audit all functions and policies for role-string checks.

### H-03 — Public seller-application INSERT policies are permissive

- `seller_applications_insert_public` applies to anon and authenticated with `WITH CHECK (true)`.
- Other INSERT policies contain field validation, but permissive RLS policies are OR-combined; the unrestricted policy can make those checks ineffective for rows it covers.

**Recommended fix:** remove the unrestricted policy and retain one intentional public intake policy with strict validation, rate limiting, and safe ownership rules. Confirm whether anonymous applications are intended.

### H-04 — Legacy checkout function does not reserve stock safely

- `create_checkout_order()` totals cart rows without locking listing rows.
- It creates a pending order, inserts order items, and clears the cart; the trigger may decrement stock, but the function's subtotal calculation and insert path do not form one explicit locked inventory validation flow.

**Recommended fix:** retire unused checkout functions or rebuild them around the same tested, atomic inventory reservation function used by the chosen checkout path.

### H-05 — Email OTP endpoint has incomplete abuse controls

- `ptx-email-otp` has `verify_jwt=false`, expected for a public email-code flow.
- It limits unconsumed sends by email (five in 15 minutes) and failed verification attempts (five per code).
- The code generator uses `Math.random()`, and no IP/device-level send throttle or distributed rate limiter is present in the inspected source.
- CORS allows all origins. This is not by itself an authentication bypass, but should be reviewed alongside abuse controls.

**Recommended fix:** use `crypto.getRandomValues`, add IP/email/device throttles backed by shared storage, prevent concurrent send races, and restrict CORS to approved origins where practical. Keep secrets server-side.

### H-06 — AI support rate limiting is process-local

- `ai-support` requires JWT verification, but its rate-limit map is in-memory per function instance.
- It relies on the first `x-forwarded-for` value for IP grouping.
- The function may forward user messages to configured external AI providers and a last-resort external provider.

**Recommended fix:** use shared rate-limit storage, validate trusted proxy IP handling, apply per-user quotas, and clearly disclose external AI processing in the privacy notice.

## Front-end observations

- The current `index.html` calls `create_order` for order creation. This function checks active listings and database prices; stock is decremented by the order-items trigger.
- The front-end calls `is_admin` before showing admin panels. This is only a UI check; database authorization must remain authoritative.
- The front-end calls `approve_wallet_deposit` and `reject_wallet_deposit`; these functions check `is_admin()`. Keep deposit crediting disabled until the payment review process is operational and independently verified.
- The frontend still contains the old `cardora-rose.vercel.app` hostname in OAuth/help and AI provider configuration. Domain migration must include Supabase Auth redirect allowlists and provider settings, not just page text.
- The frontend currently has no `functions.invoke()` calls; the two active Edge Functions are not directly invoked in the inspected index file.

## Repository / backup / environment status

- The audit branch is a GitHub code branch only; it is not a database backup.
- The repository tree currently contains HTML pages, `README.md`, `robots.txt`, and `sitemap.xml`; no SQL migration source or Edge Function source files were found in this branch.
- The Supabase database has migration history, but its schema and data may be shared with Pokémon Treasure. Do not apply schema changes to this project until an isolated, recoverable development copy is available.
- No paid Supabase branch was created. No costs were confirmed. No production changes were made.

## Remediation order

1. Fix C-01 and C-02: lock down user roles, balances, seller approval, and seller profile creation.
2. Fix C-03: make payment confirmation server-verified only.
3. Fix H-01: eliminate duplicate inventory decrement.
4. Standardize admin authorization and remove permissive public application policy.
5. Rebuild or retire legacy checkout paths; review refund, dispute, release, and withdrawal lifecycle.
6. Harden OTP and AI support rate limiting and external data handling.
7. Recover/store migration and Edge Function source in version control; establish a verified database backup and isolated test environment before applying changes.
8. Run regression tests for buyer, seller, admin, inventory, wallet ledger, deposits, withdrawals, disputes, and payment webhooks.

## Explicitly not done

No SQL writes, migrations, function deployments, data modifications, payment actions, live exploit tests, or paid infrastructure provisioning were performed.


## Additional audit findings — order lifecycle, withdrawals, and storage

### C-04 — Dispute resolution changes order status but does not execute the financial resolution

- `admin_resolve_dispute` checks `is_admin()`, marks the dispute resolved, and changes order status for `refund` or `release`.
- For `refund`, it sets the order to `cancelled` but does not restore buyer funds, reduce held balance, add a refund ledger entry, or restore inventory.
- For `release`, it changes the order to `buyer_protection`; it does not itself move funds to the seller. The later buyer-confirmation function handles seller crediting.
- `partial` marks the dispute resolved but does not implement a partial refund or release amount.

**Recommended fix:** make each resolution an atomic financial operation with explicit amounts, locked buyer/order/seller rows, idempotency keys, and ledger entries. Do not mark a dispute financially resolved until the corresponding balance and inventory movements have succeeded.

### C-05 — Buyer confirmation credits sellers but does not reconcile the held-wallet ledger

- `confirm_order_received` allows the buyer to move an order from `delivered` or `buyer_protection` to `settled`.
- It credits seller `available_balance` using 92% of item value.
- It does not decrement the buyer's `held_balance`, write a settlement transaction to `wallet_transactions`, or update `order_financials.seller_net` / `platform_fee` in the inspected function.
- This may be inconsistent with `create_order_with_wallet`, which moves funds from buyer balance to held balance at checkout. It is also inconsistent with legacy external-payment order paths unless the accounting model is explicitly reconciled elsewhere.

**Recommended fix:** define one authoritative accounting model for wallet-funded and external-payment orders. On settlement, atomically debit held funds, credit seller payable, record platform fee, write immutable ledger entries, and mark financial settlement. Add idempotency protection so repeated calls cannot double-credit.

### H-07 — Withdrawal request rows can be inserted directly with a client-selected status

- The `withdrawals_insert_own` policy checks only owner identity and `amount >= 100`.
- `withdrawal_requests.status` defaults to `pending`, but there is no status CHECK constraint in the inspected constraints.
- Authenticated clients have INSERT privileges. A direct insert may therefore set `status='approved'` or supply a transaction ID without going through `request_withdrawal`, which is the function that deducts seller available balance.
- This does not by itself prove that an actual payout can be triggered, but it can create misleading or forged withdrawal records and may affect admin/customer interfaces.

**Recommended fix:** revoke direct INSERT on `withdrawal_requests`; require the trusted withdrawal function. Enforce allowed status transitions server-side and add a CHECK constraint for valid statuses. Ensure payout processing requires an independently verified admin action and ledger record.

### H-08 — Storage admin authorization uses the vulnerable users.role field

- Both private buckets, `deposit-proofs` and `listing-media`, are configured as non-public.
- Bucket size limits are 5 MiB for deposit proofs and 10 MiB for listing media; MIME types are restricted to image formats.
- The `admin listing media all` Storage policy checks `users.role = 'admin'`, not `is_admin()`. This inherits the role-escalation risk in C-01.
- Seller media upload/read policies scope paths to the caller's auth UID. Deposit-proof read access is owner-or-`is_admin()`.

**Recommended fix:** use the same authoritative admin membership predicate for all Storage admin policies. Keep both buckets private; consider image content scanning, dimensions, and metadata stripping in the upload review pipeline.

### H-09 — Admin and OTP tables have broad SQL grants despite having no RLS policies

- `admin_users` and `ptx_email_otps` have RLS enabled with no policies, which currently means Data API row access is denied by RLS.
- The inspected grants nevertheless include broad table privileges for `anon` and `authenticated` on `admin_users`. This is unnecessary exposure and fragile defense-in-depth, even though the missing policies currently block row access.
- Re-check the exact grants for `ptx_email_otps` separately before changing them.

**Recommended fix:** revoke all client-role privileges on server-only tables and grant only the minimum required to trusted server roles. Keep the OTP table inaccessible to browser clients.

## Remaining verification limits

- The SQL inspection did not execute any test transactions and did not attempt privilege escalation.
- Storage policy review covered the two configured private buckets and the current `storage.objects` policies returned by the project.
- The report does not yet establish whether any separate external payment provider webhook, server-side payout service, or reconciliation job exists outside the inspected database functions and two active Edge Functions.


## Additional audit findings — authentication triggers and RPC exposure

### C-06 — Two auth-user creation triggers insert into the same profile table

- The `auth.users` table has two AFTER INSERT triggers: `on_auth_user_created` calling `handle_new_auth_user()`, and `ptx_on_auth_user_created` calling `ptx_handle_new_user()`.
- Both functions insert a row into `public.users` for the same `auth.users.id`.
- `users.auth_user_id` has a UNIQUE constraint.
- The first function uses `ON CONFLICT (auth_user_id) DO UPDATE`; the second performs a plain INSERT. If both triggers run for a new auth user, the second insert can violate the unique constraint and roll back the signup transaction.
- This is a static finding from trigger and function definitions; no live signup test was run.

**Recommended fix:** retain one canonical auth-user trigger and one profile-creation function. Before removing either trigger, compare its required metadata/initialization behavior and verify the existing user population. Test signup, OAuth signup, duplicate event handling, and profile creation in an isolated environment.

### H-10 — Many SECURITY DEFINER functions are executable by anon through PUBLIC privileges

- The routine privilege inventory shows most SECURITY DEFINER functions report `anon_execute=true` and `authenticated_execute=true`, even when they are intended for signed-in users or admins.
- Some functions perform internal `auth.uid()` / ownership / `is_admin()` checks, which are important defenses. However, allowing anonymous invocation unnecessarily exposes the function surface and makes future regressions more dangerous.
- Trigger functions such as `ptx_reserve_stock`, `seller_app_throttle`, `ptx_guard_wallet_reviews`, and auth-user trigger functions are not browser RPC endpoints and should not need client EXECUTE privileges.
- A few functions are intentionally public read endpoints (for example, marketplace rankings) and should be treated separately.

**Recommended fix:** inventory intended callers for every SECURITY DEFINER routine, revoke EXECUTE from `PUBLIC` / `anon` by default, and grant only the minimum required role. Keep trigger functions non-callable by browser roles. Preserve only explicitly approved public read functions. Verify PostgREST RPC access after each grant change.

### H-11 — Chat thread creation is not protected by a unique order constraint

- `create_order_chat(p_order_id)` first looks for an existing thread for the order, then inserts one if absent.
- `chat_threads.order_id` has a foreign key but no UNIQUE constraint.
- Concurrent requests can both observe no thread and create duplicate order-chat threads. This is a concurrency/integrity risk, not an authorization bypass.

**Recommended fix:** decide whether each order should have one thread or one thread per buyer/seller pair. If one per order, add a unique constraint after deduplicating existing rows and use `INSERT ... ON CONFLICT` in the function.

## Additional verified observations

- No ordinary views were returned by `pg_views` in the public schema during this inspection.
- The two auth-user triggers are the only non-internal triggers found on `auth.users`; the public schema also has the four previously documented trigger definitions.
- The two Storage buckets remain private and have image-only MIME allowlists and size limits.


## New critical finding — withdrawal exception handler can credit funds

### C-07 — `request_withdrawal` may increase seller balance when a withdrawal fails

The inspected function performs these steps:
1. Validates the minimum withdrawal amount.
2. Attempts to subtract the requested amount only where `available_balance >= p_amount`.
3. Raises `INSUFFICIENT_AVAILABLE_BALANCE` if no row was updated.
4. Its broad `EXCEPTION WHEN OTHERS` handler then unconditionally attempts to add `p_amount` back to the approved seller profile before re-raising the error.

This means that when the deduction never happened (for example, insufficient balance), the exception handler can still add the requested amount. The same structure can also run for other validation or insert failures after entering the function's exception block. This is a static control-flow finding; no withdrawal was submitted and no balances were changed.

**Recommended fix:** remove the unconditional compensating update. Prefer a single database transaction with a narrowly scoped rollback strategy: perform a conditional balance deduction, verify exactly one row changed, insert the pending withdrawal, and allow any later error to roll back the whole transaction automatically. Do not manually credit funds in a broad exception handler unless a prior debit is positively recorded and the compensation is idempotent. Add tests for insufficient balance, below-minimum amount, invalid seller, duplicate submission, and insert failure.

## Clarification — duplicate inventory reservation affects three checkout functions

The `order_items` AFTER INSERT trigger `ptx_order_items_reserve` decrements inventory for every inserted item. The following functions also manually decrement inventory after inserting order items:
- `create_market_order(p_items)`
- `create_order_with_wallet(p_items)`

Both paths therefore appear to reserve the same quantity twice. The older `create_order` and `create_checkout_order` paths rely on the trigger and do not show the same additional manual decrement in their function bodies.

**Recommended fix:** use one inventory-reservation mechanism for every active checkout path, with row locks / conditional updates and rollback-safe tests. Confirm which checkout path the frontend actually uses before retiring the others.


## Additional audit findings — direct table writes can bypass RPC workflows

### H-12 — Direct chat-message INSERT bypasses the safe moderation function

- `send_chat_message_safe(thread_id, body)` performs participant validation and blocks off-platform links/contact/payment patterns.
- However, the `chat_messages_insert_own` RLS policy permits direct INSERT whenever `sender_user_id = current_user_row_id()`.
- Authenticated users have table INSERT privilege on `chat_messages`.
- No database trigger was found that applies the same content checks to direct INSERTs.

**Impact:** an authenticated user may be able to insert messages directly and bypass the moderation checks implemented in `send_chat_message_safe`. The policy does not itself confirm that the sender belongs to the referenced thread; the SELECT policy may hide the inserted row from other users, but the row can still be stored.

**Recommended fix:** revoke direct client INSERT on `chat_messages` and route all message creation through the validated RPC, or implement equivalent database-side validation and participant checks for every insertion path. Also restrict DELETE/UPDATE privileges to the intended moderation workflow.

### H-13 — Direct chat-thread INSERT does not bind participants to the referenced order

- `chat_threads_insert_participant` allows insertion when the caller is the specified buyer or owns the specified seller profile.
- It does not verify that `buyer_id` and `seller_id` are the actual participants on the referenced `order_id`.
- The table has foreign keys but no unique constraint on `order_id`.
- The trusted `create_order_chat` RPC does perform an order-participant check, but direct INSERT is separately permitted.

**Recommended fix:** revoke direct client INSERT and use the RPC, or make the RLS policy verify the order's buyer and seller relationship. Add a unique order/thread constraint if the business rule is one chat thread per order.

### H-14 — Direct dispute INSERT does not verify order participation

- `disputes_insert_own` checks only that `opened_by = current_user_row_id()`.
- It does not check that the caller is the buyer or one of the sellers associated with the referenced order.
- Authenticated users have table INSERT privileges. The `open_order_dispute` RPC correctly checks buyer/seller participation, but the direct table policy does not enforce the same rule.

**Recommended fix:** revoke direct client INSERT on disputes and require the validated RPC, or make the RLS policy enforce the same buyer/seller relationship. Add duplicate-open-dispute protection and valid status constraints.

### Defense-in-depth note — broad table grants are not the same as a successful exploit

The inspected roles have broad SQL table grants on several workflow tables, including wallet transactions, orders, order items, disputes, and chat. RLS policies still filter those operations; for example, `wallet_transactions` currently has a SELECT policy but no client INSERT/UPDATE/DELETE policy in the returned policy list. Do not describe every listed table grant as a confirmed writable vulnerability. Prefer least-privilege table grants in addition to correctly scoped RLS.


## Latest Supabase Security Advisor snapshot

Read-only Security Advisor results were refreshed on 2026-11-05:
- 2 tables have RLS enabled with no policies: `admin_users`, `ptx_email_otps`.
- 34 SECURITY DEFINER functions are executable by `anon`.
- 38 SECURITY DEFINER functions are executable by `authenticated`.
- Leaked-password protection is disabled in Supabase Auth.

These counts are lint findings, not 72 distinct exploitable vulnerabilities. Many RPCs include internal identity/ownership/admin checks; each must be classified by intended caller and function-body validation before permissions are changed.

### H-15 — Leaked-password protection is disabled

Supabase Auth's leaked-password protection is currently disabled according to Security Advisor.

**Recommended fix:** enable leaked-password protection after checking the Auth configuration and signup/login UX. This is a configuration hardening item and does not replace MFA, rate limiting, or secure password reset controls.

Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Current high-priority direct-write observations

The latest policy/grant inspection confirmed:
- Direct INSERT on `chat_messages` is allowed by an ownership-only RLS policy, so `send_chat_message_safe` is not the only message-write path.
- Direct INSERT on `chat_threads` does not verify that the referenced order's actual buyer and seller match the supplied participants.
- Direct INSERT on `disputes` verifies only the opener's user ID, not participation in the referenced order.
- `wallet_transactions` has broad table grants, but the returned RLS policies only allow SELECT; no client INSERT/UPDATE/DELETE policy was found. Treat this as excessive grants / defense-in-depth weakness, not proof that clients can write ledger rows under current RLS.
