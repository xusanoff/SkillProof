'use client';

import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import type { endKind } from '../model';

type Kind = NonNullable<ReturnType<typeof endKind>>;

/** End states as reported by the server. No score here: the results page shows them once they are ready. */
export function EndScreen({ kind, rulesVersion }: { kind: Kind; rulesVersion: string }) {
  const t = useTranslations('stage2.ended');
  const Icon = kind === 'completed' ? CircleCheck : kind === 'expired' ? Clock : CircleAlert;
  const applicationId = useParams<{ applicationId?: string }>()?.applicationId;
  const received = kind === 'completed' || kind === 'expired';
  return (
    <section aria-labelledby="s2-end-h" className="mx-auto grid max-w-2xl gap-4">
      <Icon aria-hidden="true" className={`size-8 ${received ? 'text-success' : 'text-danger'}`} />
      <h1 id="s2-end-h" className="text-2xl font-semibold">
        {t(`${kind}.title`)}
      </h1>
      <p>{t(`${kind}.body`)}</p>
      {received ? <p className="text-muted">{t('resultsLater')}</p> : null}
      {kind === 'inactivity' || kind === 'disqualified' ? (
        <p className="text-sm text-muted">{t('ruleRef', { version: rulesVersion })}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {applicationId ? (
          <Button asChild size="lg" className="min-h-11 px-6">
            <Link href={`/candidate/applications/${applicationId}/results`}>
              {t('viewResults')}
            </Link>
          </Button>
        ) : null}
        <Button
          asChild
          size="lg"
          variant={applicationId ? 'outline' : 'default'}
          className="min-h-11 px-6"
        >
          <Link href="/candidate/applications">{t('back')}</Link>
        </Button>
      </div>
    </section>
  );
}
