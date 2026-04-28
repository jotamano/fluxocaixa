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
import { useInvoices, usePayments, useDeleteInvoice, useUpdateInvoice, useUpdateInvoiceItems, useActiveServices, useDuplicateInvoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, methodLabels } from "@/lib/data";
import { generateInvoicePDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface EditItem {
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export default function InvoiceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const { data: services = [] } = useActiveServices();
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

  const invoice = useMemo(() => invoices.find(item => item.id === id), [invoices, id]);
  const invoicePayments = useMemo(() => payments.filter(payment => payment.invoice_id === id), [payments, id]);

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
      serviceId: "",
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
    })));
    setEditItemsOpen(true);
  };

  const updateEditItem = (index: number, field: keyof EditItem, value: string | number) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
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
    updateItems.mutate({
      invoiceId: invoice.id,
      items: editItems.map(i => ({
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitPrice,
      })),
    }, {
      onSuccess: () => { setEditItemsOpen(false); toast({ title: "Itens atualizados!" }); },
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
              Cliente: <Link to={`/clientes/${invoice.client_id}`} className="font-medium text-primary hover:underline">{invoice.clients?.company || "Sem cliente"}</Link>
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

      <PaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} invoices={[invoice]} initialInvoiceId={invoice.id} initialAmount={outstanding > 0 ? String(outstanding) : ""} title="Registar pagamento nesta fatura" />
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Anular fatura" description={`Tens a certeza que queres anular a fatura ${invoice.number}? Esta ação é irreversível.`} onConfirm={handleDelete} isPending={deleteInvoice.isPending} />
    </div>
  );
}
