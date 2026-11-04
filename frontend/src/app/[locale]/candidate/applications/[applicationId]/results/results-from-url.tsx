'use client';

import { useParams } from 'next/navigation';
import { CandidateResultsPage } from '@/features/candidate-results';

/** The id is read on the client so the page shell stays static (Cache Components). */
export function ResultsFromUrl() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return <CandidateResultsPage applicationId={applicationId} />;
}
