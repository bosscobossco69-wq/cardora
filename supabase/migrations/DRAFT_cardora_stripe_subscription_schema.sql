-- DRAFT ONLY. Do not run against production until Cardora Auth/DB alignment is fixed.
-- Apply with reviewed migration, not from client. Never copy old wallet balances.

-- Atomic seller Checkout reservation, staging draft only.
-- Do not auto-expire and recycle a reservation: Stripe may have created a
-- subscription while the event is still in flight. Admin must reconcile first.
create table if not exists public.cardora_stripe_checkout_reservations (
  seller_profile_id uuid primary key references public.seller_profiles(id),
  request_id uuid not null unique default gen_random_uuid(),
  tier_code text not null check (tier_code in ('basic','pro','business')),
  created_at timestamptz not null default now(),
  status text not null default 'reserved' check (status in ('reserved','fulfilled'))
);
alter table public.cardora_stripe_checkout_reservations enable row level security;
revoke all on public.cardora_stripe_checkout_reservations from public, anon, authenticated;
grant select, insert, update on public.cardora_stripe_checkout_reservations to service_role;

create or replace function public.cardora_reserve_stripe_checkout(
  p_seller_profile_id uuid, p_tier_code text
) returns uuid
language plpgsql security definer set search_path=''
as $
declare
  v_res record;
begin
  if p_tier_code not in ('basic','pro','business') then
    raise exception 'Invalid membership tier';
  end if;
  if not exists (
    select 1 from public.seller_profiles s
    where s.id=p_seller_profile_id
      and s.status='approved'
      and s.verification_status='verified'
  ) then
    raise exception 'Seller not eligible';
  end if;
  -- The reservation is unique per seller and remains durable through retries.
  insert into public.cardora_stripe_checkout_reservations(seller_profile_id,tier_code)
    values (p_seller_profile_id,p_tier_code)
    on conflict(seller_profile_id) do nothing;
  select request_id,tier_code,created_at,status into v_res
    from public.cardora_stripe_checkout_reservations
    where seller_profile_id=p_seller_profile_id
    for update;
  if not found or v_res.tier_code<>p_tier_code or v_res.status<>'reserved'
    or v_res.created_at <= now()-interval '20 hours' then
    raise exception 'Checkout pending manual reconciliation';
  end if;
  if exists(select 1 from public.cardora_stripe_subscription_links
            where seller_profile_id=p_seller_profile_id) then
    raise exception 'Stripe subscription already exists';
  end if;
  return v_res.request_id;
end; $;
revoke all on function public.cardora_reserve_stripe_checkout(uuid,text)
  from public, anon, authenticated;
grant execute on function public.cardora_reserve_stripe_checkout(uuid,text)
  to service_role;

create table if not exists public.cardora_stripe_event_receipts (
  event_id text primary key,
  event_kind text not null,
  stripe_subscription_id text not null,
  seller_profile_id uuid not null references public.seller_profiles(id),
  received_at timestamptz not null default now()
);
alter table public.cardora_stripe_event_receipts enable row level security;
revoke all on public.cardora_stripe_event_receipts from public, anon, authenticated;
grant select, insert on public.cardora_stripe_event_receipts to service_role;

create table if not exists public.cardora_stripe_subscription_links (
  seller_profile_id uuid primary key references public.seller_profiles(id),
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  plan_code text not null references public.seller_subscription_plans(code),
  updated_at timestamptz not null default now()
);
alter table public.cardora_stripe_subscription_links enable row level security;
revoke all on public.cardora_stripe_subscription_links from public, anon, authenticated;
grant select, insert, update on public.cardora_stripe_subscription_links to service_role;

