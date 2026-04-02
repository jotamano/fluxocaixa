import { Euro, Users, FileText, RefreshCw, TrendingUp, AlertTriangle, Bell } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { sampleInvoices, sampleClients, sampleSubscriptions, getInvoiceTotal, formatCurrency, serviceLabels } from "@/lib/data";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const CHART_COLORS = [
  "hsl(220, 70%, 45%)",   // primary blue
  "hsl(160, 60%, 40%)",   // accent green
  "hsl(38, 92%, 50%)",    // warning amber
  "hsl(280, 60%, 50%)",   // purple
];

export default function Dashboard() {
  const totalRevenue = sampleInvoices
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + getInvoiceTotal(i), 0);

  const pendingAmount = sampleInvoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + getInvoiceTotal(i), 0);

  const activeSubscriptions = sampleSubscriptions.filter(s => s.active);
  const monthlyRecurring = activeSubscriptions
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);

  // Overdue invoices for notifications
  const overdueInvoices = sampleInvoices.filter(i => i.status === 'overdue');
  const pendingInvoices = sampleInvoices.filter(i => i.status === 'pending');

  // Revenue by month data
  const monthlyData = [
    { month: "Set", value: 1200 },
    { month: "Out", value: 1800 },
    { month: "Nov", value: 1450 },
    { month: "Dez", value: 2100 },
    { month: "Jan", value: 750 },
    { month: "Fev", value: 1500 },
  ];

  // Revenue by service type
  const serviceRevenue = sampleInvoices.reduce((acc, inv) => {
    inv.items.forEach(item => {
      const key = item.serviceType;
      acc[key] = (acc[key] || 0) + item.quantity * item.unitPrice;
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

      {/* Notifications banner */}
      {(overdueInvoices.length > 0 || pendingInvoices.length > 0) && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex items-start gap-3">
          <Bell className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            {overdueInvoices.length > 0 && (
              <p className="text-sm text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 inline text-destructive mr-1" />
                <span className="font-semibold">{overdueInvoices.length} fatura(s) vencida(s)</span> — {overdueInvoices.map(i => {
                  const c = sampleClients.find(cl => cl.id === i.clientId);
                  return `${i.number} (${c?.company})`;
                }).join(", ")}
              </p>
            )}
            {pendingInvoices.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">{pendingInvoices.length} fatura(s) pendente(s)</span> no valor total de {formatCurrency(pendingInvoices.reduce((s, i) => s + getInvoiceTotal(i), 0))}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Receita Total" value={formatCurrency(totalRevenue)} subtitle="+12% vs mês anterior" trend="up" icon={Euro} />
        <StatCard title="Valores Pendentes" value={formatCurrency(pendingAmount)} subtitle={`${overdueInvoices.length} fatura(s) vencida(s)`} trend="down" icon={TrendingUp} />
        <StatCard title="Clientes Ativos" value={String(sampleClients.length)} subtitle="+2 este mês" trend="up" icon={Users} />
        <StatCard title="Receita Recorrente" value={formatCurrency(monthlyRecurring)} subtitle={`${activeSubscriptions.length} subscrições ativas`} trend="neutral" icon={RefreshCw} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card shadow-card p-6">
          <h2 className="font-display font-semibold text-card-foreground mb-4">Receita Mensal</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} tickFormatter={v => `${v}€`} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Receita"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 15%, 90%)", fontSize: 13 }}
                />
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
        {/* Recent Invoices */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display font-semibold text-card-foreground">Faturas Recentes</h2>
            <Link to="/faturas" className="text-sm font-medium text-primary hover:underline">Ver todas</Link>
          </div>
          <div className="divide-y divide-border">
            {sampleInvoices.slice(0, 4).map(invoice => {
              const client = sampleClients.find(c => c.id === invoice.clientId);
              return (
                <div key={invoice.id} className="flex items-center justify-between px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-card-foreground">{invoice.number}</p>
                    <p className="text-xs text-muted-foreground">{client?.company}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={invoice.status} />
                    <span className="text-sm font-semibold text-card-foreground min-w-[80px] text-right">
                      {formatCurrency(getInvoiceTotal(invoice))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="font-display font-semibold text-card-foreground">Subscrições Ativas</h2>
            <Link to="/subscricoes" className="text-sm font-medium text-primary hover:underline">Ver todas</Link>
          </div>
          <div className="divide-y divide-border">
            {activeSubscriptions.map(sub => {
              const client = sampleClients.find(c => c.id === sub.clientId);
              return (
                <div key={sub.id} className="flex items-center justify-between px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-card-foreground">{sub.name}</p>
                    <p className="text-xs text-muted-foreground">{client?.company}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-card-foreground">{formatCurrency(sub.amount)}/mês</p>
                    <p className="text-xs text-muted-foreground">Próx: {new Date(sub.nextBillingDate).toLocaleDateString('pt-PT')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
