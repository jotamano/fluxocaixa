import { describe, expect, it } from 'vitest';
import { getNextGeorgiaInvoiceNumber } from './georgia';

describe('getNextGeorgiaInvoiceNumber', () => {
  it('starts the sequence at 70', () => {
    expect(getNextGeorgiaInvoiceNumber([], 2026)).toBe('GE2026070');
  });

  it('increments the highest existing sequence by one', () => {
    expect(getNextGeorgiaInvoiceNumber(['GE2026070', 'GE2026071'], 2026)).toBe('GE2026072');
  });

  it('does not reuse a number from a previous prefix', () => {
    expect(getNextGeorgiaInvoiceNumber(['GE2025001', 'GE2026070'], 2026)).toBe('GE2026071');
  });
});
