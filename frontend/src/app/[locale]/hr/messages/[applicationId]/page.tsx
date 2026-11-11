import { Suspense } from 'react';
import { ChatFromUrl } from './chat-from-url';
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Suspense>
        <ChatFromUrl />
      </Suspense>
    </div>
  );
}

// The client auth guard renders its loading shell before this private page.
export const instant = false;