create or replace function public.cardora_apply_verified_stripe_event(
  p_event_id text,p_kind text,p_seller_profile_id uuid,p_plan_code text,
  p_stripe_customer_id text,p_stripe_subscription_id text,
  p_period_start timestamptz,p_period_end timestamptz
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_current uuid;
  v_current_plan text;
  v_existing_owner uuid;
begin
  -- This function must ONLY be callable by service_role from the signature-verified Edge Function.
  if p_event_id !~ '^evt_' or p_kind not in ('paid','past_due','canceled')
     or length(p_stripe_customer_id)<4 or length(p_stripe_subscription_id)<4 then
     raise exception 'Invalid Stripe event';
  end if;
  if not exists (select 1 from public.seller_profiles where id=p_seller_profile_id) then
    raise exception 'Unknown seller';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_seller_profile_id::text));
  select seller_profile_id into v_existing_owner
    from public.cardora_stripe_subscription_links
    where stripe_subscription_id=p_stripe_subscription_id;
  if v_existing_owner is not null and v_existing_owner<>p_seller_profile_id then
    raise exception 'Subscription ownership conflict';
  end if;

  -- Events are durable and idempotent. On any exception the INSERT rolls back.
  insert into public.cardora_stripe_event_receipts
   (event_id,event_kind,stripe_subscription_id,seller_profile_id)
   values(p_event_id,p_kind,p_stripe_subscription_id,p_seller_profile_id)
   on conflict (event_id) do nothing;
  if not found then return true; end if;

  if p_kind='paid' then
    -- Do not silently replace an existing subscription: upgrades must use a separate controlled flow.
    if exists(select 1 from public.cardora_stripe_subscription_links
       where seller_profile_id=p_seller_profile_id
       and stripe_subscription_id<>p_stripe_subscription_id) then
       raise exception 'Another Stripe subscription is already linked';
    end if;
    -- Later deliveries of older invoices must not shorten an existing paid period.
    if exists(select 1 from public.cardora_stripe_subscription_links link
       join public.seller_subscriptions sub on sub.seller_profile_id=link.seller_profile_id
       where link.seller_profile_id=p_seller_profile_id
       and link.stripe_subscription_id=p_stripe_subscription_id
       and sub.is_current=true and sub.current_period_ends_at is not null
       and p_period_end <= sub.current_period_ends_at) then
       return true;
    end if;
    if p_period_start is null or p_period_end is null or p_period_end<=p_period_start then
       raise exception 'Invalid billing period';
    end if;
    if not exists (select 1 from public.seller_subscription_plans
                   where code=p_plan_code and is_active=true and billing_currency='MYR') then
       raise exception 'Unrecognized plan';
    end if;
    insert into public.cardora_stripe_subscription_links
      (seller_profile_id,stripe_customer_id,stripe_subscription_id,plan_code)
    values (p_seller_profile_id,p_stripe_customer_id,p_stripe_subscription_id,p_plan_code)
    on conflict(seller_profile_id) do update set
      stripe_customer_id=excluded.stripe_customer_id,
      stripe_subscription_id=excluded.stripe_subscription_id,
      plan_code=excluded.plan_code, updated_at=now();

    select id,plan_code into v_current,v_current_plan
    from public.seller_subscriptions
    where seller_profile_id=p_seller_profile_id and is_current=true
    order by created_at desc limit 1 for update;

    if v_current is not null and v_current_plan=p_plan_code then
      update public.seller_subscriptions set status='active',
        current_period_starts_at=p_period_start,current_period_ends_at=p_period_end,
        grace_ends_at=null,cancel_at_period_end=false,updated_at=now()
      where id=v_current;
    else
      update public.seller_subscriptions set is_current=false,updated_at=now()
        where seller_profile_id=p_seller_profile_id and is_current=true;
      insert into public.seller_subscriptions
        (seller_profile_id,plan_code,status,is_current,started_at,
         current_period_starts_at,current_period_ends_at,cancel_at_period_end)
      values (p_seller_profile_id,p_plan_code,'active',true,now(),
              p_period_start,p_period_end,false);
    end if;
  else
    -- Ignore delayed failures/cancellations for an already-replaced Stripe subscription.
    if exists(select 1 from public.cardora_stripe_subscription_links
      where seller_profile_id=p_seller_profile_id
        and stripe_subscription_id=p_stripe_subscription_id) then
      update public.seller_subscriptions
      set status=case when p_kind='past_due' then 'past_due' else 'cancelled' end,
          is_current=case when p_kind='canceled' then false else is_current end,
          updated_at=now()
      where seller_profile_id=p_seller_profile_id and is_current=true;
    end if;
  end if;
  return true;
end; $$;

revoke all on function public.cardora_apply_verified_stripe_event(
 text,text,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.cardora_apply_verified_stripe_event(
 text,text,uuid,text,text,text,timestamptz,timestamptz) to service_role;
