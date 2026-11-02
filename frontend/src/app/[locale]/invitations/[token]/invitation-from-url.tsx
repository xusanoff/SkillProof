'use client';

import { useParams } from 'next/navigation';
import { InvitationAccept } from '@/features/companies';

/** The token is read on the client so the page shell stays static (Cache Components). */
export function InvitationFromUrl() {
  const { token } = useParams<{ token: string }>();
  return <InvitationAccept token={token} />;
}
