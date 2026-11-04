'use client';

import { useTranslations } from 'next-intl';
import { SuspicionBadge } from '@/components/common/suspicion-badge';
import { evidenceValues, isKnownSignal, mmss, suspicionLevel } from '@/features/hr-stage1';
import { isStage2Signal, stage2EvidenceValues, type HrReport, type TimelineSignal } from '../model';

type SignalLike = Pick<TimelineSignal, 'stage' | 'type' | 'severity' | 'at_ms' | 'evidence'>;

/** One signal as a sentence: Stage 2 types from `hrReport.signals`, shared and Stage 1 ones from `hrStage1.signals`. */
function SignalText({ signal }: { signal: SignalLike }) {
  const t1 = useTranslations('hrStage1.signals');
  const t2 = useTranslations('hrReport.signals');
  const { type, evidence } = signal;
  if (isStage2Signal(type)) return <>{t2(type, stage2EvidenceValues(evidence))}</>;
  if (isKnownSignal(type)) return <>{t1(type, evidenceValues(evidence))}</>;
  return <>{t1('unknown', { type })}</>;
}

function SignalMeta({ signal }: { signal: SignalLike }) {
  const t = useTranslations('hrStage1.suspicion');
  const ts = useTranslations('hrReport.stage');
  const stage = signal.stage === 'stage1' || signal.stage === 'stage2' ? signal.stage : null;
  return (
    <>
      {mmss(signal.at_ms) ? (
        <span className="font-mono text-sm text-muted tabular-nums">{mmss(signal.at_ms)}</span>
      ) : null}
      {stage ? <span className="text-sm text-muted">{ts(stage)}</span> : null}
      <SignalText signal={signal} />
      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
        {t(`severity.${signal.severity as 'low'}`)}
      </span>
    </>
  );
}

/** Spec §8 item 1: suspicion % with label, the main reasons (time and stage) and the full timeline. */
export function SuspicionSection({ report }: { report: HrReport }) {
  const t = useTranslations('hrStage1.suspicion');
  const level = suspicionLevel(report.suspicion_label);

  return (
    <section
      aria-labelledby="susp-h"
      className="grid gap-3 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="susp-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {report.suspicion_percent == null ? (
        <p className="text-muted">{report.state === 'done' ? t('none') : t('notYet')}</p>
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
                <SignalMeta signal={r} />
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
          <ul className="mt-1 grid gap-1.5 text-sm">
            {report.signals.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                <SignalMeta signal={s} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
