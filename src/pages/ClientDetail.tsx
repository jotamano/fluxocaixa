import { useState, useMemo } from "react";
import { ArrowLeft, Building2, Mail, Phone, FileDown, Trash2, FileText, CreditCard, UserPlus, Clock, Pencil, FilePlus2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useClients, useInvoices, usePayments, useSubscriptions, useDeleteClient, useUpdateClient, useSyncIva } from "@/hooks/use-data";
import { DEFAULT_IVA_PERCENTAGE, formatCurrency, getInvoiceTotalWithIva, getAmountWithIva, frequencyLabels, methodLabels } from "@/lib/data";
import { generateClientStatement } from "@/lib/statement";
import { useToast } from "@/hooks/use-toast";

interface TimelineEvent {
  date: Date;
  type: 'client_created' | 'invoice_created' | 'payment_received';
  title: string;
  subtitle?: string;
  icon: typeof FileText;
  color: string;
}

export default function ClientDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useSubscriptions();
  const deleteClient = useDeleteClient();
  const updateClient = useUpdateClient();
  const syncIva = useSyncIva();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '', email: '', company: '', phone: '', nif: '',
    has_iva: true, iva_percentage: DEFAULT_IVA_PERCENTAGE,
  });

  if (clientsLoading || invoicesLoading || paymentsLoading || subscriptionsLoading) {
    return <div className="py-10 text-sm text-muted-foreground">A carregar cliente...</div>;
  }

  const client = clients.find(item => item.id === id);

  if (!client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="font-display text-2xl font-bold text-foreground">Cliente não encontrado</h1>
        </div>
      </div>
    );
  }

  const clientInvoices = invoices.filter(invoice => invoice.client_id === client.id);
  const clientPayments = payments.filter(payment => payment.client_id === client.id);
  const clientSubscriptions = subscriptions.filter(subscription => subscription.client_id === client.id);

  const totalBilled = clientInvoices.reduce((sum, invoice) => sum + getInvoiceTotalWithIva(invoice.invoice_items, invoice), 0);
  const totalPaid = clientPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = Math.max(totalBilled - totalPaid, 0);

  const timeline: TimelineEvent[] = (() => {
    const events: TimelineEvent[] = [];
    events.push({ date: new Date(client.created_at), type: 'client_created', title: 'Cliente registado', subtitle: client.company, icon: UserPlus, color: 'text-primary' });
    clientInvoices.forEach(inv => {
      events.push({ date: new Date(inv.created_at), type: 'invoice_created', title: `Fatura ${inv.number} criada`, subtitle: formatCurrency(getInvoiceTotalWithIva(inv.invoice_items, inv)), icon: FileText, color: 'text-warning' });
    });
    clientPayments.forEach(pay => {
      events.push({ date: new Date(pay.created_at), type: 'payment_received', title: `Pagamento recebido`, subtitle: `${formatCurrency(Number(pay.amount))} — ${methodLabels[pay.method]}`, icon: CreditCard, color: 'text-success' });
    });
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  })();

  const handleDelete = () => {
    deleteClient.mutate(client.id, {
      onSuccess: () => { toast({ title: "Cliente eliminado" }); navigate("/clientes"); },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const openEdit = () => {
    setEditForm({
      name: client.name,
      email: client.email,
      company: client.company,
      phone: client.phone || '',
      nif: client.nif || '',
      has_iva: client.has_iva ?? true,
      iva_percentage: Number(client.iva_percentage ?? DEFAULT_IVA_PERCENTAGE),
    });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    // Save the non-IVA fields directly. The IVA pair is routed through
    // the sync_iva RPC so it cascades to every linked subscription and
    // every still-editable invoice in one round-trip.
    updateClient.mutate(
      {
        id: client.id,
        updates: {
          name: editForm.name,
          email: editForm.email,
          company: editForm.company,
          phone: editForm.phone,
          nif: editForm.nif,
        },
      },
      {
        onSuccess: () => {
          syncIva.mutate(
            {
              source: "client",
              sourceId: client.id,
              hasIva: editForm.has_iva,
              ivaPercentage: Number(editForm.iva_percentage) || 0,
            },
            {
              onSuccess: () => { setEditOpen(false); toast({ title: "Cliente atualizado!", description: "IVA propagado para subscrições e faturas em aberto." }); },
              onError: (err) => toast({ title: "Erro a sincronizar IVA", description: err.message, variant: "destructive" }),
            },
          );
        },
        onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Button variant="ghost" className="w-fit gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">{client.company}</h1>
            <p className="mt-1 text-muted-foreground">{client.name}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              <Link to={`/faturas/nova?clientId=${client.id}`}>
                <Button className="gap-2">
                  <FilePlus2 className="h-4 w-4" /> Nova fatura
                </Button>
              </Link>
              <Button variant="outline" className="gap-2" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => generateClientStatement(client, invoices, payments)}>
                <FileDown className="h-4 w-4" /> Extrato
              </Button>
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {client.email}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {client.phone || "Sem telefone"}</div>
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> NIF: {client.nif || "Sem NIF"}</div>
              <div className="flex items-center gap-2">
                <Badge variant={client.has_iva ? "secondary" : "outline"} className="text-[10px] font-medium">
                  {client.has_iva ? `IVA ${Number(client.iva_percentage)}%` : "Sem IVA"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Total faturado</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(totalBilled)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Total pago</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Em dívida</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(outstanding)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Subscrições ativas</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{clientSubscriptions.filter(s => s.active).length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-display text-lg font-semibold text-card-foreground">Faturas do cliente</h2>
            </div>
            <div className="divide-y divide-border">
              {clientInvoices.length === 0 ? (
                <p className="px-6 py-8 text-sm text-muted-foreground">Ainda não existem faturas para este cliente.</p>
              ) : (
                clientInvoices.map(invoice => (
                  <Link key={invoice.id} to={`/faturas/${invoice.id}`} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/40">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{invoice.number}</p>
                      <p className="text-xs text-muted-foreground">{new Date(invoice.issue_date).toLocaleDateString("pt-PT")}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <StatusBadge status={invoice.status} />
                      <span className="text-sm font-semibold text-card-foreground">{formatCurrency(getInvoiceTotalWithIva(invoice.invoice_items, invoice))}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold text-card-foreground">Histórico de Atividades</h2>
            </div>
            <div className="relative space-y-0">
              {timeline.slice(0, 15).map((event, idx) => (
                <div key={idx} className="flex gap-4 pb-4">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-muted ${event.color}`}>
                      <event.icon className="h-4 w-4" />
                    </div>
                    {idx < Math.min(timeline.length, 15) - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pt-1 pb-2">
                    <p className="text-sm font-medium text-card-foreground">{event.title}</p>
                    {event.subtitle && <p className="text-xs text-muted-foreground">{event.subtitle}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{event.date.toLocaleDateString("pt-PT")} · {event.date.toLocaleTimeString("pt-PT", { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Pagamentos</h2>
            {clientPayments.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Sem pagamentos registados.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {clientPayments.map(payment => (
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

          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Subscrições</h2>
            {clientSubscriptions.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Sem subscrições.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {clientSubscriptions.map(sub => (
                  <div key={sub.id} className="rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{sub.name}</p>
                        <p className="text-xs text-muted-foreground">{frequencyLabels[sub.frequency]}</p>
                      </div>
                      <span className="text-sm font-semibold text-card-foreground">{formatCurrency(getAmountWithIva(Number(sub.amount), sub))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit client dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Editar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {([
              { key: 'name', label: 'Nome', placeholder: 'Nome completo' },
              { key: 'email', label: 'Email', placeholder: 'email@exemplo.pt' },
              { key: 'company', label: 'Empresa', placeholder: 'Nome da empresa' },
              { key: 'phone', label: 'Telefone', placeholder: '+351 ...' },
              { key: 'nif', label: 'NIF', placeholder: '509...' },
            ] as const).map(field => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input
                  placeholder={field.placeholder}
                  value={editForm[field.key]}
                  onChange={e => setEditForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Tem IVA</Label>
                  <p className="text-xs text-muted-foreground">Aplica IVA por defeito a faturas e subscrições</p>
                </div>
                <Switch
                  checked={editForm.has_iva}
                  onCheckedChange={v => setEditForm(prev => ({ ...prev, has_iva: v }))}
                />
              </div>
              {editForm.has_iva && (
                <div className="space-y-2">
                  <Label className="text-sm">Percentagem de IVA (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={editForm.iva_percentage}
                    onChange={e => setEditForm(prev => ({ ...prev, iva_percentage: Number(e.target.value) }))}
                  />
                </div>
              )}
            </div>
            <Button onClick={handleEditSave} className="w-full" disabled={updateClient.isPending || !editForm.name || !editForm.email || !editForm.company}>
              {updateClient.isPending ? "A guardar..." : "Guardar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Eliminar cliente" description={`Tens a certeza que queres eliminar ${client.company}? Todas as faturas, pagamentos e subscrições associadas serão desvinculadas.`} onConfirm={handleDelete} isPending={deleteClient.isPending} />
    </div>
  );
}
