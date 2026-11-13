grant select,insert,update on public.seller_subscription_payment_intents to service_role;
revoke all on public.seller_subscription_payment_intents from public,anon,authenticated;