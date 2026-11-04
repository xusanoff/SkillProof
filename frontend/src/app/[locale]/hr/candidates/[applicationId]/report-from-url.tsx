'use client';

import { useParams } from 'next/navigation';
import { HrReportPage } from '@/features/hr-report';

/** The id is read on the client so the page shell stays static (Cache Components). */
export function ReportFromUrl() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return <HrReportPage applicationId={applicationId} />;
}
