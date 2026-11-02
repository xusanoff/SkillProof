'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * false on the server and during hydration, true afterwards. Lets a component render
 * exactly the server markup first even if client-only state (e.g. the signed-in user)
 * was already known when a late-streamed Suspense boundary hydrates.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
