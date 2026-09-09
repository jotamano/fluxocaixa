import { useState } from 'react';
import { openDocumentPreview } from '@/lib/document-preview';
import { formatGeorgiaClientTaxId, type GeorgiaCompanyProfile } from '@/lib/georgia';
import { DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY } from '@/lib/georgia-invoice-copy';
import { getEnglishServiceDescription, type ServiceNameTranslation } from '@/lib/service-translation';

interface GeorgiaInvoice {
  id?: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  service_period?: string | null;
  client_name: string;
  client_nif?: string;
  client_address?: string;
  client_email?: string;
  client_phone?: string;
  client_company?: string;
  client_country?: string;
  service_description: string;
  service_items?: { description: string; description_en?: string | null; quantity: number; unit_price: number; service_period?: string | null }[] | null;
  amount: number;
  currency: string;
  exchange_rate?: number;
  amount_gel?: number;
  tax_treatment_label?: string | null;
  tax_treatment_note?: string | null;
  payment_terms?: string | null;
  footer_note?: string | null;
  tax_treatment_label_en?: string | null;
  tax_treatment_note_en?: string | null;
  payment_terms_en?: string | null;
  footer_note_en?: string | null;
  issuer_name?: string | null;
  issuer_address?: string | null;
  issuer_tax_id?: string | null;
  issuer_country?: string | null;
  issuer_email?: string | null;
  issuer_phone?: string | null;
  issuer_registration_number?: string | null;
  issuer_bank_details?: string | null;
  issuer_logo_url?: string | null;
  status?: string;
}

interface Props {
  invoice: GeorgiaInvoice;
  companyProfile: GeorgiaCompanyProfile;
  services?: ServiceNameTranslation[];
  onClose: () => void;
}

const DEFAULT_TAX_LABEL = 'Tratamento de IVA a confirmar';
const DEFAULT_TAX_NOTE = 'O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.';
const DEFAULT_PAYMENT_TERMS = 'Pagamento até 30 dias após a data de emissão.';
const DEFAULT_FOOTER_NOTE = 'Documento comercial. Confirma o enquadramento fiscal aplicável antes da emissão final.';

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const text = (value?: string | null) => escapeHtml(value?.trim() || '—');
const withBreaks = (value?: string | null) => text(value).replace(/\n/g, '<br/>');

function formatMoneyInHtml(valueInCents: number, currency: string, locale: string) {
  const amount = (valueInCents || 0) / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
}

function statusLabel(status?: string) {
  if (status === 'issued') return 'Emitida';
  if (status === 'sent') return 'Enviada';
  return 'Rascunho';
}

function statusColor(status?: string) {
  if (status === 'issued') return { background: '#dcfce7', color: '#166534' };
  if (status === 'sent') return { background: '#dbeafe', color: '#1d4ed8' };
  return { background: '#fef3c7', color: '#92400e' };
}

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
    logo_url: invoice.issuer_logo_url?.trim() || companyProfile.logo_url,
    invoice_tax_label: invoice.tax_treatment_label?.trim() || companyProfile.invoice_tax_label,
    invoice_tax_note: invoice.tax_treatment_note?.trim() || companyProfile.invoice_tax_note,
    invoice_payment_terms: invoice.payment_terms?.trim() || companyProfile.invoice_payment_terms,
        invoice_footer_note: invoice.footer_note?.trim() || companyProfile.invoice_footer_note,
    invoice_en_tax_label: invoice.tax_treatment_label_en?.trim() || companyProfile.invoice_en_tax_label,
    invoice_en_tax_note: invoice.tax_treatment_note_en?.trim() || companyProfile.invoice_en_tax_note,
    invoice_en_payment_terms: invoice.payment_terms_en?.trim() || companyProfile.invoice_en_payment_terms,
    invoice_en_footer_note: invoice.footer_note_en?.trim() || companyProfile.invoice_en_footer_note,
  };
}

export type InvoiceLanguage = 'pt' | 'en';

