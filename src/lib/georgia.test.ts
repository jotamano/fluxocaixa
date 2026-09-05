import { describe, expect, it } from 'vitest';
import { formatGeorgiaClientTaxId, getGeorgiaInvoiceVersion, getNextGeorgiaInvoiceNumber } from './georgia';

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

describe('Georgia invoice client formatting', () => {
  it('adds the Portuguese prefix to a Portuguese client tax id', () => {
    expect(formatGeorgiaClientTaxId('506562395', 'Portugal')).toBe('PT506562395');
    expect(formatGeorgiaClientTaxId('PT506562395', 'Portugal')).toBe('PT506562395');
  });

  it('uses the Portuguese version label for Portugal and PT for other countries', () => {
    expect(getGeorgiaInvoiceVersion('Portugal')).toBe('Versão portuguesa');
    expect(getGeorgiaInvoiceVersion('Georgia')).toBe('PT');
  });
});
