export const DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY = {
  taxLabel: 'VAT — reverse charge by the recipient',
  taxNote: 'VAT — reverse charge by the recipient, under point (e) of paragraph 1 of Article 2 and point (a) of paragraph 6 of Article 6 of the Portuguese VAT Code (CIVA).',
  paymentTerms: 'Payment method: Bank transfer\nPayment due 7 days after the issue date',
  footerNote: 'Cross-border B2B service. VAT not charged by the supplier; reverse charge by the recipient where applicable.',
};

export type GeorgiaEnglishInvoiceCopy = typeof DEFAULT_GEORGIA_ENGLISH_INVOICE_COPY;
