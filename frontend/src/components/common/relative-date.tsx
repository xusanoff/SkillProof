'use client';

import { useLocale, useNow, useTimeZone, useTranslations } from 'next-intl';
import { formatDate, relativeDay } from '@/lib/format-locale';

/** "Bugun" / "Kecha" / "3 kun oldin" / a date; the full date stays in `<time dateTime>`. */
export function RelativeDate({ value, className }: { value: string; className?: string }) {
  const t = useTranslations('relative');
  const locale = useLocale();
  const timeZone = useTimeZone();
  // Re-evaluated once per minute is plenty for day granularity.
  const now = useNow({ updateInterval: 60_000 });
  const rel = relativeDay(value, now, timeZone);
  const date = formatDate(value, locale, timeZone);
  const text =
    rel.kind === 'today'
      ? t('today')
      : rel.kind === 'yesterday'
        ? t('yesterday')
        : rel.kind === 'days'
          ? t('daysAgo', { count: rel.days })
          : date;
  return (
    <time dateTime={value} title={date} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
