import { describe, expect, it } from 'vitest';
import { summarizeInvoices } from './stats';
import type { Invoice, Payment } from '@/hooks/use-data';

const invoice = {
  id: 'invoice-1',
  status: 'partially_paid',
  invoice_items: [{ quantity: 1, unit_price: 1000 }],
} as unknown as Invoice;

const payment = {
  id: 'payment-1',
  invoice_id: 'invoice-1',
  amount: 400,
} as unknown as Payment;

describe('summarizeInvoices', () => {
  it('counts only the outstanding balance for partially paid invoices', () => {
    const summary = summarizeInvoices([invoice], [payment]);

    expect(summary.pendingGross).toBe(600);
    expect(summary.partiallyPaidGross).toBe(600);
    expect(summary.partiallyPaidCount).toBe(1);
    expect(summary.totalGross).toBe(1000);
  });

  it('keeps a fully pending invoice at its full amount', () => {
    const pending = { ...invoice, id: 'invoice-2', status: 'pending' } as unknown as Invoice;

    expect(summarizeInvoices([pending]).pendingGross).toBe(1000);
  });
});
