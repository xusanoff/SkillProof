'use client';

import { MapPin, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useId } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Pagination } from '@/components/common/pagination';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SkillCombobox } from '@/features/catalog';
import { NeedsCompany, useActiveCompany } from '@/features/companies';
import { Link, useRouter } from '@/i18n/navigation';
import { useErrorText } from '@/lib/forms';
import { pageCount } from '@/lib/pagination';
import { useTalent } from '../api';
import {
  canSearchTalent,
  MAX_TALENT_SKILLS,
  parseTalentQuery,
  placeText,
  talentHref,
  TALENT_PAGE_SIZE,
  type PublicProfile,
  type TalentQuery,
} from '../model';
import { SkillBadges } from './skill-badges';

/** HR talent search: candidates who hold every chosen skill publicly. No contact details exist here. */
export function TalentSearch() {
  const { active } = useActiveCompany();
  if (!active) return <NeedsCompany />;
  return <TalentBody companyId={active.id} />;
}

function TalentBody({ companyId }: { companyId: string }) {
  const t = useTranslations('talent');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const router = useRouter();
  const params = useSearchParams();
  const q = parseTalentQuery(new URLSearchParams(params.toString()));
  const ready = canSearchTalent(q);
  const list = useTalent(companyId, q, ready);
  const minId = useId();
  const skillsId = useId();
  const go = (next: Partial<TalentQuery>) => router.replace(talentHref({ ...q, page: 1, ...next }));
  const full = q.skills.length >= MAX_TALENT_SKILLS;

  let body;
  if (!ready) {
    body = <EmptyState icon={Search} title={t('start.title')} description={t('start.body')} />;
  } else if (list.isError && !list.data) {
    body = (
      <ErrorState
        title={errorText(list.error)}
        onRetry={() => list.refetch()}
        retryLabel={tc('retry')}
      />
    );
  } else if (!list.data) {
    body = (
      <div className="grid gap-3" aria-hidden="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  } else if (list.data.items.length === 0) {
    body = <EmptyState icon={Search} title={t('none.title')} description={t('none.body')} />;
  } else {
    const { items, total } = list.data;
    body = (
      <div className="grid gap-4" aria-busy={list.isFetching}>
        <p role="status" className="text-sm text-muted tabular-nums">
          {t('total', { count: total })}
        </p>
        <ul className="grid gap-3">
          {items.map((p) => (
            <TalentCard key={p.candidate_id} profile={p} />
          ))}
        </ul>
        <Pagination
          page={q.page}
          totalPages={pageCount(total, TALENT_PAGE_SIZE)}
          pathname="/hr/talent"
          query={talentHref({ ...q, page: 1 }).split('?')[1] ?? ''}
          onPageChange={(page) => router.replace(talentHref({ ...q, page }))}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">{t('lead')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_8rem]">
        <div className="grid gap-1.5">
          <label htmlFor={skillsId} className="text-sm text-muted">
            {t('skills')}
          </label>
          <SkillCombobox
            id={skillsId}
            excludeIds={q.skills.map((s) => s.id)}
            disabled={full}
            placeholder={full ? t('skillsFull', { max: MAX_TALENT_SKILLS }) : t('addSkill')}
            onSelect={(s) => go({ skills: [...q.skills, { id: s.id, name: s.name }] })}
          />
          {q.skills.length ? (
            <ul className="flex flex-wrap gap-2" aria-label={t('chosen')}>
              {q.skills.map((s) => (
                <li
                  key={s.id}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-surface pl-3 text-sm"
                >
                  {s.name || t('skillUnnamed')}
                  <button
                    type="button"
                    aria-label={t('remove', { name: s.name || t('skillUnnamed') })}
                    onClick={() => go({ skills: q.skills.filter((x) => x.id !== s.id) })}
                    className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor={minId} className="text-sm text-muted">
            {t('minScore')}
          </label>
          <Input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            defaultValue={q.minScore ?? ''}
            key={q.minScore ?? 'none'}
            className="tabular-nums"
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const n = raw === '' ? null : Math.min(100, Math.max(0, Math.round(Number(raw))));
              const next = n != null && Number.isFinite(n) && n > 0 ? n : null;
              if (next !== q.minScore) go({ minScore: next });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </div>
      </div>
      {body}
    </div>
  );
}

function TalentCard({ profile: p }: { profile: PublicProfile }) {
  const t = useTranslations('talent');
  const place = placeText(p);
  return (
    <li className="grid gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{p.full_name}</h2>
        <Link
          href={`/profiles/${p.candidate_id}`}
          className="inline-flex min-h-11 items-center font-medium text-accent hover:underline"
        >
          {t('openProfile')}
          <span className="sr-only"> {p.full_name}</span>
        </Link>
      </div>
      {p.headline ? <p className="text-muted">{p.headline}</p> : null}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {place ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-4 text-muted" />
            {place}
          </span>
        ) : null}
        {p.experience_years != null ? (
          <span className="tabular-nums">{t('experience', { years: p.experience_years })}</span>
        ) : null}
      </p>
      <SkillBadges skills={p.skills} compact />
    </li>
  );
}
