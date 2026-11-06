'use client';

import { useTranslations } from 'next-intl';
import { recommendationKey } from '@/features/hr-stage1';
import type { HrReport } from '../model';

/** Spec §8 item 4. Hidden when the server sent none (e.g. the interview stopped early). */
export function RecommendationSection({ report }: { report: HrReport }) {
  const t = useTranslations('hrReport.recommendation');
  const key = recommendationKey(report.recommendation);
  if (!key) return null;
  return (
    <section aria-labelledby="rec-h" className="sp-card grid gap-1 p-4 sm:p-5">
      <h2 id="rec-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-2xl font-semibold">{t(key)}</p>
      <p className="max-w-prose text-sm text-muted">{t('aid')}</p>
    </section>
  );
}
