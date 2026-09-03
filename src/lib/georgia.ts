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
