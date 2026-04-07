import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useClients, useInvoices, usePayments, useDeletePayment } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, methodLabels } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";

export default function PaymentDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const deletePayment = useDeletePayment();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (paymentsLoading || clientsLoading || invoicesLoading) {
    return <div className="py-10 text-sm text-muted-foreground">A carregar pagamento...</div>;
  }

  const payment = payments.find(item => item.id === id);

  if (!payment) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="font-display text-2xl font-bold text-foreground">Pagamento não encontrado</h1>
        </div>
      </div>
    );
  }

  const client = clients.find(item => item.id === payment.client_id);
  const invoice = invoices.find(item => item.id === payment.invoice_id);
  const invoiceTotal = invoice ? getInvoiceItemsTotal(invoice.invoice_items) : 0;

  const handleDelete = () => {
    deletePayment.mutate(payment, {
      onSuccess: () => {
        toast({ title: "Pagamento eliminado", description: "O pagamento foi eliminado com sucesso." });
        navigate("/pagamentos");
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
            <h1 className="font-display text-3xl font-bold text-foreground">Pagamento de {formatCurrency(Number(payment.amount))}</h1>
            <p className="mt-1 text-muted-foreground">{new Date(payment.date).toLocaleDateString("pt-PT")} · {methodLabels[payment.method]}</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-4 w-4" /> Anular
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Cliente</p>
          <p className="mt-2 text-lg font-semibold text-card-foreground">{client?.company || "Sem cliente"}</p>
          {client && <Link to={`/clientes/${client.id}`} className="mt-2 inline-block text-sm text-primary hover:underline">Abrir ficha do cliente</Link>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Fatura</p>
          <p className="mt-2 text-lg font-semibold text-card-foreground">{invoice?.number || "Pagamento avulso"}</p>
          {invoice && <Link to={`/faturas/${invoice.id}`} className="mt-2 inline-block text-sm text-primary hover:underline">Abrir fatura</Link>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Valor da fatura</p>
          <p className="mt-2 text-lg font-semibold text-card-foreground">{invoice ? formatCurrency(invoiceTotal) : "—"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold text-card-foreground">Detalhes</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Método</p>
            <p className="mt-1 text-card-foreground">{methodLabels[payment.method]}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Data</p>
            <p className="mt-1 text-card-foreground">{new Date(payment.date).toLocaleDateString("pt-PT")}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Montante</p>
            <p className="mt-1 text-card-foreground">{formatCurrency(Number(payment.amount))}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="mt-1 text-card-foreground">{payment.notes || "Sem notas"}</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Anular pagamento"
        description="Tens a certeza que queres anular este pagamento? O estado da fatura associada será recalculado."
        onConfirm={handleDelete}
        isPending={deletePayment.isPending}
      />
    </div>
  );
}
