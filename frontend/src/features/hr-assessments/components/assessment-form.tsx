'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useWatch, Controller, useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { Field, FieldError } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { fieldErrors } from '@/lib/api';
import { useErrorText, useFieldError } from '@/lib/forms';
import { useQuestions, useSaveAssessment, useTasks } from '../api';
import {
  assessmentSchema,
  defaultFilters,
  QUESTION_MODES,
  STAGE1_TASKS_MAX,
  thresholdHint,
  toAssessmentBody,
  toAssessmentValues,
  type AssessmentOut,
  type AssessmentValues,
  type VerificationStatus,
  emptyAssessmentValues,
} from '../model';
import { LanguageOptions } from './bank-fields';
import { ApprovalBadge, VerificationBadge } from './item-badges';

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="sp-card grid gap-4 p-4 sm:p-5">
      <div>
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {hint ? <p className="mt-1 max-w-prose text-sm text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  form,
  name,
  label,
  hint,
}: {
  form: UseFormReturn<AssessmentValues>;
  name: 'allow_skill_reuse' | 'auto_approve_ai_items' | 's2_adaptive';
  label: string;
  hint?: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start gap-3">
          <Switch
            id={`sw-${name}`}
            checked={field.value}
            onCheckedChange={field.onChange}
            aria-describedby={hint ? `sw-${name}-hint` : undefined}
            className="mt-0.5"
          />
          <div>
            <label htmlFor={`sw-${name}`} className="text-sm font-medium">
              {label}
            </label>
            {hint ? (
              <p id={`sw-${name}-hint`} className="text-sm text-muted">
                {hint}
              </p>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}

/** The whole assessment config. Empty override fields fall back to the global defaults (shown as placeholders). */
export function AssessmentForm({
  companyId,
  vacancyId,
  assessment,
  onSaved,
}: {
  companyId: string;
  vacancyId: string;
  assessment: AssessmentOut | null;
  onSaved: (message: string) => void;
}) {
  const t = useTranslations('hrAssessment');
  const tb = useTranslations('hrBank');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const save = useSaveAssessment(companyId, vacancyId);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: assessment ? toAssessmentValues(assessment) : emptyAssessmentValues,
  });
  const { register, control, setValue, formState } = form;
  const { errors } = formState;
  const qs = useFieldArray({ control, name: 'questions' });
  const taskIds = useWatch({ control, name: 'task_ids' });
  const eff = assessment?.effective_thresholds;
  const hint = (path: string) => thresholdHint(eff, path);

  // Bank items for the pickers + names of what is already attached.
  const bankTasks = useTasks(companyId, { ...defaultFilters, include_global: true }, 100);
  const bankQuestions = useQuestions(companyId, { ...defaultFilters, include_global: true }, 100);
  const tasksById = new Map<
    string,
    { title: string; approved: boolean; status: VerificationStatus }
  >();
  for (const x of [...(assessment?.tasks ?? []), ...(bankTasks.data?.items ?? [])]) {
    tasksById.set(x.id, { title: x.title, approved: x.is_approved, status: x.verification_status });
  }
  const questionsById = new Map<
    string,
    { text: string; approved: boolean; status: VerificationStatus }
  >();
  for (const x of [...(assessment?.questions ?? []), ...(bankQuestions.data?.items ?? [])]) {
    questionsById.set(x.id, {
      text: x.text,
      approved: x.is_approved,
      status: x.verification_status,
    });
  }
  const chosenQuestions = new Set(qs.fields.map((f) => f.question_id));
  const [pickTask, setPickTask] = useState('');
  const [pickQuestion, setPickQuestion] = useState('');

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync(toAssessmentBody(values));
      onSaved(t('saved'));
    } catch (error) {
      let applied = false;
      for (const name of Object.keys(fieldErrors(error))) {
        if (name === 'paste_max_lines' || name === 'inactivity_limit_s') {
          form.setError(
            `integrity.${name}`,
            { type: 'server', message: 'invalid' },
            { shouldFocus: !applied },
          );
          applied = true;
        }
      }
      if (!applied) setFormError(errorText(error));
    }
  });

  const numField = (
    name: 's1_duration' | 's1_threshold' | 's2_duration' | 's2_count' | 's2_threshold',
    label: string,
    placeholder: string,
  ) => (
    <Field label={label} optionalLabel={tc('optional')} error={fieldError(errors[name]?.message)}>
      {(c) => (
        <Input
          {...c}
          inputMode="decimal"
          className="tabular-nums"
          placeholder={placeholder}
          {...register(name)}
        />
      )}
    </Field>
  );

  return (
    <form noValidate onSubmit={submit} aria-label={t('formLabel')} className="grid gap-5">
      <Section id="as-general" title={t('general.title')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('general.language')}>
            {(c) => (
              <NativeSelect {...c} {...register('language')}>
                <LanguageOptions />
              </NativeSelect>
            )}
          </Field>
          <Field label={t('general.questionMode')} hint={t('general.questionModeHint')}>
            {(c) => (
              <NativeSelect {...c} {...register('question_mode')}>
                {QUESTION_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`general.modes.${m}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <Toggle
          form={form}
          name="allow_skill_reuse"
          label={t('general.skillReuse')}
          hint={t('general.skillReuseHint')}
        />
        <Toggle
          form={form}
          name="auto_approve_ai_items"
          label={t('general.autoApprove')}
          hint={t('general.autoApproveHint')}
        />
      </Section>

      <Section id="as-stage1" title={t('stage1.title')} hint={t('stage1.hint')}>
        <ul className="grid gap-2">
          {taskIds.map((id, i) => {
            const x = tasksById.get(id);
            return (
              <li
                key={id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
              >
                <span className="min-w-0 flex-1 font-medium">{x?.title ?? '—'}</span>
                {x ? (
                  <>
                    <ApprovalBadge approved={x.approved} />
                    <VerificationBadge status={x.status} />
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  aria-label={t('stage1.remove', { title: x?.title ?? String(i + 1) })}
                  onClick={() =>
                    setValue(
                      'task_ids',
                      taskIds.filter((v) => v !== id),
                      { shouldDirty: true },
                    )
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
        {taskIds.length === 0 ? <p className="text-sm text-muted">{t('stage1.none')}</p> : null}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('stage1.pick')} className="min-w-52 flex-1">
            {(c) => (
              <NativeSelect
                {...c}
                value={pickTask}
                onChange={(e) => setPickTask(e.target.value)}
                disabled={taskIds.length >= STAGE1_TASKS_MAX}
              >
                <option value="">{t('stage1.pickEmpty')}</option>
                {(bankTasks.data?.items ?? [])
                  .filter((x) => !taskIds.includes(x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                      {x.is_approved ? '' : ` (${tb('notApproved')})`}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5"
            disabled={!pickTask || taskIds.length >= STAGE1_TASKS_MAX}
            onClick={() => {
              setValue('task_ids', [...taskIds, pickTask], { shouldDirty: true });
              setPickTask('');
            }}
          >
            <Plus aria-hidden="true" />
            {t('stage1.add')}
          </Button>
        </div>
        {errors.task_ids ? <FieldError>{fieldError(errors.task_ids.message)}</FieldError> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {numField('s1_duration', t('stage1.duration'), hint('stage1.task_time_limit_minutes'))}
          {numField('s1_threshold', t('stage1.threshold'), hint('stage1.pass_threshold'))}
        </div>
      </Section>

      <Section id="as-stage2" title={t('stage2.title')} hint={t('stage2.hint')}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numField('s2_duration', t('stage2.duration'), hint('stage2.session_minutes'))}
          {numField('s2_count', t('stage2.count'), hint('stage2.question_count'))}
          {numField('s2_threshold', t('stage2.threshold'), hint('stage2.pass_threshold'))}
          <Field label={t('stage2.mode')}>
            {(c) => (
              <NativeSelect {...c} {...register('s2_mode')}>
                <option value="voice">{t('stage2.modes.voice')}</option>
                <option value="text">{t('stage2.modes.text')}</option>
              </NativeSelect>
            )}
          </Field>
        </div>
        <Toggle
          form={form}
          name="s2_adaptive"
          label={t('stage2.adaptive')}
          hint={t('stage2.adaptiveHint')}
        />

        <h3 className="text-sm font-semibold">{t('stage2.questions')}</h3>
        {qs.fields.length === 0 ? <p className="text-sm text-muted">{t('stage2.none')}</p> : null}
        <ol className="grid gap-2">
          {qs.fields.map((f, i) => {
            const x = questionsById.get(f.question_id);
            const label = (x?.text ?? '—').slice(0, 50);
            return (
              <li key={f.id} className="grid gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-6 tabular-nums text-sm text-muted">{i + 1}.</span>
                  <span className="min-w-0 flex-1 font-medium">{x?.text ?? '—'}</span>
                  {x ? (
                    <>
                      <ApprovalBadge approved={x.approved} />
                      <VerificationBadge status={x.status} />
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox {...register(`questions.${i}.is_mandatory`)} />
                    {t('stage2.mandatory')}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    disabled={i === 0}
                    onClick={() => qs.move(i, i - 1)}
                    aria-label={t('stage2.up', { label })}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    disabled={i === qs.fields.length - 1}
                    onClick={() => qs.move(i, i + 1)}
                    aria-label={t('stage2.down', { label })}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => qs.remove(i)}
                    aria-label={t('stage2.remove', { label })}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('stage2.pick')} className="min-w-52 flex-1">
            {(c) => (
              <NativeSelect
                {...c}
                value={pickQuestion}
                onChange={(e) => setPickQuestion(e.target.value)}
              >
                <option value="">{t('stage2.pickEmpty')}</option>
                {(bankQuestions.data?.items ?? [])
                  .filter((x) => !chosenQuestions.has(x.id))
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.text.slice(0, 80)}
                      {x.is_approved ? '' : ` (${tb('notApproved')})`}
                    </option>
                  ))}
              </NativeSelect>
            )}
          </Field>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-1.5"
            disabled={!pickQuestion}
            onClick={() => {
              qs.append({ question_id: pickQuestion, is_mandatory: false });
              setPickQuestion('');
            }}
          >
            <Plus aria-hidden="true" />
            {t('stage2.add')}
          </Button>
        </div>
        {errors.questions ? (
          <FieldError>{fieldError(errors.questions.message ?? '@errors.unknown_items')}</FieldError>
        ) : null}
      </Section>

      <Section id="as-integrity" title={t('integrity.title')} hint={t('integrity.hint')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('integrity.pasteMax')}
            optionalLabel={tc('optional')}
            error={fieldError(errors.integrity?.paste_max_lines?.message)}
          >
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                className="tabular-nums"
                placeholder={hint('integrity.paste_max_lines')}
                {...register('integrity.paste_max_lines')}
              />
            )}
          </Field>
          <Field
            label={t('integrity.inactivity')}
            optionalLabel={tc('optional')}
            error={fieldError(errors.integrity?.inactivity_limit_s?.message)}
          >
            {(c) => (
              <Input
                {...c}
                inputMode="numeric"
                className="tabular-nums"
                placeholder={hint('integrity.inactivity_limit_s')}
                {...register('integrity.inactivity_limit_s')}
              />
            )}
          </Field>
        </div>
        <p className="text-sm text-muted">{t('integrity.emptyDefault')}</p>
      </Section>

      {formError ? (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      ) : null}
      <div>
        <Button type="submit" size="lg" className="min-h-11 px-6" disabled={save.isPending}>
          {save.isPending ? tc('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
