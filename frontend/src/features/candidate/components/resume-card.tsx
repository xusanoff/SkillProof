'use client';

import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
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
import { acceptOf, megabytes } from '@/lib/files';
import { useFormat } from '@/lib/format';
import { useErrorText } from '@/lib/forms';
import { useDeleteResume, useDownloadResume, useUploadResume } from '../api';
import { checkResume, resumeRule, type Resume } from '../model';

export function ResumeCard({ resume }: { resume: Resume | null | undefined }) {
  const t = useTranslations('candidate.resume');
  const te = useTranslations('errors');
  const tc = useTranslations('common');
  const format = useFormat();
  const errorText = useErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadResume();
  const remove = useDeleteResume();
  const download = useDownloadResume();
  const [problem, setProblem] = useState<string | null>(null);
  const maxMb = megabytes(resumeRule.maxBytes);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    const issue = checkResume(file);
    if (issue) {
      setProblem(te(issue));
      return;
    }
    upload.mutate(file, { onError: (e) => setProblem(errorText(e)) });
  };

  const busy = upload.isPending || remove.isPending;

  return (
    <section
      aria-labelledby="resume-title"
      className="rounded-xl border border-border bg-surface p-5"
    >
      <h2 id="resume-title" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('hint', { maxMb })}</p>

      {resume ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-surface-2 p-3.5">
          <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium" title={resume.filename}>
              {resume.filename}
            </p>
            <p className="text-sm text-muted tabular-nums">
              {t('meta', {
                size: tc(`units.${format.fileSize(resume.size_bytes).unit}`, {
                  value: format.fileSize(resume.size_bytes).value,
                }),
                date: format.dateTime(resume.uploaded_at),
              })}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
          {t('empty')}
        </p>
      )}

      {problem ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {problem}
        </Notice>
      ) : null}
      {download.isError ? (
        <Notice tone="danger" role="alert" className="mt-4">
          {errorText(download.error)}
        </Notice>
      ) : null}

      <input
        ref={inputRef}
        id="resume-file"
        type="file"
        accept={acceptOf(resumeRule)}
        className="sr-only"
        tabIndex={-1}
        aria-label={resume ? t('replace') : t('upload')}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ''; // allow picking the same file again
        }}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          className="min-h-11 px-4"
          disabled={busy}
          aria-busy={upload.isPending || undefined}
          onClick={() => inputRef.current?.click()}
        >
          <Upload aria-hidden="true" />
          {upload.isPending ? t('uploading') : resume ? t('replace') : t('upload')}
        </Button>
        {resume ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 px-4"
              disabled={download.isPending}
              onClick={() => download.mutate(resume.filename)}
            >
              <Download aria-hidden="true" />
              {t('download')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="min-h-11 px-4"
                  disabled={busy}
                >
                  <Trash2 aria-hidden="true" />
                  {t('delete')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('deleteBody', { filename: resume.filename })}
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      remove.mutate(undefined, { onError: (e) => setProblem(errorText(e)) })
                    }
                  >
                    {t('deleteConfirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </div>
    </section>
  );
}
