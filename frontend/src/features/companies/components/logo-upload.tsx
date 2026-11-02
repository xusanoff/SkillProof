'use client';

import { ImageUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { acceptOf, megabytes } from '@/lib/files';
import { useErrorText } from '@/lib/forms';
import { useUploadLogo } from '../api';
import { checkLogo, logoRule, type Company } from '../model';
import { CompanyLogo } from './company-logo';

export function LogoUpload({ company }: { company: Company }) {
  const t = useTranslations('hr.company.logo');
  const te = useTranslations('errors');
  const errorText = useErrorText();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadLogo(company.id);
  const [problem, setProblem] = useState<string | null>(null);
  const maxMb = megabytes(logoRule.maxBytes);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    const issue = checkLogo(file);
    if (issue) return setProblem(te(issue));
    upload.mutate(file, { onError: (e) => setProblem(errorText(e)) });
  };

  return (
    <section aria-labelledby="logo-title" className="grid gap-4">
      <h2 id="logo-title" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="flex items-center gap-4">
        <CompanyLogo logoUrl={company.logo_url} name={company.name} size={80} />
        <div className="grid gap-2">
          <p className="text-sm text-muted">{t('hint', { maxMb })}</p>
          <input
            ref={inputRef}
            type="file"
            accept={acceptOf(logoRule)}
            className="sr-only"
            tabIndex={-1}
            aria-label={t('upload')}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 justify-self-start px-4"
            disabled={upload.isPending}
            aria-busy={upload.isPending || undefined}
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp aria-hidden="true" />
            {upload.isPending ? t('uploading') : company.logo_url ? t('replace') : t('upload')}
          </Button>
        </div>
      </div>
      {problem ? (
        <Notice tone="danger" role="alert">
          {problem}
        </Notice>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {upload.isSuccess ? t('uploaded') : ''}
      </span>
    </section>
  );
}
