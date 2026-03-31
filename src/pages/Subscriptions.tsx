import { useState } from "react";
import { RefreshCw, Plus, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sampleSubscriptions, sampleClients, serviceLabels, frequencyLabels, formatCurrency, type Subscription } from "@/lib/data";
import { cn } from "@/lib/utils";

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(sampleSubscriptions);

  const toggleActive = (id: string) => {
    setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  };

  const active = subscriptions.filter(s => s.active);
  const inactive = subscriptions.filter(s => !s.active);
  const totalMRR = active
    .reduce((sum, s) => {
      if (s.frequency === 'monthly') return sum + s.amount;
      if (s.frequency === 'quarterly') return sum + s.amount / 3;
      if (s.frequency === 'yearly') return sum + s.amount / 12;
      return sum;
    }, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Subscrições</h1>
          <p className="mt-1 text-muted-foreground">Receita recorrente mensal: <span className="font-semibold text-foreground">{formatCurrency(totalMRR)}</span></p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display font-semibold text-foreground">Ativas ({active.length})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map(sub => {
            const client = sampleClients.find(c => c.id === sub.clientId);
            return (
              <div key={sub.id} className="rounded-xl border border-border bg-card p-6 shadow-card">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-card-foreground">{sub.name}</h3>
                    <p className="text-xs text-muted-foreground">{client?.company}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-success/10 border border-success/20 px-2 py-0.5 text-xs font-semibold text-success">
                    Ativa
                  </span>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Serviço</span>
                    <span className="text-card-foreground">{serviceLabels[sub.serviceType]}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="font-semibold text-card-foreground">{formatCurrency(sub.amount)}/{frequencyLabels[sub.frequency].toLowerCase()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Próx. faturação</span>
                    <span className="text-card-foreground">{new Date(sub.nextBillingDate).toLocaleDateString('pt-PT')}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => toggleActive(sub.id)}>
                    <Pause className="h-3 w-3" /> Suspender
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {inactive.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-foreground">Inativas ({inactive.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map(sub => {
              const client = sampleClients.find(c => c.id === sub.clientId);
              return (
                <div key={sub.id} className="rounded-xl border border-border bg-card p-6 shadow-card opacity-70">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-display font-semibold text-card-foreground">{sub.name}</h3>
                      <p className="text-xs text-muted-foreground">{client?.company}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-muted border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      Inativa
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor</span>
                      <span className="text-card-foreground">{formatCurrency(sub.amount)}/{frequencyLabels[sub.frequency].toLowerCase()}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => toggleActive(sub.id)}>
                      <Play className="h-3 w-3" /> Reativar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
