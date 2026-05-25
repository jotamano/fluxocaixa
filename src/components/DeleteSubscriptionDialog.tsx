import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSubscriptionCascadePreview, type DeleteSubscriptionMode } from "@/hooks/use-data";

interface Props {
  subscriptionId: string | null;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (mode: DeleteSubscriptionMode) => void;
}

/**
 * Confirm dialog for subscription deletion. Two modes:
 *
 *   - "cascade" (default): also soft-delete every unpaid invoice linked
 *     to the subscription and their payments. Paid invoices stay intact
 *     as fiscal documents.
 *   - "detach": only anula the subscription itself, leaving every
 *     already-issued invoice in place. The link from invoice lines back
 *     to the subscription is broken so they become regular one-off
 *     items on those invoices. The cron stops generating new invoices
 *     because the sub is now soft-deleted.
 *
 * Counts come from useSubscriptionCascadePreview so the cascade option
 * shows the user what is actually about to happen before they confirm.
 */
export function DeleteSubscriptionDialog({ subscriptionId, isPending, onCancel, onConfirm }: Props) {
  const open = subscriptionId !== null;
  const { data: preview } = useSubscriptionCascadePreview(subscriptionId);
  const unpaid = preview?.unpaidInvoices ?? 0;
  const paid = preview?.paidInvoices ?? 0;
  const payments = preview?.payments ?? 0;
  const totalLinked = unpaid + paid;

  const [mode, setMode] = useState<DeleteSubscriptionMode>("cascade");

  // Reset to the safer default ("cascade", which matches the previous
  // single-button behaviour) every time the dialog re-opens so we never
  // surprise the user with a leftover choice from a prior confirmation.
  useEffect(() => {
    if (open) setMode("cascade");
  }, [open]);

  const fmtInvoices = (n: number, label: string) =>
    n === 0 ? `Sem faturas ${label}` : n === 1 ? `1 fatura ${label}` : `${n} faturas ${label}`;
  const fmtPayments = (n: number) =>
    n === 0 ? "Sem pagamentos associados" : n === 1 ? "1 pagamento associado" : `${n} pagamentos associados`;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar subscrição</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Escolhe o que fazer às faturas já criadas. O cron deixa de gerar novas faturas em qualquer das opções.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeleteSubscriptionMode)} className="space-y-3">
          <label
            htmlFor="delete-sub-mode-cascade"
            className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 cursor-pointer"
          >
            <RadioGroupItem value="cascade" id="delete-sub-mode-cascade" className="mt-0.5" />
            <div className="space-y-2 text-sm">
              <div className="font-medium">Eliminar subscrição e faturas em aberto</div>
              <ul className="text-muted-foreground text-xs list-disc pl-4 space-y-0.5">
                <li>{fmtInvoices(unpaid, "em aberto")} também são eliminadas.</li>
                <li>{fmtPayments(payments)} dessas faturas são eliminadas.</li>
                <li>
                  {paid === 0
                    ? "Sem faturas pagas a manter."
                    : paid === 1
                    ? "1 fatura paga é mantida (documento fiscal)."
                    : `${paid} faturas pagas são mantidas (documentos fiscais).`}
                </li>
              </ul>
            </div>
          </label>

          <label
            htmlFor="delete-sub-mode-detach"
            className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 cursor-pointer"
          >
            <RadioGroupItem value="detach" id="delete-sub-mode-detach" className="mt-0.5" />
            <div className="space-y-2 text-sm">
              <div className="font-medium">Anular subscrição e manter faturas</div>
              <p className="text-muted-foreground text-xs">
                {totalLinked === 0
                  ? "A subscrição é anulada. Não há faturas associadas para manter."
                  : totalLinked === 1
                  ? "A subscrição é anulada e a 1 fatura associada fica como está \u2014 a linha passa a pagamento único."
                  : `A subscrição é anulada e as ${totalLinked} faturas associadas ficam como estão \u2014 as linhas passam a pagamento único.`}
              </p>
            </div>
          </label>
        </RadioGroup>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() => onConfirm(mode)}
            className={mode === "cascade"
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : ""}
          >
            {isPending
              ? mode === "cascade" ? "A eliminar..." : "A anular..."
              : mode === "cascade" ? "Eliminar" : "Anular subscrição"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
