import { useTranslations } from 'next-intl';
import { FadeIn } from '@/components/motion';
import { SearchForm } from '@/features/search';
import { QuickFilters } from './quick-filters';
import { SampleApplication } from './sample-application';

/** Search first (hh.uz structure, D-016): title → big search → quick filters. */
export function HomeHero() {
  const t = useTranslations('home.hero');

  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 pt-8 pb-10 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-14 lg:pt-16 lg:pb-16">
        {/* Not animated: this is the LCP content. */}
        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="max-w-[20ch] font-display text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mt-4 max-w-prose text-muted sm:text-lg">{t('lead')}</p>
          <SearchForm idPrefix="hero-search" size="lg" className="mt-8" />
          <div className="mt-4">
            <QuickFilters />
          </div>
          <p className="mt-4 text-sm text-muted">{t('scopeNote')}</p>
        </div>
        <FadeIn index={2} className="hidden lg:block lg:pt-2">
          <SampleApplication />
        </FadeIn>
      </div>
    </section>
  );
}
