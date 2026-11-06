'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useWatch, FormProvider, useForm } from 'react-hook-form';
import { Field, FieldError } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useSaveTask } from '../api';
import { CODE_LANGUAGES, taskSchema, toTaskBody, type TaskOut, type TaskValues } from '../model';
import { DifficultyOptions, LanguageOptions, SkillOptions } from './bank-fields';
import { RubricEditor } from './rubric-editor';
import { TestsEditor } from './tests-editor';

const FIELDS = [
  'difficulty',
  'language',
  'skill_id',
  'title',
  'statement',
  'allowed_languages',
  'starter_code',
  'visible_tests',
  'hidden_tests',
  'time_limit_minutes',
  'cpu_time_limit_s',
  'memory_limit_mb',
  'rubric',
] as const;

const mono = 'font-mono text-sm';

/** Create / edit one coding task. Plain monospace textareas (Monaco arrives with the Stage 1 editor, Phase 4). */
export function TaskForm({
  companyId,
  defaultValues,
  editing,
  onDone,
  onCancel,
}: {
  companyId: string;
  defaultValues: TaskValues;
  editing?: TaskOut;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('hrBank');
  const tt = useTranslations('hrBank.task');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const save = useSaveTask(companyId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<TaskValues>({ resolver: zodResolver(taskSchema), defaultValues });
  const { register, control, formState } = form;
  const { errors } = formState;
  const allowed = useWatch({ control, name: 'allowed_languages' });

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync({ id: editing?.id, body: toTaskBody(values) });
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
        aria-label={editing ? tt('titleEdit') : tt('titleNew')}
        className="sp-card grid gap-5 p-4 sm:p-5"
      >
        <h2 className="text-lg font-semibold">{editing ? tt('titleEdit') : tt('titleNew')}</h2>
        {editing ? <Notice tone="info">{t('editResets')}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-3">
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
        <Field label={tt('fieldTitle')} error={fieldError(errors.title?.message)}>
          {(c) => <Input {...c} {...register('title')} />}
        </Field>
        <Field label={tt('statement')} error={fieldError(errors.statement?.message)}>
          {(c) => <Textarea {...c} rows={6} {...register('statement')} />}
        </Field>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{tt('allowedLanguages')}</legend>
          <div className="flex flex-wrap gap-x-5">
            {CODE_LANGUAGES.map((l) => (
              <label key={l} className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox value={l} {...register('allowed_languages')} />
                {tt(`codeLanguages.${l}`)}
              </label>
            ))}
          </div>
          {errors.allowed_languages ? (
            <FieldError>{fieldError(errors.allowed_languages.message)}</FieldError>
          ) : null}
        </fieldset>

        {CODE_LANGUAGES.filter((l) => allowed.includes(l)).map((l) => (
          <Field
            key={l}
            label={tt('starter', { lang: tt(`codeLanguages.${l}`) })}
            optionalLabel={tc('optional')}
          >
            {(c) => (
              <Textarea
                {...c}
                rows={5}
                spellCheck={false}
                className={mono}
                {...register(`starter_code.${l}`)}
              />
            )}
          </Field>
        ))}

        <TestsEditor name="visible_tests" max={20} />
        <TestsEditor name="hidden_tests" max={50} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tt('timeLimit')} error={fieldError(errors.time_limit_minutes?.message)}>
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                className="tabular-nums"
                {...register('time_limit_minutes')}
              />
            )}
          </Field>
          <Field label={tt('cpuLimit')} error={fieldError(errors.cpu_time_limit_s?.message)}>
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                className="tabular-nums"
                {...register('cpu_time_limit_s')}
              />
            )}
          </Field>
          <Field label={tt('memoryLimit')} error={fieldError(errors.memory_limit_mb?.message)}>
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                className="tabular-nums"
                {...register('memory_limit_mb')}
              />
            )}
          </Field>
        </div>

        <RubricEditor />

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">{tt('solution.legend')}</legend>
          <p className="text-sm text-muted">{tt('solution.hint')}</p>
          <Field
            label={tt('solution.language')}
            error={fieldError(errors.solution_language?.message)}
          >
            {(c) => (
              <NativeSelect {...c} {...register('solution_language')}>
                {CODE_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {tt(`codeLanguages.${l}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={tt('solution.code')} optionalLabel={tc('optional')}>
            {(c) => (
              <Textarea
                {...c}
                rows={6}
                spellCheck={false}
                className={mono}
                {...register('solution_code')}
              />
            )}
          </Field>
        </fieldset>

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
