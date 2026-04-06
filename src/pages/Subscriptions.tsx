import { useEffect, useState } from "react";
import { Pause, Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscriptions, useClients, useToggleSubscription, useUpdateSubscription } from "@/hooks/use-data";
import { serviceLabels, frequencyLabels, formatCurrency, type ServiceType, type SubscriptionFrequency } from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams } from "react-router-dom";

export default function Subscriptions() {
  const { data: clients = [] } = useClients();
  const { data: subscriptions = [] } = useSubscriptions();
  const [searchParams, setSearchParams] = useSearchParams();
  const toggleSub = useToggleSubscription();
  const updateSub = useUpdateSubscription();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    name: "",
    serviceType: "social_media" as ServiceType,
    amount: "",
    frequency: "monthly" as SubscriptionFrequency,
    nextBillingDate: "",
  });

  const active = subscriptions.filter(s => s.active);
  const inactive = subscriptions.filter(s => !s.active);
  const totalMRR = active.reduce((sum, s) => {
    const amt = Number(s.amount);
    if (s.frequency === 'monthly') return sum + amt;
    if (s.frequency === 'quarterly') return sum + amt / 3;
    if (s.frequency === 'yearly') return sum + amt / 12;
    return sum;
  }, 0);

  const openEditor = (id: string) => {
    const subscription = subscriptions.find(item => item.id === id);
    if (!subscription) return;

    setEditingId(subscription.id);
    setForm({
      clientId: subscription.client_id,
      name: subscription.name,
      serviceType: subscription.service_type,
      amount: String(Number(subscription.amount)),
      frequency: subscription.frequency,
      nextBillingDate: subscription.next_billing_date,
    });
    setDialogOpen(true);
  };

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || subscriptions.length === 0 || dialogOpen) return;
    if (subscriptions.some(subscription => subscription.id === editId)) {
      openEditor(editId);
    }
  }, [searchParams, subscriptions, dialogOpen]);

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setSearchParams({}, { replace: true });
    }
  };

  const handleSave = () => {
    if (!editingId) return;

    updateSub.mutate(
      {
        id: editingId,
        updates: {
          client_id: form.clientId,
          name: form.name,
          service_type: form.serviceType,
          amount: Number(form.amount),
          frequency: form.frequency,
          next_billing_date: form.nextBillingDate,
        },
      },
      {
        onSuccess: () => handleDialogChange(false),
      },
    );
  };

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
          {active.map(sub => (
            <div key={sub.id} className="rounded-xl border border-border bg-card p-6 shadow-card">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-display font-semibold text-card-foreground">{sub.name}</h3>
                  <p className="text-xs text-muted-foreground">{sub.clients?.company}</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-success/10 border border-success/20 px-2 py-0.5 text-xs font-semibold text-success">Ativa</span>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Serviço</span>
                  <span className="text-card-foreground">{serviceLabels[sub.service_type]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-semibold text-card-foreground">{formatCurrency(Number(sub.amount))}/{frequencyLabels[sub.frequency].toLowerCase()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Próx. faturação</span>
                  <span className="text-card-foreground">{new Date(sub.next_billing_date).toLocaleDateString('pt-PT')}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => openEditor(sub.id)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => toggleSub.mutate({ id: sub.id, active: false })}>
                    <Pause className="h-3 w-3" /> Suspender
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {inactive.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-foreground">Inativas ({inactive.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map(sub => (
              <div key={sub.id} className="rounded-xl border border-border bg-card p-6 shadow-card opacity-70">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="font-display font-semibold text-card-foreground">{sub.name}</h3>
                    <p className="text-xs text-muted-foreground">{sub.clients?.company}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-muted border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inativa</span>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="text-card-foreground">{formatCurrency(Number(sub.amount))}/{frequencyLabels[sub.frequency].toLowerCase()}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => openEditor(sub.id)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => toggleSub.mutate({ id: sub.id, active: true })}>
                      <Play className="h-3 w-3" /> Reativar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Editar subscrição</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={form.clientId} onValueChange={value => setForm(prev => ({ ...prev, clientId: value }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.company} — {client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Serviço</Label>
              <Select value={form.serviceType} onValueChange={value => setForm(prev => ({ ...prev, serviceType: value as ServiceType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(serviceLabels) as [ServiceType, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Valor (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select value={form.frequency} onValueChange={value => setForm(prev => ({ ...prev, frequency: value as SubscriptionFrequency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(frequencyLabels) as [SubscriptionFrequency, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Próxima faturação</Label>
              <Input type="date" value={form.nextBillingDate} onChange={e => setForm(prev => ({ ...prev, nextBillingDate: e.target.value }))} />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={updateSub.isPending || !form.clientId || !form.name || !form.amount}>
              {updateSub.isPending ? "A guardar..." : "Guardar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
