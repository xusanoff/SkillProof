'use client';

import {
  Archive,
  ClipboardCheck,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { useDeleteVacancy, useUpdateVacancy } from '../api';
import { canTransition, type HrVacancy, type VacancyStatus } from '../model';

type Confirm = 'archive' | 'delete' | null;

/**
 * Per-status actions (transitions from docs/API.md). The primary transition is a button;
 * edit / view / archive / delete live in a menu. Archive and delete ask first.
 * Everything waits for the server.
 */
export function VacancyActions({
  vacancy: v,
  companyId,
  onDone,
}: {
  vacancy: HrVacancy;
  companyId: string;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('hrVacancies.actions');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const update = useUpdateVacancy(companyId);
  const remove = useDeleteVacancy(companyId);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const busy = update.isPending || remove.isPending;
  const error = update.error ?? remove.error;

  const setStatus = (status: VacancyStatus, done: string) =>
    update.mutate(
      { id: v.id, body: { status } },
      {
        onSuccess: () => {
          setConfirm(null);
          onDone(t(done as 'published', { title: v.title }));
        },
      },
    );

  const primary: {
    to: VacancyStatus;
    label: string;
    done: string;
    variant: 'default' | 'outline';
  } | null =
    v.status === 'draft'
      ? { to: 'published', label: t('publish'), done: 'published', variant: 'default' }
      : v.status === 'published'
        ? { to: 'closed', label: t('close'), done: 'closed', variant: 'outline' }
        : v.status === 'closed'
          ? { to: 'published', label: t('reopen'), done: 'reopened', variant: 'outline' }
          : null;

  return (
    <div className="grid gap-1.5 lg:justify-items-end">
      <div className="flex items-center gap-1.5 lg:justify-end">
        {primary ? (
          <Button
            variant={primary.variant}
            size="lg"
            className="min-h-11 px-4"
            disabled={busy}
            aria-busy={update.isPending || undefined}
            onClick={() => setStatus(primary.to, primary.done)}
          >
            {primary.label}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={t('more', { title: v.title })}
              disabled={busy}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {v.status !== 'archived' ? (
              <DropdownMenuItem asChild>
                <Link href={`/hr/vacancies/${v.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  {t('edit')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {v.status !== 'archived' ? (
              <DropdownMenuItem asChild>
                <Link href={`/hr/vacancies/${v.id}/assessment`}>
                  <ClipboardCheck aria-hidden="true" />
                  {t('assessment')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {v.status === 'published' || v.status === 'closed' ? (
              <DropdownMenuItem asChild>
                <Link href={`/vacancies/${v.id}`}>
                  <ExternalLink aria-hidden="true" />
                  {t('view')}
                </Link>
              </DropdownMenuItem>
            ) : null}
            {canTransition(v.status, 'archived') ? (
              <DropdownMenuItem onSelect={() => setConfirm('archive')}>
                <Archive aria-hidden="true" />
                {t('archive')}
              </DropdownMenuItem>
            ) : null}
            {v.status === 'draft' ? (
              <DropdownMenuItem onSelect={() => setConfirm('delete')} className="text-danger">
                <Trash2 aria-hidden="true" />
                {t('delete')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error && !confirm ? (
        <p role="alert" className="text-sm text-danger">
          {errorText(error)}
        </p>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {confirm === 'delete' ? t('deleteTitle') : t('archiveTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === 'delete'
              ? t('deleteBody', { title: v.title })
              : t('archiveBody', { title: v.title })}
          </AlertDialogDescription>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {errorText(error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === 'delete') {
                  remove.mutate(v.id, {
                    onSuccess: () => {
                      setConfirm(null);
                      onDone(t('deleted', { title: v.title }));
                    },
                  });
                } else {
                  setStatus('archived', 'archived');
                }
              }}
            >
              {confirm === 'delete' ? t('delete') : t('archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
