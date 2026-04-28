-- Replace the boolean `active` flag on subscriptions with a richer status enum
-- and a `paused_until` date so a subscription can be paused with a scheduled
-- automatic reactivation.

create type public.subscription_status as enum ('active', 'paused', 'cancelled');

alter table public.subscriptions
  add column status public.subscription_status not null default 'active',
  add column paused_until date;

-- Backfill from the existing `active` flag so no data is lost.
update public.subscriptions set status = case when active then 'active'::public.subscription_status else 'paused'::public.subscription_status end;

-- Keep `active` for backwards compatibility with any existing client code that
-- still reads it, but make it a generated column so it can never drift from
-- `status`.
alter table public.subscriptions drop column active;
alter table public.subscriptions
  add column active boolean generated always as (status = 'active') stored;

-- pg_cron job: every day at 03:15, reactivate subscriptions whose pause window
-- has elapsed. pg_cron is already enabled by an earlier migration.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('reactivate-paused-subscriptions') from cron.job where jobname = 'reactivate-paused-subscriptions';
    perform cron.schedule(
      'reactivate-paused-subscriptions',
      '15 3 * * *',
      $cron$
        update public.subscriptions
        set status = 'active', paused_until = null
        where status = 'paused'
          and paused_until is not null
          and paused_until <= current_date;
      $cron$
    );
  end if;
end$$;
