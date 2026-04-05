import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClients, useAddInvoice } from "@/hooks/use-data";
import { serviceLabels, formatCurrency, type ServiceType } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type ServiceTypeEnum = Database["public"]["Enums"]["service_type"];

interface FormItem {
  description: string;
  serviceType: ServiceTypeEnum;
  quantity: number;
  unitPrice: number;
}

export default function NewInvoice() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients = [] } = useClients();
  const addInvoice = useAddInvoice();
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<FormItem[]>([
    { description: "", serviceType: "social_media", quantity: 1, unitPrice: 0 },
  ]);
  const [notes, setNotes] = useState("");

  const addItem = () => {
    setItems(prev => [...prev, { description: "", serviceType: "social_media", quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof FormItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const handleSubmit = () => {
    if (!clientId) {
      toast({ title: "Erro", description: "Seleciona um cliente", variant: "destructive" });
      return;
    }
    if (items.some(i => !i.description || i.unitPrice <= 0)) {
      toast({ title: "Erro", description: "Preenche todos os campos dos itens", variant: "destructive" });
      return;
    }

    const invoiceNumber = `FT ${new Date().getFullYear()}/${String(Date.now()).slice(-3).padStart(3, '0')}`;
    
    addInvoice.mutate({
      invoice: {
        number: invoiceNumber,
        client_id: clientId,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        notes: notes || null,
      },
      items: items.map(i => ({
        description: i.description,
        service_type: i.serviceType,
        quantity: i.quantity,
        unit_price: i.unitPrice,
      })),
    }, {
      onSuccess: () => {
        toast({ title: "Fatura criada!", description: `Fatura no valor de ${formatCurrency(total)} criada com sucesso.` });
        navigate("/faturas");
      },
      onError: (err) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Nova Fatura</h1>
          <p className="mt-1 text-muted-foreground">Cria uma nova fatura para os teus serviços</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card space-y-6">
        <div className="space-y-2">
          <Label>Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
            <SelectContent>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.company} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-display">Itens</Label>
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="h-3 w-3" /> Adicionar Item
            </Button>
          </div>

          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-12">
              <div className="sm:col-span-4 space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Input
                  placeholder="Ex: Gestão Instagram - Março"
                  value={item.description}
                  onChange={e => updateItem(index, 'description', e.target.value)}
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label className="text-xs">Serviço</Label>
                <Select value={item.serviceType} onValueChange={v => updateItem(index, 'serviceType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(serviceLabels) as [ServiceType, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Qtd.</Label>
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
          ))}
        </div>

        <div className="space-y-2">
          <Label>Notas (opcional)</Label>
          <Textarea placeholder="Observações ou condições de pagamento..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-3xl font-bold font-display text-card-foreground">{formatCurrency(total)}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={addInvoice.isPending}>
              {addInvoice.isPending ? "A criar..." : "Criar Fatura"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
