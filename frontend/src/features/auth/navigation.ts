import {
  Bookmark,
  Building2,
  ClipboardList,
  FileText,
  Search,
  Settings,
  ShieldCheck,
  BadgeCheck,
  UserRound,
  Users,
  UsersRound,
  BriefcaseBusiness,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from './model';

/** i18n key under `nav.menu.*`. */
export interface MenuItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

/** Avatar menu per role (D-016, hh.uz structure). Unbuilt sections show "coming soon". */
export const ACCOUNT_MENU: Record<UserRole, MenuItem[]> = {
  candidate: [
    { href: '/candidate/profile', key: 'resumes', icon: FileText },
    { href: '/candidate/applications', key: 'applications', icon: ClipboardList },
    { href: '/candidate/saved', key: 'saved', icon: Bookmark },
    { href: '/candidate/results', key: 'results', icon: ShieldCheck },
    { href: '/candidate/skills', key: 'skills', icon: BadgeCheck },
    { href: '/settings', key: 'settings', icon: Settings },
  ],
  hr: [
    { href: '/hr/vacancies', key: 'myVacancies', icon: BriefcaseBusiness },
    { href: '/hr/candidates', key: 'candidates', icon: UsersRound },
    { href: '/hr/talent', key: 'talent', icon: Search },
    { href: '/hr/company', key: 'company', icon: Building2 },
    { href: '/hr/team', key: 'team', icon: Users },
    { href: '/settings', key: 'settings', icon: Settings },
  ],
  admin: [
    { href: '/admin', key: 'adminPanel', icon: ShieldCheck },
    { href: '/settings', key: 'settings', icon: Settings },
  ],
};

/** Phone bottom bar: four destinations. Anonymous users get the candidate set. */
export function bottomNav(role: UserRole | null): MenuItem[] {
  if (role === 'admin') {
    return [
      { href: '/vacancies', key: 'search', icon: Search },
      { href: '/admin', key: 'adminPanel', icon: ShieldCheck },
      { href: '/settings', key: 'settings', icon: Settings },
    ];
  }
  if (role === 'hr') {
    return [
      { href: '/vacancies', key: 'search', icon: Search },
      { href: '/hr/vacancies', key: 'myVacancies', icon: BriefcaseBusiness },
      { href: '/hr/candidates', key: 'candidates', icon: UsersRound },
      { href: '/hr', key: 'profile', icon: UserRound },
    ];
  }
  return [
    { href: '/vacancies', key: 'search', icon: Search },
    { href: '/candidate/saved', key: 'saved', icon: Bookmark },
    { href: '/candidate/applications', key: 'applications', icon: ClipboardList },
    {
      href: role === 'candidate' ? '/candidate/profile' : role === 'admin' ? '/settings' : '/login',
      key: 'profile',
      icon: UserRound,
    },
  ];
}

/** Active when the path is the item or below it (but `/hr` only matches exactly-ish). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === href || pathname.startsWith('/admin/');
  if (href === '/hr')
    return pathname === '/hr' || pathname === '/hr/company' || pathname === '/hr/team';
  return pathname === href || pathname.startsWith(`${href}/`);
}
