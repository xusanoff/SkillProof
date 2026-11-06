import { BadgeCheck, Factory, Globe, MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PlainText } from '@/components/common/plain-text';
import type { ResponseOf } from '@/lib/api';
import { CompanyLogo } from './company-logo';

type CompanyPublic = ResponseOf<'/api/v1/companies/by-slug/{slug}', 'get'>;

function safeWebsite(url: string | null): URL | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** Public company header (hh "employer page"): logo, name, verified, facts, description. */
export function CompanyProfile({ company: c }: { company: CompanyPublic }) {
  const t = useTranslations('companyPage');
  const locale = useLocale();
  const website = safeWebsite(c.website);
  const country = c.country
    ? new Intl.DisplayNames([locale], { type: 'region' }).of(c.country)
    : null;
  const place = [c.city, country].filter(Boolean).join(', ');

  return (
    <section className="sp-card p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <CompanyLogo logoUrl={c.logo_url} name={c.name} size={80} />
        <div className="min-w-0">
          <h1 className="sp-page-title flex flex-wrap items-center gap-2">
            {c.name}
            {c.is_verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-sm font-medium text-fg">
                <BadgeCheck aria-hidden="true" className="size-4 text-accent" />
                {t('verified')}
              </span>
            ) : null}
          </h1>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
            {c.industry ? (
              <li className="flex items-center gap-1.5">
                <Factory aria-hidden="true" className="size-4" />
                <span className="sr-only">{t('industry')}: </span>
                {c.industry}
              </li>
            ) : null}
            {place ? (
              <li className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" />
                <span className="sr-only">{t('location')}: </span>
                {place}
              </li>
            ) : null}
            {website ? (
              <li className="flex items-center gap-1.5">
                <Globe aria-hidden="true" className="size-4" />
                <a
                  href={website.toString()}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {website.hostname.replace(/^www\./, '')}
                  <span className="sr-only"> ({t('opensNewTab')})</span>
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
      {c.description ? (
        <div className="mt-6 border-t border-border pt-5">
          <h2 className="text-lg font-semibold">{t('about')}</h2>
          <PlainText text={c.description} className="mt-3" />
        </div>
      ) : null}
    </section>
  );
}
