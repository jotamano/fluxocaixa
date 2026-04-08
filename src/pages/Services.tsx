import { useState } from "react";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useServices, useAddService, useUpdateService, useDeleteService } from "@/hooks/use-data";
import { serviceLabels, formatCurrency, type ServiceType } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

export default function Services() {
  const { toast } = useToast();
  const { data: services = [] } = useServices();
  const addService = useAddService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    defaultPrice: "",
    serviceType: "social_media" as ServiceType,
    active: true,
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", defaultPrice: "", serviceType: "social_media", active: true });
    setDialogOpen(true);
  };

  const openEdit = (id: string) => {
    const s = services.find(s => s.id === id);
    if (!s) return;
    setEditingId(id);
    setForm({
      name: s.name,
      defaultPrice: String(Number(s.default_price)),
      serviceType: s.service_type,
      active: s.active,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editingId) {
      updateService.mutate(
        { id: editingId, updates: { name: form.name, default_price: Number(form.defaultPrice), service_type: form.serviceType, active: form.active } },
        {
          onSuccess: () => { setDialogOpen(false); toast({ title: "Serviço atualizado!" }); },
          onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
        }
      );
    } else {
      addService.mutate(
        { name: form.name, default_price: Number(form.defaultPrice), service_type: form.serviceType },
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

  const renderService = (s: typeof services[0]) => (
    <div key={s.id} className={`rounded-xl border border-border bg-card p-5 shadow-card ${!s.active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-card-foreground">{s.name}</h3>
            <p className="text-xs text-muted-foreground">{serviceLabels[s.service_type]}</p>
          </div>
        </div>
        <span className="text-lg font-bold font-display text-card-foreground">{formatCurrency(Number(s.default_price))}</span>
      </div>
      <div className="mt-4 pt-3 border-t border-border flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => openEdit(s.id)}>
          <Pencil className="h-3 w-3" /> Editar
        </Button>
        <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => { setDeleteId(s.id); setConfirmOpen(true); }}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Serviços</h1>
          <p className="mt-1 text-muted-foreground">Gere os serviços disponíveis para faturação</p>
        </div>
        <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Novo Serviço</Button>
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
              <Label>Categoria</Label>
              <Select value={form.serviceType} onValueChange={v => setForm(p => ({ ...p, serviceType: v as ServiceType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(serviceLabels) as [ServiceType, string][]).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Preço Base (€)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.defaultPrice} onChange={e => setForm(p => ({ ...p, defaultPrice: e.target.value }))} />
            </div>
            {editingId && (
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
              </div>
            )}
            <Button className="w-full" onClick={handleSave} disabled={addService.isPending || updateService.isPending || !form.name || !form.defaultPrice}>
              {(addService.isPending || updateService.isPending) ? "A guardar..." : editingId ? "Guardar" : "Criar Serviço"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar serviço"
        description="Tens a certeza que queres eliminar este serviço? Esta ação é irreversível."
        onConfirm={handleDelete}
        isPending={deleteService.isPending}
      />
    </div>
  );
}
