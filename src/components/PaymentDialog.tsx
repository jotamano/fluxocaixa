import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAddPayment, type Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal } from "@/lib/data";

type PaymentMethod = "transfer" | "mbway" | "cash" | "card";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: Invoice[];
  initialInvoiceId?: string;
  initialAmount?: string;
  title?: string;
}

const getToday = () => new Date().toISOString().split("T")[0];

export function PaymentDialog({
  open,
  onOpenChange,
  invoices,
  initialInvoiceId = "",
  initialAmount = "",
  title = "Registar Pagamento",
}: PaymentDialogProps) {
  const addPayment = useAddPayment();
  const [form, setForm] = useState({
    invoiceId: initialInvoiceId,
    amount: initialAmount,
    method: "transfer" as PaymentMethod,
    notes: "",
    date: getToday(),
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      invoiceId: initialInvoiceId,
      amount: initialAmount,
      method: "transfer",
      notes: "",
      date: getToday(),
    });
  }, [open, initialInvoiceId, initialAmount]);

  const selectableInvoices = useMemo(
    () => invoices.filter(invoice => invoice.status !== "paid" || invoice.id === initialInvoiceId),
    [invoices, initialInvoiceId],
  );

  const selectedInvoice = useMemo(
    () => invoices.find(invoice => invoice.id === form.invoiceId),
    [invoices, form.invoiceId],
  );

  const invoiceTotal = selectedInvoice ? getInvoiceItemsTotal(selectedInvoice.invoice_items) : 0;

  const handleSubmit = () => {
    if (!selectedInvoice || !form.amount) return;

    addPayment.mutate(
      {
        invoice_id: selectedInvoice.id,
        client_id: selectedInvoice.client_id,
        amount: parseFloat(form.amount),
        date: form.date,
        method: form.method,
        notes: form.notes || null,
      },
      {
        onSuccess: () => onOpenChange(false),
      },
    );
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
            <Select value={form.invoiceId} onValueChange={value => setForm(prev => ({ ...prev, invoiceId: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar fatura" />
              </SelectTrigger>
              <SelectContent>
                {selectableInvoices.map(invoice => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.number} — {invoice.clients?.company || "Sem cliente"} ({formatCurrency(getInvoiceItemsTotal(invoice.invoice_items))})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedInvoice && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              Total desta fatura: <span className="font-semibold text-foreground">{formatCurrency(invoiceTotal)}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Valor (€)</Label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))} />
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

          <Button onClick={handleSubmit} className="w-full" disabled={!form.invoiceId || !form.amount || addPayment.isPending}>
            {addPayment.isPending ? "A registar..." : "Registar pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}