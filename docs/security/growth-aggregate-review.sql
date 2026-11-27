-- REVIEW ONLY: no production application until separate approval.
-- Aggregate opt-in browser signals, NOT unique visitors or authoritative signups.
begin;
create schema cardora_growth_private;
revoke all on schema cardora_growth_private from public,anon,authenticated;
grant usage on schema cardora_growth_private to anon,authenticated;
create table public.cardora_growth_counts(
 day_myt date not null,
 source text not null check(source in ('facebook','tiktok','google','direct','other')),
 event text not null check(event in ('page_home','page_join','join_click','signup_submit','signup_response_ok','signup_failed','email_verified','seller_interest','partner_interest')),
 hits integer not null check(hits between 1 and 5000),
 primary key(day_myt,source,event)
);
alter table public.cardora_growth_counts enable row level security;
alter table public.cardora_growth_counts force row level security;
revoke all on public.cardora_growth_counts from public,anon,authenticated;
grant select on public.cardora_growth_counts to authenticated;
create policy growth_admin_read on public.cardora_growth_counts for select to authenticated
using ((select cardora_launch_private.is_active_verified_admin()));
create function cardora_growth_private.record_signal(p_event text,p_source text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare d date := (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date;
begin
 if p_event is null or p_source is null or p_event not in ('page_home','page_join','join_click','signup_submit','signup_response_ok','signup_failed','email_verified','seller_interest','partner_interest') or p_source not in ('facebook','tiktok','google','direct','other') then return false; end if;
 -- Bounded aggregate storage: at most 45 buckets/day, 30-day rolling window, 5000 accepted hits/day.
 -- This is a global abuse ceiling, not a per-person identity or proof of a genuine visitor.
 if not pg_catalog.pg_try_advisory_xact_lock(174296211,1) then return false; end if;
 delete from public.cardora_growth_counts where day_myt < d-29;
 if (select coalesce(sum(hits),0) from public.cardora_growth_counts where day_myt=d)>=5000 then return false; end if;
 insert into public.cardora_growth_counts(day_myt,source,event,hits) values(d,p_source,p_event,1)
 on conflict(day_myt,source,event) do update set hits=public.cardora_growth_counts.hits+1;
 return true;
end $$;
revoke all on function cardora_growth_private.record_signal(text,text) from public,anon,authenticated;
grant execute on function cardora_growth_private.record_signal(text,text) to anon,authenticated;
create function public.cardora_record_growth_event(p_event text,p_source text)
returns boolean language sql security invoker set search_path=''
as $$select cardora_growth_private.record_signal(p_event,p_source)$$;
revoke all on function public.cardora_record_growth_event(text,text) from public,anon,authenticated;
grant execute on function public.cardora_record_growth_event(text,text) to anon,authenticated;
commit;
