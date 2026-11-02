'use client';

import { useLocale, useTimeZone } from 'next-intl';

import { fileSize, formatDate } from './format-locale';

export { fileSize, formatDate, formatLocale, relativeDay, type RelativeDay } from './format-locale';

export function useFormat() {
  const locale = useLocale();
  const timeZone = useTimeZone();
  return {
    date: (v: string | Date) => formatDate(v, locale, timeZone),
    dateTime: (v: string | Date) => formatDate(v, locale, timeZone, true),
    fileSize: (bytes: number) => fileSize(bytes, locale),
  };
}
