-- Cardora staging-only seller/listing workflow repair.
-- Applied to staging project fdkfquvzbswxocyrhduk as migration
-- 20261113045016_cardora_staging_seller_listing_workflow_fixes.
-- Additive only; no Production database or deployment changes.

create table if not exists public.listing_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  seller_id uuid references public.seller_profiles(id) on delete set null,
  set_name text,
  card_number text,
  language text,
  condition text,
  grading_company text,
  grading_grade text,
  shipping_fee numeric not null default 0,
  shipping_country text,
  description text,
  verification_code text,
  verification_status text not null default 'pending',
  image_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listing_details enable row level security;

drop policy if exists listing_details_read_own_or_admin on public.listing_details;
create policy listing_details_read_own_or_admin
on public.listing_details for select to authenticated
using (
  exists (
    select 1 from public.seller_profiles sp
    where sp.id = listing_details.seller_id
      and sp.user_id = public.current_user_row_id()
  )
  or exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.role = 'admin'
  )
);

create or replace function public.admin_review_seller_application(
  p_application_id uuid, p_status text, p_note text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_app public.seller_applications%rowtype;
begin
  if not exists (
    select 1 from public.users u
    where u.auth_user_id = auth.uid() and u.role = 'admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  -- "needs_info" is not allowed by the existing status constraint; use "contacted".
  if p_status not in ('approved','rejected','contacted') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into v_app from public.seller_applications
  where id = p_application_id for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if p_status = 'approved' and v_app.user_id is null then
    raise exception 'APPLICATION_NOT_LINKED_TO_ACCOUNT';
  end if;
  if p_status = 'approved' and coalesce(v_app.role,'seller') not in ('seller','agent') then
    raise exception 'INVALID_APPLICATION_ROLE';
  end if;

  update public.seller_applications
  set status = p_status,
      message = case when p_note is null then message
        else left(concat_ws(E'\\n', message, 'Admin note: ' || p_note), 2000) end
  where id = p_application_id;

  -- Only Seller approval creates/promotes a Seller Profile.
  if p_status = 'approved' and coalesce(v_app.role,'seller') = 'seller' then
    insert into public.seller_profiles(user_id,status,verification_status,display_name)
    values(v_app.user_id,'approved','pending',coalesce(v_app.name,'Seller'))
    on conflict(user_id) do update
      set status='approved',
          display_name=coalesce(excluded.display_name,public.seller_profiles.display_name),
          updated_at=now();
  end if;
  return true;
end;
$function$;

create or replace function public.create_seller_listing(
  p_title text, p_price numeric, p_inventory integer, p_set_name text,
  p_card_number text, p_language text, p_condition text,
  p_grading_company text default null, p_grading_grade text default null,
  p_shipping_fee numeric default 0, p_shipping_country text default null,
  p_description text default null, p_verification_code text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid; v_seller uuid; v_listing uuid;
begin
  v_user := public.current_user_row_id();
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select id into v_seller from public.seller_profiles
  where user_id = v_user and status = 'approved' limit 1;
  if v_seller is null then raise exception 'SELLER_NOT_APPROVED'; end if;
  if nullif(trim(coalesce(p_title,'')),'') is null
     or coalesce(p_price,0) <= 0 or coalesce(p_inventory,0) <= 0
     or coalesce(p_shipping_fee,0) < 0 then raise exception 'INVALID_LISTING'; end if;

  insert into public.listings(title,price,currency,inventory,status)
  values(trim(p_title),p_price,'USDT',p_inventory,'pending_review')
  returning id into v_listing;

  insert into public.listing_details(
    listing_id,seller_id,set_name,card_number,language,condition,
    grading_company,grading_grade,shipping_fee,shipping_country,
    description,verification_code,verification_status
  ) values (
    v_listing,v_seller,p_set_name,p_card_number,p_language,p_condition,
    p_grading_company,p_grading_grade,coalesce(p_shipping_fee,0),
    p_shipping_country,p_description,p_verification_code,'pending'
  );
  return v_listing;
end;
$function$;

create or replace function public.admin_get_listing_review_queue(p_limit integer default 50)
returns table(
  listing_id uuid,title text,price numeric,currency text,inventory integer,
  status text,created_at timestamptz,set_name text,card_number text,
  language text,condition text,verification_status text,seller_id uuid,
  seller_display_name text,seller_trust_level text,seller_verification_status text
)
language sql security definer set search_path = ''
as $function$
  select l.id,l.title,l.price,l.currency,l.inventory,l.status,l.created_at,
         d.set_name,d.card_number,d.language,d.condition,d.verification_status,
         d.seller_id,sp.display_name,sp.trust_level,sp.verification_status
  from public.listings l
  join public.listing_details d on d.listing_id=l.id
  left join public.seller_profiles sp on sp.id=d.seller_id
  where exists (select 1 from public.users u
                where u.auth_user_id=auth.uid() and u.role='admin')
    and l.status='pending_review'
  order by l.created_at asc
  limit greatest(coalesce(p_limit,50),1);
$function$;

create or replace function public.admin_review_listing(
  p_listing_id uuid,p_status text,p_note text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_updated integer;
begin
  if not exists (select 1 from public.users u
                 where u.auth_user_id=auth.uid() and u.role='admin')
  then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('active','rejected','suspended') then
    raise exception 'INVALID_STATUS';
  end if;
  update public.listings set status=p_status where id=p_listing_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then return false; end if;
  update public.listing_details
  set verification_status=case when p_status='active' then 'verified' else p_status end,
      description=case when p_note is null then description
        else concat(coalesce(description,''),case when coalesce(description,'')='' then '' else E'\\n' end,'Admin note: ',p_note) end,
      updated_at=now()
  where listing_id=p_listing_id;
  return true;
end;
$function$;

create or replace function public.seller_resubmit_listing(p_listing_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid; v_seller_profile uuid; v_status text;
begin
  v_user := public.current_user_row_id();
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select d.seller_id,l.status into v_seller_profile,v_status
  from public.listing_details d
  join public.listings l on l.id=d.listing_id
  join public.seller_profiles sp on sp.id=d.seller_id
  where d.listing_id=p_listing_id and sp.user_id=v_user;
  if not found then raise exception 'LISTING_NOT_FOUND_OR_NOT_OWNED'; end if;
  if v_status <> 'rejected' then
    raise exception 'ONLY_REJECTED_LISTINGS_CAN_BE_RESUBMITTED';
  end if;
  update public.listings set status='pending_review' where id=p_listing_id;
  update public.listing_details
  set verification_status='pending',updated_at=now()
  where listing_id=p_listing_id;
  return jsonb_build_object('listing_id',p_listing_id,
    'seller_profile_id',v_seller_profile,'status','pending_review');
end;
$function$;

revoke all on function public.admin_review_seller_application(uuid,text,text) from public, anon;
revoke all on function public.create_seller_listing(text,numeric,integer,text,text,text,text,text,text,numeric,text,text,text) from public, anon;
revoke all on function public.admin_get_listing_review_queue(integer) from public, anon;
revoke all on function public.admin_review_listing(uuid,text,text) from public, anon;
revoke all on function public.seller_resubmit_listing(uuid) from public, anon;

grant execute on function public.admin_review_seller_application(uuid,text,text) to authenticated, service_role;
grant execute on function public.create_seller_listing(text,numeric,integer,text,text,text,text,text,text,numeric,text,text,text) to authenticated, service_role;
grant execute on function public.admin_get_listing_review_queue(integer) to authenticated, service_role;
grant execute on function public.admin_review_listing(uuid,text,text) to authenticated, service_role;
grant execute on function public.seller_resubmit_listing(uuid) to authenticated, service_role;
