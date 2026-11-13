-- Cardora Staging only
-- Migration: 20261113_fix_seller_listing_currency_usd
-- Corrects the listing creation routine to use the platform's confirmed listing denomination.
-- Existing rows are not modified. Production must remain untouched.

create or replace function public.create_seller_listing(
  p_title text,
  p_price numeric,
  p_inventory integer,
  p_set_name text,
  p_card_number text,
  p_language text,
  p_condition text,
  p_grading_company text default null,
  p_grading_grade text default null,
  p_shipping_fee numeric default 0,
  p_shipping_country text default null,
  p_description text default null,
  p_verification_code text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid;
  v_seller uuid;
  v_listing uuid;
begin
  v_user := public.current_user_row_id();
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select id into v_seller
  from public.seller_profiles
  where user_id = v_user and status = 'approved'
  limit 1;
  if v_seller is null then raise exception 'SELLER_NOT_APPROVED'; end if;

  if nullif(trim(coalesce(p_title,'')),'') is null
     or coalesce(p_price,0) <= 0
     or coalesce(p_inventory,0) <= 0
     or coalesce(p_shipping_fee,0) < 0 then
    raise exception 'INVALID_LISTING';
  end if;

  insert into public.listings(title,price,currency,inventory,status)
  values(trim(p_title),p_price,'USD',p_inventory,'pending_review')
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
