\set ON_ERROR_STOP on
\ir test-global-launch-rls.sql
\ir ../docs/security/growth-aggregate-review.sql
select test_only.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.cardora_growth_counts'::regclass),'growth RLS forced');
select test_only.ok(not has_any_column_privilege('anon','public.cardora_growth_counts','SELECT,INSERT,UPDATE') and not has_any_column_privilege('authenticated','public.cardora_growth_counts','INSERT,UPDATE'),'no client direct writes or public reads');
set role anon;
select test_only.ok(public.cardora_record_growth_event('page_home','facebook'),'valid anonymous aggregate event');
select test_only.ok(not public.cardora_record_growth_event('email@example.invalid','facebook'),'arbitrary event rejected');
select test_only.ok(not public.cardora_record_growth_event('page_home','https://example.invalid/private'),'arbitrary source rejected');
select test_only.ok(not public.cardora_record_growth_event(null,'direct'),'null event rejected');
select test_only.denied($q$select * from public.cardora_growth_counts$q$,'42501','anonymous cannot read aggregates');
select test_only.denied($q$insert into public.cardora_growth_counts values(current_date,'direct','page_home',100)$q$,'42501','anonymous cannot forge direct counts');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test_only.ok(public.cardora_record_growth_event('signup_submit','direct'),'member can send bounded signal');
select test_only.ok((select count(*)=0 from public.cardora_growth_counts),'member cannot read admin aggregates');
select test_only.denied($q$update public.cardora_growth_counts set hits=5000$q$,'42501','member cannot edit counts');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000007',false);
select test_only.ok((select count(*)=2 and sum(hits)=2 from public.cardora_growth_counts),'verified administrator sees aggregates');
select test_only.denied($q$delete from public.cardora_growth_counts$q$,'42501','admin browser cannot delete aggregates');
reset role;
insert into public.cardora_growth_counts values ((now() at time zone 'Asia/Kuala_Lumpur')::date-31,'other','page_home',1);
set role anon;
select test_only.ok(public.cardora_record_growth_event('join_click','google'),'new signal accepted');
reset role;
select test_only.ok(not exists(select 1 from public.cardora_growth_counts where day_myt<(now() at time zone 'Asia/Kuala_Lumpur')::date-29),'old aggregate bucket purged');
update public.cardora_growth_counts set hits=4998 where event='page_home';
set role anon;
select test_only.ok(not public.cardora_record_growth_event('page_home','direct'),'daily cap enforced');
reset role;
select test_only.ok((select sum(hits)=5000 from public.cardora_growth_counts),'counter remains at cap');
select test_only.ok((select count(*)=4 from public.cardora_launch_applications),'application records untouched');
select test_only.ok((select count(*)=0 from public.users where balance<>0 or held_balance<>0),'wallet unaffected');
\echo 'ALL GROWTH AGGREGATE TESTS PASSED'
