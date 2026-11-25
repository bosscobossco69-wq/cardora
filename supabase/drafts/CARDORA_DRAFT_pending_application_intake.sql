-- DRAFT ONLY. Never execute against Cardora until separately approved after backup,
-- restore rehearsal, consent design, active-admin RPC cutover and live negative tests.
-- This transaction is intended for the disposable PostgreSQL fixture first.
begin;
lock table public.seller_applications in access exclusive mode;
do $$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.seller_applications'::regclass
    and tgname='seller_application_auto_approve_seller' and tgenabled='O') then
    raise exception 'EXPECTED_AUTO_APPROVAL_TRIGGER_NOT_FOUND';
  end if;
  if (select count(*) from pg_policies where schemaname='public'
    and tablename='seller_applications' and cmd in ('INSERT','ALL')) <> 1
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='seller_applications'
      and policyname='seller_applications_insert_own' and cmd='INSERT') then
    raise exception 'UNEXPECTED_INSERT_POLICY';
  end if;
end $$;
alter table public.seller_applications disable trigger seller_application_auto_approve_seller;
alter table public.seller_applications enable row level security;
revoke insert on public.seller_applications from public,anon,authenticated;
-- Do not grant clients the status, id, timestamp, requested plan, or review mode.
grant insert(user_id,name,email,city,role,shop_links,categories,message) on public.seller_applications to authenticated;
drop policy seller_applications_insert_own on public.seller_applications;
create policy seller_applications_insert_own on public.seller_applications for insert to authenticated
with check (
  status='pending' and role in ('seller','agent')
  and name is not null and char_length(btrim(name)) between 1 and 120
  and categories is not null and char_length(btrim(categories)) between 1 and 200
  and char_length(coalesce(city,''))<=100
  and char_length(coalesce(shop_links,''))<=250
  and char_length(coalesce(message,''))<=800
  and exists(select 1 from public.users u
    where u.id=seller_applications.user_id and u.auth_user_id=(select auth.uid())
      and u.status='active' and lower(u.email)=lower(seller_applications.email))
);
-- Abort if unexpected inherited/column grants allow applicant-controlled decisions.
do $$
begin
  if has_column_privilege('authenticated','public.seller_applications','status','INSERT')
    or has_column_privilege('authenticated','public.seller_applications','id','INSERT')
    or has_column_privilege('authenticated','public.seller_applications','created_at','INSERT')
    or has_column_privilege('authenticated','public.seller_applications','requested_plan_code','INSERT')
    or has_column_privilege('authenticated','public.seller_applications','requested_review_mode','INSERT')
    or has_table_privilege('authenticated','public.seller_applications','UPDATE')
    or has_any_column_privilege('authenticated','public.seller_applications','UPDATE')
    or has_any_column_privilege('anon','public.seller_applications','INSERT') then
    raise exception 'UNSAFE_APPLICATION_GRANTS';
  end if;
end $$;
commit;
-- Emergency pause (review separately): revoke all applicant INSERT column grants;
-- do not restore auto-approval as a rollback. Existing records are not rewritten.
-- Remaining release requirements: reject anonymous Auth sessions server-side,
-- verified email and recorded application consent, rate limiting/duplicate prevention,
-- all alternate writers audited, active-admin review RPC installed and validated.
-- Do NOT connect the frontend to this draft or allow actual submissions yet.
