'use client';

import { Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import {
  useGenerateAssessment,
  useGenerationJob,
  useRefreshAfterGeneration,
  useSkillIndex,
} from '../api';
import { isJobDone, jobResult } from '../model';
import { DifficultyOptions } from './bank-fields';

const intIn = (v: string, min: number, max: number) => /^\d+$/.test(v) && +v >= min && +v <= max;

/** "AI bilan yaratish": enqueue → poll the job every ~2 s → refresh assessment and banks. */
export function GeneratePanel({
  companyId,
  vacancyId,
  autoApprove,
}: {
  companyId: string;
  vacancyId: string;
  autoApprove: boolean;
}) {
  const t = useTranslations('hrAssessment.generate');
  const tb = useTranslations('hrBank');
  const errorText = useErrorText();
  const generate = useGenerateAssessment(companyId, vacancyId);
  const refresh = useRefreshAfterGeneration(companyId, vacancyId);
  const skills = useSkillIndex();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useGenerationJob(companyId, jobId);
  const [qc, setQc] = useState('8');
  const [tc, setTc] = useState('1');
  const [difficulty, setDifficulty] = useState('3');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [invalid, setInvalid] = useState(false);
  const done = isJobDone(job.data);
  const running = generate.isPending || (jobId !== null && !done && !job.isError);
  const refreshed = useRef<string | null>(null);

  useEffect(() => {
    if (job.data && done && refreshed.current !== job.data.id) {
      refreshed.current = job.data.id;
      void refresh();
    }
  }, [job.data, done, refresh]);

  const start = () => {
    if (!intIn(qc, 0, 20) || !intIn(tc, 0, 3)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    generate.mutate(
      {
        question_count: Number(qc),
        task_count: Number(tc),
        difficulty: Number(difficulty),
        skill_ids: skillIds,
      },
      { onSuccess: (j) => setJobId(j.id) },
    );
  };

  const inProgress =
    generate.error instanceof ApiError && generate.error.code === 'generation_in_progress';
  const result = jobResult(job.data);
  const nameOf = (id: string) => skills.data?.find((s) => s.id === id)?.name ?? id;

  return (
    <section
      aria-labelledby="gen-h"
      className="grid gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <div>
        <h2 id="gen-h" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles aria-hidden="true" className="size-5 text-accent" />
          {t('title')}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          {autoApprove ? t('bodyAuto') : t('bodyManual')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t('questionCount')}
          error={invalid && !intIn(qc, 0, 20) ? t('range', { min: 0, max: 20 }) : undefined}
        >
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              className="tabular-nums"
              value={qc}
              onChange={(e) => setQc(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t('taskCount')}
          error={invalid && !intIn(tc, 0, 3) ? t('range', { min: 0, max: 3 }) : undefined}
        >
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              className="tabular-nums"
              value={tc}
              onChange={(e) => setTc(e.target.value)}
            />
          )}
        </Field>
        <Field label={tb('difficulty')}>
          {(c) => (
            <NativeSelect {...c} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <DifficultyOptions />
            </NativeSelect>
          )}
        </Field>
      </div>
      <div className="grid gap-2">
        <Field label={t('skills')} optionalLabel={t('optional')} hint={t('skillsHint')}>
          {(c) => (
            <NativeSelect
              {...c}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v && !skillIds.includes(v)) setSkillIds([...skillIds, v]);
              }}
            >
              <option value="">{t('addSkill')}</option>
              {(skills.data ?? [])
                .filter((s) => !skillIds.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </NativeSelect>
          )}
        </Field>
        {skillIds.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {skillIds.map((id) => (
              <li
                key={id}
                className="inline-flex items-center rounded-full bg-surface-2 pl-3 text-sm"
              >
                {nameOf(id)}
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-fg"
                  aria-label={t('removeSkill', { name: nameOf(id) })}
                  onClick={() => setSkillIds(skillIds.filter((x) => x !== id))}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          className="min-h-11 gap-2 px-5"
          disabled={running}
          aria-busy={running || undefined}
          onClick={start}
        >
          <Sparkles aria-hidden="true" />
          {running ? t('running') : t('start')}
        </Button>
      </div>

      <div aria-live="polite" className="grid gap-2 empty:hidden">
        {running && jobId ? (
          <Notice tone="info" role="status">
            {t(job.data?.status === 'running' ? 'statusRunning' : 'statusQueued')}
          </Notice>
        ) : null}
        {job.data?.status === 'succeeded' ? (
          <Notice tone="success" role="status" title={t('succeeded')}>
            {t('resultCounts', { questions: result.questions, tasks: result.tasks })}
          </Notice>
        ) : null}
        {job.data?.status === 'failed' ? (
          <Notice tone="danger" role="alert" title={t('failed')}>
            {job.data.error ?? t('failedBody')}
          </Notice>
        ) : null}
        {job.data?.status === 'succeeded' && result.flagged > 0 ? (
          <Notice tone="warning" role="status" title={t('flaggedTitle', { count: result.flagged })}>
            {t('flaggedBody')}
          </Notice>
        ) : null}
      </div>
      {inProgress ? (
        <Notice
          tone="warning"
          role="alert"
          title={t('inProgressTitle')}
          action={
            <Button variant="outline" className="min-h-11" onClick={() => void refresh()}>
              {t('inProgressRefresh')}
            </Button>
          }
        >
          {t('inProgressBody')}
        </Notice>
      ) : generate.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(generate.error)}
        </Notice>
      ) : job.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(job.error)}
        </Notice>
      ) : null}
    </section>
  );
}
