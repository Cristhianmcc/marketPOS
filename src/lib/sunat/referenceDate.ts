const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SunatReferenceDateRange {
  referenceDate: Date;
  dayStart: Date;
  dayEnd: Date;
}

/**
 * Interpreta YYYY-MM-DD como fecha civil de Peru (UTC-05:00).
 *
 * `new Date('YYYY-MM-DD')` representa medianoche UTC y, al convertirla a la
 * zona horaria de Peru, cae en el dia anterior. Los resumenes y comunicaciones
 * SUNAT deben filtrar usando el dia civil elegido por el usuario.
 */
export function parseSunatReferenceDate(value: unknown): SunatReferenceDateRange | null {
  if (typeof value !== 'string') return null;

  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > 9999 || month < 1 || month > 12) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;

  // Medianoche en Peru equivale a las 05:00 UTC durante todo el ano.
  const startMs = Date.UTC(year, month - 1, day) + PERU_UTC_OFFSET_MS;

  return {
    referenceDate: new Date(startMs),
    dayStart: new Date(startMs),
    dayEnd: new Date(startMs + DAY_MS - 1),
  };
}
