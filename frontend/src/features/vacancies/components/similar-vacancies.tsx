'use client';

import { useTranslations } from 'next-intl';
import { useVacancyList } from '../api';
import { similarQuery, type VacancyDetail } from '../model';
import { VacancyCard } from './vacancy-card';

const SIMILAR = 6;

/** "O'xshash vakansiyalar": same profession area + region (list API), current one excluded. */
export function SimilarVacancies({ vacancy }: { vacancy: VacancyDetail }) {
  const t = useTranslations('vacancy');
  const list = useVacancyList(similarQuery(vacancy), { pageSize: SIMILAR + 1 });
  const items = (list.data?.items ?? []).filter((v) => v.id !== vacancy.id).slice(0, SIMILAR);
  if (!items.length) return null;
  return (
    <section aria-labelledby="similar-title" className="mt-10 lg:max-w-[calc(100%-22.5rem)]">
      <h2 id="similar-title" className="text-xl font-semibold">
        {t('similarTitle')}
      </h2>
      <ul className="mt-4 grid gap-3">
        {items.map((v) => (
          <li key={v.id}>
            <VacancyCard vacancy={v} headingLevel={3} />
          </li>
        ))}
      </ul>
    </section>
  );
}
