import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddPayment, useClients, usePayments, type Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, getClientLabel } from "@/lib/data";
import { toast } from "sonner";

type PaymentMethod = "transfer" | "mbway" | "cash" | "card";

interface SplitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: Invoice[];
  clientId?: string;
}

const ALL_CLIENTS = "__all__";
const getToday = () => new Date().toISOString().split("T")[0];

export function SplitPaymentDialog({ open, onOpenChange, invoices, clientId }: SplitPaymentDialogProps) {
  const addPayment = useAddPayment();
  const { data: allPayments = [] } = usePayments();
  const { data: allClients = [] } = useClients();
  const [totalAmount, setTotalAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [date, setDate] = useState(getToday());
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Default the filter to whatever the caller passed (e.g. a client
  // row), or to "all" if invoked from the toolbar. The user can change
  // it in the dialog.
  const [filterClientId, setFilterClientId] = useState<string>(clientId ?? ALL_CLIENTS);

  // Pull every unpaid invoice once, with per-id remaining balance. The
  // visible list is then derived by client filter without having to
  // re-walk the payments table.
  const unpaidInvoicesAll = useMemo(() => {
    return invoices.filter(inv => inv.status !== "paid" && inv.status !== "draft");
  }, [invoices]);

  const invoiceRemaining = useMemo(() => {
    const map = new Map<string, number>();
    unpaidInvoicesAll.forEach(inv => {
      const total = getInvoiceItemsTotal(inv.invoice_items);
      const paid = allPayments
        .filter(p => p.invoice_id === inv.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      map.set(inv.id, Math.max(total - paid, 0));
    });
    return map;
  }, [unpaidInvoicesAll, allPayments]);

  const visibleInvoices = useMemo(() => {
    if (filterClientId === ALL_CLIENTS) return unpaidInvoicesAll;
    return unpaidInvoicesAll.filter(inv => inv.client_id === filterClientId);
  }, [unpaidInvoicesAll, filterClientId]);

  // Group visible invoices by client so the user can see per-client
  // totals at a glance and use the "select all" shortcut. When the
  // filter is locked to a single client we still group (one bucket) to
  // keep the rendering uniform.
  const grouped = useMemo(() => {
    const buckets = new Map<string, { client: { id: string; label: string }; invoices: Invoice[] }>();
    for (const inv of visibleInvoices) {
      const id = inv.client_id;
      const label = getClientLabel(inv, "Sem cliente");
      if (!buckets.has(id)) buckets.set(id, { client: { id, label }, invoices: [] });
      buckets.get(id)!.invoices.push(inv);
    }
    // Sort each bucket's invoices by due date (oldest first); buckets
    // by client label so the order is stable across renders.
    for (const b of buckets.values()) {
      b.invoices.sort((a, c) => new Date(a.due_date).getTime() - new Date(c.due_date).getTime());
    }
    return Array.from(buckets.values()).sort((a, b) => a.client.label.localeCompare(b.client.label));
  }, [visibleInvoices]);

  // Reset whenever the dialog opens. Picking up the latest clientId
  // prop here covers the case where the caller changed it between
  // openings.
  useEffect(() => {
    if (!open) return;
    setTotalAmount("");
    setMethod("transfer");
    setDate(getToday());
    setNotes("");
    setSelectedIds(new Set());
    setFilterClientId(clientId ?? ALL_CLIENTS);
  }, [open, clientId]);

  const selectedInvoices = useMemo(
    () => unpaidInvoicesAll.filter(inv => selectedIds.has(inv.id)),
    [unpaidInvoicesAll, selectedIds],
  );

  const totalSelectedDebt = selectedInvoices.reduce(
    (sum, inv) => sum + (invoiceRemaining.get(inv.id) || 0),
    0,
  );

  const toggleInvoice = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllForClient = (clientInvoices: Invoice[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      clientInvoices.forEach(inv => next.add(inv.id));
      return next;
    });
  };

  const clearAllForClient = (clientInvoices: Invoice[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      clientInvoices.forEach(inv => next.delete(inv.id));
      return next;
    });
  };

  // Auto-distribute the entered total across the selected invoices,
  // oldest due_date first. Allocates against each invoice's remaining
  // balance so a partially-paid invoice gets only what's left.
  const distribution = useMemo(() => {
    const amount = parseFloat(totalAmount) || 0;
    if (amount <= 0 || selectedInvoices.length === 0) return [];

    const sorted = [...selectedInvoices].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    );

    let remaining = amount;
    return sorted.map(inv => {
      const invRemaining = invoiceRemaining.get(inv.id) || 0;
      const allocated = Math.min(remaining, invRemaining);
      remaining = Math.max(0, remaining - allocated);
      return { invoice: inv, amount: allocated };
    }).filter(d => d.amount > 0);
  }, [totalAmount, selectedInvoices, invoiceRemaining]);

  const enteredAmount = parseFloat(totalAmount) || 0;
  const allocatedAmount = distribution.reduce((sum, d) => sum + d.amount, 0);
  const leftover = Math.max(0, enteredAmount - allocatedAmount);

  const handleSubmit = async () => {
    if (distribution.length === 0) return;
    setIsSubmitting(true);

    try {
      for (const { invoice, amount } of distribution) {
        await addPayment.mutateAsync({
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          amount,
          date,
          method,
          notes: notes || null,
        });
      }
      const leftoverNote = leftover > 0
        ? ` (${formatCurrency(leftover)} não alocados — ajusta o valor ou seleciona mais faturas)`
        : "";
      toast.success(`${formatCurrency(allocatedAmount)} distribuído por ${distribution.length} fatura(s)${leftoverNote}`);
      onOpenChange(false);
    } catch {
      toast.error("Erro ao registar pagamentos");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel = enteredAmount === 0
    ? "Introduz um valor"
    : selectedInvoices.length === 0
      ? "Seleciona pelo menos uma fatura"
      : `Registar ${distribution.length} pagamento(s) — ${formatCurrency(allocatedAmount)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Pagamento Repartido</DialogTitle>
          <DialogDescription>
            Distribui um valor recebido por várias faturas em aberto. As mais antigas são abatidas primeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor total recebido (€)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 1000.00"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={filterClientId} onValueChange={setFilterClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS}>Todos os clientes</SelectItem>
                  {allClients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Faturas em aberto</Label>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {grouped.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Sem faturas pendentes neste filtro</p>
              ) : (
                grouped.map(({ client, invoices: clientInvoices }) => {
                  const allSelected = clientInvoices.every(inv => selectedIds.has(inv.id));
                  const totalDebt = clientInvoices.reduce((s, inv) => s + (invoiceRemaining.get(inv.id) || 0), 0);
                  return (
                    <div key={client.id}>
                      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/40">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-card-foreground truncate">{client.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {clientInvoices.length} fatura(s) · {formatCurrency(totalDebt)} em dívida
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs shrink-0"
                          onClick={() => allSelected ? clearAllForClient(clientInvoices) : selectAllForClient(clientInvoices)}
                        >
                          {allSelected ? "Limpar" : "Selecionar tudo"}
                        </Button>
                      </div>
                      {clientInvoices.map(inv => {
                        const remaining = invoiceRemaining.get(inv.id) || 0;
                        const dist = distribution.find(d => d.invoice.id === inv.id);
                        const itemsPreview = (inv.invoice_items ?? [])
                          .slice(0, 2)
                          .map(it => it.description)
                          .join(" · ");
                        const extraItems = (inv.invoice_items?.length ?? 0) - 2;
                        return (
                          <label
                            key={inv.id}
                            className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={selectedIds.has(inv.id)}
                              onCheckedChange={() => toggleInvoice(inv.id)}
                            />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="text-sm font-medium text-card-foreground truncate">
                                {inv.number}
                              </p>
                              {itemsPreview && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {itemsPreview}{extraItems > 0 ? ` · +${extraItems} mais` : ""}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Vence: {new Date(inv.due_date).toLocaleDateString("pt-PT")}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-card-foreground">{formatCurrency(remaining)}</p>
                              {dist && dist.amount > 0 && (
                                <p className="text-xs text-primary font-medium">
                                  −{formatCurrency(dist.amount)}
                                </p>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            {selectedInvoices.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedInvoices.length} fatura(s) selecionadas · dívida total{" "}
                <span className="font-semibold text-foreground">{formatCurrency(totalSelectedDebt)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Método</Label>
              <Select value={method} onValueChange={v => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transferência</SelectItem>
                  <SelectItem value="mbway">MB WAY</SelectItem>
                  <SelectItem value="cash">Numerário</SelectItem>
                  <SelectItem value="card">Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Input placeholder="Ex: Pagamento repartido" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {distribution.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vais registar</p>
              {distribution.map(({ invoice, amount }) => (
                <div key={invoice.id} className="flex justify-between text-sm">
                  <span className="text-card-foreground truncate pr-2">
                    {invoice.number} · {getClientLabel(invoice, "—")}
                  </span>
                  <span className="font-semibold text-card-foreground shrink-0">{formatCurrency(amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Total alocado</span>
                <span className="font-semibold text-card-foreground">{formatCurrency(allocatedAmount)}</span>
              </div>
              {leftover > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Não alocado</span>
                  <span className="font-semibold text-amber-600">{formatCurrency(leftover)}</span>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={distribution.length === 0 || isSubmitting}
          >
            {isSubmitting ? "A registar..." : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
