-- DRAFT ONLY: isolated welcome-point entitlement ledger. No redeemable value, no cash, no live grants.
begin;
create schema cardora_rewards_private;
revoke all on schema cardora_rewards_private from public, anon, authenticated, service_role;
create table cardora_rewards_private.welcome_entitlements (
  member_auth_id uuid not null,
  task text not null check(task in ('email_verified','profile_completed','first_eligible_purchase','first_genuine_review')),
  evidence_id uuid not null,
  potential_cp integer generated always as (case task when 'email_verified' then 100 when 'profile_completed' then 100 when 'first_eligible_purchase' then 200 when 'first_genuine_review' then 100 end) stored,
  recorded_at timestamptz not null default now(),
  primary key(member_auth_id,task),
  unique(task,evidence_id)
);
alter table cardora_rewards_private.welcome_entitlements enable row level security;
revoke all on cardora_rewards_private.welcome_entitlements from public, anon, authenticated, service_role;
create table cardora_rewards_private.welcome_revocations (
  member_auth_id uuid not null,
  task text not null,
  reason text not null check(length(trim(reason)) between 1 and 240),
  revoked_at timestamptz not null default now(),
  primary key(member_auth_id,task),
  foreign key(member_auth_id,task) references cardora_rewards_private.welcome_entitlements(member_auth_id,task)
);
alter table cardora_rewards_private.welcome_revocations enable row level security;
revoke all on cardora_rewards_private.welcome_revocations from public, anon, authenticated, service_role;
-- No issuance or redemption functions. Evidence verification, campaign budget, retention,
-- account eligibility and approved terms must precede any runtime writer.
commit;
