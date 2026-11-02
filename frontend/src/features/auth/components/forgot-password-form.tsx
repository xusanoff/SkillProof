'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from '@/i18n/navigation';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useForgotPassword } from '../api';
import { forgotSchema, type ForgotValues } from '../model';
import { FormError } from './form-error';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const forgot = useForgotPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  if (forgot.isSuccess) {
    // Same message whether or not the account exists (no enumeration).
    return (
      <div className="grid gap-4">
        <Notice tone="success" role="status" title={t('forgot.sentTitle')}>
          {t('forgot.sentBody', { email: forgot.variables.email })}
        </Notice>
        <Button asChild variant="outline" size="lg" className="min-h-11 justify-self-start px-4">
          <Link href="/login">{t('forgot.backToLogin')}</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    forgot.mutate(values, {
      onError: (error) => {
        if (!applyServerErrors(error, form.setError, ['email'])) setFormError(errorText(error));
      },
    });
  });

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5" aria-label={t('forgot.title')}>
      <FormError message={formError} />
      <Field label={t('email')} error={fieldError(form.formState.errors.email?.message)}>
        {(control) => (
          <Input
            {...control}
            {...form.register('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
          />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        className="h-12 text-base"
        disabled={forgot.isPending}
        aria-busy={forgot.isPending || undefined}
      >
        {forgot.isPending ? t('forgot.submitting') : t('forgot.submit')}
      </Button>
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
      >
        {t('forgot.backToLogin')}
      </Link>
    </form>
  );
}
