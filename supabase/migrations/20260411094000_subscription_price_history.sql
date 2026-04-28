-- Price history: every change to a subscription_item's `amount` is recorded
-- as a closed range (valid_from / valid_to). The current price is the row
-- with valid_to is null.

create table public.subscription_price_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  subscription_item_id uuid references public.subscription_items(id) on delete set null,
  amount numeric(10,2) not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  reason text
);

create index subscription_price_history_subscription_id_idx on public.subscription_price_history(subscription_id);
create index subscription_price_history_open_range_idx on public.subscription_price_history(subscription_item_id) where valid_to is null;

alter table public.subscription_price_history enable row level security;
create policy "Authenticated full access" on public.subscription_price_history for all to authenticated using (true) with check (true);

-- Seed: open price-history row per existing subscription_item.
insert into public.subscription_price_history (subscription_id, subscription_item_id, amount, valid_from, reason)
select si.subscription_id, si.id, si.amount, coalesce(s.start_date::timestamptz, now()), 'initial'
from public.subscription_items si
join public.subscriptions s on s.id = si.subscription_id
where not exists (
  select 1 from public.subscription_price_history h
  where h.subscription_item_id = si.id and h.valid_to is null
);

-- Trigger: when subscription_items.amount changes, close the open range and
-- open a new one.
create or replace function public.subscription_item_price_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.subscription_price_history (subscription_id, subscription_item_id, amount, valid_from, reason)
    values (new.subscription_id, new.id, new.amount, now(), 'created');
    return new;
  end if;

  if tg_op = 'UPDATE' and new.amount is distinct from old.amount then
    update public.subscription_price_history
       set valid_to = now()
     where subscription_item_id = new.id
       and valid_to is null;
    insert into public.subscription_price_history (subscription_id, subscription_item_id, amount, valid_from, reason)
    values (new.subscription_id, new.id, new.amount, now(), 'price_change');
  end if;

  return new;
end;
$$;

drop trigger if exists subscription_item_price_change on public.subscription_items;
create trigger subscription_item_price_change
after insert or update on public.subscription_items
for each row execute function public.subscription_item_price_change();
