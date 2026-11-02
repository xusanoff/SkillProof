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
}: {
  session: Session;
  application: InterviewState;
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
      <div>
        <Button asChild size="lg" className="min-h-11 px-6">
          <Link href="/candidate/applications">{t('back')}</Link>
        </Button>
      </div>
    </section>
  );
}
