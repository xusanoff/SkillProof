'use client';

import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  Code2,
  LayoutDashboard,
  Search,
  Users,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { WorkspaceFrame } from '@/components/layout/workspace-frame';
import { Notice } from '@/components/common/notice';
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
  { href: '/hr/talent', key: 'talent', icon: Search },
  { href: '/hr/analytics', key: 'analytics', icon: BarChart3 },
] as const;

/**
 * HR workspace: dark company/navigation rail, shared topbar and a wrapping mobile menu.
 * No company yet: keep the company-creation flow in the public shell.
 */
export function HrShell({ children }: { children: ReactNode }) {
  const t = useTranslations('hr.nav');
  const pathname = usePathname();
  const { companies, active, select } = useActiveCompany();

  if (!active) return <>{children}</>;

  return (
    <WorkspaceFrame
      hr
      sidebar={
        <div className="grid min-w-0 gap-5">
          {companies.length > 1 ? (
            <div className="grid gap-1.5">
              <label
                htmlFor="company-switcher"
                className="text-xs font-semibold tracking-wider text-dark-muted uppercase"
              >
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
          <nav aria-label={t('label')} className="min-w-0">
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
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
                        'flex min-h-11 items-center gap-2.5 px-3 text-sm font-medium whitespace-normal',
                        'rounded-lg',
                        current ? 'text-dark-text' : 'text-dark-muted',
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
        </div>
      }
    >
      <div className="grid min-w-0 content-start gap-5">
        {active.blocked ? (
          <Notice tone="danger" role="alert" title={t('blockedTitle')}>
            {active.block_reason ?? t('blockedBody')}
          </Notice>
        ) : null}
        <div className="min-w-0">{children}</div>
      </div>
    </WorkspaceFrame>
  );
}
