-- Make Georgia invoice soft deletion reliable on databases where the
-- original policies were already applied before the soft-delete change.
-- The RPC is deliberately SECURITY DEFINER so the row remains addressable
-- even though the SELECT policy hides deleted invoices immediately.

drop policy if exists "Users can view their own Georgia invoices" on public.georgia_invoices;
drop policy if exists "Users can insert their own Georgia invoices" on public.georgia_invoices;
drop policy if exists "Users can update their own Georgia invoices" on public.georgia_invoices;
drop policy if exists "Users can delete their own Georgia invoices" on public.georgia_invoices;

create policy "Users can view their own active Georgia invoices"
  on public.georgia_invoices
  for select
  using (auth.uid() = user_id and deleted_at is null);

create policy "Users can insert their own Georgia invoices"
  on public.georgia_invoices
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own Georgia invoices"
  on public.georgia_invoices
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own Georgia invoices"
  on public.georgia_invoices
  for delete
  using (auth.uid() = user_id);

create or replace function public.soft_delete_georgia_invoice(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.georgia_invoices
  set deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = p_invoice_id
    and user_id = auth.uid()
    and deleted_at is null;

  return found;
end;
$$;

revoke all on function public.soft_delete_georgia_invoice(uuid) from public, anon;
grant execute on function public.soft_delete_georgia_invoice(uuid) to authenticated;
