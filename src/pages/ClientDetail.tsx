import { useState, useMemo } from "react";
import { ArrowLeft, Building2, Mail, Phone, FileDown, Trash2, FileText, CreditCard, UserPlus, Clock } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useClients, useInvoices, usePayments, useSubscriptions, useDeleteClient } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, frequencyLabels, methodLabels } from "@/lib/data";
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
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  // Build timeline
  const timeline: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [];
    events.push({
      date: new Date(client.created_at),
      type: 'client_created',
      title: 'Cliente registado',
      subtitle: client.company,
      icon: UserPlus,
      color: 'text-primary',
    });
    clientInvoices.forEach(inv => {
      events.push({
        date: new Date(inv.created_at),
        type: 'invoice_created',
        title: `Fatura ${inv.number} criada`,
        subtitle: formatCurrency(getInvoiceItemsTotal(inv.invoice_items)),
        icon: FileText,
        color: 'text-warning',
      });
    });
    clientPayments.forEach(pay => {
      events.push({
        date: new Date(pay.created_at),
        type: 'payment_received',
        title: `Pagamento recebido`,
        subtitle: `${formatCurrency(Number(pay.amount))} — ${methodLabels[pay.method]}`,
        icon: CreditCard,
        color: 'text-success',
      });
    });
    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [client, clientInvoices, clientPayments]);

  const handleDelete = () => {
    deleteClient.mutate(client.id, {
      onSuccess: () => {
        toast({ title: "Cliente eliminado", description: `${client.company} foi eliminado.` });
        navigate("/clientes");
      },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
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
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => generateClientStatement(client, invoices, payments)}>
                <FileDown className="h-4 w-4" /> Extrato de conta
              </Button>
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </Button>
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {client.email}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {client.phone || "Sem telefone"}</div>
              <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> NIF: {client.nif || "Sem NIF"}</div>
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
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{clientSubscriptions.filter(subscription => subscription.active).length}</p>
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

          {/* Activity Timeline */}
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
                    {idx < timeline.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar cliente"
        description={`Tens a certeza que queres eliminar ${client.company}? Todas as faturas, pagamentos e subscrições associadas serão desvinculadas.`}
        onConfirm={handleDelete}
        isPending={deleteClient.isPending}
      />
    </div>
  );
}
