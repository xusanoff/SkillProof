'use client';

import { useParams } from 'next/navigation';
import { EditVacancy } from '@/features/hr-vacancies';

/** The id is read on the client so the page shell stays static (Cache Components). */
export function EditFromUrl() {
  const { id } = useParams<{ id: string }>();
  return <EditVacancy id={id} />;
}
