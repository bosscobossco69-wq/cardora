-- DRAFT: private-by-default member preferences and cloud collection.
-- Do not apply to production before review of email/session eligibility, deletion policy and API tests.
begin;
create table public.cardora_member_preferences (
 owner_auth_id uuid primary key default auth.uid(),
 nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
 preferred_language text not null default 'en' check (preferred_language in ('en','zh','ms','th'))
);
create table public.cardora_member_collection (
 owner_auth_id uuid not null default auth.uid(),
 slot smallint not null check (slot between 1 and 200),
 catalog_id text not null check (catalog_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 quantity smallint not null default 1 check(quantity between 1 and 99),
 private_note text not null default '' check (char_length(private_note)<=240),
 primary key(owner_auth_id,slot),
 unique(owner_auth_id,catalog_id)
);
alter table public.cardora_member_preferences enable row level security;
alter table public.cardora_member_collection enable row level security;
revoke all on public.cardora_member_preferences,public.cardora_member_collection from public,anon,authenticated;
grant select,delete on public.cardora_member_preferences,public.cardora_member_collection to authenticated;
grant insert(nickname,preferred_language),update(nickname,preferred_language) on public.cardora_member_preferences to authenticated;
grant insert(slot,catalog_id,quantity,private_note),update(quantity,private_note) on public.cardora_member_collection to authenticated;
create policy cardora_preferences_own_active on public.cardora_member_preferences for all to authenticated
 using (owner_auth_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','true')='false'
 and exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active'))
 with check (owner_auth_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','true')='false'
 and exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active'));
create policy cardora_collection_own_active on public.cardora_member_collection for all to authenticated
 using (owner_auth_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','true')='false'
 and exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active'))
 with check (owner_auth_id=(select auth.uid()) and coalesce((select auth.jwt())->>'is_anonymous','true')='false'
 and exists(select 1 from public.users u where u.auth_user_id=(select auth.uid()) and u.status='active'));
-- These rows are self-reported; neither nickname nor collection is verified identity, inventory or entitlement.
-- No identity documents, public sharing, reward grants, payment operations, or seller permissions.
commit;
