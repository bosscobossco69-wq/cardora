-- Existing approved Staging sellers receive the Free tier if they do not yet have a current subscription.
-- This does not create a payment, charge, or paid entitlement.
insert into public.seller_subscriptions(seller_profile_id,plan_code,status,started_at,is_current)
select sp.id,'free','active',now(),true
from public.seller_profiles sp
where sp.status='approved'
  and not exists (
    select 1 from public.seller_subscriptions ss
    where ss.seller_profile_id=sp.id and ss.is_current=true
  )
on conflict (seller_profile_id) where is_current do nothing;