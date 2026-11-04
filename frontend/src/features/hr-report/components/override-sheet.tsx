'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Field } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { RECOMMENDATIONS } from '@/features/hr-stage1';
import { useErrorText } from '@/lib/forms';
import { useOverride } from '../api';
import {
  COMMENT_MAX,
  overrideBody,
  overrideFields,
  validateOverride,
  type HrReport,
  type OverrideDraft,
  type OverrideErrors,
} from '../model';

/** Override a score, the recommendation or a disqualification. A comment is required; the server decides. */
export function OverrideSheet({ report, companyId }: { report: HrReport; companyId: string }) {
  const t = useTranslations('hrReport.override');
  const tc = useTranslations('common');
  const tr = useTranslations('hrReport.recommendation');
  const errorText = useErrorText();
  const override = useOverride(companyId, report.application_id);
  const formId = useId();
  const fields = overrideFields(report);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OverrideDraft>({ field: fields[0]!, value: '', comment: '' });
  const [errors, setErrors] = useState<OverrideErrors>({});
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<OverrideDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
    setSaved(false);
  };

  const submit = () => {
    const found = validateOverride(draft);
    setErrors(found);
    if (found.value || found.comment) return;
    override.mutate(overrideBody(draft), {
      onSuccess: () => {
        setOpen(false);
        setSaved(true);
        setDraft((d) => ({ ...d, value: '', comment: '' }));
      },
    });
  };

  return (
    <div className="grid gap-2">
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) override.reset();
        }}
      >
        <SheetTrigger asChild>
          <Button variant="outline" size="lg" className="min-h-11 px-4">
            {t('open')}
          </Button>
        </SheetTrigger>
        <SheetContent closeLabel={tc('close')}>
          <SheetTitle className="text-lg font-semibold">{t('title')}</SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted">{t('lead')}</SheetDescription>
          <form
            id={formId}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="mt-4 grid gap-4"
          >
            <Field label={t('field')}>
              {(c) => (
                <NativeSelect
                  {...c}
                  value={draft.field}
                  onChange={(e) =>
                    set({ field: e.target.value as OverrideDraft['field'], value: '' })
                  }
                >
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {t(`fields.${f}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            {draft.field === 'disqualification' ? (
              <p className="text-sm text-muted">{t('liftHint')}</p>
            ) : draft.field === 'recommendation' ? (
              <Field
                label={t('value')}
                error={errors.value ? t(`errors.${errors.value}`) : undefined}
              >
                {(c) => (
                  <NativeSelect
                    {...c}
                    value={draft.value}
                    onChange={(e) => set({ value: e.target.value })}
                  >
                    <option value="">{t('pick')}</option>
                    {RECOMMENDATIONS.map((r) => (
                      <option key={r} value={r}>
                        {tr(r)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
            ) : (
              <Field
                label={t('valuePercent')}
                hint={t('valueHint')}
                error={errors.value ? t(`errors.${errors.value}`) : undefined}
              >
                {(c) => (
                  <Input
                    {...c}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    value={draft.value}
                    className="tabular-nums"
                    onChange={(e) => set({ value: e.target.value })}
                  />
                )}
              </Field>
            )}

            <Field
              label={t('comment')}
              hint={t('commentHint')}
              error={errors.comment ? t(`errors.${errors.comment}`) : undefined}
            >
              {(c) => (
                <Textarea
                  {...c}
                  rows={4}
                  maxLength={COMMENT_MAX + 200}
                  value={draft.comment}
                  onChange={(e) => set({ comment: e.target.value })}
                />
              )}
            </Field>

            {override.isError ? (
              <Notice tone="danger" role="alert">
                {errorText(override.error)}
              </Notice>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="min-h-11"
                onClick={() => setOpen(false)}
              >
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                size="lg"
                className="min-h-11 px-5"
                disabled={override.isPending}
              >
                {override.isPending ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {saved ? (
        <p role="status" className="text-sm text-success">
          {t('saved')}
        </p>
      ) : null}
    </div>
  );
}
