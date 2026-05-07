import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAddClient } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_IVA_PERCENTAGE } from "@/lib/data";
import type { Tables } from "@/integrations/supabase/types";

// Inline client creation surface used next to client pickers (subscription
// editor, NewInvoice). Keeps the user in the flow they were in: picks
// "+ Novo cliente" → fills the same form they'd see at /clientes → on
// success the parent receives the new row via onCreated and pre-selects
// it. Passing the full row avoids racing the useClients refetch.
//
// Mirrors the field set on /clientes for parity (Clients.tsx).

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The full inserted client row is passed back so callers can read
  // the id (and any other field) without waiting for the parent
  // useClients refetch.
  onCreated: (client: Tables<"clients">) => void;
  // Optional initial values (e.g. user typed something into the picker
  // search before clicking "+ Novo cliente"; we could pre-populate).
  defaultName?: string;
}

const FIELDS: { key: "name" | "email" | "company" | "phone" | "nif"; label: string; placeholder: string }[] = [
  { key: "name", label: "Nome", placeholder: "Nome completo" },
  { key: "email", label: "Email", placeholder: "email@exemplo.pt" },
  { key: "company", label: "Empresa", placeholder: "Nome da empresa" },
  { key: "phone", label: "Telefone", placeholder: "+351 ..." },
  { key: "nif", label: "NIF", placeholder: "509..." },
];

export function QuickCreateClientDialog({ open, onOpenChange, onCreated, defaultName = "" }: Props) {
  const { toast } = useToast();
  const addClient = useAddClient();
  const [form, setForm] = useState({
    name: defaultName,
    email: "",
    company: "",
    phone: "",
    nif: "",
    has_iva: true,
    iva_percentage: DEFAULT_IVA_PERCENTAGE,
  });

  const resetForm = () => setForm({
    name: "", email: "", company: "", phone: "", nif: "",
    has_iva: true, iva_percentage: DEFAULT_IVA_PERCENTAGE,
  });

  const handleAdd = () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    addClient.mutate(
      {
        name: form.name,
        email: form.email,
        company: form.company,
        phone: form.phone,
        nif: form.nif,
        has_iva: form.has_iva,
        iva_percentage: form.has_iva ? Number(form.iva_percentage) || 0 : 0,
      },
      {
        onSuccess: created => {
          resetForm();
          onOpenChange(false);
          onCreated(created as Tables<"clients">);
          toast({ title: "Cliente criado!" });
        },
        onError: err => toast({ title: "Erro", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Adicionar Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          {FIELDS.map(field => (
            <div key={field.key} className="space-y-2">
              <Label>{field.label}</Label>
              <Input
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Tem IVA</Label>
                <p className="text-xs text-muted-foreground">Aplica IVA por defeito a faturas e subscrições</p>
              </div>
              <Switch
                checked={form.has_iva}
                onCheckedChange={v => setForm(prev => ({ ...prev, has_iva: v }))}
              />
            </div>
            {form.has_iva && (
              <div className="space-y-2">
                <Label className="text-sm">Percentagem de IVA (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.iva_percentage}
                  onChange={e => setForm(prev => ({ ...prev, iva_percentage: Number(e.target.value) }))}
                />
              </div>
            )}
          </div>
          <Button onClick={handleAdd} className="w-full" disabled={addClient.isPending}>
            {addClient.isPending ? "A adicionar..." : "Adicionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
