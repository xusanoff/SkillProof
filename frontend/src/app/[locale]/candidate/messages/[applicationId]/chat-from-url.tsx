'use client';
import { useParams } from 'next/navigation';
import { ChatPage } from '@/features/chat/chat-page';
export function ChatFromUrl() {
  const { applicationId } = useParams<{ applicationId: string }>();
  return <ChatPage applicationId={applicationId} />;
}
