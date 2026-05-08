import { useState } from "react";
import { FileText, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { useInvoices } from "@/hooks/use-data";
import { formatCurrency, getInvoiceTotalWithIva, getClientLabel, getEffectiveIvaPercentage, type InvoiceStatus } from "@/lib/data";
import { generateInvoicePDF } from "@/lib/pdf";
import { Link, useNavigate } from "react-router-dom";

export default function Invoices() {
  const { data: invoices = [] } = useInvoices();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = invoices.filter(invoice => {
    const lowerSearch = search.toLowerCase();
    const matchesSearch =
      invoice.number.toLowerCase().includes(lowerSearch) ||
      (invoice.clients?.company?.toLowerCase().includes(lowerSearch) ?? false) ||
      (invoice.clients?.name?.toLowerCase().includes(lowerSearch) ?? false);
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    const matchesFrom = !fromDate || invoice.issue_date >= fromDate;
    const matchesTo = !toDate || invoice.issue_date <= toDate;
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });

  const statuses: Array<{ value: InvoiceStatus | "all"; label: string }> = [
    { value: "all", label: "Todas" },
    { value: "paid", label: "Pagas" },
    { value: "pending", label: "Pendentes" },
    { value: "overdue", label: "Vencidas" },
    { value: "partially_paid", label: "Parciais" },
    { value: "draft", label: "Rascunhos" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Faturas</h1>
          <p className="mt-1 text-muted-foreground">{invoices.length} faturas emitidas</p>
        </div>
        <Link to="/faturas/nova">
          <Button className="gap-2"><FileText className="h-4 w-4" /> Nova Fatura</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar faturas..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
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

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nº Fatura</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vencimento</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">IVA</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(invoice => (
              <tr
                key={invoice.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => navigate(`/faturas/${invoice.id}`)}
              >
                <td className="px-6 py-4 text-sm font-medium text-card-foreground">{invoice.number}</td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-card-foreground">{getClientLabel(invoice)}</p>
                  {invoice.clients?.name && invoice.clients?.company
                    ? <p className="text-xs text-muted-foreground">{invoice.clients.name}</p>
                    : null}
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(invoice.issue_date).toLocaleDateString('pt-PT')}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(invoice.due_date).toLocaleDateString('pt-PT')}</td>
                <td className="px-6 py-4"><StatusBadge status={invoice.status} /></td>
                <td className="px-6 py-4 text-right text-sm font-semibold text-card-foreground">{formatCurrency(getInvoiceTotalWithIva(invoice.invoice_items, invoice))}</td>
                <td className="px-6 py-4 text-center text-xs text-muted-foreground tabular-nums">
                  {(() => {
                    const pct = getEffectiveIvaPercentage(invoice);
                    return pct > 0 ? `${pct}%` : "—";
                  })()}
                </td>
                <td className="px-6 py-4 text-center">
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
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-muted-foreground">Nenhuma fatura encontrada</div>
        )}
      </div>
    </div>
  );
}
