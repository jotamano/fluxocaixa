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
import { Checkbox } from "@/components/ui/checkbox";
import { useInvoiceCascadePreview } from "@/hooks/use-data";

interface Props {
  invoiceId: string | null;
  invoiceNumber?: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: (opts: { cascadePayments: boolean; cascadeSubscription: boolean }) => void;
}

/**
 * Confirm dialog for invoice deletion. Shows real cascade counts and
 * lets the user opt in to also deleting the source subscription
 * (which itself cascades to its other unpaid invoices). Payments are
 * always cascaded — keeping orphan payments is more confusing than
 * useful, and they can still be restored individually from /lixo.
 */
export function DeleteInvoiceDialog({ invoiceId, invoiceNumber, isPending, onCancel, onConfirm }: Props) {
  const open = invoiceId !== null;
  const { data: preview } = useInvoiceCascadePreview(invoiceId);
  const [alsoDeleteSub, setAlsoDeleteSub] = useState(false);

  useEffect(() => {
    if (open) setAlsoDeleteSub(false);
  }, [open]);

  const hasSubscription = !!preview?.subscriptionId;
  const paymentCount = preview?.payments ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Anular fatura {invoiceNumber ?? ""}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>Esta ação é irreversível por código, mas a fatura e tudo o que for arrastado vai para o /lixo, onde podes restaurar.</p>
              <ul className="text-sm list-disc pl-5 space-y-1">
                <li>A fatura será eliminada.</li>
                <li>
                  {paymentCount === 0
                    ? "Sem pagamentos associados."
                    : paymentCount === 1
                    ? "1 pagamento associado também será eliminado."
                    : `${paymentCount} pagamentos associados também serão eliminados.`}
                </li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasSubscription && (
          <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer">
            <Checkbox
              checked={alsoDeleteSub}
              onCheckedChange={(v) => setAlsoDeleteSub(v === true)}
              className="mt-0.5"
            />
            <div className="text-sm">
              <div className="font-medium">Também eliminar a subscrição associada</div>
              <p className="text-muted-foreground text-xs mt-0.5">
                Vai também eliminar todas as outras faturas em aberto dessa subscrição (faturas pagas mantêm-se).
              </p>
            </div>
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={() => onConfirm({ cascadePayments: true, cascadeSubscription: alsoDeleteSub })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "A eliminar..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
