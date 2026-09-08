export interface ServiceNameTranslation {
  id: string;
  name: string;
  name_en?: string | null;
}

const PORTUGUESE_MONTHS_ENGLISH: Record<string, string> = {
  janeiro: 'January',
  fevereiro: 'February',
  março: 'March',
  abril: 'April',
  maio: 'May',
  junho: 'June',
  julho: 'July',
  agosto: 'August',
  setembro: 'September',
  outubro: 'October',
  novembro: 'November',
  dezembro: 'December',
};

function translatePortugueseMonths(value: string): string {
  return value.replace(
    /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi,
    (month) => PORTUGUESE_MONTHS_ENGLISH[month.toLocaleLowerCase('pt-PT')] ?? month,
  );
}

/**
 * Returns the service templates that still need an English name. A saved,
 * non-empty name_en is the cache marker: those services are never sent to the
 * AI again unless a user clears that field and explicitly starts translation.
 */
export function getServicesMissingEnglishNames<T extends ServiceNameTranslation>(services: T[]): T[] {
  return services.filter((service) => service.name.trim() && !service.name_en?.trim());
}

function replaceServiceName(description: string, service: ServiceNameTranslation): string {
  const sourceName = service.name.trim();
  const englishName = service.name_en?.trim();
  const sourceDescription = description.trim();

  if (!sourceName || !englishName || !sourceDescription) return '';

  const lowerDescription = sourceDescription.toLocaleLowerCase('pt-PT');
  const lowerServiceName = sourceName.toLocaleLowerCase('pt-PT');
  if (!lowerDescription.startsWith(lowerServiceName)) return '';

  const suffix = sourceDescription.slice(sourceName.length);
  // A prefix must be a complete service name. This prevents a service named
  // "Gestão" from matching an unrelated description such as "Gestões fiscais".
  if (suffix && !/^[\s—–\-(]/.test(suffix)) return '';

  return `${englishName}${translatePortugueseMonths(suffix)}`;
}

/**
 * Derives the English line description for an imported Georgia invoice.
 *
 * First, it uses the persisted invoice-item → service link. Older invoices
 * without that link are handled conservatively by matching the longest known
 * Portuguese service name at the start of the description. Recurring-month
 * suffixes are localized to English and date-only suffixes are retained. An
 * unrecognised free-text line is deliberately returned as empty so the English
 * PDF falls back to the original text rather than risking an incorrect translation.
 */
export function getEnglishServiceDescription(
  description: string,
  serviceId: string | null | undefined,
  services: ServiceNameTranslation[],
): string {
  const linkedService = serviceId ? services.find((service) => service.id === serviceId) : undefined;
  if (linkedService) return replaceServiceName(description, linkedService);

  const candidates = services
    .filter((service) => service.name_en?.trim())
    .sort((a, b) => b.name.trim().length - a.name.trim().length);

  for (const service of candidates) {
    const translatedDescription = replaceServiceName(description, service);
    if (translatedDescription) return translatedDescription;
  }

  return '';
}
