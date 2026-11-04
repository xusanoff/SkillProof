'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Notice } from '@/components/common/notice';
import { playBeep } from '@/components/voice/beep';
import { inactivityCountdown } from '@/features/interview/model';
import { useNow } from '@/features/interview/components/clock';
import type { Stage2Telemetry } from '../use-stage2-telemetry';

/** From `warning_s` of silence: a visible countdown (`role="alert"`) and one short beep. */
export function InactivityBanner({ server }: { server: Stage2Telemetry['server'] }) {
  const t = useTranslations('stage2.room');
  const now = useNow();
  const base = inactivityCountdown(
    server && server.state.status === 'in_progress' ? server.state : null,
  );
  const remaining =
    base !== null && server ? Math.max(0, base - Math.floor((now - server.at) / 1000)) : null;
  const shown = remaining !== null;
  useEffect(() => {
    if (shown) playBeep();
  }, [shown]);
  if (remaining === null) return null;
  return (
    <Notice tone="warning" role="alert" title={t('inactiveTitle')}>
      {t('inactiveBody')}{' '}
      <span className="font-semibold tabular-nums">{t('inactiveCountdown', { s: remaining })}</span>
    </Notice>
  );
}
