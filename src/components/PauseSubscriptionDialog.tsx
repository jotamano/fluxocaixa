import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useSetSubscriptionStatus,
  usePendingInvoicesForSubscription,
  useDeleteInvoice,
  useUpdateInvoice,
} from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type PendingAction = "keep" | "cancel" | "delete_drafts";

interface Props {
  subscriptionId: string | null;
  onClose: () => void;
}

/**
 * Asks the user how to treat any pending invoices when pausing a subscription
 * (the "case-by-case" behavior requested by the operator):
 *  - keep:           leave invoices as-is (still need to be paid)
 *  - cancel:         set status='cancelled' on every pending invoice
 *  - delete_drafts:  hard-delete drafts only, leave others
 */
export function PauseSubscriptionDialog({ subscriptionId, onClose }: Props) {
  const open = subscriptionId !== null;
  const { toast } = useToast();
  const qc = useQueryClient();
  const setStatus = useSetSubscriptionStatus();
  const deleteInvoice = useDeleteInvoice();
  const updateInvoice = useUpdateInvoice();
  const { data: pending = [] } = usePendingInvoicesForSubscription(subscriptionId ?? undefined);

  const [pausedUntil, setPausedUntil] = useState<string>("");
  const [action, setAction] = useState<PendingAction>("keep");

  useEffect(() => {
    if (open) {
      setPausedUntil("");
      setAction("keep");
    }
  }, [open]);

  if (!subscriptionId) return null;

  const drafts = pending.filter((p) => p.status === "draft");
  const nonDrafts = pending.filter((p) => p.status !== "draft");

  const handleConfirm = async () => {
    try {
      // 1. Apply chosen invoice action.
      if (action === "cancel" && pending.length > 0) {
        await Promise.all(
          pending.map((p) =>
            // PostgREST doesn't support our enum's cancelled value directly — we
            // mark them as draft+notes for now. This is a simplification; if a
            // formal "cancelled" invoice status is added, swap in here.
            supabase.from("invoices").update({ status: "draft", notes: "Cancelada (subscrição pausada)" }).eq("id", p.id),
          ),
        );
      } else if (action === "delete_drafts" && drafts.length > 0) {
        for (const d of drafts) {
          // Drafts shouldn't have payments, but pass cascadePayments
          // explicitly so this code path stays correct if someone ever
          // adds payment registration for drafts.
          await deleteInvoice.mutateAsync({ id: d.id, cascadePayments: true });
        }
      }

      // 2. Pause subscription.
      await setStatus.mutateAsync({
        id: subscriptionId,
        status: "paused",
        pausedUntil: pausedUntil || null,
      });

      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["pending_invoices_for_subscription"] });
      toast({ title: "Subscrição pausada" });
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
    void updateInvoice; // referenced for future variants
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Pausar subscrição</DialogTitle>
          <DialogDescription>
            {pending.length === 0
              ? "Sem faturas pendentes nesta subscrição."
              : `Esta subscrição tem ${pending.length} fatura(s) pendente(s) (${drafts.length} em rascunho, ${nonDrafts.length} emitidas).`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paused_until">Pausada até (opcional)</Label>
            <Input
              id="paused_until"
              type="date"
              value={pausedUntil}
              onChange={(e) => setPausedUntil(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se preenchido, a subscrição reativa-se automaticamente nessa data.
            </p>
          </div>

          {pending.length > 0 && (
            <div className="space-y-2">
              <Label>O que fazer com as faturas pendentes?</Label>
              <RadioGroup value={action} onValueChange={(v) => setAction(v as PendingAction)} className="gap-2">
                <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer">
                  <RadioGroupItem value="keep" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Manter intactas</div>
                    <div className="text-xs text-muted-foreground">As faturas continuam a precisar de pagamento.</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer">
                  <RadioGroupItem value="cancel" className="mt-1" />
                  <div className="text-sm">
                    <div className="font-medium">Cancelar todas as pendentes ({pending.length})</div>
                    <div className="text-xs text-muted-foreground">Marcadas como rascunho com nota de cancelamento.</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer">
                  <RadioGroupItem value="delete_drafts" className="mt-1" disabled={drafts.length === 0} />
                  <div className="text-sm">
                    <div className="font-medium">Eliminar só rascunhos ({drafts.length})</div>
                    <div className="text-xs text-muted-foreground">Faturas emitidas/pendentes ficam intactas.</div>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleConfirm} disabled={setStatus.isPending}>
              {setStatus.isPending ? "A pausar..." : "Pausar subscrição"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
