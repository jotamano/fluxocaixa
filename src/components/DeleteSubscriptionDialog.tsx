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
import { useSubscriptionCascadePreview } from "@/hooks/use-data";

interface Props {
  subscriptionId: string | null;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirm dialog for subscription deletion. Always cascades to unpaid
 * invoices and their payments; paid invoices stay intact (fiscal
 * documents). Counts come from useSubscriptionCascadePreview so the
 * user sees what is about to happen before clicking eliminar.
 */
export function DeleteSubscriptionDialog({ subscriptionId, isPending, onCancel, onConfirm }: Props) {
  const open = subscriptionId !== null;
  const { data: preview } = useSubscriptionCascadePreview(subscriptionId);
  const unpaid = preview?.unpaidInvoices ?? 0;
  const paid = preview?.paidInvoices ?? 0;
  const payments = preview?.payments ?? 0;

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
            <div className="space-y-3">
              <p>A subscrição vai para o /lixo (podes restaurar). O que vai ser arrastado:</p>
              <ul className="text-sm list-disc pl-5 space-y-1">
                <li>{fmtInvoices(unpaid, "em aberto")} também são eliminadas.</li>
                <li>{fmtPayments(payments)} dessas faturas são eliminadas.</li>
                <li className="text-muted-foreground">
                  {paid === 0
                    ? "Sem faturas pagas a manter."
                    : paid === 1
                    ? "1 fatura paga é mantida (documento fiscal)."
                    : `${paid} faturas pagas são mantidas (documentos fiscais).`}
                </li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "A eliminar..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
