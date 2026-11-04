'use client';

import { MessageSquareText, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { MicTest, type MicResult } from '@/components/voice/mic-test';
import { useErrorText } from '@/lib/forms';
import { useFallbackText, useStartStage2 } from '../api';

/** Before Stage 2: what happens, a plain note that the voice is recorded, a real microphone test. */
export function Stage2Intro({
  applicationId,
  mode = 'voice',
  covered = false,
  onStarted,
}: {
  applicationId: string;
  mode?: string | null;
  /** Verified skills cover every question: finishing needs no microphone. */
  covered?: boolean;
  onStarted: (sid: string) => void;
}) {
  const t = useTranslations('stage2.intro');
  const errorText = useErrorText();
  const start = useStartStage2(applicationId);
  const fallbackText = useFallbackText();
  const [mic, setMic] = useState<MicResult>('untested');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const voiceReady = mic === 'ok' || mic === 'silent';
  const micFailed = mic === 'denied' || mic === 'unavailable';
  const voice = mode !== 'text' && !covered; // a text interview (or a covered one) needs no microphone

  const go = async (asText: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await start.mutateAsync();
      // The microphone is not usable: move a voice session to text right away (one-way, the employer sees it).
      if (asText && s.status !== 'completed' && s.mode === 'voice' && s.can_fall_back_to_text) {
        await fallbackText.mutateAsync(s.id);
      }
      onStarted(s.id);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="s2-intro-h" className="mx-auto grid max-w-prose gap-5">
      <div>
        <h1 id="s2-intro-h" className="text-2xl font-semibold">
          {t('title')}
        </h1>
        <p className="mt-1 text-muted">{covered ? t('coveredLead') : t('lead')}</p>
      </div>
      {covered ? null : (
        <ul className="grid list-disc gap-1.5 pl-5">
          {voice ? <li>{t('point1')}</li> : null}
          <li>{t('point2')}</li>
          <li>{t('point3')}</li>
          <li>{t('point4')}</li>
        </ul>
      )}
      {voice ? (
        <>
          <Notice tone="warning" title={t('recordedTitle')}>
            {t('recordedBody')}
          </Notice>
          <MicTest onResult={setMic} />
        </>
      ) : null}
      {micFailed ? (
        <Notice tone="info" role="status">
          {t('textOffer')}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" role="alert">
          {errorText(error)}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {voice ? (
          <Button
            size="lg"
            className="min-h-11 gap-2 px-6"
            disabled={busy || !voiceReady}
            onClick={() => void go(false)}
          >
            <Mic aria-hidden="true" />
            {busy ? t('starting') : t('start')}
          </Button>
        ) : null}
        <Button
          variant={micFailed || !voice ? 'default' : 'ghost'}
          size="lg"
          className="min-h-11 gap-2 px-4"
          disabled={busy}
          onClick={() => void go(true)}
        >
          <MessageSquareText aria-hidden="true" />
          {covered ? t('finish') : t('startText')}
        </Button>
      </div>
      {voice && !voiceReady && !micFailed ? (
        <p className="text-sm text-muted">{t('testFirst')}</p>
      ) : null}
      {voice ? <p className="max-w-prose text-sm text-muted">{t('textNote')}</p> : null}
    </section>
  );
}
