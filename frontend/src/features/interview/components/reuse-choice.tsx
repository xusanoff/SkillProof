'use client';

import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Notice } from '@/components/common/notice';
import { Switch } from '@/components/ui/switch';
import { useLevelText } from '@/features/verified-skills';
import { useFormat } from '@/lib/format';
import type { ReuseOffer } from '../model';

/**
 * Before Stage 1: which verified skills can be skipped, and the one-time choice (on by default).
 * The server decides what is skipped; this only shows the offer and sends the choice.
 */
export function ReuseChoice({
  offer,
  reuse,
  onChange,
}: {
  offer: ReuseOffer;
  reuse: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTranslations('interview.reuse');
  const f = useFormat();
  const levelText = useLevelText();
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`} className="sp-card grid gap-3 p-4">
      <h2 id={`${id}-h`} className="flex items-center gap-2 text-lg font-semibold">
        <BadgeCheck aria-hidden="true" className="size-5 text-success" />
        {t('title')}
      </h2>
      <p className="max-w-prose text-sm">{t('lead')}</p>
      <ul className="grid gap-1.5">
        {offer.skills.map((s) => (
          <li key={s.skill_id} className="tabular-nums text-sm">
            <span className="font-medium">{s.name}</span>
            {': '}
            {[levelText(s.level), t('score', { score: Math.round(s.score) })]
              .filter(Boolean)
              .join(', ')}
            {', '}
            <span className="text-muted">{t('validUntil', { date: f.date(s.valid_until) })}</span>
          </li>
        ))}
      </ul>
      <p className="tabular-nums text-sm font-medium">
        {t('covers', {
          tasksSkipped: offer.tasks_skipped,
          tasksTotal: offer.tasks_total,
          questionsSkipped: offer.questions_skipped,
          questionsTotal: offer.questions_total,
        })}
      </p>
      <div className="flex items-start gap-3">
        <Switch
          id={id}
          checked={reuse}
          onCheckedChange={onChange}
          aria-describedby={`${id}-hint`}
          className="mt-0.5"
        />
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            {t('toggle')}
          </label>
          <p id={`${id}-hint`} className="text-sm text-muted">
            {reuse ? t('hintOn') : t('hintOff')}
          </p>
        </div>
      </div>
      <Notice tone="warning">{t('final')}</Notice>
    </section>
  );
}