export function buildGeorgiaInvoiceHtml(
  invoice: GeorgiaInvoice,
  companyProfile: GeorgiaCompanyProfile,
  language: InvoiceLanguage = 'pt',
  services: ServiceNameTranslation[] = [],
): string {
  const issuer = getIssuerProfile(invoice, companyProfile);
  const status = statusColor(invoice.status);
  const locale = language === 'en' ? 'en-GB' : 'pt-PT';
  const taxLabel = language === 'en' ? (issuer.invoice_en_tax_label || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.taxLabel) : (issuer.invoice_tax_label || DEFAULT_TAX_LABEL);
  const taxNote = language === 'en' ? (issuer.invoice_en_tax_note || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.taxNote) : (issuer.invoice_tax_note || DEFAULT_TAX_NOTE);
  const paymentTerms = language === 'en' ? (issuer.invoice_en_payment_terms || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.paymentTerms) : (issuer.invoice_payment_terms || DEFAULT_PAYMENT_TERMS);
  const footerNote = language === 'en' ? (issuer.invoice_en_footer_note || DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY.footerNote) : (issuer.invoice_footer_note || DEFAULT_FOOTER_NOTE);
  const copy = language === 'en' ? {
    htmlLang: 'en', kicker: 'Invoice', title: 'INVOICE', issued: 'Issue date', due: 'Due date', items: 'Service items', currencyVersion: 'Currency · Version', version: 'English version', issuer: 'Issuer', billTo: 'Bill to', services: 'Services provided', caption: 'Detailed description and billed amount', description: 'Description', quantity: 'Qty.', unitPrice: 'Unit price', total: 'Total', gelReference: 'GEL reference', exchangeRate: 'exchange rate', subtotal: 'Subtotal', vat: 'VAT', totalDue: 'Total due', payment: 'Payment', bank: 'Bank details', status: invoice.status === 'issued' ? 'Issued' : invoice.status === 'sent' ? 'Sent' : 'Draft', register: 'Registration', period: 'Period', footerInvoice: 'Invoice', taxLabel, taxNote, paymentTerms,
  } : {
    htmlLang: 'pt-PT', kicker: 'Invoice · Fatura', title: 'FATURA', issued: 'Data de emissão', due: 'Vencimento', items: 'Itens de serviço', currencyVersion: 'Moeda · Versão', version: 'Versão portuguesa', issuer: 'Emitente · Issuer', billTo: 'Cliente · Bill to', services: 'Serviços prestados', caption: 'Descrição detalhada e valor faturado', description: 'Descrição', quantity: 'Qtd.', unitPrice: 'Preço unitário', total: 'Total', gelReference: 'Referência em GEL', exchangeRate: 'taxa de câmbio', subtotal: 'Subtotal', vat: 'IVA / VAT', totalDue: 'Total a pagar', payment: 'Pagamento', bank: 'Dados bancários', status: statusLabel(invoice.status), register: 'Registo', period: 'Período', footerInvoice: 'Invoice · Fatura', taxLabel, taxNote, paymentTerms,
  };
  const clientTaxId = formatGeorgiaClientTaxId(invoice.client_nif, invoice.client_country);
  const serviceItems = invoice.service_items?.length
    ? invoice.service_items
    : [{ description: invoice.service_description, description_en: '', quantity: 1, unit_price: (invoice.amount || 0) / 100, service_period: invoice.service_period }];
  const amount = formatMoneyInHtml(invoice.amount, invoice.currency, locale);
  const gelAmount = invoice.amount_gel && invoice.currency !== 'GEL'
    ? formatMoneyInHtml(invoice.amount_gel, 'GEL', locale)
    : '';
  const issuerLogo = issuer.logo_url
    ? `<img src="${text(issuer.logo_url)}" alt="${language === 'en' ? 'Logo' : 'Logótipo'}" class="brand-logo" />`
    : `<div class="brand-mark">F</div>`;
  const issuerContact = [issuer.email, issuer.phone].filter(Boolean).map(item => `<span>${text(item)}</span>`).join('');
  const clientContact = [invoice.client_email, invoice.client_phone].filter(Boolean).map(item => `<span>${text(item)}</span>`).join('');

  return `
    <!DOCTYPE html>
    <html lang="${copy.htmlLang}">
      <head>
        <meta charset="utf-8" />
        <title>${copy.title} ${text(invoice.invoice_number)}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          :root { color-scheme: light; }
          body { margin: 0; background: #e9eef5; color: #172033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sheet { width: 210mm; min-height: 297mm; margin: 24px auto; padding: 48px 52px 24px; background: #fff; box-shadow: 0 20px 60px rgba(15, 23, 42, .14); position: relative; }
          .sheet:before { content: ""; position: absolute; inset: 0 0 auto; height: 8px; background: linear-gradient(90deg, #183b73 0%, #2563a8 58%, #38b3a0 100%); }
          .topline { display: flex; justify-content: space-between; gap: 28px; align-items: flex-start; padding-top: 8px; }
          .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
          .brand-logo { width: 178px; max-height: 66px; object-fit: contain; object-position: left center; }
          .brand-mark { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 15px; background: #183b73; color: #fff; font-size: 28px; font-weight: 800; letter-spacing: -.08em; }
          .brand-name { margin: 0; font-size: 16px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; color: #102a52; }
          .brand-country { margin: 4px 0 0; color: #6b7890; font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }
          .invoice-heading { text-align: right; }
          .invoice-kicker { margin: 0; color: #6b7890; font-size: 10px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
          .invoice-title { margin: 4px 0 4px; color: #102a52; font-size: 30px; line-height: 1; font-weight: 850; letter-spacing: -.04em; }
          .invoice-number { margin: 0; color: #2e6da4; font-size: 13px; font-weight: 700; }
          .status { display: inline-block; margin-top: 12px; border-radius: 999px; padding: 6px 11px; color: ${status.color}; background: ${status.background}; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
          .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-top: 34px; }
          .meta-card { min-height: 66px; padding: 12px 13px; border: 1px solid #e3eaf3; border-radius: 12px; background: #f8fafc; }
          .meta-label { color: #7b879a; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
          .meta-value { margin-top: 7px; color: #172033; font-size: 12px; font-weight: 750; line-height: 1.3; }
          .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
          .party-card { min-height: 108px; padding: 12px 14px; border: 1px solid #e3eaf3; border-radius: 12px; }
          .party-card.client { border-color: #cfe4e3; background: linear-gradient(145deg, #f8fdfd, #eff8f7); }
          .section-label { margin: 0 0 8px; color: #748197; font-size: 8px; font-weight: 850; letter-spacing: .12em; text-transform: uppercase; }
          .party-name { margin: 0 0 3px; color: #102a52; font-size: 12px; font-weight: 800; }
          .party-line { margin: 2px 0; color: #536175; font-size: 9px; line-height: 1.3; }
          .party-line strong { color: #2a3548; font-weight: 700; }
          .contact-row { display: flex; flex-wrap: wrap; gap: 3px 10px; margin-top: 5px; color: #718096; font-size: 8px; }
          .services { margin-top: 24px; }
          .services-heading { display: flex; justify-content: space-between; align-items: end; gap: 12px; margin-bottom: 10px; }
          .services-title { margin: 0; color: #102a52; font-size: 14px; font-weight: 800; }
          .services-caption { color: #8a95a7; font-size: 9.5px; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e3eaf3; border-radius: 12px; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          th { padding: 11px 13px; background: #183b73; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
          td { padding: 15px 13px; border-top: 1px solid #e8edf4; color: #435167; font-size: 10.5px; vertical-align: top; }
          td:first-child { width: 57%; color: #172033; font-weight: 700; }
          td:last-child, th:last-child { text-align: right; }
          .line-description { line-height: 1.55; }
          .line-period { margin-top: 6px; color: #8a95a7; font-size: 9px; font-weight: 500; }
          .summary-grid { display: grid; grid-template-columns: 1fr 250px; gap: 28px; align-items: start; margin-top: 18px; }
          .currency-note { padding: 14px 16px; border-radius: 12px; background: #f2f8f8; color: #406568; font-size: 10px; line-height: 1.5; }
          .currency-note strong { display: block; margin-bottom: 4px; color: #1f5d63; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; }
          .totals { padding: 15px 16px; border: 1px solid #e3eaf3; border-radius: 12px; }
          .total-row { display: flex; justify-content: space-between; gap: 15px; padding: 6px 0; color: #68768a; font-size: 10.5px; }
          .total-row + .total-row { border-top: 1px solid #edf1f6; }
          .total-row strong { color: #172033; font-weight: 750; }
          .total-row.grand { margin: 8px -16px -15px; padding: 14px 16px; border-top: 1px solid #d4dfed; border-radius: 0 0 12px 12px; background: #f6f9fc; color: #183b73; font-size: 12px; }
          .total-row.grand strong { color: #183b73; font-size: 17px; }
          .note-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; }
          .note-card { padding: 11px 12px; border-radius: 12px; border: 1px solid #e3eaf3; background: #fbfcfe; }
          .note-card.tax { border-color: #f0dfba; background: #fffaf0; }
          .note-title { margin: 0 0 5px; color: #21304a; font-size: 8.5px; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
          .note-card.tax .note-title { color: #8a5a13; }
          .note-body { margin: 0; color: #66748a; font-size: 8.5px; line-height: 1.35; white-space: pre-line; }
          .footer { display: flex; justify-content: space-between; gap: 22px; margin-top: 18px; padding-top: 12px; border-top: 1px solid #dfe7f0; color: #8793a5; font-size: 8.5px; line-height: 1.5; }
          .footer-left { max-width: 62%; }
          .footer-right { text-align: right; }
          .footer strong { display: block; margin-bottom: 3px; color: #526078; font-size: 9px; }
          @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; } .summary-grid, .note-grid, .footer { break-inside: avoid; page-break-inside: avoid; } }
          @media (max-width: 820px) { .sheet { width: 100%; min-height: auto; margin: 0; padding: 38px 24px 28px; } .meta-grid { grid-template-columns: repeat(2, 1fr); } }
        </style>
      </head>
      <body>
        <main class="sheet" data-document-page>
          <header class="topline">
            <div class="brand">
              ${issuerLogo}
              <div><p class="brand-name">${text(issuer.name)}</p><p class="brand-country">${text(issuer.country)}</p></div>
            </div>
            <div class="invoice-heading">
              <p class="invoice-kicker">${copy.kicker}</p>
              <h1 class="invoice-title">${copy.title}</h1>
              <p class="invoice-number">${text(invoice.invoice_number)}</p>
              <span class="status">${copy.status}</span>
            </div>
          </header>

          <section class="meta-grid">
            <div class="meta-card"><div class="meta-label">${copy.issued}</div><div class="meta-value">${formatDate(invoice.invoice_date, locale)}</div></div>
            <div class="meta-card"><div class="meta-label">${copy.due}</div><div class="meta-value">${formatDate(invoice.due_date, locale)}</div></div>
            <div class="meta-card"><div class="meta-label">${copy.items}</div><div class="meta-value">${serviceItems.length}</div></div>
            <div class="meta-card"><div class="meta-label">${copy.currencyVersion}</div><div class="meta-value">${text(invoice.currency)} · ${text(copy.version)}</div></div>
          </section>

          <section class="party-grid">
            <div class="party-card">
              <p class="section-label">${copy.issuer}</p>
              <p class="party-name">${text(issuer.name)}</p>
              <p class="party-line">${withBreaks(issuer.address)}</p>
              <p class="party-line"><strong>NIF / Tax ID:</strong> ${text(issuer.tax_id)}</p>
              ${issuer.registration_number ? `              <p class="party-line"><strong>${copy.register}:</strong> ${text(issuer.registration_number)}</p>` : ''}
              ${issuerContact ? `<div class="contact-row">${issuerContact}</div>` : ''}
            </div>
            <div class="party-card client">
              <p class="section-label">${copy.billTo}</p>
              <p class="party-name">${text(invoice.client_company || invoice.client_name)}</p>
              ${invoice.client_company && invoice.client_name !== invoice.client_company ? `<p class="party-line">${text(invoice.client_name)}</p>` : ''}
              ${clientTaxId ? `<p class="party-line"><strong>NIF / Tax ID:</strong> ${text(clientTaxId)}</p>` : ''}
              ${invoice.client_address ? `<p class="party-line">${withBreaks(invoice.client_address)}</p>` : ''}
              ${invoice.client_country ? `<p class="party-line">${text(invoice.client_country)}</p>` : ''}
              ${clientContact ? `<div class="contact-row">${clientContact}</div>` : ''}
            </div>
          </section>

          <section class="services">
            <div class="services-heading"><h2 class="services-title">${copy.services}</h2><span class="services-caption">${copy.caption}</span></div>
            <table>
              <thead><tr><th>${copy.description}</th><th>${copy.quantity}</th><th>${copy.unitPrice}</th><th>${copy.total}</th></tr></thead>
              <tbody>${serviceItems.map(item => {
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                const lineAmount = Math.round(lineTotal * 100);
                const itemDescription = language === 'en'
                  ? item.description_en?.trim() || getEnglishServiceDescription(item.description, null, services) || item.description
                  : item.description;
                return `<tr><td><div class="line-description">${withBreaks(itemDescription)}</div>${item.service_period ? `<div class="line-period">${copy.period}: ${text(item.service_period)}</div>` : ''}</td><td>${item.quantity}</td><td>${formatMoneyInHtml(Math.round((Number(item.unit_price) || 0) * 100), invoice.currency, locale)}</td><td><strong>${formatMoneyInHtml(lineAmount, invoice.currency, locale)}</strong></td></tr>`;
              }).join('')}</tbody>
            </table>
          </section>

          <section class="summary-grid">
            <div>${gelAmount ? `<div class="currency-note"><strong>${copy.gelReference}</strong>${gelAmount} · ${copy.exchangeRate}: 1 ${text(invoice.currency)} = ${Number(invoice.exchange_rate || 0).toFixed(4)} GEL.</div>` : ''}</div>
            <div class="totals">
              <div class="total-row"><span>${copy.subtotal}</span><strong>${amount}</strong></div>
              <div class="total-row"><span>${copy.vat}</span><strong>0%</strong></div>
              <div class="total-row grand"><span>${copy.totalDue}</span><strong>${amount}</strong></div>
            </div>
          </section>

          <section class="note-grid">
            <div class="note-card tax"><h3 class="note-title">${text(copy.taxLabel)}</h3><p class="note-body">${withBreaks(copy.taxNote)}</p></div>
            <div class="note-card"><h3 class="note-title">${copy.payment}</h3><p class="note-body">${withBreaks(copy.paymentTerms)}${issuer.bank_details ? `<br/><br/><strong>${copy.bank}</strong><br/>${withBreaks(issuer.bank_details)}` : ''}</p></div>
          </section>

          <footer class="footer">
            <div class="footer-left"><strong>${text(footerNote)}</strong>${issuer.email ? text(issuer.email) : ''}${issuer.email && issuer.phone ? ' · ' : ''}${issuer.phone ? text(issuer.phone) : ''}</div>
            <div class="footer-right"><strong>${text(invoice.invoice_number)}</strong>${copy.footerInvoice}</div>
          </footer>
        </main>
      </body>
    </html>
  `;
}

