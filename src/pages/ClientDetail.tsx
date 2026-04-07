import { ArrowLeft, Building2, Mail, Phone, FileDown } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { useClients, useInvoices, usePayments, useSubscriptions } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, frequencyLabels, methodLabels } from "@/lib/data";
import { generateClientStatement } from "@/lib/statement";

export default function ClientDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: clients = [], isLoading: clientsLoading } = useClients();
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices();
  const { data: payments = [], isLoading: paymentsLoading } = usePayments();
  const { data: subscriptions = [], isLoading: subscriptionsLoading } = useSubscriptions();

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

  const totalBilled = clientInvoices.reduce((sum, invoice) => sum + getInvoiceItemsTotal(invoice.invoice_items), 0);
  const totalPaid = clientPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = Math.max(totalBilled - totalPaid, 0);

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
          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {client.email}</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {client.phone || "Sem telefone"}</div>
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> NIF: {client.nif || "Sem NIF"}</div>
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
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{clientSubscriptions.filter(subscription => subscription.active).length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-semibold text-card-foreground">Faturas do cliente</h2>
          </div>
          <div className="divide-y divide-border">
            {clientInvoices.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground">Ainda não existem faturas para este cliente.</p>
            ) : (
              clientInvoices.map(invoice => (
                <Link
                  key={invoice.id}
                  to={`/faturas/${invoice.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-muted/40"
                >
                  <div>
                    <p className="text-sm font-medium text-card-foreground">{invoice.number}</p>
                    <p className="text-xs text-muted-foreground">{new Date(invoice.issue_date).toLocaleDateString("pt-PT")}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={invoice.status} />
                    <span className="text-sm font-semibold text-card-foreground">{formatCurrency(getInvoiceItemsTotal(invoice.invoice_items))}</span>
                  </div>
                </Link>
              ))
            )}
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
                  <Link
                    key={payment.id}
                    to={`/pagamentos/${payment.id}`}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40"
                  >
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
              <p className="mt-4 text-sm text-muted-foreground">Sem subscrições ativas ou históricas.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {clientSubscriptions.map(subscription => (
                  <div key={subscription.id} className="rounded-lg border border-border px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-card-foreground">{subscription.name}</p>
                        <p className="text-xs text-muted-foreground">{frequencyLabels[subscription.frequency]}</p>
                      </div>
                      <span className="text-sm font-semibold text-card-foreground">{formatCurrency(Number(subscription.amount))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}