'use client';

import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { placeText, type PublicProfile } from '../model';
import { SkillBadges } from './skill-badges';

/** Public page: name, headline, place, experience and the skills the candidate chose to show. */
export function PublicProfileView({ profile: p }: { profile: PublicProfile }) {
  const t = useTranslations('verifiedSkills.publicPage');
  const place = placeText(p);
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6 lg:py-12">
      <header className="grid gap-1">
        <h1 className="sp-page-title">{p.full_name}</h1>
        {p.headline ? <p className="text-lg text-muted">{p.headline}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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
      </header>
      <section aria-labelledby="pp-skills" className="grid gap-3">
        <h2 id="pp-skills" className="text-lg font-semibold">
          {t('skills')}
        </h2>
        <SkillBadges skills={p.skills} />
        <p className="max-w-prose text-sm text-muted">{t('note')}</p>
      </section>
    </article>
  );
}
