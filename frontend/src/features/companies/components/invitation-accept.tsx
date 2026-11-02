'use client';

import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { loginHref, useLogout, useMe, type Me } from '@/features/auth';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useAcceptInvitation, usePublicInvitation } from '../api';
import { sameEmail, writeCompanyCookie, type PublicInvitation } from '../model';
import { CompanyLogo } from './company-logo';

/**
 * `/invitations/[token]`. The page only explains the situation; the API decides
 * (403 email_mismatch / role_mismatch, 410 invitation_expired).
 */
export function InvitationAccept({ token }: { token: string }) {
  const t = useTranslations('invitation');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const invitation = usePublicInvitation(token);
  const me = useMe();

  if (invitation.isPending || me.isPending) {
    return (
      <div className="grid gap-4" aria-hidden="true">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (invitation.isError) {
    const notFound = invitation.error instanceof ApiError && invitation.error.status === 404;
    return (
      <ErrorState
        headingLevel={1}
        title={notFound ? t('notFoundTitle') : errorText(invitation.error)}
        description={notFound ? t('notFoundBody') : undefined}
        onRetry={notFound ? undefined : () => invitation.refetch()}
        retryLabel={tc('retry')}
      />
    );
  }

  const inv = invitation.data;
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-4">
        <CompanyLogo logoUrl={inv.company.logo_url} name={inv.company.name} size={56} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('title', { company: inv.company.name })}
          </h1>
          <p className="mt-1 text-muted">{t('invitedEmail', { email: inv.email })}</p>
        </div>
      </div>
      <Body token={token} invitation={inv} me={me.data ?? null} />
    </div>
  );
}

function Body({
  token,
  invitation,
  me,
}: {
  token: string;
  invitation: PublicInvitation;
  me: Me | null;
}) {
  const t = useTranslations('invitation');
  const here = `/invitations/${token}`;

  if (invitation.status !== 'pending') {
    return (
      <Notice
        tone={invitation.status === 'accepted' ? 'info' : 'warning'}
        title={t(`status.${invitation.status}.title`)}
      >
        {t(`status.${invitation.status}.body`)}
        {invitation.status === 'accepted' && me?.role === 'hr' ? (
          <p className="mt-3">
            <Link href="/hr" className="font-medium text-accent underline-offset-4 hover:underline">
              {t('toDashboard')}
            </Link>
          </p>
        ) : null}
      </Notice>
    );
  }

  if (!me) {
    const register = `/register?role=hr&email=${encodeURIComponent(invitation.email)}&next=${encodeURIComponent(here)}`;
    return (
      <div className="grid gap-4">
        <p className="max-w-prose">{t('anonymous', { email: invitation.email })}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" className="min-h-11 px-5">
            <Link href={loginHref(here)}>{t('signIn')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="min-h-11 px-5">
            <Link href={register}>{t('createAccount')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (me.role !== 'hr') {
    return (
      <Mismatch
        title={t('roleMismatchTitle')}
        body={t('roleMismatchBody', { email: invitation.email })}
      />
    );
  }
  if (!sameEmail(me.email, invitation.email)) {
    return (
      <Mismatch
        title={t('emailMismatchTitle')}
        body={t('emailMismatchBody', { current: me.email, invited: invitation.email })}
      />
    );
  }
  return <AcceptButton token={token} />;
}

function Mismatch({ title, body }: { title: string; body: string }) {
  const t = useTranslations('invitation');
  const logout = useLogout();
  return (
    <Notice
      tone="warning"
      title={title}
      action={
        <Button
          variant="outline"
          size="lg"
          className="min-h-11 px-4"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {t('switchAccount')}
        </Button>
      }
    >
      {body}
    </Notice>
  );
}

function AcceptButton({ token }: { token: string }) {
  const t = useTranslations('invitation');
  const errorText = useErrorText();
  const accept = useAcceptInvitation(token);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      {error ? (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      ) : null}
      <p className="max-w-prose text-muted">{t('acceptHint')}</p>
      <Button
        size="lg"
        className="h-12 justify-self-start px-6 text-base"
        disabled={accept.isPending}
        aria-busy={accept.isPending || undefined}
        onClick={() => {
          setError(null);
          accept.mutate(undefined, {
            onSuccess: (company) => {
              writeCompanyCookie(company.id);
              router.replace('/hr');
            },
            onError: (e) => setError(errorText(e)),
          });
        }}
      >
        <MailCheck aria-hidden="true" />
        {accept.isPending ? t('accepting') : t('accept')}
      </Button>
    </div>
  );
}
