'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useMe, useUpdateMe } from '../api';
import type { Me } from '../model';
import { AccountData } from './account-data';
import { NotificationSettings } from './notification-settings';

const settingsSchema = z.object({
  full_name: z.string().trim().min(1, 'required').max(200, 'tooLong'),
  locale: z.enum(routing.locales),
  timezone: z.string().min(1, 'required'),
});
type SettingsValues = z.infer<typeof settingsSchema>;

function timeZones(current: string): string[] {
  const all =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return all.includes(current) ? all : [current, ...all];
}

export function SettingsPage() {
  const t = useTranslations('settings');
  const { data: me } = useMe();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-muted">{t('lead')}</p>
      {me ? <SettingsForm me={me} /> : null}
      {me ? <NotificationSettings me={me} /> : null}
      {me ? <AccountData /> : null}
    </div>
  );
}

function SettingsForm({ me }: { me: Me }) {
  const t = useTranslations('settings');
  const tl = useTranslations('locale.names');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const update = useUpdateMe();
  const router = useRouter();
  const pathname = usePathname();
  const zones = useMemo(() => timeZones(me.timezone), [me.timezone]);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { full_name: me.full_name, locale: me.locale, timezone: me.timezone },
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    update.mutate(values, {
      onSuccess: (saved) => {
        form.reset({ full_name: saved.full_name, locale: saved.locale, timezone: saved.timezone });
        if (saved.locale !== me.locale)
          router.replace(pathname, { locale: saved.locale as Locale });
      },
      onError: (e) => {
        if (!applyServerErrors(e, form.setError, ['full_name', 'locale', 'timezone'])) {
          setFormError(errorText(e));
        }
      },
    });
  });

  return (
    <form noValidate onSubmit={onSubmit} className="mt-8 grid gap-5" aria-label={t('title')}>
      {formError ? (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      ) : null}
      <Field label={t('email')} hint={t('emailHint')}>
        {(c) => <Input {...c} value={me.email} readOnly disabled />}
      </Field>
      <Field label={t('fullName')} error={fieldError(errors.full_name?.message)}>
        {(c) => <Input {...c} {...form.register('full_name')} autoComplete="name" />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t('language')}
          hint={t('languageHint')}
          error={fieldError(errors.locale?.message)}
        >
          {(c) => (
            <NativeSelect {...c} {...form.register('locale')}>
              {routing.locales.map((l) => (
                <option key={l} value={l} lang={l}>
                  {tl(l)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('timezone')} error={fieldError(errors.timezone?.message)}>
          {(c) => (
            <NativeSelect {...c} {...form.register('timezone')}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll('_', ' ')}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="h-12 px-6 text-base"
          disabled={update.isPending}
          aria-busy={update.isPending || undefined}
        >
          {update.isPending ? tc('saving') : tc('save')}
        </Button>
        <span aria-live="polite" className="text-sm text-success">
          {update.isSuccess && !isDirty ? t('saved') : null}
        </span>
      </div>
    </form>
  );
}
