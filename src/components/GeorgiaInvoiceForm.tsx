import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GeorgiaCompanyProfile } from '@/lib/georgia';
import { isGeorgiaCompanyProfileComplete } from '@/lib/georgia';
import { fetchNbgEurRate } from '@/lib/nbg-currency';

const georgiaSupabase = supabase as any;

export interface GeorgiaServiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  service_period: string;
}

export interface GeorgiaInvoice {
  id?: string;
  source_invoice_id?: string | null;
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
  service_items?: GeorgiaServiceItem[] | null;
  amount: number;
  currency: string;
  exchange_rate?: number;
  amount_gel?: number;
  status: string;
  issuer_logo_url?: string | null;
  due_date?: string | null;
  service_period?: string | null;
  tax_treatment_label?: string | null;
  tax_treatment_note?: string | null;
  payment_terms?: string | null;
  footer_note?: string | null;
}

interface Props {
  invoice: GeorgiaInvoice | null;
  issuerProfile: GeorgiaCompanyProfile;
  initialInvoiceNumber: string;
  onSave: () => void;
  onCancel: () => void;
}

const makeBlankItem = (): GeorgiaServiceItem => ({ description: '', quantity: 1, unit_price: 0, service_period: '' });

function normalizeItems(invoice: GeorgiaInvoice | null): GeorgiaServiceItem[] {
  if (invoice?.service_items?.length) {
    return invoice.service_items.map(item => ({
      description: item.description ?? '',
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      service_period: item.service_period ?? '',
    }));
  }
  if (invoice?.service_description) {
    return [{ description: invoice.service_description, quantity: 1, unit_price: Number(invoice.amount) || 0, service_period: invoice.service_period ?? '' }];
  }
  return [makeBlankItem()];
}

