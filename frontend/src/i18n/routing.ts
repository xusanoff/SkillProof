import { defineRouting } from 'next-intl/routing';

/**
 * Adding a language = add its code here + `messages/<code>.json`. Nothing else.
 * `uz` (Latin) is the default and the fallback for missing keys.
 */
export const routing = defineRouting({
  locales: ['uz', 'ru', 'en'],
  defaultLocale: 'uz',
  localePrefix: 'always',
  // `/` always goes to `/uz` (spec); users switch language explicitly.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
