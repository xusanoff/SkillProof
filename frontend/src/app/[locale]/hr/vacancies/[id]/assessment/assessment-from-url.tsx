'use client';

import { useParams } from 'next/navigation';
import { AssessmentEditor } from '@/features/hr-assessments';

/** The id is read on the client so the page shell stays static (Cache Components). */
export function AssessmentFromUrl() {
  const { id } = useParams<{ id: string }>();
  return <AssessmentEditor vacancyId={id} />;
}
