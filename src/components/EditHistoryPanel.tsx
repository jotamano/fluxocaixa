import { useMemo, useState } from "react";
import { History, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInvoiceHistory, type InvoiceHistoryRow } from "@/hooks/use-data";

const TABLE_LABELS: Record<string, string> = {
  invoices: "Fatura",
  invoice_items: "Linha da fatura",
  subscriptions: "Subscrição",
  subscription_items: "Linha da subscrição",
  payments: "Pagamento",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Edição",
  DELETE: "Eliminação",
  SOFT_DELETE: "Movido p/ lixo",
  RESTORE: "Restaurado",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  INSERT: "default",
  UPDATE: "secondary",
  SOFT_DELETE: "outline",
  RESTORE: "outline",
  DELETE: "destructive",
};

// Fields that are interesting to surface in the per-row diff. We
// intentionally leave out FK columns and timestamps that change on
// every save and would just create noise.
const INTERESTING_FIELDS: Record<string, string[]> = {
  invoices: [
    "issue_date", "due_date", "status", "notes", "number",
    "has_iva", "iva_percentage",
  ],
  invoice_items: [
    "description", "quantity", "unit_price", "position",
    "service_start_date", "service_end_date",
  ],
  subscriptions: [
    "name", "amount", "frequency", "next_billing_date", "status",
    "has_iva", "iva_percentage",
  ],
  subscription_items: [
    "description", "amount", "kind",
  ],
  payments: ["amount", "method", "date", "notes"],
};

const FIELD_LABELS: Record<string, string> = {
  issue_date: "Emissão",
  due_date: "Vencimento",
  status: "Estado",
  notes: "Notas",
  number: "Nº",
  has_iva: "Tem IVA",
  iva_percentage: "IVA %",
  description: "Descrição",
  quantity: "Qtd",
  unit_price: "Preço",
  position: "Posição",
  service_start_date: "Início serviço",
  service_end_date: "Fim serviço",
  name: "Nome",
  amount: "Valor",
  frequency: "Frequência",
  next_billing_date: "Próx. faturação",
  kind: "Tipo",
  method: "Método",
  date: "Data",
};

interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function diffOf(table: string, before: unknown, after: unknown): DiffEntry[] {
  const fields = INTERESTING_FIELDS[table] ?? [];
  if (!isObject(before) || !isObject(after)) return [];
  const out: DiffEntry[] = [];
  for (const field of fields) {
    const b = before[field];
    const a = after[field];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push({ field, before: b, after: a });
    }
  }
  return out;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  return JSON.stringify(v);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeRow(row: InvoiceHistoryRow): string {
  const tableLabel = TABLE_LABELS[row.table_name] ?? row.table_name;
  if (row.action === "INSERT") return `${tableLabel} criada`;
  if (row.action === "DELETE") return `${tableLabel} eliminada definitivamente`;
  if (row.action === "SOFT_DELETE") return `${tableLabel} movida para o lixo`;
  if (row.action === "RESTORE") return `${tableLabel} restaurada`;
  // UPDATE — try to give a one-line summary using the diff.
  const diff = diffOf(row.table_name, row.before_data, row.after_data);
  if (diff.length === 0) return `${tableLabel} editada`;
  if (diff.length === 1) {
    const d = diff[0];
    return `${tableLabel} · ${FIELD_LABELS[d.field] ?? d.field}: ${renderValue(d.before)} → ${renderValue(d.after)}`;
  }
  return `${tableLabel} · ${diff.length} campos alterados`;
}

export function EditHistoryPanel({ invoiceId }: { invoiceId: string }) {
  const { data: rows = [], isLoading, error } = useInvoiceHistory(invoiceId);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggle = (id: number) => setExpandedId(prev => (prev === id ? null : id));

  const visibleRows = useMemo(() => rows.slice(0, 50), [rows]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-card-foreground flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico de edições
        </h2>
        <Link to="/auditoria" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
          Ver tudo na auditoria <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Inclui edições à fatura, linhas, subscrição associada e pagamentos. As alterações ficam
        registadas para sempre, mesmo depois do lixo ser purgado aos 90 dias.
      </p>

      {isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">A carregar histórico…</p>
      )}
      {error && (
        <p className="mt-4 text-sm text-destructive">
          Erro a carregar histórico: {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      {!isLoading && !error && visibleRows.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Sem registos de edição para esta fatura.</p>
      )}

      <div className="mt-4 space-y-2">
        {visibleRows.map(row => {
          const variant = ACTION_VARIANT[row.action] ?? "secondary";
          const actionLabel = ACTION_LABELS[row.action] ?? row.action;
          const summary = describeRow(row);
          const isOpen = expandedId === row.id;
          const diff = diffOf(row.table_name, row.before_data, row.after_data);
          return (
            <div key={row.id} className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => toggle(row.id)}
                className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-muted/40"
              >
                <span className="mt-0.5">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variant} className="text-[10px]">{actionLabel}</Badge>
                    <span className="truncate text-sm text-card-foreground">{summary}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.actor_email ?? "sistema"} · {formatDateTime(row.occurred_at)}
                  </p>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border px-3 py-3 text-xs">
                  {row.action === "UPDATE" && diff.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="text-left font-medium">Campo</th>
                          <th className="text-left font-medium">Antes</th>
                          <th className="text-left font-medium">Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map(d => (
                          <tr key={d.field} className="border-t border-border">
                            <td className="py-1 pr-2 font-medium text-card-foreground">
                              {FIELD_LABELS[d.field] ?? d.field}
                            </td>
                            <td className="py-1 pr-2 text-muted-foreground">{renderValue(d.before)}</td>
                            <td className="py-1 text-card-foreground">{renderValue(d.after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <RawJson before={row.before_data} after={row.after_data} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rows.length > visibleRows.length && (
        <div className="mt-3 text-center">
          <Link to="/auditoria">
            <Button variant="ghost" size="sm">
              Ver mais {rows.length - visibleRows.length} eventos na auditoria
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function RawJson({ before, after }: { before: unknown; after: unknown }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <Block title="Antes" value={before} />
      <Block title="Depois" value={after} />
    </div>
  );
}

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-tight">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
