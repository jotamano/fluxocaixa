import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddPayment, usePayments, useClientCredits, useConsumeClientCredit, type Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal, getClientLabel } from "@/lib/data";
import { AlertTriangle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentMethod = "transfer" | "mbway" | "cash" | "card";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: Invoice[];
  initialInvoiceId?: string;
  /**
   * Optional explicit override for the prefilled amount. If omitted,
   * the dialog auto-computes the outstanding balance for the selected
   * invoice (total − sum of existing payments) — which is what callers
   * almost always want.
   */
  initialAmount?: string;
  title?: string;
}

const getToday = () => new Date().toISOString().split("T")[0];

export function PaymentDialog({
  open,
  onOpenChange,
  invoices,
  initialInvoiceId = "",
  initialAmount,
  title = "Registar Pagamento",
}: PaymentDialogProps) {
  const addPayment = useAddPayment();
  const consumeCredit = useConsumeClientCredit();
  const { data: allPayments = [] } = usePayments();
  const { data: allCredits = [] } = useClientCredits();

  const [form, setForm] = useState({
    invoiceId: initialInvoiceId,
    amount: initialAmount ?? "",
    method: "transfer" as PaymentMethod,
    notes: "",
    date: getToday(),
  });
  // When the selected invoice's client has unspent credit, the user
  // can opt to apply some of it as part of this payment. The credit
  // shown / consumed is capped at min(pool, outstanding − typed amount).
  const [useCredit, setUseCredit] = useState(false);

  // Per-invoice outstanding balance. We compute this for every invoice
  // in the list (not only the selected one) because the dropdown
  // surfaces the outstanding next to each option and filters out the
  // already-fully-paid ones.
  const outstandingByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(inv => {
      const total = getInvoiceItemsTotal(inv.invoice_items);
      const paid = allPayments
        .filter(p => p.invoice_id === inv.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      map.set(inv.id, Math.max(total - paid, 0));
    });
    return map;
  }, [invoices, allPayments]);

  const selectableInvoices = useMemo(
    () =>
      invoices.filter(invoice => {
        if (invoice.id === initialInvoiceId) return true;
        if (invoice.status === "paid" || invoice.status === "draft") return false;
        return (outstandingByInvoice.get(invoice.id) || 0) > 0;
      }),
    [invoices, initialInvoiceId, outstandingByInvoice],
  );

  const selectedInvoice = useMemo(
    () => invoices.find(invoice => invoice.id === form.invoiceId),
    [invoices, form.invoiceId],
  );

  const invoiceTotal = selectedInvoice ? getInvoiceItemsTotal(selectedInvoice.invoice_items) : 0;
  const invoicePaid = selectedInvoice
    ? allPayments
        .filter(p => p.invoice_id === selectedInvoice.id)
        .reduce((s, p) => s + Number(p.amount), 0)
    : 0;
  const invoiceOutstanding = Math.max(invoiceTotal - invoicePaid, 0);

  // Reset the form whenever the dialog opens. We re-derive amount from
  // outstanding — that's the most useful default in every flow we have
  // (Calendar mark-paid, InvoiceDetail "Pagar", Payments dialog after
  // the user picks an invoice). Callers can still override via
  // initialAmount when they have a specific reason.
  useEffect(() => {
    if (!open) return;
    const startInvoice = invoices.find(inv => inv.id === initialInvoiceId);
    let prefillAmount = initialAmount ?? "";
    if (!prefillAmount && startInvoice) {
      const outstanding = outstandingByInvoice.get(startInvoice.id) ?? 0;
      if (outstanding > 0) prefillAmount = outstanding.toFixed(2);
    }
    setForm({
      invoiceId: initialInvoiceId,
      amount: prefillAmount,
      method: "transfer",
      notes: "",
      date: getToday(),
    });
    setUseCredit(false);
    // We deliberately depend only on `open` — re-deriving on every
    // payment refetch would clobber what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Available credit pool for the selected invoice's client.
  const clientCreditPool = useMemo(() => {
    if (!selectedInvoice) return 0;
    return allCredits
      .filter(c => c.client_id === selectedInvoice.client_id && !c.consumed_at)
      .reduce((s, c) => s + Number(c.amount), 0);
  }, [allCredits, selectedInvoice]);

  // Auto-fill amount with the outstanding balance whenever the user
  // picks (or switches) an invoice in the dropdown — without
  // overwriting a value the user already typed manually.
  const handleInvoiceChange = (newInvoiceId: string) => {
    const outstanding = outstandingByInvoice.get(newInvoiceId) ?? 0;
    setForm(prev => {
      const previousOutstanding = outstandingByInvoice.get(prev.invoiceId) ?? 0;
      const userTypedCustomAmount =
        prev.amount !== "" &&
        prev.amount !== previousOutstanding.toFixed(2) &&
        prev.amount !== String(previousOutstanding);
      return {
        ...prev,
        invoiceId: newInvoiceId,
        amount: userTypedCustomAmount ? prev.amount : outstanding > 0 ? outstanding.toFixed(2) : "",
      };
    });
  };

  const amountNumber = parseFloat(form.amount) || 0;
  const exceedsOutstanding = amountNumber > invoiceOutstanding && invoiceOutstanding > 0;
  // How much of the credit pool would actually be applied if the user
  // ticks "use credit": fill what's still missing from outstanding
  // after the typed amount, capped by the pool. Zero out if the user
  // already covers the outstanding manually.
  const creditApplicable = useCredit
    ? Math.max(0, Math.min(clientCreditPool, invoiceOutstanding - amountNumber))
    : 0;

  const handleSubmit = async () => {
    if (!selectedInvoice) return;
    if (!form.amount && creditApplicable <= 0) return;

    try {
      // Cash/transfer/etc. payment first (skip if user only wants to
      // pay from credit). The credit consumption is logged as a
      // separate payment row with method="cash" and notes flagged.
      if (amountNumber > 0) {
        await addPayment.mutateAsync({
          invoice_id: selectedInvoice.id,
          client_id: selectedInvoice.client_id,
          amount: amountNumber,
          date: form.date,
          method: form.method,
          notes: form.notes || null,
        });
      }
      if (creditApplicable > 0) {
        const consumed = await consumeCredit.mutateAsync({
          clientId: selectedInvoice.client_id,
          amount: creditApplicable,
        });
        if (consumed > 0) {
          await addPayment.mutateAsync({
            invoice_id: selectedInvoice.id,
            client_id: selectedInvoice.client_id,
            amount: consumed,
            date: form.date,
            method: form.method,
            notes: form.notes ? `${form.notes} (saldo do cliente)` : "Aplicado saldo do cliente",
          });
        }
      }
      onOpenChange(false);
    } catch {
      // Errors surface via the mutations' default handlers / toasts.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Fatura</Label>
            <Select value={form.invoiceId} onValueChange={handleInvoiceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar fatura" />
              </SelectTrigger>
              <SelectContent>
                {selectableInvoices.map(invoice => {
                  const outstanding = outstandingByInvoice.get(invoice.id) ?? 0;
                  return (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      {invoice.number} — {getClientLabel(invoice)} ({formatCurrency(outstanding)})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedInvoice && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total da fatura</span>
                <span className="font-semibold text-foreground">{formatCurrency(invoiceTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Já pago</span>
                <span className="font-medium text-foreground">{formatCurrency(invoicePaid)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 mt-1">
                <span className="text-muted-foreground">Em falta</span>
                <span className={cn(
                  "font-semibold",
                  invoiceOutstanding > 0 ? "text-foreground" : "text-success",
                )}>{formatCurrency(invoiceOutstanding)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Valor (€)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
            />
            {selectedInvoice && invoiceOutstanding > 0 && (
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, amount: invoiceOutstanding.toFixed(2) }))}
                className="text-xs text-primary hover:underline"
              >
                Pagar valor em falta ({formatCurrency(invoiceOutstanding)})
              </button>
            )}
            {exceedsOutstanding && (
              <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                <AlertTriangle className="h-3 w-3" />
                Valor superior ao em falta — vai ficar com excedente.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Método</Label>
            <Select value={form.method} onValueChange={value => setForm(prev => ({ ...prev, method: value as PaymentMethod }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
            <Input type="date" value={form.date} onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Input placeholder="Ex: Pagamento parcial" value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
          </div>

          {selectedInvoice && clientCreditPool > 0 && invoiceOutstanding > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-border bg-accent/10 p-3 text-sm cursor-pointer">
              <Checkbox
                className="mt-0.5"
                checked={useCredit}
                onCheckedChange={(checked) => setUseCredit(!!checked)}
              />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 font-medium text-card-foreground">
                  <Wallet className="h-3.5 w-3.5" />
                  Aplicar saldo do cliente ({formatCurrency(clientCreditPool)} disponível)
                </span>
                <span className="block text-xs text-muted-foreground">
                  {creditApplicable > 0
                    ? `Vai abater ${formatCurrency(creditApplicable)} do saldo, registado como pagamento separado.`
                    : "Aumenta o valor em falta para usar o saldo, ou deixa o valor a 0 para pagar só com saldo."}
                </span>
              </span>
            </label>
          )}

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={
              !form.invoiceId ||
              addPayment.isPending ||
              consumeCredit.isPending ||
              (amountNumber <= 0 && creditApplicable <= 0)
            }
          >
            {addPayment.isPending || consumeCredit.isPending ? "A registar..." : "Registar pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
