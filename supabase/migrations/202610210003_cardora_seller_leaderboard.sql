-- Cardora monthly seller leaderboard foundation.
-- Review/test in a non-production Supabase project first. Not yet applied to any project.
-- Only trusted server-side code/service_role should write verified completed-order events.
create extension if not exists pgcrypto;

create table if not exists public.cardora_public_seller_profiles (
  seller_id uuid primary key references auth.users(id) on delete cascade,
  public_username text not null unique check (length(trim(public_username)) between 3 and 40),
  store_name text not null check (length(trim(store_name)) between 2 and 80),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cardora_verified_sales (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  seller_id uuid not null references public.cardora_public_seller_profiles(seller_id) on delete restrict,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  eligible_sales_amount numeric(20,2) not null check (eligible_sales_amount >= 0),
  status text not null check (status in ('completed','refunded','cancelled','disputed','excluded')),
  completed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  source_event_id text unique,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists cardora_verified_sales_month_idx
  on public.cardora_verified_sales (completed_at, seller_id) where status = 'completed';

-- Public current-month view. Sales totals are grouped by currency (never add unlike currencies).
create or replace view public.cardora_monthly_seller_leaderboard
with (security_invoker = true) as
select
  date_trunc('month', timezone('UTC', now()))::date as leaderboard_month,
  p.public_username,
  p.store_name,
  s.seller_id,
  count(*) filter (where s.status = 'completed')::bigint as completed_orders,
  s.currency,
  coalesce(sum(s.eligible_sales_amount) filter (where s.status = 'completed'), 0)::numeric(20,2) as sales_total,
  dense_rank() over (
    partition by s.currency
    order by count(*) filter (where s.status = 'completed') desc,
             coalesce(sum(s.eligible_sales_amount) filter (where s.status = 'completed'), 0) desc,
             p.public_username asc
  ) as order_rank
from public.cardora_public_seller_profiles p
join public.cardora_verified_sales s on s.seller_id = p.seller_id
where p.is_public = true
  and s.completed_at >= date_trunc('month', timezone('UTC', now()))
  and s.completed_at < date_trunc('month', timezone('UTC', now())) + interval '1 month'
  and s.status = 'completed'
group by p.public_username, p.store_name, s.seller_id, s.currency;

alter table public.cardora_public_seller_profiles enable row level security;
alter table public.cardora_verified_sales enable row level security;

drop policy if exists "Public can view public seller handles" on public.cardora_public_seller_profiles;
create policy "Public can view public seller handles"
  on public.cardora_public_seller_profiles for select to anon, authenticated
  using (is_public = true);

-- No public/authenticated insert/update/delete policies: verified sales must only be written
-- by trusted server-side functions using service_role after checking the canonical order state.
revoke all on public.cardora_verified_sales from anon, authenticated;
grant select on public.cardora_public_seller_profiles to anon, authenticated;
revoke all on public.cardora_monthly_seller_leaderboard from anon, authenticated;
grant select on public.cardora_monthly_seller_leaderboard to anon, authenticated;

comment on table public.cardora_verified_sales is 'Server-verified order ledger for leaderboard only; do not accept browser-submitted sales.';
comment on view public.cardora_monthly_seller_leaderboard is 'Current UTC month, grouped by currency; excludes refunded/cancelled/disputed/excluded orders.';
