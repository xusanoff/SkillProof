/**
 * ISO 3166-1 alpha-2 codes offered in country pickers (launch region first).
 * Names are NOT stored here: `countryOptions()` asks `Intl.DisplayNames` in the UI locale.
 */
export const COUNTRY_CODES = [
  'UZ',
  'KZ',
  'KG',
  'TJ',
  'TM',
  'AZ',
  'GE',
  'AM',
  'RU',
  'BY',
  'UA',
  'TR',
  'AE',
  'SA',
  'QA',
  'KR',
  'CN',
  'IN',
  'DE',
  'GB',
  'FR',
  'PL',
  'NL',
  'LT',
  'LV',
  'EE',
  'CZ',
  'US',
  'CA',
] as const;

/** The launch country stays first; the rest is sorted by its localized name. */
export function countryOptions(locale: string): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  } catch {
    names = null;
  }
  const collator = new Intl.Collator(locale);
  const [first, ...rest] = COUNTRY_CODES.map((code) => ({
    code,
    name: names?.of(code) ?? code,
  }));
  return [first, ...rest.sort((a, b) => collator.compare(a.name, b.name))];
}

/** Localized country name for a stored code (falls back to the code itself). */
export function countryName(code: string | null | undefined, locale: string): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
