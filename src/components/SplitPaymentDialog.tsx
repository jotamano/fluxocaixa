import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddPayment, usePayments, type Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal } from "@/lib/data";
import { toast } from "sonner";

type PaymentMethod = "transfer" | "mbway" | "cash" | "card";

interface SplitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: Invoice[];
  clientId?: string;
}

const getToday = () => new Date().toISOString().split("T")[0];

export function SplitPaymentDialog({ open, onOpenChange, invoices, clientId }: SplitPaymentDialogProps) {
  const addPayment = useAddPayment();
  const { data: allPayments = [] } = usePayments();
  const [totalAmount, setTotalAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [date, setDate] = useState(getToday());
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const unpaidInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (inv.status === "paid" || inv.status === "draft") return false;
      if (clientId && inv.client_id !== clientId) return false;
      return true;
    });
  }, [invoices, clientId]);

  // Calculate remaining balance per invoice
  const invoiceRemaining = useMemo(() => {
    const map = new Map<string, number>();
    unpaidInvoices.forEach(inv => {
      const total = getInvoiceItemsTotal(inv.invoice_items);
      const paid = allPayments
        .filter(p => p.invoice_id === inv.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      map.set(inv.id, Math.max(total - paid, 0));
    });
    return map;
  }, [unpaidInvoices, allPayments]);

  useEffect(() => {
    if (!open) return;
    setTotalAmount("");
    setMethod("transfer");
    setDate(getToday());
    setNotes("");
    setSelectedIds(new Set());
  }, [open]);

  const selectedInvoices = useMemo(
    () => unpaidInvoices.filter(inv => selectedIds.has(inv.id)),
    [unpaidInvoices, selectedIds],
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

  // Distribute the total amount across selected invoices (oldest first by due_date), using REMAINING balance
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
      toast.success(`Pagamento de ${formatCurrency(parseFloat(totalAmount))} distribuído por ${distribution.length} fatura(s)`);
      onOpenChange(false);
    } catch {
      toast.error("Erro ao registar pagamentos");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Pagamento Repartido</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
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
            <Label>Selecionar faturas a abater</Label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {unpaidInvoices.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">Sem faturas pendentes</p>
              ) : (
                unpaidInvoices.map(inv => {
                  const remaining = invoiceRemaining.get(inv.id) || 0;
                  const dist = distribution.find(d => d.invoice.id === inv.id);
                  return (
                    <label
                      key={inv.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <Checkbox
                        checked={selectedIds.has(inv.id)}
                        onCheckedChange={() => toggleInvoice(inv.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">
                          {inv.number} — {inv.clients?.company || "—"}
                        </p>
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
                })
              )}
            </div>
            {selectedInvoices.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Dívida selecionada: <span className="font-semibold text-foreground">{formatCurrency(totalSelectedDebt)}</span>
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribuição</p>
              {distribution.map(({ invoice, amount }) => (
                <div key={invoice.id} className="flex justify-between text-sm">
                  <span className="text-card-foreground">{invoice.number}</span>
                  <span className="font-semibold text-card-foreground">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={distribution.length === 0 || isSubmitting}
          >
            {isSubmitting ? "A registar..." : `Distribuir ${totalAmount ? formatCurrency(parseFloat(totalAmount) || 0) : "—"} por ${distribution.length} fatura(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