export default function GeorgiaInvoicePreview({ invoice, companyProfile, services = [], onClose }: Props) {
  const [language, setLanguage] = useState<InvoiceLanguage>('pt');
  const isEnglish = language === 'en';
  const html = buildGeorgiaInvoiceHtml(invoice, companyProfile, language, services);

  const handleOpenPdf = () => {
    openDocumentPreview({
      title: isEnglish ? `Georgia Invoice ${invoice.invoice_number} - EN` : `Fatura Geórgia ${invoice.invoice_number}`,
      html,
      singlePage: true,
      language,
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-xl">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{isEnglish ? 'Preview' : 'Pré-visualização'}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{isEnglish ? 'Invoice' : 'Fatura'} {invoice.invoice_number}</h2>
          <p className="mt-1 text-sm text-slate-500">{isEnglish ? 'English A4 document, ready to open and print.' : 'Documento em formato A4, pronto para abrir e imprimir.'}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Idioma da fatura">
            <button type="button" onClick={() => setLanguage('pt')} aria-pressed={!isEnglish} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${!isEnglish ? 'bg-[#183b73] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>PT</button>
            <button type="button" onClick={() => setLanguage('en')} aria-pressed={isEnglish} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${isEnglish ? 'bg-[#2f7d70] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>EN</button>
          </div>
          <button onClick={handleOpenPdf} className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${isEnglish ? 'bg-[#2f7d70] hover:bg-[#246458]' : 'bg-[#183b73] hover:bg-[#102a52]'}`}>{isEnglish ? 'Open / Print EN' : 'Abrir / Imprimir PT'}</button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">{isEnglish ? 'Close' : 'Fechar'}</button>
        </div>
      </div>
      <div className="p-3 sm:p-6">
        <iframe key={language} title={`${isEnglish ? 'Invoice preview' : 'Pré-visualização da fatura'} ${invoice.invoice_number}`} srcDoc={html} className="h-[1120px] w-full rounded-xl border border-slate-200 bg-white shadow-lg" />
      </div>
    </div>
  );
}
