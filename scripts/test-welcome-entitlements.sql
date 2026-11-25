\set ON_ERROR_STOP on
-- Disposable CI PostgreSQL only.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
\ir ../supabase/drafts/CARDORA_DRAFT_welcome_entitlements.sql
insert into cardora_rewards_private.welcome_entitlements(member_auth_id,task,evidence_id)
select md5('member-a')::uuid,t,md5(t)::uuid
from unnest(array['email_verified','profile_completed','first_eligible_purchase','first_genuine_review']) t;
do $$
begin
 if (select sum(potential_cp) from cardora_rewards_private.welcome_entitlements)<>500 then raise exception 'incorrect cap'; end if;
 begin
  insert into cardora_rewards_private.welcome_entitlements(member_auth_id,task,evidence_id) values(md5('member-a')::uuid,'email_verified',md5('retry')::uuid);
  raise exception 'duplicate task accepted';
 exception when unique_violation then null; end;
 begin
  insert into cardora_rewards_private.welcome_entitlements(member_auth_id,task,evidence_id) values(md5('member-b')::uuid,'first_eligible_purchase',md5('first_eligible_purchase')::uuid);
  raise exception 'reused evidence accepted';
 exception when unique_violation then null; end;
 begin
  insert into cardora_rewards_private.welcome_entitlements(member_auth_id,task,evidence_id) values(md5('member-a')::uuid,'cash_bonus',md5('invalid')::uuid);
  raise exception 'unknown task accepted';
 exception when check_violation then null; end;
end $$;
insert into cardora_rewards_private.welcome_revocations(member_auth_id,task,reason) values(md5('member-a')::uuid,'first_eligible_purchase','synthetic refund');
do $$
declare r text;
begin
 if (select sum(e.potential_cp) from cardora_rewards_private.welcome_entitlements e where not exists(select 1 from cardora_rewards_private.welcome_revocations v where v.member_auth_id=e.member_auth_id and v.task=e.task))<>300 then raise exception 'revocation incorrect'; end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_schema_privilege(r,'cardora_rewards_private','USAGE') then raise exception 'schema exposed'; end if;
  if has_table_privilege(r,'cardora_rewards_private.welcome_entitlements','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege(r,'cardora_rewards_private.welcome_revocations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'ledger exposed'; end if;
 end loop;
 if (select count(*) from pg_class where oid in ('cardora_rewards_private.welcome_entitlements'::regclass,'cardora_rewards_private.welcome_revocations'::regclass) and relrowsecurity)<>2 then raise exception 'RLS missing'; end if;
end $$;
select 'Private ledger isolation and cap tests passed' as result;
