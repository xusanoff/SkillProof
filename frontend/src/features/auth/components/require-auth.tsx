'use client';

import { ShieldX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { useMe } from '../api';
import { homeFor, loginHref, type Me, type UserRole } from '../model';

interface RequireAuthProps {
  /** Allowed roles; omit for "any signed-in user". */
  roles?: readonly UserRole[];
  children: ReactNode;
}

/**
 * Client guard (D-017): the `/auth/me` query is the source of truth.
 * Anonymous → `/login?next=<current path>`; wrong role → 403 state.
 */
export function RequireAuth(props: RequireAuthProps) {
  return (
    <Suspense fallback={<GuardSkeleton />}>
      <Guard {...props} />
    </Suspense>
  );
}

function Guard({ roles, children }: RequireAuthProps) {
  const t = useTranslations('common');
  const errorText = useErrorText();
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const anonymous = me.isSuccess && me.data === null;

  useEffect(() => {
    if (anonymous) router.replace(loginHref(search ? `${pathname}?${search}` : pathname));
  }, [anonymous, pathname, search, router]);

  if (me.isError) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <ErrorState
          title={errorText(me.error)}
          onRetry={() => me.refetch()}
          retryLabel={t('retry')}
          retrying={me.isFetching}
        />
      </div>
    );
  }
  if (!me.data) return <GuardSkeleton />;
  if (roles && !roles.includes(me.data.role)) return <Forbidden me={me.data} />;
  return <>{children}</>;
}

function GuardSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-10 sm:px-6" aria-hidden="true">
      <Skeleton className="h-9 w-2/3 max-w-sm" />
      <Skeleton className="h-5 w-full max-w-md" />
      <Skeleton className="mt-4 h-48 w-full" />
    </div>
  );
}

function Forbidden({ me }: { me: Me }) {
  const t = useTranslations('auth.forbidden');
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <EmptyState
        icon={ShieldX}
        headingLevel={1}
        title={t('title')}
        description={t('body', { role: me.role })}
      >
        <Button asChild size="lg" className="min-h-11 px-5">
          <Link href={homeFor(me.role)}>{t('toMyArea')}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
