'use client';

import { useParams } from 'next/navigation';
import { InterviewFlow } from '@/features/interview';

/** The id is read on the client so the page shell stays static (Cache Components). */
export function InterviewFromUrl() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return <InterviewFlow applicationId={applicationId} />;
}
