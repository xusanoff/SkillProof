'use client';

import { useTranslations } from 'next-intl';
import { recommendationKey } from '@/features/hr-stage1';
import { useFormat } from '@/lib/format';
import { scoreOrRaw, type OverrideEntry } from '../model';

const FIELDS = [
  'stage1_score',
  'stage2_score',
  'overall_score',
  'recommendation',
  'disqualification',
] as const;

/** Old → new, the comment, who and when. Newest first, as the server sends it. */
export function OverrideHistory({ items }: { items: OverrideEntry[] }) {
  const t = useTranslations('hrReport.history');
  const tr = useTranslations('hrReport.recommendation');
  const tf = useTranslations('hrReport.override.fields');
  const format = useFormat();

  const show = (field: string, value: string | null): string => {
    if (value === null) return field === 'disqualification' ? t('lifted') : t('none');
    if (field === 'recommendation') {
      const key = recommendationKey(value);
      return key ? tr(key) : value;
    }
    if (field === 'disqualification') return t('disqualified');
    return scoreOrRaw(field, value) ?? t('none');
  };

  return (
    <section aria-labelledby="hist-h" className="grid gap-2">
      <h3 id="hist-h" className="font-semibold">
        {t('title')}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((o) => {
            const known = (FIELDS as readonly string[]).includes(o.field);
            return (
              <li key={o.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">
                  {known ? tf(o.field as (typeof FIELDS)[number]) : o.field}:{' '}
                  <span className="tabular-nums">
                    {show(o.field, o.old_value)} → {show(o.field, o.new_value)}
                  </span>
                </p>
                <p className="mt-1 max-w-prose whitespace-pre-line">{o.comment}</p>
                <p className="mt-1 text-xs text-muted">
                  {o.actor_name ?? t('unknownActor')} ·{' '}
                  <time dateTime={o.created_at}>{format.dateTime(o.created_at)}</time>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
