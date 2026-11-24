-- Cardora Stripe Sandbox subscription schema — DRAFT ONLY / NOT APPLIED.
-- Replaces corrupted concatenated draft. Execute only in disposable staging
-- after a full backup and independent review. NEVER on active Cardora production.
-- No Live payments and no automatic billing enabled by this file.
create table if not exists public.cardora_stripe_checkout_reservations(
  seller_profile_id uuid primary key references public.seller_profiles(id),
  request_id uuid not null unique default gen_random_uuid(),
  tier_code text not null check(tier_code in ('basic','pro','business')),
  status text not null default 'reserved' check(status in ('reserved','fulfilled')),
  created_at timestamptz not null default now()
);
alter table public.cardora_stripe_checkout_reservations enable row level security;
revoke all on public.cardora_stripe_checkout_reservations from public,anon,authenticated;
grant select,insert,update on public.cardora_stripe_checkout_reservations to service_role;

create table if not exists public.cardora_stripe_risk_review_events(
  event_id text primary key,
  event_kind text not null check(event_kind in (
    'charge.refunded','charge.dispute.created','charge.dispute.closed'
  )),
  charge_id text not null check(charge_id ~ '^ch_[A-Za-z0-9_]+$'),
  event_created bigint not null check(event_created > 0),
  review_status text not null default 'pending'
    check(review_status in ('pending','reviewed')),
  received_at timestamptz not null default now()
);
alter table public.cardora_stripe_risk_review_events enable row level security;
revoke all on public.cardora_stripe_risk_review_events from public,anon,authenticated;
grant select,insert on public.cardora_stripe_risk_review_events to service_role;

create table if not exists public.cardora_stripe_event_receipts(
  event_id text primary key,
  event_kind text not null check(event_kind in ('paid','past_due','canceled')),
  stripe_subscription_id text not null,
  seller_profile_id uuid not null references public.seller_profiles(id),
  received_at timestamptz not null default now()
);
alter table public.cardora_stripe_event_receipts enable row level security;
revoke all on public.cardora_stripe_event_receipts from public,anon,authenticated;
grant select,insert on public.cardora_stripe_event_receipts to service_role;

