'use client';

import { useTranslations } from 'next-intl';
import { SuspicionBadge } from '@/components/common/suspicion-badge';
import { evidenceValues, isKnownSignal, mmss, suspicionLevel, type Stage1Report } from '../model';

function signalText(
  t: ReturnType<typeof useTranslations<'hrStage1.signals'>>,
  type: string,
  evidence: Record<string, unknown>,
) {
  return isKnownSignal(type) ? t(type, evidenceValues(evidence)) : t('unknown', { type });
}

/** Spec §8 item 1: suspicion % with label and the main reasons, each with its time. */
export function SuspicionSection({ report }: { report: Stage1Report }) {
  const t = useTranslations('hrStage1.suspicion');
  const ts = useTranslations('hrStage1.signals');
  const level = suspicionLevel(report.suspicion_label);
  const pending = report.evaluation_state !== 'done' && report.suspicion_percent == null;

  return (
    <section
      aria-labelledby="susp-h"
      className="grid gap-3 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="susp-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {report.suspicion_percent == null ? (
        <p className="text-muted">{pending ? t('notYet') : t('none')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-4xl font-semibold tabular-nums">
            {Math.round(report.suspicion_percent)}
            <span className="text-2xl">%</span>
          </p>
          {level ? <SuspicionBadge level={level} label={t(`level.${level}`)} /> : null}
        </div>
      )}
      <p className="max-w-prose text-sm text-muted">{t('rankingAid')}</p>

      {report.reasons.length ? (
        <div>
          <h3 className="text-sm font-semibold">{t('reasons')}</h3>
          <ul className="mt-1 grid gap-1.5">
            {report.reasons.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                {mmss(r.at_ms) ? (
                  <span className="font-mono text-sm text-muted tabular-nums">{mmss(r.at_ms)}</span>
                ) : null}
                <span>{signalText(ts, r.type, r.evidence)}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                  {t(`severity.${r.severity as 'low'}`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : report.suspicion_percent != null ? (
        <p className="text-sm text-muted">{t('noReasons')}</p>
      ) : null}

      {report.signals.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {t('allSignals', { count: report.signals.length })}
          </summary>
          <ul className="mt-1 grid gap-1 text-sm">
            {report.signals.map((s) => (
              <li key={s.id}>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                  {t(`severity.${s.severity as 'low'}`)}
                </span>{' '}
                {signalText(ts, s.type, s.evidence)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
