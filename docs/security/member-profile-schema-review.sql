-- REVIEW DRAFT ONLY. Do not run against production until explicitly approved.
-- New independent private member profile; never grant writes on public.users.
begin;
create schema cardora_profile_private;
revoke all on schema cardora_profile_private from public, anon, authenticated;
grant usage on schema cardora_profile_private to authenticated;
create function cardora_profile_private.is_active_verified_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users a
    join public.users u on u.auth_user_id = a.id
    where a.id = (select auth.uid())
      and a.email_confirmed_at is not null
      and a.email is not null
      and coalesce(a.is_anonymous, false) = false
      and u.status = 'active'
  );
$$;
revoke all on function cardora_profile_private.is_active_verified_member() from public, anon, authenticated;
grant execute on function cardora_profile_private.is_active_verified_member() to authenticated;
create table public.cardora_member_details (
  owner_id uuid primary key default auth.uid() references public.users(auth_user_id) on delete cascade,
  nickname text not null default '' check (char_length(nickname) <= 40 and (nickname = '' or char_length(btrim(nickname)) >= 2) and nickname !~ '[[:cntrl:]]'),
  region text not null default '' check (char_length(region) <= 60 and region !~ '[[:cntrl:]]'),
  bio text not null default '' check (char_length(bio) <= 240 and bio !~ '[[:cntrl:]]'),
  avatar text not null default 'star' check (avatar in ('star','moon','sun','leaf','gem','card'))
);
alter table public.cardora_member_details enable row level security;
alter table public.cardora_member_details force row level security;
revoke all on public.cardora_member_details from public, anon, authenticated;
grant select (owner_id,nickname,region,bio,avatar) on public.cardora_member_details to authenticated;
grant insert (owner_id,nickname,region,bio,avatar) on public.cardora_member_details to authenticated;
grant update (nickname,region,bio,avatar) on public.cardora_member_details to authenticated;
create policy member_details_select_own on public.cardora_member_details for select to authenticated
using (owner_id = (select auth.uid()) and (select cardora_profile_private.is_active_verified_member()));
create policy member_details_insert_own on public.cardora_member_details for insert to authenticated
with check (owner_id = (select auth.uid()) and (select cardora_profile_private.is_active_verified_member()));
create policy member_details_update_own on public.cardora_member_details for update to authenticated
using (owner_id = (select auth.uid()) and (select cardora_profile_private.is_active_verified_member()))
with check (owner_id = (select auth.uid()) and (select cardora_profile_private.is_active_verified_member()));
commit;
