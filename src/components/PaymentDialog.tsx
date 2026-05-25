import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAddPayment, usePayments, type Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceTotalWithIva, getClientLabel, parseDecimal, formatDecimalForInput } from "@/lib/data";
import { AlertTriangle } from "lucide-react";
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
  const { data: allPayments = [] } = usePayments();

  const [form, setForm] = useState({
    invoiceId: initialInvoiceId,
    amount: initialAmount ?? "",
    method: "transfer" as PaymentMethod,
    notes: "",
    date: getToday(),
  });

  // Per-invoice outstanding balance. We compute this for every invoice
  // in the list (not only the selected one) because the dropdown
  // surfaces the outstanding next to each option and filters out the
  // already-fully-paid ones.
  const outstandingByInvoice = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(inv => {
      const total = getInvoiceTotalWithIva(inv.invoice_items, inv);
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

  const invoiceTotal = selectedInvoice ? getInvoiceTotalWithIva(selectedInvoice.invoice_items, selectedInvoice) : 0;
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
      if (outstanding > 0) prefillAmount = formatDecimalForInput(outstanding);
    }
    setForm({
      invoiceId: initialInvoiceId,
      amount: prefillAmount,
      method: "transfer",
      notes: "",
      date: getToday(),
    });
    // We deliberately depend only on `open` — re-deriving on every
    // payment refetch would clobber what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-fill amount with the outstanding balance whenever the user
  // picks (or switches) an invoice in the dropdown — without
  // overwriting a value the user already typed manually.
  const handleInvoiceChange = (newInvoiceId: string) => {
    const outstanding = outstandingByInvoice.get(newInvoiceId) ?? 0;
    setForm(prev => {
      const previousOutstanding = outstandingByInvoice.get(prev.invoiceId) ?? 0;
      // Compare numerically so the auto-prefill detection works
      // regardless of whether the user typed "," or "." — string
      // comparison would say "12,50" ≠ "12.50" and incorrectly
      // preserve a value that's identical to the outstanding.
      const userTypedCustomAmount =
        prev.amount !== "" && parseDecimal(prev.amount) !== previousOutstanding;
      return {
        ...prev,
        invoiceId: newInvoiceId,
        amount: userTypedCustomAmount ? prev.amount : outstanding > 0 ? formatDecimalForInput(outstanding) : "",
      };
    });
  };

  const handleSubmit = () => {
    if (!selectedInvoice || !form.amount) return;

    addPayment.mutate(
      {
        invoice_id: selectedInvoice.id,
        client_id: selectedInvoice.client_id,
        amount: parseDecimal(form.amount),
        date: form.date,
        method: form.method,
        notes: form.notes || null,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
  };

  const amountNumber = parseDecimal(form.amount);
  const exceedsOutstanding = amountNumber > invoiceOutstanding && invoiceOutstanding > 0;

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
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={form.amount}
              onChange={e => {
                const v = e.target.value;
                if (v !== "" && !/^-?\d*[.,]?\d*$/.test(v)) return;
                setForm(prev => ({ ...prev, amount: v }));
              }}
            />
            {selectedInvoice && invoiceOutstanding > 0 && (
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, amount: formatDecimalForInput(invoiceOutstanding) }))}
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

          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={!form.invoiceId || !form.amount || amountNumber <= 0 || addPayment.isPending}
          >
            {addPayment.isPending ? "A registar..." : "Registar pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
