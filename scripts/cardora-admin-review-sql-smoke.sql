\set ON_ERROR_STOP on
-- Synthetic fixtures only; execute inside disposable PostgreSQL, never Supabase.
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
grant usage on schema auth to authenticated;
create table public.users(id uuid primary key,auth_user_id uuid,role text,status text);
create table public.seller_applications(id uuid primary key,user_id uuid,status text,name text,role text,message text);
create table public.seller_profiles(id uuid primary key default gen_random_uuid(),user_id uuid unique,status text,verification_status text,display_name text,updated_at timestamptz default now(),trust_level text);
create table public.agent_profiles(id uuid primary key default gen_random_uuid(),user_id uuid unique,application_id uuid unique,status text,referral_code text,display_name text,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.seller_subscriptions(seller_profile_id uuid,plan_code text,status text,started_at timestamptz,is_current boolean);
create unique index on public.seller_subscriptions(seller_profile_id) where is_current;
create table public.listings(id uuid primary key,title text,price numeric,currency text,inventory integer,status text,created_at timestamptz);
create table public.listing_details(listing_id uuid,set_name text,card_number text,language text,condition text,verification_status text,seller_id uuid,description text,updated_at timestamptz);
\ir ../supabase/drafts/CARDORA_DRAFT_admin_active_status_guard.sql
insert into users select n::text::uuid,n::text::uuid,'user','active' from (values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005')) v(n);
update users set role='admin' where id='00000000-0000-0000-0000-000000000001';
update users set status='disabled' where id='00000000-0000-0000-0000-000000000003';
insert into seller_applications values
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','pending','New seller','seller',null),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','pending','Disabled member','seller',null),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','pending','Suspended seller','seller',null),
('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','pending','Suspended agent','agent',null);
insert into seller_profiles(user_id,status) values('00000000-0000-0000-0000-000000000004','suspended');
insert into agent_profiles(user_id,application_id,status) values('00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005','suspended');
set local role authenticated;
select set_config('test.uid','00000000-0000-0000-0000-000000000002',true);
do $$begin
 begin perform public.admin_review_seller_application('10000000-0000-0000-0000-000000000002','approved'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm <> 'ADMIN_REQUIRED' then raise; end if; end;
end$$;
select set_config('test.uid','00000000-0000-0000-0000-000000000001',true);
do $$begin
 begin perform public.admin_review_seller_application('10000000-0000-0000-0000-000000000003','approved'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm <> 'ACTIVE_LINKED_MEMBER_REQUIRED' then raise; end if; end;
 begin perform public.admin_review_seller_application('10000000-0000-0000-0000-000000000004','approved'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm <> 'SELLER_REACTIVATION_REQUIRES_REVIEW' then raise; end if; end;
 begin perform public.admin_review_seller_application('10000000-0000-0000-0000-000000000005','approved'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm <> 'AGENT_REACTIVATION_REQUIRES_REVIEW' then raise; end if; end;
 begin perform public.admin_review_seller_application('10000000-0000-0000-0000-000000000002',null); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm <> 'INVALID_STATUS' then raise; end if; end;
 if public.admin_review_seller_application('10000000-0000-0000-0000-000000000002','approved') is distinct from true then raise exception 'approval failed'; end if;
 begin perform public.admin_review_seller_application('10000000-0000-0000-0000-000000000002','approved'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm <> 'APPLICATION_ALREADY_DECIDED' then raise; end if; end;
end$$;
reset role;
do $$begin
 if (select count(*) from seller_applications where status='pending') <> 3 then raise exception 'denied application mutated'; end if;
 if (select count(*) from seller_subscriptions where plan_code='free' and is_current) <> 1 then raise exception 'incorrect free subscription'; end if;
 if (select count(*) from seller_profiles where status='suspended') <> 1 or (select count(*) from agent_profiles where status='suspended') <> 1 then raise exception 'suspension changed'; end if;
 if (select count(*) from seller_profiles where status='approved' and verification_status='pending') <> 1 then raise exception 'verification bypass'; end if;
end$$;
rollback;
\echo PASS synthetic seller approval, denied access, suspension preservation and rollback
