import { RequireAuth } from '@/features/auth';

export default function CandidateLayout({ children }: LayoutProps<'/[locale]/candidate'>) {
  return <RequireAuth roles={['candidate']}>{children}</RequireAuth>;
}