create table if not exists public.cardora_stripe_subscription_links(
  seller_profile_id uuid primary key references public.seller_profiles(id),
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  plan_code text not null references public.seller_subscription_plans(code),
  last_event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.cardora_stripe_subscription_links enable row level security;
revoke all on public.cardora_stripe_subscription_links from public,anon,authenticated;
grant select,insert,update on public.cardora_stripe_subscription_links to service_role;

create or replace function public.cardora_reserve_stripe_checkout(
  p_seller_profile_id uuid,p_tier_code text
) returns uuid
language plpgsql security definer set search_path=''
as $cardora_reservation$
declare v_res record;
begin
  if p_tier_code not in ('basic','pro','business') then
    raise exception 'Invalid tier';
  end if;
  if not exists(
    select 1 from public.seller_profiles s where s.id=p_seller_profile_id
      and s.status='approved' and s.verification_status='verified'
  ) then
    raise exception 'Seller not eligible';
  end if;
  -- Defense in depth: a pre-existing Cardora/ToyyibPay current membership
  -- must be reconciled before reserving Stripe Checkout. This check also
  -- protects server callers that bypass the browser eligibility check.
  if exists (
    select 1 from public.seller_subscriptions s
      where s.seller_profile_id=p_seller_profile_id and s.is_current=true
  ) then
    raise exception 'Existing membership requires reconciliation';
  end if;
  -- A row never automatically expires: this deliberately requires manual
  -- verification after Stripe timeouts to avoid accidental duplicate charges.
  insert into public.cardora_stripe_checkout_reservations(seller_profile_id,tier_code)
    values(p_seller_profile_id,p_tier_code)
    on conflict(seller_profile_id) do nothing;
  select request_id,tier_code,status,created_at into v_res
    from public.cardora_stripe_checkout_reservations
    where seller_profile_id=p_seller_profile_id for update;
  if v_res.request_id is null or v_res.tier_code<>p_tier_code
    or v_res.status<>'reserved'
    or v_res.created_at<=now()-interval '20 hours' then
    raise exception 'Checkout requires manual reconciliation';
  end if;
  if exists(select 1 from public.cardora_stripe_subscription_links
      where seller_profile_id=p_seller_profile_id) then
    raise exception 'Subscription already linked';
  end if;
  return v_res.request_id;
end;
$cardora_reservation$;
revoke all on function public.cardora_reserve_stripe_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.cardora_reserve_stripe_checkout(uuid,text) to service_role;

create or replace function public.cardora_record_verified_stripe_risk_event(
  p_event_id text,p_event_kind text,p_charge_id text,p_event_created bigint
) returns boolean
language plpgsql security definer set search_path=''
as $cardora_risk$
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
    or p_event_kind not in ('charge.refunded','charge.dispute.created','charge.dispute.closed')
    or p_charge_id !~ '^ch_[A-Za-z0-9_]+$'
    or p_event_created is null or p_event_created<=0 then
    raise exception 'Invalid risk event';
  end if;
  insert into public.cardora_stripe_risk_review_events
    (event_id,event_kind,charge_id,event_created)
    values(p_event_id,p_event_kind,p_charge_id,p_event_created)
    on conflict(event_id) do nothing;
  return true;
end;
$cardora_risk$;
revoke all on function public.cardora_record_verified_stripe_risk_event(text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.cardora_record_verified_stripe_risk_event(text,text,text,bigint)
  to service_role;

create or replace function public.cardora_apply_verified_stripe_event(
  p_event_id text,p_kind text,p_seller_profile_id uuid,p_plan_code text,
  p_stripe_customer_id text,p_stripe_subscription_id text,
  p_period_start timestamptz,p_period_end timestamptz,
  p_checkout_request_id uuid,p_event_created bigint
) returns boolean
language plpgsql security definer set search_path=''
as $cardora_event$
declare
  v_link public.cardora_stripe_subscription_links%rowtype;
  v_sub uuid;
  v_sub_plan text;
  v_sub_status text;
  v_sub_period_end timestamptz;
  v_plan public.seller_subscription_plans%rowtype;
begin
  if p_event_id !~ '^evt_[A-Za-z0-9_]+$'
     or p_kind not in ('paid','past_due','canceled')
     or p_plan_code not in ('basic','pro','business')
     or p_stripe_customer_id !~ '^cus_[A-Za-z0-9_]+$'
     or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9_]+$'
     or p_event_created is null or p_event_created<=0 then
    raise exception 'Invalid event';
  end if;
  if not exists(select 1 from public.seller_profiles where id=p_seller_profile_id) then
    raise exception 'Unknown seller';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_seller_profile_id::text));
  select * into v_link from public.cardora_stripe_subscription_links
    where seller_profile_id=p_seller_profile_id for update;
  -- A verified invoice must NEVER adopt or overwrite a pre-existing
  -- non-Stripe membership. A payment from a stale/orphaned Checkout needs
  -- manual reconciliation/refund rather than silent entitlement transfer.
  if p_kind='paid' and v_link.seller_profile_id is null and exists (
    select 1 from public.seller_subscriptions s
      where s.seller_profile_id=p_seller_profile_id and s.is_current=true
  ) then
    raise exception 'Existing non-Stripe membership requires reconciliation';
  end if;
  if v_link.seller_profile_id is not null and (
    v_link.stripe_subscription_id<>p_stripe_subscription_id or
    v_link.stripe_customer_id<>p_stripe_customer_id or
    v_link.plan_code<>p_plan_code
  ) then
    raise exception 'Subscription link mismatch';
  end if;
  if exists(select 1 from public.cardora_stripe_subscription_links
    where stripe_subscription_id=p_stripe_subscription_id
      and seller_profile_id<>p_seller_profile_id) then
    raise exception 'Subscription owner mismatch';
  end if;
  if p_kind='paid' then
    if p_period_start is null or p_period_end is null
      or p_period_end<=p_period_start then
      raise exception 'Invalid paid period';
    end if;
    if p_checkout_request_id is null or not exists(
      select 1 from public.cardora_stripe_checkout_reservations r
      where r.seller_profile_id=p_seller_profile_id
        and r.tier_code=p_plan_code and r.request_id=p_checkout_request_id
        and r.status in ('reserved','fulfilled')
    ) then
      raise exception 'Checkout reservation mismatch';
    end if;
    select * into v_plan from public.seller_subscription_plans
      where code=p_plan_code and tier_code=p_plan_code and is_active=true
        and billing_currency='MYR';
    if v_plan.code is null then raise exception 'Plan unavailable'; end if;
  elsif v_link.seller_profile_id is null then
    -- Never apply an uncorrelated cancellation or failed payment.
    raise exception 'Subscription link missing';
  end if;
  insert into public.cardora_stripe_event_receipts
    (event_id,event_kind,stripe_subscription_id,seller_profile_id)
    values(p_event_id,p_kind,p_stripe_subscription_id,p_seller_profile_id)
    on conflict(event_id) do nothing;
  if not found then return true; end if;
  if v_link.seller_profile_id is not null and (
      p_event_created<v_link.last_event_created or
      (p_event_created=v_link.last_event_created and p_kind<>'canceled')
  ) then return true; end if;
  select id,plan_code,status,current_period_ends_at
    into v_sub,v_sub_plan,v_sub_status,v_sub_period_end
    from public.seller_subscriptions
    where seller_profile_id=p_seller_profile_id and is_current=true
    order by created_at desc limit 1 for update;
  if p_kind='paid' then
    -- A paid invoice for the exact same period can restore a past_due
    -- membership. Never treat a shorter historical period as recovery, and
    -- never rewrite an already-active equal-period entitlement.
    if v_link.seller_profile_id is not null
      and v_sub_period_end is not null
      and (p_period_end<v_sub_period_end
        or (p_period_end=v_sub_period_end and v_sub_status='active')) then
      return true;
    end if;
    update public.cardora_stripe_checkout_reservations set status='fulfilled'
      where seller_profile_id=p_seller_profile_id and request_id=p_checkout_request_id;
    insert into public.cardora_stripe_subscription_links
      (seller_profile_id,stripe_customer_id,stripe_subscription_id,plan_code,last_event_created)
      values(p_seller_profile_id,p_stripe_customer_id,p_stripe_subscription_id,
        p_plan_code,p_event_created)
      on conflict(seller_profile_id) do update set
        last_event_created=excluded.last_event_created,updated_at=now();
    if v_sub is not null and v_sub_plan=p_plan_code then
      update public.seller_subscriptions set status='active',
        current_period_starts_at=p_period_start,current_period_ends_at=p_period_end,
        current_review_mode=case when v_plan.review_mode='legacy' then null else v_plan.review_mode end,
        human_review_allowance=v_plan.included_human_reviews,
        grace_ends_at=null,cancel_at_period_end=false,updated_at=now()
        where id=v_sub;
    else
      update public.seller_subscriptions set is_current=false,updated_at=now()
        where seller_profile_id=p_seller_profile_id and is_current=true;
      insert into public.seller_subscriptions
        (seller_profile_id,plan_code,status,is_current,started_at,
         current_period_starts_at,current_period_ends_at,
         current_review_mode,human_review_allowance,cancel_at_period_end)
        values(p_seller_profile_id,p_plan_code,'active',true,now(),
          p_period_start,p_period_end,
          case when v_plan.review_mode='legacy' then null else v_plan.review_mode end,
          v_plan.included_human_reviews,false);
    end if;
  else
    update public.cardora_stripe_subscription_links
      set last_event_created=p_event_created,updated_at=now()
      where seller_profile_id=p_seller_profile_id
        and stripe_subscription_id=p_stripe_subscription_id;
    update public.seller_subscriptions
      set status=case when p_kind='past_due' then 'past_due' else 'cancelled' end,
        is_current=case when p_kind='canceled' then false else is_current end,
        updated_at=now()
      where seller_profile_id=p_seller_profile_id and is_current=true
        and plan_code=p_plan_code;
  end if;
  return true;
end;
$cardora_event$;
revoke all on function public.cardora_apply_verified_stripe_event(
  text,text,uuid,text,text,text,timestamptz,timestamptz,uuid,bigint)
  from public,anon,authenticated;
grant execute on function public.cardora_apply_verified_stripe_event(
  text,text,uuid,text,text,text,timestamptz,timestamptz,uuid,bigint)
  to service_role;
