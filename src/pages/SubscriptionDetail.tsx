import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useSubscription,
  useSubscriptionItems,
  useSubscriptionInvoices,
  useSubscriptionPriceHistory,
  useAddSubscriptionItem,
  useUpdateSubscriptionItem,
  useDeleteSubscriptionItem,
  useCategories,
} from "@/hooks/use-data";
import type { SubscriptionItem } from "@/hooks/use-data";
import { formatCurrency, frequencyLabels } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";

const KIND_LABELS: Record<SubscriptionItem["kind"], string> = {
  recurring: "Recorrente",
  setup: "Setup (uma vez)",
  addon: "Add-on",
};

export default function SubscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: sub } = useSubscription(id);
  const { data: items = [] } = useSubscriptionItems(id);
  const { data: invoices = [] } = useSubscriptionInvoices(id);
  const { data: priceHistory = [] } = useSubscriptionPriceHistory(id);
  const { data: categories = [] } = useCategories();

  const addItem = useAddSubscriptionItem();
  const updateItem = useUpdateSubscriptionItem();
  const deleteItem = useDeleteSubscriptionItem();

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SubscriptionItem | null>(null);
  const [itemForm, setItemForm] = useState({
    description: "",
    kind: "recurring" as SubscriptionItem["kind"],
    amount: "",
    categoryId: "",
  });

  if (!sub) {
    return <div className="p-8 text-muted-foreground">A carregar…</div>;
  }

  const total = items.reduce((sum, it) => sum + (it.kind === "recurring" || it.kind === "addon" ? Number(it.amount) : 0), 0);
  const setupTotal = items.filter(it => it.kind === "setup").reduce((sum, it) => sum + Number(it.amount), 0);

  const openItemEditor = (item: SubscriptionItem | null) => {
    setEditingItem(item);
    setItemForm({
      description: item?.description ?? "",
      kind: item?.kind ?? "recurring",
      amount: item ? String(Number(item.amount)) : "",
      categoryId: item?.category_id ?? "",
    });
    setItemDialogOpen(true);
  };

  const handleSaveItem = () => {
    if (!itemForm.description || !itemForm.amount) return;
    const payload = {
      subscription_id: sub.id,
      description: itemForm.description,
      kind: itemForm.kind,
      amount: Number(itemForm.amount),
      category_id: itemForm.categoryId || null,
      position: editingItem?.position ?? items.length,
    };
    if (editingItem) {
      updateItem.mutate(
        { id: editingItem.id, updates: payload },
        {
          onSuccess: () => {
            setItemDialogOpen(false);
            toast({ title: "Item atualizado" });
          },
        },
      );
    } else {
      addItem.mutate(payload, {
        onSuccess: () => {
          setItemDialogOpen(false);
          toast({ title: "Item adicionado" });
        },
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Link to={`/subscricoes?edit=${sub.id}`}>
          <Button variant="outline" className="gap-2"><Pencil className="h-4 w-4" /> Editar subscrição</Button>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{sub.name}</h1>
            <p className="text-sm text-muted-foreground">
              <Link to={`/clientes/${sub.client_id}`} className="hover:underline">{sub.clients?.company}</Link>
              {sub.clients?.name ? ` · ${sub.clients.name}` : ""}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
            sub.status === "active" ? 'bg-success/10 text-success border-success/20'
            : sub.status === "paused" ? 'bg-warning/10 text-warning border-warning/20'
            : 'bg-muted text-muted-foreground border-border'
          }`}>
            {sub.status === "active" ? "Ativa" : sub.status === "paused" ? "Pausada" : "Cancelada"}
          </span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <Stat label="Mensalidade" value={formatCurrency(total)} suffix={`/${frequencyLabels[sub.frequency].toLowerCase()}`} />
          <Stat label="Setup pendente" value={formatCurrency(setupTotal)} />
          <Stat label="Próxima faturação" value={new Date(sub.next_billing_date).toLocaleDateString('pt-PT')} />
          <Stat label="Pro-rata 1ª fatura" value={sub.prorate_first_invoice ? "Sim" : "Não"} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground">Itens</h2>
          <Button size="sm" className="gap-2" onClick={() => openItemEditor(null)}><Plus className="h-4 w-4" /> Adicionar item</Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem itens.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-card-foreground">{it.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABELS[it.kind]}
                    {it.kind === "setup" && it.invoiced_at ? " · já faturado" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatCurrency(Number(it.amount))}</span>
                  <Button variant="ghost" size="icon" onClick={() => openItemEditor(it)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteItem.mutate(it.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4">Faturas geradas ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem faturas geradas a partir desta subscrição.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const totalInv = (inv.invoice_items ?? []).reduce((s, it) => s + it.quantity * Number(it.unit_price), 0);
              return (
                <Link key={inv.id} to={`/faturas/${inv.id}`} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-card-foreground">{inv.number}</p>
                    <p className="text-xs text-muted-foreground">Emitida {new Date(inv.issue_date).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={inv.status} />
                    <span className="text-sm font-semibold">{formatCurrency(totalInv)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico de preços
        </h2>
        {priceHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem histórico de preços.</p>
        ) : (
          <div className="space-y-2">
            {priceHistory.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{formatCurrency(Number(h.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.valid_from).toLocaleDateString('pt-PT')} → {h.valid_to ? new Date(h.valid_to).toLocaleDateString('pt-PT') : "atual"}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingItem ? "Editar item" : "Novo item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={itemForm.description} onChange={(e) => setItemForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={itemForm.kind} onValueChange={(v) => setItemForm(f => ({ ...f, kind: v as SubscriptionItem["kind"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(KIND_LABELS) as [SubscriptionItem["kind"], string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor (€)</Label>
                <Input type="number" min="0" step="0.01" value={itemForm.amount} onChange={(e) => setItemForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={itemForm.categoryId || "_none"} onValueChange={(v) => setItemForm(f => ({ ...f, categoryId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSaveItem} disabled={addItem.isPending || updateItem.isPending}>
              {editingItem ? "Guardar alterações" : "Adicionar item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}{suffix && <span className="text-xs text-muted-foreground ml-1">{suffix}</span>}</p>
    </div>
  );
}
