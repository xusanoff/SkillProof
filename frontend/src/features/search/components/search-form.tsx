'use client';

import { MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { localizedName, useRegions } from '@/features/catalog';
import { getPathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { SuggestSource } from '../suggest';
import { SuggestInput } from './suggest-input';

interface SearchFormProps {
  /** `lg` = home hero; `md` = header. */
  size?: 'md' | 'lg';
  /** Unique per page (the header and hero forms can coexist on some routes). */
  idPrefix: string;
  source?: SuggestSource;
  className?: string;
}

/**
 * GET form to `/<locale>/vacancies?q=&region=` — works without JS (D-016).
 * Initial values come from the URL so the list page keeps the user's query.
 */
export function SearchForm(props: SearchFormProps) {
  return (
    <Suspense fallback={<SearchFormInner {...props} initialQ="" initialRegion="" />}>
      <SearchFormFromUrl {...props} />
    </Suspense>
  );
}

function SearchFormFromUrl(props: SearchFormProps) {
  const params = useSearchParams();
  return (
    <SearchFormInner
      {...props}
      // Re-sync when the list page changes the query in the URL.
      key={`${params.get('q') ?? ''}|${params.get('region') ?? ''}`}
      initialQ={params.get('q') ?? ''}
      initialRegion={params.get('region') ?? ''}
    />
  );
}

function SearchFormInner({
  size = 'md',
  idPrefix,
  source,
  className,
  initialQ,
  initialRegion,
}: SearchFormProps & { initialQ: string; initialRegion: string }) {
  const t = useTranslations('search');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { regions } = useRegions();
  const formRef = useRef<HTMLFormElement>(null);
  const [q, setQ] = useState(initialQ);
  const lg = size === 'lg';

  return (
    <form
      ref={formRef}
      role="search"
      aria-label={t('label')}
      action={getPathname({ href: '/vacancies', locale })}
      method="get"
      className={cn(
        'grid gap-2',
        lg
          ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] [&>button]:sm:col-span-2'
          : 'grid-cols-[minmax(0,1fr)_11rem_auto]',
        className,
      )}
    >
      <label htmlFor={`${idPrefix}-q`} className="sr-only">
        {t('queryLabel')}
      </label>
      <SuggestInput
        id={`${idPrefix}-q`}
        name="q"
        size={size}
        value={q}
        onValueChange={setQ}
        onPick={(s) => {
          // A company goes to its page; a vacancy title or skill becomes the query.
          if (s.kind === 'company' && s.slug) router.push(`/companies/${s.slug}`);
          else queueMicrotask(() => formRef.current?.requestSubmit());
        }}
        placeholder={t('placeholder')}
        source={source}
      />
      <label htmlFor={`${idPrefix}-region`} className="sr-only">
        {t('regionLabel')}
      </label>
      <div className="relative">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <select
          id={`${idPrefix}-region`}
          name="region"
          defaultValue={initialRegion}
          className={cn(
            'w-full appearance-none truncate rounded-lg border border-input bg-surface pr-3 pl-9 text-base text-fg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
            lg ? 'h-13' : 'h-11',
          )}
        >
          <option value="">{t('anyRegion')}</option>
          {regions.map((r) => (
            <option key={r.code} value={r.code}>
              {localizedName(r.names, locale, r.code)}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="submit"
        size="lg"
        className={cn('px-5 text-base', lg ? 'h-13 sm:px-7' : 'h-11')}
      >
        {t('submit')}
      </Button>
    </form>
  );
}
