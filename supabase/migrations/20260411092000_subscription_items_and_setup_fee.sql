-- Subscription items: a subscription can contain multiple billable lines
-- (e.g. recurring monthly fee + one-off setup fee + add-ons). Each line knows
-- whether it is recurring or one-off (setup) and, for one-off lines, whether
-- it has already been invoiced.

create type public.subscription_item_kind as enum ('recurring', 'setup', 'addon');

create table public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  description text not null,
  kind public.subscription_item_kind not null default 'recurring',
  amount numeric(10,2) not null default 0,
  category_id uuid references public.service_categories(id) on delete set null,
  invoiced_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index subscription_items_subscription_id_idx on public.subscription_items(subscription_id);

alter table public.subscription_items enable row level security;
create policy "Authenticated full access" on public.subscription_items for all to authenticated using (true) with check (true);

-- Backfill: convert each existing subscription's `amount` into a single
-- recurring item so the new model is consistent from day one.
insert into public.subscription_items (subscription_id, description, kind, amount, category_id, position)
select s.id, s.name, 'recurring'::public.subscription_item_kind, s.amount, s.category_id, 0
from public.subscriptions s
where not exists (
  select 1 from public.subscription_items si where si.subscription_id = s.id
);

-- Pro-rata flag: when true, the very first invoice generated for a new
-- subscription that starts mid-period gets its recurring lines reduced
-- proportionally to the remaining days.
alter table public.subscriptions
  add column prorate_first_invoice boolean not null default false,
  add column first_invoice_generated_at timestamptz;
