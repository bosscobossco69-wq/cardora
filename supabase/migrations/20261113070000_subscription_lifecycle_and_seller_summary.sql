create or replace function public.seller_subscription_summary()
returns table (
  plan_code text, plan_name text, subscription_status text,
  effective_listing_limit integer, listings_used integer,
  billing_price numeric, billing_currency text, trial_ends_at timestamptz,
  current_period_ends_at timestamptz, grace_ends_at timestamptz,
  cancel_at_period_end boolean
)
language plpgsql security definer set search_path to ''
as $function$
declare
 v_user uuid; v_seller uuid; v_sub public.seller_subscriptions%rowtype;
 v_limit integer; v_usage integer; v_status text;
begin
 v_user:=public.current_user_row_id();
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 select id into v_seller from public.seller_profiles
 where user_id=v_user and status='approved' limit 1;
 if v_seller is null then raise exception 'SELLER_NOT_APPROVED'; end if;
 select * into v_sub from public.seller_subscriptions
 where seller_profile_id=v_seller and is_current=true order by created_at desc limit 1;
 if not found then
  plan_code:='free'; plan_name:='Free'; subscription_status:='active';
  effective_listing_limit:=5; listings_used:=0; billing_price:=0;
  billing_currency:='MYR'; trial_ends_at:=null; current_period_ends_at:=null;
  grace_ends_at:=null; cancel_at_period_end:=false; return next; return;
 end if;
 v_status:=v_sub.status;
 if v_sub.plan_code<>'free' and (
   (v_sub.status='trialing' and v_sub.trial_ends_at is not null and now()>=v_sub.trial_ends_at)
   or (v_sub.status in ('active','past_due','grace') and v_sub.current_period_ends_at is not null
       and now()>=coalesce(v_sub.grace_ends_at,v_sub.current_period_ends_at))
   or v_sub.status in ('expired','cancelled')
 ) then
  select listing_limit into v_limit from public.seller_subscription_plans where code='free';
  v_status:='expired';
 else
  select p.listing_limit into v_limit from public.seller_subscription_plans p
  where p.code=v_sub.plan_code and p.is_active=true;
 end if;
 select count(*)::integer into v_usage from public.listing_details ld
 join public.listings l on l.id=ld.listing_id
 where ld.seller_id=v_seller and l.status in ('pending_review','active','rejected','suspended');
 select p.name,p.price,p.billing_currency into plan_name,billing_price,billing_currency
 from public.seller_subscription_plans p
 where p.code=case when v_status='expired' then 'free' else v_sub.plan_code end;
 plan_code:=case when v_status='expired' then 'free' else v_sub.plan_code end;
 subscription_status:=v_status; effective_listing_limit:=coalesce(v_limit,5);
 listings_used:=v_usage; trial_ends_at:=v_sub.trial_ends_at;
 current_period_ends_at:=v_sub.current_period_ends_at;
 grace_ends_at:=v_sub.grace_ends_at; cancel_at_period_end:=v_sub.cancel_at_period_end;
 return next;
end;
$function$;

create or replace function public.process_seller_subscription_lifecycle(p_batch_size integer default 200)
returns integer language plpgsql security definer set search_path to ''
as $function$
declare v_sub record; v_count integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if p_batch_size<1 or p_batch_size>1000 then raise exception 'INVALID_BATCH_SIZE'; end if;
 for v_sub in
  select s.id,s.status,s.plan_code,s.trial_ends_at,s.current_period_ends_at,s.grace_ends_at,p.grace_days
  from public.seller_subscriptions s join public.seller_subscription_plans p on p.code=s.plan_code
  where s.is_current=true and (
   (s.status='trialing' and s.trial_ends_at is not null and now()>=s.trial_ends_at)
   or (s.status in ('active','past_due') and s.current_period_ends_at is not null and now()>=s.current_period_ends_at)
   or (s.status='grace' and s.grace_ends_at is not null and now()>=s.grace_ends_at)
  )
  order by coalesce(s.trial_ends_at,s.current_period_ends_at,s.grace_ends_at)
  limit p_batch_size for update of s skip locked
 loop
  if v_sub.status in ('trialing','active','past_due') and coalesce(v_sub.grace_days,0)>0 then
   update public.seller_subscriptions set status='grace',
    grace_ends_at=case when v_sub.status='trialing'
     then v_sub.trial_ends_at+make_interval(days=>v_sub.grace_days)
     else v_sub.current_period_ends_at+make_interval(days=>v_sub.grace_days) end,
    updated_at=now() where id=v_sub.id;
   insert into public.seller_subscription_events(subscription_id,event_type,idempotency_key,metadata)
   values(v_sub.id,'grace_started','lifecycle:grace:'||v_sub.id::text,
    jsonb_build_object('previous_status',v_sub.status,'grace_days',v_sub.grace_days))
   on conflict(idempotency_key) do nothing;
  else
   update public.seller_subscriptions set status='expired',updated_at=now() where id=v_sub.id;
   insert into public.seller_subscription_events(subscription_id,event_type,idempotency_key,metadata)
   values(v_sub.id,'expired','lifecycle:expired:'||v_sub.id::text,
    jsonb_build_object('previous_status',v_sub.status))
   on conflict(idempotency_key) do nothing;
  end if;
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$function$;

revoke all on function public.seller_subscription_summary() from public,anon;
grant execute on function public.seller_subscription_summary() to authenticated,service_role;
revoke all on function public.process_seller_subscription_lifecycle(integer) from public,anon,authenticated;
grant execute on function public.process_seller_subscription_lifecycle(integer) to service_role;

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
 if v_sub.plan_code<>'free' and (
   (v_sub.status='trialing' and v_sub.trial_ends_at is not null and now()>=v_sub.trial_ends_at
    and v_sub.trial_ends_at+make_interval(days=>(select grace_days from public.seller_subscription_plans where code=v_sub.plan_code))<=now())
   or (v_sub.status in ('active','past_due','grace') and v_sub.current_period_ends_at is not null
    and now()>=coalesce(v_sub.grace_ends_at,v_sub.current_period_ends_at+make_interval(days=>(select grace_days from public.seller_subscription_plans where code=v_sub.plan_code))))
   or v_sub.status in ('expired','cancelled')
 ) then v_plan_limit:=5;
 else
  select listing_limit into v_plan_limit from public.seller_subscription_plans where code=v_sub.plan_code and is_active=true;
 end if;
 if v_plan_limit is null then raise exception 'SUBSCRIPTION_PLAN_UNAVAILABLE'; end if;
 select count(*)::integer into v_usage from public.listing_details ld join public.listings l on l.id=ld.listing_id
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
revoke all on function public.create_seller_listing(text,numeric,integer,text,text,text,text,text,text,numeric,text,text,text) from public,anon;
grant execute on function public.create_seller_listing(text,numeric,integer,text,text,text,text,text,text,numeric,text,text,text) to authenticated,service_role;
