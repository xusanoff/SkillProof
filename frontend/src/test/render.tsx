import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { makeQueryClient } from '@/lib/query-client';
import messages from '../../messages/uz.json';

/** Render with uz messages + a fresh QueryClient (retry delays removed for speed). */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  const queryClient = makeQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="uz" messages={messages} timeZone="Asia/Tashkent">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
