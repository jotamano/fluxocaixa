import { useMemo, useState } from "react";
import { ArrowLeft, Download, Wallet, Trash2, Pencil, Plus, X, Copy } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { PaymentDialog } from "@/components/PaymentDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Subscription } from "@/hooks/use-data";
import { useInvoices, usePayments, useDeleteInvoice, useUpdateInvoice, useUpdateInvoiceItems, useActiveServices, useDuplicateInvoice, useSubscriptions, useClientSubscriptionItems } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, getClientLabel, methodLabels, frequencyLabels, type SubscriptionFrequency } from "@/lib/data";
import { generateInvoicePDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Sentinel value used by the per-new-line frequency picker to signal
// "don't spawn a subscription for this line". Radix Select disallows
// the empty string as an item value, so we use a non-empty token.
const NO_SPAWN = "__none__";

interface EditItem {
  // Carry the row's DB id when it already exists. Without this the
  // update path becomes destructive (delete+insert), which would null
  // out invoice_items.source_subscription_item_id and break the link
  // between an invoice line and the subscription line it spawned.
  id?: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  // Per-new-line picker for spawning subscriptions. `undefined` = use
  // the page-level default; `NO_SPAWN` = explicitly skip.
  newLineFrequency?: SubscriptionFrequency | typeof NO_SPAWN;
  // Only meaningful for EXISTING lines (id set):
  //   - undefined → don't touch the link column on save
  //   - string    → user picked a sub_item to link to
  //   - null      → user explicitly unlinked
  linkChange?: string | null;
  // The link as it currently exists in the DB; populated when the
  // editor opens. Used to render the "Ligar a subscrição..." button
  // text vs. "Ligado a ...".
  currentLink?: string | null;
}

export default function InvoiceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const { data: services = [] } = useActiveServices();
  const { data: subscriptions = [] } = useSubscriptions();
  const deleteInvoice = useDeleteInvoice();
  const updateInvoice = useUpdateInvoice();
  const updateItems = useUpdateInvoiceItems();
  const duplicateInvoice = useDuplicateInvoice();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ issue_date: '', due_date: '', notes: '', status: '' });
  const [editItemsOpen, setEditItemsOpen] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  // index of the line whose link picker is open (null = closed).
  const [linkPickerForIndex, setLinkPickerForIndex] = useState<number | null>(null);

  const invoice = useMemo(() => invoices.find(item => item.id === id), [invoices, id]);
  const invoicePayments = useMemo(() => payments.filter(payment => payment.invoice_id === id), [payments, id]);
  // All sub_items belonging to this invoice's client. Powers the
  // "Ligar a subscrição..." picker. Empty when the invoice has no
  // client_id, which is also when we don't show the picker UI at all.
  const { data: clientSubItems = [] } = useClientSubscriptionItems(invoice?.client_id ?? null);

  // Subscriptions actually associated with this invoice:
  //   1. invoice.subscription_id  — set on cron-generated invoices
  //      (subscription → invoice direction).
  //   2. subscription.source_invoice_id == invoice.id — set on subs
  //      created by NewInvoice's "Fatura recorrente" toggle for *this*
  //      invoice (invoice → subscription direction).
  // Subs that just happen to belong to the same client without either
  // link are *not* shown here — those are reachable from /subscricoes.
  const sourceSubscription = useMemo(() => {
    if (!invoice?.subscription_id) return null;
    return subscriptions.find(s => s.id === invoice.subscription_id) ?? null;
  }, [subscriptions, invoice]);
  const childSubscriptions = useMemo(() => {
    if (!invoice) return [];
    return subscriptions.filter(s => s.source_invoice_id === invoice.id);
  }, [subscriptions, invoice]);

  // True when at least one line on this invoice is already linked to a
  // subscription (cron-generated invoice OR NewInvoice-spawned subs).
  // Used to decide whether NEW lines should also spawn subscriptions on
  // save — matching the pattern the user already established for this
  // invoice.
  const isRecurringInvoice = !!sourceSubscription || childSubscriptions.length > 0;

  // The frequency we'll default to when spawning a sub for a brand-new
  // line. Picks the most common frequency among already-linked subs to
  // avoid surprising the user; falls back to monthly otherwise.
  const defaultSpawnFrequency: SubscriptionFrequency = useMemo(() => {
    const linked: Subscription[] = [];
    if (sourceSubscription) linked.push(sourceSubscription);
    linked.push(...childSubscriptions);
    if (linked.length === 0) return "monthly";
    const counts: Partial<Record<SubscriptionFrequency, number>> = {};
    for (const s of linked) counts[s.frequency] = (counts[s.frequency] ?? 0) + 1;
    let bestFreq: SubscriptionFrequency = linked[0].frequency;
    let bestCount = 0;
    for (const [freq, count] of Object.entries(counts) as [SubscriptionFrequency, number][]) {
      if (count > bestCount) { bestFreq = freq; bestCount = count; }
    }
    return bestFreq;
  }, [sourceSubscription, childSubscriptions]);

  if (invoicesLoading || paymentsLoading) {
    return <div className="py-10 text-sm text-muted-foreground">A carregar fatura...</div>;
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="font-display text-2xl font-bold text-foreground">Fatura não encontrada</h1>
          <p className="mt-2 text-muted-foreground">Esta fatura já não existe ou ainda não foi carregada.</p>
        </div>
      </div>
    );
  }

  const total = getInvoiceItemsTotal(invoice.invoice_items);
  const paidTotal = invoicePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = Math.max(total - paidTotal, 0);
  const effectiveStatus = outstanding <= 0 && total > 0 ? "paid" : paidTotal > 0 && paidTotal < total ? "partially_paid" : invoice.status;


  const handleDelete = () => {
    deleteInvoice.mutate(invoice.id, {
      onSuccess: () => { toast({ title: "Fatura eliminada" }); navigate("/faturas"); },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const openEdit = () => {
    setEditForm({
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      notes: invoice.notes || '',
      status: invoice.status,
    });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    updateInvoice.mutate({
      id: invoice.id,
      updates: {
        issue_date: editForm.issue_date,
        due_date: editForm.due_date,
        notes: editForm.notes || null,
        status: editForm.status as any,
      },
    }, {
      onSuccess: () => { setEditOpen(false); toast({ title: "Fatura atualizada!" }); },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const openEditItems = () => {
    setEditItems(invoice.invoice_items.map(item => ({
      id: item.id,
      serviceId: "",
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      currentLink: item.source_subscription_item_id ?? null,
    })));
    setLinkPickerForIndex(null);
    setEditItemsOpen(true);
  };

  const updateEditItem = (index: number, field: keyof EditItem, value: string | number | null) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value } as EditItem;
      if (field === 'serviceId') {
        const svc = services.find(s => s.id === value);
        if (svc) {
          const now = new Date();
          updated.unitPrice = Number(svc.default_price);
          updated.description = `${svc.name} — ${MONTHS_PT[now.getMonth()]} ${now.getFullYear()}`;
        }
      }
      return updated;
    }));
  };

  const addEditItem = () => {
    setEditItems(prev => [...prev, { serviceId: "", description: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveItems = () => {
    if (editItems.some(i => !i.description || i.unitPrice <= 0)) {
      toast({ title: "Erro", description: "Preenche todos os campos dos serviços", variant: "destructive" });
      return;
    }
    // Sync edits into linked subscription_items only while the invoice
    // is still un-paid. Once the user has marked it paid, the invoice
    // is a historical record — we don't retroactively change the
    // subscription pricing based on changes to a paid invoice.
    const syncToSubscriptions = invoice.status !== "paid";
    // We spawn from the editor whenever there's a client to attach
    // the new sub to AND the invoice is still editable. Per-line
    // picker decides which lines actually become subscriptions.
    const shouldSpawn = !!invoice.client_id
      && editItems.some(i => !i.id)
      && syncToSubscriptions;

    updateItems.mutate({
      invoiceId: invoice.id,
      syncToSubscriptions,
      spawnSubscriptionForNewLines: shouldSpawn
        ? { clientId: invoice.client_id }
        : undefined,
      items: editItems.map((i, idx) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        position: idx,
        // NO_SPAWN sentinel maps to "leave undefined"; the mutation
        // skips spawning for any line whose freq is falsy.
        newLineFrequency:
          i.newLineFrequency && i.newLineFrequency !== NO_SPAWN
            ? i.newLineFrequency
            : undefined,
        newLineServiceName: i.serviceId
          ? services.find(s => s.id === i.serviceId)?.name
          : undefined,
        // Manual link override: only present on existing rows where
        // the user opened the picker and chose something.
        linkToSubscriptionItemId: i.id ? i.linkChange : undefined,
      })),
    }, {
      onSuccess: result => {
        setEditItemsOpen(false);
        const parts: string[] = [];
        if (result.syncedSubscriptionIds.length > 0) {
          parts.push(`${result.syncedSubscriptionIds.length} subscrição(ões) sincronizada(s)`);
        }
        if (result.spawnedSubscriptionIds.length > 0) {
          parts.push(`${result.spawnedSubscriptionIds.length} nova(s) subscrição(ões) criada(s)`);
        }
        toast({
          title: "Itens atualizados!",
          description: parts.length > 0
            ? parts.join(" · ")
            : (syncToSubscriptions
              ? "Sem subscrições ligadas — apenas a fatura foi alterada."
              : "Fatura paga — subscrições associadas não foram alteradas."),
        });
      },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <Button variant="ghost" className="w-fit gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-foreground">{invoice.number}</h1>
              <StatusBadge status={effectiveStatus} />
            </div>
            <p className="mt-1 text-muted-foreground">
              Cliente: <Link to={`/clientes/${invoice.client_id}`} className="font-medium text-primary hover:underline">{getClientLabel(invoice)}</Link>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="gap-2" onClick={openEdit}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() =>
              duplicateInvoice.mutate(invoice.id, {
                onSuccess: (created) => {
                  toast({ title: "Fatura duplicada", description: `Criada ${created.number} em rascunho.` });
                  navigate(`/faturas/${created.id}`);
                },
                onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
              })
            }
            disabled={duplicateInvoice.isPending}
          >
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => invoice.clients && generateInvoicePDF(invoice, invoice.clients)} disabled={!invoice.clients}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          {outstanding > 0 && (
            <Button className="gap-2" onClick={() => setPaymentDialogOpen(true)}>
              <Wallet className="h-4 w-4" /> Pagar
            </Button>
          )}
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="h-4 w-4" /> Anular
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(total)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Recebido</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(paidTotal)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Em aberto</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(outstanding)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-6 py-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Serviços da fatura</h2>
            <Button variant="outline" size="sm" className="gap-1" onClick={openEditItems}>
              <Pencil className="h-3 w-3" /> Editar itens
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Qtd</th>
                  <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Preço</th>
                  <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.invoice_items.map(item => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-card-foreground">{item.description}</td>
                    <td className="px-6 py-4 text-right text-card-foreground">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-card-foreground">{formatCurrency(Number(item.unit_price))}</td>
                    <td className="px-6 py-4 text-right font-semibold text-card-foreground">{formatCurrency(item.quantity * Number(item.unit_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Dados</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Emissão</span>
                <span className="text-card-foreground">{new Date(invoice.issue_date).toLocaleDateString("pt-PT")}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Vencimento</span>
                <span className="text-card-foreground">{new Date(invoice.due_date).toLocaleDateString("pt-PT")}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Cliente</span>
                <span className="text-card-foreground">{invoice.clients?.name || "—"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Pagamentos</h2>
            {invoicePayments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Ainda não existem pagamentos ligados a esta fatura.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {invoicePayments.map(payment => (
                  <Link key={payment.id} to={`/pagamentos/${payment.id}`} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{methodLabels[payment.method]}</p>
                      <p className="text-xs text-muted-foreground">{new Date(payment.date).toLocaleDateString("pt-PT")}</p>
                    </div>
                    <span className="text-sm font-semibold text-card-foreground">{formatCurrency(Number(payment.amount))}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {invoice.notes && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Notas</h2>
              <p className="mt-4 text-sm text-muted-foreground">{invoice.notes}</p>
            </div>
          )}

          {(sourceSubscription || childSubscriptions.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h2 className="font-display text-lg font-semibold text-card-foreground">
                Subscrições associadas
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {invoice.status === "paid"
                  ? "Fatura paga — abre cada subscrição para a editar (mudanças aqui não se propagam)."
                  : "Editar preço ou descrição nos itens da fatura sincroniza com a subscrição respectiva."}
              </p>
              <div className="mt-4 space-y-2">
                {sourceSubscription && (
                  <SubscriptionRow
                    subscription={sourceSubscription}
                    badge="Origem desta fatura"
                  />
                )}
                {childSubscriptions.map(sub => (
                  <SubscriptionRow key={sub.id} subscription={sub} badge="Criada desta fatura" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit invoice dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Editar Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Data de emissão</Label>
                <Input type="date" value={editForm.issue_date} onChange={e => setEditForm(p => ({ ...p, issue_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Data de vencimento</Label>
                <Input type="date" value={editForm.due_date} onChange={e => setEditForm(p => ({ ...p, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Paga</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                  <SelectItem value="partially_paid">Parcialmente Paga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações..." />
            </div>
            <Button className="w-full" onClick={handleEditSave} disabled={updateInvoice.isPending}>
              {updateInvoice.isPending ? "A guardar..." : "Guardar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit invoice items dialog */}
      <Dialog open={editItemsOpen} onOpenChange={setEditItemsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Serviços da Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {editItems.map((item, index) => (
              <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-muted-foreground">Item {index + 1}</Label>
                  {editItems.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeEditItem(index)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Serviço (opcional)</Label>
                  <Select value={item.serviceId} onValueChange={v => updateEditItem(index, 'serviceId', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                    <SelectContent>
                      {services.map(svc => (
                        <SelectItem key={svc.id} value={svc.id}>{svc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={item.description} onChange={e => updateEditItem(index, 'description', e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Quantidade</Label>
                    <Input type="number" min={1} value={item.quantity} onChange={e => updateEditItem(index, 'quantity', Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço (€)</Label>
                    <Input type="number" min={0} step="0.01" value={item.unitPrice} onChange={e => updateEditItem(index, 'unitPrice', Number(e.target.value))} />
                  </div>
                </div>
                {/* Frequency picker for NEW lines. Visible whenever
                    the invoice has a client to attach the new sub to.
                    Default is "Não criar subscrição" unless this
                    invoice already has at least one linked sub, in
                    which case we default to that flow's frequency. */}
                {!item.id && invoice.client_id && (
                  <div className="space-y-1">
                    <Label className="text-xs">Subscrição para esta linha</Label>
                    <Select
                      value={
                        item.newLineFrequency
                          ?? (isRecurringInvoice ? defaultSpawnFrequency : NO_SPAWN)
                      }
                      onValueChange={v => updateEditItem(index, 'newLineFrequency', v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SPAWN}>Não criar subscrição</SelectItem>
                        {(Object.entries(frequencyLabels) as [SubscriptionFrequency, string][]).map(([freq, label]) => (
                          <SelectItem key={freq} value={freq}>Criar subscrição {label.toLowerCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {(item.newLineFrequency ?? (isRecurringInvoice ? defaultSpawnFrequency : NO_SPAWN)) === NO_SPAWN
                        ? "Esta linha entra apenas na fatura."
                        : "Esta linha vai também criar uma nova subscrição ao guardar."}
                    </p>
                  </div>
                )}
                {/* Link picker for EXISTING lines. Lets the user
                    attach an invoice line to one of the client's
                    existing subscription_items so future edits sync
                    in both directions. Only shown when the invoice
                    has a client (otherwise there are no subs to pick
                    from). */}
                {item.id && invoice.client_id && (
                  <LinkSubItemPicker
                    line={item}
                    options={clientSubItems}
                    open={linkPickerForIndex === index}
                    setOpen={(open) => setLinkPickerForIndex(open ? index : null)}
                    onChange={(value) => updateEditItem(index, 'linkChange', value)}
                  />
                )}
              </div>
            ))}
            <Button variant="outline" className="w-full gap-2" onClick={addEditItem}>
              <Plus className="h-4 w-4" /> Adicionar Serviço
            </Button>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <p className="text-lg font-bold font-display text-card-foreground">
                Total: {formatCurrency(editItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}
              </p>
              <Button onClick={handleSaveItems} disabled={updateItems.isPending}>
                {updateItems.isPending ? "A guardar..." : "Guardar itens"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} invoices={[invoice]} initialInvoiceId={invoice.id} title="Registar pagamento nesta fatura" />
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Anular fatura" description={`Tens a certeza que queres anular a fatura ${invoice.number}? Esta ação é irreversível.`} onConfirm={handleDelete} isPending={deleteInvoice.isPending} />
    </div>
  );
}

const subscriptionStatusLabels: Record<Subscription["status"], string> = {
  active: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

const subscriptionStatusClasses: Record<Subscription["status"], string> = {
  active: "bg-success/10 text-success border-success/20",
  paused: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function SubscriptionRow({ subscription, badge }: { subscription: Subscription; badge?: string }) {
  return (
    <Link
      to={`/subscricoes/${subscription.id}`}
      className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-card-foreground">{subscription.name}</p>
            {badge && (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(Number(subscription.amount))} / {frequencyLabels[subscription.frequency].toLowerCase()}
            {" · próxima "}
            {new Date(subscription.next_billing_date).toLocaleDateString("pt-PT")}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${subscriptionStatusClasses[subscription.status]}`}>
          {subscriptionStatusLabels[subscription.status]}
        </span>
      </div>
    </Link>
  );
}

interface LinkSubItemPickerProps {
  line: EditItem;
  options: import("@/hooks/use-data").SubscriptionItemWithSubscription[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onChange: (value: string | null) => void;
}

/**
 * Inline picker that lets the user attach an existing invoice line to
 * one of the client's subscription_items. Renders a status row + an
 * expand toggle; when expanded, shows a dropdown of all available
 * sub_items, grouped by parent subscription. Selecting an item stages
 * the link change in the parent's editItems state — it's only
 * persisted when the user hits "Guardar itens".
 */
function LinkSubItemPicker({ line, options, open, setOpen, onChange }: LinkSubItemPickerProps) {
  // Effective link = uncommitted change OR the link as it exists in DB.
  const effective: string | null = line.linkChange !== undefined ? line.linkChange : (line.currentLink ?? null);
  const linkedItem = effective ? options.find(o => o.id === effective) : null;

  const statusText = linkedItem
    ? `Ligado a: ${linkedItem.subscriptions?.name ?? "?"} → ${linkedItem.description}`
    : "Não ligado a nenhuma subscrição";

  return (
    <div className="space-y-1 rounded-md border border-dashed border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">{statusText}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOpen(!open)}
        >
          {open ? "Fechar" : (linkedItem ? "Alterar" : "Ligar a subscrição...")}
        </Button>
      </div>
      {open && (
        <div className="space-y-1 pt-1">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground">Este cliente não tem subscrições.</p>
          ) : (
            <>
              <Select
                value={effective ?? "__unlink__"}
                onValueChange={v => onChange(v === "__unlink__" ? null : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unlink__">Não ligado</SelectItem>
                  {options.map(opt => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.subscriptions?.name ?? "?"} → {opt.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ao ligar, futuras edições nesta linha (preço, descrição) sincronizam para a subscrição enquanto a fatura não estiver paga.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
