'use client';

import { CircleAlert, CircleCheck, Maximize } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { MicTest } from '@/components/voice/mic-test';

export interface Compat {
  websocket: boolean;
  clipboard: boolean;
  fullscreen: boolean;
}

export function detectCompat(): Compat {
  return {
    websocket: typeof WebSocket !== 'undefined',
    clipboard: typeof ClipboardEvent !== 'undefined',
    fullscreen: typeof document !== 'undefined' && !!document.documentElement.requestFullscreen,
  };
}

function useIsFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const h = () => setOn(!!document.fullscreenElement);
    h();
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  return on;
}

export function enterFullscreen() {
  return document.documentElement.requestFullscreen?.().catch(() => {});
}

const noop = () => {};

function Row({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  const t = useTranslations('interview.check');
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 text-success" />
      ) : (
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 text-danger" />
      )}
      <div>
        <p className="font-medium">
          {label} <span className="font-normal text-muted">— {ok ? t('ok') : t('fail')}</span>
        </p>
        {!ok && hint ? <p className="text-sm text-muted">{hint}</p> : null}
      </div>
    </li>
  );
}

/** Browser compatibility, fullscreen (offered, never forced) and a real microphone test (record + playback; informational, Stage 1 needs no microphone). */
export function SystemCheck({ onContinue }: { onContinue: () => void }) {
  const t = useTranslations('interview.check');
  const [compat] = useState(detectCompat);
  const fullscreen = useIsFullscreen();
  const blocked = !compat.websocket || !compat.clipboard;

  return (
    <section aria-labelledby="check-h" className="mx-auto grid max-w-prose gap-5">
      <div>
        <h1 id="check-h" className="text-2xl font-semibold">
          {t('title')}
        </h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
      </div>
      <ul className="grid gap-3">
        <Row ok={compat.websocket} label={t('websocket')} hint={t('browserHint')} />
        <Row ok={compat.clipboard} label={t('clipboard')} hint={t('browserHint')} />
        <Row ok={fullscreen} label={t('fullscreen')} hint={t('fullscreenHint')} />
      </ul>
      {compat.fullscreen && !fullscreen ? (
        <div>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => void enterFullscreen()}
          >
            <Maximize aria-hidden="true" />
            {t('enterFullscreen')}
          </Button>
        </div>
      ) : null}
      <MicTest onResult={noop} />
      {blocked ? (
        <Notice tone="danger" role="alert">
          {t('browserBlocked')}
        </Notice>
      ) : null}
      <div>
        <Button size="lg" className="min-h-11 px-6" disabled={blocked} onClick={onContinue}>
          {t('continue')}
        </Button>
      </div>
    </section>
  );
}
