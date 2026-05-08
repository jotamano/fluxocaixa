// Labels and helpers only — data now comes from Supabase

export type ServiceType = 'social_media' | 'website' | 'marketing' | 'subscription';
export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft' | 'partially_paid';
export type SubscriptionFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'yearly'
  | 'biannual';
export type PaymentMethod = 'transfer' | 'mbway' | 'cash' | 'card';

export const statusLabels: Record<InvoiceStatus, string> = {
  paid: 'Paga',
  pending: 'Pendente',
  overdue: 'Vencida',
  draft: 'Rascunho',
  partially_paid: 'Parcialmente Paga',
};

export const frequencyLabels: Record<SubscriptionFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
  biannual: 'Bianual',
};

// Approximate number of days between billing events. Used to (a) infer the
// closest frequency from a user-entered date range on an invoice line and
// (b) advance next_billing_date when a new subscription is created.
export const frequencyDays: Record<SubscriptionFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
  quarterly: 90,
  semiannual: 180,
  yearly: 365,
  biannual: 730,
};

// Best-effort inference: if the user put a date range on the invoice line
// (e.g. "30/04/2026 - 30/04/2027"), pick the frequency whose period is
// closest to that span. Returns null when the span isn't close to any of
// the supported frequencies (within ±15%) so callers can fall back to the
// user-selected default instead of guessing wrong.
export function inferFrequencyFromRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): SubscriptionFrequency | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days <= 0) return null;

  let best: { freq: SubscriptionFrequency; error: number } | null = null;
  for (const [freq, period] of Object.entries(frequencyDays) as [
    SubscriptionFrequency,
    number,
  ][]) {
    const error = Math.abs(days - period) / period;
    if (best === null || error < best.error) {
      best = { freq, error };
    }
  }
  if (best === null || best.error > 0.15) return null;
  return best.freq;
}

export const methodLabels: Record<PaymentMethod, string> = {
  transfer: 'Transferência',
  mbway: 'MB WAY',
  cash: 'Numerário',
  card: 'Cartão',
};

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function getInvoiceItemsTotal(items: { quantity: number; unit_price: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity * Number(item.unit_price), 0);
}

/**
 * Default IVA percentage used for newly created clients. Matches the
 * legacy hard-coded rate so existing PDFs keep rendering the same value
 * after the per-client IVA setting was introduced.
 */
export const DEFAULT_IVA_PERCENTAGE = 23;

type IvaSource = { has_iva?: boolean | null; iva_percentage?: number | null };

/**
 * Resolve the effective IVA rate for an invoice/subscription. Returns 0
 * when IVA is disabled (`has_iva = false`) so callers can multiply the
 * subtotal directly without branching. Treats nulls as "not configured"
 * and falls back to 0 — safer than assuming 23% when the column is
 * unexpectedly empty.
 */
export function getEffectiveIvaPercentage(source: IvaSource | null | undefined): number {
  if (!source || source.has_iva === false) return 0;
  const pct = Number(source.iva_percentage ?? 0);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
}

/**
 * Round to two decimal places using away-from-zero rounding to keep
 * computed IVA totals consistent with what the PDF/statement display
 * after `formatCurrency` formats them.
 */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getInvoiceIvaAmount(
  items: { quantity: number; unit_price: number }[],
  source: IvaSource | null | undefined,
): number {
  const pct = getEffectiveIvaPercentage(source);
  if (pct <= 0) return 0;
  return round2(getInvoiceItemsTotal(items) * (pct / 100));
}

export function getInvoiceTotalWithIva(
  items: { quantity: number; unit_price: number }[],
  source: IvaSource | null | undefined,
): number {
  const subtotal = getInvoiceItemsTotal(items);
  const iva = getInvoiceIvaAmount(items, source);
  return round2(subtotal + iva);
}

/**
 * Apply the source's IVA rate to a single scalar amount. Used for
 * subscriptions (one amount per row) and any other place where we need
 * the IVA-inclusive value but don't have an items array. Returns the
 * amount unchanged when IVA is disabled or 0.
 */
export function getAmountWithIva(
  amount: number,
  source: IvaSource | null | undefined,
): number {
  const pct = getEffectiveIvaPercentage(source);
  if (pct <= 0) return amount;
  return round2(amount * (1 + pct / 100));
}

/**
 * Display label for an entity carrying a joined `clients` row. Falls
 * back from `company` (the most descriptive label) to `name` (the
 * contact person) before giving up with "Sem cliente". Prefer this
 * helper over inline `clients?.company || "Sem cliente"` so empty-
 * company clients still render usefully (e.g. freelancers without a
 * registered company).
 */
export function getClientLabel(
  entity: { clients?: { company?: string | null; name?: string | null } | null } | null | undefined,
  fallback = "Sem cliente",
): string {
  const company = entity?.clients?.company?.trim();
  if (company) return company;
  const name = entity?.clients?.name?.trim();
  if (name) return name;
  return fallback;
}

/**
 * Format the optional service period stored on `invoice_items` as a
 * single short string. Both inputs are independent: a line may have
 * just a start (single-day delivery), just an end, or both. Returns
 * `null` when neither is set so callers can branch cleanly without
 * littering their JSX with `&&` chains.
 *
 * Inputs are ISO date strings (`yyyy-mm-dd`) as returned by Postgres.
 * Output is locale-formatted `dd/mm/yyyy` for pt-PT.
 */
export function formatInvoiceItemPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-PT");
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return fmt(start);
  if (end) return fmt(end);
  return null;
}
