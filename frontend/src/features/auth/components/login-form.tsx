'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useLogin } from '../api';
import { homeFor, loginSchema, safeNext, type LoginValues } from '../model';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';

export function LoginForm() {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: (me) => router.replace(next ?? homeFor(me.role)),
      onError: (error) => {
        if (!applyServerErrors(error, form.setError, ['email', 'password'])) {
          setFormError(errorText(error));
        }
      },
    });
  });

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5" aria-label={t('login.title')}>
      <FormError message={formError} />
      <Field label={t('email')} error={fieldError(errors.email?.message)}>
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
      <Field label={t('password')} error={fieldError(errors.password?.message)}>
        {(control) => (
          <PasswordInput
            {...control}
            {...form.register('password')}
            autoComplete="current-password"
          />
        )}
      </Field>
      <div className="-mt-2 flex justify-end">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
        >
          {t('login.forgot')}
        </Link>
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-12 text-base"
        disabled={login.isPending}
        aria-busy={login.isPending || undefined}
      >
        {login.isPending ? t('login.submitting') : t('login.submit')}
      </Button>
      <p className="text-sm text-muted">
        {t('login.noAccount')}{' '}
        <Link
          href={`/register${nextQuery}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('login.toRegister')}
        </Link>
      </p>
    </form>
  );
}
