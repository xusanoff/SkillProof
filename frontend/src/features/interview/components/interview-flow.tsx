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
import { Stage2Intro, Stage2Step } from '@/features/interview-stage2';
import { useInterviewState } from '../api';
import { coversStage1, coversStage2, interviewLang, phaseOf, type ReuseOffer } from '../model';
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
  const [local, setLocal] = useState<{
    checked: boolean;
    warmupDone: boolean;
    stage2Intro: boolean;
    stage2Sid: string | null;
    reuse: boolean;
  }>({ checked: false, warmupDone: false, stage2Intro: false, stage2Sid: null, reuse: true });
  // The offer is only in the state before Stage 1 starts; keep it to know what the choice covered.
  const [offer, setOffer] = useState<ReuseOffer | null>(null);
  const liveOffer = query.data?.reuse ?? null;
  if (liveOffer && liveOffer !== offer) setOffer(liveOffer);

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
  const skipSetup = coversStage1(offer, local.reuse);
  const phase = phaseOf(state, { ...local, skipSetup });
  const lang = interviewLang(state, locale);

  const stage2Sid = state.stage2_session_id ?? local.stage2Sid;
  // The oral interview works on a phone too (voice); Stage 1 (the editor) is desktop only.
  const responsive = !!stage2Sid || state.stage2_available;

  const body = stage2Sid ? (
    <Stage2Step sid={stage2Sid} title={state.vacancy_title} rulesVersion={state.rules_version} />
  ) : local.stage2Intro && state.stage2_available ? (
    <Stage2Intro
      applicationId={state.application_id}
      mode={state.stage2_mode}
      covered={coversStage2(offer, local.reuse)}
      onStarted={(sid) => setLocal((l) => ({ ...l, stage2Sid: sid }))}
    />
  ) : phase === 'blocked' ? (
    <Blocked reason={state.blocked_reason ?? ''} />
  ) : phase === 'ended' && state.session ? (
    <StatusScreen
      session={state.session}
      application={state}
      onStartStage2={
        state.stage2_available ? () => setLocal((l) => ({ ...l, stage2Intro: true })) : undefined
      }
    />
  ) : phase === 'rules' ? (
    <RulesStep
      state={state}
      lang={lang}
      reuse={local.reuse}
      onReuseChange={(reuse) => setLocal((l) => ({ ...l, reuse }))}
    />
  ) : phase === 'check' ? (
    <SystemCheck onContinue={() => setLocal((l) => ({ ...l, checked: true }))} />
  ) : phase === 'warmup' ? (
    <WarmupStep state={state} onDone={() => setLocal((l) => ({ ...l, warmupDone: true }))} />
  ) : (
    <Stage1Step state={state} reuse={state.reuse ? local.reuse : undefined} covered={skipSetup} />
  );

  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 py-5 sm:px-6">
      {responsive ? (
        body
      ) : (
        <>
          <p className="lg:hidden">
            <MobileNotice />
          </p>
          <div className="hidden lg:block">{body}</div>
        </>
      )}
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
