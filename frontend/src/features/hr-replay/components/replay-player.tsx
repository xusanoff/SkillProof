'use client';

import {
  ClipboardPaste,
  Eye,
  EyeOff,
  FastForward,
  Pause,
  Play,
  Rewind,
  Terminal,
  Hourglass,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useErrorText } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useReplay } from '../api';
import {
  buildMarkers,
  countMarkers,
  formatMs,
  ReplayCursor,
  SPEEDS,
  type Marker,
  type Replay,
} from '../model';

/** Read-only Monaco, loaded only on the report page (same `/monaco/vs` copy as the interview). */
const MonacoEditor = dynamic(
  () =>
    import('@monaco-editor/react').then((m) => {
      m.loader.config({ paths: { vs: '/monaco/vs' } });
      return m.default;
    }),
  { ssr: false, loading: () => <Skeleton className="h-full min-h-72 w-full rounded-lg" /> },
);

const MONACO_LANG: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  sql: 'sql',
  go: 'go',
  java: 'java',
};

const MARKER_ICON = {
  paste: ClipboardPaste,
  idle: Hourglass,
  focus: EyeOff,
  run: Terminal,
} as const;
const MARKER_TONE = {
  paste: 'bg-danger text-white',
  idle: 'bg-warning text-fg',
  focus: 'bg-fg/70 text-bg',
  run: 'bg-accent text-accent-fg',
} as const;

/** Replay of one task. Loads its own data. */
export function ReplayPlayer({
  companyId,
  applicationId,
  taskId,
}: {
  companyId: string;
  applicationId: string;
  taskId: string;
}) {
  const query = useReplay(companyId, applicationId, taskId);
  const errorText = useErrorText();
  const tc = useTranslations('common');
  if (query.isError) {
    return (
      <ErrorState
        title={errorText(query.error)}
        onRetry={() => query.refetch()}
        retryLabel={tc('retry')}
      />
    );
  }
  if (!query.data) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <Player key={taskId} replay={query.data} />;
}

