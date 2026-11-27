\set ON_ERROR_STOP on
-- Only for an empty disposable PostgreSQL database. No production credentials.
\echo 'Bootstrap synthetic Supabase-like identities'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email varchar, email_confirmed_at timestamptz, is_anonymous boolean);
create function auth.uid() returns uuid language sql stable as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.users (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete cascade,
 member_id text unique not null,
 email text,
 role text not null default 'user',
 status text not null default 'active',
 balance numeric not null default 0,
 held_balance numeric not null default 0
);
alter table public.users enable row level security;
revoke all on public.users from public, anon, authenticated;
grant select on public.users to authenticated;
create policy users_select_own on public.users for select to authenticated using (auth_user_id = (select auth.uid()));
-- Mirror broad default public-schema table grants, then check the exact draft revokes them.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','a@example.invalid',now(),false),
 ('00000000-0000-0000-0000-000000000002','b@example.invalid',now(),false),
 ('00000000-0000-0000-0000-000000000003','suspended@example.invalid',now(),false),
 ('00000000-0000-0000-0000-000000000004','pending@example.invalid',null,false),
 ('00000000-0000-0000-0000-000000000005','anonymous@example.invalid',now(),true),
 ('00000000-0000-0000-0000-000000000006','unlinked@example.invalid',now(),false);
insert into public.users(auth_user_id,member_id,email,status)
select id,'TEST-'||right(id::text,1),email,case when right(id::text,1)='3' then 'suspended' else 'active' end from auth.users where right(id::text,1)<>'6';

-- Execute the exact proposed schema, not a rewritten version.
\ir ../docs/security/member-profile-schema-review.sql

create schema test_only;
grant usage on schema test_only to anon, authenticated;
create function test_only.ok(result boolean, label text) returns void language plpgsql security invoker as $$
begin
 if result is distinct from true then raise exception 'FAIL: %', label; end if;
 raise notice 'PASS: %',label;
end $$;
create function test_only.denied(statement text, expected text, label text) returns void language plpgsql security invoker as $$
begin
 begin execute statement; exception when others then
   if sqlstate <> expected then raise exception 'FAIL %: expected %, got % (%)',label,expected,sqlstate,sqlerrm; end if;
   raise notice 'PASS: % (SQLSTATE %)',label,sqlstate; return;
 end;
 raise exception 'FAIL: % unexpectedly succeeded',label;
