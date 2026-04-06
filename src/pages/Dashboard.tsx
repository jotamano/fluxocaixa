import { Euro, Users, FileText, RefreshCw, TrendingUp, AlertTriangle, Bell } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency, getInvoiceItemsTotal, serviceLabels } from "@/lib/data";
import { useInvoices, useClients, useSubscriptions } from "@/hooks/use-data";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const CHART_COLORS = [
  "hsl(220, 70%, 45%)",
  "hsl(160, 60%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 60%, 50%)",
];

export default function Dashboard() {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();
  const { data: subscriptions = [] } = useSubscriptions();

  const totalRevenue = invoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + getInvoiceItemsTotal(i.invoice_items), 0);

  const pendingAmount = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + getInvoiceItemsTotal(i.invoice_items), 0);

  const activeSubscriptions = subscriptions.filter(s => s.active);
  const monthlyRecurring = activeSubscriptions
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const overdueInvoices = invoices.filter(i => i.status === 'overdue');
  const pendingInvoices = invoices.filter(i => i.status === 'pending');

  const monthlyData = [
    { month: "Set", value: 1200 },
    { month: "Out", value: 1800 },
    { month: "Nov", value: 1450 },
    { month: "Dez", value: 2100 },
    { month: "Jan", value: 750 },
    { month: "Fev", value: 1500 },
  ];

  const serviceRevenue = invoices.reduce((acc, inv) => {
    inv.invoice_items.forEach(item => {
      const key = item.service_type;
      acc[key] = (acc[key] || 0) + item.quantity * Number(item.unit_price);
    });
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(serviceRevenue).map(([key, value]) => ({
    name: serviceLabels[key as keyof typeof serviceLabels],
    value,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Visão geral do teu negócio de marketing digital</p>
      </div>

      {(overdueInvoices.length > 0 || pendingInvoices.length > 0) && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
          <Bell className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            {overdueInvoices.length > 0 && (
              <p className="text-sm text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 inline text-destructive mr-1" />
                <span className="font-semibold">{overdueInvoices.length} fatura(s) vencida(s)</span> — {overdueInvoices.map(i => {
                  return `${i.number} (${i.clients?.company || '—'})`;
                }).join(", ")}
              </p>
            )}
            {pendingInvoices.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{pendingInvoices.length} fatura(s) pendente(s)</span> no valor total de {formatCurrency(pendingInvoices.reduce((s, i) => s + getInvoiceItemsTotal(i.invoice_items), 0))}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Receita Total" value={formatCurrency(totalRevenue)} subtitle="+12% vs mês anterior" trend="up" icon={Euro} />
        <StatCard title="Valores Pendentes" value={formatCurrency(pendingAmount)} subtitle={`${overdueInvoices.length} fatura(s) vencida(s)`} trend="down" icon={TrendingUp} />
        <StatCard title="Clientes Ativos" value={String(clients.length)} subtitle="+2 este mês" trend="up" icon={Users} />
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
          <h2 className="font-display font-semibold text-card-foreground mb-4">Receita por Serviço</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 15%, 90%)", fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
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
            {invoices.slice(0, 4).map(invoice => (
              <div key={invoice.id} className="flex items-center justify-between px-6 py-4">
                <Link to={`/faturas/${invoice.id}`} className="space-y-1 transition-opacity hover:opacity-80">
                  <p className="text-sm font-medium text-card-foreground">{invoice.number}</p>
                  <p className="text-xs text-muted-foreground">{invoice.clients?.company}</p>
                </Link>
                <div className="flex items-center gap-4">
                  <StatusBadge status={invoice.status} />
                  <span className="text-sm font-semibold text-card-foreground min-w-[80px] text-right">
                    {formatCurrency(getInvoiceItemsTotal(invoice.invoice_items))}
                  </span>
                </div>
              </div>
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
                  <p className="text-xs text-muted-foreground">{sub.clients?.company}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-card-foreground">{formatCurrency(Number(sub.amount))}/mês</p>
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
