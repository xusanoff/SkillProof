import { AdminShell } from '@/features/admin';
import { RequireAuth } from '@/features/auth';

export default function AdminLayout({ children }: LayoutProps<'/[locale]/admin'>) {
  return (
    <RequireAuth roles={['admin']}>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
