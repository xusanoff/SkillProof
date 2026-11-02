'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { UseMutationResult } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { countryOptions } from '@/data/countries';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import {
  COMPANY_FIELDS,
  companySchema,
  toCompanyBody,
  toCompanyValues,
  type Company,
  type CompanyCreateBody,
  type CompanyValues,
} from '../model';

interface CompanyFormProps {
  defaultValues: CompanyValues;
  mutation: UseMutationResult<Company, Error, CompanyCreateBody>;
  submitLabel: string;
  pendingLabel: string;
  onSaved?: (company: Company) => void;
  /** Show "Saved" after success (edit mode). */
  confirmSaved?: boolean;
}

export function CompanyForm({
  defaultValues,
  mutation,
  submitLabel,
  pendingLabel,
  onSaved,
  confirmSaved,
}: CompanyFormProps) {
  const t = useTranslations('hr.company');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CompanyValues>({ resolver: zodResolver(companySchema), defaultValues });
  const { errors, isDirty } = form.formState;
  const err = (n: (typeof COMPANY_FIELDS)[number]) => fieldError(errors[n]?.message);
  const optional = tc('optional');

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(toCompanyBody(values), {
      onSuccess: (company) => {
        form.reset(toCompanyValues(company));
        onSaved?.(company);
      },
      onError: (error) => {
        if (!applyServerErrors(error, form.setError, COMPANY_FIELDS))
          setFormError(errorText(error));
      },
    });
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5" aria-label={t('formLabel')}>
      {formError ? (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      ) : null}
      <Field label={t('name')} error={err('name')}>
        {(c) => (
          <Input {...c} {...form.register('name')} autoComplete="organization" maxLength={200} />
        )}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t('industry')}
          optionalLabel={optional}
          hint={t('industryHint')}
          error={err('industry')}
        >
          {(c) => <Input {...c} {...form.register('industry')} maxLength={120} />}
        </Field>
        <Field label={t('website')} optionalLabel={optional} error={err('website')}>
          {(c) => (
            <Input
              {...c}
              {...form.register('website')}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://"
            />
          )}
        </Field>
        <Field label={t('country')} optionalLabel={optional} error={err('country')}>
          {(c) => (
            <NativeSelect {...c} {...form.register('country')}>
              <option value="">{t('countryNone')}</option>
              {countries.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('city')} optionalLabel={optional} error={err('city')}>
          {(c) => <Input {...c} {...form.register('city')} maxLength={120} />}
        </Field>
      </div>
      <Field
        label={t('description')}
        optionalLabel={optional}
        hint={t('descriptionHint')}
        error={err('description')}
      >
        {(c) => <Textarea {...c} {...form.register('description')} rows={6} maxLength={10000} />}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 px-6 text-base"
          disabled={mutation.isPending}
          aria-busy={mutation.isPending || undefined}
        >
          {mutation.isPending ? pendingLabel : submitLabel}
        </Button>
        <span aria-live="polite" className="text-sm">
          {confirmSaved && mutation.isSuccess && !isDirty ? (
            <span className="text-success">{t('saved')}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
