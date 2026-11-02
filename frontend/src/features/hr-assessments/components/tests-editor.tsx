'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Field, FieldError } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFieldError } from '@/lib/forms';
import type { TestValues } from '../model';

type Name = 'visible_tests' | 'hidden_tests';
type Ctx = Record<Name, TestValues[]>;

/** stdin → expected stdout cases. Hidden tests are never shown to candidates. */
export function TestsEditor({ name, max }: { name: Name; max: number }) {
  const t = useTranslations('hrBank.task.tests');
  const fieldError = useFieldError();
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<Ctx>();
  const { fields, append, remove } = useFieldArray({ control, name });
  const rootError = fieldError(
    (errors[name] as { message?: string; root?: { message?: string } } | undefined)?.message ??
      (errors[name] as { root?: { message?: string } } | undefined)?.root?.message,
  );
  const mono = 'font-mono text-sm';

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">{t(`${name}.legend`)}</legend>
      <p className="text-sm text-muted">{t(`${name}.hint`)}</p>
      {fields.map((f, i) => (
        <div key={f.id} className="grid gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t('caseN', { n: i + 1 })}</h4>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 gap-1.5"
              disabled={fields.length <= 1}
              onClick={() => remove(i)}
              aria-label={t('remove', { n: i + 1 })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          <Field label={t('name')} optionalLabel={t('optional')}>
            {(c) => <Input {...c} {...register(`${name}.${i}.name`)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('input')}>
              {(c) => (
                <Textarea {...c} rows={3} className={mono} {...register(`${name}.${i}.input`)} />
              )}
            </Field>
            <Field label={t('output')} error={fieldError(errors[name]?.[i]?.output?.message)}>
              {(c) => (
                <Textarea {...c} rows={3} className={mono} {...register(`${name}.${i}.output`)} />
              )}
            </Field>
          </div>
        </div>
      ))}
      {rootError ? <FieldError>{rootError}</FieldError> : null}
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-1.5"
          disabled={fields.length >= max}
          onClick={() => append({ name: '', input: '', output: '' })}
        >
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
      </div>
    </fieldset>
  );
}
