'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useWatch, FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { Field, FieldError } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useSaveQuestion } from '../api';
import {
  OPTIONS_MAX,
  QUESTION_TYPES,
  questionSchema,
  toQuestionBody,
  type QuestionOut,
  type QuestionValues,
} from '../model';
import { DifficultyOptions, LanguageOptions, SkillOptions } from './bank-fields';
import { RubricEditor } from './rubric-editor';

const FIELDS = [
  'type',
  'difficulty',
  'language',
  'skill_id',
  'text',
  'options',
  'reference_answer',
  'rubric',
] as const;

/** Create / edit one question. MCQ: 2–8 options with a correct mark; open/scenario: reference answer + rubric. */
export function QuestionForm({
  companyId,
  defaultValues,
  editing,
  onDone,
  onCancel,
  onCreated,
}: {
  companyId: string;
  defaultValues: QuestionValues;
  editing?: QuestionOut;
  onDone: (message: string) => void;
  onCancel: () => void;
  onCreated?: (question: QuestionOut) => void;
}) {
  const t = useTranslations('hrBank');
  const tq = useTranslations('hrBank.question');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const save = useSaveQuestion(companyId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<QuestionValues>({
    resolver: zodResolver(questionSchema),
    defaultValues,
  });
  const { register, control, formState } = form;
  const { errors } = formState;
  const options = useFieldArray({ control, name: 'options' });
  const type = useWatch({ control, name: 'type' });
  const optionsError = fieldError(
    (errors.options as { message?: string; root?: { message?: string } } | undefined)?.message ??
      (errors.options as { root?: { message?: string } } | undefined)?.root?.message,
  );

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync({ id: editing?.id, body: toQuestionBody(values) });
      onCreated?.(saved);
      onDone(editing ? t('savedEdit') : t('savedNew'));
    } catch (error) {
      if (!applyServerErrors(error, form.setError, FIELDS)) setFormError(errorText(error));
    }
  });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={submit}
        aria-label={editing ? tq('titleEdit') : tq('titleNew')}
        className="sp-card grid gap-4 p-4 sm:p-5"
      >
        <h2 className="text-lg font-semibold">{editing ? tq('titleEdit') : tq('titleNew')}</h2>
        {editing ? <Notice tone="info">{t('editResets')}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={tq('type')} error={fieldError(errors.type?.message)}>
            {(c) => (
              <NativeSelect {...c} {...register('type')}>
                {QUESTION_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {tq(`types.${x}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('difficulty')}>
            {(c) => (
              <NativeSelect {...c} {...register('difficulty')}>
                <DifficultyOptions />
              </NativeSelect>
            )}
          </Field>
          <Field label={t('language')}>
            {(c) => (
              <NativeSelect {...c} {...register('language')}>
                <LanguageOptions />
              </NativeSelect>
            )}
          </Field>
          <Field label={t('skill')} optionalLabel={tc('optional')}>
            {(c) => (
              <NativeSelect {...c} {...register('skill_id')}>
                <SkillOptions empty={t('noSkill')} />
              </NativeSelect>
            )}
          </Field>
        </div>
        <Field label={tq('text')} error={fieldError(errors.text?.message)}>
          {(c) => <Textarea {...c} rows={4} {...register('text')} />}
        </Field>

        {type === 'mcq' ? (
          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">{tq('options')}</legend>
            <p className="text-sm text-muted">{tq('optionsHint')}</p>
            {options.fields.map((f, i) => (
              <div key={f.id} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-start">
                <Field
                  label={tq('optionN', { n: i + 1 })}
                  error={fieldError(errors.options?.[i]?.text?.message)}
                >
                  {(c) => <Input {...c} {...register(`options.${i}.text`)} />}
                </Field>
                <label className="flex min-h-11 items-center gap-2 text-sm sm:mt-6">
                  <Checkbox {...register(`options.${i}.correct`)} />
                  {tq('correct')}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 gap-1.5 sm:mt-6"
                  disabled={options.fields.length <= 2}
                  onClick={() => options.remove(i)}
                  aria-label={tq('removeOption', { n: i + 1 })}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            {optionsError ? <FieldError>{optionsError}</FieldError> : null}
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-1.5"
                disabled={options.fields.length >= OPTIONS_MAX}
                onClick={() => options.append({ text: '', correct: false })}
              >
                <Plus aria-hidden="true" />
                {tq('addOption')}
              </Button>
            </div>
          </fieldset>
        ) : (
          <>
            <Field
              label={tq('referenceAnswer')}
              error={fieldError(errors.reference_answer?.message)}
            >
              {(c) => <Textarea {...c} rows={4} {...register('reference_answer')} />}
            </Field>
            <RubricEditor />
          </>
        )}

        {formError ? (
          <Notice tone="danger" role="alert">
            {formError}
          </Notice>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" className="min-h-11 px-5" disabled={save.isPending}>
            {save.isPending ? tc('saving') : tc('save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 px-5"
            onClick={onCancel}
          >
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
