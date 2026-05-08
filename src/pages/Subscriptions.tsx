import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play, Pencil, Plus, Search, Trash2, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSubscriptions,
  useClients,
  useSetSubscriptionStatus,
  useUpdateSubscription,
  useAddSubscription,
  useDeleteSubscription,
  useActiveServices,
  useAddInvoice,
  useNextInvoiceNumber,
  useSubscriptionStats,
} from "@/hooks/use-data";
import { frequencyLabels, formatCurrency, frequencyDays, getClientLabel, type SubscriptionFrequency, DEFAULT_IVA_PERCENTAGE } from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DeleteSubscriptionDialog } from "@/components/DeleteSubscriptionDialog";
import { PauseSubscriptionDialog } from "@/components/PauseSubscriptionDialog";
import { QuickCreateClientDialog } from "@/components/QuickCreateClientDialog";
import { QuickCreateServiceDialog } from "@/components/QuickCreateServiceDialog";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

type StatusFilter = "all" | "active" | "paused" | "cancelled";

export default function Subscriptions() {
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useActiveServices();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: stats = {} } = useSubscriptionStats();
  const { data: nextNumber = "" } = useNextInvoiceNumber();
  const [searchParams, setSearchParams] = useSearchParams();
  const setStatus = useSetSubscriptionStatus();
  const updateSub = useUpdateSubscription();
  const addSub = useAddSubscription();
  const deleteSub = useDeleteSubscription();
  const addInvoice = useAddInvoice();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pauseId, setPauseId] = useState<string | null>(null);
  const [generateInvoice, setGenerateInvoice] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [form, setForm] = useState({
    clientId: "",
    name: "",
    serviceId: "",
    amount: "",
    setupFee: "",
    frequency: "monthly" as SubscriptionFrequency,
    nextBillingDate: new Date().toISOString().split('T')[0],
    has_iva: true,
    iva_percentage: DEFAULT_IVA_PERCENTAGE,
  });
  // Track whether the user manually changed IVA settings; until they
  // do, we keep auto-syncing the IVA fields with the picked client so
  // the defaults always reflect the client's preferences.
  const [hasIvaTouched, setHasIvaTouched] = useState(false);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return subscriptions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!lower) return true;
      return (
        s.name.toLowerCase().includes(lower) ||
        (s.clients?.company ?? "").toLowerCase().includes(lower) ||
        (s.clients?.name ?? "").toLowerCase().includes(lower)
      );
    });
  }, [subscriptions, search, statusFilter]);

  const active = filtered.filter(s => s.status === "active");
  const paused = filtered.filter(s => s.status === "paused");
  const cancelled = filtered.filter(s => s.status === "cancelled");

  // Normalize every billing frequency into an equivalent monthly value
  // so MRR across mixed frequencies (weekly hosting, monthly SEO, annual
  // domains, ...) is comparable.
  const totalMRR = subscriptions
    .filter(s => s.status === "active")
    .reduce((sum, s) => {
      const amt = Number(s.amount);
      const periodDays = frequencyDays[s.frequency as SubscriptionFrequency] ?? 30;
      return sum + (amt * 30) / periodDays;
    }, 0);

  const openEditor = (id: string) => {
    const subscription = subscriptions.find(item => item.id === id);
    if (!subscription) return;
    setEditingId(subscription.id);
    const matchedService = services.find(s => s.name === subscription.name);
    setForm({
      clientId: subscription.client_id,
      name: subscription.name,
      serviceId: matchedService?.id || "",
      amount: String(Number(subscription.amount)),
      setupFee: "",
      frequency: subscription.frequency,
      nextBillingDate: subscription.next_billing_date,
      has_iva: subscription.has_iva ?? true,
      iva_percentage: Number(subscription.iva_percentage ?? DEFAULT_IVA_PERCENTAGE),
    });
    // Editing → IVA fields come from the subscription itself; don't
    // overwrite them with the client's defaults.
    setHasIvaTouched(true);
    setGenerateInvoice(false);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      clientId: "",
      name: "",
      serviceId: "",
      amount: "",
      setupFee: "",
      frequency: "monthly",
      nextBillingDate: new Date().toISOString().split('T')[0],
      has_iva: true,
      iva_percentage: DEFAULT_IVA_PERCENTAGE,
    });
    setHasIvaTouched(false);
    setGenerateInvoice(true);
    setDialogOpen(true);
  };

  // While creating a brand-new subscription, mirror the picked client's
  // IVA settings into the form until the user explicitly edits them.
  useEffect(() => {
    if (editingId || hasIvaTouched) return;
    const selected = clients.find(c => c.id === form.clientId);
    if (!selected) return;
    setForm(prev => ({
      ...prev,
      has_iva: selected.has_iva ?? true,
      iva_percentage: Number(selected.iva_percentage ?? DEFAULT_IVA_PERCENTAGE),
    }));
  }, [form.clientId, clients, hasIvaTouched, editingId]);

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
    if (editingId) {
      updateSub.mutate(
        {
          id: editingId,
          // The client picker is locked once the subscription exists
          // (changing the owner would invalidate every linked invoice
          // and complicate cascade rules). We omit client_id from the
          // payload as a defense-in-depth so a stale form state can't
          // override the original value.
          updates: {
            name: form.name,
            amount: Number(form.amount),
            frequency: form.frequency,
            next_billing_date: form.nextBillingDate,
            has_iva: form.has_iva,
            iva_percentage: form.has_iva ? Number(form.iva_percentage) || 0 : 0,
          },
        },
        {
          onSuccess: ({ syncedInvoiceIds }) => {
            handleDialogChange(false);
            // Tell the user truthfully what happened. The sync helper
            // skips paid invoices (fiscal documents — see PR #37) and
            // touches every other linked invoice. Future cron-generated
            // invoices automatically pick up the new amount because
            // generate_subscription_invoices() reads it from
            // subscription_items at emission time, so we mention that
            // too — this used to confuse users who thought the toast
            // implied it was retroactively touching paid invoices.
            const count = syncedInvoiceIds.length;
            const description = count === 0
              ? "As próximas faturas geradas automaticamente vão usar o novo valor. Faturas existentes pagas não são alteradas."
              : count === 1
              ? "1 fatura em aberto foi sincronizada. Próximas faturas automáticas usam o novo valor."
              : `${count} faturas em aberto foram sincronizadas. Próximas faturas automáticas usam o novo valor.`;
            toast({
              title: "Subscrição atualizada",
              description,
            });
          },
          onError: (err) =>
            toast({ title: "Erro", description: err.message, variant: "destructive" }),
        },
      );
    } else {
      addSub.mutate(
        {
          client_id: form.clientId,
          name: form.name,
          amount: Number(form.amount),
          frequency: form.frequency,
          next_billing_date: form.nextBillingDate,
          start_date: new Date().toISOString().split('T')[0],
          setup_fee: form.setupFee ? Number(form.setupFee) : null,
          has_iva: form.has_iva,
          iva_percentage: form.has_iva ? Number(form.iva_percentage) || 0 : 0,
        },
        {
          onSuccess: (createdSub) => {
            handleDialogChange(false);
            toast({ title: "Subscrição criada!" });

            if (generateInvoice && form.clientId && form.amount) {
              const now = new Date();
              const invoiceNumber = nextNumber || `FT ${now.getFullYear()}/${String(Date.now()).slice(-3).padStart(3, '0')}`;
              const dueDate = new Date(now);
              dueDate.setDate(dueDate.getDate() + 30);

              // Match every invoice line to the subscription_item it
              // came from so the bidirectional sync works from the
              // first second. The auto-generated invoice mirrors the
              // shape produced by useAddSubscription:
              //   sub_items[0] = recurring (description = sub name)
              //   sub_items[1] = setup    (when setup_fee > 0)
              // We pair by `kind` to be resilient to future changes
              // in seeding order.
              const recurringSubItem = createdSub.sub_items.find(si => si.kind === "recurring");
              const setupSubItem = createdSub.sub_items.find(si => si.kind === "setup");

              const items: Array<{
                description: string;
                quantity: number;
                unit_price: number;
                source_subscription_item_id: string | null;
              }> = [
                {
                  description: `${form.name} — ${MONTHS_PT[now.getMonth()]} ${now.getFullYear()}`,
                  quantity: 1,
                  unit_price: Number(form.amount),
                  source_subscription_item_id: recurringSubItem?.id ?? null,
                },
              ];
              if (form.setupFee && Number(form.setupFee) > 0) {
                items.push({
                  description: `Setup ${form.name}`,
                  quantity: 1,
                  unit_price: Number(form.setupFee),
                  source_subscription_item_id: setupSubItem?.id ?? null,
                });
              }

              addInvoice.mutate({
                invoice: {
                  number: invoiceNumber,
                  client_id: form.clientId,
                  // Stamp the parent reference on the invoice itself
                  // so InvoiceDetail's "Subscrições associadas"
                  // section picks it up immediately. Without this,
                  // the invoice shows up as orphan even though its
                  // line items are linked.
                  subscription_id: createdSub.id,
                  status: 'pending',
                  issue_date: now.toISOString().split('T')[0],
                  due_date: dueDate.toISOString().split('T')[0],
                  notes: `Fatura gerada automaticamente da subscrição: ${form.name}`,
                },
                items,
              }, {
                onSuccess: () => toast({ title: "Fatura gerada!", description: `Fatura ${invoiceNumber} criada automaticamente.` }),
              });
            }
          },
          onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteSub.mutate(deleteId, {
      onSuccess: ({ cascadedInvoiceIds, cascadedPaymentIds }) => {
        setConfirmOpen(false);
        setDeleteId(null);
        // Mirror InvoiceDetail's delete toast: report the actual
        // cascade so the user knows what landed in /lixo.
        const parts: string[] = [];
        if (cascadedInvoiceIds.length > 0) parts.push(`${cascadedInvoiceIds.length} fatura(s) em aberto`);
        if (cascadedPaymentIds.length > 0) parts.push(`${cascadedPaymentIds.length} pagamento(s)`);
        toast({
          title: "Subscrição eliminada",
          description: parts.length > 0
            ? `Também eliminados: ${parts.join(", ")}.`
            : undefined,
        });
      },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleResume = (id: string) => {
    setStatus.mutate(
      { id, status: "active" },
      {
        onSuccess: () => toast({ title: "Subscrição reativada" }),
        onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
      },
    );
  };

  const renderCard = (sub: typeof subscriptions[0]) => {
    const isActive = sub.status === "active";
    const isPaused = sub.status === "paused";
    const stat = stats[sub.id];
    return (
      <div key={sub.id} className={`rounded-xl border border-border bg-card p-6 shadow-card ${!isActive ? 'opacity-80' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <Link to={`/subscricoes/${sub.id}`} className="font-display font-semibold text-card-foreground hover:underline truncate flex items-center gap-1">
              {sub.name} <ExternalLink className="h-3 w-3 opacity-50" />
            </Link>
            <p className="text-xs text-muted-foreground truncate">
              {getClientLabel(sub)}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border whitespace-nowrap ${
            isActive ? 'bg-success/10 text-success border-success/20'
            : isPaused ? 'bg-warning/10 text-warning border-warning/20'
            : 'bg-muted text-muted-foreground border-border'
          }`}>
            {isActive ? 'Ativa' : isPaused ? 'Pausada' : 'Cancelada'}
          </span>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor</span>
            <span className="font-semibold text-card-foreground">{formatCurrency(Number(sub.amount))}/{frequencyLabels[sub.frequency].toLowerCase()}</span>
          </div>
          {isActive && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Próx. faturação</span>
              <span className="text-card-foreground">{new Date(sub.next_billing_date).toLocaleDateString('pt-PT')}</span>
            </div>
          )}
          {isPaused && sub.paused_until && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pausada até</span>
              <span className="text-card-foreground">{new Date(sub.paused_until).toLocaleDateString('pt-PT')}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Faturado em {new Date().getFullYear()}</span>
            <span className="text-card-foreground">{formatCurrency(stat?.revenueThisYear ?? 0)}</span>
          </div>
          {stat?.lastInvoiceDate && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Última fatura</span>
              <span className="text-card-foreground">{new Date(stat.lastInvoiceDate).toLocaleDateString('pt-PT')}</span>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => openEditor(sub.id)}>
              <Pencil className="h-3 w-3" /> Editar
            </Button>
            {isActive ? (
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => setPauseId(sub.id)}>
                <Pause className="h-3 w-3" /> Pausar
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => handleResume(sub.id)}>
                <Play className="h-3 w-3" /> Reativar
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => { setDeleteId(sub.id); setConfirmOpen(true); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSection = (title: string, items: typeof subscriptions, emptyMsg: string) => (
    <div className="space-y-4">
      <h2 className="font-display font-semibold text-foreground">{title} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(renderCard)}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Subscrições</h1>
          <p className="mt-1 text-muted-foreground">Receita recorrente mensal: <span className="font-semibold text-foreground">{formatCurrency(totalMRR)}</span></p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Nova Subscrição</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-primary" />
          <span>As faturas das subscrições recorrentes são geradas automaticamente todos os dias às 3 da manhã.</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por nome ou cliente…" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="paused">Pausadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(statusFilter === "all" || statusFilter === "active") && renderSection("Ativas", active, "Sem subscrições ativas.")}
      {(statusFilter === "all" || statusFilter === "paused") && paused.length > 0 && renderSection("Pausadas", paused, "")}
      {(statusFilter === "all" || statusFilter === "cancelled") && cancelled.length > 0 && renderSection("Canceladas", cancelled, "")}

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        {/* Wider on desktop: the form has 8+ fields after the IVA addition,
            so the default max-w-lg felt cramped. max-h+overflow lets short
            laptop screens still scroll the dialog body if needed. */}
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? 'Editar subscrição' : 'Nova subscrição'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="flex gap-2">
                <Select
                  value={form.clientId}
                  onValueChange={value => setForm(prev => ({ ...prev, clientId: value }))}
                  disabled={!!editingId}
                >
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>{client.company} — {client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editingId && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setQuickClientOpen(true)} title="Novo cliente">
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {editingId && (
                <p className="text-xs text-muted-foreground">
                  O cliente não pode ser alterado depois da subscrição estar criada.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Serviço</Label>
              <div className="flex gap-2">
                <Select value={form.serviceId} onValueChange={value => {
                  const svc = services.find(s => s.id === value);
                  if (svc) {
                    // Picking a service overwrites name + amount with the
                    // service's current values. The user can still edit
                    // either field afterwards if they want a one-off tweak.
                    setForm(prev => ({
                      ...prev,
                      serviceId: value,
                      name: svc.name,
                      amount: String(Number(svc.default_price)),
                    }));
                  }
                }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                  <SelectContent>
                    {services.map(svc => (
                      <SelectItem key={svc.id} value={svc.id}>
                        {svc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setQuickServiceOpen(true)} title="Novo serviço">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Auto-preenchido a partir do serviço"
              />
              <p className="text-xs text-muted-foreground">
                Preenchido automaticamente quando escolhes um serviço — só edita se quiseres um nome diferente para esta subscrição.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mensalidade (€)</Label>
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
            {!editingId && (
              <div className="space-y-2">
                <Label>Setup fee (€) — opcional</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.setupFee}
                  onChange={e => setForm(prev => ({ ...prev, setupFee: e.target.value }))}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">Cobrado uma única vez na primeira fatura.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Próxima faturação</Label>
              <Input type="date" value={form.nextBillingDate} onChange={e => setForm(prev => ({ ...prev, nextBillingDate: e.target.value }))} />
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Aplicar IVA</Label>
                  <p className="text-xs text-muted-foreground">
                    {editingId
                      ? "Só altera esta subscrição."
                      : "Por defeito copia a configuração do cliente."}
                  </p>
                </div>
                <Switch
                  checked={form.has_iva}
                  onCheckedChange={v => { setForm(prev => ({ ...prev, has_iva: v })); setHasIvaTouched(true); }}
                />
              </div>
              {form.has_iva && (
                <div className="space-y-2">
                  <Label className="text-sm">Percentagem de IVA (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.iva_percentage}
                    onChange={e => { setForm(prev => ({ ...prev, iva_percentage: Number(e.target.value) })); setHasIvaTouched(true); }}
                  />
                </div>
              )}
            </div>
            {!editingId && (
              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-muted/40">
                <div>
                  <p className="text-sm font-medium text-card-foreground">Gerar fatura agora</p>
                  <p className="text-xs text-muted-foreground">Cria a primeira fatura automaticamente</p>
                </div>
                <Switch checked={generateInvoice} onCheckedChange={setGenerateInvoice} />
              </div>
            )}
            <Button className="w-full" onClick={handleSave} disabled={(updateSub.isPending || addSub.isPending) || !form.clientId || !form.name || !form.amount}>
              {(updateSub.isPending || addSub.isPending) ? "A guardar..." : editingId ? "Guardar alterações" : "Criar subscrição"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PauseSubscriptionDialog
        subscriptionId={pauseId}
        onClose={() => setPauseId(null)}
      />

      <DeleteSubscriptionDialog
        subscriptionId={confirmOpen ? deleteId : null}
        isPending={deleteSub.isPending}
        onCancel={() => { setConfirmOpen(false); setDeleteId(null); }}
        onConfirm={handleDelete}
      />

      <QuickCreateClientDialog
        open={quickClientOpen}
        onOpenChange={setQuickClientOpen}
        onCreated={client => setForm(prev => ({ ...prev, clientId: client.id }))}
      />
      <QuickCreateServiceDialog
        open={quickServiceOpen}
        onOpenChange={setQuickServiceOpen}
        onCreated={svc => {
          // Mirror the existing picker behaviour: choosing a service
          // pre-fills name + amount from its defaults. We use the row
          // returned by the dialog directly (instead of re-querying
          // services.find) so we don't race the useActiveServices
          // refetch.
          setForm(prev => ({
            ...prev,
            serviceId: svc.id,
            name: svc.name,
            amount: String(Number(svc.default_price)),
          }));
        }}
      />
    </div>
  );
}
