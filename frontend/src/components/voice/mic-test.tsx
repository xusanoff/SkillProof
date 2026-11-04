'use client';

import { Mic, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/common/notice';
import { Button } from '@/components/ui/button';
import { LevelMeter } from './level-meter';
import { micSupported, useMicRecorder } from './use-mic-recorder';

export type MicResult = 'untested' | 'ok' | 'silent' | 'denied' | 'unavailable';

const TEST_SECONDS = 4;

/** Record a few seconds, play them back. The result tells the parent whether voice can be used. */
export function MicTest({ onResult }: { onResult: (r: MicResult) => void }) {
  const t = useTranslations('voice.mic');
  const rec = useMicRecorder();
  const [url, setUrl] = useState<string | null>(null);
  const [result, setResult] = useState<MicResult>(() =>
    micSupported() ? 'untested' : 'unavailable',
  );
  const stopRef = useRef(rec.stop);
  useEffect(() => {
    stopRef.current = rec.stop;
  });
  const report = (r: MicResult) => {
    setResult(r);
    onResult(r);
  };

  useEffect(() => {
    if (result === 'unavailable') onResult('unavailable');
  }, [result, onResult]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  const failed = rec.state === 'denied' || rec.state === 'unavailable' ? rec.state : null;
  useEffect(() => {
    if (failed) onResult(failed);
  }, [failed, onResult]);

  const finish = async () => {
    const out = await stopRef.current();
    if (!out) return;
    if (out.blob.size === 0) return report('unavailable');
    setUrl(URL.createObjectURL(out.blob));
    report(out.silenceMs >= out.durationMs - 300 ? 'silent' : 'ok');
  };

  const begin = async () => {
    setUrl(null);
    if (!(await rec.start())) return;
    setTimeout(() => void finish(), TEST_SECONDS * 1000);
  };

  const shown: MicResult = failed ?? result;
  const recording = rec.state === 'recording';
  return (
    <section aria-labelledby="mic-h" className="grid gap-3 rounded-xl border border-border p-4">
      <h2 id="mic-h" className="flex items-center gap-2 text-lg font-semibold">
        <Mic aria-hidden="true" className="size-5" />
        {t('title')}
      </h2>
      <p className="max-w-prose text-sm text-muted">{t('lead', { s: TEST_SECONDS })}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="min-h-11 gap-2"
          disabled={recording || rec.state === 'starting' || shown === 'unavailable'}
          onClick={() => void begin()}
        >
          {recording ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
          {recording ? t('recording') : url ? t('again') : t('record', { s: TEST_SECONDS })}
        </Button>
        {url ? <audio controls src={url} aria-label={t('playback')} className="h-11" /> : null}
      </div>
      {recording ? (
        <div className="grid gap-1" role="status">
          <LevelMeter level={rec.level} />
          <p className="text-sm text-muted">{rec.speaking ? t('hearing') : t('speakNow')}</p>
        </div>
      ) : null}
      {shown === 'ok' ? (
        <Notice tone="success" role="status">
          {t('ok')}
        </Notice>
      ) : null}
      {shown === 'silent' ? (
        <Notice tone="warning" role="status">
          {t('silent')}
        </Notice>
      ) : null}
      {shown === 'denied' ? (
        <Notice tone="danger" role="alert">
          {t('denied')}
        </Notice>
      ) : null}
      {shown === 'unavailable' ? (
        <Notice tone="danger" role="alert">
          {t('unavailable')}
        </Notice>
      ) : null}
    </section>
  );
}
