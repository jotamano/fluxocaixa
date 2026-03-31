import { Euro, Users, FileText, RefreshCw, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { sampleInvoices, sampleClients, sampleSubscriptions, getInvoiceTotal, formatCurrency } from "@/lib/data";
import { Link } from "react-router-dom";

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

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Visão geral do teu negócio de marketing digital</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Receita Total"
          value={formatCurrency(totalRevenue)}
          subtitle="+12% vs mês anterior"
          trend="up"
          icon={Euro}
        />
        <StatCard
          title="Valores Pendentes"
          value={formatCurrency(pendingAmount)}
          subtitle={`${sampleInvoices.filter(i => i.status === 'overdue').length} fatura(s) vencida(s)`}
          trend="down"
          icon={TrendingUp}
        />
        <StatCard
          title="Clientes Ativos"
          value={String(sampleClients.length)}
          subtitle="+2 este mês"
          trend="up"
          icon={Users}
        />
        <StatCard
          title="Receita Recorrente"
          value={formatCurrency(monthlyRecurring)}
          subtitle={`${activeSubscriptions.length} subscrições ativas`}
          trend="neutral"
          icon={RefreshCw}
        />
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
