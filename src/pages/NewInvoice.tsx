import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowLeft, UserPlus, GripVertical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useClients, useAddClient, useAddInvoice, useNextInvoiceNumber, useActiveServices, useAddSubscription } from "@/hooks/use-data";
import {
  formatCurrency,
  type SubscriptionFrequency,
  frequencyLabels,
  frequencyDays,
  inferFrequencyFromRange,
} from "@/lib/data";
import { randomUUID } from "@/lib/uuid";
import { useToast } from "@/hooks/use-toast";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface FormItem {
  id: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  startDate: string;
  endDate: string;
  // Per-line frequency for the recurring case. "" means "use the global
  // fallback below". When the user enters a start+end range we auto-fill
  // this with the inferred frequency, but they can still override by
  // picking another value from the dropdown.
  frequency: SubscriptionFrequency | "";
}

function getDefaultItem(): FormItem {
  return {
    id: randomUUID(),
    serviceId: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    startDate: "",
    endDate: "",
    frequency: "",
  };
}

export default function NewInvoice() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useActiveServices();
  const addInvoice = useAddInvoice();
  const addClient = useAddClient();
  const addSubscription = useAddSubscription();
  const { data: nextNumber = "" } = useNextInvoiceNumber();
  const initialClientId = searchParams.get("clientId") ?? "";
  const [clientId, setClientId] = useState(initialClientId);
  const [items, setItems] = useState<FormItem[]>([getDefaultItem()]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Pre-fill client from URL once clients are loaded.
  useEffect(() => {
    if (initialClientId && !clientId && clients.some((c) => c.id === initialClientId)) {
      setClientId(initialClientId);
    }
  }, [initialClientId, clientId, clients]);
  const [notes, setNotes] = useState("");
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', company: '', phone: '', nif: '' });
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<SubscriptionFrequency>("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        }
      }
      // When the user fills both dates, auto-pick the inferred frequency
      // — but only if they haven't manually set one yet. Mirrors how the
      // submit path used to work, just with the result visible upfront.
      if (field === 'startDate' || field === 'endDate') {
        if (!item.frequency) {
          const inferred = inferFrequencyFromRange(updated.startDate, updated.endDate);
          if (inferred) updated.frequency = inferred;
        }
      }
      return updated;
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((it) => it.id === active.id);
      const newIndex = prev.findIndex((it) => it.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
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

  const handleSubmit = async () => {
    if (!clientId) {
      toast({ title: "Erro", description: "Seleciona um cliente", variant: "destructive" });
      return;
    }
    if (items.some(i => !i.description || i.unitPrice <= 0)) {
      toast({ title: "Erro", description: "Preenche todos os campos dos serviços", variant: "destructive" });
      return;
    }
    if (isSubmitting) return;

    const invoiceNumber = nextNumber || `FT ${new Date().getFullYear()}/${String(Date.now()).slice(-3).padStart(3, '0')}`;

    setIsSubmitting(true);
    try {
      await addInvoice.mutateAsync({
        invoice: {
          number: invoiceNumber,
          client_id: clientId,
          status: 'draft',
          issue_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          notes: notes || null,
        },
        items: items.map((i, idx) => {
          let desc = i.description;
          if (i.startDate && i.endDate) {
            desc += ` (${new Date(i.startDate).toLocaleDateString('pt-PT')} - ${new Date(i.endDate).toLocaleDateString('pt-PT')})`;
          }
          return {
            description: desc,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            position: idx,
          };
        }),
      });

      toast({ title: "Fatura criada!", description: `Fatura no valor de ${formatCurrency(total)} criada com sucesso.` });

      // Create one subscription per invoice line when "Fatura recorrente"
      // is toggled on. Keeping subscriptions one-per-service means the
      // user can pause / cancel / change pricing on each independently —
      // the common case for service businesses where a client has e.g.
      // hosting + domain + SEO as separate recurring products.
      if (isRecurring) {
        const today = new Date().toISOString().split('T')[0];
        const validLines = items.filter(i => i.description && i.unitPrice > 0);

        const results = await Promise.allSettled(
          validLines.map((line) => {
            // Resolution order: explicit per-line picker → date-range
            // inference → global fallback. The picker is auto-prefilled
            // by inference when the user supplies dates, so most of the
            // time these three converge on the same value; the picker
            // just lets the user override when it doesn't.
            const lineFrequency: SubscriptionFrequency =
              line.frequency ||
              inferFrequencyFromRange(line.startDate, line.endDate) ||
              recurringFrequency;

            // Anchor next_billing_date on the end of the first period
            // (either the user-supplied endDate when present, else
            // today + frequencyDays). Using frequencyDays is deliberately
            // approximate — it only matters for the first run, after
            // which generate_subscription_invoices() advances with the
            // exact Postgres interval ('1 month', '1 year', etc.).
            const lineStart = line.startDate || today;
            let nextBillingStr: string;
            if (line.endDate) {
              nextBillingStr = line.endDate;
            } else {
              const d = new Date(lineStart);
              d.setDate(d.getDate() + frequencyDays[lineFrequency]);
              nextBillingStr = d.toISOString().split('T')[0];
            }

            const svc = services.find(s => s.id === line.serviceId);
            const lineAmount = line.unitPrice * line.quantity;
            return addSubscription.mutateAsync({
              client_id: clientId,
              name: svc?.name || line.description,
              amount: lineAmount,
              frequency: lineFrequency,
              next_billing_date: nextBillingStr,
              start_date: lineStart,
            });
          }),
        );

        const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        const succeeded = results.length - failures.length;

        if (failures.length > 0) {
          const firstErr = failures[0].reason as Error;
          toast({
            title: succeeded > 0 ? "Subscrições parcialmente criadas" : "Erro ao criar subscrições",
            description: `${succeeded}/${results.length} criadas. Primeiro erro: ${firstErr?.message ?? "desconhecido"}. Fatura já foi guardada — cria as subscrições em falta a partir de /subscricoes.`,
            variant: "destructive",
          });
          // Still navigate: the invoice IS saved at this point, and
          // staying on the form would let the user re-submit and
          // create a duplicate invoice. From /faturas or /subscricoes
          // they can re-create just the missing subscriptions.
        } else {
          toast({
            title: succeeded === 1 ? "Subscrição criada!" : `${succeeded} subscrições criadas!`,
            description: "Cada serviço fica como subscrição independente.",
          });
        }
      }

      navigate("/faturas");
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Falha ao criar fatura",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <SortableInvoiceItem
                  key={item.id}
                  item={item}
                  index={index}
                  canRemove={items.length > 1}
                  services={services}
                  showFrequency={isRecurring}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                />
              ))}
            </SortableContext>
          </DndContext>
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
              <p className="text-xs text-muted-foreground">
                Cria uma subscrição por linha. Linhas com data início + fim usam a frequência
                correspondente ao intervalo; as restantes usam a frequência padrão abaixo.
              </p>
            </div>
          </div>
          <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
        </div>

        {isRecurring && (
          <div className="space-y-2">
            <Label>Frequência por defeito</Label>
            <p className="text-xs text-muted-foreground">
              Usada nas linhas que não tenham frequência própria escolhida.
            </p>
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
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "A criar..." : "Criar Fatura"}
            </Button>
          </div>
        </div>
      </div>

      {/* Quick-add client dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Novo Cliente Rápido</DialogTitle>
            <DialogDescription>Só o nome é obrigatório — os outros campos podem ser preenchidos mais tarde na página do cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {[
              { key: 'name', label: 'Nome *', placeholder: 'Nome completo' },
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
            <Button onClick={handleAddClient} className="w-full" disabled={addClient.isPending || !newClient.name.trim()}>
              {addClient.isPending ? "A criar..." : "Criar Cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SortableInvoiceItemProps {
  item: FormItem;
  index: number;
  canRemove: boolean;
  services: ReturnType<typeof useActiveServices>["data"] extends infer T ? (T extends Array<infer S> ? S[] : never) : never;
  showFrequency: boolean;
  onUpdate: (index: number, field: keyof FormItem, value: string | number) => void;
  onRemove: (index: number) => void;
}

function SortableInvoiceItem({ item, index, canRemove, services, showFrequency, onUpdate, onRemove }: SortableInvoiceItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border p-4 space-y-3 bg-card">
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Arrastar para reordenar"
          className="mt-7 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 space-y-3">
          {/* Row 1: Serviço + action button at the right */}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Serviço</Label>
              <Select value={item.serviceId} onValueChange={v => onUpdate(index, 'serviceId', v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar serviço" /></SelectTrigger>
                <SelectContent>
                  {services?.map(svc => (
                    <SelectItem key={svc.id} value={svc.id}>
                      {svc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canRemove && (
              <Button variant="ghost" size="icon" onClick={() => onRemove(index)} className="text-destructive hover:text-destructive shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* Row 2: Descrição full-width */}
          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input
              placeholder="Ex: Gestão Instagram - Março"
              value={item.description}
              onChange={e => onUpdate(index, 'description', e.target.value)}
            />
          </div>
          {/* Row 3: Qtd + Preço side by side, both with enough width */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Quantidade</Label>
              <Input type="number" min={1} value={item.quantity} onChange={e => onUpdate(index, 'quantity', Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Preço unitário (€)</Label>
              <Input type="number" min={0} step="0.01" value={item.unitPrice} onChange={e => onUpdate(index, 'unitPrice', Number(e.target.value))} />
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Data início (opcional)</Label>
          <Input type="date" value={item.startDate} onChange={e => onUpdate(index, 'startDate', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data fim (opcional)</Label>
          <Input type="date" value={item.endDate} onChange={e => onUpdate(index, 'endDate', e.target.value)} />
        </div>
        {showFrequency && (
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Frequência da subscrição</Label>
            <Select
              value={item.frequency || ""}
              onValueChange={(v) => onUpdate(index, 'frequency', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Usar frequência por defeito" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(frequencyLabels) as [SubscriptionFrequency, string][]).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Define de quanto em quanto tempo este item volta a faturar. Se preencheres datas, é pré-selecionada automaticamente; se ficar vazio, usa a frequência por defeito.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
