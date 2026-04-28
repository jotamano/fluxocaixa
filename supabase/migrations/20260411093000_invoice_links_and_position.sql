-- Link invoices back to the subscription that generated them (nullable for
-- standalone invoices). Plus add a stable `position` to invoice_items so the
-- UI can drag-drop reorder.

alter table public.invoices
  add column subscription_id uuid references public.subscriptions(id) on delete set null;

create index invoices_subscription_id_idx on public.invoices(subscription_id);

alter table public.invoice_items
  add column position integer not null default 0;

-- Backfill positions in insertion order so existing invoices keep their layout.
with ordered as (
  select id, row_number() over (partition by invoice_id order by id) - 1 as rn
  from public.invoice_items
)
update public.invoice_items ii
set position = ordered.rn
from ordered
where ii.id = ordered.id;
