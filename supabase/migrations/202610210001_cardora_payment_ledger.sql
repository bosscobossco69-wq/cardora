-- Cardora payment / payout / ledger foundation (not a live payment integration)
-- Apply only after reviewing in a non-production Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.cardora_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id text not null,
  provider text not null,
  provider_payment_id text,
  amount numeric(20,8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('created','pending','requires_action','processing','succeeded','failed','canceled','refund_pending','partially_refunded','refunded','disputed')),
  idempotency_key text not null unique,
  provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, provider_payment_id)
);

create table if not exists public.cardora_payout_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete restrict,
  provider text,
  provider_payout_id text,
  amount numeric(20,8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'requested' check (status in ('requested','under_review','approved','processing','paid','rejected','failed','canceled')),
  idempotency_key text not null unique,
  reviewer_id uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, provider_payout_id)
);

create table if not exists public.cardora_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense')),
  owner_user_id uuid references auth.users(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.cardora_ledger_journals (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('buyer_payment','platform_fee','seller_payable','seller_payout','refund','chargeback','adjustment','agent_commission')),
  external_reference text not null,
  idempotency_key text not null unique,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'posted' check (status in ('posted','reversed')),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.cardora_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.cardora_ledger_journals(id) on delete restrict,
  account_id uuid not null references public.cardora_ledger_accounts(id) on delete restrict,
  side text not null check (side in ('debit','credit')),
  amount numeric(20,8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.cardora_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text not null,
  signature_verified boolean not null default false,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  payment_transaction_id uuid references public.cardora_payment_transactions(id) on delete restrict,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create table if not exists public.cardora_refund_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_transaction_id uuid not null references public.cardora_payment_transactions(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  provider text not null,
  provider_refund_id text,
  amount numeric(20,8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','canceled')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (provider, provider_refund_id)
);

create index if not exists cardora_payment_user_created_idx on public.cardora_payment_transactions(user_id, created_at desc);
create index if not exists cardora_payout_seller_created_idx on public.cardora_payout_requests(seller_id, requested_at desc);
create index if not exists cardora_provider_events_received_idx on public.cardora_provider_events(received_at desc);
create index if not exists cardora_refund_payment_created_idx on public.cardora_refund_transactions(payment_transaction_id, created_at desc);
create index if not exists cardora_ledger_journal_ref_idx on public.cardora_ledger_journals(external_reference);
create index if not exists cardora_ledger_entries_journal_idx on public.cardora_ledger_entries(journal_id);

alter table public.cardora_payment_transactions enable row level security;
alter table public.cardora_payout_requests enable row level security;
alter table public.cardora_ledger_accounts enable row level security;
alter table public.cardora_ledger_journals enable row level security;
alter table public.cardora_ledger_entries enable row level security;
alter table public.cardora_provider_events enable row level security;
alter table public.cardora_refund_transactions enable row level security;

-- Remove default client privileges; allow only users to read their own payment/payout records.
revoke all on public.cardora_payment_transactions from anon, authenticated;
revoke all on public.cardora_payout_requests from anon, authenticated;
revoke all on public.cardora_ledger_accounts from anon, authenticated;
revoke all on public.cardora_ledger_journals from anon, authenticated;
revoke all on public.cardora_ledger_entries from anon, authenticated;
revoke all on public.cardora_provider_events from anon, authenticated;
revoke all on public.cardora_refund_transactions from anon, authenticated;
grant select on public.cardora_payment_transactions to authenticated;
grant select on public.cardora_payout_requests to authenticated;
grant select on public.cardora_refund_transactions to authenticated;
create policy "Users read own Cardora payment records" on public.cardora_payment_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Sellers read own Cardora payout requests" on public.cardora_payout_requests
  for select to authenticated using ((select auth.uid()) = seller_id);
create policy "Users read own Cardora refund records" on public.cardora_refund_transactions
  for select to authenticated using (exists (select 1 from public.cardora_payment_transactions p where p.id = payment_transaction_id and p.user_id = (select auth.uid())));
-- No browser role can insert/update/delete financial rows. Backend service must do this after verification.

create schema if not exists cardora_private;
revoke all on schema cardora_private from public, anon, authenticated;
grant usage on schema cardora_private to service_role;

create or replace function cardora_private.post_ledger_journal(
  p_event_type text,
  p_external_reference text,
  p_idempotency_key text,
  p_currency text,
  p_entries jsonb,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal_id uuid;
  v_debits numeric(20,8);
  v_credits numeric(20,8);
  v_count integer;
  v_item jsonb;
  v_account_currency text;
  v_account_id uuid;
  v_side text;
  v_amount numeric(20,8);
begin
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) < 2 then raise exception 'entries_must_be_array_with_two_or_more_items'; end if;
  select count(*), coalesce(sum(case when e.value->>'side'='debit' then (e.value->>'amount')::numeric else 0 end),0), coalesce(sum(case when e.value->>'side'='credit' then (e.value->>'amount')::numeric else 0 end),0)
    into v_count, v_debits, v_credits from jsonb_array_elements(p_entries) as e(value);
  if v_count < 2 or v_debits <= 0 or v_credits <= 0 or v_debits <> v_credits then raise exception 'ledger_journal_not_balanced'; end if;
  insert into public.cardora_ledger_journals(event_type, external_reference, idempotency_key, currency, metadata)
    values (p_event_type, p_external_reference, p_idempotency_key, p_currency, coalesce(p_metadata,'{}'::jsonb))
    returning id into v_journal_id;
  for v_item in select value from jsonb_array_elements(p_entries) loop
    v_account_id := (v_item->>'account_id')::uuid;
    v_side := v_item->>'side';
    v_amount := (v_item->>'amount')::numeric;
    if v_side not in ('debit','credit') or v_amount <= 0 then raise exception 'invalid_ledger_entry'; end if;
    select currency into v_account_currency from public.cardora_ledger_accounts where id=v_account_id;
    if v_account_currency is null or v_account_currency <> p_currency then raise exception 'ledger_account_currency_mismatch'; end if;
    insert into public.cardora_ledger_entries(journal_id, account_id, side, amount, currency)
      values (v_journal_id, v_account_id, v_side, v_amount, p_currency);
  end loop;
  return v_journal_id;
end;
$$;
revoke all on function cardora_private.post_ledger_journal(text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function cardora_private.post_ledger_journal(text,text,text,text,jsonb,jsonb) to service_role;


-- Financial history is append-only. Corrections must be posted as reversing/new journals.
create or replace function cardora_private.prevent_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Cardora ledger history is immutable; post a reversing journal instead';
end;
$$;
create trigger cardora_ledger_journals_immutable
  before update or delete on public.cardora_ledger_journals
  for each row execute function cardora_private.prevent_ledger_mutation();
create trigger cardora_ledger_entries_immutable
  before update or delete on public.cardora_ledger_entries
  for each row execute function cardora_private.prevent_ledger_mutation();

comment on table public.cardora_payment_transactions is 'Provider-confirmed payment state. Do not write from browser clients.';
comment on table public.cardora_payout_requests is 'Seller payout workflow. Paid status requires provider confirmation and reconciliation.';
comment on table public.cardora_ledger_journals is 'Append-only double-entry financial journal. Never edit history to conceal errors; post reversing entries.';
comment on table public.cardora_provider_events is 'Provider webhook event de-duplication and audit records. Verify signature before processing.';
comment on table public.cardora_refund_transactions is 'Refund workflow records; succeeded requires provider confirmation.';
