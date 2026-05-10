// Pure aggregation helpers shared across stats panels (Dashboard, Services,
// ServiceDetail, ClientDetail, SubscriptionDetail). Kept dependency-free
// (no React, no Supabase) so the same code can run inside useMemo blocks
// without re-fetching anything — the data is already cached in TanStack
// Query for the relevant `useInvoices`/`usePayments`/`useSubscriptions`
// hooks.

import type { Invoice, InvoiceItem, Payment, Subscription } from "@/hooks/use-data";
import {
  getInvoiceItemsTotal,
  getInvoiceTotalWithIva,
  frequencyDays,
  type SubscriptionFrequency,
} from "./data";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface MonthlyBucket {
  /** Short month label (e.g. "Jan"). Repeats across years — pair with `key` for uniqueness. */
  month: string;
  /** `${year}-${monthIdx}` — stable key for chart `dataKey`/`key`. */
  key: string;
  value: number;
}

/**
 * Build a contiguous array of {month, key, value} buckets for the last
 * `monthsToShow` calendar months ending on the current month. Missing
 * months get a zero so the chart axis stays smooth.
 */
export function buildMonthlyBuckets(monthsToShow: number): Map<string, MonthlyBucket> {
  const map = new Map<string, MonthlyBucket>();
  const now = new Date();
  for (let i = monthsToShow - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    map.set(key, { month: MONTHS_PT[d.getMonth()], key, value: 0 });
  }
  return map;
}

export function bucketKeyFromDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/**
 * Monthly received-revenue buckets from a list of payments. Used by the
 * "Receita mensal" charts on Dashboard, ClientDetail and SubscriptionDetail.
 */
export function paymentsByMonth(payments: Payment[], monthsToShow = 12): MonthlyBucket[] {
  const buckets = buildMonthlyBuckets(monthsToShow);
  for (const p of payments) {
    const key = bucketKeyFromDate(p.date);
    const b = buckets.get(key);
    if (b) b.value += Number(p.amount);
  }
  return Array.from(buckets.values());
}

/**
 * Monthly invoiced-amount buckets (issue_date based, includes IVA).
 * Used by ServiceDetail / SubscriptionDetail to show pipeline volume
 * even when payments lag behind issuance.
 */
export function invoicesIssuedByMonth(invoices: Invoice[], monthsToShow = 12): MonthlyBucket[] {
  const buckets = buildMonthlyBuckets(monthsToShow);
  for (const inv of invoices) {
    const key = bucketKeyFromDate(inv.issue_date);
    const b = buckets.get(key);
    if (b) b.value += getInvoiceTotalWithIva(inv.invoice_items, inv);
  }
  return Array.from(buckets.values());
}

export interface ServiceUsageStats {
  /** Number of distinct invoices that include at least one line for the service. */
  invoiceCount: number;
  /** Number of invoice_items lines (across all invoices). */
  itemCount: number;
  /** Lifetime amount billed (sum of qty * unit_price across lines, no IVA). */
  totalBilledNet: number;
  /** Lifetime amount billed including the parent invoice's IVA rate. */
  totalBilledGross: number;
  /** Subset of `totalBilledGross` whose parent invoice is paid. */
  totalReceived: number;
  /** Subset of `totalBilledGross` whose parent invoice is open (pending/overdue/partial). */
  totalOutstanding: number;
  /** Active subscriptions where any subscription_item references this service. */
  activeSubscriptions: number;
  /** Most recent issue_date across invoices that include the service (`null` when never used). */
  lastUsedAt: string | null;
}

/**
 * Compute usage stats for a single service id. Walks the already-loaded
 * invoices array (no extra DB call) so it's cheap to call inside a
 * useMemo. The subscription-item check is delegated to a flat list of
 * `{subscriptionId, serviceId}` rows so callers can pass whatever shape
 * they have — usually `useClientSubscriptionItems` results.
 */
