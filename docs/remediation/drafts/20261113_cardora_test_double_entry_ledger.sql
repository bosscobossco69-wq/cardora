-- Cardora isolated double-entry ledger foundation (Staging only).
-- Draft for review. Does NOT connect checkout, provider webhooks, refunds, or payouts.
-- Existing test_* tables and rows are intentionally untouched.

create table public.cardora_test_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null check (length(btrim(account_code)) between 2 and 80),
  account_name text not null check (length(btrim(account_name)) between 2 and 160),
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  owner_type text not null check (owner_type in ('platform','buyer','seller','agent','provider')),
  owner_id uuid,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((owner_type = 'platform' and owner_id is null) or (owner_type <> 'platform' and owner_id is not null))
);

create unique index cardora_test_accounts_identity_uq
  on public.cardora_test_accounts(account_code, owner_type, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), currency);

create table public.cardora_test_journals (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 8 and 200),
  reference_type text not null check (length(btrim(reference_type)) between 2 and 80),
  reference_id text not null check (length(btrim(reference_id)) between 1 and 200),
  event_type text not null check (length(btrim(event_type)) between 2 and 80),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  description text not null check (length(btrim(description)) between 1 and 1000),
  reversal_of_id uuid unique references public.cardora_test_journals(id),
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.cardora_test_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.cardora_test_journals(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  account_id uuid not null references public.cardora_test_accounts(id) on delete restrict,
  debit numeric(24,8) not null default 0 check (debit >= 0),
  credit numeric(24,8) not null default 0 check (credit >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  memo text,
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  unique (journal_id, line_no)
);

create index cardora_test_entries_account_idx on public.cardora_test_entries(account_id, journal_id);
create index cardora_test_journals_reference_idx on public.cardora_test_journals(reference_type, reference_id);

alter table public.cardora_test_accounts enable row level security;
alter table public.cardora_test_journals enable row level security;
alter table public.cardora_test_entries enable row level security;

revoke all on public.cardora_test_accounts, public.cardora_test_journals, public.cardora_test_entries from public, anon, authenticated, service_role;

create or replace function public.cardora_test_reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Cardora test ledger records are immutable; use a reversal journal';
end;
$$;

revoke all on function public.cardora_test_reject_ledger_mutation() from public, anon, authenticated, service_role;

create trigger cardora_test_accounts_immutable
before update or delete on public.cardora_test_accounts
for each row execute function public.cardora_test_reject_ledger_mutation();

create trigger cardora_test_journals_immutable
before update or delete on public.cardora_test_journals
for each row execute function public.cardora_test_reject_ledger_mutation();

create trigger cardora_test_entries_immutable
before update or delete on public.cardora_test_entries
for each row execute function public.cardora_test_reject_ledger_mutation();

create or replace function public.cardora_test_post_journal(
  p_idempotency_key text,
  p_reference_type text,
  p_reference_id text,
  p_event_type text,
  p_currency text,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_journal_id uuid;
  v_total_debit numeric(24,8);
  v_total_credit numeric(24,8);
  v_count integer;
  v_existing uuid;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8
     or length(p_idempotency_key) > 200 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter uppercase code';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal requires at least two lines';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select id into v_existing
  from public.cardora_test_journals
  where idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x(account_id uuid, debit numeric, credit numeric, memo text)
    where x.account_id is null
       or coalesce(x.debit, 0) < 0
       or coalesce(x.credit, 0) < 0
       or not ((coalesce(x.debit, 0) > 0 and coalesce(x.credit, 0) = 0)
            or (coalesce(x.credit, 0) > 0 and coalesce(x.debit, 0) = 0))
  ) then
    raise exception 'Each line must contain one positive debit or credit only';
  end if;

  select count(*), coalesce(sum(x.debit),0), coalesce(sum(x.credit),0)
    into v_count, v_total_debit, v_total_credit
  from jsonb_to_recordset(p_lines) as x(account_id uuid, debit numeric, credit numeric, memo text);

  if v_count < 2 or v_total_debit <= 0 or v_total_debit <> v_total_credit then
    raise exception 'Journal is not balanced';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x(account_id uuid, debit numeric, credit numeric, memo text)
    left join public.cardora_test_accounts a on a.id = x.account_id
    where a.id is null or a.is_active is not true or a.currency <> p_currency
  ) then
    raise exception 'Account missing, inactive, or currency mismatch';
  end if;

  insert into public.cardora_test_journals(
    idempotency_key, reference_type, reference_id, event_type, currency, description
  ) values (
    p_idempotency_key, p_reference_type, p_reference_id, p_event_type, p_currency, p_description
  ) returning id into v_journal_id;

  insert into public.cardora_test_entries(journal_id, line_no, account_id, debit, credit, currency, memo)
  select v_journal_id, row_number() over (), x.account_id,
         coalesce(x.debit,0), coalesce(x.credit,0), p_currency, x.memo
  from jsonb_to_recordset(p_lines) as x(account_id uuid, debit numeric, credit numeric, memo text);

  return v_journal_id;
end;
$$;

revoke all on function public.cardora_test_post_journal(text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.cardora_test_post_journal(text,text,text,text,text,text,jsonb) to service_role;

comment on table public.cardora_test_accounts is 'Isolated Cardora test chart of accounts; no production financial effect.';
comment on table public.cardora_test_journals is 'Immutable posted journal headers with idempotency keys.';
comment on table public.cardora_test_entries is 'Immutable balanced debit/credit lines; one currency per journal.';
comment on function public.cardora_test_post_journal(text,text,text,text,text,text,jsonb) is 'Service-role-only atomic posting function for isolated synthetic ledger tests.';
