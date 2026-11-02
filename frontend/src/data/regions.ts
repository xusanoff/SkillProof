import type { Locale } from '@/i18n/routing';

/**
 * Search regions (D-021). Uzbekistan's regions by ISO 3166-2 code, with names per UI locale.
 * Phase 2: replaced by `GET /api/v1/regions` behind the same `Region` shape.
 */
export interface Region {
  code: string;
  names: Record<Locale, string>;
}

export const REGIONS: readonly Region[] = [
  { code: 'UZ-TK', names: { uz: 'Toshkent shahri', ru: 'Ташкент', en: 'Tashkent city' } },
  {
    code: 'UZ-TO',
    names: { uz: 'Toshkent viloyati', ru: 'Ташкентская область', en: 'Tashkent region' },
  },
  { code: 'UZ-SA', names: { uz: 'Samarqand', ru: 'Самарканд', en: 'Samarkand' } },
  { code: 'UZ-BU', names: { uz: 'Buxoro', ru: 'Бухара', en: 'Bukhara' } },
  { code: 'UZ-AN', names: { uz: 'Andijon', ru: 'Андижан', en: 'Andijan' } },
  { code: 'UZ-FA', names: { uz: "Farg'ona", ru: 'Фергана', en: 'Fergana' } },
  { code: 'UZ-NG', names: { uz: 'Namangan', ru: 'Наманган', en: 'Namangan' } },
  { code: 'UZ-QA', names: { uz: 'Qashqadaryo', ru: 'Кашкадарья', en: 'Kashkadarya' } },
  { code: 'UZ-SU', names: { uz: 'Surxondaryo', ru: 'Сурхандарья', en: 'Surkhandarya' } },
  { code: 'UZ-JI', names: { uz: 'Jizzax', ru: 'Джизак', en: 'Jizzakh' } },
  { code: 'UZ-SI', names: { uz: 'Sirdaryo', ru: 'Сырдарья', en: 'Syrdarya' } },
  { code: 'UZ-NW', names: { uz: 'Navoiy', ru: 'Навои', en: 'Navoi' } },
  { code: 'UZ-XO', names: { uz: 'Xorazm', ru: 'Хорезм', en: 'Khorezm' } },
  { code: 'UZ-QR', names: { uz: "Qoraqalpog'iston", ru: 'Каракалпакстан', en: 'Karakalpakstan' } },
];

export function regionName(code: string | null | undefined, locale: Locale): string | null {
  if (!code) return null;
  return REGIONS.find((r) => r.code === code)?.names[locale] ?? null;
}
