import { getLocale } from 'next-intl/server';
import { Suspense } from 'react';
import { AudienceSplit, HomeHero, InterviewSteps } from '@/features/home';
import { LatestVacancies } from '@/features/vacancies';
import { LATEST_COUNT, LATEST_FILTERS } from '@/features/vacancies/model';
import { fetchVacancyPage } from '@/features/vacancies/server';

export default function HomePage() {
  return (
    <>
      <HomeHero />
      {/* Request-time data streams in after the static hero (Cache Components). */}
      <Suspense>
        <Latest />
      </Suspense>
      <InterviewSteps />
      <AudienceSplit />
    </>
  );
}

async function Latest() {
  const res = await fetchVacancyPage(await getLocale(), LATEST_FILTERS, LATEST_COUNT);
  return <LatestVacancies initial={res.ok ? res.data : null} />;
}
