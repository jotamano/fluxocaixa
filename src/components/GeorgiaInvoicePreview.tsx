import { openDocumentPreview } from '@/lib/document-preview';
import type { GeorgiaCompanyProfile } from '@/lib/georgia';

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
  amount_gel?: number;
  issuer_name?: string | null;
  issuer_address?: string | null;
  issuer_tax_id?: string | null;
  issuer_country?: string | null;
  issuer_email?: string | null;
  issuer_phone?: string | null;
  issuer_registration_number?: string | null;
  issuer_bank_details?: string | null;
}

interface Props {
  invoice: GeorgiaInvoice;
  companyProfile: GeorgiaCompanyProfile;
  onClose: () => void;
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatAmount = (value: number, currency: string) => `${(value / 100).toFixed(2)} ${currency}`;

function getIssuerProfile(invoice: GeorgiaInvoice, companyProfile: GeorgiaCompanyProfile): GeorgiaCompanyProfile {
  return {
    name: invoice.issuer_name?.trim() || companyProfile.name,
    address: invoice.issuer_address?.trim() || companyProfile.address,
    tax_id: invoice.issuer_tax_id?.trim() || companyProfile.tax_id,
    country: invoice.issuer_country?.trim() || companyProfile.country,
    email: invoice.issuer_email?.trim() || companyProfile.email,
    phone: invoice.issuer_phone?.trim() || companyProfile.phone,
    registration_number: invoice.issuer_registration_number?.trim() || companyProfile.registration_number,
    bank_details: invoice.issuer_bank_details?.trim() || companyProfile.bank_details,
  };
}

function buildGeorgiaInvoiceHtml(invoice: GeorgiaInvoice, companyProfile: GeorgiaCompanyProfile): string {
  const issuer = getIssuerProfile(invoice, companyProfile);
  const description = escapeHtml(invoice.service_description).replace(/\n/g, '<br/>');
  const issuerAddress = escapeHtml(issuer.address).replace(/\n/g, '<br/>');
  const issuerBankDetails = issuer.bank_details
    ? `<p style="font-size:13px;color:#4b5563;white-space:pre-line;">${escapeHtml(issuer.bank_details)}</p>`
    : '';
  const issuerEmail = issuer.email ? `<p style="font-size:13px;color:#4b5563;">${escapeHtml(issuer.email)}</p>` : '';
  const issuerPhone = issuer.phone ? `<p style="font-size:13px;color:#4b5563;">${escapeHtml(issuer.phone)}</p>` : '';
  const issuerRegistration = issuer.registration_number
    ? `<p style="font-size:13px;color:#4b5563;">Registo comercial: ${escapeHtml(issuer.registration_number)}</p>`
    : '';
  const clientAddress = invoice.client_address
    ? `<p style="font-size:13px;color:#4b5563;">${escapeHtml(invoice.client_address)}</p>`
    : '';
  const clientNif = invoice.client_nif
    ? `<p style="font-size:13px;color:#4b5563;">NIF: ${escapeHtml(invoice.client_nif)}</p>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="pt-PT">
      <head>
        <meta charset="utf-8" />
        <title>Fatura ${escapeHtml(invoice.invoice_number)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; color: #1f2937; background: #fff; }
          .document-preview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; background: #111827; color: #fff; position: sticky; top: 0; z-index: 2; }
          .document-preview-actions { display: flex; gap: 8px; }
          .document-preview-actions button { border: 0; border-radius: 6px; padding: 8px 12px; cursor: pointer; background: #2563eb; color: #fff; font-weight: 600; }
          .document-preview-actions button:last-child { background: #374151; }
          .page { max-width: 800px; margin: 0 auto; padding: 44px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
          h1 { margin: 0; font-size: 24px; }
          .muted { color: #6b7280; }
          .section { margin-bottom: 28px; }
          .section-title { margin: 0 0 8px; font-weight: 700; }
          .section p { margin: 3px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { padding: 12px 8px; border-bottom: 1px solid #e5e7eb; }
          th { text-align: left; color: #4b5563; font-size: 13px; }
          td:last-child, th:last-child { text-align: right; }
          .notice { padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
          .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280; }
          @media print {
            .document-preview-toolbar { display: none !important; }
            .page { padding: 0; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div>
              <h1>INVOICE / FATURA</h1>
              <p class="muted">${escapeHtml(invoice.invoice_number)}</p>
            </div>
            <p class="muted">Data: ${new Date(invoice.invoice_date).toLocaleDateString('pt-PT')}</p>
          </div>
          <div class="section">
            <p class="section-title">Fornecedor:</p>
            <p>${escapeHtml(issuer.name)}</p>
            <p>${issuerAddress}</p>
            <p>NIF: ${escapeHtml(issuer.tax_id)}</p>
            <p>${escapeHtml(issuer.country)}</p>
            ${issuerRegistration}
            ${issuerEmail}
            ${issuerPhone}
            ${issuerBankDetails}
          </div>
          <div class="section">
            <p class="section-title">Cliente:</p>
            <p>${escapeHtml(invoice.client_name)}</p>
            ${clientNif}
            ${clientAddress}
          </div>
          <div class="section">
            <p class="section-title">Descrição dos Serviços:</p>
            <p>${description}</p>
          </div>
          <div class="section">
            <table>
              <thead><tr><th>Descrição</th><th>Valor</th></tr></thead>
              <tbody><tr><td>Serviços prestados</td><td>${formatAmount(invoice.amount, invoice.currency)}</td></tr></tbody>
            </table>
          </div>
          <div class="notice">
            <strong>IVA — Autoliquidação (Reverse Charge)</strong>
            <p class="muted">Serviços prestados por empresa não residente em Portugal, fora do âmbito de aplicação do IVA em Portugal. O IVA é devido pelo cliente nos termos do artigo 2.º do Decreto-Lei n.º 198/90.</p>
          </div>
          <div class="footer">Esta fatura não inclui IVA ao abrigo do regime de reverse charge.</div>
        </div>
      </body>
    </html>
  `;
}

export default function GeorgiaInvoicePreview({ invoice, companyProfile, onClose }: Props) {
  const issuer = getIssuerProfile(invoice, companyProfile);

  const handleOpenPdf = () => {
    openDocumentPreview({
      title: `Fatura Geórgia ${invoice.invoice_number}`,
      html: buildGeorgiaInvoiceHtml(invoice, companyProfile),
    });
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Visualizar Fatura</h2>
        <div className="flex gap-3">
          <button
            onClick={handleOpenPdf}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium"
          >
            Abrir PDF
          </button>
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-medium"
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="p-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold">INVOICE / FATURA</h1>
            <p className="text-gray-600">{invoice.invoice_number}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Data: {new Date(invoice.invoice_date).toLocaleDateString('pt-PT')}</p>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="font-semibold mb-2">Fornecedor:</h3>
          <p className="text-sm text-gray-700">{issuer.name}</p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{issuer.address}</p>
          <p className="text-sm text-gray-700">NIF: {issuer.tax_id}</p>
          <p className="text-sm text-gray-700">{issuer.country}</p>
          {issuer.registration_number && <p className="text-sm text-gray-700">Registo comercial: {issuer.registration_number}</p>}
          {issuer.email && <p className="text-sm text-gray-700">{issuer.email}</p>}
          {issuer.phone && <p className="text-sm text-gray-700">{issuer.phone}</p>}
          {issuer.bank_details && <p className="text-sm text-gray-700 whitespace-pre-line">{issuer.bank_details}</p>}
        </div>

        <div className="mb-8">
          <h3 className="font-semibold mb-2">Cliente:</h3>
          <p className="text-sm text-gray-700">{invoice.client_name}</p>
          {invoice.client_nif && <p className="text-sm text-gray-700">NIF: {invoice.client_nif}</p>}
          {invoice.client_address && <p className="text-sm text-gray-700">{invoice.client_address}</p>}
        </div>

        <div className="mb-8">
          <h3 className="font-semibold mb-2">Descrição dos Serviços:</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{invoice.service_description}</p>
        </div>

        <div className="mb-8">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-sm font-medium text-gray-700">Descrição</th>
                <th className="text-right py-2 text-sm font-medium text-gray-700">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3 text-sm text-gray-900">Serviços prestados</td>
                <td className="py-3 text-right text-sm font-medium text-gray-900">{formatAmount(invoice.amount, invoice.currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded">
          <p className="text-sm text-gray-700 font-medium">IVA — Autoliquidação (Reverse Charge)</p>
          <p className="text-xs text-gray-600 mt-1">
            Serviços prestados por empresa não residente em Portugal, fora do âmbito de aplicação do IVA em Portugal.
            O IVA é devido pelo cliente nos termos do artigo 2.º do Decreto-Lei n.º 198/90.
          </p>
        </div>

        <div className="mt-12 pt-4 border-t text-center text-xs text-gray-500">
          <p>Esta fatura não inclui IVA ao abrigo do regime de reverse charge.</p>
        </div>
      </div>
    </div>
  );
}
