'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Field, FieldError } from '@/components/common/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useFieldError } from '@/lib/forms';
import { CRITERIA_MAX, emptyCriterion, type RubricValues } from '../model';

type Ctx = { rubric: RubricValues };

/** Criteria list: key, name, description, max points (1–10) and optional score levels. */
export function RubricEditor() {
  const t = useTranslations('hrBank.rubric');
  const fieldError = useFieldError();
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<Ctx>();
  const { fields, append, remove } = useFieldArray({ control, name: 'rubric.criteria' });
  const listError = fieldError(
    (errors.rubric?.criteria as { message?: string; root?: { message?: string } } | undefined)
      ?.message ??
      (errors.rubric?.criteria as { root?: { message?: string } } | undefined)?.root?.message,
  );
  const msg = (i: number, name: keyof RubricValues['criteria'][number]) =>
    fieldError(errors.rubric?.criteria?.[i]?.[name]?.message);

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">{t('legend')}</legend>
      <p className="text-sm text-muted">{t('hint')}</p>
      {fields.map((f, i) => (
        <div key={f.id} className="grid gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t('criterion', { n: i + 1 })}</h4>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 gap-1.5"
              onClick={() => remove(i)}
              aria-label={t('remove', { n: i + 1 })}
            >
              <Trash2 aria-hidden="true" />
              {t('removeShort')}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
            <Field label={t('name')} error={msg(i, 'name')}>
              {(c) => <Input {...c} {...register(`rubric.criteria.${i}.name`)} />}
            </Field>
            <Field label={t('key')} hint={t('keyHint')} error={msg(i, 'key')}>
              {(c) => (
                <Input {...c} autoCapitalize="none" {...register(`rubric.criteria.${i}.key`)} />
              )}
            </Field>
            <Field label={t('maxPoints')} error={msg(i, 'max_points')}>
              {(c) => (
                <Input
                  {...c}
                  inputMode="numeric"
                  className="tabular-nums"
                  {...register(`rubric.criteria.${i}.max_points`)}
                />
              )}
            </Field>
          </div>
          <Field label={t('description')} optionalLabel={t('optional')}>
            {(c) => <Input {...c} {...register(`rubric.criteria.${i}.description`)} />}
          </Field>
          <Field label={t('levels')} optionalLabel={t('optional')} hint={t('levelsHint')}>
            {(c) => <Textarea {...c} rows={3} {...register(`rubric.criteria.${i}.levels`)} />}
          </Field>
        </div>
      ))}
      {listError ? <FieldError>{listError}</FieldError> : null}
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-1.5"
          disabled={fields.length >= CRITERIA_MAX}
          onClick={() => append(emptyCriterion())}
        >
          <Plus aria-hidden="true" />
          {t('add')}
        </Button>
      </div>
    </fieldset>
  );
}
