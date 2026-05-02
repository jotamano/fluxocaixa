import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddClient } from "@/hooks/use-data";
import { useToast } from "@/hooks/use-toast";
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
  });

  const handleAdd = () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    addClient.mutate(form, {
      onSuccess: created => {
        setForm({ name: "", email: "", company: "", phone: "", nif: "" });
        onOpenChange(false);
        onCreated(created as Tables<"clients">);
        toast({ title: "Cliente criado!" });
      },
      onError: err => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
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
          <Button onClick={handleAdd} className="w-full" disabled={addClient.isPending}>
            {addClient.isPending ? "A adicionar..." : "Adicionar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
