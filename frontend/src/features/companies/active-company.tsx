'use client';

import { createContext, use, useState, type ReactNode } from 'react';
import { useMe, type MeCompany } from '@/features/auth';
import { pickActiveCompany, readCompanyCookie, writeCompanyCookie } from './model';

interface ActiveCompanyValue {
  companies: MeCompany[];
  active: MeCompany | null;
  isOwner: boolean;
  select: (id: string) => void;
}

const ActiveCompanyContext = createContext<ActiveCompanyValue | null>(null);

/** Rendered inside the HR guard (me is loaded), so reading the cookie here is client-only. */
export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [selectedId, setSelectedId] = useState<string | null>(readCompanyCookie);
  const companies = me?.companies ?? [];
  const active = pickActiveCompany(companies, selectedId);

  const select = (id: string) => {
    writeCompanyCookie(id);
    setSelectedId(id);
  };

  return (
    <ActiveCompanyContext
      value={{ companies, active, isOwner: active?.member_role === 'owner', select }}
    >
      {children}
    </ActiveCompanyContext>
  );
}

export function useActiveCompany(): ActiveCompanyValue {
  const value = use(ActiveCompanyContext);
  if (!value) throw new Error('useActiveCompany must be used inside ActiveCompanyProvider');
  return value;
}
