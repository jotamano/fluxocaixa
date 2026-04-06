import { useState } from "react";
import { Plus, Search, AlertTriangle, CheckCircle, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients, useInvoices, usePayments } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, methodLabels } from "@/lib/data";
import { StatCard } from "@/components/StatCard";
import { PaymentDialog } from "@/components/PaymentDialog";
import { useNavigate } from "react-router-dom";

export default function Payments() {
  const navigate = useNavigate();
  const { data: clients = [] } = useClients();
  const { data: invoices = [] } = useInvoices();
  const { data: payments = [] } = usePayments();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const clientDebts = clients.map(client => {
    const clientInvoices = invoices.filter(i => i.client_id === client.id);
    const totalBilled = clientInvoices.reduce((sum, i) => sum + getInvoiceItemsTotal(i.invoice_items), 0);
    const totalPaid = payments.filter(p => p.client_id === client.id).reduce((sum, p) => sum + Number(p.amount), 0);
    const debt = totalBilled - totalPaid;
    const overdueInvoices = clientInvoices.filter(i => i.status === 'overdue');
    const status = debt <= 0 ? 'clear' : overdueInvoices.length > 0 ? 'overdue' : 'pending';
    return { client, totalBilled, totalPaid, debt, overdueInvoices, status };
  });

  const totalDebt = clientDebts.reduce((sum, c) => sum + Math.max(0, c.debt), 0);
  const totalOverdue = clientDebts.filter(c => c.status === 'overdue').length;
  const totalPaidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const filteredDebts = clientDebts.filter(cd => {
    const matchesSearch = cd.client.name.toLowerCase().includes(search.toLowerCase()) || cd.client.company.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === 'all' || cd.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground">Pagamentos & Dívidas</h1>
          <p className="mt-1 text-muted-foreground">Gestão de pagamentos e dívidas de clientes</p>
        </div>
        <Button className="gap-2" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> Registar Pagamento</Button>
      </div>

      <PaymentDialog open={dialogOpen} onOpenChange={setDialogOpen} invoices={invoices} />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Dívida Total" value={formatCurrency(totalDebt)} icon={AlertTriangle} trend="down" subtitle={`${totalOverdue} cliente(s) em atraso`} />
        <StatCard title="Total Recebido" value={formatCurrency(totalPaidAmount)} icon={CheckCircle} trend="up" subtitle={`${payments.length} pagamento(s)`} />
        <StatCard title="Clientes em Dia" value={String(clientDebts.filter(c => c.status === 'clear').length)} icon={CreditCard} trend="up" />
        <StatCard title="Faturas Pendentes" value={String(invoices.filter(i => i.status === 'pending' || i.status === 'overdue').length)} icon={Clock} trend="down" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar clientes..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="overdue">Em atraso</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="clear">Em dia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 md:px-6 py-3 font-semibold text-muted-foreground font-display">Cliente</th>
              <th className="text-right px-4 md:px-6 py-3 font-semibold text-muted-foreground font-display hidden sm:table-cell">Faturado</th>
              <th className="text-right px-4 md:px-6 py-3 font-semibold text-muted-foreground font-display hidden sm:table-cell">Pago</th>
              <th className="text-right px-4 md:px-6 py-3 font-semibold text-muted-foreground font-display">Dívida</th>
              <th className="text-center px-4 md:px-6 py-3 font-semibold text-muted-foreground font-display">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredDebts.map(({ client, totalBilled, totalPaid, debt, status }) => (
              <tr key={client.id} className="cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => navigate(`/clientes/${client.id}`)}>
                <td className="px-4 md:px-6 py-4">
                  <p className="font-medium text-card-foreground">{client.name}</p>
                  <p className="text-xs text-muted-foreground">{client.company}</p>
                </td>
                <td className="text-right px-4 md:px-6 py-4 text-card-foreground hidden sm:table-cell">{formatCurrency(totalBilled)}</td>
                <td className="text-right px-4 md:px-6 py-4 text-card-foreground hidden sm:table-cell">{formatCurrency(totalPaid)}</td>
                <td className="text-right px-4 md:px-6 py-4 font-semibold text-card-foreground">{formatCurrency(Math.max(0, debt))}</td>
                <td className="text-center px-4 md:px-6 py-4">
                  <StatusBadge status={status === 'clear' ? 'paid' : status === 'overdue' ? 'overdue' : 'pending'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        <div className="border-b border-border px-4 md:px-6 py-4">
          <h2 className="font-display font-semibold text-card-foreground">Pagamentos Recentes</h2>
        </div>
        <div className="divide-y divide-border">
          {payments.length === 0 ? (
            <p className="px-6 py-8 text-center text-muted-foreground">Nenhum pagamento registado</p>
          ) : (
            payments.map(payment => {
              const invoice = invoices.find(i => i.id === payment.invoice_id);
              const client = clients.find(c => c.id === payment.client_id);
              return (
                <button
                  key={payment.id}
                  type="button"
                  className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-muted/40 md:px-6 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => navigate(`/pagamentos/${payment.id}`)}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-card-foreground">{client?.company} — {invoice?.number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.date).toLocaleDateString('pt-PT')} · {methodLabels[payment.method]}
                      {payment.notes && ` · ${payment.notes}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-accent">{formatCurrency(Number(payment.amount))}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
