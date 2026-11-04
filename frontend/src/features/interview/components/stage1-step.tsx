'use client';

import { Maximize } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { useErrorText } from '@/lib/forms';
import { useQueryClient } from '@tanstack/react-query';
import { interviewKeys, useRunTask, useSession, useStartStage1, useSubmitTask } from '../api';
import {
  currentTask,
  inactivityCountdown,
  starterFor,
  type InterviewState,
  type Session,
} from '../model';
import { LogoMark } from '@/components/layout/logo-mark';
import { useInterviewRoom } from './use-interview-room';
import { enterFullscreen } from './system-check';
import { TimerChip, useDeadlineSeconds, useNow } from './clock';
import { StatusScreen } from './status-screen';
import { TaskWorkspace } from './task-workspace';
import { useStage1Telemetry } from './use-stage1-telemetry';

/** Intro with an explicit start (a click is also the gesture fullscreen needs), then the live run. */
export function Stage1Step({
  state,
  reuse,
  covered = false,
}: {
  state: InterviewState;
  /** The candidate's choice; `undefined` when there was no offer (nothing is sent). */
  reuse?: boolean;
  /** The offer covers every task: no editor will open. */
  covered?: boolean;
}) {
  const t = useTranslations('interview.stage1');
  const errorText = useErrorText();
  const start = useStartStage1(state.application_id);
  const session = state.session ?? start.data ?? null;

  // All tasks covered: the server already finished Stage 1, there is no editor, socket or warm-up.
  if (session && session.status !== 'in_progress') {
    return <StatusScreen session={session} application={state} />;
  }
  if (session) return <Stage1Run initial={session} application={state} />;
  return (
    <section aria-labelledby="s1-h" className="mx-auto grid max-w-prose gap-5">
      <h1 id="s1-h" className="text-2xl font-semibold">
        {t('introTitle')}
      </h1>
      <p>{covered ? t('coveredBody') : t('introBody')}</p>
      {start.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(start.error)}
        </Notice>
      ) : null}
      <div>
        <Button
          size="lg"
          className="min-h-11 px-6"
          disabled={start.isPending}
          onClick={() => {
            if (!covered) void enterFullscreen();
            start.mutate(reuse === undefined ? undefined : { reuse });
          }}
        >
          {start.isPending ? t('starting') : t('begin')}
        </Button>
      </div>
    </section>
  );
}

function Stage1Run({ initial, application }: { initial: Session; application: InterviewState }) {
  const qc = useQueryClient();
  const query = useSession(initial.id, initial);
  const session = query.data ?? initial;
  const task = currentTask(session);
  const refetch = async () => {
    await query.refetch();
    void qc.invalidateQueries({ queryKey: interviewKeys.state(application.application_id) });
  };
  const tel = useStage1Telemetry(session, task?.id, refetch);
  useInterviewRoom(session.status === 'in_progress');

  // Past the deadline the server decides; ask it until the status changes.
  const left = useDeadlineSeconds(task?.deadline_at, session.server_now);
  useEffect(() => {
    if (session.status === 'in_progress' && left === 0) {
      const id = setInterval(() => void query.refetch(), 3000);
      return () => clearInterval(id);
    }
  }, [left, session.status, query]);

  if (session.status !== 'in_progress') {
    return <StatusScreen session={session} application={application} />;
  }
  if (tel.connection === 'superseded') return <Superseded />;
  if (!task) return null;
  return (
    <TaskRun
      key={task.id}
      session={session}
      application={application}
      taskIndex={session.tasks.indexOf(task)}
      left={left}
      tel={tel}
    />
  );
}

function Superseded() {
  const t = useTranslations('interview.stage1');
  return (
    <section className="mx-auto grid max-w-prose gap-3" role="alert">
      <h1 className="text-2xl font-semibold">{t('supersededTitle')}</h1>
      <p>{t('supersededBody')}</p>
    </section>
  );
}

function TaskRun({
  session,
  application,
  taskIndex,
  left,
  tel,
}: {
  session: Session;
  application: InterviewState;
  taskIndex: number;
  left: number | null;
  tel: ReturnType<typeof useStage1Telemetry>;
}) {
  const t = useTranslations('interview.stage1');
  const task = session.tasks[taskIndex];
  const run = useRunTask(session.id, task.id);
  const submit = useSubmitTask(session.id, task.id);
  const qc = useQueryClient();
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const language = task.language ?? task.allowed_languages[0];
  const initialCode = task.code ?? starterFor(task.starter_code, language);
  const results = run.data?.results ?? task.last_results ?? null;

  const countdown = inactivityCountdown(
    tel.server && tel.server.state.status === 'in_progress' ? tel.server.state : null,
  );
  const now = useNow();
  const remaining =
    countdown !== null && tel.server
      ? Math.max(0, countdown - Math.floor((now - tel.server.at) / 1000))
      : null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <LogoMark />
        <h1 className="text-lg font-semibold">{application.vacancy_title}</h1>
        <p className="text-sm text-muted tabular-nums">
          {t('taskOf', { n: taskIndex + 1, total: session.tasks.length })}
        </p>
        <div className="ml-auto flex items-center gap-3">
          {tel.connection !== 'open' ? (
            <p role="status" className="text-sm text-muted">
              {t('offline')}
            </p>
          ) : null}
          <TimerChip seconds={left} label={t('taskTimer')} />
        </div>
      </div>

      {remaining !== null ? (
        <Notice tone="warning" role="alert" title={t('inactiveTitle')}>
          {t('inactiveBody')}{' '}
          <span className="font-semibold tabular-nums">
            {t('inactiveCountdown', { s: remaining })}
          </span>
        </Notice>
      ) : null}
      {!fullscreen ? (
        <Notice
          tone="info"
          action={
            <Button
              variant="outline"
              className="min-h-11 gap-2"
              onClick={() => void enterFullscreen()}
            >
              <Maximize aria-hidden="true" />
              {t('backToFullscreen')}
            </Button>
          }
        >
          {t('fullscreenLeft')}
        </Notice>
      ) : null}

      <TaskWorkspace
        key={task.id}
        title={task.title ?? ''}
        statement={task.statement ?? ''}
        languages={task.allowed_languages}
        labels={session.language_labels}
        starterCode={task.starter_code}
        visibleTests={task.visible_tests}
        initial={{ language, code: initialCode }}
        results={results}
        running={run.isPending}
        runError={run.error}
        onRun={(lang, code) => run.mutate({ language: lang, code })}
        submitting={submit.isPending}
        submitError={submit.error}
        onSubmit={(lang, code) => {
          tel.flush();
          submit.mutate(
            { language: lang, code },
            {
              onSuccess: () =>
                void qc.invalidateQueries({
                  queryKey: interviewKeys.state(application.application_id),
                }),
            },
          );
        }}
        emit={tel.record}
        onDraft={(lang, code) => tel.setDraft({ task_id: task.id, language: lang, code })}
      />
    </div>
  );
}
