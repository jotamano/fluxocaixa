-- Daily cron job: hard-delete any soft-deleted row older than 90 days.
--
-- Rationale:
--   * /lixo is a safety net, not permanent storage. Letting deleted
--     rows accumulate forever both clutters the UI ("100s of restored
--     candidates") and grows the DB unnecessarily.
--   * 90 days lines up with what the user asked for ("o lixo passa a
--     ser eliminado automaticamente passado 90 dias"). It's also long
--     enough that an accidental delete on Friday is recoverable when
--     the operator returns from holiday three months later.
--   * The audit_log retains the full history of what was deleted, so
--     even after the row is purged we can still answer "did invoice
--     FT 2025/042 ever exist?".
--
-- Order: payments first (FK to invoices), then invoices (FK to
-- subscriptions/clients), then subscriptions (FK to clients), then
-- clients last. Within each table we only delete rows that are STILL
-- soft-deleted, so a row that was restored stays around.

create or replace function public.purge_old_trash()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '90 days';
  total integer := 0;
  c integer;
begin
  delete from public.payments
   where deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; total := total + c;

  -- invoice_items have ON DELETE CASCADE on invoice_id, so deleting
  -- the invoice cleans them up automatically. invoice_items don't
  -- carry their own deleted_at column.
  delete from public.invoices
   where deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; total := total + c;

  -- subscription_items cascade via FK on subscription_id.
  delete from public.subscriptions
   where deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; total := total + c;

  delete from public.clients
   where deleted_at is not null and deleted_at < cutoff;
  get diagnostics c = row_count; total := total + c;

  return total;
end;
$$;

revoke all on function public.purge_old_trash() from public, anon;
grant execute on function public.purge_old_trash() to authenticated, service_role;

-- Schedule daily at 04:00 UTC, after the daily invoice generation
-- (03:30) and the subscription reactivation job (03:15). Keeps purge
-- effects out of the morning's invoice run.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-old-trash')
      from cron.job where jobname = 'purge-old-trash';
    perform cron.schedule(
      'purge-old-trash',
      '0 4 * * *',
      $cron$ select public.purge_old_trash(); $cron$
    );
  end if;
end$$;
