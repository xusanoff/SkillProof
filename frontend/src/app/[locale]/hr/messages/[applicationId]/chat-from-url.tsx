'use client';
import { useParams } from 'next/navigation';
import { HrChatPage } from '@/features/chat/chat-page';
export function ChatFromUrl() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return <HrChatPage applicationId={applicationId} />;
}
