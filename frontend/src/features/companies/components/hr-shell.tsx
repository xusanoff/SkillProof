'use client';

import {
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  Code2,
  LayoutDashboard,
  Users,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useActiveCompany } from '../active-company';

const NAV = [
  { href: '/hr', key: 'overview', icon: LayoutDashboard },
  { href: '/hr/company', key: 'company', icon: Building2 },
  { href: '/hr/team', key: 'team', icon: Users },
  { href: '/hr/vacancies', key: 'vacancies', icon: BriefcaseBusiness },
  { href: '/hr/questions', key: 'questions', icon: CircleHelp },
  { href: '/hr/tasks', key: 'tasks', icon: Code2 },
  { href: '/hr/candidates', key: 'candidates', icon: UsersRound },
] as const;

/**
 * HR chrome: dense, neutral. Desktop: left rail with company switcher;
 * phone: switcher + a horizontally scrolling tab row. No company yet → no chrome.
 */
export function HrShell({ children }: { children: ReactNode }) {
  const t = useTranslations('hr.nav');
  const pathname = usePathname();
  const { companies, active, select } = useActiveCompany();

  if (!active) return <>{children}</>;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="grid content-start gap-4 lg:sticky lg:top-24">
        {companies.length > 1 ? (
          <div className="grid gap-1.5">
            <label htmlFor="company-switcher" className="text-sm text-muted">
              {t('switcher')}
            </label>
            <NativeSelect
              id="company-switcher"
              value={active.id}
              onChange={(e) => select(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <p className="truncate font-semibold" title={active.name}>
            {active.name}
          </p>
        )}
        <nav aria-label={t('label')} className="-mx-4 border-b border-border lg:mx-0 lg:border-0">
          <ul className="flex gap-1 overflow-x-auto px-4 lg:flex-col lg:px-0">
            {NAV.map(({ href, key, icon: Icon }) => {
              const current =
                href === '/hr'
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={key} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-2.5 px-3 text-sm font-medium whitespace-nowrap',
                      'border-b-2 lg:rounded-lg lg:border-b-0',
                      current
                        ? 'border-accent text-fg lg:bg-surface-2'
                        : 'border-transparent text-muted hover:text-fg lg:hover:bg-surface-2',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
