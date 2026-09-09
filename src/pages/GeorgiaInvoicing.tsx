import { useState, useEffect } from 'react';
import { useAppSettings, useInvoices, useServices } from '@/hooks/use-data';
import { getNextGeorgiaInvoiceNumber, type GeorgiaCompanyProfile } from '@/lib/georgia';
import { formatInvoiceItemPeriod, getClientLabel, getInvoiceTotalWithIva } from '@/lib/data';
import type { GeorgiaInvoice, GeorgiaServiceItem } from '../components/GeorgiaInvoiceForm';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY } from '@/lib/georgia-invoice-copy';
import { getEnglishServiceDescription } from '@/lib/service-translation';
import GeorgiaInvoiceList from '../components/GeorgiaInvoiceList';
import GeorgiaInvoiceForm from '../components/GeorgiaInvoiceForm';
import GeorgiaInvoicePreview from '../components/GeorgiaInvoicePreview';

// A tabela georgia_invoices ainda não está incluída nos tipos gerados do projecto.
const georgiaSupabase = supabase as any;

interface DashboardStats {
  totalInvoices: number;
  totalAmount: number;
  monthAmount: number;
  totalEur: number;
  monthEur: number;
  monthGel: number;
  totalGel: number;
  issued: number;
  sent: number;
  drafts: number;
}

function amountInEur(invoice: GeorgiaInvoice): number {
  const amount = Number(invoice.amount || 0) / 100;
  if (invoice.currency === 'EUR') return amount;
  const rate = Number(invoice.exchange_rate || 0);
  if (rate <= 0) return 0;
  const gel = invoice.currency === 'GEL' ? amount : Number(invoice.amount_gel || 0) / 100;
  return gel / rate;
}

function amountInGel(invoice: GeorgiaInvoice): number {
  if (invoice.currency === 'GEL') return Number(invoice.amount || 0) / 100;
  return Number(invoice.amount_gel || 0) / 100;
}

function formatDashboardMoney(value: number, currency: 'EUR' | 'GEL'): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(value);
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
  const [stats, setStats] = useState<DashboardStats>({ totalInvoices: 0, totalAmount: 0, monthAmount: 0, totalEur: 0, monthEur: 0, monthGel: 0, totalGel: 0, issued: 0, sent: 0, drafts: 0 });
  const [importInvoiceId, setImportInvoiceId] = useState('');
  const { data: sourceInvoices = [], isLoading: sourceInvoicesLoading } = useInvoices();
  const { data: services = [] } = useServices();
  const { data: settings } = useAppSettings();
  const importedSourceIds = new Set(invoices.map(invoice => invoice.source_invoice_id).filter((id): id is string => Boolean(id)));
  const availableSourceInvoices = sourceInvoices.filter(source => !importedSourceIds.has(source.id));
  const companyProfile: GeorgiaCompanyProfile = {
    name: settings?.georgia_company_name ?? '',
    address: settings?.georgia_company_address ?? '',
    tax_id: settings?.georgia_company_tax_id ?? '',
    country: settings?.georgia_company_country ?? 'Georgia',
    email: settings?.georgia_company_email ?? '',
    phone: settings?.georgia_company_phone ?? '',
    registration_number: settings?.georgia_company_registration_number ?? '',
    bank_details: settings?.georgia_company_bank_details ?? '',
    logo_url: settings?.georgia_company_logo_url ?? '',
    invoice_tax_label: settings?.georgia_invoice_tax_label ?? 'Tratamento de IVA a confirmar',
    invoice_tax_note: settings?.georgia_invoice_tax_note ?? 'O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.',
    invoice_payment_terms: settings?.georgia_invoice_payment_terms ?? 'Pagamento até 30 dias após a data de emissão.',
    invoice_footer_note: settings?.georgia_invoice_footer_note ?? '',
    invoice_en_tax_label: settings?.georgia_invoice_en_tax_label || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.taxLabel,
    invoice_en_tax_note: settings?.georgia_invoice_en_tax_note || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.taxNote,
    invoice_en_payment_terms: settings?.georgia_invoice_en_payment_terms || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.paymentTerms,
    invoice_en_footer_note: settings?.georgia_invoice_en_footer_note || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.footerNote,
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
    const totalEur = data.reduce((sum, inv) => sum + amountInEur(inv), 0);
    const totalGel = data.reduce((sum, inv) => sum + amountInGel(inv), 0);
    const monthInvoices = data
      .filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
      });
    const monthAmount = monthInvoices.reduce((sum, inv) => sum + (inv.amount_gel || inv.amount), 0);
    const monthEur = monthInvoices.reduce((sum, inv) => sum + amountInEur(inv), 0);
    const monthGel = monthInvoices.reduce((sum, inv) => sum + amountInGel(inv), 0);
    setStats({
      totalInvoices,
      totalAmount,
      monthAmount,
      totalEur,
      monthEur,
      monthGel,
      totalGel,
      issued: data.filter(inv => inv.status === 'issued').length,
      sent: data.filter(inv => inv.status === 'sent').length,
      drafts: data.filter(inv => !inv.status || inv.status === 'draft').length,
    });
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
      description_en: getEnglishServiceDescription(item.description, item.service_id, services),
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

    const { data: deleted, error } = await georgiaSupabase
      .rpc('soft_delete_georgia_invoice', { p_invoice_id: id });

    if (error) {
      console.error('Erro ao eliminar fatura Georgianna:', error);
      alert('Não foi possível eliminar a fatura. Tenta novamente.');
      return;
    }

    if (!deleted) {
      alert('A fatura não foi encontrada ou já foi eliminada.');
      await fetchInvoices();
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
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Faturas emitidas</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.totalInvoices}</div>
          <div className="mt-2 text-xs text-slate-500">{stats.issued} emitidas · {stats.sent} enviadas · {stats.drafts} rascunhos</div>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Este mês · EUR</div>
          <div className="mt-2 text-2xl font-bold text-blue-950">{formatDashboardMoney(stats.monthEur, 'EUR')}</div>
          <div className="mt-2 text-xs text-blue-800/70">Equivalente: {formatDashboardMoney(stats.monthGel, 'GEL')}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Total · EUR</div>
          <div className="mt-2 text-2xl font-bold text-emerald-950">{formatDashboardMoney(stats.totalEur, 'EUR')}</div>
          <div className="mt-2 text-xs text-emerald-800/70">Base total: {formatDashboardMoney(stats.totalGel, 'GEL')}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Por concluir</div>
          <div className="mt-2 text-2xl font-bold text-amber-950">{stats.drafts}</div>
          <div className="mt-2 text-xs text-amber-800/70">rascunho(s) aguardam confirmação</div>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Leitura rápida</h2>
              <p className="mt-1 text-sm text-slate-500">Conversão para EUR usando a taxa guardada em cada fatura.</p>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Média / fatura</div>
              <div className="text-sm font-bold text-slate-900">{formatDashboardMoney(stats.totalInvoices ? stats.totalEur / stats.totalInvoices : 0, 'EUR')}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Emitidas</div><div className="mt-1 font-bold text-slate-900">{stats.issued}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Enviadas</div><div className="mt-1 font-bold text-slate-900">{stats.sent}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Rascunhos</div><div className="mt-1 font-bold text-slate-900">{stats.drafts}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Por concluir</div><div className="mt-1 font-bold text-amber-700">{stats.drafts}</div></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Sugestões</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>• Usa a conversão em EUR para comparar clientes e meses.</li>
            <li>• Mantém rascunhos apenas enquanto os dados fiscais estão a ser confirmados.</li>
          </ul>
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
          services={services}
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
