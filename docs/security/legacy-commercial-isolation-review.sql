-- REVIEW ONLY. Apply in production only after explicit approval and fresh preflight.
-- Keep original function bodies, owners, service_role access and all historical records.
begin;
revoke execute on function public.admin_get_listing_review_queue(integer) from public, anon, authenticated;
revoke execute on function public.admin_review_listing(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.admin_review_seller_application(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.seller_subscription_summary() from public, anon, authenticated;
do $$
declare f regprocedure;
begin
 foreach f in array array['public.admin_get_listing_review_queue(integer)'::regprocedure,'public.admin_review_listing(uuid,text,text)'::regprocedure,'public.admin_review_seller_application(uuid,text,text)'::regprocedure,'public.seller_subscription_summary()'::regprocedure] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE') then
   raise exception 'Unexpected inherited client EXECUTE: %',f;
  end if;
  if not has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'Unexpected service role loss: %',f;
  end if;
 end loop;
end $$;
commit;
