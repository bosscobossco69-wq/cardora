# Cardora Agent Module — Staging Data Model Proposal
Date: 2026-11-13
Branch: staging/order-safety-fixes
Status: design only; not applied to Supabase

## Confirmed existing foundation
- `seller_applications` already supports `role='seller'` and `role='agent'` at the function level. Its persisted statuses are pending/contacted/approved/rejected.
- `seller_profiles` is Seller-only and unique by `user_id`.
- `admin_review_seller_application(uuid,text,text)` approves Agent applications without creating Seller Profiles. It currently does not create Agent records.
- `users.id` is the internal user UUID; `users.auth_user_id` maps to the authenticated account.
- No Agent- or Subscription-named public tables were found in the Staging schema inventory.

## Design goals
1. Keep Agent identity separate from Seller identity.
2. Keep Agent service charges separate from referral rewards.
3. Keep referral attribution immutable after qualification, with controlled admin correction/audit trail rather than silent reassignment.
4. Never calculate a reward from a nominal rate alone; reward is based on the actual platform commission posted to the ledger.
5. MYR is the initial accounting currency. USD may be displayed as an indicative conversion only. USDT is not enabled.
6. No client-side writes to financial records. All financial effects must be posted by trusted server/service-role functions through the double-entry journal primitive.

## Proposed tables

### 1. `agent_profiles`
Purpose: Agent identity and operational status after Agent application approval.
Suggested fields:
- `id uuid primary key`
- `user_id uuid not null unique references users(id)`
- `application_id uuid not null unique references seller_applications(id)`
- `status text not null` — proposed values: active, suspended, closed
- `referral_code text not null unique`
- `display_name text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Do not add a balance column. Agent payable/reward balances belong in the journal-derived accounting view, not mutable profile fields.

### 2. `agent_referral_attributions`
Purpose: record which Agent introduced a user.
Suggested fields:
- `id uuid primary key`
- `agent_profile_id uuid not null references agent_profiles(id)`
- `referred_user_id uuid not null references users(id)`
- `referral_code_snapshot text not null`
- `status text not null` — proposed values: pending, qualified, void
- `attributed_at timestamptz not null default now()`
- `qualified_at timestamptz`
- `voided_at timestamptz`
- `created_at timestamptz not null default now()`

Constraint: one attribution per referred user (`unique(referred_user_id)`). Prevent self-referral. Attribution must be created through a trusted function that validates the Agent is active and the referred user is eligible. Do not allow an Agent to change their own attribution. Corrections require a separately audited admin operation.

### 3. `agent_service_orders`
Purpose: Agent services that may carry a separately quoted service fee.
Suggested fields:
- `id uuid primary key`
- `agent_profile_id uuid not null references agent_profiles(id)`
- `customer_user_id uuid references users(id)`
- `service_type text not null`
- `description text`
- `status text not null` — proposed values: requested, quoted, accepted, in_progress, completed, cancelled, disputed
- `quoted_amount numeric(18,2)`
- `currency char(3)` — initially only MYR permitted for actual accounting
- `accepted_at, completed_at, cancelled_at timestamptz`
- `created_at, updated_at timestamptz`

The fee amount/rate and beneficiary are deliberately not fixed in this proposal. A service order is not a referral reward and must not create an Agent referral payable automatically.

### 4. `agent_service_fee_events`
Purpose: auditable lifecycle events for the service fee, not a mutable balance.
Suggested fields:
- `id uuid primary key`
- `service_order_id uuid not null references agent_service_orders(id)`
- `event_type text not null` — proposed values: quote_accepted, payment_confirmed, refund_confirmed, waived
- `amount numeric(18,2) not null`
- `currency char(3) not null`
- `journal_id uuid references cardora_test_journals(id)`
- `idempotency_key text not null unique`
- `created_at timestamptz not null default now()`

Only trusted server-side code may append these events. The event must reference a posted journal when it represents a financial movement. No browser writes.

## Referral reward accounting rule
- Current platform commission rate = 0%; future 1% is inactive until explicit activation and publication.
- Agent referral share = 25% of the actual platform commission amount attributable to eligible referred transactions.
- While actual platform commission is 0, Agent referral reward is 0.
- Reward is created only after the underlying platform commission journal is posted and attribution is valid/qualified.
- Do not compute rewards from gross order value, consignment fees, Agent service fees, subscription revenue, or estimated commissions.
- Reward posting must be idempotent and journal-backed. Keep reversal entries for refunds/disputes; never edit or delete a posted journal.

## Onboarding integration proposal
After admin approves an Agent application:
1. Lock application row.
2. Verify role = agent and user_id is linked.
3. Insert one Agent Profile linked uniquely to that application and user.
4. Generate a unique referral code server-side.
5. If profile already exists for the application/user, return the existing profile (idempotent).
6. Do not create a Seller Profile.
7. Record audit metadata for who approved and when (requires a schema decision because current seller_applications has no reviewer columns).

Seller approval continues to create Seller Profile only.

## Security
- Enable RLS on all new tables.
- No direct INSERT/UPDATE/DELETE grants to anon or authenticated.
- Agent-facing reads should be exposed through narrowly scoped views/RPCs that only return the caller's own profile, own service orders, and permitted referral summaries.
- SECURITY DEFINER functions must set a fixed search_path and validate caller identity/role explicitly.
- Financial journal writes remain service-role/server-only; never grant browser roles execution on the journal posting primitive.
- Do not expose raw referral identities or customer personal data in Agent dashboards; aggregate counts/eligible reward summaries unless there is a legitimate operational need.

## Open business decisions (must not be guessed)
- Agent service fee price/rate and who receives it.
- Whether service fees are charged to customers, Agents, or another party.
- Which service types Agents may provide and completion/acceptance evidence.
- Referral qualification event (signup, first verified purchase, or another milestone), attribution window, and fraud/chargeback handling.
- Reward release timing and any minimum payout threshold.
- Tax treatment and whether Agent payouts are external bank transfers or internal balances.
- Whether referral reward applies only to platform commission from marketplace orders or also other commission-bearing products. It must exclude unrelated fee categories unless explicitly approved.

## Implementation gate
This is a design proposal only. Do not apply DDL or seed accounts until the open business decisions are resolved and the Agent schema is reviewed against the actual application code. Implement in additive Staging migrations only, then run synthetic idempotency, RLS, role separation, referral fraud, and journal-balance tests. Production remains read-only.
