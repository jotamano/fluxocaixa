import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddService } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

// Inline service creation surface used next to service pickers (line
// items in NewInvoice / InvoiceDetail editor, subscription editor).
// Mirrors the field set on /servicos for parity (Services.tsx) — name +
// default_price, with `service_type` falling back to the DB default
// (`'social_media'`) the same way Services.tsx relies on it.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The full inserted service row is passed back so callers can quick-
  // fill description/price without waiting for the useActiveServices
  // refetch (the parent query is invalidated by useAddService, but
  // we'd otherwise race the refetch when the caller looks up the new
  // id immediately).
  onCreated: (service: Tables<"services">) => void;
  // Optional pre-fill (e.g. the user picker context could pass a name
  // they typed). Empty by default.
  defaultName?: string;
}

export function QuickCreateServiceDialog({ open, onOpenChange, onCreated, defaultName = "" }: Props) {
  const { toast } = useToast();
  const addService = useAddService();
  const [form, setForm] = useState({ name: defaultName, defaultPrice: "0" });

  // Reset whenever the dialog reopens, so picking "+ Novo serviço" twice
  // in a row doesn't carry stale data from the previous attempt.
  useEffect(() => {
    if (open) {
      setForm({ name: defaultName, defaultPrice: "0" });
    }
  }, [open, defaultName]);

  const handleAdd = () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const price = Number(form.defaultPrice);
    if (Number.isNaN(price) || price < 0) {
      toast({ title: "Preço inválido", variant: "destructive" });
      return;
    }
    addService.mutate(
      { name: form.name, default_price: price },
      {
        onSuccess: created => {
          onOpenChange(false);
          onCreated(created as Tables<"services">);
          toast({ title: "Serviço criado!" });
        },
        onError: err => toast({ title: "Erro", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Adicionar Serviço</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              placeholder="Ex: Gestão de redes sociais"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Preço base (€)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.defaultPrice}
              onChange={e => setForm(prev => ({ ...prev, defaultPrice: e.target.value }))}
            />
          </div>
          <Button onClick={handleAdd} className="w-full" disabled={addService.isPending}>
            {addService.isPending ? "A adicionar..." : "Adicionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
