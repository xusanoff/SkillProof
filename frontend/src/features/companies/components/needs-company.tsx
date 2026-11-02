'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function NeedsCompany() {
  const t = useTranslations('hr.noCompany');
  return (
    <EmptyState icon={Building2} headingLevel={1} title={t('title')} description={t('body')}>
      <Button asChild size="lg" className="min-h-11 px-5">
        <Link href="/hr">{t('cta')}</Link>
      </Button>
    </EmptyState>
  );
}
