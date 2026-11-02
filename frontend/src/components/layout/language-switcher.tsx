'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Switches the UI locale and keeps the current path (and query string).
 * Plain links instead of a dropdown: works without JS, one tap on phones,
 * and keeps Radix popper code out of the public pages' bundle.
 */
export function LanguageSwitcher() {
  return (
    // Fallback without the current path: dynamic routes resolve the path only at request time.
    <Suspense fallback={<LocaleLinks pathname="/" query="" />}>
      <LocaleLinksWithQuery />
    </Suspense>
  );
}

function LocaleLinksWithQuery() {
  return <LocaleLinks pathname={usePathname()} query={useSearchParams().toString()} />;
}

function LocaleLinks({ pathname, query }: { pathname: string; query: string }) {
  const t = useTranslations('locale');
  const current = useLocale();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <nav aria-label={t('label')}>
      <ul className="flex items-center rounded-lg border border-border p-0.5">
        {routing.locales.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href={href}
                locale={locale}
                lang={locale}
                hrefLang={locale}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-medium uppercase transition-colors',
                  active ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                )}
              >
                {locale}
                <span className="sr-only"> {t(`names.${locale}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
