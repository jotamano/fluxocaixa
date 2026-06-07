import { useMemo, useState } from "react";
import { FileText, Search, Download, CheckCircle2, Trash2, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import {
  useInvoices,
  usePayments,
  useAddPayment,
  useDeleteInvoice,
  type Invoice,
} from "@/hooks/use-data";
import {
  formatCurrency,
  getInvoiceTotalWithIva,
  getClientLabel,
  getEffectiveIvaPercentage,
  type InvoiceStatus,
} from "@/lib/data";
import { summarizeInvoices } from "@/lib/stats";
import { generateInvoicePDF } from "@/lib/pdf";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Invoices() {
  const { data: invoices = [] } = useInvoices();
  const { data: payments = [] } = usePayments();
  const addPayment = useAddPayment();
  const deleteInvoice = useDeleteInvoice();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = useMemo(() => invoices.filter(invoice => {
    const lowerSearch = search.toLowerCase();
    const matchesSearch =
      invoice.number.toLowerCase().includes(lowerSearch) ||
      (invoice.clients?.company?.toLowerCase().includes(lowerSearch) ?? false) ||
      (invoice.clients?.name?.toLowerCase().includes(lowerSearch) ?? false) ||
      (invoice.clients?.nif?.toLowerCase().includes(lowerSearch) ?? false);
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesFrom = !fromDate || invoice.issue_date >= fromDate;
    const matchesTo = !toDate || invoice.issue_date <= toDate;
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  }), [invoices, search, statusFilter, fromDate, toDate]);

  // Summary chips computed against the *filtered* list so the operator
  // sees totals for the slice they're inspecting (e.g. "all overdue in
  // the last 30 days"). When the user resets filters this naturally
  // collapses to lifetime totals.
  const summary = useMemo(() => summarizeInvoices(filtered), [filtered]);

  // Outstanding balance per invoice (total − sum of payments). Drives
  // the bulk "marcar como pago" path: register a payment for the
  // missing amount on each selected invoice.
  const outstandingByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(inv => {
      const total = getInvoiceTotalWithIva(inv.invoice_items, inv);
      const paid = payments
        .filter(p => p.invoice_id === inv.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      map.set(inv.id, Math.max(total - paid, 0));
    });
    return map;
  }, [invoices, payments]);

  const filteredIds = useMemo(() => filtered.map(i => i.id), [filtered]);
  const selectedInvoices = useMemo(
    () => filtered.filter(i => selectedIds.has(i.id)),
    [filtered, selectedIds],
  );
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someFilteredSelected =
    filteredIds.some(id => selectedIds.has(id)) && !allFilteredSelected;

  const toggleAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk: mark as paid. Skips drafts (cannot receive payments) and
  // anything already at zero outstanding. Each remaining invoice gets
  // a synthetic transfer payment for the exact outstanding — the
  // recalcInvoiceStatus baked into useAddPayment then flips status
  // automatically.
  const handleBulkMarkPaid = async () => {
    setBulkBusy(true);
    let ok = 0;
    let skipped = 0;
    let failed = 0;
    const today = new Date().toISOString().split("T")[0];
    for (const invoice of selectedInvoices) {
      const outstanding = outstandingByInvoice.get(invoice.id) ?? 0;
      if (invoice.status === "draft" || outstanding <= 0) { skipped++; continue; }
      try {
        await addPayment.mutateAsync({
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          amount: outstanding,
          date: today,
          method: "transfer",
          notes: "Marcação em massa",
        });
        ok++;
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    if (ok > 0) toast.success(`${ok} fatura(s) marcadas como pagas`);
    if (skipped > 0) toast.info(`${skipped} fatura(s) ignoradas (rascunhos ou já pagas)`);
    if (failed > 0) toast.error(`${failed} fatura(s) falharam`);
    clearSelection();
  };

  const handleBulkExportPdf = async () => {
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const invoice of selectedInvoices) {
      if (!invoice.clients) { failed++; continue; }
      try {
        generateInvoicePDF(invoice, invoice.clients);
        ok++;
        await new Promise(r => setTimeout(r, 150));
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    if (ok > 0) toast.success(`${ok} PDF(s) gerados`);
    if (failed > 0) toast.error(`${failed} PDF(s) falharam`);
  };

  const handleBulkDelete = async () => {
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const invoice of selectedInvoices) {
      try {
        await deleteInvoice.mutateAsync({ id: invoice.id });
        ok++;
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    setConfirmDelete(false);
    if (ok > 0) toast.success(`${ok} fatura(s) movidas para o lixo`);
    if (failed > 0) toast.error(`${failed} fatura(s) não puderam ser eliminadas`);
    clearSelection();
  };

  const statuses: Array<{ value: InvoiceStatus | "all"; label: string }> = [
    { value: "all", label: "Todas" },
    { value: "paid", label: "Pagas" },
    { value: "pending", label: "Pendentes" },
    { value: "overdue", label: "Vencidas" },
    { value: "partially_paid", label: "Parciais" },
    { value: "draft", label: "Rascunhos" },
  ];

  const selectedTotal = selectedInvoices.reduce(
    (sum: number, inv: Invoice) => sum + getInvoiceTotalWithIva(inv.invoice_items, inv),
    0,
  );
  const selectedOutstanding = selectedInvoices.reduce(
    (sum, inv) => sum + (outstandingByInvoice.get(inv.id) ?? 0),
    0,
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-foreground">Faturas</h1>
          <p className="mt-1 text-muted-foreground">{invoices.length} faturas emitidas</p>
        </div>
        <Link to="/faturas/nova" className="shrink-0">
          <Button className="gap-2"><FileText className="h-4 w-4" /> Nova Fatura</Button>
        </Link>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total filtrado</p>
          <p className="mt-1 font-display text-lg sm:text-xl font-bold text-card-foreground">{formatCurrency(summary.totalGross)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.count} fatura(s)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagas</p>
          <p className="mt-1 font-display text-lg sm:text-xl font-bold text-success">{formatCurrency(summary.paidGross)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.totalGross > 0 ? Math.round((summary.paidGross / summary.totalGross) * 100) : 0}% recebido</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendentes</p>
          <p className="mt-1 font-display text-lg sm:text-xl font-bold text-warning">{formatCurrency(summary.pendingGross)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Vencidas</p>
          <p className={`mt-1 font-display text-lg sm:text-xl font-bold ${summary.overdueGross > 0 ? 'text-destructive' : 'text-card-foreground'}`}>{formatCurrency(summary.overdueGross)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card col-span-2 lg:col-span-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ticket médio</p>
          <p className="mt-1 font-display text-lg sm:text-xl font-bold text-card-foreground">{formatCurrency(summary.averageTicket)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Exclui rascunhos</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar (nº, cliente, NIF)..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Input type="date" className="w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Data inicial" />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="date" className="w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Data final" />
        <div className="flex gap-1 flex-wrap">
          {statuses.map(s => (
            <Button key={s.value} variant={statusFilter === s.value ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(s.value)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={clearSelection}
              title="Limpar seleção"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="text-sm min-w-0">
              <p className="font-semibold text-foreground">
                {selectedIds.size} fatura(s) selecionada(s)
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Total {formatCurrency(selectedTotal)} · em falta {formatCurrency(selectedOutstanding)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void handleBulkMarkPaid()}
              disabled={bulkBusy || selectedOutstanding <= 0}
            >
              <CheckCircle2 className="h-4 w-4" />
              Marcar como pago
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void handleBulkExportPdf()}
              disabled={bulkBusy}
            >
              <Download className="h-4 w-4" />
              Exportar PDFs
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-2"
              onClick={() => setConfirmDelete(true)}
              disabled={bulkBusy}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 w-10">
                <Checkbox
                  checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todas"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nº Fatura</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vencimento</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">IVA</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(invoice => {
              const checked = selectedIds.has(invoice.id);
              return (
                <tr
                  key={invoice.id}
                  className={`cursor-pointer transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/30"}`}
                  onClick={() => navigate(`/faturas/${invoice.id}`)}
                >
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleOne(invoice.id)}
                      aria-label={`Selecionar fatura ${invoice.number}`}
                    />
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-card-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {invoice.number}
                      {!invoice.whatsapp_sent_at && invoice.clients?.whatsapp_group_jid?.trim() && (
                        <MessageCircle
                          className="h-3.5 w-3.5 text-amber-500"
                          aria-label="WhatsApp por enviar"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-card-foreground">{getClientLabel(invoice)}</p>
                    {invoice.clients?.name && invoice.clients?.company
                      ? <p className="text-xs text-muted-foreground">{invoice.clients.name}</p>
                      : null}
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">{new Date(invoice.issue_date).toLocaleDateString('pt-PT')}</td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">{new Date(invoice.due_date).toLocaleDateString('pt-PT')}</td>
                  <td className="px-4 py-4"><StatusBadge status={invoice.status} /></td>
                  <td className="px-4 py-4 text-right text-sm font-semibold text-card-foreground">{formatCurrency(getInvoiceTotalWithIva(invoice.invoice_items, invoice))}</td>
                  <td className="px-4 py-4 text-center text-xs text-muted-foreground tabular-nums">
                    {(() => {
                      const pct = getEffectiveIvaPercentage(invoice);
                      return pct > 0 ? `${pct}%` : "—";
                    })()}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Exportar PDF"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (invoice.clients) generateInvoicePDF(invoice, invoice.clients);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-muted-foreground">Nenhuma fatura encontrada</div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover {selectedIds.size} fatura(s) para o lixo?</AlertDialogTitle>
            <AlertDialogDescription>
              As faturas e respetivos pagamentos vão ser soft-deleted. Podes restaurá-las
              em /lixo enquanto não fizeres purge definitivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleBulkDelete()}
              disabled={bulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkBusy ? "A eliminar…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