export function computeServiceUsageStats(
  serviceId: string,
  invoices: Invoice[],
  subscriptions: Subscription[],
  subscriptionItemsByService: { subscription_id: string; service_id: string | null }[],
): ServiceUsageStats {
  let invoiceCount = 0;
  let itemCount = 0;
  let totalBilledNet = 0;
  let totalBilledGross = 0;
  let totalReceived = 0;
  let totalOutstanding = 0;
  let lastUsedAt: string | null = null;

  for (const inv of invoices) {
    const matching = inv.invoice_items.filter(it => it.service_id === serviceId);
    if (matching.length === 0) continue;
    invoiceCount += 1;
    itemCount += matching.length;
    const net = getInvoiceItemsTotal(matching);
    const ivaPct = inv.has_iva && inv.iva_percentage ? Number(inv.iva_percentage) : 0;
    const gross = ivaPct > 0 ? net * (1 + ivaPct / 100) : net;
    totalBilledNet += net;
    totalBilledGross += gross;
    if (inv.status === "paid") totalReceived += gross;
    else if (inv.status === "pending" || inv.status === "overdue" || inv.status === "partially_paid")
      totalOutstanding += gross;
    if (!lastUsedAt || inv.issue_date > lastUsedAt) lastUsedAt = inv.issue_date;
  }

  const subIdsWithService = new Set(
    subscriptionItemsByService
      .filter(si => si.service_id === serviceId)
      .map(si => si.subscription_id),
  );
  const activeSubscriptions = subscriptions.filter(
    s => subIdsWithService.has(s.id) && s.status === "active",
  ).length;

  return {
    invoiceCount,
    itemCount,
    totalBilledNet,
    totalBilledGross: round2(totalBilledGross),
    totalReceived: round2(totalReceived),
    totalOutstanding: round2(totalOutstanding),
    activeSubscriptions,
    lastUsedAt,
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface TopServiceRow {
  serviceId: string;
  /** Best-effort label from invoice_items.description; falls back to "(sem serviço)". */
  label: string;
  total: number;
  invoiceCount: number;
}

/**
 * Aggregate billed amounts (net) by service across an arbitrary list
 * of invoices. Lines without a `service_id` are bucketed under a
 * synthetic "(sem serviço)" entry so the operator notices when ad-hoc
 * line items dominate revenue.
 */
export function topServicesByRevenue(
  invoices: Invoice[],
  serviceLabelById: Map<string, string>,
  limit = 5,
): TopServiceRow[] {
  type Bucket = { total: number; invoices: Set<string>; sampleLabel: string };
  const buckets = new Map<string | "__none__", Bucket>();
  for (const inv of invoices) {
    for (const it of inv.invoice_items) {
      const key = it.service_id ?? "__none__";
      const b = buckets.get(key) ?? { total: 0, invoices: new Set<string>(), sampleLabel: "" };
      b.total += Number(it.quantity) * Number(it.unit_price);
      b.invoices.add(inv.id);
      if (!b.sampleLabel) b.sampleLabel = it.description;
      buckets.set(key, b);
    }
  }
  return Array.from(buckets.entries())
    .map(([key, b]) => ({
      serviceId: key === "__none__" ? "" : (key as string),
      label:
        key === "__none__"
          ? "(sem serviço)"
          : serviceLabelById.get(key as string) ?? b.sampleLabel ?? "(serviço removido)",
      total: round2(b.total),
      invoiceCount: b.invoices.size,
    }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export interface InvoiceListSummary {
  count: number;
  totalGross: number;
  paidGross: number;
  pendingGross: number;
  overdueGross: number;
  averageTicket: number;
}

/**
 * Single-pass summary of an invoice list for the toolbar shown above
 * `/faturas` and `/servicos/:id`. Status buckets follow the same mapping
 * as the rest of the app: `paid` → received; `pending|overdue|partially_paid`
 * → open; `draft` is excluded from totals (it's not committed work yet).
 */
export function summarizeInvoices(invoices: Invoice[]): InvoiceListSummary {
  let totalGross = 0;
  let paidGross = 0;
  let pendingGross = 0;
  let overdueGross = 0;
  let counted = 0;
  for (const inv of invoices) {
    if (inv.status === "draft") continue;
    const gross = getInvoiceTotalWithIva(inv.invoice_items, inv);
    totalGross += gross;
    counted += 1;
    if (inv.status === "paid") paidGross += gross;
    else if (inv.status === "overdue") overdueGross += gross;
    else if (inv.status === "pending" || inv.status === "partially_paid") pendingGross += gross;
  }
  return {
    count: invoices.length,
    totalGross: round2(totalGross),
    paidGross: round2(paidGross),
    pendingGross: round2(pendingGross),
    overdueGross: round2(overdueGross),
    averageTicket: counted > 0 ? round2(totalGross / counted) : 0,
  };
}

/**
 * Normalize a recurring amount to its monthly equivalent so MRR across
 * mixed frequencies (weekly hosting, monthly retainer, annual domain)
 * stays comparable. Returns 0 for any non-active subscription.
 */
export function subscriptionMonthlyValue(sub: Subscription): number {
  if (sub.status !== "active") return 0;
  const periodDays = frequencyDays[sub.frequency as SubscriptionFrequency] ?? 30;
  return (Number(sub.amount) * 30) / periodDays;
}

export interface SubscriptionListSummary {
  active: number;
  paused: number;
  cancelled: number;
  mrr: number;
  /** Receita YTD a partir das *faturas pagas* ligadas a subscrições. */
  receivedThisYear: number;
}

/**
 * Roll-up shown above `/subscricoes`. `receivedThisYear` requires the
 * paid invoices array because subscriptions themselves don't track
 * realized revenue — only billed amount snapshots.
 */
export function summarizeSubscriptions(
  subs: Subscription[],
  invoices: Invoice[],
): SubscriptionListSummary {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  let active = 0;
  let paused = 0;
  let cancelled = 0;
  let mrr = 0;
  for (const s of subs) {
    if (s.status === "active") {
      active += 1;
      mrr += subscriptionMonthlyValue(s);
    } else if (s.status === "paused") paused += 1;
    else if (s.status === "cancelled") cancelled += 1;
  }
  let receivedThisYear = 0;
  for (const inv of invoices) {
    if (!inv.subscription_id) continue;
    if (inv.status !== "paid") continue;
    if (inv.issue_date < yearStart) continue;
    receivedThisYear += getInvoiceTotalWithIva(inv.invoice_items, inv);
  }
  return {
    active,
    paused,
    cancelled,
    mrr: round2(mrr),
    receivedThisYear: round2(receivedThisYear),
  };
}

/**
 * Days from an invoice's issue_date to its first received payment.
 * Returns null when the invoice has no payments yet. Used to compute
 * the "média de pagamento" on the client detail view — a useful proxy
 * for whether a client tends to pay on time.
 */
export function invoicePaymentLagDays(invoice: Invoice, payments: Payment[]): number | null {
  const invoicePayments = payments
    .filter(p => p.invoice_id === invoice.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (invoicePayments.length === 0) return null;
  const first = new Date(invoicePayments[0].date);
  const issued = new Date(invoice.issue_date);
  return Math.round((first.getTime() - issued.getTime()) / 86_400_000);
}

/**
 * Helper for ClientDetail/ServiceDetail panels: top N clients by paid
 * revenue across the supplied invoice/payment slice.
 */
export interface TopClientRow {
  clientId: string | null;
  label: string;
  total: number;
}

export function topClientsByRevenue(
  invoices: Invoice[],
  payments: Payment[],
  limit = 5,
): TopClientRow[] {
  const totals = new Map<string, { label: string; total: number }>();
  for (const p of payments) {
    const inv = invoices.find(i => i.id === p.invoice_id);
    const key = inv?.client_id ?? "__none__";
    const label = inv?.clients?.company || inv?.clients?.name || "Sem cliente";
    const entry = totals.get(key) ?? { label, total: 0 };
    entry.total += Number(p.amount);
    totals.set(key, entry);
  }
  return Array.from(totals.entries())
    .map(([key, v]) => ({
      clientId: key === "__none__" ? null : key,
      label: v.label,
      total: round2(v.total),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/**
 * Breakdown by payment method (€ totals) — small donut/list shown on
 * ClientDetail. Methods missing from the input get omitted, never zeroed,
 * to keep the chart readable.
 */
export function paymentMethodBreakdown(payments: Payment[]): { method: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const p of payments) {
    totals.set(p.method, (totals.get(p.method) ?? 0) + Number(p.amount));
  }
  return Array.from(totals.entries())
    .map(([method, total]) => ({ method, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

export type { InvoiceItem };
