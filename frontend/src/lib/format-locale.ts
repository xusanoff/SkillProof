/**
 * Pure, server-safe formatting (no hooks). ICU's `uz` data is incomplete
 * (dates render as "2026 M10 30"), so numbers/dates for uz use ru-RU patterns:
 * `30.10.2026, 14:30`, `15 000 000`.
 */
const FORMAT_LOCALE: Record<string, string> = { uz: 'ru-RU' };

export function formatLocale(locale: string): string {
  return FORMAT_LOCALE[locale] ?? locale;
}

export function formatDate(
  value: string | Date,
  locale: string,
  timeZone: string | undefined,
  withTime = false,
): string {
  return new Intl.DateTimeFormat(formatLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    timeZone,
  }).format(new Date(value));
}

/** File size as `{value, unit}`; the unit label comes from i18n (`common.units.*`). */
export function fileSize(bytes: number, locale: string): { value: string; unit: 'kb' | 'mb' } {
  const nf = new Intl.NumberFormat(formatLocale(locale), { maximumFractionDigits: 1 });
  if (bytes < 1024 * 1024)
    return { value: nf.format(Math.max(1, Math.round(bytes / 1024))), unit: 'kb' };
  return { value: nf.format(bytes / 1024 / 1024), unit: 'mb' };
}

/** `YYYY-MM-DD` of an instant in a time zone (calendar day, not 24 h windows). */
function dayKey(value: Date, timeZone: string | undefined): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000;
}

export type RelativeDay =
  { kind: 'today' } | { kind: 'yesterday' } | { kind: 'days'; days: number } | { kind: 'date' };

/**
 * hh-style "published" label: today / yesterday / N days ago (up to `maxDays`), else a date.
 * Calendar days in the display time zone. Future timestamps (clock skew) count as today.
 */
export function relativeDay(
  value: string | Date,
  now: Date,
  timeZone: string | undefined,
  maxDays = 30,
): RelativeDay {
  const diff = dayKey(now, timeZone) - dayKey(new Date(value), timeZone);
  if (diff <= 0) return { kind: 'today' };
  if (diff === 1) return { kind: 'yesterday' };
  if (diff <= maxDays) return { kind: 'days', days: diff };
  return { kind: 'date' };
}
