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
\i supabase/migrations/DRAFT_cardora_payment_email_outbox.sql

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
  -- Old out-of-order failed invoices must not downgrade current paid membership.
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_stalefailure1','past_due','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001',NULL,NULL,rid,1795478300);
  IF NOT EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND status='active' AND is_current)
    THEN RAISE EXCEPTION 'Stale failure downgraded paid membership'; END IF;
  -- A verified renewal for an extended paid period advances the entitlement exactly once.
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_renewal001','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001','2026-12-24T00:00:00Z','2027-01-24T00:00:00Z',
    rid,1795478450);
  IF NOT EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND status='active' AND is_current
      AND current_period_ends_at='2027-01-24T00:00:00Z'::timestamptz)
    THEN RAISE EXCEPTION 'Verified renewal failed to extend entitlement'; END IF;
  -- A failed invoice can mark current membership past_due. A subsequent
  -- verified payment for the SAME billed period must restore active access,
  -- not be skipped simply because the period end is unchanged.
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_recoveryfail001','past_due','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001',NULL,NULL,rid,1795478460);
  IF NOT EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND status='past_due' AND is_current
      AND current_period_ends_at='2027-01-24T00:00:00Z'::timestamptz)
    THEN RAISE EXCEPTION 'Expected past_due state not applied'; END IF;
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_recoverpaid001','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001','2026-12-24T00:00:00Z','2027-01-24T00:00:00Z',
    rid,1795478470);
  IF NOT EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND status='active' AND is_current
      AND current_period_ends_at='2027-01-24T00:00:00Z'::timestamptz)
    THEN RAISE EXCEPTION 'Same-period paid invoice failed to restore active membership'; END IF;
  -- An older invoice must not shorten an already-recovered membership period.
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_oldpaidafterrecover001','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001','2026-11-24T00:00:00Z','2026-12-24T00:00:00Z',
    rid,1795478480);
  IF NOT EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND status='active' AND is_current
      AND current_period_ends_at='2027-01-24T00:00:00Z'::timestamptz)
    THEN RAISE EXCEPTION 'Historical payment reduced active membership period'; END IF;
  -- Paid invoice email queued only after membership verified; retries never duplicate.
  PERFORM public.cardora_queue_verified_payment_email(
    'in_testpaid001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'sub_test001','basic','2027-01-24T00:00:00Z');
  PERFORM public.cardora_queue_verified_payment_email(
    'in_testpaid001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'sub_test001','basic','2027-01-24T00:00:00Z');
  IF (SELECT count(*) FROM public.cardora_payment_email_outbox)<>1
    THEN RAISE EXCEPTION 'Duplicate invoice email queued'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.cardora_queue_verified_payment_email(
      'in_wrongowner1','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'sub_test001','basic','2027-01-24T00:00:00Z');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Wrong seller email queue accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.cardora_queue_verified_payment_email(
      'in_wrongperiod1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'sub_test001','basic','2027-03-24T00:00:00Z');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Unpaid future period email queued'; END IF;
  -- One seller cannot swap the Stripe customer ID of an existing subscription.
  denied:=false;
  BEGIN
    PERFORM public.cardora_apply_verified_stripe_event(
      'evt_wrongcustomer1','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
      'cus_wrong002','sub_test001','2027-01-24T00:00:00Z','2027-02-24T00:00:00Z',
      rid,1795478460);
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Wrong Stripe customer accepted'; END IF;
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_testcancel1','canceled','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001',NULL,NULL,rid,1795478500);
  IF EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND is_current)
    THEN RAISE EXCEPTION 'Cancel failed to revoke active subscription'; END IF;
  -- An older late webhook after cancellation must not reactivate access.
  PERFORM public.cardora_apply_verified_stripe_event(
    'evt_stalepaidaftercancel1','paid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','basic',
    'cus_test001','sub_test001','2026-12-24T00:00:00Z','2027-01-24T00:00:00Z',
    rid,1795478420);
  IF EXISTS(SELECT 1 FROM public.seller_subscriptions
    WHERE seller_profile_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND is_current)
    THEN RAISE EXCEPTION 'Late stale paid event reactivated canceled membership'; END IF;

  RAISE NOTICE 'PASS: reservation dedup, eligibility, paid entitlement, duplicate event, wrong owner/customer, stale failure, renewal, same-period recovery, historical invoice rejection, cancel, late paid replay, deduplicated invoice email outbox';
END
$test$;
