-- Trash management for Georgia invoices. Normal SELECT intentionally hides
-- soft-deleted rows, so the trash page uses these owner-scoped RPCs instead.

create or replace function public.list_trashed_georgia_invoices()
returns setof public.georgia_invoices
language sql
security definer
set search_path = public
as $$
  select gi.*
  from public.georgia_invoices gi
  where gi.user_id = auth.uid()
    and gi.deleted_at is not null
  order by gi.deleted_at desc;
$$;

create or replace function public.restore_georgia_invoice(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.georgia_invoices
  set deleted_at = null,
      updated_at = now()
  where id = p_invoice_id
    and user_id = auth.uid()
    and deleted_at is not null;
  return found;
end;
$$;

create or replace function public.purge_georgia_invoice(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.georgia_invoices
  where id = p_invoice_id
    and user_id = auth.uid()
    and deleted_at is not null;
  return found;
end;
$$;

revoke all on function public.list_trashed_georgia_invoices() from public, anon;
revoke all on function public.restore_georgia_invoice(uuid) from public, anon;
revoke all on function public.purge_georgia_invoice(uuid) from public, anon;
grant execute on function public.list_trashed_georgia_invoices() to authenticated;
grant execute on function public.restore_georgia_invoice(uuid) to authenticated;
grant execute on function public.purge_georgia_invoice(uuid) to authenticated;
