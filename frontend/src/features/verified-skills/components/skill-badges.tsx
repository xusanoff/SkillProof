'use client';

import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/format';
import { cn } from '@/lib/utils';
import { levelKey, type SkillBadgeData } from '../model';

/** Level word ("Advanced"); an unknown level is simply not shown. */
export function useLevelText() {
  const t = useTranslations('verifiedSkills.level');
  return (level: string) => {
    const k = levelKey(level);
    return k ? t(k) : '';
  };
}

/** Verified skills as a plain list: name, level, score and valid-until. Colour is never the only signal. */
export function SkillBadges({
  skills,
  compact,
  className,
}: {
  skills: SkillBadgeData[];
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('verifiedSkills');
  const f = useFormat();
  const levelText = useLevelText();
  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {skills.map((s) => (
        <li
          key={s.skill_id}
          className="grid gap-0.5 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <BadgeCheck aria-hidden="true" className="size-4 text-success" />
            {s.name}
          </span>
          <span className="tabular-nums text-sm">
            {[levelText(s.level), t('score', { score: Math.round(s.score) })]
              .filter(Boolean)
              .join(', ')}
          </span>
          {compact ? null : (
            <span className="tabular-nums text-xs text-muted">
              {t('validUntil', { date: f.date(s.valid_until) })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
