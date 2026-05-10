import { useMemo, useState } from "react";
import { Euro, Users, RefreshCw, TrendingUp, AlertTriangle, Bell, Package } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, getInvoiceTotalWithIva, getAmountWithIva, frequencyDays, getClientLabel, type SubscriptionFrequency } from "@/lib/data";
import { useInvoices, useClients, useSubscriptions, usePayments, useServices } from "@/hooks/use-data";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { topServicesByRevenue } from "@/lib/stats";

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type DateRange = "month" | "quarter" | "year" | "all";

function getDateRange(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  switch (range) {
    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
    case "quarter": {
      const qStart = now.getMonth() - (now.getMonth() % 3);
      return { start: new Date(now.getFullYear(), qStart, 1), end };
    }
    case "year":
      return { start: new Date(now.getFullYear(), 0, 1), end };
    case "all":
      return { start: new Date(2020, 0, 1), end };
  }
}

type CompareMode = "previous" | "yoy";

export default function Dashboard() {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: payments = [] } = usePayments();
  const { data: services = [] } = useServices();
  const [dateRange, setDateRange] = useState<DateRange>("year");
  const [compareMode, setCompareMode] = useState<CompareMode>("previous");

  const { start, end } = getDateRange(dateRange);

  // Comparison window. Two modes:
  //   - "previous": same-length window immediately before the active one
  //     (e.g. Jul-Sep 2026 vs Apr-Jun 2026 for "Trimestre")
  //   - "yoy": exact same calendar window shifted back 1 year so we're
  //     comparing like-for-like (e.g. Jan-Dec 2026 vs Jan-Dec 2025)
  // Falls back to a zero-length window when range = "all" so the badge
  // naturally hides itself (delta = null).
  const compareRange = useMemo(() => {
    if (dateRange === "all") return { start, end: start };
    if (compareMode === "yoy") {
      const s = new Date(start);
      const e = new Date(end);
      s.setFullYear(s.getFullYear() - 1);
      e.setFullYear(e.getFullYear() - 1);
      return { start: s, end: e };
    }
    const span = end.getTime() - start.getTime();
    return {
      start: new Date(start.getTime() - span - 86_400_000),
      end: new Date(start.getTime() - 86_400_000),
    };
  }, [start, end, dateRange, compareMode]);

  const filteredInvoices = useMemo(() =>
    invoices.filter(i => {
      const d = new Date(i.issue_date);
      return d >= start && d <= end;
    }),
    [invoices, start, end]
  );

  const filteredPayments = useMemo(() =>
    payments.filter(p => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    }),
    [payments, start, end]
  );

  const totalRevenue = filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Revenue from the comparison window. Drives the up/down arrow next
  // to "Receita Total". Hidden when range = "Tudo" since there's no
  // meaningful comparison window.
  const compareRevenue = useMemo(() => {
    if (dateRange === "all") return 0;
    return payments
      .filter(p => {
        const d = new Date(p.date);
        return d >= compareRange.start && d <= compareRange.end;
      })
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }, [payments, compareRange, dateRange]);

  const revenueDelta = useMemo(() => {
    if (dateRange === "all" || compareRevenue === 0) return null;
    return ((totalRevenue - compareRevenue) / compareRevenue) * 100;
  }, [totalRevenue, compareRevenue, dateRange]);

  // Invoiced amount in the comparison window (total billed, not just
  // collected). Surfaces alongside the revenue delta so operators see
  // both "what was paid" and "what was sold" YoY.
  const filteredInvoicedTotal = useMemo(
    () => filteredInvoices.reduce((s, i) => s + getInvoiceTotalWithIva(i.invoice_items, i), 0),
    [filteredInvoices],
  );

  const compareInvoicedTotal = useMemo(() => {
    if (dateRange === "all") return 0;
    return invoices
      .filter(i => {
        const d = new Date(i.issue_date);
        return d >= compareRange.start && d <= compareRange.end;
      })
      .reduce((s, i) => s + getInvoiceTotalWithIva(i.invoice_items, i), 0);
  }, [invoices, compareRange, dateRange]);

  const invoicedDelta = useMemo(() => {
    if (dateRange === "all" || compareInvoicedTotal === 0) return null;
    return ((filteredInvoicedTotal - compareInvoicedTotal) / compareInvoicedTotal) * 100;
  }, [filteredInvoicedTotal, compareInvoicedTotal, dateRange]);

  const compareLabel = compareMode === "yoy" ? "vs ano homólogo" : "vs período anterior";

  const pendingInvoices = filteredInvoices.filter(i => i.status === 'pending' || i.status === 'overdue' || i.status === 'partially_paid');
  const pendingAmount = pendingInvoices.reduce((sum, i) => {
    const invoiceTotal = getInvoiceTotalWithIva(i.invoice_items, i);
    const paid = payments.filter(p => p.invoice_id === i.id).reduce((s, p) => s + Number(p.amount), 0);
    return sum + Math.max(invoiceTotal - paid, 0);
  }, 0);

  const activeSubscriptions = subscriptions.filter(s => s.active);
  const monthlyRecurring = activeSubscriptions.reduce((sum, s) => {
    const amt = Number(s.amount);
    const periodDays = frequencyDays[s.frequency as SubscriptionFrequency] ?? 30;
    return sum + (amt * 30) / periodDays;
  }, 0);

  const overdueInvoices = filteredInvoices.filter(i => i.status === 'overdue');

  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, number>();
    const monthsToShow = dateRange === 'month' ? 1 : dateRange === 'quarter' ? 3 : 12;
    const now = new Date();
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthMap.set(key, 0);
    }
    filteredPayments.forEach(p => {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthMap.has(key)) {
        monthMap.set(key, (monthMap.get(key) || 0) + Number(p.amount));
      }
    });
    return Array.from(monthMap.entries()).map(([key, value]) => {
      const [, monthIdx] = key.split('-').map(Number);
      return { month: MONTHS_PT[monthIdx], value };
    });
  }, [filteredPayments, dateRange]);

  // Top clients by revenue in the selected period
  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    filteredPayments.forEach(p => {
      const inv = invoices.find(i => i.id === p.invoice_id);
      const company = inv?.clients?.company || inv?.clients?.name || "Sem cliente";
      map.set(company, (map.get(company) || 0) + Number(p.amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filteredPayments, invoices]);

  // Top services by billed amount in the selected period. Built from
  // *issued* invoices (not just paid) so newly-issued work shows up
  // even when the client hasn't paid yet — matches operator intuition
  // about "what was sold this month".
  const serviceLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) map.set(s.id, s.name);
    return map;
  }, [services]);

  const topServices = useMemo(
    () => topServicesByRevenue(filteredInvoices, serviceLabelById, 5),
    [filteredInvoices, serviceLabelById],
  );
  const topServicesTotal = useMemo(
    () => topServices.reduce((s, r) => s + r.total, 0),
    [topServices],
  );

  const dateFilters: { value: DateRange; label: string }[] = [
    { value: "month", label: "Este mês" },
    { value: "quarter", label: "Trimestre" },
    { value: "year", label: "Este ano" },
    { value: "all", label: "Tudo" },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Visão geral do teu negócio</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            {dateFilters.map(f => (
              <Button key={f.value} variant={dateRange === f.value ? "default" : "outline"} size="sm" onClick={() => setDateRange(f.value)}>
                {f.label}
              </Button>
            ))}
          </div>
          {dateRange !== "all" && (
            <div className="flex gap-1 border-l border-border pl-2">
              <Button
                variant={compareMode === "previous" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setCompareMode("previous")}
              >
                vs Anterior
              </Button>
              <Button
                variant={compareMode === "yoy" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setCompareMode("yoy")}
              >
                vs Ano
              </Button>
            </div>
          )}
        </div>
      </div>

      {(overdueInvoices.length > 0 || pendingInvoices.length > 0) && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
          <Bell className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            {overdueInvoices.length > 0 && (
              <p className="text-sm text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 inline text-destructive mr-1" />
                <span className="font-semibold">{overdueInvoices.length} fatura(s) vencida(s)</span> — {overdueInvoices.map(i => `${i.number} (${getClientLabel(i, '—')})`).join(", ")}
              </p>
            )}
            {pendingInvoices.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{pendingInvoices.length} fatura(s) pendente(s)</span> — em dívida: {formatCurrency(pendingAmount)}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Receita Total"
          value={formatCurrency(totalRevenue)}
          subtitle={
            revenueDelta === null
              ? "Pagamentos recebidos"
              : `${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(1)}% ${compareLabel}`
          }
          trend={revenueDelta === null ? "neutral" : revenueDelta >= 0 ? "up" : "down"}
          icon={Euro}
        />
        <StatCard
          title="Faturado"
          value={formatCurrency(filteredInvoicedTotal)}
          subtitle={
            invoicedDelta === null
              ? `${filteredInvoices.length} fatura(s)`
              : `${invoicedDelta >= 0 ? "+" : ""}${invoicedDelta.toFixed(1)}% ${compareLabel}`
          }
          trend={invoicedDelta === null ? "neutral" : invoicedDelta >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />
        <StatCard title="Em Dívida" value={formatCurrency(pendingAmount)} subtitle={`${overdueInvoices.length} fatura(s) vencida(s)`} trend={pendingAmount > 0 ? "down" : "neutral"} icon={AlertTriangle} />
        <StatCard title="Receita Recorrente" value={formatCurrency(monthlyRecurring)} subtitle={`${activeSubscriptions.length} subscrições ativas`} trend="neutral" icon={RefreshCw} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-card p-6">
          <h2 className="font-display font-semibold text-card-foreground mb-4">Receita Mensal</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} tickFormatter={v => `${v}€`} />
                <Tooltip formatter={(value: number) => [formatCurrency(value), "Receita"]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 15%, 90%)", fontSize: 13 }} />
                <Bar dataKey="value" fill="hsl(220, 70%, 45%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-card p-6">
          <h2 className="font-display font-semibold text-card-foreground mb-4">Top Clientes</h2>
          <div className="h-64">
            {topClients.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Sem dados para o período selecionado</div>
            ) : (
              <ul className="divide-y divide-border">
                {topClients.map((c) => (
                  <li key={c.name} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-card-foreground truncate pr-3">{c.name}</span>
                    <span className="font-semibold text-card-foreground whitespace-nowrap">{formatCurrency(c.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h2 className="font-display font-semibold text-card-foreground">Top Serviços</h2>
          </div>
          <Link to="/servicos" className="text-sm font-medium text-primary hover:underline">Ver todos</Link>
        </div>
        {topServices.length === 0 ? (
          <div className="px-6 py-6 text-sm text-muted-foreground">Sem serviços faturados no período selecionado.</div>
        ) : (
          <ul className="divide-y divide-border">
            {topServices.map(s => {
              const pct = topServicesTotal > 0 ? (s.total / topServicesTotal) * 100 : 0;
              const row = (
                <div className="flex items-center gap-3 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.invoiceCount} fatura(s)</p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="min-w-[100px] text-right">
                    <p className="text-sm font-semibold text-card-foreground">{formatCurrency(s.total)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</p>
                  </div>
                </div>
              );
              return s.serviceId ? (
                <li key={s.serviceId}>
                  <Link to={`/servicos/${s.serviceId}`} className="block hover:bg-muted/30 transition-colors">{row}</Link>
                </li>
              ) : (
                <li key={`none-${s.label}`}>{row}</li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display font-semibold text-card-foreground">Faturas Recentes</h2>
            <Link to="/faturas" className="text-sm font-medium text-primary hover:underline">Ver todas</Link>
          </div>
          <div className="divide-y divide-border">
            {filteredInvoices.slice(0, 5).map(invoice => (
              <Link key={invoice.id} to={`/faturas/${invoice.id}`} className="flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-card-foreground">{invoice.number}</p>
                  <p className="text-xs text-muted-foreground">{getClientLabel(invoice)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={invoice.status} />
                  <span className="text-sm font-semibold text-card-foreground min-w-[80px] text-right">
                    {formatCurrency(getInvoiceTotalWithIva(invoice.invoice_items, invoice))}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display font-semibold text-card-foreground">Subscrições Ativas</h2>
            <Link to="/subscricoes" className="text-sm font-medium text-primary hover:underline">Ver todas</Link>
          </div>
          <div className="divide-y divide-border">
            {activeSubscriptions.map(sub => (
              <div key={sub.id} className="flex items-center justify-between px-6 py-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-card-foreground">{sub.name}</p>
                  <p className="text-xs text-muted-foreground">{getClientLabel(sub)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-card-foreground">{formatCurrency(getAmountWithIva(Number(sub.amount), sub))}/mês</p>
                  <p className="text-xs text-muted-foreground">Próx: {new Date(sub.next_billing_date).toLocaleDateString('pt-PT')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
