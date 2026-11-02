'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useRouter } from '@/i18n/navigation';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useRegister } from '../api';
import { PASSWORD_MIN, homeFor, registerSchema, safeNext, type RegisterValues } from '../model';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';
import { RoleChoice } from './role-choice';

export function RegisterForm() {
  const t = useTranslations('auth');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const presetRole = params.get('role');
  const presetEmail = params.get('email') ?? '';
  const register = useRegister();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: presetRole === 'hr' || presetRole === 'candidate' ? presetRole : undefined,
      full_name: '',
      email: presetEmail,
      password: '',
    },
  });
  const { errors } = form.formState;
  const role = useWatch({ control: form.control, name: 'role' });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    register.mutate(values, {
      onSuccess: (me) => router.replace(next ?? homeFor(me.role)),
      onError: (error) => {
        const attached = applyServerErrors(
          error,
          form.setError,
          ['email', 'password', 'full_name', 'role'],
          { email_taken: 'email', weak_password: 'password' },
        );
        if (!attached) setFormError(errorText(error));
      },
    });
  });

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-5" aria-label={t('register.title')}>
      <FormError message={formError} />
      <RoleChoice
        registration={form.register('role')}
        value={role}
        error={fieldError(errors.role?.message)}
      />
      <Field label={t('fullName')} error={fieldError(errors.full_name?.message)}>
        {(control) => <Input {...control} {...form.register('full_name')} autoComplete="name" />}
      </Field>
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
      <Field
        label={t('password')}
        hint={t('passwordHint', { min: PASSWORD_MIN })}
        error={fieldError(errors.password?.message)}
      >
        {(control) => (
          <PasswordInput {...control} {...form.register('password')} autoComplete="new-password" />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        className="h-12 text-base"
        disabled={register.isPending}
        aria-busy={register.isPending || undefined}
      >
        {register.isPending ? t('register.submitting') : t('register.submit')}
      </Button>
      <p className="text-sm text-muted">
        {t('register.haveAccount')}{' '}
        <Link
          href={`/login${nextQuery}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {t('register.toLogin')}
        </Link>
      </p>
    </form>
  );
}
