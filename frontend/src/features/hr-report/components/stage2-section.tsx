'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { percentText } from '@/features/hr-stage1';
import { activeFlags, audioUrl, isKnownFlag, type HrStage2, type HrTurn } from '../model';

function Turn({
  turn,
  companyId,
  applicationId,
}: {
  turn: HrTurn;
  companyId: string;
  applicationId: string;
}) {
  const t = useTranslations('hrReport.stage2');
  const flags = activeFlags(turn.flags);
  const headingId = `turn-${turn.id}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="grid gap-3 rounded-lg border border-border p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id={headingId} className="font-semibold">
            {t('question', { n: turn.order })}
            {turn.is_follow_up ? (
              <span className="ml-2 text-sm text-muted">{t('followUp')}</span>
            ) : null}
          </h3>
          <p className="text-xl font-semibold tabular-nums">
            <span className="sr-only">{t('percent')}: </span>
            {percentText(turn.percent)}
          </p>
        </div>
        <p className="max-w-prose font-medium">{turn.question_text}</p>

        <div>
          <p className="text-sm text-muted">{t('transcript')}</p>
          {turn.transcript ? (
            <p className="mt-0.5 max-w-prose whitespace-pre-line">{turn.transcript}</p>
          ) : (
            <p className="mt-0.5 text-muted">{t('noAnswer')}</p>
          )}
        </div>

        {turn.has_answer_audio ? (
          <div className="grid gap-1">
            <p className="text-sm text-muted" id={`audio-${turn.id}`}>
              {t('audio')}
            </p>
            <audio
              controls
              preload="none"
              aria-labelledby={`audio-${turn.id}`}
              src={audioUrl(companyId, applicationId, turn.id)}
              className="w-full max-w-md"
            />
          </div>
        ) : null}

        {turn.criteria.length ? (
          <div>
            <p className="text-sm font-medium">{t('criteria')}</p>
            <ul className="mt-1 grid gap-2">
              {turn.criteria.map((c) => (
                <li key={c.key} className="grid gap-1 text-sm">
                  <p>
                    <span className="font-medium">{c.key}</span>{' '}
                    <span className="tabular-nums">{percentText(c.score)}</span>
                    {c.rationale ? <span className="text-muted"> — {c.rationale}</span> : null}
                  </p>
                  {c.quote ? (
                    <blockquote className="border-l-2 border-border-strong pl-3 italic">
                      {c.quote}
                    </blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {flags.length ? (
          <ul aria-label={t('flags')} className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <li key={f} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                {isKnownFlag(f) ? t(`flag.${f}`) : f}
              </li>
            ))}
          </ul>
        ) : null}
        {turn.needs_review ? (
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TriangleAlert aria-hidden="true" className="size-4 text-warning" />
            {t('needsReview')}
          </p>
        ) : null}
      </article>
    </li>
  );
}

/** Spec §8 item 6: per turn the question, transcript, audio, percent, criteria with quotes, flags. */
export function Stage2Section({
  stage2,
  companyId,
  applicationId,
}: {
  stage2: HrStage2;
  companyId: string;
  applicationId: string;
}) {
  const t = useTranslations('hrReport.stage2');
  return (
    <section
      aria-labelledby="s2-h"
      className="grid gap-3 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="s2-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {stage2.pass_threshold != null ? (
        <p className="text-sm text-muted tabular-nums">
          {t('threshold', { value: stage2.pass_threshold })}
          {stage2.passed == null ? '' : ` · ${stage2.passed ? t('passed') : t('notPassed')}`}
        </p>
      ) : null}
      {stage2.turns.length ? (
        <ol className="grid gap-3">
          {stage2.turns.map((turn) => (
            <Turn key={turn.id} turn={turn} companyId={companyId} applicationId={applicationId} />
          ))}
        </ol>
      ) : (
        <p className="text-muted">{t('noTurns')}</p>
      )}
    </section>
  );
}
