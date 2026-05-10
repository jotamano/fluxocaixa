import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Package, Euro, Receipt, RefreshCw, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import {
  useServices,
  useInvoices,
  useSubscriptions,
  usePayments,
  useAllSubscriptionItems,
} from "@/hooks/use-data";
import {
  formatCurrency,
  getInvoiceTotalWithIva,
  getClientLabel,
} from "@/lib/data";
import {
  computeServiceUsageStats,
  invoicesIssuedByMonth,
  topClientsByRevenue,
} from "@/lib/stats";

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: services = [] } = useServices();
  const { data: invoices = [] } = useInvoices();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: payments = [] } = usePayments();
  const { data: subItems = [] } = useAllSubscriptionItems();

  const service = services.find(s => s.id === id);

  // Slice the invoices that include at least one line for this service.
  // Used by every panel below — pre-filter once so each useMemo is cheap.
  const matchingInvoices = useMemo(
    () => (id ? invoices.filter(inv => inv.invoice_items.some(it => it.service_id === id)) : []),
    [invoices, id],
  );

  const matchingSubItems = useMemo(
    () => (id ? subItems.filter(si => si.service_id === id) : []),
    [subItems, id],
  );

  const matchingSubs = useMemo(() => {
    const subIds = new Set(matchingSubItems.map(si => si.subscription_id));
    return subscriptions.filter(s => subIds.has(s.id));
  }, [subscriptions, matchingSubItems]);

  const matchingPayments = useMemo(() => {
    const invIds = new Set(matchingInvoices.map(i => i.id));
    return payments.filter(p => p.invoice_id && invIds.has(p.invoice_id));
  }, [payments, matchingInvoices]);

  const stats = useMemo(
    () =>
      id
        ? computeServiceUsageStats(id, invoices, subscriptions, subItems)
        : null,
    [id, invoices, subscriptions, subItems],
  );

  const monthlyData = useMemo(() => invoicesIssuedByMonth(matchingInvoices, 12), [matchingInvoices]);

  const topClients = useMemo(
    () => topClientsByRevenue(matchingInvoices, matchingPayments, 5),
    [matchingInvoices, matchingPayments],
  );

  if (!service) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-1"><ArrowLeft className="h-4 w-4" /> Voltar</Button>
        <p className="text-muted-foreground">Serviço não encontrado.</p>
      </div>
    );
  }

  if (!stats) return null;

  const recentInvoices = matchingInvoices.slice(0, 8);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-foreground">{service.name}</h1>
              {!service.active && (
                <span className="rounded-full border border-muted-foreground/20 bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inativo</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Preço base: {formatCurrency(Number(service.default_price))}
              {stats.lastUsedAt && (
                <> · Último uso em {new Date(stats.lastUsedAt).toLocaleDateString("pt-PT")}</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total faturado"
          value={formatCurrency(stats.totalBilledGross)}
          subtitle={`${stats.invoiceCount} fatura(s) · ${stats.itemCount} linha(s)`}
          icon={Euro}
          trend="up"
        />
        <StatCard
          title="Já recebido"
          value={formatCurrency(stats.totalReceived)}
          subtitle="Faturas pagas"
          icon={Receipt}
          trend="up"
        />
        <StatCard
          title="Em aberto"
          value={formatCurrency(stats.totalOutstanding)}
          subtitle="Pendentes/vencidas"
          icon={AlertTriangle}
          trend={stats.totalOutstanding > 0 ? "down" : "neutral"}
        />
        <StatCard
          title="Subscrições ativas"
          value={String(stats.activeSubscriptions)}
          subtitle={`${matchingSubs.length} no total`}
          icon={RefreshCw}
          trend="neutral"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display font-semibold text-card-foreground mb-4">Faturado por mês (últimos 12)</h2>
          <div className="h-64">
            {matchingInvoices.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem dados — este serviço ainda não foi faturado.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} tickFormatter={v => `${v}€`} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Faturado"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 15%, 90%)", fontSize: 13 }}
                  />
                  <Bar dataKey="value" fill="hsl(220, 70%, 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h2 className="font-display font-semibold text-card-foreground mb-4">Top clientes</h2>
          {topClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem pagamentos registados para este serviço.</p>
          ) : (
            <ul className="divide-y divide-border">
              {topClients.map(c => (
                <li key={c.clientId ?? c.label} className="py-3 text-sm">
                  {c.clientId ? (
                    <Link to={`/clientes/${c.clientId}`} className="flex items-center justify-between hover:underline">
                      <span className="truncate pr-3 text-card-foreground">{c.label}</span>
                      <span className="whitespace-nowrap font-semibold text-card-foreground">{formatCurrency(c.total)}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="truncate pr-3 text-card-foreground">{c.label}</span>
                      <span className="whitespace-nowrap font-semibold text-card-foreground">{formatCurrency(c.total)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display font-semibold text-card-foreground">Faturas recentes</h2>
            <span className="text-xs text-muted-foreground">{matchingInvoices.length} no total</span>
          </div>
          <div className="divide-y divide-border">
            {recentInvoices.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">Sem faturas associadas.</p>
            ) : (
              recentInvoices.map(invoice => (
                <Link
                  key={invoice.id}
                  to={`/faturas/${invoice.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{invoice.number}</p>
                    <p className="truncate text-xs text-muted-foreground">{getClientLabel(invoice)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={invoice.status} />
                    <span className="min-w-[80px] text-right text-sm font-semibold text-card-foreground">
                      {formatCurrency(getInvoiceTotalWithIva(invoice.invoice_items, invoice))}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display font-semibold text-card-foreground">Subscrições com este serviço</h2>
            <span className="text-xs text-muted-foreground">{matchingSubs.length} no total</span>
          </div>
          <div className="divide-y divide-border">
            {matchingSubs.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">Nenhuma subscrição usa este serviço.</p>
            ) : (
              matchingSubs.map(sub => (
                <Link
                  key={sub.id}
                  to={`/subscricoes/${sub.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{sub.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{getClientLabel(sub)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      sub.status === "active" ? 'bg-success/10 text-success border-success/20'
                      : sub.status === "paused" ? 'bg-warning/10 text-warning border-warning/20'
                      : 'bg-muted text-muted-foreground border-border'
                    }`}>
                      {sub.status === "active" ? "Ativa" : sub.status === "paused" ? "Pausada" : "Cancelada"}
                    </span>
                    <span className="min-w-[80px] text-right text-sm font-semibold text-card-foreground">
                      {formatCurrency(Number(sub.amount))}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
