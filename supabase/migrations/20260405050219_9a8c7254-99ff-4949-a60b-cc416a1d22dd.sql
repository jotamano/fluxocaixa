
-- Enums
create type public.service_type as enum ('social_media', 'website', 'marketing', 'subscription');
create type public.invoice_status as enum ('paid', 'pending', 'overdue', 'draft');
create type public.subscription_frequency as enum ('monthly', 'quarterly', 'yearly');
create type public.payment_method as enum ('transfer', 'mbway', 'cash', 'card');

-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text not null,
  phone text not null default '',
  nif text not null default '',
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;
create policy "Public read clients" on public.clients for select using (true);
create policy "Public insert clients" on public.clients for insert with check (true);
create policy "Public update clients" on public.clients for update using (true) with check (true);
create policy "Public delete clients" on public.clients for delete using (true);

-- Invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date not null default (current_date + interval '30 days'),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
create policy "Public read invoices" on public.invoices for select using (true);
create policy "Public insert invoices" on public.invoices for insert with check (true);
create policy "Public update invoices" on public.invoices for update using (true) with check (true);
create policy "Public delete invoices" on public.invoices for delete using (true);

-- Invoice Items
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  service_type public.service_type not null,
  quantity integer not null default 1,
  unit_price numeric(10,2) not null default 0
);

alter table public.invoice_items enable row level security;
create policy "Public read invoice_items" on public.invoice_items for select using (true);
create policy "Public insert invoice_items" on public.invoice_items for insert with check (true);
create policy "Public update invoice_items" on public.invoice_items for update using (true) with check (true);
create policy "Public delete invoice_items" on public.invoice_items for delete using (true);

-- Subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  service_type public.service_type not null,
  amount numeric(10,2) not null default 0,
  frequency public.subscription_frequency not null default 'monthly',
  start_date date not null default current_date,
  next_billing_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
create policy "Public read subscriptions" on public.subscriptions for select using (true);
create policy "Public insert subscriptions" on public.subscriptions for insert with check (true);
create policy "Public update subscriptions" on public.subscriptions for update using (true) with check (true);
create policy "Public delete subscriptions" on public.subscriptions for delete using (true);

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  amount numeric(10,2) not null,
  date date not null default current_date,
  method public.payment_method not null default 'transfer',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;
create policy "Public read payments" on public.payments for select using (true);
create policy "Public insert payments" on public.payments for insert with check (true);
create policy "Public update payments" on public.payments for update using (true) with check (true);
create policy "Public delete payments" on public.payments for delete using (true);
