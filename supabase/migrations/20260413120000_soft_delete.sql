-- Soft-delete with cascade on the four user-owned tables.
--
-- Why soft-delete:
--   * Portuguese tax law (and good practice for any billing app) requires
--     keeping invoice records for years. Hard deletes via FK CASCADE
--     destroy that audit trail and have already caused some "I deleted
--     the wrong client" near-misses for this user.
--   * Restoring a soft-deleted row is a single UPDATE; restoring after a
--     hard delete is impossible without a backup.
--
-- Cascade semantics (chosen by the user):
--   * Soft-deleting a client also hides every related invoice,
--     subscription and payment (option "b"). UI looks clean, but the
--     data is still on disk in /lixo for review/restore.
--   * To support clean restore-only-what-we-cascaded behaviour, the
--     trigger uses the parent's deleted_at timestamp as the cascade
--     marker. On restore we only un-delete children whose deleted_at
--     matches exactly — i.e. those that were deleted *as part of*
--     deleting the client, not those that the user had already deleted
--     individually before.
--   * Purge (hard delete) is never automatic; it has to be triggered
--     explicitly from the new /lixo page.

-- 1. Add deleted_at to the four tables.
alter table public.clients       add column if not exists deleted_at timestamptz;
alter table public.invoices      add column if not exists deleted_at timestamptz;
alter table public.subscriptions add column if not exists deleted_at timestamptz;
alter table public.payments      add column if not exists deleted_at timestamptz;

-- 2. Partial indexes accelerate the "active rows only" queries that the
--    frontend now does on every list view. The `deleted_at is null`
--    predicate matches the WHERE clause exactly so the planner can use
--    these as covering filters.
create index if not exists idx_clients_active       on public.clients       (created_at desc) where deleted_at is null;
create index if not exists idx_invoices_active      on public.invoices      (created_at desc) where deleted_at is null;
create index if not exists idx_subscriptions_active on public.subscriptions (created_at desc) where deleted_at is null;
create index if not exists idx_payments_active      on public.payments      (date         desc) where deleted_at is null;

-- 3. Cascade trigger on clients.
--
-- We match children by parent's deleted_at *value* so that:
--   * Marking a client deleted only cascades to children that are
--     currently active (deleted_at is null). Children the user had
--     already deleted manually are left alone.
--   * Restoring a client only un-deletes children whose deleted_at
--     equals the client's previous deleted_at — i.e. the rows the
--     trigger itself deleted, not unrelated soft-deletes.
create or replace function public.cascade_soft_delete_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Soft-delete: child rows currently active take the parent's timestamp.
  if new.deleted_at is not null and old.deleted_at is null then
    update public.invoices
       set deleted_at = new.deleted_at
     where client_id = new.id
       and deleted_at is null;

    update public.subscriptions
       set deleted_at = new.deleted_at
     where client_id = new.id
       and deleted_at is null;

    update public.payments
       set deleted_at = new.deleted_at
     where client_id = new.id
       and deleted_at is null;

  -- Restore: only un-delete children whose deleted_at matches what the
  -- parent's was when it got soft-deleted. Children deleted at a
  -- different time stay deleted.
  elsif new.deleted_at is null and old.deleted_at is not null then
    update public.invoices
       set deleted_at = null
     where client_id = new.id
       and deleted_at = old.deleted_at;

    update public.subscriptions
       set deleted_at = null
     where client_id = new.id
       and deleted_at = old.deleted_at;

    update public.payments
       set deleted_at = null
     where client_id = new.id
       and deleted_at = old.deleted_at;
  end if;

  return new;
end;
$$;

drop trigger if exists cascade_soft_delete_client_trg on public.clients;
create trigger cascade_soft_delete_client_trg
after update of deleted_at on public.clients
for each row
execute function public.cascade_soft_delete_client();

-- 4. The cron-driven invoice generator must skip soft-deleted
--    subscriptions, otherwise pausing-via-soft-delete would still
--    generate a new invoice tomorrow morning. Re-create with the same
--    body as 20260413110000_*, only adding `and deleted_at is null` to
--    the FOR loop's WHERE clause.
create or replace function public.generate_subscription_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  item record;
  today date := current_date;
  invoice_number text;
  due_date date;
  new_invoice_id uuid;
  is_first_invoice boolean;
  generated_count integer := 0;
  pt_months text[] := array[
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
  ];
  period_label text;
  has_any_items boolean;
begin
  for sub in
    select *
    from public.subscriptions
    where status = 'active'
      and next_billing_date <= today
      and deleted_at is null
    order by next_billing_date
    for update skip locked
  loop
    is_first_invoice := sub.first_invoice_generated_at is null;

    select count(*) > 0 into has_any_items
    from public.subscription_items
    where subscription_id = sub.id
      and kind in ('recurring', 'addon');

    invoice_number := public.next_invoice_number(extract(year from today)::int);
    due_date := today + interval '30 days';
    period_label := pt_months[extract(month from sub.next_billing_date)::int]
                  || ' ' || extract(year from sub.next_billing_date)::text;

    insert into public.invoices (number, client_id, subscription_id, status, issue_date, due_date, notes)
    values (invoice_number, sub.client_id, sub.id, 'pending', today, due_date,
            'Fatura gerada automaticamente da subscrição: ' || sub.name)
    returning id into new_invoice_id;

    for item in
      select * from public.subscription_items
      where subscription_id = sub.id
        and kind in ('recurring', 'addon')
      order by position, created_at
    loop
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
      values (
        new_invoice_id,
        item.description || ' — ' || period_label,
        1,
        round(item.amount::numeric, 2),
        item.position
      );
    end loop;

    if not has_any_items then
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
      values (
        new_invoice_id,
        sub.name || ' — ' || period_label,
        1,
        round(coalesce(sub.amount, 0)::numeric, 2),
        0
      );
    end if;

    if is_first_invoice then
      for item in
        select * from public.subscription_items
        where subscription_id = sub.id
          and kind = 'setup'
          and invoiced_at is null
        order by position, created_at
      loop
        insert into public.invoice_items (invoice_id, description, quantity, unit_price, position)
        values (
          new_invoice_id,
          item.description || ' (setup)',
          1,
          item.amount,
          1000 + item.position
        );
        update public.subscription_items set invoiced_at = now() where id = item.id;
      end loop;
    end if;

    update public.subscriptions
    set next_billing_date = case sub.frequency
                              when 'weekly'     then sub.next_billing_date + interval '1 week'
                              when 'biweekly'   then sub.next_billing_date + interval '2 weeks'
                              when 'monthly'    then sub.next_billing_date + interval '1 month'
                              when 'bimonthly'  then sub.next_billing_date + interval '2 months'
                              when 'quarterly'  then sub.next_billing_date + interval '3 months'
                              when 'semiannual' then sub.next_billing_date + interval '6 months'
                              when 'yearly'     then sub.next_billing_date + interval '1 year'
                              when 'biannual'   then sub.next_billing_date + interval '2 years'
                            end::date,
        first_invoice_generated_at = coalesce(first_invoice_generated_at, now())
    where id = sub.id;

    generated_count := generated_count + 1;
  end loop;

  return generated_count;
end;
$$;

revoke all on function public.generate_subscription_invoices() from public, anon;
grant execute on function public.generate_subscription_invoices() to authenticated, service_role;