end $$;
create function test_only.rows(statement text, expected bigint, label text) returns void language plpgsql security invoker as $$
declare n bigint; begin execute statement; get diagnostics n = row_count; perform test_only.ok(n=expected,label); end $$;
grant execute on all functions in schema test_only to anon,authenticated;
select test_only.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.cardora_member_details'::regclass),'RLS and FORCE RLS enabled');
select test_only.ok(not has_table_privilege('authenticated','public.cardora_member_details','UPDATE') and not has_column_privilege('authenticated','public.cardora_member_details','owner_id','UPDATE'),'owner immutable; no table-wide update');
select test_only.ok(not has_table_privilege('anon','public.cardora_member_details','SELECT') and not has_any_column_privilege('anon','public.cardora_member_details','SELECT'),'anonymous no select grants');
select test_only.ok(not has_schema_privilege('anon','cardora_profile_private','USAGE') and not has_function_privilege('anon','cardora_profile_private.is_active_verified_member()','EXECUTE'),'private helper denied to anon');
select test_only.ok(not has_table_privilege('authenticated','public.users','UPDATE') and not has_any_column_privilege('authenticated','public.users','UPDATE'),'existing member table remains read-only');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test_only.ok(cardora_profile_private.is_active_verified_member(),'verified active member A passes');
select test_only.rows($q$insert into public.cardora_member_details(owner_id,nickname,region,bio,avatar) values('00000000-0000-0000-0000-000000000001','นักสะสม','Malaysia','TCG collector','gem')$q$,1,'A inserts own profile');
select test_only.ok((select count(*)=1 from public.cardora_member_details),'A sees own record');
select test_only.denied($q$insert into public.cardora_member_details(owner_id,nickname) values('00000000-0000-0000-0000-000000000002','spoof')$q$,'42501','A cannot insert B profile');
select test_only.rows($q$update public.cardora_member_details set nickname='收藏家',region='Thailand',bio='卡牌收藏',avatar='moon' where owner_id=auth.uid()$q$,1,'A edits exactly permitted fields');
select test_only.ok((select nickname='收藏家' and region='Thailand' and bio='卡牌收藏' and avatar='moon' from public.cardora_member_details),'four permitted fields persisted');
select test_only.denied($q$update public.cardora_member_details set owner_id='00000000-0000-0000-0000-000000000002'$q$,'42501','cannot transfer ownership');
select test_only.denied($q$update public.cardora_member_details set avatar='https://example.invalid/image'$q$,'23514','external avatar URL rejected');
select test_only.denied($q$update public.cardora_member_details set nickname=repeat('x',41)$q$,'23514','nickname length rejected');
select test_only.denied($q$update public.cardora_member_details set nickname='x'$q$,'23514','one-character nickname rejected');
select test_only.denied($q$update public.cardora_member_details set region=repeat('x',61)$q$,'23514','region length rejected');
select test_only.denied($q$update public.cardora_member_details set bio=repeat('x',241)$q$,'23514','bio length rejected');
select test_only.denied($q$update public.cardora_member_details set bio=E'one\ntwo'$q$,'23514','control character rejected');
select test_only.denied($q$delete from public.cardora_member_details$q$,'42501','ordinary member cannot delete profile row');
select test_only.denied($q$truncate public.cardora_member_details$q$,'42501','ordinary member cannot truncate');
select test_only.denied($q$update public.users set role='admin' where auth_user_id=auth.uid()$q$,'42501','cannot escalate role');
select test_only.denied($q$update public.users set balance=1000,held_balance=1000 where auth_user_id=auth.uid()$q$,'42501','cannot edit wallet balances');
select test_only.denied($q$update public.users set status='active',member_id='FORGED' where auth_user_id=auth.uid()$q$,'42501','cannot edit status or member number');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select test_only.ok((select count(*)=0 from public.cardora_member_details),'B cannot read A');
select test_only.rows($q$update public.cardora_member_details set nickname='intruder' where owner_id='00000000-0000-0000-0000-000000000001'$q$,0,'B cannot update A');
select test_only.denied($q$insert into public.cardora_member_details(owner_id,nickname) values('00000000-0000-0000-0000-000000000001','intruder')$q$,'42501','B cannot insert A');
select test_only.rows($q$insert into public.cardora_member_details(nickname) values('Member B')$q$,1,'B inserts own profile with default owner');
select test_only.ok((select count(*)=1 and bool_and(owner_id=auth.uid()) from public.cardora_member_details),'B sees only B');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test_only.ok(not cardora_profile_private.is_active_verified_member(),'suspended member denied');
select test_only.denied($q$insert into public.cardora_member_details(nickname) values('Suspended')$q$,'42501','suspended insert denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select test_only.ok(not cardora_profile_private.is_active_verified_member(),'unconfirmed email denied');
select test_only.denied($q$insert into public.cardora_member_details(nickname) values('Pending')$q$,'42501','unconfirmed insert denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test_only.ok(not cardora_profile_private.is_active_verified_member(),'anonymous auth user denied even with confirmed email');
select test_only.denied($q$insert into public.cardora_member_details(nickname) values('Anonymous')$q$,'42501','anonymous auth user insert denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select test_only.ok(not cardora_profile_private.is_active_verified_member(),'unlinked auth user denied');
select test_only.denied($q$insert into public.cardora_member_details(nickname) values('Unlinked')$q$,'42501','unlinked insert denied');
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claims','{}',false);
select test_only.ok(not cardora_profile_private.is_active_verified_member(),'missing identity denied');
select test_only.denied($q$insert into public.cardora_member_details(nickname) values('Missing')$q$,'42501','missing identity insert denied');

reset role;
update public.users set status='suspended' where auth_user_id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","user_metadata":{"role":"admin","status":"active"}}',false);
select test_only.ok(not cardora_profile_private.is_active_verified_member(),'database suspension overrides forged user_metadata');
select test_only.ok((select count(*)=0 from public.cardora_member_details),'suspended existing profile hidden');
select test_only.rows($q$update public.cardora_member_details set nickname='Bypass'$q$,0,'suspended existing profile cannot update');
reset role;
update public.users set status='active' where auth_user_id='00000000-0000-0000-0000-000000000001';
set role authenticated;
select test_only.ok((select nickname='收藏家' from public.cardora_member_details),'A profile unchanged after cross-account attacks and suspension');
reset role;
set role anon;
select test_only.denied($q$select nickname from public.cardora_member_details$q$,'42501','anon cannot read');
select test_only.denied($q$insert into public.cardora_member_details(nickname) values('Guest')$q$,'42501','anon cannot insert');
select test_only.denied($q$update public.cardora_member_details set nickname='Guest'$q$,'42501','anon cannot update');
select test_only.denied($q$select cardora_profile_private.is_active_verified_member()$q$,'42501','anon cannot invoke private helper');
reset role;
delete from auth.users where id='00000000-0000-0000-0000-000000000002';
select test_only.ok((select count(*)=1 from public.cardora_member_details),'account deletion cascades profile cleanup');
select test_only.ok((select role='user' and balance=0 and held_balance=0 from public.users where auth_user_id='00000000-0000-0000-0000-000000000001'),'role and wallet unchanged');
\echo 'ALL MEMBER PROFILE POSTGRESQL RLS CHECKS PASSED'
