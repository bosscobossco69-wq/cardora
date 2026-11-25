\set ON_ERROR_STOP on
-- Disposable CI database only. Synthetic accounts, no production data.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to authenticated;
create table public.users(auth_user_id uuid primary key,status text not null);
insert into public.users values(md5('a')::uuid,'active'),(md5('b')::uuid,'active'),(md5('s')::uuid,'suspended');
alter table public.users enable row level security;
grant select on public.users to authenticated;
create policy own_users on public.users for select to authenticated using (auth_user_id=(select auth.uid()));
\ir ../supabase/drafts/CARDORA_DRAFT_member_collection.sql
set role authenticated;
select set_config('request.jwt.claim.sub',md5('a')::uuid::text,false);
select set_config('request.jwt.claims','{"is_anonymous":false}',false);
insert into public.cardora_member_preferences(nickname) values ('Collector A');
insert into public.cardora_member_collection(slot,catalog_id) values(1,'base1-4');
do $$ begin
 if (select count(*) from public.cardora_member_collection)<>1 then raise exception 'own read failed'; end if;
 begin
 insert into public.cardora_member_collection(owner_auth_id,slot,catalog_id) values(md5('b')::uuid,2,'base1-5');
 raise exception 'owner spoof allowed'; exception when insufficient_privilege then null; end;
 begin
 insert into public.cardora_member_collection(slot,catalog_id) values(201,'base1-5');
 raise exception 'limit bypass'; exception when check_violation then null; end;
 begin
 insert into public.cardora_member_collection(slot,catalog_id) values(2,'base1-4');
 raise exception 'duplicate accepted'; exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',md5('b')::uuid::text,false);
do $$ declare n integer; begin
 if (select count(*) from public.cardora_member_preferences)<>0 or (select count(*) from public.cardora_member_collection)<>0 then raise exception 'cross member read'; end if;
 update public.cardora_member_collection set quantity=99; get diagnostics n=row_count; if n<>0 then raise exception 'cross member update'; end if;
 delete from public.cardora_member_collection; get diagnostics n=row_count; if n<>0 then raise exception 'cross member delete'; end if;
end $$;
insert into public.cardora_member_collection(slot,catalog_id) values(1,'base1-4');
select set_config('request.jwt.claim.sub',md5('s')::uuid::text,false);
do $$ begin
 begin insert into public.cardora_member_preferences(nickname) values('Suspended'); raise exception 'suspended insert'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',md5('a')::uuid::text,false);
select set_config('request.jwt.claims','{"is_anonymous":true}',false);
do $$ begin if (select count(*) from public.cardora_member_collection)<>0 then raise exception 'anonymous JWT read'; end if; end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.cardora_member_collection','SELECT,INSERT,UPDATE,DELETE') then raise exception 'anon permission'; end if;
 if has_column_privilege('authenticated','public.cardora_member_collection','owner_auth_id','INSERT,UPDATE') then raise exception 'owner mutable'; end if;
 if (select count(*) from public.cardora_member_collection)<>2 then raise exception 'unexpected total'; end if;
end $$;
select 'Collection owner isolation checks passed' as result;
