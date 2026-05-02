import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddPayment, useClients, usePayments, useAddClientCredit, useClientCredits, type Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, getClientLabel } from "@/lib/data";
import { toast } from "sonner";

type PaymentMethod = "transfer" | "mbway" | "cash" | "card";
type AllocationMode = "auto" | "manual";

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
  const addCredit = useAddClientCredit();
  const { data: allPayments = [] } = usePayments();
  const { data: allClients = [] } = useClients();
  const { data: allCredits = [] } = useClientCredits();
  const [totalAmount, setTotalAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [date, setDate] = useState(getToday());
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string>(clientId ?? ALL_CLIENTS);
  const [mode, setMode] = useState<AllocationMode>("auto");
  // Manual allocation overrides per invoice id (string for empty-state
  // tolerance). Only consulted when mode === "manual".
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
  // Whether to park the leftover amount as a client credit. Only
  // available when every selected invoice belongs to the same client.
  const [saveLeftoverAsCredit, setSaveLeftoverAsCredit] = useState(true);

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

  const grouped = useMemo(() => {
    const buckets = new Map<string, { client: { id: string; label: string }; invoices: Invoice[] }>();
    for (const inv of visibleInvoices) {
      const id = inv.client_id;
      const label = getClientLabel(inv, "Sem cliente");
      if (!buckets.has(id)) buckets.set(id, { client: { id, label }, invoices: [] });
      buckets.get(id)!.invoices.push(inv);
    }
    for (const b of buckets.values()) {
      b.invoices.sort((a, c) => new Date(a.due_date).getTime() - new Date(c.due_date).getTime());
    }
    return Array.from(buckets.values()).sort((a, b) => a.client.label.localeCompare(b.client.label));
  }, [visibleInvoices]);

  useEffect(() => {
    if (!open) return;
    setTotalAmount("");
    setMethod("transfer");
    setDate(getToday());
    setNotes("");
    setSelectedIds(new Set());
    setFilterClientId(clientId ?? ALL_CLIENTS);
    setMode("auto");
    setManualAmounts({});
    setSaveLeftoverAsCredit(true);
  }, [open, clientId]);

  const selectedInvoices = useMemo(
    () => unpaidInvoicesAll.filter(inv => selectedIds.has(inv.id)),
    [unpaidInvoicesAll, selectedIds],
  );

  const totalSelectedDebt = selectedInvoices.reduce(
    (sum, inv) => sum + (invoiceRemaining.get(inv.id) || 0),
    0,
  );

  // The "credit excess" workflow only makes sense when there's a
  // single client owner — otherwise we can't tell whose pool to top
  // up. Used both to gate the checkbox and to drive the credit insert.
  const uniqueSelectedClientId = useMemo(() => {
    if (selectedInvoices.length === 0) return null;
    const ids = new Set(selectedInvoices.map(inv => inv.client_id));
    return ids.size === 1 ? selectedInvoices[0].client_id : null;
  }, [selectedInvoices]);

  // Existing pool for the unique client (read-only display).
  const clientCreditPool = useMemo(() => {
    if (!uniqueSelectedClientId) return 0;
    return allCredits
      .filter(c => c.client_id === uniqueSelectedClientId && !c.consumed_at)
      .reduce((s, c) => s + Number(c.amount), 0);
  }, [allCredits, uniqueSelectedClientId]);

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

  // Distribution depends on mode:
  //   - auto:   spread total across selected invoices, oldest first.
  //   - manual: each invoice carries its own typed amount, capped at
  //             that invoice's remaining balance.
  const distribution = useMemo(() => {
    if (selectedInvoices.length === 0) return [];

    if (mode === "manual") {
      return selectedInvoices.map(inv => {
        const raw = parseFloat(manualAmounts[inv.id] ?? "");
        const invRemaining = invoiceRemaining.get(inv.id) || 0;
        const allocated = Number.isFinite(raw) && raw > 0 ? Math.min(raw, invRemaining) : 0;
        return { invoice: inv, amount: allocated };
      }).filter(d => d.amount > 0);
    }

    const amount = parseFloat(totalAmount) || 0;
    if (amount <= 0) return [];

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
  }, [mode, manualAmounts, totalAmount, selectedInvoices, invoiceRemaining]);

  const enteredAmount = parseFloat(totalAmount) || 0;
  const allocatedAmount = distribution.reduce((sum, d) => sum + d.amount, 0);
  // In auto mode the leftover is total entered − allocated. In manual
  // mode the user types each invoice value directly so "leftover" is
  // an explicit choice: how much of the entered total they want to
  // keep as credit. Compute it the same way for consistency.
  const leftover = Math.max(0, enteredAmount - allocatedAmount);
  const canSaveAsCredit = leftover > 0 && uniqueSelectedClientId !== null;

  const handleSubmit = async () => {
    if (distribution.length === 0 && !(canSaveAsCredit && saveLeftoverAsCredit)) return;
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
      let creditCreated = 0;
      if (canSaveAsCredit && saveLeftoverAsCredit) {
        await addCredit.mutateAsync({
          client_id: uniqueSelectedClientId!,
          amount: leftover,
          notes: notes ? `Excedente — ${notes}` : "Excedente de pagamento repartido",
        });
        creditCreated = leftover;
      }
      const parts: string[] = [];
      if (distribution.length > 0) {
        parts.push(`${formatCurrency(allocatedAmount)} em ${distribution.length} fatura(s)`);
      }
      if (creditCreated > 0) {
        parts.push(`${formatCurrency(creditCreated)} guardado como crédito`);
      }
      const unallocated = leftover - creditCreated;
      if (unallocated > 0) {
        parts.push(`${formatCurrency(unallocated)} não alocado`);
      }
      toast.success(parts.join(" · ") || "Sem alterações");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao registar pagamentos");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled =
    isSubmitting ||
    (distribution.length === 0 && !(canSaveAsCredit && saveLeftoverAsCredit && leftover > 0));

  const submitLabel = (() => {
    if (mode === "auto" && enteredAmount === 0) return "Introduz um valor";
    if (selectedInvoices.length === 0) return "Seleciona pelo menos uma fatura";
    const parts: string[] = [];
    if (distribution.length > 0) parts.push(`${distribution.length} pagamento(s)`);
    if (canSaveAsCredit && saveLeftoverAsCredit && leftover > 0) parts.push("1 crédito");
    if (parts.length === 0) return "Nada a registar";
    return `Registar ${parts.join(" + ")}`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Pagamento Repartido</DialogTitle>
          <DialogDescription>
            Distribui um valor recebido por várias faturas em aberto. Em modo automático abate as mais antigas primeiro; em modo manual escolhes o valor por linha.
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

          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm">Modo de distribuição</Label>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 ${mode === "auto" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/40"}`}
                onClick={() => setMode("auto")}
              >
                Automático
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 ${mode === "manual" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/40"}`}
                onClick={() => setMode("manual")}
              >
                Manual
              </button>
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
                        const isSelected = selectedIds.has(inv.id);
                        return (
                          <div
                            key={inv.id}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                          >
                            <Checkbox
                              className="mt-0.5"
                              checked={isSelected}
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
                            <div className="text-right shrink-0 space-y-1">
                              <p className="text-sm font-semibold text-card-foreground">{formatCurrency(remaining)}</p>
                              {mode === "manual" && isSelected ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="h-7 w-24 text-right text-xs"
                                  placeholder="0.00"
                                  value={manualAmounts[inv.id] ?? ""}
                                  onChange={e =>
                                    setManualAmounts(prev => ({ ...prev, [inv.id]: e.target.value }))
                                  }
                                />
                              ) : dist && dist.amount > 0 ? (
                                <p className="text-xs text-primary font-medium">
                                  −{formatCurrency(dist.amount)}
                                </p>
                              ) : null}
                            </div>
                          </div>
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
                {uniqueSelectedClientId && clientCreditPool > 0 && (
                  <> · saldo do cliente {formatCurrency(clientCreditPool)}</>
                )}
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

          {(distribution.length > 0 || leftover > 0) && (
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
                <>
                  {canSaveAsCredit ? (
                    <label className="flex items-start gap-2 text-sm pt-1">
                      <Checkbox
                        className="mt-0.5"
                        checked={saveLeftoverAsCredit}
                        onCheckedChange={(checked) => setSaveLeftoverAsCredit(!!checked)}
                      />
                      <span className="flex-1">
                        Registar <span className="font-semibold">{formatCurrency(leftover)}</span> como crédito do cliente
                        <span className="block text-xs text-muted-foreground">Será descontado automaticamente em pagamentos futuros.</span>
                      </span>
                    </label>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Não alocado</span>
                      <span className="font-semibold text-amber-600">{formatCurrency(leftover)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={submitDisabled}
          >
            {isSubmitting ? "A registar..." : submitLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
