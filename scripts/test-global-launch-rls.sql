\set ON_ERROR_STOP on
-- Execute on disposable PostgreSQL only, never production.
\ir test-member-profile-rls.sql
-- Restore synthetic B and add synthetic admin C for intake validation.
insert into auth.users values ('00000000-0000-0000-0000-000000000002','b@example.invalid',now(),false),('00000000-0000-0000-0000-000000000007','admin@example.invalid',now(),false);
insert into public.users(auth_user_id,member_id,email,role,status) values ('00000000-0000-0000-0000-000000000002','TEST-2','b@example.invalid','user','active'),('00000000-0000-0000-0000-000000000007','TEST-7','admin@example.invalid','admin','active');
\ir ../docs/security/global-launch-intake-review.sql
select test_only.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.cardora_launch_applications'::regclass),'launch RLS and FORCE RLS');
select test_only.ok(not has_any_column_privilege('anon','public.cardora_launch_applications','SELECT') and not has_any_column_privilege('anon','public.cardora_launch_applications','INSERT'),'guest cannot read or insert');
select test_only.ok(not has_column_privilege('authenticated','public.cardora_launch_applications','owner_id','UPDATE') and not has_column_privilege('authenticated','public.cardora_launch_applications','status','INSERT'),'owner and initial status protected');
select test_only.ok(not has_table_privilege('authenticated','public.cardora_launch_applications','DELETE'),'no authenticated delete');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test_only.rows($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Shop A','Malaysia','a@example.invalid','Pokemon','application-v1')$q$,1,'A free seller application');
select test_only.rows($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('partner','Creator A','Malaysia','a@example.invalid','Social media','application-v1')$q$,1,'A free partner application');
select test_only.ok((select count(*)=2 and bool_and(status='pending') from public.cardora_launch_applications),'both applications pending');
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Duplicate','Malaysia','a@example.invalid','Pokemon','application-v1')$q$,'23505','duplicate seller application blocked');
select test_only.denied($q$insert into public.cardora_launch_applications(owner_id,kind,name,region,contact,categories,consent_version) values('00000000-0000-0000-0000-000000000002','seller','Spoof','Malaysia','a@example.invalid','Pokemon','application-v1')$q$,'42501','spoofed owner blocked');
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,status,consent_version) values('partner','Spoof','Malaysia','a@example.invalid','Pokemon','accepted','application-v1')$q$,'42501','applicant cannot assign approved status');
select test_only.rows($q$update public.cardora_launch_applications set status='accepted'$q$,0,'applicant cannot review own applications');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select test_only.ok((select count(*)=0 from public.cardora_launch_applications),'B cannot read A applications');
select test_only.rows($q$update public.cardora_launch_applications set status='accepted'$q$,0,'B cannot review A applications');
select test_only.rows($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Shop B','Thailand','b@example.invalid','One Piece','application-v1')$q$,1,'B own seller application');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Suspended','Thailand','s@example.invalid','One Piece','application-v1')$q$,'42501','inactive member denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Unverified','Thailand','u@example.invalid','One Piece','application-v1')$q$,'42501','unverified member denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Anonymous','Thailand','anon@example.invalid','One Piece','application-v1')$q$,'42501','anonymous auth member denied');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false);
select test_only.ok((select count(*)=3 from public.cardora_launch_applications),'verified admin sees queue');
select test_only.rows($q$update public.cardora_launch_applications set status='contacted' where name='Shop A'$q$,1,'admin contacts applicant');
select test_only.rows($q$update public.cardora_launch_applications set status='accepted' where name='Shop A'$q$,1,'admin accepts for follow-up');
select test_only.rows($q$update public.cardora_launch_applications set status='rejected' where name='Shop A'$q$,0,'final decision cannot be overwritten');
select test_only.rows($q$update public.cardora_launch_applications set status='rejected' where name='Shop B'$q$,1,'admin rejects');
select test_only.denied($q$update public.cardora_launch_applications set name='Tampered' where name='Creator A'$q$,'42501','admin cannot edit applicant fields through review API');
select test_only.denied($q$update public.cardora_launch_applications set status='pending' where name='Creator A'$q$,'42501','admin cannot reset pending through review API');
select test_only.rows($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('partner','Admin own','Malaysia','admin@example.invalid','Social media','application-v1')$q$,1,'admin may apply as member');
select test_only.rows($q$update public.cardora_launch_applications set status='accepted' where name='Admin own'$q$,0,'admin cannot approve own request');
reset role;
set role anon;
select test_only.denied($q$select name from public.cardora_launch_applications$q$,'42501','anon cannot read application contact data');
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('seller','Guest','Malaysia','g@example.invalid','Pokemon','application-v1')$q$,'42501','anon cannot apply');
reset role;
select test_only.ok((select count(*)=4 from public.cardora_launch_applications),'only four intended applications exist');
select test_only.ok((select count(*)=0 from public.users where balance<>0 or held_balance<>0),'wallet remains untouched');
select test_only.ok((select role='user' from public.users where member_id='TEST-1'),'seller intake does not escalate member role');
select test_only.ok((select count(*)=1 and bool_and(tgname='launch_review_audit') from pg_trigger where tgrelid='public.cardora_launch_applications'::regclass and not tgisinternal),'only private review audit trigger');
select test_only.ok((select count(*)=3 from cardora_launch_private.review_audit),'three genuine decisions recorded');
select test_only.ok((select bool_and(actor_id='00000000-0000-0000-0000-000000000007') from cardora_launch_private.review_audit),'server records actual reviewing admin');
select test_only.ok(not has_any_column_privilege('authenticated','cardora_launch_private.review_audit','SELECT,INSERT,UPDATE') and not has_table_privilege('authenticated','cardora_launch_private.review_audit','DELETE'),'no browser audit access');
select test_only.ok((select count(*)=4 and bool_and(consent_version='application-v1' and consented_at is not null) from public.cardora_launch_applications),'consent version and server timestamp recorded');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories) values('partner','No consent','Thailand','b@example.invalid','Social media')$q$,'23502','missing consent rejected');
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('partner','Bad consent','Thailand','b@example.invalid','Social media','unknown')$q$,'23514','unrecognized consent rejected');
select test_only.denied($q$insert into public.cardora_launch_applications(kind,name,region,contact,categories,consent_version) values('partner','Bad email','Thailand','a@@example.invalid','Social media','application-v1')$q$,'23514','malformed contact rejected');
reset role;
\echo 'ALL LAUNCH APPLICATION RLS CHECKS PASSED'
