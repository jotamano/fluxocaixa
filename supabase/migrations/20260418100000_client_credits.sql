-- Client credit balance.
--
-- Created so that a "split payment" with leftover money (user typed
-- a value bigger than the selected invoices' debt) can be parked on
-- the client instead of being silently dropped or forced into one
-- invoice. Credits are also consumed on the next payment to that
-- client, reducing the cash that needs to be entered.
--
-- Each row is one event:
--   `amount` is the positive balance still available on this credit.
--   When the credit is fully spent, `consumed_at` is set and amount
--   stays as the original (history). A row never goes below zero.
--
-- We model individual events (not a single per-client running total)
-- so the UI can show per-event history (origin payment / notes / when
-- spent). The current available balance for a client is the SUM of
-- non-deleted, non-consumed credit amounts.

create table if not exists public.client_credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  source_payment_id uuid references public.payments (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  -- Marked when fully consumed by one or more invoice payments. Until
  -- then, `amount` represents the still-available portion (we update
  -- it in place rather than spawning extra rows on each consumption,
  -- to keep the listing simple).
  consumed_at timestamptz,
  -- Soft delete so we can offer "restore" from /lixo if the user
  -- accidentally clears a credit. Mirrors the existing pattern on
  -- invoices/payments/subscriptions (see PR #39).
  deleted_at timestamptz
);

create index if not exists client_credits_client_id_idx
  on public.client_credits (client_id)
  where deleted_at is null and consumed_at is null;

create index if not exists client_credits_source_payment_id_idx
  on public.client_credits (source_payment_id);

alter table public.client_credits enable row level security;

create policy "client_credits_authenticated_all"
  on public.client_credits
  for all
  to authenticated
  using (true)
  with check (true);
