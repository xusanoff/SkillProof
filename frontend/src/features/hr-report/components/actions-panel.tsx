'use client';

import { useTranslations } from 'next-intl';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { hrActions, useSetApplicationStatus } from '@/features/applications';
import { useErrorText } from '@/lib/forms';
import type { HrReport } from '../model';
import { Notes } from './notes';
import { OverrideHistory } from './override-history';
import { OverrideSheet } from './override-sheet';

/** Shortlist / reject / hire, override with a comment, history and private notes. */
export function ActionsPanel({ report, companyId }: { report: HrReport; companyId: string }) {
  const t = useTranslations('hrReport.actions');
  const errorText = useErrorText();
  const setStatus = useSetApplicationStatus(companyId);
  const actions = hrActions(report.status);

  return (
    <aside
      aria-labelledby="actions-h"
      className="grid content-start gap-5 rounded-xl border border-border p-4 sm:p-5"
    >
      <h2 id="actions-h" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((next) => (
          <Button
            key={next}
            size="lg"
            variant={
              next === 'shortlisted' || next === 'hired'
                ? 'default'
                : next === 'rejected'
                  ? 'destructive'
                  : 'outline'
            }
            className="min-h-11 px-4"
            disabled={setStatus.isPending}
            aria-busy={(setStatus.isPending && setStatus.variables?.status === next) || undefined}
            onClick={() => setStatus.mutate({ id: report.application_id, status: next })}
          >
            {t(next)}
          </Button>
        ))}
        {actions.length === 0 ? <p className="text-sm text-muted">{t('noActions')}</p> : null}
      </div>
      {setStatus.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(setStatus.error)}
        </Notice>
      ) : null}
      <OverrideSheet report={report} companyId={companyId} />
      <OverrideHistory items={report.overrides} />
      <Notes companyId={companyId} applicationId={report.application_id} />
    </aside>
  );
}
