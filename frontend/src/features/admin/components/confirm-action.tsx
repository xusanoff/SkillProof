'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Notice } from '@/components/common/notice';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useErrorText } from '@/lib/forms';

/** A moderation step that takes effect for other people: always asked, reason optional. */
export function ConfirmAction({
  label,
  title,
  body,
  withReason = false,
  danger = false,
  pending,
  error,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  withReason?: boolean;
  danger?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string, done: () => void) => void;
}) {
  const t = useTranslations('admin.confirm');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{body}</AlertDialogDescription>
        {withReason ? (
          <label className="grid gap-1.5 text-sm font-medium">
            {t('reason')}
            <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
        ) : null}
        {open && error ? (
          <Notice tone="danger" role="alert">
            {errorText(error)}
          </Notice>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => onConfirm(reason.trim(), () => setOpen(false))}
          >
            {label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
