'use client';

import { Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { useTasks } from '../api';
import { emptyTaskValues, toTaskValues, type TaskOut } from '../model';
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
import { TaskForm } from './task-form';

/** "Topshiriqlar banki": coding tasks (+ optional global templates). */
export function TaskBank() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <Bank companyId={active.id} />;
}

type Editing = { item?: TaskOut } | null;

function Bank({ companyId }: { companyId: string }) {
  const t = useTranslations('hrBank');
  const tt = useTranslations('hrBank.task');
  const { filters, setFilters } = useBankFilters('/hr/tasks');
  const list = useTasks(companyId, filters);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const skillName = useSkillName();

  return (
    <BankShell
      pathname="/hr/tasks"
      title={tt('title')}
      newLabel={tt('new')}
      icon={Code2}
      emptyTitle={tt('empty')}
      list={list}
      filters={filters}
      setFilters={setFilters}
      notice={notice}
      onNew={() => setEditing({})}
      editor={
        editing ? (
          <TaskForm
            key={editing.item?.id ?? 'new'}
            companyId={companyId}
            defaultValues={editing.item ? toTaskValues(editing.item) : emptyTaskValues()}
            editing={editing.item}
            onCancel={() => setEditing(null)}
            onDone={(m) => {
              setEditing(null);
              setNotice(m);
            }}
          />
        ) : null
      }
      renderItem={(x) => (
        <article
          aria-labelledby={`t-${x.id}`}
          className="grid gap-3 rounded-xl border border-border bg-surface p-4"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted tabular-nums">
              {t('difficultyOption', { n: x.difficulty })}
            </span>
            <span className="text-xs text-muted">{t(`languages.${x.language as 'uz'}`)}</span>
            {skillName(x.skill_id) ? (
              <span className="text-xs text-muted">{skillName(x.skill_id)}</span>
            ) : null}
            <span className="text-xs text-muted tabular-nums">
              {tt('limitMinutes', { n: x.time_limit_minutes })}
            </span>
          </div>
          <h2 id={`t-${x.id}`} className="font-semibold">
            {x.title}
          </h2>
          <p className="text-sm text-muted">
            {x.allowed_languages.join(', ')} ·{' '}
            {tt('testsCount', { visible: x.visible_tests.length, hidden: x.hidden_tests.length })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <ApprovalBadge approved={x.is_approved} />
            <VerificationBadge status={x.verification_status} />
            <SourceBadge source={x.source} />
            {x.is_global ? <GlobalBadge /> : null}
          </div>
          <FlagReasons status={x.verification_status} report={x.verification_report} />
          <BankItemActions
            companyId={companyId}
            kind="tasks"
            id={x.id}
            label={x.title}
            approved={x.is_approved}
            isGlobal={x.is_global}
            onEdit={() => setEditing({ item: x })}
            onDone={setNotice}
          />
        </article>
      )}
    />
  );
}
