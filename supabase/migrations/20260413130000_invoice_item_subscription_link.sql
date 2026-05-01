-- Bidirectional link between invoice_items and subscription_items.
--
-- PR #23 stored the link only on subscription_items.source_invoice_item_id,
-- which works for invoices created by the NewInvoice "Fatura recorrente"
-- flow but leaves cron-generated invoices unlinked: the cron creates the
-- invoice from the subscription, so there's no obvious slot on a
-- subscription_item to back-reference the cron-issued invoice line.
--
-- That made invoice → subscription sync silently no-op for any invoice the
-- cron had generated (the common case for users who created their
-- subscription first and only edited the auto-generated invoice afterwards).
--
-- Fix: store the canonical link on invoice_items.source_subscription_item_id
-- and have both NewInvoice and the cron populate it. The frontend sync
-- hooks read this column from now on.

alter table public.invoice_items
  add column if not exists source_subscription_item_id uuid;

do $$
begin
  alter table public.invoice_items
    add constraint invoice_items_source_subscription_item_fk
    foreign key (source_subscription_item_id)
    references public.subscription_items(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_invoice_items_source_subscription
  on public.invoice_items (source_subscription_item_id)
  where source_subscription_item_id is not null;

-- Backfill #1: rows already linked from the subscription_items side
-- (NewInvoice flow, post PR #23). One direction copied to the other.
update public.invoice_items ii
   set source_subscription_item_id = si.id
  from public.subscription_items si
 where si.source_invoice_item_id = ii.id
   and ii.source_subscription_item_id is null;

-- Backfill #2: cron-generated invoices. The cron writes one invoice per
-- subscription with `subscription_id` set on the invoice and one
-- invoice_item per recurring/addon subscription_item, keeping `position`
-- aligned across both. Match on (subscription_id, position) to recover
-- the link for everything generated before this migration.
with paired as (
  select ii.id as invoice_item_id, si.id as sub_item_id
    from public.invoice_items ii
    join public.invoices inv on inv.id = ii.invoice_id
    join public.subscription_items si
      on si.subscription_id = inv.subscription_id
     and si.kind in ('recurring', 'addon')
     and si.position = ii.position
   where inv.subscription_id is not null
     and ii.source_subscription_item_id is null
)
update public.invoice_items ii
   set source_subscription_item_id = paired.sub_item_id
  from paired
 where ii.id = paired.invoice_item_id;

-- Re-create the cron's generator with the same body as
-- 20260413120000_soft_delete.sql, but threading
-- `source_subscription_item_id = item.id` through every insert into
-- invoice_items. From now on the cron emits already-linked rows.
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
      insert into public.invoice_items (invoice_id, description, quantity, unit_price, position, source_subscription_item_id)
      values (
        new_invoice_id,
        item.description || ' — ' || period_label,
        1,
        round(item.amount::numeric, 2),
        item.position,
        item.id
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
        insert into public.invoice_items (invoice_id, description, quantity, unit_price, position, source_subscription_item_id)
        values (
          new_invoice_id,
          item.description || ' (setup)',
          1,
          item.amount,
          1000 + item.position,
          item.id
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
