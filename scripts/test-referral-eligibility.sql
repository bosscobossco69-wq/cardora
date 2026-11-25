\set ON_ERROR_STOP on
-- Disposable PostgreSQL CI only; synthetic users.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
\ir ../supabase/drafts/CARDORA_DRAFT_referral_eligibility.sql
insert into cardora_referral_private.invitation_accounts(member_auth_id) values(md5('a')::uuid),(md5('b')::uuid);
do $$ begin
 if (select count(*) from cardora_referral_private.invitation_accounts where review_status='pending' and not enabled)<>2 then raise exception 'default eligibility unsafe'; end if;
 if (select count(distinct invitation_code) from cardora_referral_private.invitation_accounts)<>2 then raise exception 'duplicate code'; end if;
 begin
 update cardora_referral_private.invitation_accounts set enabled=true where member_auth_id=md5('a')::uuid;
 raise exception 'pending activation allowed';
 exception when check_violation then null; end;
 begin
 update cardora_referral_private.invitation_accounts set review_status='approved',reviewed_by=member_auth_id,reviewed_at=now(),enabled=true where member_auth_id=md5('a')::uuid;
 raise exception 'self review allowed';
 exception when check_violation then null; end;
end $$;
update cardora_referral_private.invitation_accounts set review_status='approved',reviewed_by=md5('reviewer')::uuid,reviewed_at=now(),enabled=true where member_auth_id=md5('a')::uuid;
insert into cardora_referral_private.direct_attributions(invited_auth_id,inviter_auth_id) values(md5('c')::uuid,md5('a')::uuid);
do $$ declare r text; begin
 begin
 insert into cardora_referral_private.direct_attributions(invited_auth_id,inviter_auth_id) values(md5('a')::uuid,md5('a')::uuid);
 raise exception 'self referral allowed';
 exception when check_violation then null; end;
 begin
 insert into cardora_referral_private.direct_attributions(invited_auth_id,inviter_auth_id) values(md5('c')::uuid,md5('b')::uuid);
 raise exception 'duplicate attribution allowed';
 exception when unique_violation then null; end;
 foreach r in array array['anon','authenticated','service_role'] loop
 if has_schema_privilege(r,'cardora_referral_private','USAGE') then raise exception 'private schema exposed'; end if;
 if has_table_privilege(r,'cardora_referral_private.invitation_accounts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_table_privilege(r,'cardora_referral_private.direct_attributions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'referral data exposed'; end if;
 end loop;
end $$;
select 'Referral eligibility constraints passed; runtime writer not implemented' as result;
