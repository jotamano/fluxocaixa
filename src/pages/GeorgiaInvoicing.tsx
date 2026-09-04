import { useState, useEffect } from 'react';
import { useAppSettings, useInvoices } from '@/hooks/use-data';
import { getNextGeorgiaInvoiceNumber, type GeorgiaCompanyProfile } from '@/lib/georgia';
import { formatInvoiceItemPeriod, getClientLabel, getInvoiceTotalWithIva } from '@/lib/data';
import type { GeorgiaInvoice, GeorgiaServiceItem } from '../components/GeorgiaInvoiceForm';
import { supabase } from '@/integrations/supabase/client';
import GeorgiaInvoiceList from '../components/GeorgiaInvoiceList';
import GeorgiaInvoiceForm from '../components/GeorgiaInvoiceForm';
import GeorgiaInvoicePreview from '../components/GeorgiaInvoicePreview';

// A tabela georgia_invoices ainda não está incluída nos tipos gerados do projecto.
const georgiaSupabase = supabase as any;

interface DashboardStats {
  totalInvoices: number;
  totalAmount: number;
  monthAmount: number;
}

function addDaysToDate(date: string, days: number): string {
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(value.getTime())) return '';
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function GeorgiaInvoicing() {
  const [invoices, setInvoices] = useState<GeorgiaInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<GeorgiaInvoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<GeorgiaInvoice | null>(null);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');
  const [stats, setStats] = useState<DashboardStats>({ totalInvoices: 0, totalAmount: 0, monthAmount: 0 });
  const [importInvoiceId, setImportInvoiceId] = useState('');
  const { data: sourceInvoices = [], isLoading: sourceInvoicesLoading } = useInvoices();
  const { data: settings } = useAppSettings();
  const importedSourceIds = new Set(invoices.map(invoice => invoice.source_invoice_id).filter((id): id is string => Boolean(id)));
  const availableSourceInvoices = sourceInvoices.filter(source => !importedSourceIds.has(source.id));
  const companyProfile: GeorgiaCompanyProfile = {
    name: settings?.georgia_company_name ?? '',
    address: settings?.georgia_company_address ?? '',
    tax_id: settings?.georgia_company_tax_id ?? '',
    country: settings?.georgia_company_country ?? 'Portugal',
    email: settings?.georgia_company_email ?? '',
    phone: settings?.georgia_company_phone ?? '',
    registration_number: settings?.georgia_company_registration_number ?? '',
    bank_details: settings?.georgia_company_bank_details ?? '',
    logo_url: settings?.georgia_company_logo_url ?? '',
    invoice_tax_label: settings?.georgia_invoice_tax_label ?? 'Tratamento de IVA a confirmar',
    invoice_tax_note: settings?.georgia_invoice_tax_note ?? 'O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.',
    invoice_payment_terms: settings?.georgia_invoice_payment_terms ?? 'Pagamento até 30 dias após a data de emissão.',
    invoice_footer_note: settings?.georgia_invoice_footer_note ?? 'Documento comercial. Confirma o enquadramento fiscal aplicável antes da emissão final.',
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    try {
      const { data, error } = await georgiaSupabase
        .from('georgia_invoices')
        .select('*')
        .is('deleted_at', null)
        .order('invoice_date', { ascending: false });
      
      if (error) throw error;
      setInvoices(data || []);
      calculateStats(data || []);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(data: GeorgiaInvoice[]) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const totalInvoices = data.length;
    const totalAmount = data.reduce((sum, inv) => sum + (inv.amount_gel || inv.amount), 0);
    const monthAmount = data
      .filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
      })
      .reduce((sum, inv) => sum + (inv.amount_gel || inv.amount), 0);
    
    setStats({ totalInvoices, totalAmount, monthAmount });
  }

  async function getNextInvoiceNumber() {
    const { data, error } = await georgiaSupabase.rpc('next_georgia_invoice_number');
    if (!error && typeof data === 'string' && data.trim()) return data;

    // Fallback for local environments before the migration is applied.
    if (error) console.error('Não foi possível obter o número sequencial Georgianna:', error);
    return getNextGeorgiaInvoiceNumber(invoices.map((invoice) => invoice.invoice_number));
  }

  async function handleCreateNew() {
    const number = await getNextInvoiceNumber();
    setImportInvoiceId('');
    setNextInvoiceNumber(number);
    setEditingInvoice(null);
    setShowForm(true);
    setPreviewInvoice(null);
  }

  async function handleImportInvoice(invoiceId: string) {
    setImportInvoiceId(invoiceId);
    if (!invoiceId) return;

    const source = sourceInvoices.find((invoice) => invoice.id === invoiceId);
    if (!source) return;

    const nextNumber = await getNextInvoiceNumber();
    const items: GeorgiaServiceItem[] = (source.invoice_items ?? []).map((item) => ({
      description: item.description,
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price) || 0,
      service_period: formatInvoiceItemPeriod(item.service_start_date, item.service_end_date) ?? '',
    }));
    const description = items.map((item) => `${item.quantity} × ${item.description}`).join('\n');

    setEditingInvoice({
      source_invoice_id: source.id,
      invoice_number: nextNumber,
      invoice_date: source.issue_date,
      client_name: getClientLabel(source, 'Sem cliente'),
      client_nif: source.clients?.nif ?? '',
      client_address: source.clients?.address ?? '',
      client_email: source.clients?.email ?? '',
      client_phone: source.clients?.phone ?? '',
      client_company: source.clients?.company ?? '',
      client_country: 'Portugal',
      service_description: description || source.notes || '',
      service_items: items,
      due_date: addDaysToDate(source.issue_date, 7),
      amount: getInvoiceTotalWithIva(source.invoice_items ?? [], source),
      currency: 'EUR',
      exchange_rate: 0,
      status: 'draft',
    });
    setShowForm(true);
    setPreviewInvoice(null);
  }

  function handleEdit(invoice: GeorgiaInvoice) {
    setEditingInvoice(invoice);
    setShowForm(true);
    setPreviewInvoice(null);
  }

  function handlePreview(invoice: GeorgiaInvoice) {
    setPreviewInvoice(invoice);
    setShowForm(false);
  }

  function handleSaveSuccess() {
    setShowForm(false);
    setEditingInvoice(null);
    fetchInvoices();
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem a certeza que quer eliminar esta fatura?')) return;

    const { error } = await georgiaSupabase
      .from('georgia_invoices')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Erro ao eliminar fatura Georgianna:', error);
      alert('Não foi possível eliminar a fatura. Tenta novamente.');
      return;
    }

    if (previewInvoice?.id === id) setPreviewInvoice(null);
    await fetchInvoices();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Faturação Geórgia</h1>
        <p className="text-gray-600 mt-1">Cria documentos comerciais para clientes internacionais com tratamento fiscal configurável.</p>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Faturas</div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalInvoices}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Faturado (mês)</div>
          <div className="text-2xl font-bold text-gray-900">{(stats.monthAmount / 100).toFixed(2)} GEL</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Faturado (Total)</div>
          <div className="text-2xl font-bold text-gray-900">{(stats.totalAmount / 100).toFixed(2)} GEL</div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={handleCreateNew}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium"
        >
          + Nova Fatura
        </button>
        <select
          value={importInvoiceId}
          onChange={(event) => handleImportInvoice(event.target.value)}
          disabled={sourceInvoicesLoading}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-800 min-w-[280px]"
          aria-label="Importar fatura existente"
        >
          <option value="">Importar fatura existente…</option>
          {availableSourceInvoices.map((source) => (
            <option key={source.id} value={source.id}>
              {source.number} — {getClientLabel(source, 'Sem cliente')}
            </option>
          ))}
          {availableSourceInvoices.length === 0 && !sourceInvoicesLoading && (
            <option value="" disabled>Não existem faturas disponíveis para importar</option>
          )}
        </select>
      </div>

      {/* Content */}
      {showForm && (
        <GeorgiaInvoiceForm
          invoice={editingInvoice}
          issuerProfile={companyProfile}
          initialInvoiceNumber={nextInvoiceNumber}
          onSave={handleSaveSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}

      {previewInvoice && (
        <GeorgiaInvoicePreview
          invoice={previewInvoice}
          companyProfile={companyProfile}
          onClose={() => setPreviewInvoice(null)}
        />
      )}

      {!showForm && !previewInvoice && (
        <GeorgiaInvoiceList
          invoices={invoices}
          loading={loading}
          onEdit={handleEdit}
          onPreview={handlePreview}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
