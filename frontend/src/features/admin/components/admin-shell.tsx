'use client';

import {
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  Code2,
  Cpu,
  LayoutDashboard,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { WorkspaceFrame } from '@/components/layout/workspace-frame';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', key: 'overview', icon: LayoutDashboard },
  { href: '/admin/users', key: 'users', icon: Users },
  { href: '/admin/companies', key: 'companies', icon: Building2 },
  { href: '/admin/vacancies', key: 'vacancies', icon: BriefcaseBusiness },
  { href: '/admin/questions', key: 'questions', icon: CircleHelp },
  { href: '/admin/tasks', key: 'tasks', icon: Code2 },
  { href: '/admin/thresholds', key: 'thresholds', icon: SlidersHorizontal },
  { href: '/admin/ai-usage', key: 'aiUsage', icon: Cpu },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();
  return (
    <WorkspaceFrame
      sidebar={
        <div className="grid min-w-0 gap-4">
          <nav aria-label={t('label')} className="min-w-0">
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
              {NAV.map(({ href, key, icon: Icon }) => {
                const current =
                  href === '/admin'
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
      <div className="min-w-0">{children}</div>
    </WorkspaceFrame>
  );
}
