'use client';

import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { disqualificationKey, percentText } from '@/features/hr-stage1';
import { useFormat } from '@/lib/format';
import { isDisqualified, type HrReport } from '../model';

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-border p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`${big ? 'text-3xl' : 'text-2xl'} font-semibold tabular-nums`}>{value}</dd>
    </div>
  );
}

/** Spec §8 item 2: overall, Stage 1, Stage 2 and per-skill %. A missing score is a dash, never 0. */
export function ScoresSection({ report }: { report: HrReport }) {
  const t = useTranslations('hrReport.scores');
  const f = useFormat();
  const reason = isDisqualified(report)
    ? disqualificationKey(report.disqualification_reason)
    : null;
  return (
    <section
      aria-labelledby="scores-h"
      className="grid gap-3 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="scores-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {reason ? (
        <Notice tone="danger" role="alert" title={t('disqualifiedTitle')}>
          {t(`disqualified.${reason}`)}
        </Notice>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat big label={t('overall')} value={percentText(report.overall_score)} />
        <Stat label={t('stage1')} value={percentText(report.stage1_score)} />
        <Stat label={t('stage2')} value={percentText(report.stage2_score)} />
      </dl>
      {report.overall_score == null && report.state === 'done' ? (
        <p className="text-sm text-muted">{t('noOverall')}</p>
      ) : null}

      {report.reused_skills.length ? (
        <Notice tone="info" title={t('reusedTitle')}>
          <ul className="grid gap-1">
            {report.reused_skills.map((r) => (
              <li key={`${r.skill_id}-${r.stage}`} className="tabular-nums">
                {t('reusedLine', {
                  name: r.name,
                  stage: t(r.stage === 'stage2' ? 'stage2' : 'stage1'),
                  percent: percentText(r.percent),
                  verified: f.date(r.verified_at),
                  until: f.date(r.valid_until),
                })}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold">{t('perSkill')}</h3>
        {report.per_skill.length ? (
          <ul className="mt-2 grid gap-3">
            {report.per_skill.map((s) => (
              <li key={s.skill_id} className="grid gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">
                    {s.name}
                    {s.reused.length ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium">
                        <BadgeCheck aria-hidden="true" className="size-3.5" />
                        {t('reusedBadge', {
                          stages: s.reused
                            .map((x) => t(x === 'stage2' ? 'stage2' : 'stage1'))
                            .join(', '),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm text-muted tabular-nums">
                    {t('skillDetail', {
                      stage1: percentText(s.stage1_percent),
                      stage2: percentText(s.stage2_percent),
                    })}
                  </span>
                  <span className="font-semibold tabular-nums">{percentText(s.percent)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min(100, Math.max(0, s.percent))}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">{t('noSkills')}</p>
        )}
      </div>
    </section>
  );
}