export default function GeorgiaInvoiceForm({ invoice, issuerProfile, initialInvoiceNumber, onSave, onCancel }: Props) {
  const defaultTaxLabel = issuerProfile.invoice_tax_label ?? 'Tratamento de IVA a confirmar';
  const defaultTaxNote = issuerProfile.invoice_tax_note ?? 'O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.';
  const defaultPaymentTerms = issuerProfile.invoice_payment_terms ?? 'Pagamento até 30 dias após a data de emissão.';
  const defaultFooterNote = issuerProfile.invoice_footer_note ?? 'Documento comercial. Confirma o enquadramento fiscal aplicável antes da emissão final.';
  const [formData, setFormData] = useState<GeorgiaInvoice>({
    invoice_number: initialInvoiceNumber, invoice_date: new Date().toISOString().split('T')[0], client_name: '', client_nif: '', client_address: '',
    client_email: '', client_phone: '', client_company: '', client_country: 'Portugal', service_description: '', service_items: [makeBlankItem()],
    amount: 0, currency: 'EUR', exchange_rate: 0, due_date: '', service_period: '', tax_treatment_label: defaultTaxLabel,
    tax_treatment_note: defaultTaxNote, payment_terms: defaultPaymentTerms, footer_note: defaultFooterNote, status: 'draft',
  });
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const [rateDate, setRateDate] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    setFormData({ ...invoice, service_items: normalizeItems(invoice), due_date: invoice.due_date ?? '', service_period: invoice.service_period ?? '',
      tax_treatment_label: invoice.tax_treatment_label ?? defaultTaxLabel, tax_treatment_note: invoice.tax_treatment_note ?? defaultTaxNote,
      payment_terms: invoice.payment_terms ?? defaultPaymentTerms, footer_note: invoice.footer_note ?? defaultFooterNote,
      amount: invoice.id ? invoice.amount / 100 : invoice.amount, exchange_rate: invoice.exchange_rate ?? 0 });
  }, [invoice, defaultFooterNote, defaultPaymentTerms, defaultTaxLabel, defaultTaxNote]);

  useEffect(() => {
    if (invoice?.id || formData.currency !== 'EUR') return;
    const controller = new AbortController();
    setRateLoading(true); setRateError('');
    fetchNbgEurRate(controller.signal).then(({ rate, effectiveDate }) => {
      setFormData(prev => prev.currency === 'EUR' ? { ...prev, exchange_rate: rate } : prev);
      setRateDate(effectiveDate);
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Erro ao obter a taxa EUR/GEL do NBG:', error);
      setRateError('Não foi possível obter a taxa oficial. Podes introduzir a taxa manualmente.');
    }).finally(() => setRateLoading(false));
    return () => controller.abort();
  }, [invoice?.id, invoice?.invoice_number, formData.currency]);

  const items = formData.service_items ?? [makeBlankItem()];
  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
  const exchangeRate = Number(formData.exchange_rate) || 0;
  const gelAmount = formData.currency === 'GEL' ? subtotal : subtotal * exchangeRate;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'currency') {
      setRateError(''); setRateDate(null);
      setFormData(prev => ({ ...prev, currency: value, exchange_rate: value === 'GEL' ? 1 : value === 'USD' ? 2.70 : 0 }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: name === 'amount' || name === 'exchange_rate' ? parseFloat(value) || 0 : value }));
  };

  const updateItem = (index: number, patch: Partial<GeorgiaServiceItem>) => {
    setFormData(prev => ({ ...prev, service_items: (prev.service_items ?? []).map((item, i) => i === index ? { ...item, ...patch } : item) }));
  };
  const addItem = () => setFormData(prev => ({ ...prev, service_items: [...(prev.service_items ?? []), makeBlankItem()] }));
  const removeItem = (index: number) => setFormData(prev => ({ ...prev, service_items: (prev.service_items ?? []).filter((_, i) => i !== index) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGeorgiaCompanyProfileComplete(issuerProfile)) { alert('Configura primeiro o nome legal, a morada e o NIF da empresa em Configurações.'); return; }
    if (!formData.invoice_number.trim() || !formData.invoice_date || !formData.due_date) { alert('Preenche o número, a data de emissão e a data de vencimento.'); return; }
    if (!formData.client_name.trim() || !formData.client_nif?.trim() || !formData.client_address?.trim() || !formData.client_country?.trim()) { alert('Preenche o nome, NIF, morada e país do cliente.'); return; }
    if (formData.currency === 'EUR' && exchangeRate <= 0) { alert('Indica uma taxa EUR → GEL válida antes de guardar a fatura.'); return; }
    const user = (await georgiaSupabase.auth.getUser()).data.user;
    if (!user) { alert('Erro: utilizador não autenticado'); return; }
    const cleanItems = items.filter(item => item.description.trim()).map(item => ({ ...item, quantity: Number(item.quantity) || 1, unit_price: Number(item.unit_price) || 0 }));
    if (cleanItems.length === 0) { alert('Adiciona pelo menos um item de serviço.'); return; }
    if (cleanItems.some(item => item.quantity <= 0 || item.unit_price < 0)) { alert('Cada item deve ter uma quantidade válida e um preço unitário não negativo.'); return; }
    const description = cleanItems.map(item => `${item.quantity} × ${item.description}`).join('\n');
    const payload = {
      user_id: user.id, source_invoice_id: formData.source_invoice_id || null, invoice_number: formData.invoice_number, invoice_date: formData.invoice_date, client_name: formData.client_name,
      client_nif: formData.client_nif || null, client_address: formData.client_address || null, client_email: formData.client_email || null,
      client_phone: formData.client_phone || null, client_company: formData.client_company || null, client_country: formData.client_country || null,
      service_description: description, service_items: cleanItems, amount: Math.round(subtotal * 100), currency: formData.currency,
      exchange_rate: exchangeRate || 1, amount_gel: Math.round(gelAmount * 100), due_date: formData.due_date || null, service_period: null,
      tax_treatment_label: formData.tax_treatment_label?.trim() || null, tax_treatment_note: formData.tax_treatment_note?.trim() || null,
      payment_terms: formData.payment_terms?.trim() || null, footer_note: formData.footer_note?.trim() || null, status: formData.status,
      updated_at: new Date().toISOString(),
    };
    const issuerSnapshot = { issuer_name: issuerProfile.name.trim(), issuer_address: issuerProfile.address.trim(), issuer_tax_id: issuerProfile.tax_id.trim(), issuer_country: issuerProfile.country.trim() || 'Portugal', issuer_email: issuerProfile.email.trim() || null, issuer_phone: issuerProfile.phone.trim() || null, issuer_registration_number: issuerProfile.registration_number.trim() || null, issuer_bank_details: issuerProfile.bank_details.trim() || null, issuer_logo_url: issuerProfile.logo_url.trim() || null };
    try {
      if (invoice?.id) {
        const { error } = await georgiaSupabase.from('georgia_invoices').update(payload).eq('id', invoice.id);
        if (error) throw error;
      } else {
        const { error } = await georgiaSupabase.from('georgia_invoices').insert([{ ...payload, ...issuerSnapshot, created_at: new Date().toISOString() }]);
        if (error) throw error;
      }
      onSave();
    } catch (err) {
      console.error('Error saving invoice:', err);
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505' && formData.source_invoice_id) {
        alert('Esta fatura original já foi importada para uma Fatura Geórgia. Escolhe outra fatura.');
      } else {
        alert('Erro ao guardar fatura');
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">{invoice?.id ? 'Editar Fatura' : 'Nova Fatura Geórgia'}</h2>
      {invoice && !invoice.id && invoice.source_invoice_id && <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">Fatura importada como rascunho. Pode editar qualquer campo e os valores antes de guardar.</p>}
      {!isGeorgiaCompanyProfileComplete(issuerProfile) && <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Para guardar uma Fatura Geórgia válida, configura o nome legal, a morada e o NIF da empresa em <a className="font-semibold underline" href="/settings">Configurações</a>.</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['invoice_number', 'invoice_date', 'due_date'] as const).map(name => <div key={name}><label className="block text-sm font-medium text-gray-700 mb-1">{name === 'invoice_number' ? 'Nº Fatura' : name === 'invoice_date' ? 'Data' : 'Data de vencimento'}</label><input type={name === 'invoice_number' ? 'text' : 'date'} name={name} value={(formData[name] as string) ?? ''} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2" /></div>)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Nome do Cliente</label><input name="client_name" value={formData.client_name} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">NIF Cliente</label><input name="client_nif" value={formData.client_nif} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2" /></div></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Morada Cliente</label><input name="client_address" value={formData.client_address} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Empresa do Cliente</label><input name="client_company" value={formData.client_company} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2" /></div></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">País do Cliente</label><input name="client_country" value={formData.client_country} onChange={handleChange} required className="w-full border border-gray-300 rounded-md px-3 py-2" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Email do Cliente</label><input type="email" name="client_email" value={formData.client_email} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2" /></div></div>
        <div><div className="flex items-center justify-between mb-2"><h3 className="text-sm font-semibold text-gray-800">Itens do serviço</h3><button type="button" onClick={addItem} className="text-sm text-blue-600 hover:text-blue-800">+ Adicionar item</button></div><div className="space-y-3">{items.map((item, index) => <div key={index} className="rounded-md border border-gray-200 p-3"><div className="grid grid-cols-1 md:grid-cols-12 gap-3"><div className="md:col-span-5"><label className="block text-xs font-medium text-gray-600 mb-1">Descrição do Serviço</label><textarea value={item.description} onChange={e => updateItem(index, { description: e.target.value })} required rows={2} className="w-full border border-gray-300 rounded-md px-3 py-2" /></div><div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Quantidade</label><input type="number" min="1" step="1" value={item.quantity} onChange={e => updateItem(index, { quantity: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-md px-3 py-2" /></div><div className="md:col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Preço unitário</label><input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(index, { unit_price: parseFloat(e.target.value) || 0 })} className="w-full border border-gray-300 rounded-md px-3 py-2" /></div><div className="md:col-span-3"><label className="block text-xs font-medium text-gray-600 mb-1">Período do serviço</label><input value={item.service_period} onChange={e => updateItem(index, { service_period: e.target.value })} placeholder="Ex.: 01/09/2026 – 30/09/2026" className="w-full border border-gray-300 rounded-md px-3 py-2" /></div></div>{items.length > 1 && <button type="button" onClick={() => removeItem(index)} className="mt-2 text-xs text-red-600 hover:text-red-800">Remover item</button>}</div>)}</div></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Moeda</label><select name="currency" value={formData.currency} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2"><option value="EUR">EUR (€)</option><option value="USD">USD ($)</option><option value="GEL">GEL (₾)</option></select></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Taxa EUR → GEL</label><input type="number" name="exchange_rate" value={formData.exchange_rate || ''} onChange={handleChange} step="0.0001" min="0" className="w-full border border-gray-300 rounded-md px-3 py-2" /><p className="mt-1 text-xs text-gray-500">{rateLoading ? 'A obter a taxa oficial do NBG…' : rateDate ? `Taxa oficial NBG, válida em ${rateDate}.` : 'Editável manualmente.'}</p>{rateError && <p className="mt-1 text-xs text-amber-700">{rateError}</p>}</div><div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Subtotal: <strong>{subtotal.toFixed(2)} {formData.currency}</strong><br />Convertido em GEL: <strong>{gelAmount.toFixed(2)} GEL</strong></div></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Estado</label><select name="status" value={formData.status} onChange={handleChange} className="w-full border border-gray-300 rounded-md px-3 py-2"><option value="draft">Rascunho</option><option value="issued">Emitida</option><option value="sent">Enviada</option></select></div>
        <div className="flex gap-3 pt-4"><button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium">Guardar</button><button type="button" onClick={onCancel} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-medium">Cancelar</button></div>
      </form>
    </div>
  );
}