function Player({ replay }: { replay: Replay }) {
  const t = useTranslations('hrReplay');
  const { resolvedTheme } = useTheme();
  const { start_ms: start, end_ms: end } = replay;
  const span = Math.max(1, end - start);
  const cursor = useMemo(
    () => new ReplayCursor({ code: replay.initial_code, language: replay.language }, replay.events),
    [replay],
  );
  const markers = useMemo(() => buildMarkers(replay.events, start), [replay.events, start]);
  const counts = countMarkers(markers);

  const [pos, setPos] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [skipIdle, setSkipIdle] = useState(true);
  const state = cursor.at(pos);
  const eventTimes = useMemo(() => replay.events.map((e) => e.t_ms), [replay.events]);

  // Play loop: clock-based, so a slow frame just skips ahead. No animation, only state updates.
  const live = useRef({ speed, skipIdle });
  useEffect(() => {
    live.current = { speed, skipIdle };
  });
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      if (dt >= 33) {
        last = now;
        setPos((p) => {
          let n = p + dt * live.current.speed;
          if (live.current.skipIdle) {
            const next = eventTimes.find((x) => x > p);
            // A long silence is not worth waiting for: jump to just before the next event.
            if (next !== undefined && next - p > 2000 && n < next - 500) n = next - 500;
          }
          if (n >= end) {
            setPlaying(false);
            return end;
          }
          return n;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, end, eventTimes]);

  const seek = (ms: number) => setPos(Math.min(end, Math.max(start, ms)));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, a')) return;
    if (e.key === ' ' && !target.closest('button')) {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      seek(pos + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 30_000 : 5_000));
    }
  };

  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={t('region')}
      onKeyDown={onKey}
      className="grid gap-3 rounded-xl border border-border p-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent sm:p-4"
    >
      <div
        className="h-80 overflow-hidden rounded-lg border border-border"
        data-testid="replay-editor"
      >
        <MonacoEditor
          value={state.code}
          language={MONACO_LANG[state.language ?? replay.language] ?? 'plaintext'}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
          options={{
            readOnly: true,
            domReadOnly: true,
            ariaLabel: t('editorLabel'),
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            contextmenu: false,
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="min-h-11 min-w-11 gap-2 px-3"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? t('pause') : t('play')}
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => seek(pos - 5000)}
          aria-label={t('back5')}
        >
          <Rewind aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => seek(pos + 5000)}
          aria-label={t('fwd5')}
        >
          <FastForward aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => seek(start)}
          aria-label={t('toStart')}
        >
          <SkipBack aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => seek(end)}
          aria-label={t('toEnd')}
        >
          <SkipForward aria-hidden="true" />
        </Button>
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">{t('speed')}</legend>
          {SPEEDS.map((s) => (
            <Button
              key={s}
              variant={s === speed ? 'default' : 'outline'}
              className="min-h-11 min-w-11 px-2 tabular-nums"
              aria-pressed={s === speed}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </Button>
          ))}
        </fieldset>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipIdle}
            onChange={(e) => setSkipIdle(e.target.checked)}
          />
          {t('skipIdle')}
        </label>
        <p className="ml-auto text-sm tabular-nums" aria-live="off">
          <span className="sr-only">{t('time')}: </span>
          {formatMs(pos - start)} / {formatMs(span)}
        </p>
      </div>

      <div>
        <div className="relative h-8" aria-label={t('markers')} role="group">
          {markers.map((m) => (
            <MarkerButton
              key={m.id}
              marker={m}
              start={start}
              span={span}
              onGo={(ms) => {
                setPlaying(false);
                seek(ms);
              }}
            />
          ))}
        </div>
        <input
          type="range"
          min={start}
          max={end}
          step={1}
          value={pos}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label={t('timeline')}
          aria-valuetext={`${formatMs(pos - start)} / ${formatMs(span)}`}
          className="h-6 w-full accent-[var(--accent)]"
        />
      </div>

      <p className="text-sm text-muted">
        {t('legend', {
          paste: counts.paste,
          idle: counts.idle,
          focus: counts.focus,
          run: counts.run,
        })}
      </p>
      <p className="text-xs text-muted">{t('keys')}</p>
    </div>
  );
}

function MarkerButton({
  marker: m,
  start,
  span,
  onGo,
}: {
  marker: Marker;
  start: number;
  span: number;
  onGo: (ms: number) => void;
}) {
  const t = useTranslations('hrReplay.marker');
  const Icon = m.kind === 'focus' && m.endMs === undefined ? Eye : MARKER_ICON[m.kind];
  const left = ((m.atMs - start) / span) * 100;
  const label =
    m.kind === 'paste'
      ? m.blocked
        ? t('pasteBlocked', {
            length: m.length ?? 0,
            lines: m.lines ?? 0,
            time: formatMs(m.atMs - start),
          })
        : t('pasteInternal', { time: formatMs(m.atMs - start) })
      : m.kind === 'idle'
        ? t('idle', {
            seconds: Math.round(((m.endMs ?? m.atMs) - m.atMs) / 1000),
            time: formatMs(m.atMs - start),
          })
        : m.kind === 'focus'
          ? t('focus', { time: formatMs(m.atMs - start) })
          : t('run', { time: formatMs(m.atMs - start) });
  const width = m.endMs ? Math.max(((m.endMs - m.atMs) / span) * 100, 0) : 0;
  return (
    <button
      type="button"
      data-marker={m.kind}
      title={label}
      aria-label={label}
      onClick={() => onGo(m.atMs)}
      style={{ left: `${Math.min(left, 97)}%`, minWidth: width ? `${width}%` : undefined }}
      className={cn(
        'absolute top-0 inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1 text-xs outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
        MARKER_TONE[m.kind],
        m.endMs ? 'opacity-90' : '',
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}
