'use client';

import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { GLOBAL_SCOPE, useQuestions } from '../api';
import { emptyQuestionValues, toQuestionValues, type QuestionOut } from '../model';
import { useSkillName } from './bank-fields';
import { BankItemActions } from './bank-item-actions';
import { BankShell, useBankFilters } from './bank-shell';
import {
  ApprovalBadge,
  FlagReasons,
  GlobalBadge,
  SourceBadge,
  VerificationBadge,
} from './item-badges';
import { QuestionForm } from './question-form';

/** "Savollar banki": company questions (+ optional global templates). */
export function QuestionBank() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Bank companyId={active.id} pathname="/hr/questions" />;
}

/** The same bank for the platform admin: global templates, usable by every company. */
export function TemplateQuestionBank() {
  return <Bank companyId={GLOBAL_SCOPE} pathname="/admin/questions" />;
}

type Editing = { item?: QuestionOut } | null;

function Bank({ companyId, pathname }: { companyId: string; pathname: string }) {
  const t = useTranslations('hrBank');
  const tq = useTranslations('hrBank.question');
  const { filters, setFilters } = useBankFilters(pathname);
  const list = useQuestions(companyId, filters);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const skillName = useSkillName();

  return (
    <BankShell
      showGlobalToggle={companyId !== GLOBAL_SCOPE}
      pathname={pathname}
      title={tq('title')}
      newLabel={tq('new')}
      icon={CircleHelp}
      emptyTitle={tq('empty')}
      list={list}
      filters={filters}
      setFilters={setFilters}
      notice={notice}
      onNew={() => setEditing({})}
      editor={
        editing ? (
          <QuestionForm
            key={editing.item?.id ?? 'new'}
            companyId={companyId}
            defaultValues={editing.item ? toQuestionValues(editing.item) : emptyQuestionValues()}
            editing={editing.item}
            onCancel={() => setEditing(null)}
            onDone={(m) => {
              setEditing(null);
              setNotice(m);
            }}
          />
        ) : null
      }
      renderItem={(q) => (
        <article
          aria-labelledby={`q-${q.id}`}
          className="grid gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium">
              {tq(`types.${q.type}`)}
            </span>
            <span className="text-xs text-muted tabular-nums">
              {t('difficultyOption', { n: q.difficulty })}
            </span>
            <span className="text-xs text-muted">{t(`languages.${q.language as 'uz'}`)}</span>
            {skillName(q.skill_id) ? (
              <span className="text-xs text-muted">{skillName(q.skill_id)}</span>
            ) : null}
          </div>
          <p id={`q-${q.id}`} className="max-w-prose font-medium whitespace-pre-line">
            {q.text}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ApprovalBadge approved={q.is_approved} />
            <VerificationBadge status={q.verification_status} />
            <SourceBadge source={q.source} />
            {q.is_global ? <GlobalBadge /> : null}
          </div>
          <FlagReasons status={q.verification_status} report={q.verification_report} />
          <BankItemActions
            companyId={companyId}
            kind="questions"
            id={q.id}
            label={q.text.slice(0, 40)}
            approved={q.is_approved}
            isGlobal={q.is_global}
            onEdit={() => setEditing({ item: q })}
            onDone={setNotice}
          />
        </article>
      )}
    />
  );
}
