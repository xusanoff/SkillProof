'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { MotionProvider } from '@/components/motion';
import { useSessionExpiry } from '@/features/auth';
import { makeQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session (not per render).
  const [queryClient] = useState(makeQueryClient);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionExpiry />
        <MotionProvider>{children}</MotionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/** Signs the user out locally when the API client could not refresh the session. */
function SessionExpiry() {
  useSessionExpiry();
  return null;
}
