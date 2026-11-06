'use client';

import { CircleCheck, Pencil, Trash2, Undo2 } from 'lucide-react';
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
import { useErrorText } from '@/lib/forms';
import { useApproveBankItem, useDeleteBankItem, type BankKind, GLOBAL_SCOPE } from '../api';

/** Edit / approve / delete for a company item. Global templates are read-only (API: admin only). */
export function BankItemActions({
  companyId,
  kind,
  id,
  label,
  approved,
  isGlobal,
  onEdit,
  onDone,
}: {
  companyId: string;
  kind: BankKind;
  id: string;
  label: string;
  approved: boolean;
  isGlobal: boolean;
  onEdit: () => void;
  onDone: (message: string) => void;
}) {
  const t = useTranslations('hrBank.actions');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const approve = useApproveBankItem(companyId, kind);
  const remove = useDeleteBankItem(companyId, kind);
  const [confirm, setConfirm] = useState(false);
  const busy = approve.isPending || remove.isPending;
  const error = approve.error ?? remove.error;

  if (isGlobal && companyId !== GLOBAL_SCOPE)
    return <p className="text-sm text-muted">{t('readOnly')}</p>;

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant={approved ? 'outline' : 'default'}
          className="min-h-11 gap-1.5 px-3"
          disabled={busy}
          aria-busy={approve.isPending || undefined}
          onClick={() =>
            approve.mutate(
              { id, approved: !approved },
              {
                onSuccess: () =>
                  onDone(approved ? t('unapproved', { label }) : t('approvedDone', { label })),
              },
            )
          }
        >
          {approved ? <Undo2 aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          {approved ? t('unapprove') : t('approve')}
          <span className="sr-only"> — {label}</span>
        </Button>
        <Button
          variant="outline"
          className="min-h-11 gap-1.5 px-3"
          disabled={busy}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
          {t('edit')}
          <span className="sr-only"> — {label}</span>
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 gap-1.5 px-3 text-danger"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          <Trash2 aria-hidden="true" />
          {t('delete')}
          <span className="sr-only"> — {label}</span>
        </Button>
      </div>
      {error && !confirm ? (
        <p role="alert" className="text-sm text-danger">
          {errorText(error)}
        </p>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteBody', { label })}</AlertDialogDescription>
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
                remove.mutate(id, {
                  onSuccess: () => {
                    setConfirm(false);
                    onDone(t('deletedDone', { label }));
                  },
                });
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
