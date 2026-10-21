-- Draft only. Review and test in a separate development Supabase project before applying.
-- Stores minimal policy-version acceptance and user-submitted privacy requests. Do not store identity-document contents here.

create table if not exists public.cardora_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  policy_type text not null check (policy_type in ('terms','privacy','seller_terms','fee_schedule')),
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_context jsonb not null default '{}'::jsonb,
  unique (user_id, policy_type, policy_version)
);

create table if not exists public.cardora_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('access','correction','deletion','restriction','complaint','other')),
  description text not null check (length(description) between 1 and 4000),
  status text not null default 'received' check (status in ('received','identity_check','in_review','fulfilled','partially_fulfilled','rejected','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolution_note text
);

alter table public.cardora_policy_acceptances enable row level security;
alter table public.cardora_privacy_requests enable row level security;
revoke all on public.cardora_policy_acceptances from anon, authenticated;
revoke all on public.cardora_privacy_requests from anon, authenticated;
grant select on public.cardora_policy_acceptances to authenticated;
grant insert (user_id, policy_type, policy_version, acceptance_context) on public.cardora_policy_acceptances to authenticated;
grant select on public.cardora_privacy_requests to authenticated;
grant insert (user_id, request_type, description) on public.cardora_privacy_requests to authenticated;

create policy "Users read own policy acceptances" on public.cardora_policy_acceptances
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users record own policy acceptance" on public.cardora_policy_acceptances
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users read own privacy requests" on public.cardora_privacy_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users submit own privacy requests" on public.cardora_privacy_requests
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- No client UPDATE/DELETE policy: staff-only workflow should be implemented behind a verified server-side admin role.
comment on table public.cardora_policy_acceptances is 'Minimal versioned policy acceptance records; never treat client-supplied context as trusted identity proof.';
comment on table public.cardora_privacy_requests is 'User privacy requests; resolution updates must use a verified server-side staff workflow.';
