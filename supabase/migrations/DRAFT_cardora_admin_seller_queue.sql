-- DRAFT ONLY. Apply to a disposable staging database after reviewed backup.
-- Narrow admin-only read interface; do not loosen seller_applications RLS.
create or replace function public.admin_get_seller_application_queue(p_limit integer default 100)
returns table (
 id uuid,created_at timestamptz,name text,email text,whatsapp text,
 city text,role text,shop_links text,card_count integer,
 categories text,monthly_volume text,message text,status text
)
language sql stable security definer set search_path=''
as $cardora_admin_queue$
  select a.id,a.created_at,a.name,a.email,a.whatsapp,a.city,a.role,
         a.shop_links,a.card_count,a.categories,a.monthly_volume,
         a.message,a.status
  from public.seller_applications a
  where exists (
    select 1 from public.users u
    where u.auth_user_id=(select auth.uid())
      and u.role='admin' and u.status='active'
  )
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$cardora_admin_queue$;
revoke all on function public.admin_get_seller_application_queue(integer)
  from public,anon,authenticated;
grant execute on function public.admin_get_seller_application_queue(integer)
  to authenticated;
-- Requires logged-in admin and row-level authorization tests in staging.
