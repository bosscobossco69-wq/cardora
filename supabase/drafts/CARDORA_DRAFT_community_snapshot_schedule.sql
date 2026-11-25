-- DRAFT ONLY; run only following explicit production approval and backup/recovery review.
-- Prerequisites: community snapshot migration already applied and pg_cron enabled.
-- No network requests, no paid service, no changes to Auth or payments.
begin;
do $$
begin
 if not exists (select 1 from pg_extension where extname='pg_cron') then
   raise exception 'pg_cron not enabled; review and enable separately';
 end if;
 if to_regprocedure('cardora_metrics_private.refresh_community_snapshot()') is null then
   raise exception 'snapshot refresh function missing';
 end if;
 if exists(select 1 from cron.job where jobname='cardora-community-snapshot-v1') then
   raise exception 'existing named cron job; inspect before scheduling';
 end if;
end $$;
select cardora_metrics_private.refresh_community_snapshot();
select cron.schedule('cardora-community-snapshot-v1','*/5 * * * *',
  'select cardora_metrics_private.refresh_community_snapshot();');
commit;
-- Read-back: inspect cron.job and cron.job_run_details for the named job.
-- Stop only this job if needed: select cron.unschedule('cardora-community-snapshot-v1');
-- Revoke anon/authenticated SELECT on public.cardora_community_snapshot to disable public counts.
