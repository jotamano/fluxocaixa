import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useUpdateClient, useSyncIva } from "@/hooks/use-data";
import { DEFAULT_HAS_IVA, DEFAULT_IVA_PERCENTAGE } from "@/lib/data";
import type { Tables } from "@/integrations/supabase/types";

// Reusable client edit surface. Mirrors the dialog originally embedded
// in ClientDetail.tsx so it can be opened from anywhere in the app
// (Clients list, InvoiceDetail header, etc.) without duplicating logic.
//
// Splits the save into two RPCs:
//   1) `clients` UPDATE for the plain demographic fields. The TanStack
//      mutation invalidates `clients`, `invoices`, `subscriptions` so
//      every list/detail re-renders with the new name automatically.
//   2) `sync_iva` RPC for the (has_iva, iva_percentage) pair so it
//      cascades to the client's subscriptions and every still-editable
//      invoice in one shot — same path the ClientDetail edit used.

interface Props {
  client: Tables<"clients"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELDS: { key: "name" | "email" | "company" | "phone" | "nif"; label: string; placeholder: string }[] = [
  { key: "name", label: "Nome", placeholder: "Nome completo" },
  { key: "email", label: "Email", placeholder: "email@exemplo.pt" },
  { key: "company", label: "Empresa", placeholder: "Nome da empresa" },
  { key: "phone", label: "Telefone", placeholder: "+351 ..." },
  { key: "nif", label: "NIF", placeholder: "509..." },
];

export function EditClientDialog({ client, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const updateClient = useUpdateClient();
  const syncIva = useSyncIva();
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    nif: "",
    has_iva: DEFAULT_HAS_IVA,
    iva_percentage: DEFAULT_IVA_PERCENTAGE as number,
  });

  // Re-hydrate the form whenever a different client is opened. Falls
  // back to the new global defaults (false / 0) if the row is missing
  // the columns — should never happen post-migration but keeps the UI
  // safe against partially-typed rows.
  useEffect(() => {
    if (!client) return;
    setForm({
      name: client.name,
      email: client.email,
      company: client.company,
      phone: client.phone || "",
      nif: client.nif || "",
      has_iva: client.has_iva ?? DEFAULT_HAS_IVA,
      iva_percentage: Number(client.iva_percentage ?? DEFAULT_IVA_PERCENTAGE),
    });
  }, [client]);

  if (!client) return null;

  const handleSave = () => {
    updateClient.mutate(
      {
        id: client.id,
        updates: {
          name: form.name,
          email: form.email,
          company: form.company,
          phone: form.phone,
          nif: form.nif,
        },
      },
      {
        onSuccess: () => {
          syncIva.mutate(
            {
              source: "client",
              sourceId: client.id,
              hasIva: form.has_iva,
              ivaPercentage: Number(form.iva_percentage) || 0,
            },
            {
              onSuccess: () => {
                onOpenChange(false);
                toast({
                  title: "Cliente atualizado!",
                  description:
                    "Nome e dados aplicam-se de imediato em todas as faturas e subscrições. IVA propagado para subscrições e faturas em aberto.",
                });
              },
              onError: err =>
                toast({ title: "Erro a sincronizar IVA", description: err.message, variant: "destructive" }),
            },
          );
        },
        onError: err => toast({ title: "Erro", description: err.message, variant: "destructive" }),
      },
    );
  };

  const isPending = updateClient.isPending || syncIva.isPending;
  const canSave = !!form.name.trim() && !!form.email.trim() && !!form.company.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Editar Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Alterações ao nome, empresa, email, telefone ou NIF são aplicadas em <strong>todas</strong> as faturas
            e subscrições deste cliente — incluindo as já emitidas.
          </p>
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
          <Button onClick={handleSave} className="w-full" disabled={isPending || !canSave}>
            {isPending ? "A guardar..." : "Guardar alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
