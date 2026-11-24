-- DRAFT ONLY. Disposable PostgreSQL 17 contract test / isolated future staging.
-- DO NOT EXECUTE IN CARDORA PRODUCTION. Requires Stripe subscription schema first.
-- No email is delivered by this SQL. Unique invoice prevents duplicate enqueue.
create table if not exists public.cardora_payment_email_outbox (
  stripe_invoice_id text primary key check(stripe_invoice_id ~ '^in_[A-Za-z0-9_]+$'),
  seller_profile_id uuid not null references public.seller_profiles(id),
  stripe_subscription_id text not null check(stripe_subscription_id ~ '^sub_[A-Za-z0-9_]+$'),
  plan_code text not null check(plan_code in ('basic','pro','business')),
  period_end timestamptz not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  resend_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cardora_payment_email_outbox enable row level security;
revoke all on public.cardora_payment_email_outbox from public,anon,authenticated;
grant select,insert,update on public.cardora_payment_email_outbox to service_role;

create or replace function public.cardora_queue_verified_payment_email(
 p_invoice_id text,p_seller_profile_id uuid,p_stripe_subscription_id text,
 p_plan_code text,p_period_end timestamptz
) returns boolean
language plpgsql security definer set search_path=''
as $cardora_email$
begin
  if p_invoice_id !~ '^in_[A-Za-z0-9_]+$'
    or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9_]+$'
    or p_plan_code not in ('basic','pro','business')
    or p_period_end is null then
    raise exception 'Invalid paid invoice email event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_seller_profile_id::text));
  if not exists (
    select 1 from public.cardora_stripe_subscription_links l
    join public.seller_subscriptions s on s.seller_profile_id=l.seller_profile_id
      and s.is_current=true and s.status='active' and s.plan_code=p_plan_code
      and s.current_period_ends_at>=p_period_end
    where l.seller_profile_id=p_seller_profile_id
      and l.stripe_subscription_id=p_stripe_subscription_id
      and l.plan_code=p_plan_code
  ) then
    raise exception 'Active paid membership not verified';
  end if;
  insert into public.cardora_payment_email_outbox(
    stripe_invoice_id,seller_profile_id,stripe_subscription_id,plan_code,period_end
  ) values (p_invoice_id,p_seller_profile_id,p_stripe_subscription_id,p_plan_code,p_period_end)
  on conflict(stripe_invoice_id) do nothing;
  if exists(
    select 1 from public.cardora_payment_email_outbox
      where stripe_invoice_id=p_invoice_id
        and (seller_profile_id<>p_seller_profile_id
          or stripe_subscription_id<>p_stripe_subscription_id
          or plan_code<>p_plan_code or period_end<>p_period_end)
  ) then raise exception 'Invoice already linked to different membership'; end if;
  return true;
end;
$cardora_email$;
revoke all on function public.cardora_queue_verified_payment_email(text,uuid,text,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.cardora_queue_verified_payment_email(text,uuid,text,text,timestamptz)
 to service_role;
