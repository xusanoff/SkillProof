import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import { appConfig } from '@/config/app';
import { loadMessages } from './messages';
import { routing } from './routing';

export default getRequestConfig(async ({ locale: override }) => {
  // `next/root-params` keeps pages statically renderable with Cache Components
  // (no headers() read, no setRequestLocale() in every page).
  const candidate = override ?? (await rootLocale());
  const locale = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: appConfig.defaultTimeZone,
  };
});
