import { Hourglass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { EmptyState } from './empty-state';

/** Localized placeholder for sections linked from menus but built in a later phase. */
export function ComingSoon({ title, children }: { title: string; children?: ReactNode }) {
  const t = useTranslations('comingSoon');
  return (
    <EmptyState icon={Hourglass} headingLevel={1} title={title} description={t('body')}>
      {children}
    </EmptyState>
  );
}
