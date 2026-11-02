'use client';

import { useEffect } from 'react';

/**
 * While Stage 1 runs: hide the site chrome (CSS on `body[data-interview-room]`) and ask the
 * browser to confirm before the page is closed or left, so a stray click or Back cannot end it.
 * Rules, system check and warm-up never call this.
 */
export function useInterviewRoom(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.body.setAttribute('data-interview-room', '');
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      document.body.removeAttribute('data-interview-room');
      window.removeEventListener('beforeunload', warn);
    };
  }, [active]);
}
