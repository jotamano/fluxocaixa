export interface GeorgiaCompanyProfile {
  name: string;
  address: string;
  tax_id: string;
  country: string;
  email: string;
  phone: string;
  registration_number: string;
  bank_details: string;
  logo_url: string;
  invoice_tax_label?: string;
  invoice_tax_note?: string;
  invoice_payment_terms?: string;
  invoice_footer_note?: string;
}

export function isGeorgiaCompanyProfileComplete(profile: GeorgiaCompanyProfile | null | undefined): boolean {
  return Boolean(profile?.name.trim() && profile.address.trim() && profile.tax_id.trim());
}

export function getGeorgiaClientTaxPrefix(country?: string | null): string {
  const normalized = country?.trim().toLowerCase();
  if (normalized === 'portugal' || normalized === 'pt') return 'PT';
  if (normalized === 'georgia' || normalized === 'geórgia' || normalized === 'ge') return 'GE';
  const letters = country?.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
  return letters && letters.length === 2 ? letters : 'PT';
}

export function formatGeorgiaClientTaxId(taxId?: string | null, country?: string | null): string {
  const value = taxId?.trim() ?? '';
  if (!value) return '';
  const withoutPrefix = /^[A-Za-z]{2}/.test(value) ? value.slice(2) : value;
  return `${getGeorgiaClientTaxPrefix(country)}${withoutPrefix}`;
}

export function getGeorgiaInvoiceVersion(country?: string | null): string {
  return getGeorgiaClientTaxPrefix(country) === 'PT' ? 'Versão portuguesa' : 'PT';
}

/**
 * Generates the next Georgia invoice number. Existing numbers keep their
 * current GE + year prefix; the numeric sequence starts at 70.
 */
export function getNextGeorgiaInvoiceNumber(invoiceNumbers: string[], year = new Date().getFullYear()): string {
  const sequenceNumbers = invoiceNumbers
    .map((value) => {
      const match = value.trim().match(/(?:GE)?(?:\d{4})[-/]?(\d+)$/i) ?? value.trim().match(/(\d+)$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value));
  const nextSequence = Math.max(69, ...sequenceNumbers) + 1;
  return `GE${year}${String(nextSequence).padStart(3, '0')}`;
}
