'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { appConfig } from '@/config/app';
import { localizedName, useProfessionAreas, useRegions } from '@/features/catalog';
import { EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, REMOTE_TYPES } from '@/features/vacancies';
import { useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { applyServerErrors, useErrorText, useFieldError } from '@/lib/forms';
import { useCreateVacancy, useUpdateVacancy } from '../api';
import {
  DESCRIPTION_MAX,
  publishProblem,
  REQUIREMENTS_MAX,
  TITLE_MAX,
  toVacancyBody,
  VACANCY_FIELDS,
  vacancySchema,
  type VacancyStatus,
  type VacancyValues,
} from '../model';
import { SkillsPicker } from './skills-picker';

interface VacancyFormProps {
  companyId: string;
  defaultValues: VacancyValues;
  /** Existing vacancy (edit); undefined = new. */
  vacancyId?: string;
  status?: VacancyStatus;
  onContinue?: (id: string) => void;
}

type Intent = 'draft' | 'publish' | 'save';

/**
 * Create / edit a vacancy. New and draft: "Qoralama sifatida saqlash" + "Nashr qilish".
 * Published / closed: "O'zgarishlarni saqlash". Limits mirror the API; 422 details map
 * to fields; `description_required` lands on the description.
 */
export function VacancyForm({
  companyId,
  defaultValues,
  vacancyId,
  status,
  onContinue,
}: VacancyFormProps) {
  const t = useTranslations('vacancyForm');
  const tv = useTranslations('vacancy');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const fieldError = useFieldError();
  const { regions } = useRegions();
  const areas = useProfessionAreas();
  const create = useCreateVacancy(companyId);
  const update = useUpdateVacancy(companyId);
  // A new vacancy that was created but failed to publish continues as a draft edit.
  const [createdId, setCreatedId] = useState<string | undefined>(vacancyId);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const isDraft = !status || status === 'draft';
  const pending = create.isPending || update.isPending;

  const form = useForm<VacancyValues>({ resolver: zodResolver(vacancySchema), defaultValues });
  const { errors } = form.formState;
  const err = (n: (typeof VACANCY_FIELDS)[number]) =>
    fieldError((errors[n] as { message?: string } | undefined)?.message);
  const optional = tc('optional');

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'description_required') {
      form.setError(
        'description',
        { type: 'server', message: '@errors.description_required' },
        { shouldFocus: true },
      );
      return;
    }
    if (!applyServerErrors(error, form.setError, VACANCY_FIELDS)) setFormError(errorText(error));
  };

  const submit = (which: Intent) =>
    form.handleSubmit(async (values) => {
      setFormError(null);
      setIntent(which);
      if (which === 'publish' && publishProblem(values)) {
        form.setError(
          'description',
          { type: 'client', message: 'descriptionRequired' },
          { shouldFocus: true },
        );
        return;
      }
      const body = toVacancyBody(values);
      try {
        let id = createdId;
        if (!id) {
          id = (await create.mutateAsync(body)).id;
          setCreatedId(id);
        }
        if (createdId || which === 'publish') {
          await update.mutateAsync({
            id,
            body: which === 'publish' ? { ...(createdId ? body : {}), status: 'published' } : body,
          });
        }
        if (onContinue) {
          onContinue(id);
          return;
        }
        const tab = which === 'draft' ? 'draft' : (status ?? 'published');
        router.push(`/hr/vacancies?status=${which === 'publish' ? 'published' : tab}`);
      } catch (error) {
        fail(error);
      }
    });

  return (
    <form
      noValidate
      onSubmit={submit(onContinue ? 'draft' : isDraft ? 'publish' : 'save')}
      className="grid gap-8"
      aria-label={t('formLabel')}
    >
      {formError ? (
        <Notice tone="danger" role="alert">
          {formError}
        </Notice>
      ) : null}

      <Section title={t('sections.main')}>
        <Field label={t('title')} hint={t('titleHint')} error={err('title')}>
          {(c) => <Input {...c} {...form.register('title')} maxLength={TITLE_MAX} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t('area')} error={err('profession_area')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('profession_area')}>
                {(areas.data ?? [{ slug: defaultValues.profession_area, names: {} }]).map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {localizedName(a.names, locale, a.slug)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('region')} optionalLabel={optional} error={err('region_code')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('region_code')}>
                <option value="">{t('regionNone')}</option>
                {regions.map((r) => (
                  <option key={r.code} value={r.code}>
                    {localizedName(r.names, locale, r.code)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('city')} optionalLabel={optional} error={err('city')}>
            {(c) => <Input {...c} {...form.register('city')} maxLength={120} />}
          </Field>
        </div>
      </Section>

      <Section title={t('sections.conditions')}>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={t('remoteType')} error={err('remote_type')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('remote_type')}>
                {REMOTE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {tv(`remoteType.${v}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('employmentType')} error={err('employment_type')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('employment_type')}>
                {EMPLOYMENT_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {tv(`employmentType.${v}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('experience')} error={err('experience_level')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('experience_level')}>
                {EXPERIENCE_LEVELS.map((v) => (
                  <option key={v} value={v}>
                    {tv(`experience.${v}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-[1fr_1fr_8rem]">
          <Field label={t('salaryMin')} optionalLabel={optional} error={err('salary_min')}>
            {(c) => (
              <Input
                {...c}
                {...form.register('salary_min')}
                inputMode="numeric"
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('salaryMax')} optionalLabel={optional} error={err('salary_max')}>
            {(c) => (
              <Input
                {...c}
                {...form.register('salary_max')}
                inputMode="numeric"
                className="tabular-nums"
              />
            )}
          </Field>
          <Field label={t('currency')} error={err('currency')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('currency')}>
                {appConfig.currencies.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <p className="-mt-2 text-sm text-muted">{t('salaryHint')}</p>
      </Section>

      <Section title={t('sections.description')}>
        <Field label={t('description')} hint={t('descriptionHint')} error={err('description')}>
          {(c) => (
            <Textarea
              {...c}
              {...form.register('description')}
              rows={10}
              maxLength={DESCRIPTION_MAX}
            />
          )}
        </Field>
        <Field
          label={t('requirements')}
          optionalLabel={optional}
          hint={t('requirementsHint')}
          error={err('requirements')}
        >
          {(c) => (
            <Textarea
              {...c}
              {...form.register('requirements')}
              rows={6}
              maxLength={REQUIREMENTS_MAX}
            />
          )}
        </Field>
      </Section>

      <Section title={t('sections.skills')}>
        <SkillsPicker control={form.control} register={form.register} error={err('skills')} />
      </Section>

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end md:bottom-0">
        {onContinue ? (
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? tc('saving') : t('wizard.next')}
          </Button>
        ) : isDraft ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 px-5"
              disabled={pending}
              aria-busy={(pending && intent === 'draft') || undefined}
              onClick={submit('draft')}
            >
              {pending && intent === 'draft' ? tc('saving') : t('saveDraft')}
            </Button>
            <Button
              type="submit"
              size="lg"
              className="min-h-11 px-6"
              disabled={pending}
              aria-busy={(pending && intent === 'publish') || undefined}
            >
              {pending && intent === 'publish' ? t('publishing') : t('publish')}
            </Button>
          </>
        ) : (
          <Button
            type="submit"
            size="lg"
            className="min-h-11 px-6"
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? tc('saving') : t('save')}
          </Button>
        )}
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sp-card grid gap-5 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
