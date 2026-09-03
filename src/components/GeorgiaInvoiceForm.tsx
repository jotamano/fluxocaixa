import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GeorgiaCompanyProfile } from '@/lib/georgia';
import { isGeorgiaCompanyProfileComplete } from '@/lib/georgia';

// A tabela georgia_invoices ainda não está incluída nos tipos gerados do projecto.
const georgiaSupabase = supabase as any;

interface GeorgiaInvoice {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  client_nif?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  client_country?: string;
  service_description: string;
  amount: number;
  currency: string;
  exchange_rate?: number;
  status: string;
  issuer_logo_url?: string | null;
}

interface Props {
  invoice: GeorgiaInvoice | null;
  issuerProfile: GeorgiaCompanyProfile;
  onSave: () => void;
  onCancel: () => void;
}

export default function GeorgiaInvoiceForm({ invoice, issuerProfile, onSave, onCancel }: Props) {
  const [formData, setFormData] = useState<GeorgiaInvoice>({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    client_name: '',
    client_nif: '',
    client_address: '',
    client_email: '',
    client_phone: '',
    client_company: '',
    client_country: 'Portugal',
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
    
    if (!isGeorgiaCompanyProfileComplete(issuerProfile)) {
      alert('Configura primeiro o nome legal, a morada e o NIF da empresa em Configurações.');
      return;
    }

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
      client_email: formData.client_email || null,
      client_phone: formData.client_phone || null,
      client_company: formData.client_company || null,
      client_country: formData.client_country || null,
      service_description: formData.service_description,
      amount: Math.round(formData.amount * 100), // Store in cents
      currency: formData.currency,
      exchange_rate: formData.exchange_rate || 1,
      status: formData.status,
      updated_at: new Date().toISOString(),
    };
    const issuerSnapshot = {
      issuer_name: issuerProfile.name.trim(),
      issuer_address: issuerProfile.address.trim(),
      issuer_tax_id: issuerProfile.tax_id.trim(),
      issuer_country: issuerProfile.country.trim() || 'Portugal',
      issuer_email: issuerProfile.email.trim() || null,
      issuer_phone: issuerProfile.phone.trim() || null,
      issuer_registration_number: issuerProfile.registration_number.trim() || null,
      issuer_bank_details: issuerProfile.bank_details.trim() || null,
      issuer_logo_url: issuerProfile.logo_url.trim() || null,
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
          .insert([{ ...payload, ...issuerSnapshot, created_at: new Date().toISOString() }]);
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
      {!isGeorgiaCompanyProfileComplete(issuerProfile) && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Para guardar uma Fatura Geórgia válida, configura o nome legal, a morada e o NIF da empresa em <a className="font-semibold underline" href="/settings">Configurações</a>.
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
              required
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
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="Rua Exemplo, Lisboa"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa do Cliente</label>
            <input type="text" name="client_company" value={formData.client_company} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Empresa Lda" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">País do Cliente</label>
            <input type="text" name="client_country" value={formData.client_country} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="Portugal" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email do Cliente</label>
            <input type="email" name="client_email" value={formData.client_email} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="email@cliente.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone do Cliente</label>
            <input type="text" name="client_phone" value={formData.client_phone} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2" placeholder="+351 ..." />
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
