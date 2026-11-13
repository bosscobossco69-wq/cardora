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
 v_limit integer; v_usage integer; v_status text; v_grace_days integer;
begin
 v_user:=public.current_user_row_id();
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 select id into v_seller from public.seller_profiles where user_id=v_user and status='approved' limit 1;
 if v_seller is null then raise exception 'SELLER_NOT_APPROVED'; end if;
 select * into v_sub from public.seller_subscriptions
 where seller_profile_id=v_seller and is_current=true order by created_at desc limit 1;
 if not found then
  plan_code:='free'; plan_name:='Free'; subscription_status:='active';
  effective_listing_limit:=5; listings_used:=0; billing_price:=0; billing_currency:='MYR';
  trial_ends_at:=null; current_period_ends_at:=null; grace_ends_at:=null;
  cancel_at_period_end:=false; return next; return;
 end if;
 select grace_days into v_grace_days from public.seller_subscription_plans where code=v_sub.plan_code;
 v_status:=v_sub.status;
 if v_sub.plan_code<>'free' and (
  (v_sub.status='trialing' and v_sub.trial_ends_at is not null and now()>=v_sub.trial_ends_at+make_interval(days=>coalesce(v_grace_days,0)))
  or (v_sub.status in ('active','past_due','grace') and v_sub.current_period_ends_at is not null
      and now()>=coalesce(v_sub.grace_ends_at,v_sub.current_period_ends_at+make_interval(days=>coalesce(v_grace_days,0))))
  or v_sub.status in ('expired','cancelled')
 ) then
  select listing_limit into v_limit from public.seller_subscription_plans where code='free'; v_status:='expired';
 else
  select listing_limit into v_limit from public.seller_subscription_plans where code=v_sub.plan_code and is_active=true;
 end if;
 select count(*)::integer into v_usage from public.listing_details ld join public.listings l on l.id=ld.listing_id
 where ld.seller_id=v_seller and l.status in ('pending_review','active','rejected','suspended');
 select p.name,p.price,p.billing_currency into plan_name,billing_price,billing_currency
 from public.seller_subscription_plans p where p.code=case when v_status='expired' then 'free' else v_sub.plan_code end;
 plan_code:=case when v_status='expired' then 'free' else v_sub.plan_code end;
 subscription_status:=v_status; effective_listing_limit:=coalesce(v_limit,5);
 listings_used:=v_usage; trial_ends_at:=v_sub.trial_ends_at;
 current_period_ends_at:=v_sub.current_period_ends_at; grace_ends_at:=v_sub.grace_ends_at;
 cancel_at_period_end:=v_sub.cancel_at_period_end; return next;
end;
$function$;
revoke all on function public.seller_subscription_summary() from public,anon;
grant execute on function public.seller_subscription_summary() to authenticated,service_role;