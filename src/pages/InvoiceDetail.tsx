import { useMemo, useState } from "react";
import { ArrowLeft, Download, Wallet, Trash2, Pencil } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { PaymentDialog } from "@/components/PaymentDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useInvoices, usePayments, useDeleteInvoice, useUpdateInvoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, serviceLabels, methodLabels } from "@/lib/data";
import { generateInvoicePDF } from "@/lib/pdf";
import { useToast } from "@/hooks/use-toast";

export default function InvoiceDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const deleteInvoice = useDeleteInvoice();
  const updateInvoice = useUpdateInvoice();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ issue_date: '', due_date: '', notes: '', status: '' });

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
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Serviços da fatura</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Serviço</th>
                  <th className="px-6 py-3 text-left font-semibold text-muted-foreground">Descrição</th>
                  <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Qtd</th>
                  <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Preço</th>
                  <th className="px-6 py-3 text-right font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.invoice_items.map(item => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-muted-foreground">{serviceLabels[item.service_type]}</td>
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
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                <option value="draft">Rascunho</option>
                <option value="pending">Pendente</option>
                <option value="paid">Paga</option>
                <option value="overdue">Vencida</option>
                <option value="partially_paid">Parcialmente Paga</option>
              </select>
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

      <PaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} invoices={[invoice]} initialInvoiceId={invoice.id} initialAmount={outstanding > 0 ? String(outstanding) : ""} title="Registar pagamento nesta fatura" />
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Anular fatura" description={`Tens a certeza que queres anular a fatura ${invoice.number}? Esta ação é irreversível.`} onConfirm={handleDelete} isPending={deleteInvoice.isPending} />
    </div>
  );
}
