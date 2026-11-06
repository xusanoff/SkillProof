'use client';

import { ArrowLeft, BadgeCheck, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScoreRing } from '@/components/common/design';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { useCandidateResults } from '../api';
import {
  feedbackMissing,
  fromVerifiedSkills,
  isDisqualifiedResult,
  percentText,
  reasonKey,
  type CandidateResults,
} from '../model';

/** "Mening natijalarim": scores, tasks, answers, mistakes and what to learn next. Polite; never shows suspicion. */
export function CandidateResultsPage({ applicationId }: { applicationId: string }) {
  const t = useTranslations('candidateResults');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useCandidateResults(applicationId);

  const back = (
    <Link
      href="/candidate/applications"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-fg"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {t('back')}
    </Link>
  );

  if (query.isError && !query.data) {
    return (
      <div className="grid gap-3">
        {back}
        <ErrorState
          headingLevel={1}
          title={errorText(query.error)}
          onRetry={() => query.refetch()}
          retryLabel={tc('retry')}
        />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-4" aria-hidden="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  const r = query.data;

  return (
    <div className="grid gap-5">
      <div>
        {back}
        <h1 className="sp-page-title mt-1">{t('title')}</h1>
        <p className="text-sm text-muted">{r.vacancy_title}</p>
      </div>
      <Body results={r} />
    </div>
  );
}

function Body({ results: r }: { results: CandidateResults }) {
  const t = useTranslations('candidateResults');
  const disqualified = isDisqualifiedResult(r);
  const reason = reasonKey(r.disqualification_reason);

  return (
    <>
      {disqualified ? (
        <Notice tone="warning" role="status" title={t('disqualified.title')}>
          {t(`disqualified.${reason ?? 'other'}`)}
        </Notice>
      ) : null}

      {r.state === 'not_ready' ? (
        <EmptyState title={t('notReady.title')} description={t('notReady.body')}>
          <Link href="/candidate/applications" className="font-medium text-accent hover:underline">
            {t('back')}
          </Link>
        </EmptyState>
      ) : null}
      {r.state === 'pending' ? (
        <Notice tone="info" role="status" title={t('pending.title')}>
          <span className="flex items-center gap-2">
            <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
            {t('pending.body')}
          </span>
        </Notice>
      ) : null}
      {r.state === 'failed' ? (
        <Notice tone="warning" role="status" title={t('failed.title')}>
          {t('failed.body')}
        </Notice>
      ) : null}

      {r.state === 'done' ? <Scores results={r} /> : null}
      {fromVerifiedSkills(r) ? (
        <Notice tone="info" role="status" title={t('verified.title')}>
          {t('verified.body')}
        </Notice>
      ) : null}
      {r.state === 'done' && r.tasks.length ? <Tasks results={r} /> : null}
      {r.state === 'done' && r.answers.length ? <Answers results={r} /> : null}
      {r.state === 'done' && !fromVerifiedSkills(r) ? <Feedback results={r} /> : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-card grid gap-0.5 p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="tabular-nums text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function Scores({ results: r }: { results: CandidateResults }) {
  const t = useTranslations('candidateResults.scores');
  return (
    <section aria-labelledby="cr-scores" className="sp-card grid gap-5 p-5 sm:p-7">
      <h2 id="cr-scores" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="sp-dark flex flex-wrap items-center gap-8 rounded-xl p-6 sm:p-8">
        <ScoreRing
          value={r.overall_score ?? null}
          label={t('overall')}
          formatted={percentText(r.overall_score)}
        />
        <dl className="grid flex-1 gap-3 sm:grid-cols-2">
          <Stat label={t('stage1')} value={percentText(r.stage1_score)} />
          <Stat label={t('stage2')} value={percentText(r.stage2_score)} />
        </dl>
      </div>
      {r.per_skill.length ? (
        <div>
          <h3 className="text-sm font-semibold">{t('perSkill')}</h3>
          <ul className="mt-2 grid gap-2">
            {r.per_skill.map((s) => (
              <li key={s.name} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {s.name}
                    {s.reused ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium">
                        <BadgeCheck aria-hidden="true" className="size-3.5" />
                        {t('reusedBadge')}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums font-semibold">{percentText(s.percent)}</span>
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
        </div>
      ) : null}
    </section>
  );
}

function Tasks({ results: r }: { results: CandidateResults }) {
  const t = useTranslations('candidateResults.tasks');
  return (
    <section aria-labelledby="cr-tasks" className="sp-card grid gap-5 p-5 sm:p-7">
      <h2 id="cr-tasks" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <ul className="grid gap-3">
        {r.tasks.map((task, i) => (
          <li key={i} className="sp-card grid gap-2 p-4">
            <h3 className="font-semibold">{task.title}</h3>
            <p className="tabular-nums text-sm">
              {t('tests', { passed: task.hidden_passed, total: task.hidden_total })}
              {task.code_review_percent != null ? (
                <span className="text-muted">
                  {' '}
                  · {t('review', { value: percentText(task.code_review_percent) })}
                </span>
              ) : null}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Bullets title={t('strengths')} items={task.strengths} />
              <Bullets title={t('weaknesses')} items={task.weaknesses} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1 grid list-disc gap-1 pl-5 text-sm">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Answers({ results: r }: { results: CandidateResults }) {
  const t = useTranslations('candidateResults.answers');
  return (
    <section aria-labelledby="cr-answers" className="sp-card grid gap-5 p-5 sm:p-7">
      <h2 id="cr-answers" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <ol className="grid gap-2">
        {r.answers.map((a) => (
          <li key={a.order} className="sp-card flex items-baseline justify-between gap-3 p-4">
            <span className="min-w-0">
              <span className="text-sm text-muted">{t('question', { n: a.order })}</span>
              <span className="block max-w-prose">{a.question_text}</span>
            </span>
            <span className="tabular-nums font-semibold">{percentText(a.percent)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Feedback({ results: r }: { results: CandidateResults }) {
  const t = useTranslations('candidateResults.feedback');
  if (feedbackMissing(r)) {
    return (
      <section aria-labelledby="cr-fb" className="sp-card p-4 sm:p-5">
        <h2 id="cr-fb" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="mt-1 text-muted">{t('missing')}</p>
      </section>
    );
  }
  return (
    <>
      {r.mistakes.length ? (
        <section aria-labelledby="cr-mistakes" className="sp-card grid gap-5 p-5 sm:p-7">
          <h2 id="cr-mistakes" className="text-lg font-semibold">
            {t('mistakes')}
          </h2>
          <p className="max-w-prose text-sm text-muted">{t('mistakesLead')}</p>
          <ul className="grid gap-2">
            {r.mistakes.map((m, i) => (
              <li key={i} className="sp-card p-4">
                {m.about ? <p className="text-sm text-muted">{m.about}</p> : null}
                <p className="max-w-prose">{m.text}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.learn_next.length ? (
        <section aria-labelledby="cr-learn" className="sp-card grid gap-5 p-5 sm:p-7">
          <h2 id="cr-learn" className="text-lg font-semibold">
            {t('learnNext')}
          </h2>
          <ul className="grid gap-2">
            {r.learn_next.map((x, i) => (
              <li key={i} className="sp-card p-4">
                <p className="font-medium">{x.topic}</p>
                <p className="max-w-prose text-sm text-muted">{x.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
