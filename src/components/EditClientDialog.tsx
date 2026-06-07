import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/DecimalInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpdateClient, useSyncIva, useFetchWhatsAppGroups } from "@/hooks/use-data";
import type { WhatsAppGroup } from "@/hooks/use-data";
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

type FieldKey = "name" | "email" | "company" | "phone" | "nif";

// `full` fields span both grid columns; the rest pair up on wider screens.
const FIELDS: { key: FieldKey; label: string; placeholder: string; full?: boolean; type?: string }[] = [
  { key: "name", label: "Nome", placeholder: "Nome completo", full: true },
  { key: "company", label: "Empresa", placeholder: "Nome da empresa", full: true },
  { key: "email", label: "Email", placeholder: "email@exemplo.pt", type: "email" },
  { key: "phone", label: "Telefone", placeholder: "+351 ..." },
  { key: "nif", label: "NIF", placeholder: "509..." },
];

export function EditClientDialog({ client, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const updateClient = useUpdateClient();
  const syncIva = useSyncIva();
  const fetchGroups = useFetchWhatsAppGroups();
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    nif: "",
    whatsapp_group_jid: "",
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
      whatsapp_group_jid: client.whatsapp_group_jid || "",
      has_iva: client.has_iva ?? DEFAULT_HAS_IVA,
      iva_percentage: Number(client.iva_percentage ?? DEFAULT_IVA_PERCENTAGE),
    });
    setGroups([]);
  }, [client]);

  if (!client) return null;

  const setField = (key: keyof typeof form, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleFetchGroups = () => {
    fetchGroups.mutate(undefined, {
      onSuccess: items => {
        setGroups(items);
        toast({
          title: "Grupos obtidos",
          description: items.length
            ? `${items.length} grupo(s) encontrados. Escolhe um na lista.`
            : "A instância não tem grupos (ou ainda não sincronizou).",
        });
      },
      onError: err =>
        toast({ title: "Não foi possível obter grupos", description: err.message, variant: "destructive" }),
    });
  };

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
          whatsapp_group_jid: form.whatsapp_group_jid.trim() || null,
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
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display">Editar Cliente</DialogTitle>
        </DialogHeader>

        {/* Scrollable body so the form never gets cut off on small screens. */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* ── Dados do cliente ── */}
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Dados do cliente</h3>
              <p className="text-xs text-muted-foreground">
                Alterações ao nome, empresa, email, telefone ou NIF aplicam-se em{" "}
                <strong>todas</strong> as faturas e subscrições deste cliente — incluindo as já emitidas.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map(field => (
                <div key={field.key} className={`space-y-2 ${field.full ? "sm:col-span-2" : ""}`}>
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type ?? "text"}
                    placeholder={field.placeholder}
                    value={form[field.key]}
                    onChange={e => setField(field.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ── Faturação (IVA) ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Faturação</h3>
            <div className="space-y-3 rounded-lg border border-border p-3">
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
                  <DecimalInput
                    value={form.iva_percentage}
                    onChange={v => setForm(prev => ({ ...prev, iva_percentage: v }))}
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── WhatsApp ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">WhatsApp</h3>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">Grupo de destino</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={fetchGroups.isPending}
                  onClick={handleFetchGroups}
                >
                  {fetchGroups.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {fetchGroups.isPending ? "A obter…" : "Obter grupos"}
                </Button>
              </div>

              {groups.length > 0 && (
                <Select value={form.whatsapp_group_jid} onValueChange={v => setField("whatsapp_group_jid", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolhe um grupo da instância" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map(g => (
                      <SelectItem key={g.jid} value={g.jid}>
                        <span className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {g.name || g.jid}
                          <span className="text-xs text-muted-foreground">({g.participantCount})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">JID do grupo (ou número)</Label>
                <Input
                  placeholder="120363xxxxxxxxxxxx@g.us"
                  value={form.whatsapp_group_jid}
                  onChange={e => setField("whatsapp_group_jid", e.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Destino dos envios de faturas por WhatsApp para este cliente. Carrega em{" "}
                <strong>Obter grupos</strong> para escolher da lista, ou cola o <strong>JID do grupo</strong>{" "}
                (termina em <code>@g.us</code>). Também aceita um número de telemóvel para envio individual.
                Deixa vazio para não enviar.
              </p>
            </div>
          </section>
        </div>

        <div className="border-t border-border px-6 py-4">
          <Button onClick={handleSave} className="w-full" disabled={isPending || !canSave}>
            {isPending ? "A guardar..." : "Guardar alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
