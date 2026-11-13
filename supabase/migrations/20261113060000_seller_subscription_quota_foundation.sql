-- Cardora Staging only: seller subscription catalog and listing quota foundation.
-- Production must remain read-only.
create table if not exists public.seller_subscription_plans (
  code text primary key,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  billing_currency text not null default 'MYR' check (billing_currency = 'MYR'),
  listing_limit integer not null check (listing_limit > 0),
  trial_days integer not null default 7 check (trial_days >= 0),
  grace_days integer not null default 7 check (grace_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.seller_subscription_plans(code,name,price,billing_currency,listing_limit,trial_days,grace_days)
values
 ('free','Free',0,'MYR',5,7,7),
 ('basic','Basic',29,'MYR',30,7,7),
 ('pro','Pro',79,'MYR',150,7,7),
 ('business','Business',199,'MYR',600,7,7)
on conflict(code) do update set
 name=excluded.name, price=excluded.price, billing_currency=excluded.billing_currency,
 listing_limit=excluded.listing_limit, trial_days=excluded.trial_days,
 grace_days=excluded.grace_days, is_active=true, updated_at=now();

create table if not exists public.seller_subscriptions (
 id uuid primary key default gen_random_uuid(),
 seller_profile_id uuid not null references public.seller_profiles(id),
 plan_code text not null references public.seller_subscription_plans(code),
 status text not null check (status in ('trialing','active','past_due','grace','expired','cancelled')),
 started_at timestamptz not null default now(),
 trial_ends_at timestamptz,
 current_period_starts_at timestamptz,
 current_period_ends_at timestamptz,
 grace_ends_at timestamptz,
 cancel_at_period_end boolean not null default false,
 is_current boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (grace_ends_at is null or current_period_ends_at is null or grace_ends_at >= current_period_ends_at)
);
create unique index if not exists seller_subscriptions_one_current_per_seller
 on public.seller_subscriptions(seller_profile_id) where is_current;
create index if not exists seller_subscriptions_seller_history
 on public.seller_subscriptions(seller_profile_id,created_at desc);

create table if not exists public.seller_subscription_events (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.seller_subscriptions(id),
 event_type text not null check (event_type in ('trial_started','payment_confirmed','renewal_confirmed','payment_failed','grace_started','plan_changed','cancelled','expired','refunded')),
 amount numeric(12,2),
 currency text check (currency is null or currency = 'MYR'),
 provider text,
 provider_event_id text,
 journal_id uuid references public.cardora_test_journals(id),
 idempotency_key text not null unique,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.seller_subscription_plans enable row level security;
alter table public.seller_subscriptions enable row level security;
alter table public.seller_subscription_events enable row level security;
revoke all on public.seller_subscription_plans, public.seller_subscriptions, public.seller_subscription_events from anon, authenticated;
revoke all on public.seller_subscription_plans, public.seller_subscriptions, public.seller_subscription_events from public;

create or replace function public.admin_review_seller_application(p_application_id uuid, p_status text, p_note text default null)
returns boolean language plpgsql security definer set search_path to ''
as $function$
declare v_app public.seller_applications%rowtype; v_seller uuid;
begin
 if not exists (select 1 from public.users u where u.auth_user_id=auth.uid() and u.role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 if p_status not in ('approved','rejected','contacted') then raise exception 'INVALID_STATUS'; end if;
 select * into v_app from public.seller_applications where id=p_application_id for update;
 if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
 if p_status='approved' and v_app.user_id is null then raise exception 'APPLICATION_NOT_LINKED_TO_ACCOUNT'; end if;
 if p_status='approved' and coalesce(v_app.role,'seller') not in ('seller','agent') then raise exception 'INVALID_APPLICATION_ROLE'; end if;
 update public.seller_applications set status=p_status,
  message=case when p_note is null then message else left(concat_ws(E'\\n',message,'Admin note: '||p_note),2000) end
 where id=p_application_id;
 if p_status='approved' and coalesce(v_app.role,'seller')='seller' then
  insert into public.seller_profiles(user_id,status,verification_status,display_name)
  values(v_app.user_id,'approved','pending',coalesce(v_app.name,'Seller'))
  on conflict(user_id) do update set status='approved',
   display_name=coalesce(excluded.display_name,public.seller_profiles.display_name),
   updated_at=now()
  returning id into v_seller;
  insert into public.seller_subscriptions(seller_profile_id,plan_code,status,started_at,is_current)
  values(v_seller,'free','active',now(),true)
  on conflict (seller_profile_id) where is_current do nothing;
 end if;
 return true;
end;
$function$;

create or replace function public.create_seller_listing(
 p_title text,p_price numeric,p_inventory integer,p_set_name text,p_card_number text,
 p_language text,p_condition text,p_grading_company text default null,p_grading_grade text default null,
 p_shipping_fee numeric default 0,p_shipping_country text default null,p_description text default null,
 p_verification_code text default null
)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid; v_seller uuid; v_listing uuid; v_plan_limit integer; v_usage integer;
 v_sub public.seller_subscriptions%rowtype;
begin
 v_user:=public.current_user_row_id();
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 select id into v_seller from public.seller_profiles
 where user_id=v_user and status='approved' limit 1 for update;
 if v_seller is null then raise exception 'SELLER_NOT_APPROVED'; end if;
 if nullif(trim(coalesce(p_title,'')),'') is null or coalesce(p_price,0)<=0
   or coalesce(p_inventory,0)<=0 or coalesce(p_shipping_fee,0)<0 then raise exception 'INVALID_LISTING'; end if;

 select * into v_sub from public.seller_subscriptions
 where seller_profile_id=v_seller and is_current=true for update;
 if not found then
  insert into public.seller_subscriptions(seller_profile_id,plan_code,status,started_at,is_current)
  values(v_seller,'free','active',now(),true) returning * into v_sub;
 end if;

 -- Policy C: expiry falls back to Free entitlement. Existing listings stay visible;
 -- only new listing creation is blocked when current usage reaches the Free quota.
 if v_sub.plan_code<>'free' and (
   (v_sub.status='trialing' and v_sub.trial_ends_at is not null and now()>=v_sub.trial_ends_at)
   or (v_sub.status in ('active','past_due','grace') and v_sub.current_period_ends_at is not null
       and now()>=coalesce(v_sub.grace_ends_at,v_sub.current_period_ends_at))
   or v_sub.status in ('expired','cancelled')
 ) then v_plan_limit:=5;
 else
  select listing_limit into v_plan_limit from public.seller_subscription_plans
  where code=v_sub.plan_code and is_active=true;
 end if;
 if v_plan_limit is null then raise exception 'SUBSCRIPTION_PLAN_UNAVAILABLE'; end if;
 select count(*)::integer into v_usage
 from public.listing_details ld join public.listings l on l.id=ld.listing_id
 where ld.seller_id=v_seller and l.status in ('pending_review','active','rejected','suspended');
 if v_usage>=v_plan_limit then raise exception 'LISTING_QUOTA_EXCEEDED: limit %, current %',v_plan_limit,v_usage; end if;

 insert into public.listings(title,price,currency,inventory,status)
 values(trim(p_title),p_price,'USD',p_inventory,'pending_review') returning id into v_listing;
 insert into public.listing_details(listing_id,seller_id,set_name,card_number,language,condition,
  grading_company,grading_grade,shipping_fee,shipping_country,description,verification_code,verification_status)
 values(v_listing,v_seller,p_set_name,p_card_number,p_language,p_condition,p_grading_company,p_grading_grade,
  coalesce(p_shipping_fee,0),p_shipping_country,p_description,p_verification_code,'pending');
 return v_listing;
end;
$function$;

revoke all on function public.admin_review_seller_application(uuid,text,text) from public,anon;
grant execute on function public.admin_review_seller_application(uuid,text,text) to authenticated,service_role;
revoke all on function public.create_seller_listing(text,numeric,integer,text,text,text,text,text,text,numeric,text,text,text) from public,anon;
grant execute on function public.create_seller_listing(text,numeric,integer,text,text,text,text,text,text,numeric,text,text,text) to authenticated,service_role;
