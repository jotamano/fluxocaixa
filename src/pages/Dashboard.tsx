import { useMemo, useState } from "react";
import { Euro, Users, RefreshCw, TrendingUp, AlertTriangle, Bell } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, getInvoiceTotalWithIva, getAmountWithIva, frequencyDays, getClientLabel, type SubscriptionFrequency } from "@/lib/data";
import { useInvoices, useClients, useSubscriptions, usePayments } from "@/hooks/use-data";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

export default function Dashboard() {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: payments = [] } = usePayments();
  const [dateRange, setDateRange] = useState<DateRange>("year");

  const { start, end } = getDateRange(dateRange);

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
          <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">Visão geral do teu negócio</p>
        </div>
        <div className="flex gap-1">
          {dateFilters.map(f => (
            <Button key={f.value} variant={dateRange === f.value ? "default" : "outline"} size="sm" onClick={() => setDateRange(f.value)}>
              {f.label}
            </Button>
          ))}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Receita Total" value={formatCurrency(totalRevenue)} subtitle="Pagamentos recebidos" trend="up" icon={Euro} />
        <StatCard title="Em Dívida" value={formatCurrency(pendingAmount)} subtitle={`${overdueInvoices.length} fatura(s) vencida(s)`} trend="down" icon={TrendingUp} />
        <StatCard title="Clientes Ativos" value={String(clients.length)} trend="up" icon={Users} />
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
