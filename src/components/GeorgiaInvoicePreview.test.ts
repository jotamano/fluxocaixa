import { describe, expect, it } from 'vitest';
import { buildGeorgiaInvoiceHtml } from './GeorgiaInvoicePreview';

const companyProfile = {
  name: 'Fluxo Caixa LLC',
  address: '1 Invoice Street',
  tax_id: 'GE123456789',
  country: 'Georgia',
  email: 'billing@example.com',
  phone: '+995 555 000 000',
  registration_number: '',
  bank_details: '',
  logo_url: '',
};

const invoice = {
  invoice_number: 'GE2026070',
  invoice_date: '2026-09-08',
  due_date: '2026-09-15',
  client_name: 'Client Ltd',
  client_nif: '506562395',
  client_address: '2 Client Road',
  client_country: 'Portugal',
  service_description: 'Gestão de Redes Sociais',
  service_items: [{
    description: 'Gestão de Redes Sociais — Setembro 2026',
    description_en: 'Social Media Management — September 2026',
    quantity: 1,
    unit_price: 250,
    service_period: '01/09/2026 – 30/09/2026',
  }],
  amount: 25000,
  currency: 'EUR',
  status: 'issued',
};

describe('buildGeorgiaInvoiceHtml', () => {
  it('renders saved English service names and English invoice copy only in the English version', () => {
    const englishHtml = buildGeorgiaInvoiceHtml(invoice, companyProfile, 'en');

    expect(englishHtml).toContain('Social Media Management — September 2026');
    expect(englishHtml).toContain('Services provided');
    expect(englishHtml).toContain('INVOICE');
    expect(englishHtml).toContain('Issued');
    expect(englishHtml).toContain('€250.00');
    expect(englishHtml).not.toContain('Serviços prestados');
  });

  it('keeps the Portuguese service name in the Portuguese version', () => {
    const portugueseHtml = buildGeorgiaInvoiceHtml(invoice, companyProfile, 'pt');

    expect(portugueseHtml).toContain('Gestão de Redes Sociais — Setembro 2026');
    expect(portugueseHtml).toContain('Serviços prestados');
    expect(portugueseHtml).not.toContain('Social Media Management — September 2026');
  });

  it('uses saved service translations for legacy Georgia invoices without an English snapshot', () => {
    const legacyInvoice = {
      ...invoice,
      service_items: [{ ...invoice.service_items[0], description_en: '' }],
    };
    const html = buildGeorgiaInvoiceHtml(legacyInvoice, companyProfile, 'en', [{
      id: 'social',
      name: 'Gestão de Redes Sociais',
      name_en: 'Social Media Management',
    }]);

    expect(html).toContain('Social Media Management — September 2026');
  });
});
