create table if not exists public.seller_subscription_payment_intents (
 id uuid primary key default gen_random_uuid(),
 seller_profile_id uuid not null references public.seller_profiles(id),
 current_subscription_id uuid null references public.seller_subscriptions(id),
 target_plan_code text not null references public.seller_subscription_plans(code),
 amount numeric(12,2) not null check (amount > 0),
 currency text not null default 'MYR' check (currency='MYR'),
 provider text not null default 'toyyibpay' check (provider='toyyibpay'),
 external_reference text not null unique,
 provider_bill_code text unique,
 status text not null default 'created' check (status in ('created','bill_created','pending','paid','failed','expired','cancelled','reversed')),
 expires_at timestamptz not null,
 verified_at timestamptz,
 provider_transaction_ref text,
 provider_payload_hash text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists seller_subscription_payment_intents_seller_created
 on public.seller_subscription_payment_intents(seller_profile_id,created_at desc);
create index if not exists seller_subscription_payment_intents_status_expiry
 on public.seller_subscription_payment_intents(status,expires_at);
alter table public.seller_subscription_payment_intents enable row level security;
revoke all on public.seller_subscription_payment_intents from public,anon,authenticated,service_role;
comment on table public.seller_subscription_payment_intents is 'Server-only ToyyibPay checkout intents for Seller subscription purchases; no browser access.';
