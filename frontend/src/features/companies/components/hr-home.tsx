'use client';

import { BriefcaseBusiness, Building2, ChevronRight, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCompany } from '../api';
import { useActiveCompany } from '../active-company';
import { CompanyLogo } from './company-logo';
import { CreateCompany } from './create-company';

/** `/hr`: create the first company, or the company dashboard shell. */
export function HrHome() {
  const { active } = useActiveCompany();
  if (!active) return <CreateCompany />;
  return <Dashboard id={active.id} name={active.name} isOwner={active.member_role === 'owner'} />;
}

function Dashboard({ id, name, isOwner }: { id: string; name: string; isOwner: boolean }) {
  const t = useTranslations('hr.home');
  const company = useCompany(id);

  const links = [
    { href: '/hr/company', icon: Building2, title: t('company'), body: t('companyBody') },
    {
      href: '/hr/team',
      icon: Users,
      title: t('team'),
      body: isOwner ? t('teamBodyOwner') : t('teamBody'),
    },
    {
      href: '/hr/vacancies',
      icon: BriefcaseBusiness,
      title: t('vacancies'),
      body: t('vacanciesBody'),
    },
  ];

  return (
    <div className="grid gap-8">
      <div className="flex items-center gap-4">
        <CompanyLogo logoUrl={company.data?.logo_url} name={name} size={56} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted">{t(isOwner ? 'roleOwner' : 'roleHr')}</p>
        </div>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {links.map(({ href, icon: Icon, title, body }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-16 items-center gap-4 px-4 py-3.5 hover:bg-surface-2 sm:px-5"
            >
              <Icon aria-hidden="true" className="size-5 shrink-0 text-accent" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted">{body}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
