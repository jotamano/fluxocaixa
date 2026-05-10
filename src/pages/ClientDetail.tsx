import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Mail, Phone, FileDown, Trash2, FileText, CreditCard, UserPlus, Clock, Pencil, FilePlus2, TrendingUp } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditClientDialog } from "@/components/EditClientDialog";
import { useClients, useInvoices, usePayments, useSubscriptions, useDeleteClient } from "@/hooks/use-data";
import { formatCurrency, getInvoiceTotalWithIva, getAmountWithIva, frequencyLabels, methodLabels } from "@/lib/data";
import { generateClientStatement } from "@/lib/statement";
import { useToast } from "@/hooks/use-toast";
import { paymentsByMonth, invoicePaymentLagDays, paymentMethodBreakdown } from "@/lib/stats";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
  const [editOpen, setEditOpen] = useState(false);

  // Hooks must run unconditionally — pre-compute the per-client slices
  // before the loading/not-found early returns. The slices are cheap
  // (filter passes over a few hundred rows at most) and stable across
  // renders thanks to TanStack Query's reference equality.
  const client = clients.find(item => item.id === id);
  const clientInvoices = useMemo(
    () => (client ? invoices.filter(invoice => invoice.client_id === client.id) : []),
    [invoices, client],
  );
  const clientPayments = useMemo(
    () => (client ? payments.filter(payment => payment.client_id === client.id) : []),
    [payments, client],
  );

  // Monthly received-revenue series for the trailing 12 months. Uses the
  // dedicated helper so the same shape is rendered identically on
  // Dashboard / SubscriptionDetail / ClientDetail.
  const monthlyRevenue = useMemo(() => paymentsByMonth(clientPayments, 12), [clientPayments]);

  // Average days-to-pay across closed invoices: lets the operator spot
  // slow payers without scrolling through individual invoices. We only
  // count invoices that ever received a payment so a single huge open
  // invoice doesn't poison the average with `null`.
  const avgPaymentLag = useMemo(() => {
    const lags: number[] = [];
    for (const inv of clientInvoices) {
      const lag = invoicePaymentLagDays(inv, clientPayments);
      if (lag !== null && lag >= 0) lags.push(lag);
    }
    if (lags.length === 0) return null;
    return Math.round(lags.reduce((a, b) => a + b, 0) / lags.length);
  }, [clientInvoices, clientPayments]);

  // Method mix shown as a small ranked list — Recharts' Pie has too much
  // overhead for what is usually 1-3 categories. Sorted desc by value
  // inside the helper.
  const methodMix = useMemo(() => paymentMethodBreakdown(clientPayments), [clientPayments]);
  const methodMixTotal = methodMix.reduce((s, m) => s + m.total, 0);

  if (clientsLoading || invoicesLoading || paymentsLoading || subscriptionsLoading) {
    return <div className="py-10 text-sm text-muted-foreground">A carregar cliente...</div>;
  }

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
              <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Total faturado</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(totalBilled)}</p>
          <p className="text-xs text-muted-foreground mt-1">{clientInvoices.length} fatura(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Total pago</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-muted-foreground mt-1">{clientPayments.length} pagamento(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Em dívida</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{formatCurrency(outstanding)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalBilled > 0 ? `${((outstanding / totalBilled) * 100).toFixed(0)}% do faturado` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Subscrições ativas</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">{clientSubscriptions.filter(s => s.active).length}</p>
          <p className="text-xs text-muted-foreground mt-1">de {clientSubscriptions.length} total</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Pagamento médio</p>
          <p className="mt-2 font-display text-3xl font-bold text-card-foreground">
            {avgPaymentLag === null ? "—" : `${avgPaymentLag}d`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {avgPaymentLag === null ? "Sem dados" : "Após emissão"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-border bg-card shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="font-display text-lg font-semibold text-card-foreground">Receita mensal</h2>
            </div>
            <p className="text-xs text-muted-foreground">Últimos 12 meses</p>
          </div>
          <div className="h-56">
            {monthlyRevenue.every(m => m.value === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem pagamentos nos últimos 12 meses.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevenue} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 90%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(220, 10%, 50%)" }} tickFormatter={v => `${v}€`} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Recebido"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(220, 15%, 90%)", fontSize: 13 }}
                  />
                  <Bar dataKey="value" fill="hsl(220, 70%, 45%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-card p-6">
          <h2 className="font-display text-lg font-semibold text-card-foreground mb-4">Métodos de pagamento</h2>
          {methodMix.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem pagamentos registados.</p>
          ) : (
            <ul className="space-y-3">
              {methodMix.map(m => {
                const pct = methodMixTotal > 0 ? (m.total / methodMixTotal) * 100 : 0;
                const label = methodLabels[m.method as keyof typeof methodLabels] ?? m.method;
                return (
                  <li key={m.method}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-card-foreground">{label}</span>
                      <span className="font-semibold text-card-foreground tabular-nums">{formatCurrency(m.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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

      <EditClientDialog
        client={client}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Eliminar cliente" description={`Tens a certeza que queres eliminar ${client.company}? Todas as faturas, pagamentos e subscrições associadas serão desvinculadas.`} onConfirm={handleDelete} isPending={deleteClient.isPending} />
    </div>
  );
}
