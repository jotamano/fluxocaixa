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
