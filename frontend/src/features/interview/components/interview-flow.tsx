'use client';

import { ArrowLeft } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useInterviewState } from '../api';
import { interviewLang, phaseOf } from '../model';
import { RulesStep } from './rules-step';
import { Stage1Step } from './stage1-step';
import { StatusScreen } from './status-screen';
import { SystemCheck } from './system-check';
import { WarmupStep } from './warmup-step';

/** Candidate interview: rules → system check → warm-up → Stage 1 → end state. Server state drives it. */
export function InterviewFlow({ applicationId }: { applicationId: string }) {
  const t = useTranslations('interview');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const query = useInterviewState(applicationId);
  const [local, setLocal] = useState({ checked: false, warmupDone: false });

  if (query.error instanceof ApiError && query.error.status === 404) {
    return <EmptyState headingLevel={1} title={t('notFound')} />;
  }
  if (query.isError) {
    return (
      <ErrorState
        headingLevel={1}
        title={errorText(query.error)}
        onRetry={() => query.refetch()}
        retryLabel={tc('retry')}
      />
    );
  }
  if (!query.data) {
    return (
      <div className="grid gap-3" aria-hidden="true">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const state = query.data;
  const phase = phaseOf(state, local);
  const lang = interviewLang(state, locale);

  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-6">
      <p className="lg:hidden">
        <MobileNotice />
      </p>
      <div className="hidden lg:block">
        {phase === 'blocked' ? (
          <Blocked reason={state.blocked_reason ?? ''} />
        ) : phase === 'ended' && state.session ? (
          <StatusScreen session={state.session} application={state} />
        ) : phase === 'rules' ? (
          <RulesStep state={state} lang={lang} />
        ) : phase === 'check' ? (
          <SystemCheck onContinue={() => setLocal((l) => ({ ...l, checked: true }))} />
        ) : phase === 'warmup' ? (
          <WarmupStep state={state} onDone={() => setLocal((l) => ({ ...l, warmupDone: true }))} />
        ) : (
          <Stage1Step state={state} />
        )}
      </div>
    </div>
  );
}

function MobileNotice() {
  const t = useTranslations('interview');
  return (
    <span className="block rounded-xl border border-border p-4">
      <span className="block text-lg font-semibold">{t('desktopOnlyTitle')}</span>
      <span className="mt-1 block">{t('desktopOnlyBody')}</span>
      <Button asChild variant="outline" className="mt-3 min-h-11">
        <Link href="/candidate/applications">
          <ArrowLeft aria-hidden="true" />
          {t('desktopOnlyBack')}
        </Link>
      </Button>
    </span>
  );
}

function Blocked({ reason }: { reason: string }) {
  const t = useTranslations('interview.blocked');
  const known = reason === 'application_closed' || reason === 'assessment_not_ready';
  return (
    <section className="mx-auto grid max-w-prose gap-3" role="alert">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p>{known ? t(reason) : t('unknown')}</p>
      <div>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/candidate/applications">{t('back')}</Link>
        </Button>
      </div>
    </section>
  );
}
