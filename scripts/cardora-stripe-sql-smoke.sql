-- Temporary PostgreSQL 17 only. Synthetic fixtures. NEVER run against Supabase.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.seller_profiles (
 id uuid PRIMARY KEY,
 status text NOT NULL,
 verification_status text NOT NULL
);
CREATE TABLE public.seller_subscription_plans (
 code text PRIMARY KEY,
 tier_code text NOT NULL,
 billing_currency text NOT NULL,
 is_active boolean NOT NULL,
 review_mode text,
 included_human_reviews integer NOT NULL DEFAULT 0
);
CREATE TABLE public.seller_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 seller_profile_id uuid NOT NULL REFERENCES public.seller_profiles(id),
 plan_code text NOT NULL REFERENCES public.seller_subscription_plans(code),
 status text NOT NULL,
 is_current boolean NOT NULL DEFAULT true,
 started_at timestamptz,
 current_period_starts_at timestamptz,
 current_period_ends_at timestamptz,
 current_review_mode text,
 human_review_allowance integer,
 grace_ends_at timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.seller_profiles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','approved','verified'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','pending','unverified');
INSERT INTO public.seller_subscription_plans VALUES
 ('basic','basic','MYR',true,'ai',0),
 ('pro','pro','MYR',true,'human',5),
 ('business','business','MYR',true,'human',20);
COMMIT;
\i supabase/migrations/DRAFT_cardora_stripe_subscription_schema.sql

DO $test$
DECLARE
  rid uuid;
  rid_repeat uuid;
  denied boolean := false;
  applied boolean;
BEGIN
  rid := public.cardora_reserve_stripe_checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic');
  rid_repeat := public.cardora_reserve_stripe_checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic');
  IF rid IS NULL OR rid<>rid_repeat THEN RAISE EXCEPTION 'Reservation idempotency failed'; END IF;
  BEGIN
    PERFORM public.cardora_reserve_stripe_checkout('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','basic');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unapproved seller accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.cardora_reserve_stripe_checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pro');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Concurrent tier change accepted'; END IF;
  SELECT public.cardora_apply_verified_stripe_event(
    'evt_testpaid001','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001','2026-11-24T00:00:00Z','2026-12-24T00:00:00Z',
    rid,1795478400) INTO applied;
  IF NOT applied OR NOT EXISTS(
    SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND plan_code='basic' AND status='active' AND is_current
  ) THEN RAISE EXCEPTION 'Paid membership not activated'; END IF;
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_testpaid001','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001','2026-11-24T00:00:00Z','2026-12-24T00:00:00Z',
    rid,1795478400);
  IF (SELECT count(*) FROM public.seller_subscriptions
      WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1
     OR (SELECT count(*) FROM public.cardora_stripe_event_receipts)<>1
  THEN RAISE EXCEPTION 'Duplicate webhook mutated membership'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.cardora_apply_verified_stripe_event(
      'evt_wrongowner1','paid','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','basic',
      'cus_test001','sub_test001','2026-11-24T00:00:00Z','2026-12-24T00:00:00Z',
      rid,1795478401);
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Wrong owner accepted'; END IF;
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_testcancel1','canceled','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001',NULL,NULL,rid,1795478500);
  IF EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND is_current)
    THEN RAISE EXCEPTION 'Cancel failed to revoke active subscription'; END IF;
  RAISE NOTICE 'PASS: reservation dedup, seller eligibility, paid entitlement, duplicate event, wrong owner, cancel';
END
$test$;
