import { useMemo, useState } from "react";
import { Trash2, RotateCcw, Users, FileText, RefreshCw, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useTrashedClients,
  useTrashedInvoices,
  useTrashedSubscriptions,
  useTrashedPayments,
  useRestoreClient,
  useRestoreInvoice,
  useRestoreSubscription,
  usePurgeClient,
  usePurgeInvoice,
  usePurgeSubscription,
} from "@/hooks/use-data";
import { formatCurrency, frequencyLabels, getInvoiceTotalWithIva, getAmountWithIva } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// Restoring a payment is symmetric to restoring any other table; we
// implement it inline here to avoid bloating use-data.ts with a fifth
// soft-delete pair when payments are the only entity that doesn't have
// other paired hooks like Restore/Purge already.
function useRestorePayment() {
  const qc = useQueryClient();
  return {
    mutateAsync: async (id: string) => {
      const { error } = await supabase
        .from("payments")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  };
}

function usePurgePayment() {
  const qc = useQueryClient();
  return {
    mutateAsync: async (id: string) => {
      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  };
}

function formatDeletedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PendingPurge {
  kind: "client" | "invoice" | "subscription" | "payment";
  id: string;
  label: string;
}

export default function Trash() {
  const { toast } = useToast();

  const { data: clients = [] } = useTrashedClients();
  const { data: invoices = [] } = useTrashedInvoices();
  const { data: subscriptions = [] } = useTrashedSubscriptions();
  const { data: payments = [] } = useTrashedPayments();

  const restoreClient = useRestoreClient();
  const restoreInvoice = useRestoreInvoice();
  const restoreSubscription = useRestoreSubscription();
  const restorePayment = useRestorePayment();

  const purgeClient = usePurgeClient();
  const purgeInvoice = usePurgeInvoice();
  const purgeSubscription = usePurgeSubscription();
  const purgePayment = usePurgePayment();

  const [pendingPurge, setPendingPurge] = useState<PendingPurge | null>(null);

  const totalTrashed = clients.length + invoices.length + subscriptions.length + payments.length;

  const handleRestore = async (kind: PendingPurge["kind"], id: string, label: string) => {
    try {
      if (kind === "client") await restoreClient.mutateAsync(id);
      else if (kind === "invoice") await restoreInvoice.mutateAsync(id);
      else if (kind === "subscription") await restoreSubscription.mutateAsync(id);
      else if (kind === "payment") await restorePayment.mutateAsync(id);
      toast({ title: "Restaurado", description: label });
    } catch (e) {
      toast({
        title: "Erro a restaurar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleConfirmPurge = async () => {
    if (!pendingPurge) return;
    const { kind, id, label } = pendingPurge;
    try {
      if (kind === "client") await purgeClient.mutateAsync(id);
      else if (kind === "invoice") await purgeInvoice.mutateAsync(id);
      else if (kind === "subscription") await purgeSubscription.mutateAsync(id);
      else if (kind === "payment") await purgePayment.mutateAsync(id);
      toast({ title: "Eliminado definitivamente", description: label });
    } catch (e) {
      toast({
        title: "Erro a eliminar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setPendingPurge(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Lixo</h1>
        <p className="mt-1 text-muted-foreground">
          {totalTrashed === 0
            ? "Sem registos eliminados."
            : `${totalTrashed} registo(s) eliminado(s). Restaurar repõe sem efeitos colaterais; eliminar definitivamente é irreversível.`}
        </p>
      </div>

      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="h-4 w-4" /> Clientes
            {clients.length > 0 && <Badge variant="secondary">{clients.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" /> Faturas
            {invoices.length > 0 && <Badge variant="secondary">{invoices.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Subscrições
            {subscriptions.length > 0 && <Badge variant="secondary">{subscriptions.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" /> Pagamentos
            {payments.length > 0 && <Badge variant="secondary">{payments.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients">
          <TrashList
            empty="Sem clientes eliminados."
            items={clients.map(c => ({
              id: c.id,
              title: c.name,
              subtitle: c.company || c.email || "",
              deletedAt: c.deleted_at,
            }))}
            onRestore={item => handleRestore("client", item.id, item.title)}
            onPurge={item => setPendingPurge({ kind: "client", id: item.id, label: item.title })}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <TrashList
            empty="Sem faturas eliminadas."
            items={invoices.map(inv => ({
              id: inv.id,
              title: inv.number,
              subtitle: `${inv.clients?.name ?? "—"} · ${formatCurrency(getInvoiceTotalWithIva(inv.invoice_items, inv))}`,
              deletedAt: inv.deleted_at,
            }))}
            onRestore={item => handleRestore("invoice", item.id, item.title)}
            onPurge={item => setPendingPurge({ kind: "invoice", id: item.id, label: item.title })}
          />
        </TabsContent>

        <TabsContent value="subscriptions">
          <TrashList
            empty="Sem subscrições eliminadas."
            items={subscriptions.map(s => ({
              id: s.id,
              title: s.name,
              subtitle: `${s.clients?.name ?? "—"} · ${formatCurrency(getAmountWithIva(Number(s.amount ?? 0), s))} / ${frequencyLabels[s.frequency]}`,
              deletedAt: s.deleted_at,
            }))}
            onRestore={item => handleRestore("subscription", item.id, item.title)}
            onPurge={item => setPendingPurge({ kind: "subscription", id: item.id, label: item.title })}
          />
        </TabsContent>

        <TabsContent value="payments">
          <TrashList
            empty="Sem pagamentos eliminados."
            items={payments.map(p => ({
              id: p.id,
              title: formatCurrency(p.amount),
              subtitle: `${new Date(p.date).toLocaleDateString("pt-PT")} · ${p.invoice_id ? "fatura " + p.invoice_id.slice(0, 8) : "sem fatura"}`,
              deletedAt: p.deleted_at,
            }))}
            onRestore={item => handleRestore("payment", item.id, item.title)}
            onPurge={item => setPendingPurge({ kind: "payment", id: item.id, label: item.title })}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!pendingPurge}
        onOpenChange={open => !open && setPendingPurge(null)}
        title="Eliminar definitivamente?"
        description={
          pendingPurge
            ? `"${pendingPurge.label}" será apagado para sempre da base de dados, junto com qualquer registo dependente. Esta ação não pode ser desfeita.`
            : ""
        }
        onConfirm={handleConfirmPurge}
        confirmLabel="Eliminar definitivamente"
      />
    </div>
  );
}

interface TrashItem {
  id: string;
  title: string;
  subtitle: string;
  deletedAt: string | null;
}

interface TrashListProps {
  items: TrashItem[];
  empty: string;
  onRestore: (item: TrashItem) => void;
  onPurge: (item: TrashItem) => void;
}

function TrashList({ items, empty, onRestore, onPurge }: TrashListProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
    [items],
  );

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">{empty}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{sorted.length} registo(s)</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {sorted.map(item => (
          <div key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate font-medium">{item.title}</p>
              <p className="truncate text-sm text-muted-foreground">{item.subtitle}</p>
              <p className="text-xs text-muted-foreground/70">eliminado {formatDeletedAt(item.deletedAt)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onRestore(item)}>
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onPurge(item)}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
