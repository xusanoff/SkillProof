'use client';

import { CircleCheck, Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ApplicationStatusBadge } from '@/components/common/application-status-badge';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useApply } from '../api';
import type { VacancyCard } from '../model';

export const COVER_NOTE_MAX = 3000;

interface ApplyDialogProps {
  vacancy: Pick<VacancyCard, 'id' | 'title' | 'company'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Apply with an optional cover note. Waits for the server (no optimistic state); the
 * submit button is disabled while sending, so a double click sends one request.
 */
export function ApplyDialog({ vacancy, open, onOpenChange }: ApplyDialogProps) {
  const t = useTranslations('apply');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const noteId = useId();
  const [note, setNote] = useState('');
  const apply = useApply(vacancy.id);
  const code = apply.error instanceof ApiError ? apply.error.code : null;
  const done = apply.isSuccess || code === 'already_applied';

  const onOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next && (apply.isSuccess || apply.isError)) {
      apply.reset();
      if (apply.isSuccess) setNote('');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpen}>
      <SheetContent closeLabel={tc('close')} className="gap-4">
        <div className="pr-10">
          <SheetTitle className="text-lg leading-snug font-semibold">
            {done ? t('doneTitle') : t('title')}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted">
            {t('vacancyLine', { title: vacancy.title, company: vacancy.company.name })}
          </SheetDescription>
        </div>

        {done ? (
          <div className="grid gap-4" role="status">
            {apply.isSuccess ? (
              <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft p-4">
                <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
                <div className="grid gap-2">
                  <p className="font-medium">{t('doneBody')}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    {t('statusLabel')} <ApplicationStatusBadge status={apply.data.status} />
                  </p>
                </div>
              </div>
            ) : (
              <Notice tone="info" title={t('alreadyTitle')}>
                {t('alreadyBody')}
              </Notice>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                size="lg"
                className="min-h-11 px-4"
                onClick={() => onOpen(false)}
              >
                {tc('close')}
              </Button>
              <Button asChild size="lg" className="min-h-11 px-4">
                <Link href="/candidate/applications">{t('toApplications')}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!apply.isPending) apply.mutate(note);
            }}
          >
            <div className="flex gap-3 rounded-lg bg-surface-2 p-3.5 text-sm">
              <Layers aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              <p>{t('interviewNote')}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={noteId}>
                {t('coverLabel')}
                <span className="ml-1 font-normal text-muted">{tc('optional')}</span>
              </Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={COVER_NOTE_MAX}
                rows={6}
                onChange={(e) => setNote(e.target.value)}
                aria-describedby={`${noteId}-hint`}
                placeholder={t('coverPlaceholder')}
              />
              <p id={`${noteId}-hint`} className="flex justify-between gap-3 text-sm text-muted">
                <span>{t('coverHint')}</span>
                <span className="shrink-0 tabular-nums">
                  {note.length}/{COVER_NOTE_MAX}
                </span>
              </p>
            </div>
            {apply.isError ? (
              <Notice tone={code === 'vacancy_not_open' ? 'warning' : 'danger'} role="alert">
                {errorText(apply.error)}
              </Notice>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="min-h-11 px-4"
                onClick={() => onOpen(false)}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                size="lg"
                className="min-h-11 px-5"
                disabled={apply.isPending || code === 'vacancy_not_open'}
                aria-busy={apply.isPending || undefined}
              >
                {apply.isPending ? t('submitting') : t('submit')}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
