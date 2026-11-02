'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { applyServerErrors, useFieldError } from '@/lib/forms';
import { useInvite } from '../api';
import { inviteSchema, type InviteValues } from '../model';

export function InviteForm({ companyId }: { companyId: string }) {
  const t = useTranslations('hr.team');
  const fieldError = useFieldError();
  const invite = useInvite(companyId);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(({ email }) => {
    setSentTo(null);
    invite.mutate(email, {
      onSuccess: (inv) => {
        setSentTo(inv.email);
        form.reset();
      },
      onError: (error) => {
        // Every invite error is about the address (taken, pending, invalid…).
        if (!applyServerErrors(error, form.setError, ['email'])) {
          const code = error instanceof ApiError ? error.code : 'unknown';
          form.setError('email', { type: 'server', message: `@errors.${code}` });
        }
      },
    });
  });

  return (
    <section aria-labelledby="invite-title" className="grid gap-3">
      <h2 id="invite-title" className="text-lg font-semibold">
        {t('inviteTitle')}
      </h2>
      <p className="-mt-1 max-w-prose text-sm text-muted">{t('inviteHint')}</p>
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <Field
          label={t('inviteEmail')}
          error={fieldError(form.formState.errors.email?.message)}
          className="flex-1"
        >
          {(c) => (
            <Input
              {...c}
              {...form.register('email')}
              type="email"
              inputMode="email"
              autoComplete="off"
            />
          )}
        </Field>
        <Button
          type="submit"
          size="lg"
          className="h-11 px-5 sm:mt-6.5"
          disabled={invite.isPending}
          aria-busy={invite.isPending || undefined}
        >
          {invite.isPending ? t('inviting') : t('invite')}
        </Button>
      </form>
      <p aria-live="polite" className="text-sm text-success">
        {sentTo ? t('invited', { email: sentTo }) : null}
      </p>
    </section>
  );
}
