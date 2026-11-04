'use client';

import { MessageSquareText } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { useErrorText } from '@/lib/forms';
import { useFallbackText } from '../api';

/** One-way switch from voice to text, confirmed first (the employer sees that it happened). */
export function FallbackButton({ sid, prominent }: { sid: string; prominent?: boolean }) {
  const t = useTranslations('stage2.room');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fallback = useFallbackText(sid);
  return (
    <div className="grid gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant={prominent ? 'default' : 'ghost'}
            className="min-h-11 justify-start gap-2 px-3"
          >
            <MessageSquareText aria-hidden="true" />
            {t('fallback')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>{t('fallbackTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('fallbackBody')}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={fallback.isPending}
              onClick={() => fallback.mutate(undefined)}
            >
              {t('fallbackConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {fallback.isError ? (
        <Notice tone="danger" role="alert">
          {errorText(fallback.error)}
        </Notice>
      ) : null}
    </div>
  );
}
