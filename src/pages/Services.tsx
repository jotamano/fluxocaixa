import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Package, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useServices,
  useAddService,
  useUpdateService,
  useDeleteService,
  useInvoices,
  useSubscriptions,
  useAllSubscriptionItems,
  type Service,
} from "@/hooks/use-data";
import { formatCurrency, formatDecimalForInput, parseDecimal } from "@/lib/data";
import { computeServiceUsageStats } from "@/lib/stats";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

export default function Services() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: services = [] } = useServices();
  const { data: invoices = [] } = useInvoices();
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: subItems = [] } = useAllSubscriptionItems();
  const addService = useAddService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  // Pre-compute stats per service in a single pass over the (already-cached)
  // invoices/subs lists. Indexed by service id so each card render is O(1).
  const statsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeServiceUsageStats>>();
    for (const s of services) {
      map.set(s.id, computeServiceUsageStats(s.id, invoices, subscriptions, subItems));
    }
    return map;
  }, [services, invoices, subscriptions, subItems]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultPrice: "",
    active: true,
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", defaultPrice: "", active: true });
    setDialogOpen(true);
  };

  const openEdit = (id: string) => {
    const s = services.find(s => s.id === id);
    if (!s) return;
    setEditingId(id);
    setForm({
      name: s.name,
      defaultPrice: formatDecimalForInput(s.default_price),
      active: s.active,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      updateService.mutate(
        { id: editingId, updates: { name: form.name, default_price: parseDecimal(form.defaultPrice), active: form.active } },
        {
          onSuccess: () => { setDialogOpen(false); toast({ title: "Serviço atualizado!" }); },
          onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
        }
      );
    } else {
      addService.mutate(
        { name: form.name, default_price: parseDecimal(form.defaultPrice) },
        {
          onSuccess: () => { setDialogOpen(false); toast({ title: "Serviço criado!" }); },
          onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteService.mutate(deleteId, {
      onSuccess: () => { setConfirmOpen(false); setDeleteId(null); toast({ title: "Serviço eliminado" }); },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const activeServices = services.filter(s => s.active);
  const inactiveServices = services.filter(s => !s.active);

  // Workspace roll-up shown above the grid: portfolio-level numbers
  // (lifetime billed across all services, total active subs touching
  // any service). Rebuilds when stats change so it stays live.
  const portfolioTotals = useMemo(() => {
    let lifetimeBilled = 0;
    let lifetimeReceived = 0;
    let activeSubs = 0;
    for (const stats of statsById.values()) {
      lifetimeBilled += stats.totalBilledGross;
      lifetimeReceived += stats.totalReceived;
      activeSubs += stats.activeSubscriptions;
    }
    return { lifetimeBilled, lifetimeReceived, activeSubs };
  }, [statsById]);

  const renderService = (s: Service) => {
    const stats = statsById.get(s.id);
    return (
      <div key={s.id} className={`group relative rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-elevated ${!s.active ? 'opacity-70' : ''}`}>
        <Link to={`/servicos/${s.id}`} className="block">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-semibold text-card-foreground truncate">{s.name}</h3>
                <p className="text-xs text-muted-foreground">Preço base {formatCurrency(Number(s.default_price))}</p>
              </div>
            </div>
            <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
          {stats && (
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <div>
                <p className="font-display text-sm font-bold text-card-foreground tabular-nums">{formatCurrency(stats.totalBilledGross)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Faturado</p>
              </div>
              <div>
                <p className="font-display text-sm font-bold text-card-foreground tabular-nums">{stats.invoiceCount}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Faturas</p>
              </div>
              <div>
                <p className="font-display text-sm font-bold text-card-foreground tabular-nums">{stats.activeSubscriptions}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subs ativas</p>
              </div>
            </div>
          )}
        </Link>
        <div className="mt-4 flex gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(s.id); }}>
            <Pencil className="h-3 w-3" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteId(s.id); setConfirmOpen(true); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Serviços</h1>
          <p className="mt-1 text-muted-foreground">Gere os serviços disponíveis para faturação</p>
        </div>
        <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Novo Serviço</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Serviços ativos</p>
          <p className="mt-1 font-display text-2xl font-bold text-card-foreground">{activeServices.length}</p>
          {inactiveServices.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{inactiveServices.length} inativo(s)</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Faturado total</p>
          <p className="mt-1 font-display text-2xl font-bold text-card-foreground">{formatCurrency(portfolioTotals.lifetimeBilled)}</p>
          <p className="mt-1 text-xs text-success">{formatCurrency(portfolioTotals.lifetimeReceived)} já recebido</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Subscrições ativas</p>
          <p className="mt-1 font-display text-2xl font-bold text-card-foreground">{portfolioTotals.activeSubs}</p>
          <p className="mt-1 text-xs text-muted-foreground">A usar pelo menos um serviço</p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display font-semibold text-foreground">Ativos ({activeServices.length})</h2>
        {activeServices.length === 0 && <p className="text-sm text-muted-foreground">Sem serviços ativos.</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeServices.map(renderService)}
        </div>
      </div>

      {inactiveServices.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-foreground">Inativos ({inactiveServices.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveServices.map(renderService)}
          </div>
        </div>
      )}

      {/* Service dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome do Serviço</Label>
              <Input placeholder="Ex: Gestão de Redes Sociais" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Preço Base (€)</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.defaultPrice}
                onChange={e => {
                  const v = e.target.value;
                  if (v !== "" && !/^-?\d*[.,]?\d*$/.test(v)) return;
                  setForm(p => ({ ...p, defaultPrice: v }));
                }}
              />
            </div>
            {editingId && (
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
              </div>
            )}
            <div className="flex items-center gap-2">
              {editingId && (
                <Button variant="outline" size="sm" type="button" onClick={() => { setDialogOpen(false); navigate(`/servicos/${editingId}`); }}>
                  Ver estatísticas
                </Button>
              )}
              <Button className="ml-auto" onClick={handleSave} disabled={addService.isPending || updateService.isPending || !form.name || !form.defaultPrice}>
                {(addService.isPending || updateService.isPending) ? "A guardar..." : editingId ? "Guardar" : "Criar Serviço"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Eliminar serviço" description="Tens a certeza que queres eliminar este serviço? Esta ação é irreversível." onConfirm={handleDelete} isPending={deleteService.isPending} />
    </div>
  );
}
