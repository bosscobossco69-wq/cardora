-- DRAFT ONLY — administrator active-status authorization guard.
-- Source: exact pg_get_functiondef() from the Cardora database, 2026-11-22.
-- This is a review artifact: do not apply to production before isolated QA.
-- Role alone is insufficient: revoked/suspended admin identities must not approve listings or applications.

-- Harden: admin_get_listing_review_queue
CREATE OR REPLACE FUNCTION public.admin_get_listing_review_queue(p_limit integer DEFAULT 50)
 RETURNS TABLE(listing_id uuid, title text, price numeric, currency text, inventory integer, status text, created_at timestamp with time zone, set_name text, card_number text, language text, condition text, verification_status text, seller_id uuid, seller_display_name text, seller_trust_level text, seller_verification_status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.id,l.title,l.price,l.currency,l.inventory,l.status,l.created_at,
         d.set_name,d.card_number,d.language,d.condition,d.verification_status,
         d.seller_id,sp.display_name,sp.trust_level,sp.verification_status
  from public.listings l
  join public.listing_details d on d.listing_id=l.id
  left join public.seller_profiles sp on sp.id=d.seller_id
  where exists (
    select 1 from public.users u
    where u.auth_user_id=auth.uid() and u.role='admin' and u.status='active'
  )
  and l.status='pending_review'
  order by l.created_at asc
  limit least(greatest(coalesce(p_limit,50),1),100);
$function$;

revoke all on function public.admin_get_listing_review_queue(integer) from public,anon,authenticated;
grant execute on function public.admin_get_listing_review_queue(integer) to authenticated;

-- Harden: admin_review_listing
CREATE OR REPLACE FUNCTION public.admin_review_listing(p_listing_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_updated integer;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_user_id=auth.uid() and u.role='admin' and u.status='active'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  -- This RPC handles the review queue only. Suspension of already-active
  -- listings needs a separate audited moderation action.
  if p_status is null or p_status not in ('active','rejected') then
    raise exception 'INVALID_REVIEW_DECISION';
  end if;

  -- An approved/rejected listing cannot be silently re-reviewed or changed
  -- through a stale admin browser tab. Only pending items can transition.
  update public.listings set status=p_status
  where id=p_listing_id and status='pending_review';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;

  update public.listing_details
  set verification_status=case when p_status='active' then 'verified' else p_status end,
      description=case
        when p_note is null then description
        else concat(coalesce(description,''),case when coalesce(description,'')='' then '' else E'\n' end,'Admin note: ',p_note)
      end,
      updated_at=now()
  where listing_id=p_listing_id;

  return true;
end;
$function$;

revoke all on function public.admin_review_listing(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_listing(uuid,text,text) to authenticated;

-- Harden: admin_review_seller_application
CREATE OR REPLACE FUNCTION public.admin_review_seller_application(p_application_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_app public.seller_applications%rowtype;
  v_seller uuid;
  v_agent public.agent_profiles%rowtype;
  v_agent_id uuid;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.role = 'admin' and u.status='active'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_status is null or p_status not in ('approved','rejected','contacted') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_app
  from public.seller_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  -- Never silently reapprove/reject an already-finalized application.
  -- This also prevents duplicate side effects from stale admin requests.
  if v_app.status not in ('pending','contacted') then
    raise exception 'APPLICATION_ALREADY_DECIDED';
  end if;

  if p_status = 'approved' and v_app.user_id is null then
    raise exception 'APPLICATION_NOT_LINKED_TO_ACCOUNT';
  end if;

  if p_status = 'approved' and coalesce(v_app.role,'seller') not in ('seller','agent') then
    raise exception 'INVALID_APPLICATION_ROLE';
  end if;

  -- Approval cannot reactivate an inactive or unlinked member.
  if p_status = 'approved' then
    perform 1 from public.users u where u.id=v_app.user_id
      and u.status='active' and u.auth_user_id is not null for update;
    if not found then raise exception 'ACTIVE_LINKED_MEMBER_REQUIRED'; end if;
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
      where public.seller_profiles.status='approved'
    returning id into v_seller;
    if v_seller is null then raise exception 'SELLER_REACTIVATION_REQUIRES_REVIEW'; end if;

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
      if v_agent.application_id is distinct from v_app.id or v_agent.user_id is distinct from v_app.user_id then
        raise exception 'AGENT_PROFILE_CONFLICT';
      end if;

      if v_agent.status is distinct from 'active' then
        raise exception 'AGENT_REACTIVATION_REQUIRES_REVIEW';
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
          and public.agent_profiles.status = 'active'
      returning id into v_agent_id;

      if v_agent_id is null then
        raise exception 'AGENT_PROFILE_CONFLICT';
      end if;
    end if;
  end if;

  return true;
end;
$function$;

revoke all on function public.admin_review_seller_application(uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_review_seller_application(uuid,text,text) to authenticated;

