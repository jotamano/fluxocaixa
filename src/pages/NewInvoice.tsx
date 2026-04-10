import { useState } from "react";
import { Plus, Trash2, ArrowLeft, UserPlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useClients, useAddClient, useAddInvoice, useNextInvoiceNumber, useActiveServices, useCategories, useAddSubscription } from "@/hooks/use-data";
import { formatCurrency, type SubscriptionFrequency, frequencyLabels } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface FormItem {
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  startDate: string;
  endDate: string;
  categoryId: string;
}

function getDefaultItem(): FormItem {
  return {
    serviceId: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    startDate: "",
    endDate: "",
    categoryId: "",
  };
}

export default function NewInvoice() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useActiveServices();
  const { data: categories = [] } = useCategories();
  const addInvoice = useAddInvoice();
  const addClient = useAddClient();
  const addSubscription = useAddSubscription();
  const { data: nextNumber = "" } = useNextInvoiceNumber();
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<FormItem[]>([getDefaultItem()]);
  const [notes, setNotes] = useState("");
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', company: '', phone: '', nif: '' });
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<SubscriptionFrequency>("monthly");

  const addItem = () => setItems(prev => [...prev, getDefaultItem()]);

  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof FormItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'serviceId') {
        const svc = services.find(s => s.id === value);
        if (svc) {
          const now = new Date();
          updated.unitPrice = Number(svc.default_price);
          updated.description = `${svc.name} — ${MONTHS_PT[now.getMonth()]} ${now.getFullYear()}`;
          updated.categoryId = svc.category_id || "";
        }
      }
      return updated;
    }));
  };

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleAddClient = () => {
    addClient.mutate(newClient, {
      onSuccess: (data) => {
        setClientId(data.id);
        setNewClient({ name: '', email: '', company: '', phone: '', nif: '' });
        setClientDialogOpen(false);
        toast({ title: "Cliente criado!" });
      },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleSubmit = () => {
    if (!clientId) {
      toast({ title: "Erro", description: "Seleciona um cliente", variant: "destructive" });
      return;
    }
    if (items.some(i => !i.description || i.unitPrice <= 0)) {
      toast({ title: "Erro", description: "Preenche todos os campos dos serviços", variant: "destructive" });
      return;
    }

    const invoiceNumber = nextNumber || `FT ${new Date().getFullYear()}/${String(Date.now()).slice(-3).padStart(3, '0')}`;

    addInvoice.mutate({
      invoice: {
        number: invoiceNumber,
        client_id: clientId,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        notes: notes || null,
      },
      items: items.map(i => {
        let desc = i.description;
        if (i.startDate && i.endDate) {
          desc += ` (${new Date(i.startDate).toLocaleDateString('pt-PT')} - ${new Date(i.endDate).toLocaleDateString('pt-PT')})`;
        }
        return {
          description: desc,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          category_id: i.categoryId || null,
        };
      }),
    }, {
      onSuccess: () => {
        toast({ title: "Fatura criada!", description: `Fatura no valor de ${formatCurrency(total)} criada com sucesso.` });

        // Create subscription if recurring
        if (isRecurring && clientId) {
          const mainItem = items[0];
          const svc = services.find(s => s.id === mainItem.serviceId);
          const nextBilling = new Date();
          if (recurringFrequency === 'monthly') nextBilling.setMonth(nextBilling.getMonth() + 1);
          else if (recurringFrequency === 'quarterly') nextBilling.setMonth(nextBilling.getMonth() + 3);
          else if (recurringFrequency === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);

          addSubscription.mutate({
            client_id: clientId,
            name: svc?.name || mainItem.description,
            amount: total,
            frequency: recurringFrequency,
            next_billing_date: nextBilling.toISOString().split('T')[0],
            start_date: new Date().toISOString().split('T')[0],
            category_id: mainItem.categoryId || null,
          }, {
            onSuccess: () => toast({ title: "Subscrição criada!", description: "Fatura recorrente configurada." }),
          });
        }

        navigate("/faturas");
      },
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Nova Fatura</h1>
          <p className="mt-1 text-muted-foreground">Cria uma nova fatura para os teus serviços</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-6">
        {/* Invoice number */}
        <div className="space-y-2">
          <Label>Nº de Fatura</Label>
          <Input value={nextNumber} readOnly className="bg-muted/40" />
        </div>

        {/* Client selector with quick-add */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Cliente</Label>
            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => setClientDialogOpen(true)}>
              <UserPlus className="h-3 w-3" /> Novo Cliente
            </Button>
          </div>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.company} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Service items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-display">Serviços</Label>
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="h-3 w-3" /> Adicionar Serviço
            </Button>
          </div>

          {items.map((item, index) => (
            <div key={index} className="rounded-lg border border-border p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-xs">Serviço</Label>
                  <Select value={item.serviceId} onValueChange={v => updateItem(index, 'serviceId', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                    <SelectContent>
                      {services.map(svc => (
                        <SelectItem key={svc.id} value={svc.id}>
                          {svc.name} {svc.service_categories ? `(${svc.service_categories.name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    placeholder="Ex: Gestão Instagram - Março"
                    value={item.description}
                    onChange={e => updateItem(index, 'description', e.target.value)}
                  />
                </div>
                <div className="sm:col-span-1 space-y-1">
                  <Label className="text-xs">Qtd</Label>
                  <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', Number(e.target.value))} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Preço (€)</Label>
                  <Input type="number" min={0} value={item.unitPrice} onChange={e => updateItem(index, 'unitPrice', Number(e.target.value))} />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {/* Date range */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data início (opcional)</Label>
                  <Input type="date" value={item.startDate} onChange={e => updateItem(index, 'startDate', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data fim (opcional)</Label>
                  <Input type="date" value={item.endDate} onChange={e => updateItem(index, 'endDate', e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Notas (opcional)</Label>
          <Textarea placeholder="Observações ou condições de pagamento..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Recurring toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-muted/40">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium text-card-foreground">Fatura recorrente</p>
              <p className="text-xs text-muted-foreground">Cria automaticamente uma subscrição</p>
            </div>
          </div>
          <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
        </div>

        {isRecurring && (
          <div className="space-y-2">
            <Label>Frequência da recorrência</Label>
            <Select value={recurringFrequency} onValueChange={v => setRecurringFrequency(v as SubscriptionFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(frequencyLabels) as [SubscriptionFrequency, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-6">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-bold font-display text-card-foreground">{formatCurrency(total)}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={addInvoice.isPending}>
              {addInvoice.isPending ? "A criar..." : "Criar Fatura"}
            </Button>
          </div>
        </div>
      </div>

      {/* Quick-add client dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Novo Cliente Rápido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {[
              { key: 'name', label: 'Nome', placeholder: 'Nome completo' },
              { key: 'email', label: 'Email', placeholder: 'email@exemplo.pt' },
              { key: 'company', label: 'Empresa', placeholder: 'Nome da empresa' },
              { key: 'phone', label: 'Telefone', placeholder: '+351 ...' },
              { key: 'nif', label: 'NIF', placeholder: '509...' },
            ].map(field => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Input
                  placeholder={field.placeholder}
                  value={newClient[field.key as keyof typeof newClient]}
                  onChange={e => setNewClient(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <Button onClick={handleAddClient} className="w-full" disabled={addClient.isPending || !newClient.name || !newClient.email || !newClient.company}>
              {addClient.isPending ? "A criar..." : "Criar Cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
