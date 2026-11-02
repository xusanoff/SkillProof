'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { FieldError } from '@/components/common/field';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ApiError } from '@/lib/api';
import { useErrorText } from '@/lib/forms';
import { useAcceptRules, useInterviewState } from '../api';
import type { InterviewState, RulesLang } from '../model';
import en from '../rules/en.json';
import ru from '../rules/ru.json';
import uz from '../rules/uz.json';

const RULES = { uz, ru, en } as const;

/** Rules in the INTERVIEW language (`InterviewState.language`), with the version being accepted. */
export function RulesStep({ state, lang }: { state: InterviewState; lang: RulesLang }) {
  const r = RULES[lang];
  const t = useTranslations('interview.rules');
  const errorText = useErrorText();
  const accept = useAcceptRules(state.application_id);
  const state$ = useInterviewState(state.application_id);
  const [checked, setChecked] = useState(false);
  const [missing, setMissing] = useState(false);
  const id = useId();
  const mismatch =
    accept.error instanceof ApiError && accept.error.code === 'rules_version_mismatch';

  return (
    <article lang={lang} className="mx-auto grid max-w-prose gap-5">
      <header>
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <p className="mt-1 text-muted">{state.vacancy_title}</p>
        <p className="mt-2">{r.lead}</p>
      </header>
      <ol className="grid gap-4">
        {r.items.map((item, i) => (
          <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
            <span aria-hidden="true" className="font-semibold text-muted tabular-nums">
              {i + 1}.
            </span>
            <div>
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-0.5">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted tabular-nums">
        {r.version}: {state.rules_version}
      </p>
      <div className="grid gap-2">
        <label className="flex min-h-11 items-start gap-3">
          <Checkbox
            checked={checked}
            aria-describedby={missing ? `${id}-err` : undefined}
            aria-invalid={missing || undefined}
            onChange={(e) => {
              setChecked(e.target.checked);
              setMissing(false);
            }}
            className="mt-0.5"
          />
          <span className="font-medium">{r.accept}</span>
        </label>
        {missing ? <FieldError id={`${id}-err`}>{r.acceptRequired}</FieldError> : null}
      </div>
      {accept.isError ? (
        <Notice
          tone="danger"
          role="alert"
          action={
            mismatch ? (
              <Button variant="outline" className="min-h-11" onClick={() => void state$.refetch()}>
                {t('reload')}
              </Button>
            ) : undefined
          }
        >
          {mismatch ? t('versionChanged') : errorText(accept.error)}
        </Notice>
      ) : null}
      <div>
        <Button
          size="lg"
          className="min-h-11 px-6"
          disabled={accept.isPending}
          onClick={() => {
            if (!checked) return setMissing(true);
            accept.mutate(state.rules_version);
          }}
        >
          {accept.isPending ? r.saving : r.continue}
        </Button>
      </div>
    </article>
  );
}
