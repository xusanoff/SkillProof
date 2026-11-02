'use client';

import { useParams } from 'next/navigation';
import { Stage1ReportPage } from '@/features/hr-stage1';

/** The id is read on the client so the page shell stays static (Cache Components). */
export function ReportFromUrl() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return <Stage1ReportPage applicationId={applicationId} />;
}
