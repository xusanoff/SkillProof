'use client';

import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { useSession } from '../api';
import type { InterviewState, Session } from '../model';
import { ResultPanel } from './result-panel';

/**
 * End states, as reported by the server. Disqualification points to the rule the candidate
 * accepted; a completed Stage 1 shows no score (scoring arrives in Phase 5).
 */
export function StatusScreen({
  session: initial,
  application,
  onStartStage2,
}: {
  session: Session;
  application: InterviewState;
  onStartStage2?: () => void;
}) {
  // Live copy: the result is scored after the stage ends and polled until it is ready.
  const session = useSession(initial.id, initial).data ?? initial;
  const t = useTranslations('interview.ended');
  const reason = session.disqualification_reason;
  const kind =
    session.status === 'disqualified'
      ? reason === 'inactivity'
        ? 'inactivity'
        : 'externalPaste'
      : session.status;
  const Icon =
    session.status === 'completed'
      ? CircleCheck
      : session.status === 'expired'
        ? Clock
        : CircleAlert;

  return (
    <section aria-labelledby="end-h" className="mx-auto grid max-w-2xl gap-4">
      <Icon
        aria-hidden="true"
        className={`size-8 ${session.status === 'completed' ? 'text-success' : 'text-danger'}`}
      />
      <h1 id="end-h" className="text-2xl font-semibold">
        {t(`${kind}.title` as 'completed.title')}
      </h1>
      <p>{t(`${kind}.body` as 'completed.body')}</p>
      {session.status === 'disqualified' ? (
        <p className="text-sm text-muted">{t('ruleRef', { version: application.rules_version })}</p>
      ) : null}
      {session.status === 'completed' || session.status === 'expired' ? (
        <ResultPanel session={session} />
      ) : null}
      {onStartStage2 ? (
        <div className="sp-card grid gap-2 p-4">
          <h2 className="text-lg font-semibold">{t('stage2Title')}</h2>
          <p className="max-w-prose text-sm text-muted">{t('stage2Body')}</p>
          <div>
            <Button size="lg" className="min-h-11 px-6" onClick={onStartStage2}>
              {t('stage2Start')}
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <Button
          asChild
          variant={onStartStage2 ? 'outline' : 'default'}
          size="lg"
          className="min-h-11 px-6"
        >
          <Link href="/candidate/applications">{t('back')}</Link>
        </Button>
      </div>
    </section>
  );
}
