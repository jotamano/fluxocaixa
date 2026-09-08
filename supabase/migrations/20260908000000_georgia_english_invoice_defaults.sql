-- Translate the English invoice defaults for existing installations.
-- Only replace the original generic value for each field; user-edited values remain untouched.
update public.app_settings
set
  georgia_invoice_en_tax_label = case
    when georgia_invoice_en_tax_label = 'VAT treatment to be confirmed'
      then 'VAT — reverse charge by the recipient'
    else georgia_invoice_en_tax_label
  end,
  georgia_invoice_en_tax_note = case
    when georgia_invoice_en_tax_note = 'The VAT treatment must be confirmed according to the type of service, the customer''s tax status and the applicable place of taxation.'
      then 'VAT — reverse charge by the recipient, under point (e) of paragraph 1 of Article 2 and point (a) of paragraph 6 of Article 6 of the Portuguese VAT Code (CIVA).'
    else georgia_invoice_en_tax_note
  end,
  georgia_invoice_en_payment_terms = case
    when georgia_invoice_en_payment_terms = 'Payment due within 30 days from the issue date.'
      then 'Payment method: Bank transfer\nPayment due 7 days after the issue date'
    else georgia_invoice_en_payment_terms
  end,
  georgia_invoice_en_footer_note = case
    when georgia_invoice_en_footer_note = 'Commercial document. Confirm the applicable tax treatment before final issuance.'
      then 'Cross-border B2B service. VAT not charged by the supplier; reverse charge by the recipient where applicable.'
    else georgia_invoice_en_footer_note
  end,
  updated_at = now()
where id = 1
  and (
    georgia_invoice_en_tax_label = 'VAT treatment to be confirmed'
    or georgia_invoice_en_tax_note = 'The VAT treatment must be confirmed according to the type of service, the customer''s tax status and the applicable place of taxation.'
    or georgia_invoice_en_payment_terms = 'Payment due within 30 days from the issue date.'
    or georgia_invoice_en_footer_note = 'Commercial document. Confirm the applicable tax treatment before final issuance.'
  );
