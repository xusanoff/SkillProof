import { formatLocale } from './format-locale';

/**
 * Salary text (i18n skill §5). Amounts are integers from the API; grouping uses the
 * locale's pattern (`uz` → ru-RU: "15 000 000"); words and the currency unit come from
 * messages (`salary.*`, `salary.unit.*`), so the order follows each language.
 */
export type SalaryKind = 'range' | 'exact' | 'from' | 'upTo' | 'none';

export function salaryKind(
  min: number | null | undefined,
  max: number | null | undefined,
): SalaryKind {
  const hasMin = typeof min === 'number';
  const hasMax = typeof max === 'number';
  if (hasMin && hasMax) return min === max ? 'exact' : 'range';
  if (hasMin) return 'from';
  if (hasMax) return 'upTo';
  return 'none';
}

export function formatAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(formatLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

/** Minimal translator shape (next-intl `t` scoped to `salary`). */
export interface SalaryTranslator {
  (key: string, values?: Record<string, string>): string;
  has(key: string): boolean;
}

export function currencyUnit(currency: string, t: SalaryTranslator): string {
  const key = `unit.${currency}`;
  return t.has(key) ? t(key) : currency;
}

export function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string,
  locale: string,
  t: SalaryTranslator,
): string {
  const kind = salaryKind(min, max);
  if (kind === 'none') return t('none');
  const unit = currencyUnit(currency, t);
  const values: Record<string, string> = { currency: unit };
  if (typeof min === 'number') values.min = formatAmount(min, locale);
  if (typeof max === 'number') values.max = formatAmount(max, locale);
  return t(kind, values);
}
