'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Salary } from '@/components/common/salary';
import { useViewer } from '@/features/auth';
import { useVacancy } from '../api';
import { hasActiveApplication, type VacancyDetail } from '../model';
import { ApplyAction } from './apply-action';
import { SaveButton } from './save-button';

/**
 * Apply block: sticky right column on desktop, a fixed bar above the bottom nav on phones.
 * Viewer state (saved / applied) is re-read for signed-in candidates.
 */
export function VacancyApply({ vacancy }: { vacancy: VacancyDetail }) {
  return (
    <Suspense fallback={<ApplyBlock vacancy={vacancy} autoOpen={false} />}>
      <ApplyFromUrl vacancy={vacancy} />
    </Suspense>
  );
}

function ApplyFromUrl({ vacancy }: { vacancy: VacancyDetail }) {
  const autoOpen = useSearchParams().get('apply') === '1';
  return <ApplyBlock vacancy={vacancy} autoOpen={autoOpen} />;
}

function ApplyBlock({ vacancy: initial, autoOpen }: { vacancy: VacancyDetail; autoOpen: boolean }) {
  const t = useTranslations('vacancy');
  const { data: me } = useViewer();
  const { data } = useVacancy(initial.id, initial);
  const v = data ?? initial;
  const isOpen = v.status === 'published';
  const [dialogOpen, setDialogOpen] = useState(false);
  const isCandidate = me?.role === 'candidate';
  const hasViewer = !!data?.viewer;

  // Back from login with `?apply=1`: open the dialog once (if there is something to do).
  // Adjusting state during render (not in an effect) once the viewer state is known.
  const [autoHandled, setAutoHandled] = useState(false);
  if (autoOpen && !autoHandled && isCandidate && hasViewer) {
    setAutoHandled(true);
    if (isOpen && !hasActiveApplication(data?.viewer?.application_status)) setDialogOpen(true);
  }
  useEffect(() => {
    if (!autoHandled) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('apply');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [autoHandled]);

  if (me && me.role !== 'candidate') return null;

  return (
    <>
      <section
        aria-label={t('applyLabel')}
        className="hidden rounded-xl border border-border bg-surface p-5 lg:block"
      >
        <div className="flex items-center gap-2">
          <ApplyAction
            vacancy={v}
            open={isOpen}
            size="lg"
            className="flex-1"
            dialogOpen={dialogOpen}
            onDialogOpenChange={setDialogOpen}
          />
          <SaveButton vacancy={v} className="border-border" />
        </div>
        <p className="mt-3 text-sm text-muted">{t('applyHint')}</p>
      </section>

      {/* Phone/tablet: fixed above the bottom navigation (which is 3.5rem + safe area). */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-2.5 backdrop-blur md:bottom-0 md:pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-sm font-medium">{v.title}</p>
            <Salary
              min={v.salary_min}
              max={v.salary_max}
              currency={v.currency}
              className="text-sm"
            />
          </div>
          <div className="flex flex-1 items-center gap-1 sm:flex-none">
            <ApplyAction
              vacancy={v}
              open={isOpen}
              className="flex-1"
              dialogOpen={dialogOpen}
              onDialogOpenChange={setDialogOpen}
              renderDialog={false}
            />
            <SaveButton vacancy={v} />
          </div>
        </div>
      </div>
    </>
  );
}
