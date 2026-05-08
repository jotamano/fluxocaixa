import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Filter as FilterIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface AuditRow {
  id: number;
  occurred_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  before_data: Json | null;
  after_data: Json | null;
}

const TABLE_LABELS: Record<string, string> = {
  clients: "Clientes",
  invoices: "Faturas",
  invoice_items: "Linhas de fatura",
  subscriptions: "Subscrições",
  subscription_items: "Linhas de subscrição",
  payments: "Pagamentos",
  services: "Serviços",
  "auth.users": "Membros",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Edição",
  DELETE: "Eliminação definitiva",
  SOFT_DELETE: "Movido para o Lixo",
  RESTORE: "Restauro",
};

const ACTION_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  INSERT: "default",
  UPDATE: "secondary",
  SOFT_DELETE: "outline",
  RESTORE: "outline",
  DELETE: "destructive",
};

const PAGE_SIZE = 100;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function summarizeRow(table: string, row: Json | null): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "—";
  const r = row as Record<string, Json | undefined>;
  if (table === "invoices" && typeof r.number === "string") return r.number;
  if (table === "clients" && typeof r.name === "string") return r.name;
  if (table === "subscriptions" && typeof r.name === "string") return r.name;
  if (table === "services" && typeof r.name === "string") return r.name;
  if (table === "invoice_items" && typeof r.description === "string") return r.description;
  if (table === "subscription_items" && typeof r.description === "string") return r.description;
  if (table === "payments" && typeof r.amount !== "undefined")
    return `${r.amount}€${typeof r.date === "string" ? ` em ${r.date}` : ""}`;
  if (table === "auth.users" && typeof r.email === "string") return r.email;
  if (typeof r.id === "string") return r.id.slice(0, 8);
  return "—";
}

function useAuditLog(filters: { table: string; actor: string }) {
  return useQuery({
    queryKey: ["audit_log", filters],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (filters.table !== "all") query = query.eq("table_name", filters.table);
      if (filters.actor.trim() !== "")
        query = query.ilike("actor_email", `%${filters.actor.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });
}

export default function Audit() {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data: rows = [], isLoading, error } = useAuditLog({
    table: tableFilter,
    actor: actorFilter,
  });

  const tableOptions = useMemo(
    () => Object.entries(TABLE_LABELS).map(([value, label]) => ({ value, label })),
    [],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Auditoria</h1>
        <p className="mt-1 text-muted-foreground">
          Registo cronológico de tudo o que cada membro faz: criar, editar, eliminar e restaurar.
          Os registos ficam para sempre, mesmo quando o lixo é eliminado automaticamente passados
          90 dias.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <FilterIcon className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="audit-table">Tipo de registo</Label>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger id="audit-table">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {tableOptions.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="audit-actor">Membro (email)</Label>
            <Input
              id="audit-actor"
              placeholder="ex: ana@…"
              value={actorFilter}
              onChange={e => setActorFilter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Erro a carregar registo: {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <History className="h-4 w-4" />
            {isLoading
              ? "A carregar…"
              : rows.length === PAGE_SIZE
                ? `Últimos ${PAGE_SIZE} eventos`
                : `${rows.length} evento(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {!isLoading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem eventos para os filtros escolhidos.
            </p>
          )}
          {rows.map(row => {
            const tableLabel = TABLE_LABELS[row.table_name] ?? row.table_name;
            const actionLabel = ACTION_LABELS[row.action] ?? row.action;
            const variant = ACTION_VARIANT[row.action] ?? "secondary";
            const summary = summarizeRow(
              row.table_name,
              row.action === "DELETE" ? row.before_data : row.after_data ?? row.before_data,
            );
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelected(row)}
                className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={variant}>{actionLabel}</Badge>
                    <span className="text-sm font-medium">{tableLabel}</span>
                    <span className="truncate text-sm text-muted-foreground">{summary}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.actor_email ?? "sistema"} · {formatDateTime(row.occurred_at)}
                  </p>
                </div>
                <Button variant="ghost" size="sm" tabIndex={-1}>
                  Ver detalhe
                </Button>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <DetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DetailDialog({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  if (!row) return null;
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {ACTION_LABELS[row.action] ?? row.action} ·{" "}
            {TABLE_LABELS[row.table_name] ?? row.table_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <span className="text-muted-foreground">Quando:</span>{" "}
            {formatDateTime(row.occurred_at)}
          </div>
          <div>
            <span className="text-muted-foreground">Quem:</span>{" "}
            {row.actor_email ?? "sistema (cron, trigger, etc.)"}
          </div>
          <div>
            <span className="text-muted-foreground">ID do registo:</span>{" "}
            <code className="text-xs">{row.row_id ?? "—"}</code>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <JsonBlock title="Antes" value={row.before_data} />
            <JsonBlock title="Depois" value={row.after_data} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JsonBlock({ title, value }: { title: string; value: Json | null }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs leading-relaxed">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
