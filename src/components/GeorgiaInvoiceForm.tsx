import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// A tabela georgia_invoices ainda não está incluída nos tipos gerados do projecto.
const georgiaSupabase = supabase as any;

interface GeorgiaInvoice {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  client_nif?: string;
  client_address?: string;
  service_description: string;
  amount: number;
  currency: string;
  exchange_rate?: number;
  status: string;
}

interface Props {
  invoice: GeorgiaInvoice | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function GeorgiaInvoiceForm({ invoice, onSave, onCancel }: Props) {
  const [formData, setFormData] = useState<GeorgiaInvoice>({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    client_name: '',
    client_nif: '',
    client_address: '',
    service_description: '',
    amount: 0,
    currency: 'EUR',
    exchange_rate: 2.75,
    status: 'draft',
  });

  useEffect(() => {
    if (invoice) {
      setFormData({
        ...invoice,
        // Existing Georgia invoices are stored in cents; imported source
        // invoices are passed as a new draft and already use euros.
        amount: invoice.id ? invoice.amount / 100 : invoice.amount,
      });
    }
  }, [invoice]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const user = (await georgiaSupabase.auth.getUser()).data.user;
    if (!user) {
      alert('Erro: utilizador nÃ£o autenticado');
      return;
    }

    const payload = {
      user_id: user.id,
      invoice_number: formData.invoice_number,
      invoice_date: formData.invoice_date,
      client_name: formData.client_name,
      client_nif: formData.client_nif || null,
      client_address: formData.client_address || null,
      service_description: formData.service_description,
      amount: Math.round(formData.amount * 100), // Store in cents
      currency: formData.currency,
      exchange_rate: formData.exchange_rate || 1,
      status: formData.status,
      updated_at: new Date().toISOString(),
    };

    try {
      if (invoice?.id) {
        await georgiaSupabase
          .from('georgia_invoices')
          .update(payload)
          .eq('id', invoice.id);
      } else {
        await georgiaSupabase
          .from('georgia_invoices')
          .insert([{ ...payload, created_at: new Date().toISOString() }]);
      }
      onSave();
    } catch (err) {
      console.error('Error saving invoice:', err);
      alert('Erro ao guardar fatura');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">
        {invoice?.id ? 'Editar Fatura' : 'Nova Fatura GeÃ³rgia'}
      </h2>
      {invoice && !invoice.id && (
        <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Fatura importada como rascunho. Pode editar qualquer campo e os valores antes de guardar.
        </p>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NÂº Fatura</label>
            <input
              type="text"
              name="invoice_number"
              value={formData.invoice_number}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="GE2026001"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
            <input
              type="date"
              name="invoice_date"
              value={formData.invoice_date}
              onChange={handleChange}
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label>
          <input
            type="text"
            name="client_name"
            value={formData.client_name}
            onChange={handleChange}
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            placeholder="Empresa Lda"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">NIF Cliente</label>
            <input
              type="text"
              name="client_nif"
              value={formData.client_nif}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="PT123456789"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Morada Cliente</label>
            <input
              type="text"
              name="client_address"
              value={formData.client_address}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Rua Exemplo, Lisboa"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">DescriÃ§Ã£o do ServiÃ§o</label>
          <textarea
            name="service_description"
            value={formData.service_description}
            onChange={handleChange}
            required
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            placeholder="ServiÃ§os de desenvolvimento web..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              required
              step="0.01"
              min="0"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="1000.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Moeda</label>
            <select
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="EUR">EUR (â§¬)</option>
              <option value="USD">USD ($)</option>
              <option value="GEL">GEL (â§¾)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Taxa CÃ¢mbio (para GEL)</label>
            <input
              type="number"
              name="exchange_rate"
              value={formData.exchange_rate}
              onChange={handleChange}
              step="0.01"
              min="0"
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          >
            <option value="draft">Rascunho</option>
            <option value="issued">Emitida</option>
            <option value="sent">Enviada</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-medium"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
