'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useResetPassword } from '../api';
import { PASSWORD_MIN, resetSchema, type ResetValues } from '../model';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';

export function ResetPasswordForm() {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const token = useSearchParams().get('token');
  const reset = useResetPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;

  if (!token) {
    return (
      <div className="grid gap-4">
        <Notice tone="danger" role="alert" title={t('reset.invalidTitle')}>
          {t('reset.missingToken')}
        </Notice>
        <Button asChild variant="outline" size="lg" className="min-h-11 justify-self-start px-4">
          <Link href="/forgot-password">{t('reset.requestNew')}</Link>
        </Button>
      </div>
    );
  }

  if (reset.isSuccess) {
    return (
      <div className="grid gap-4">
        <Notice tone="success" role="status" title={t('reset.doneTitle')}>
          {t('reset.doneBody')}
        </Notice>
        <Button asChild size="lg" className="min-h-11 justify-self-start px-5">
          <Link href="/login">{t('reset.toLogin')}</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(({ password }) => {
    setFormError(null);
    reset.mutate(
      { token, password },
      {
        onError: (error) => {
          if (
            !applyServerErrors(error, form.setError, ['password'], { weak_password: 'password' })
          ) {
            setFormError(errorText(error));
          }
        },
      },
    );
  });

  const invalidToken = reset.error && 'code' in reset.error && reset.error.code === 'invalid_token';

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5" aria-label={t('reset.title')}>
      <FormError message={formError} />
      {invalidToken ? (
        <Link
          href="/forgot-password"
          className="-mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('reset.requestNew')}
        </Link>
      ) : null}
      <Field
        label={t('newPassword')}
        hint={t('passwordHint', { min: PASSWORD_MIN })}
        error={fieldError(errors.password?.message)}
      >
        {(control) => (
          <PasswordInput {...control} {...form.register('password')} autoComplete="new-password" />
        )}
      </Field>
      <Field label={t('confirmPassword')} error={fieldError(errors.confirm?.message)}>
        {(control) => (
          <PasswordInput {...control} {...form.register('confirm')} autoComplete="new-password" />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        className="h-12 text-base"
        disabled={reset.isPending}
        aria-busy={reset.isPending || undefined}
      >
        {reset.isPending ? t('reset.submitting') : t('reset.submit')}
      </Button>
    </form>
  );
}
