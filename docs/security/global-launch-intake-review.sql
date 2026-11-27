-- REVIEW ONLY: no production execution until separate approval.
-- Isolated application intake, deliberately no seller/agent profile, subscription, payment, or wallet writes.
begin;
create schema cardora_launch_private;
revoke all on schema cardora_launch_private from public, anon, authenticated;
grant usage on schema cardora_launch_private to authenticated;
create function cardora_launch_private.is_active_verified_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
 select cardora_profile_private.is_active_verified_member() and exists (
  select 1 from public.users u where u.auth_user_id = (select auth.uid())
  and u.role = 'admin' and u.status = 'active'
 );
$$;
revoke all on function cardora_launch_private.is_active_verified_admin() from public, anon, authenticated;
grant execute on function cardora_launch_private.is_active_verified_admin() to authenticated;
create table public.cardora_launch_applications (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references public.users(auth_user_id) on delete cascade,
 kind text not null check (kind in ('seller','partner')),
 name text not null check (char_length(btrim(name)) between 2 and 80 and name !~ '[[:cntrl:]]'),
 region text not null check (char_length(btrim(region)) between 2 and 60 and region !~ '[[:cntrl:]]'),
 contact text not null check (char_length(contact) between 3 and 160 and contact !~ '[[:space:][:cntrl:]]' and position('@' in contact)>1),
 categories text not null check (char_length(btrim(categories)) between 2 and 160 and categories !~ '[[:cntrl:]]'),
 details text not null default '' check (char_length(details)<=500 and details !~ '[[:cntrl:]]'),
 status text not null default 'pending' check (status in ('pending','contacted','accepted','rejected')),
 created_at timestamptz not null default now(),
 unique(owner_id,kind)
);
alter table public.cardora_launch_applications enable row level security;
alter table public.cardora_launch_applications force row level security;
revoke all on public.cardora_launch_applications from public, anon, authenticated;
grant select (id,owner_id,kind,name,region,contact,categories,details,status,created_at) on public.cardora_launch_applications to authenticated;
grant insert (owner_id,kind,name,region,contact,categories,details) on public.cardora_launch_applications to authenticated;
grant update (status) on public.cardora_launch_applications to authenticated;
create policy launch_own_read on public.cardora_launch_applications for select to authenticated
using (owner_id=(select auth.uid()) and (select cardora_profile_private.is_active_verified_member()));
create policy launch_admin_read on public.cardora_launch_applications for select to authenticated
using ((select cardora_launch_private.is_active_verified_admin()));
create policy launch_own_submit on public.cardora_launch_applications for insert to authenticated
with check (owner_id=(select auth.uid()) and status='pending' and (select cardora_profile_private.is_active_verified_member()));
create policy launch_admin_decide on public.cardora_launch_applications for update to authenticated
using ((select cardora_launch_private.is_active_verified_admin()) and owner_id<>(select auth.uid()) and status in ('pending','contacted'))
with check ((select cardora_launch_private.is_active_verified_admin()) and owner_id<>(select auth.uid()) and status in ('contacted','accepted','rejected'));
-- accepted means accepted for follow-up ONLY. No seller/partner permissions or earnings.
commit;
