-- CARDORA STAGING DRAFT ONLY. REVIEW before applying; do not run in production.
-- Frontend compatibility with existing rpc('is_admin') calls.
-- New Cardora admin authority is public.users.role, NOT legacy public.admin_users.
-- No permissions are granted based on email or user-editable metadata.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1 from public.users u
       where u.auth_user_id = (select auth.uid())
         and u.role = 'admin'
         and u.status = 'active'
     );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- Staging checks after applying (read-only):
-- SELECT has_function_privilege('authenticated','public.is_admin()','EXECUTE');
-- SELECT has_function_privilege('anon','public.is_admin()','EXECUTE');
-- Confirm anonymous returns false; normal signed-in user returns false;
-- known administrator signed in returns true; review server-side RPC guards.
