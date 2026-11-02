import { RequireAuth } from '@/features/auth';
import { ActiveCompanyProvider, HrShell } from '@/features/companies';

export default function HrLayout({ children }: LayoutProps<'/[locale]/hr'>) {
  return (
    <RequireAuth roles={['hr']}>
      <ActiveCompanyProvider>
        <HrShell>{children}</HrShell>
      </ActiveCompanyProvider>
    </RequireAuth>
  );
}
