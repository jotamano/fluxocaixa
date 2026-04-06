import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useClients, useInvoices, usePayments } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, methodLabels } from "@/lib/data";

export default function PaymentDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-3">
        <Button variant="ghost" className="w-fit gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Pagamento de {formatCurrency(Number(payment.amount))}</h1>
          <p className="mt-1 text-muted-foreground">{new Date(payment.date).toLocaleDateString("pt-PT")} · {methodLabels[payment.method]}</p>
        </div>
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
    </div>
  );
}