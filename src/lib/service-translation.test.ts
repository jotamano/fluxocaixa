import { describe, expect, it } from 'vitest';
import { getEnglishServiceDescription, getServicesMissingEnglishNames } from './service-translation';

const services = [
  { id: 'basic', name: 'Gestão', name_en: 'Management' },
  { id: 'social', name: 'Gestão de Redes Sociais', name_en: 'Social Media Management' },
  { id: 'seo', name: 'Otimização SEO', name_en: null },
];

describe('getServicesMissingEnglishNames', () => {
  it('uses the saved English name as the translation cache marker', () => {
    expect(getServicesMissingEnglishNames(services).map((service) => service.id)).toEqual(['seo']);
  });
});

describe('getEnglishServiceDescription', () => {
  it('uses the linked service and preserves the invoice period suffix', () => {
    expect(
      getEnglishServiceDescription('Gestão de Redes Sociais — Setembro 2026', 'social', services),
    ).toBe('Social Media Management — September 2026');
  });

  it('uses the longest matching service name for legacy invoice lines', () => {
    expect(
      getEnglishServiceDescription('Gestão de Redes Sociais — Setembro 2026', null, services),
    ).toBe('Social Media Management — September 2026');
  });

  it('does not guess an English version for unrelated free text', () => {
    expect(
      getEnglishServiceDescription('Consultoria estratégica personalizada', 'social', services),
    ).toBe('');
  });
});
