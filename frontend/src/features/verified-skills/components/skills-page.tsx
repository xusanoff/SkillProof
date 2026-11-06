'use client';

import { BadgeCheck, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useMe } from '@/features/auth';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { useSetSkillPublic, useVerifiedSkills } from '../api';
import { publicValidCount, sortSkills, type VerifiedSkill } from '../model';
import { useLevelText } from './skill-badges';

/** "Tasdiqlangan ko'nikmalar": what the platform has verified, and what the candidate shows publicly. */
export function VerifiedSkillsPage() {
  const t = useTranslations('verifiedSkills');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useVerifiedSkills();
  const candidateId = useMe().data?.id;

  let body;
  if (query.isError && !query.data) {
    body = (
      <ErrorState
        title={errorText(query.error)}
        onRetry={() => query.refetch()}
        retryLabel={tc('retry')}
      />
    );
  } else if (!query.data) {
    body = (
      <div className="grid gap-3" aria-hidden="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  } else if (query.data.length === 0) {
    body = (
      <EmptyState icon={BadgeCheck} title={t('empty.title')} description={t('empty.body')}>
        <Link href="/candidate/applications" className="font-medium text-accent hover:underline">
          {t('empty.link')}
        </Link>
      </EmptyState>
    );
  } else {
    const skills = sortSkills(query.data);
    const count = publicValidCount(skills);
    body = (
      <>
        {count > 0 && candidateId ? (
          <Notice tone="success" title={t('profile.title')}>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {t('profile.body', { count })}
              <Link
                href={`/profiles/${candidateId}`}
                className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline"
              >
                {t('profile.open')}
                <ExternalLink aria-hidden="true" className="size-4" />
              </Link>
            </span>
          </Notice>
        ) : null}
        <ul className="grid gap-3">
          {skills.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6 sm:px-6 lg:py-10">
      <div>
        <h1 className="sp-page-title">{t('title')}</h1>
        <p className="mt-1 max-w-prose text-muted">{t('lead')}</p>
      </div>
      <Notice tone="info" title={t('privacy.title')}>
        {t('privacy.body')}
      </Notice>
      {body}
    </div>
  );
}

function SkillRow({ skill: s }: { skill: VerifiedSkill }) {
  const t = useTranslations('verifiedSkills');
  const f = useFormat();
  const errorText = useErrorText();
  const levelText = useLevelText();
  const set = useSetSkillPublic();
  const id = useId();
  const expired = !s.is_valid;

  return (
    <li className="sp-card grid gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{s.name}</h2>
        <p className="tabular-nums font-semibold">
          {[levelText(s.level), t('score', { score: Math.round(s.score) })]
            .filter(Boolean)
            .join(', ')}
        </p>
      </div>
      <p className="tabular-nums text-sm">
        {expired ? (
          <span className="font-medium text-danger">
            {t('expired', { date: f.date(s.valid_until) })}
          </span>
        ) : (
          <span className="text-muted">{t('validUntil', { date: f.date(s.valid_until) })}</span>
        )}
      </p>
      <div className="flex items-start gap-3">
        <Switch
          id={id}
          checked={s.is_public}
          disabled={set.isPending}
          aria-describedby={`${id}-hint`}
          onCheckedChange={(v) => set.mutate({ id: s.id, is_public: v })}
          className="mt-0.5"
        />
        <div>
          <label htmlFor={id} className="text-sm font-medium">
            {t('public.label')}
          </label>
          <p id={`${id}-hint`} className="text-sm text-muted">
            {expired ? t('public.expiredHint') : t('public.hint')}
          </p>
        </div>
      </div>
      {set.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(set.error)}
        </Notice>
      ) : null}
    </li>
  );
}
