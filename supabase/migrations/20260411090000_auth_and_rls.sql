-- Lock down all RLS policies. Replace the original "Public *" policies (which
-- allowed unauthenticated read/write to every table) with policies scoped to
-- authenticated users.
--
-- Auth itself is provided by Supabase GoTrue. In a self-hosted deployment with
-- DISABLE_SIGNUP=true, the operator creates users via the Studio dashboard.

-- Helper: drop every existing policy on a table, then add a single
-- "authenticated full access" policy. We intentionally do not split read/write
-- because every existing policy was identical (`true`) — there is no notion of
-- per-row ownership yet, and adding one is out of scope.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'clients', 'invoices', 'invoice_items', 'subscriptions',
        'payments', 'services', 'service_categories'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end$$;

create policy "Authenticated full access" on public.clients            for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.invoices           for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.invoice_items      for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.subscriptions      for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.payments           for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.services           for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on public.service_categories for all to authenticated using (true) with check (true);
