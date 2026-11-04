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
    <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
      <aside className="grid grid-cols-[minmax(0,1fr)] content-start gap-4 lg:sticky lg:top-24">
        <nav aria-label={t('label')} className="-mx-4 border-b border-border lg:mx-0 lg:border-0">
          <ul className="flex gap-1 overflow-x-auto px-4 lg:flex-col lg:px-0">
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
