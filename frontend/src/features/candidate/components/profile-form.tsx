'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { appConfig } from '@/config/app';
import { countryOptions } from '@/data/countries';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useSaveProfile } from '../api';
import {
  profileSchema,
  toProfileBody,
  toProfileValues,
  type CandidateProfile,
  type ProfileValues,
} from '../model';

const FIELDS = [
  'headline',
  'country',
  'city',
  'experience_years',
  'about',
  'desired_salary_min',
  'desired_salary_max',
  'currency',
  'open_to_work',
] as const;

export function ProfileForm({ profile }: { profile: CandidateProfile }) {
  const t = useTranslations('candidate.profile');
  const tc = useTranslations('common');
  const tcur = useTranslations('currency');
  const locale = useLocale();
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const save = useSaveProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const countries = useMemo(() => countryOptions(locale), [locale]);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: toProfileValues(profile),
  });
  const { errors, isDirty } = form.formState;
  const err = (name: (typeof FIELDS)[number]) => fieldError(errors[name]?.message);

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    save.mutate(toProfileBody(values), {
      onSuccess: (saved) => form.reset(toProfileValues(saved)),
      onError: (error) => {
        if (!applyServerErrors(error, form.setError, FIELDS)) setFormError(errorText(error));
      },
    });
  });

  const optional = tc('optional');

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="profile-form-title"
      className="grid gap-8"
    >
      <h2 id="profile-form-title" className="sr-only">
        {t('formTitle')}
      </h2>
      {formError ? (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      ) : null}

      <fieldset className="grid gap-5">
        <legend className="mb-4 text-lg font-semibold">{t('sections.main')}</legend>
        <Field label={t('headline')} hint={t('headlineHint')} error={err('headline')}>
          {(c) => <Input {...c} {...form.register('headline')} maxLength={200} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('country')} optionalLabel={optional} error={err('country')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('country')} autoComplete="country">
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
            {(c) => (
              <Input
                {...c}
                {...form.register('city')}
                autoComplete="address-level2"
                maxLength={120}
              />
            )}
          </Field>
        </div>
        <Field
          label={t('experienceYears')}
          optionalLabel={optional}
          error={err('experience_years')}
          className="sm:max-w-[calc(50%-0.625rem)]"
        >
          {(c) => (
            <Input
              {...c}
              {...form.register('experience_years')}
              inputMode="numeric"
              className="tabular-nums"
            />
          )}
        </Field>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-1 text-lg font-semibold">{t('sections.salary')}</legend>
        <p className="-mt-1 text-sm text-muted">{t('salaryHint')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_10rem] sm:gap-5">
          <Field label={t('salaryMin')} error={err('desired_salary_min')}>
            {(c) => (
              <Input
                {...c}
                {...form.register('desired_salary_min')}
                inputMode="numeric"
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('salaryMax')} error={err('desired_salary_max')}>
            {(c) => (
              <Input
                {...c}
                {...form.register('desired_salary_max')}
                inputMode="numeric"
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('currency')} error={err('currency')} className="col-span-2 sm:col-span-1">
            {(c) => (
              <NativeSelect {...c} {...form.register('currency')}>
                {appConfig.currencies.map((code) => (
                  <option key={code} value={code}>
                    {tcur(code)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-5">
        <legend className="mb-4 text-lg font-semibold">{t('sections.about')}</legend>
        <Field label={t('about')} hint={t('aboutHint')} error={err('about')}>
          {(c) => <Textarea {...c} {...form.register('about')} rows={6} maxLength={5000} />}
        </Field>
        <Controller
          control={form.control}
          name="open_to_work"
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4">
              <div className="grid gap-1">
                <label htmlFor="open-to-work" className="font-medium">
                  {t('openToWork')}
                </label>
                <p id="open-to-work-hint" className="text-sm text-muted">
                  {t('openToWorkHint')}
                </p>
              </div>
              <Switch
                id="open-to-work"
                aria-describedby="open-to-work-hint"
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={field.onBlur}
                className="mt-1"
              />
            </div>
          )}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button
          type="submit"
          size="lg"
          className="h-12 px-6 text-base"
          disabled={save.isPending}
          aria-busy={save.isPending || undefined}
        >
          {save.isPending ? tc('saving') : tc('save')}
        </Button>
        <span aria-live="polite" className="text-sm">
          {save.isSuccess && !isDirty ? <span className="text-success">{t('saved')}</span> : null}
        </span>
      </div>
    </form>
  );
}
