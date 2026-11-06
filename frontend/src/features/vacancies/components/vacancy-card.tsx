'use client';

import { BadgeCheck, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RelativeDate } from '@/components/common/relative-date';
import { Salary } from '@/components/common/salary';
import { useRegionLabel } from '@/features/catalog';
import { CompanyLogo } from '@/features/companies';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_SKILLS, cardTags, type VacancyCard as VacancyCardData } from '../model';
import { ApplyAction } from './apply-action';
import { SaveButton } from './save-button';

interface VacancyCardProps {
  vacancy: VacancyCardData;
  headingLevel?: 2 | 3;
  /** Without the actions row (e.g. inside an application row). */
  bare?: boolean;
  /** false on the company's own page (the name and logo are already in the header). */
  showCompany?: boolean;
  className?: string;
}

/**
 * Dense hh-style card: title link → salary → company (logo, verified) → place → tags →
 * skills → date + actions. Content first, no decoration.
 */
export function VacancyCard({
  vacancy: v,
  headingLevel = 2,
  bare,
  showCompany = true,
  className,
}: VacancyCardProps) {
  const t = useTranslations('vacancy');
  const regionLabel = useRegionLabel();
  const Heading = `h${headingLevel}` as const;
  const place = [v.city, regionLabel(v.region_code)].filter(Boolean).join(', ');
  const tags = cardTags(v);
  const titleId = `vacancy-${v.id}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className={cn('sp-card p-5 transition-colors hover:border-border-strong sm:p-6', className)}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Heading id={titleId} className="text-lg leading-snug font-semibold">
            <Link
              href={`/vacancies/${v.id}`}
              className="text-fg underline-offset-4 hover:text-accent hover:underline"
            >
              {v.title}
            </Link>
          </Heading>
          <Salary
            min={v.salary_min}
            max={v.salary_max}
            currency={v.currency}
            className="mt-1.5 text-lg"
          />
          {showCompany ? (
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-sm">
              <Link
                href={`/companies/${v.company.slug}`}
                className="truncate text-fg underline-offset-4 hover:underline"
              >
                {v.company.name}
              </Link>
              {v.company.is_verified ? (
                <BadgeCheck
                  aria-label={t('verified')}
                  role="img"
                  className="size-4 shrink-0 text-accent"
                />
              ) : null}
            </p>
          ) : null}
          {place ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              {place}
            </p>
          ) : null}
        </div>
        {showCompany ? (
          <CompanyLogo
            logoUrl={v.company.logo_url}
            name={v.company.name}
            size={48}
            className="hidden sm:inline-flex"
          />
        ) : null}
      </div>

      {tags.length ? (
        <ul aria-label={t('tagsLabel')} className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg"
            >
              {t(`tags.${tag}` as 'tags.noExperience')}
            </li>
          ))}
        </ul>
      ) : null}

      {v.skills.length ? (
        <ul aria-label={t('skillsLabel')} className="mt-3 flex flex-wrap gap-1.5">
          {v.skills.slice(0, CARD_SKILLS).map((s) => (
            <li
              key={s.slug}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted"
            >
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}

      {bare ? null : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <ApplyAction vacancy={v} />
            <SaveButton vacancy={v} />
          </div>
          {v.published_at ? (
            <RelativeDate value={v.published_at} className="text-sm text-muted" />
          ) : null}
        </div>
      )}
    </article>
  );
}
