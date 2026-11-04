'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorText } from '@/lib/forms';
import { useStage2 } from '../api';
import { endKind } from '../model';
import { EndScreen } from './end-screen';
import { Room } from './room';

/** Oral interview, server state only: the end screen, or the live room (which also covers "preparing"). */
export function Stage2Step({
  sid,
  title,
  rulesVersion,
}: {
  sid: string;
  title: string;
  rulesVersion: string;
}) {
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const query = useStage2(sid);
  const { refetch } = query;
  const reload = useCallback(() => refetch(), [refetch]);

  if (query.isError && !query.data) {
    return (
      <ErrorState
        headingLevel={1}
        title={errorText(query.error)}
        onRetry={() => void refetch()}
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
  const kind = endKind(query.data);
  if (kind) return <EndScreen kind={kind} rulesVersion={rulesVersion} />;
  return <Room state={query.data} title={title} refetch={reload} />;
}
