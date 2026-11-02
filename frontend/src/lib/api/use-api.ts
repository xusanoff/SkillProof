'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { createApi } from './client';

/** Window event fired when the session is gone (refresh failed). Auth state listens to it. */
export const SESSION_EXPIRED_EVENT = 'sp:session-expired';

function notifySessionExpired() {
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/** Typed API client for Client Components, bound to the current UI locale. */
export function useApi() {
  const locale = useLocale();
  return useMemo(() => createApi({ locale, onUnauthenticated: notifySessionExpired }), [locale]);
}
