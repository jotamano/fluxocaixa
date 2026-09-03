import { useState, useEffect } from 'react';
import { useAppSettings, useInvoices } from '@/hooks/use-data';
import type { GeorgiaCompanyProfile } from '@/lib/georgia';
import { getClientLabel, getInvoiceTotalWithIva } from '@/lib/data';
import { supabase } from '@/integrations/supabase/client';
import GeorgiaInvoiceList from '../components/GeorgiaInvoiceList';
import GeorgiaInvoiceForm from '../components/GeorgiaInvoiceForm';
import GeorgiaInvoicePreview from '../components/GeorgiaInvoicePreview';

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
  amount_gel?: number;
  issuer_name?: string | null;
  issuer_address?: string | null;
  issuer_tax_id?: string | null;
  issuer_country?: string | null;
  issuer_email?: string | null;
  issuer_phone?: string | null;
  issuer_registration_number?: string | null;
  issuer_bank_details?: string | null;
  issuer_logo_url?: string | null;
  status: string;
  created_at?: string;
}

interface DashboardStats {
  totalInvoices: number;
  totalAmount: number;
  monthAmount: number;
}

export default function GeorgiaInvoicing() {
  const [invoices, setInvoices] = useState<GeorgiaInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<GeorgiaInvoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<GeorgiaInvoice | null>(null);
  const [stats, setStats] = useState<DashboardStats>({ totalInvoices: 0, totalAmount: 0, monthAmount: 0 });
  const [importInvoiceId, setImportInvoiceId] = useState('');
  const { data: sourceInvoices = [], isLoading: sourceInvoicesLoading } = useInvoices();
  const { data: settings } = useAppSettings();
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

  function handleCreateNew() {
    setImportInvoiceId('');
    setEditingInvoice(null);
    setShowForm(true);
    setPreviewInvoice(null);
  }

  function handleImportInvoice(invoiceId: string) {
    setImportInvoiceId(invoiceId);
    if (!invoiceId) return;

    const source = sourceInvoices.find((invoice) => invoice.id === invoiceId);
    if (!source) return;

    const year = new Date().getFullYear();
    const nextNumber = `GE${year}${String(invoices.length + 1).padStart(3, '0')}`;
    const description = (source.invoice_items ?? [])
      .map((item) => `${item.quantity} × ${item.description}`)
      .join('\n');

    setEditingInvoice({
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
      amount: getInvoiceTotalWithIva(source.invoice_items ?? [], source),
      currency: 'EUR',
      exchange_rate: 2.75,
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

  function handleDelete(id: string) {
    if (confirm('Tem a certeza que quer eliminar esta fatura?')) {
      georgiaSupabase
        .from('georgia_invoices')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .then(() => fetchInvoices());
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Faturamento Geó§§»rgia</h1>
        <p className="text-gray-600 mt-1">Emita faturas para clientes internacionais (reverse charge)</p>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Faturas</div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalInvoices}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Faturado (Mêªªs)</div>
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
          {sourceInvoices.map((source) => (
            <option key={source.id} value={source.id}>
              {source.number} — {getClientLabel(source, 'Sem cliente')}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {showForm && (
        <GeorgiaInvoiceForm
          invoice={editingInvoice}
          issuerProfile={companyProfile}
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
