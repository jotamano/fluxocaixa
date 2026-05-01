-- Per-line optional service dates on invoice_items.
--
-- Until now, NewInvoice exposed two "Data início / Data fim (opcional)"
-- inputs per line but had no proper place to persist them — the values
-- were concatenated into the description as a "(dd/mm/yyyy - dd/mm/yyyy)"
-- suffix. The InvoiceDetail editor had no date inputs at all, so once
-- a fatura was created it became impossible to fix or set a service
-- period without hand-editing the description.
--
-- Two new optional columns let both editors round-trip the same data
-- and let downstream consumers (PDF, list views) render the period in
-- a structured way instead of relying on a parsed-out string.

alter table public.invoice_items
  add column if not exists service_start_date date;

alter table public.invoice_items
  add column if not exists service_end_date date;

comment on column public.invoice_items.service_start_date is
  'Optional start of the service period covered by this line. Used '
  'for display in the PDF / detail page and ignored by accounting '
  'totals. NULL when the line is a one-off or the user did not enter '
  'a period.';

comment on column public.invoice_items.service_end_date is
  'Optional end of the service period covered by this line. Same '
  'semantics as service_start_date. May be NULL while the start is '
  'set (single-day or open-ended period) or vice versa.';

-- Backfill: extract the legacy "(dd/mm/yyyy - dd/mm/yyyy)" suffix
-- that NewInvoice used to append to the description, write the parsed
-- dates into the new columns, and trim the suffix off so the line
-- displays cleanly. Idempotent: only matches rows whose description
-- still ends with the legacy pattern AND whose new date columns are
-- still NULL, so re-running the migration is a no-op.
--
-- The regex tolerates 1- or 2-digit day/month and exactly 4-digit
-- year, with either an em-dash or a hyphen between the two dates.
-- Anything that doesn't match the exact shape is left alone.
update public.invoice_items
   set service_start_date =
         to_date(
           substring(description from
             ' \(([0-9]{1,2}/[0-9]{1,2}/[0-9]{4}) [-–] [0-9]{1,2}/[0-9]{1,2}/[0-9]{4}\)$'),
           'FMDD/FMMM/YYYY'),
       service_end_date =
         to_date(
           substring(description from
             ' \([0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [-–] ([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})\)$'),
           'FMDD/FMMM/YYYY'),
       description = regexp_replace(
         description,
         ' \([0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [-–] [0-9]{1,2}/[0-9]{1,2}/[0-9]{4}\)$',
         '')
 where service_start_date is null
   and service_end_date is null
   and description ~
     ' \([0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [-–] [0-9]{1,2}/[0-9]{1,2}/[0-9]{4}\)$';
