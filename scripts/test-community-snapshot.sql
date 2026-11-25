-- Disposable PostgreSQL CI only. Never run this fixture on Cardora production.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
 id uuid primary key, created_at timestamptz not null, email_confirmed_at timestamptz,
 deleted_at timestamptz, banned_until timestamptz, is_anonymous boolean default false
);
create table public.users (auth_user_id uuid, role text not null, status text not null);
insert into auth.users(id,created_at,email_confirmed_at,deleted_at,banned_until,is_anonymous)
select md5('fixture-'||i)::uuid,
 case when i=3 then timestamptz '2026-11-15 00:00:00+08' else statement_timestamp() end,
 case when i=2 then null else statement_timestamp() end,
 case when i=7 then statement_timestamp() end,
 case when i=6 then statement_timestamp()+interval '1 day' end,
 i=8
from generate_series(1,11) i;
insert into public.users(auth_user_id,role,status)
select md5('fixture-'||i)::uuid,case when i=4 then 'admin' when i=11 then 'seller' else 'user' end,
 case when i=9 then 'suspended' else 'active' end
from generate_series(1,11) i where i<>10;
-- Duplicate linked profile must not multiply totals.
insert into public.users values (md5('fixture-1')::uuid,'user','active');
\ir ../supabase/drafts/CARDORA_DRAFT_community_snapshot.sql
insert into cardora_metrics_private.excluded_accounts values (md5('fixture-5')::uuid);
select cardora_metrics_private.refresh_community_snapshot();
do $$
begin
 if (select count(*) from public.cardora_community_snapshot) <> 1 then raise exception 'not singleton'; end if;
 if not exists(select 1 from public.cardora_community_snapshot where registered_members=3 and verified_members=2 and new_today=3 and day_myt=(statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date) then raise exception 'incorrect aggregate'; end if;
 if not (select relrowsecurity from pg_class where oid='public.cardora_community_snapshot'::regclass) then raise exception 'RLS disabled'; end if;
end $$;
do $$
declare r text;
begin
 foreach r in array array['anon','authenticated'] loop
  if not has_table_privilege(r,'public.cardora_community_snapshot','SELECT') then raise exception 'missing read access'; end if;
  if has_table_privilege(r,'public.cardora_community_snapshot','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'unexpected write access'; end if;
  if has_schema_privilege(r,'cardora_metrics_private','USAGE') then raise exception 'private schema exposed'; end if;
  if has_function_privilege(r,'cardora_metrics_private.refresh_community_snapshot()','EXECUTE') then raise exception 'refresh exposed'; end if;
  if has_table_privilege(r,'auth.users','SELECT') or has_table_privilege(r,'public.users','SELECT') then raise exception 'account data exposed'; end if;
 end loop;
end $$;
set role anon;
select registered_members,verified_members,new_today from public.cardora_community_snapshot;
do $$ begin
 if (select count(*) from public.cardora_community_snapshot)<>1 then raise exception 'anon cannot read snapshot'; end if;
 begin
  update public.cardora_community_snapshot set registered_members=999;
  raise exception 'anonymous update was allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set role authenticated;
do $$ begin
 if (select count(*) from public.cardora_community_snapshot)<>1 then raise exception 'authenticated cannot read snapshot'; end if;
 begin
  delete from public.cardora_community_snapshot;
  raise exception 'authenticated delete was allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
update auth.users set email_confirmed_at=statement_timestamp() where id=md5('fixture-2')::uuid;
select cardora_metrics_private.refresh_community_snapshot();
do $$ begin
 if not exists(select 1 from public.cardora_community_snapshot where registered_members=3 and verified_members=3) then raise exception 'confirmation not reflected'; end if;
end $$;
select 'SQL snapshot isolation checks passed' as result;
