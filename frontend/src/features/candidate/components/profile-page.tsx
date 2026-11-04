'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorText } from '@/lib/forms';
import { Link } from '@/i18n/navigation';
import { useProfile } from '../api';
import { ProfileForm } from './profile-form';
import { ResumeCard } from './resume-card';

export function CandidateProfilePage() {
  const t = useTranslations('candidate.profile');
  const tc = useTranslations('common');
  const tm = useTranslations('nav.menu');
  const errorText = useErrorText();
  const profile = useProfile();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 max-w-prose text-muted">{t('lead')}</p>
      {/* The avatar menu does not exist on phones: this is how they reach the page. */}
      <Link
        href="/candidate/skills"
        className="mt-3 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
      >
        {tm('skills')}
      </Link>

      {profile.isPending ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden="true">
          <Skeleton className="h-96" />
          <Skeleton className="h-48" />
        </div>
      ) : profile.isError ? (
        <ErrorState
          className="mt-8"
          title={errorText(profile.error)}
          onRetry={() => profile.refetch()}
          retryLabel={tc('retry')}
          retrying={profile.isFetching}
        />
      ) : (
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <div className="lg:sticky lg:top-24 lg:order-2">
            <ResumeCard resume={profile.data.resume} />
          </div>
          <div className="min-w-0 lg:order-1">
            <ProfileForm profile={profile.data} />
          </div>
        </div>
      )}
    </div>
  );
}
