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
 contact text not null check (char_length(contact) between 3 and 160 and contact !~ '[[:space:][:cntrl:]]' and contact ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
 categories text not null check (char_length(btrim(categories)) between 2 and 160 and categories !~ '[[:cntrl:]]'),
 details text not null default '' check (char_length(details)<=500 and details !~ '[[:cntrl:]]'),
 consent_version text not null check (consent_version='application-v1'),
 consented_at timestamptz not null default now(),
 status text not null default 'pending' check (status in ('pending','contacted','accepted','rejected')),
 created_at timestamptz not null default now(),
 unique(owner_id,kind)
);
alter table public.cardora_launch_applications enable row level security;
alter table public.cardora_launch_applications force row level security;
revoke all on public.cardora_launch_applications from public, anon, authenticated;
grant select (id,owner_id,kind,name,region,contact,categories,details,status,created_at) on public.cardora_launch_applications to authenticated;
grant insert (owner_id,kind,name,region,contact,categories,details,consent_version) on public.cardora_launch_applications to authenticated;
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
-- Internal audit records contain only application ID, actor, transition and time.
create table cardora_launch_private.review_audit (
 application_id uuid not null references public.cardora_launch_applications(id) on delete cascade,
 actor_id uuid not null,
 old_status text not null,
 new_status text not null,
 reviewed_at timestamptz not null default clock_timestamp()
);
alter table cardora_launch_private.review_audit enable row level security;
alter table cardora_launch_private.review_audit force row level security;
revoke all on cardora_launch_private.review_audit from public,anon,authenticated;
create function cardora_launch_private.log_review()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.status is distinct from old.status then
  if not cardora_launch_private.is_active_verified_admin() or auth.uid() is null or new.owner_id=auth.uid() then
   raise exception 'Unauthorized review' using errcode='42501';
  end if;
  insert into cardora_launch_private.review_audit(application_id,actor_id,old_status,new_status)
  values(new.id,auth.uid(),old.status,new.status);
 end if;
 return new;
end $$;
revoke all on function cardora_launch_private.log_review() from public,anon,authenticated;
create trigger launch_review_audit after update of status on public.cardora_launch_applications
for each row execute function cardora_launch_private.log_review();
-- accepted means accepted for follow-up ONLY. No seller/partner permissions or earnings.
commit;
