'use client';
import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAssessment } from '@/features/hr-assessments/api';
import { AssessmentForm } from '@/features/hr-assessments/components/assessment-form';
import { ReadinessPanel } from '@/features/hr-assessments/components/readiness-panel';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { emptyVacancyValues } from '../model';
import { useUpdateVacancy } from '../api';
import { VacancyForm } from './vacancy-form';

export function VacancyWizard({ companyId }: { companyId: string }) {
  const t = useTranslations('vacancyForm.wizard');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [id, setId] = useState<string>();
  const steps = useRef<HTMLOListElement>(null);
  useEffect(() => {
    steps.current?.focus({ preventScroll: true });
    steps.current?.scrollIntoView?.({ block: 'start' });
  }, [step]);
  return (
    <div className="grid gap-5">
      <ol ref={steps} tabIndex={-1} aria-label={t('label')} className="grid gap-2 sm:grid-cols-3">
        {(['general', 'config', 'questions'] as const).map((key, i) => (
          <li
            key={key}
            aria-current={step === i + 1 ? 'step' : undefined}
            className={`sp-card px-4 py-3 ${step === i + 1 ? 'border-accent font-semibold' : 'text-muted'}`}
          >
            {i + 1}. {t(key)}
          </li>
        ))}
      </ol>
      <div style={step === 1 ? undefined : { display: 'none' }}>
        <VacancyForm
          companyId={companyId}
          vacancyId={id}
          defaultValues={emptyVacancyValues}
          onContinue={(nextId) => {
            setId(nextId);
            setStep(2);
          }}
        />
      </div>
      {id ? (
        <WizardAssessment
          companyId={companyId}
          vacancyId={id}
          step={step === 3 ? 3 : 2}
          hidden={step === 1}
          back={() => setStep(step === 3 ? 2 : 1)}
          next={() => setStep(3)}
        />
      ) : null}
    </div>
  );
}
function WizardAssessment({
  companyId,
  vacancyId,
  step,
  hidden,
  back,
  next,
}: {
  companyId: string;
  vacancyId: string;
  step: 2 | 3;
  hidden: boolean;
  back: () => void;
  next: () => void;
}) {
  const t = useTranslations('vacancyForm.wizard');
  const errorText = useErrorText();
  const router = useRouter();
  const [notReady, setNotReady] = useState(false);
  const query = useAssessment(companyId, vacancyId);
  const update = useUpdateVacancy(companyId);
  return (
    <div style={hidden ? { display: 'none' } : undefined} className="grid gap-4">
      {query.isError ? (
        <Notice tone="danger">
          {errorText(query.error)}
          <Button type="button" onClick={() => query.refetch()}>
            {t('retry')}
          </Button>
        </Notice>
      ) : query.data === undefined ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          {step === 3 && notReady ? <ReadinessPanel assessment={query.data} /> : null}
          {notReady ? <Notice tone="danger">{t('notReady')}</Notice> : null}
          <AssessmentForm
            companyId={companyId}
            vacancyId={vacancyId}
            assessment={query.data}
            onSaved={() => {}}
            wizard={{
              step,
              back,
              complete: async (data, draft) => {
                if (draft) {
                  router.push('/hr/vacancies?status=draft');
                  return;
                }
                setNotReady(false);
                if (step === 2) {
                  next();
                  return;
                }
                if (!data.ready) {
                  setNotReady(true);
                  return;
                }
                await update.mutateAsync({ id: vacancyId, body: { status: 'published' } });
                router.push('/hr/vacancies?status=published');
              },
            }}
          />
        </>
      )}
    </div>
  );
}
