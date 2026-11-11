import { Suspense } from 'react';
import { ChatPage } from '@/features/chat/chat-page';
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Suspense>
        <ChatPage />
      </Suspense>
    </div>
  );
}

// The client auth guard renders its loading shell before this private page.
export const instant = false;
