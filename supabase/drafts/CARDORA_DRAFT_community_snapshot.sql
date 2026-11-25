-- DRAFT ONLY. Not applied. Review permissions, retention and job cadence before release.
-- One public aggregate row; no user-level data, no public function or client writes.
begin;
create schema cardora_metrics_private;
revoke all on schema cardora_metrics_private from public, anon, authenticated;
create table cardora_metrics_private.excluded_accounts (
  auth_user_id uuid primary key
);
alter table cardora_metrics_private.excluded_accounts enable row level security;
revoke all on cardora_metrics_private.excluded_accounts from public, anon, authenticated;
-- The launch-day boundary excludes the verified historical internal/test cohort.
-- Future internal/test accounts must be registered in the private exclusion table
-- BEFORE any public snapshot is refreshed. Never trust user-editable metadata.
create table public.cardora_community_snapshot (
  singleton boolean primary key default true check (singleton),
  registered_members bigint not null check (registered_members >= 0),
  verified_members bigint not null check (verified_members >= 0 and verified_members <= registered_members),
  new_today bigint not null check (new_today >= 0 and new_today <= registered_members),
  day_myt date not null,
  measured_at timestamptz not null
);
alter table public.cardora_community_snapshot enable row level security;
revoke all on public.cardora_community_snapshot from public, anon, authenticated;
grant select on public.cardora_community_snapshot to anon, authenticated;
create policy community_snapshot_read on public.cardora_community_snapshot
  for select to anon, authenticated using (singleton = true);
create function cardora_metrics_private.refresh_community_snapshot()
returns void language sql security invoker set search_path = pg_catalog
as $$
  with eligible as (
    select a.id, a.created_at, a.email_confirmed_at
    from auth.users a
    where a.created_at >= timestamptz '2026-11-25 00:00:00+08'
      and a.deleted_at is null and coalesce(a.is_anonymous,false) = false
      and (a.banned_until is null or a.banned_until <= statement_timestamp())
      and not exists (select 1 from cardora_metrics_private.excluded_accounts e where e.auth_user_id=a.id)
      and exists (select 1 from public.users p where p.auth_user_id=a.id and p.status='active' and p.role in ('user','seller','agent'))
      and not exists (select 1 from public.users p where p.auth_user_id=a.id and p.role='admin')
  ), totals as (
    select count(*) as registered_members,
      count(*) filter (where email_confirmed_at is not null) as verified_members,
      count(*) filter (where (created_at at time zone 'Asia/Kuala_Lumpur')::date =
        (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date) as new_today
    from eligible
  )
  insert into public.cardora_community_snapshot(singleton,registered_members,verified_members,new_today,day_myt,measured_at)
  select true,registered_members,verified_members,new_today,
      (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date,statement_timestamp()
  from totals
  on conflict (singleton) do update set registered_members=excluded.registered_members,
    verified_members=excluded.verified_members,new_today=excluded.new_today,
    day_myt=excluded.day_myt,measured_at=excluded.measured_at;
$$;
revoke all on function cardora_metrics_private.refresh_community_snapshot() from public, anon, authenticated;
-- Privileged operator only. Scheduler intentionally NOT installed or enabled here.
-- To initialize after approval: select cardora_metrics_private.refresh_community_snapshot();
commit;
