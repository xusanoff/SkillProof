import { useTranslations } from 'next-intl';
import { FadeIn } from '@/components/motion';
import { SearchForm } from '@/features/search';
import { QuickFilters } from './quick-filters';
import { SampleApplication } from './sample-application';

/** Search first (hh.uz structure, D-016): title → big search → quick filters. */
export function HomeHero() {
  const t = useTranslations('home.hero');

  return (
    <section className="bg-bg">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 pt-8 pb-10 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14 lg:pt-[72px] lg:pb-16">
        {/* Not animated: this is the LCP content. */}
        <div className="flex min-w-0 flex-col justify-center">
          <h1 className="sp-page-title max-w-[18ch] text-[40px] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance sm:text-6xl xl:text-[68px]">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-prose leading-relaxed text-muted sm:text-lg">{t('lead')}</p>
          <SearchForm idPrefix="hero-search" size="lg" className="sp-card mt-7 p-2" />
          <div className="mt-4">
            <QuickFilters />
          </div>
          <p className="mt-4 text-sm text-muted">{t('scopeNote')}</p>
        </div>
        <FadeIn index={2} className="min-w-0 pr-3 pb-3 lg:pt-2">
          <SampleApplication />
        </FadeIn>
      </div>
    </section>
  );
}
