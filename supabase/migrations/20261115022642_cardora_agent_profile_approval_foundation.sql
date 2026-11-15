-- Cardora Agent identity foundation (Staging only)
-- Adds Agent identity independently from Seller identity.
-- Agent records are created only by the existing manual admin approval flow.

create table public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete restrict,
  application_id uuid not null unique references public.seller_applications(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  referral_code text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.agent_profiles is 'Agent identity profile created only after manual admin approval; no mutable balance.';
comment on column public.agent_profiles.referral_code is 'Server-generated unique code; referral attribution and rewards are implemented separately.';
alter table public.agent_profiles enable row level security;
revoke all on table public.agent_profiles from public, anon, authenticated;
grant select on table public.agent_profiles to authenticated;
grant all on table public.agent_profiles to service_role;
create policy agent_profiles_select_own
  on public.agent_profiles
  for select
  to authenticated
  using (user_id = (select public.current_user_row_id()));

create or replace function public.admin_review_seller_application(
  p_application_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_app public.seller_applications%rowtype;
  v_seller uuid;
  v_agent public.agent_profiles%rowtype;
  v_agent_id uuid;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_status not in ('approved','rejected','contacted') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_app
  from public.seller_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  if p_status = 'approved' and v_app.user_id is null then
    raise exception 'APPLICATION_NOT_LINKED_TO_ACCOUNT';
  end if;

  if p_status = 'approved' and coalesce(v_app.role,'seller') not in ('seller','agent') then
    raise exception 'INVALID_APPLICATION_ROLE';
  end if;

  update public.seller_applications
  set status = p_status,
      message = case
        when p_note is null then message
        else left(concat_ws(E'\\n', message, 'Admin note: ' || p_note), 2000)
      end
  where id = p_application_id;

  if p_status = 'approved' and coalesce(v_app.role,'seller') = 'seller' then
    insert into public.seller_profiles(user_id,status,verification_status,display_name)
    values(v_app.user_id,'approved','pending',coalesce(v_app.name,'Seller'))
    on conflict(user_id) do update
      set status = 'approved',
          display_name = coalesce(excluded.display_name, public.seller_profiles.display_name),
          updated_at = now()
    returning id into v_seller;

    insert into public.seller_subscriptions(seller_profile_id,plan_code,status,started_at,is_current)
    values(v_seller,'free','active',now(),true)
    on conflict (seller_profile_id) where is_current do nothing;

  elsif p_status = 'approved' and coalesce(v_app.role,'seller') = 'agent' then
    select * into v_agent
    from public.agent_profiles ap
    where ap.application_id = v_app.id or ap.user_id = v_app.user_id
    order by ap.created_at
    limit 1
    for update;

    if found then
      if v_agent.application_id <> v_app.id or v_agent.user_id <> v_app.user_id then
        raise exception 'AGENT_PROFILE_CONFLICT';
      end if;

      update public.agent_profiles
      set status = 'active',
          display_name = coalesce(v_app.name, display_name),
          updated_at = now()
      where id = v_agent.id
      returning id into v_agent_id;
    else
      insert into public.agent_profiles(
        user_id, application_id, status, referral_code, display_name
      )
      values (
        v_app.user_id,
        v_app.id,
        'active',
        'AG' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
        coalesce(v_app.name, 'Agent')
      )
      on conflict (user_id) do update
        set status = 'active',
            display_name = coalesce(excluded.display_name, public.agent_profiles.display_name),
            updated_at = now()
        where public.agent_profiles.application_id = excluded.application_id
      returning id into v_agent_id;

      if v_agent_id is null then
        raise exception 'AGENT_PROFILE_CONFLICT';
      end if;
    end if;
  end if;

  return true;
end;
$function$;

revoke all on function public.admin_review_seller_application(uuid,text,text) from public, anon;
grant execute on function public.admin_review_seller_application(uuid,text,text) to authenticated, service_role;
