-- Georgia invoice numbering starts at 70 and never reuses a number,
-- including numbers belonging to soft-deleted invoices.
create or replace function public.next_georgia_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_year integer := extract(year from current_date)::integer;
  highest_number integer := 69;
  invoice_row record;
  matched text[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  for invoice_row in
    select invoice_number
    from public.georgia_invoices
    where user_id = auth.uid()
  loop
    matched := regexp_match(invoice_row.invoice_number, '(?:GE)?(?:[0-9]{4})[-/]?([0-9]+)$', 'i');
    if matched is null then
      matched := regexp_match(invoice_row.invoice_number, '([0-9]+)$');
    end if;
    if matched is not null then
      highest_number := greatest(highest_number, matched[1]::integer);
    end if;
  end loop;

  return 'GE' || current_year::text || lpad((highest_number + 1)::text, 3, '0');
end;
$$;

grant execute on function public.next_georgia_invoice_number() to authenticated;
