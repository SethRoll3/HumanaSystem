/**
 * Guatemala timezone helpers.
 * Guatemala is UTC-6 with no daylight saving time.
 */

const GT_OFFSET_HOURS = -6;

export const GT_TZ_OFFSET_MINUTES = GT_OFFSET_HOURS * 60;

/** Parse a 'YYYY-MM-DD' string as Guatemala midnight and return the UTC ms. */
export const gtDateToMs = (dateStr: string, endOfDay = false): number => {
  if (!dateStr) return 0;
  const parts = dateStr.split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return 0;
  if (endOfDay) {
    return Date.UTC(y, m - 1, d, 29, 59, 59, 999);
  }
  return Date.UTC(y, m - 1, d, 6, 0, 0, 0);
};

/** Convert a UTC ms timestamp back to a 'YYYY-MM-DD' string in Guatemala time. */
export const msToGtDateStr = (ms: number): string => {
  if (!ms) return '';
  // Use Intl to format the date in Guatemala timezone, then reformat to YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
