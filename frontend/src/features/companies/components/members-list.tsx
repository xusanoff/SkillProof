'use client';

import { Crown, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Notice } from '@/components/common/notice';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { useMakeOwner, useMembers, useRemoveMember } from '../api';
import type { Member } from '../model';

export function MembersList({
  companyId,
  isOwner,
  currentUserId,
}: {
  companyId: string;
  isOwner: boolean;
  currentUserId: string;
}) {
  const t = useTranslations('hr.team');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const members = useMembers(companyId);
  const remove = useRemoveMember(companyId);
  const makeOwner = useMakeOwner(companyId);
  const [removeError, setRemoveError] = useState<string | null>(null);

  return (
    <section aria-labelledby="members-title" className="grid gap-3">
      <h2 id="members-title" className="text-lg font-semibold">
        {t('members')}
        {members.data ? (
          <span className="ml-2 tabular-nums font-normal text-muted">{members.data.length}</span>
        ) : null}
      </h2>
      {removeError ? (
        <Notice tone="danger" role="alert">
          {removeError}
        </Notice>
      ) : null}
      {members.isPending ? (
        <Skeleton className="h-32" aria-hidden="true" />
      ) : members.isError ? (
        <ErrorState
          title={errorText(members.error)}
          onRetry={() => members.refetch()}
          retryLabel={tc('retry')}
        />
      ) : (
        <ul className="sp-card divide-y divide-border">
          {members.data.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              isSelf={m.user_id === currentUserId}
              canRemove={isOwner && m.user_id !== currentUserId}
              removing={remove.isPending && remove.variables === m.user_id}
              canMakeOwner={isOwner && m.member_role !== 'owner'}
              onMakeOwner={() => {
                setRemoveError(null);
                makeOwner.mutate(m.user_id, { onError: (e) => setRemoveError(errorText(e)) });
              }}
              onRemove={() => {
                setRemoveError(null);
                remove.mutate(m.user_id, { onError: (e) => setRemoveError(errorText(e)) });
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member,
  isSelf,
  canRemove,
  canMakeOwner,
  onMakeOwner,
  removing,
  onRemove,
}: {
  member: Member;
  isSelf: boolean;
  canRemove: boolean;
  canMakeOwner: boolean;
  onMakeOwner: () => void;
  removing: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations('hr.team');
  const tc = useTranslations('common');
  const format = useFormat();

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate font-medium">
          {member.full_name}
          {isSelf ? <span className="ml-1.5 font-normal text-muted">{t('you')}</span> : null}
        </p>
        <p className="truncate text-sm text-muted">{member.email}</p>
      </div>
      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-medium">
        {t(`roles.${member.member_role}`)}
      </span>
      <span className="w-28 tabular-nums text-sm text-muted">{format.date(member.joined_at)}</span>
      {canMakeOwner ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="lg"
              className="min-h-11 px-3"
              aria-label={t('makeOwnerAria', { name: member.full_name })}
              title={t('makeOwnerAria', { name: member.full_name })}
            >
              <Crown aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t('makeOwnerTitle', { name: member.full_name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('makeOwnerBody')}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onMakeOwner}>{t('makeOwner')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {canRemove ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="lg"
              className="min-h-11 px-3 text-danger"
              disabled={removing}
              aria-label={t('removeAria', { name: member.full_name })}
              title={t('removeAria', { name: member.full_name })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t('removeTitle', { name: member.full_name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('removeBody')}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>{t('removeConfirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </li>
  );
}
