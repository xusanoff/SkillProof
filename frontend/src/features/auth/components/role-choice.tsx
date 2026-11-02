'use client';

import { BriefcaseBusiness, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { FieldError } from '@/components/common/field';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'candidate', icon: UserRound },
  { value: 'hr', icon: BriefcaseBusiness },
] as const;

/**
 * Two large radio cards (not a dropdown): native radios, so arrow keys, labels and
 * screen readers work out of the box; the card is the label.
 */
export function RoleChoice({
  registration,
  value,
  error,
}: {
  registration: UseFormRegisterReturn<'role'>;
  value: string | undefined;
  error?: string;
}) {
  const t = useTranslations('auth.register.role');
  return (
    <fieldset aria-describedby={error ? 'role-error' : undefined}>
      <legend className="text-sm font-medium">{t('legend')}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {OPTIONS.map(({ value: option, icon: Icon }) => {
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                'relative flex cursor-pointer gap-3 rounded-xl border bg-surface p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                checked
                  ? 'border-accent bg-accent-soft'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <input
                type="radio"
                value={option}
                {...registration}
                className="sr-only"
                aria-describedby={`role-${option}-hint`}
              />
              <Icon
                aria-hidden="true"
                className={cn('mt-0.5 size-5 shrink-0', checked ? 'text-accent' : 'text-muted')}
              />
              <span className="grid gap-1 pr-6">
                <span className="font-medium">{t(`${option}.title`)}</span>
                <span id={`role-${option}-hint`} className="text-sm text-muted">
                  {t(`${option}.hint`)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-4 right-4 size-4 rounded-full border-2',
                  checked
                    ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_var(--surface)]'
                    : 'border-border-strong',
                )}
              />
            </label>
          );
        })}
      </div>
      {error ? (
        <div className="mt-2">
          <FieldError id="role-error">{error}</FieldError>
        </div>
      ) : null}
    </fieldset>
  );
}
