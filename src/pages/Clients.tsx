import { useState } from "react";
import { Plus, Mail, Phone, Building, Search, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClients, useAddClient, useInvoices, useSubscriptions } from "@/hooks/use-data";
import { DEFAULT_HAS_IVA, DEFAULT_IVA_PERCENTAGE, formatCurrency, getInvoiceTotalWithIva } from "@/lib/data";
import { EditClientDialog } from "@/components/EditClientDialog";
import type { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

export default function Clients() {
  const { data: clients = [] } = useClients();
  const { data: invoices = [] } = useInvoices();
  const { data: subscriptions = [] } = useSubscriptions();
  const navigate = useNavigate();
  const addClient = useAddClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Tables<"clients"> | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', company: '', phone: '', nif: '',
    has_iva: DEFAULT_HAS_IVA, iva_percentage: DEFAULT_IVA_PERCENTAGE,
  });

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = () => {
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
        onSuccess: () => {
          setForm({
            name: '', email: '', company: '', phone: '', nif: '',
            has_iva: DEFAULT_HAS_IVA, iva_percentage: DEFAULT_IVA_PERCENTAGE,
          });
          setDialogOpen(false);
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Clientes</h1>
          <p className="mt-1 text-muted-foreground">{clients.length} clientes registados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">Adicionar Cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {([
                { key: 'name', label: 'Nome', placeholder: 'Nome completo' },
                { key: 'email', label: 'Email', placeholder: 'email@exemplo.pt' },
                { key: 'company', label: 'Empresa', placeholder: 'Nome da empresa' },
                { key: 'phone', label: 'Telefone', placeholder: '+351 ...' },
                { key: 'nif', label: 'NIF', placeholder: '509...' },
              ] as const).map(field => (
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
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Pesquisar clientes..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(client => {
          const clientInvoices = invoices.filter(i => i.client_id === client.id);
          const totalBilled = clientInvoices.reduce((sum, i) => sum + getInvoiceTotalWithIva(i.invoice_items, i), 0);
          const activeSubs = subscriptions.filter(s => s.client_id === client.id && s.active).length;

          return (
            <div
              key={client.id}
              className="group relative rounded-xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated"
            >
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setEditingClient(client);
                }}
                title="Editar cliente"
                aria-label={`Editar ${client.name}`}
                className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/clientes/${client.id}`)}
                className="block w-full text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 font-display font-bold text-primary">
                    {client.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2 pr-8">
                      <h3 className="font-display font-semibold text-card-foreground">{client.name}</h3>
                      <Badge
                        variant={client.has_iva ? "secondary" : "outline"}
                        className="shrink-0 text-[10px] font-medium"
                      >
                        {client.has_iva ? `IVA ${Number(client.iva_percentage)}%` : "Sem IVA"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building className="h-3 w-3" /> {client.company}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> {client.email}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {client.phone}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <div className="text-center">
                    <p className="text-lg font-bold font-display text-card-foreground">{formatCurrency(totalBilled)}</p>
                    <p className="text-xs text-muted-foreground">Total faturado</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold font-display text-card-foreground">{clientInvoices.length}</p>
                    <p className="text-xs text-muted-foreground">Faturas</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold font-display text-card-foreground">{activeSubs}</p>
                    <p className="text-xs text-muted-foreground">Subscrições</p>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <EditClientDialog
        client={editingClient}
        open={!!editingClient}
        onOpenChange={open => { if (!open) setEditingClient(null); }}
      />
    </div>
  );
}
