import { getTranslations, getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { AudienceSplit, HomeHero, InterviewSteps } from '@/features/home';
import { LatestVacancies } from '@/features/vacancies';
import { LATEST_COUNT, LATEST_FILTERS } from '@/features/vacancies/model';
import { fetchVacancyPage } from '@/features/vacancies/server';

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <InterviewSteps />
      <AudienceSplit />
      <Suspense>
        <Latest />
      </Suspense>
      <Principle />
    </>
  );
}

async function Latest() {
  const res = await fetchVacancyPage(await getLocale(), LATEST_FILTERS, LATEST_COUNT);
  return <LatestVacancies initial={res.ok ? res.data : null} />;
}

async function Principle() {
  const t = await getTranslations('home');
  return (
    <section className="bg-signal text-signal-ink">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
        <p className="max-w-4xl text-2xl leading-tight font-bold tracking-tight sm:text-4xl">
          {t('principle')}
        </p>
      </div>
    </section>
  );
}
