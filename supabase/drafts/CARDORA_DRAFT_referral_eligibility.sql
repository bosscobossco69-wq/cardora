-- DRAFT ONLY: private referral eligibility and pending invitation codes.
-- No trigger, public RPC, KYC upload, automatic approval, payout or grant.
begin;
create schema cardora_referral_private;
revoke all on schema cardora_referral_private from public,anon,authenticated,service_role;
create table cardora_referral_private.invitation_accounts (
 member_auth_id uuid primary key,
 invitation_code text not null unique default ('CRD-' || upper(replace(gen_random_uuid()::text,'-',''))),
 review_status text not null default 'pending' check(review_status in ('pending','approved','rejected','suspended')),
 reviewed_by uuid,
 reviewed_at timestamptz,
 enabled boolean not null default false,
 created_at timestamptz not null default now(),
 check(invitation_code ~ '^CRD-[A-F0-9]{32}$'),
 check(not enabled or review_status='approved'),
 check((review_status='pending' and reviewed_by is null and reviewed_at is null) or
 (review_status<>'pending' and reviewed_by is not null and reviewed_at is not null)),
 check(reviewed_by is null or reviewed_by<>member_auth_id)
);
create table cardora_referral_private.direct_attributions (
 invited_auth_id uuid primary key,
 inviter_auth_id uuid not null references cardora_referral_private.invitation_accounts(member_auth_id),
 recorded_at timestamptz not null default now(),
 check(invited_auth_id<>inviter_auth_id)
);
alter table cardora_referral_private.invitation_accounts enable row level security;
alter table cardora_referral_private.direct_attributions enable row level security;
revoke all on cardora_referral_private.invitation_accounts,cardora_referral_private.direct_attributions from public,anon,authenticated,service_role;
-- No runtime writer. Future approved service must verify canonical Auth membership, active admin,
-- consent, review evidence, verified email, code eligibility, fraud and time window in transaction.
-- Reject existing-account attribution, self-referrals and circular chains; never traverse downlines.
-- No raw identity document storage; provider and retention policy require separate review.
commit;
