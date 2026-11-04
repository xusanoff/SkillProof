'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl, refreshSession } from '@/lib/api';
import {
  SessionTelemetry,
  type ConnectionStatus,
  type ServerState,
  type TelemetryEventType,
} from '@/lib/telemetry';
import { stage2WsUrl, turnPayload } from './model';

/**
 * Stage 2 socket: the same `SessionTelemetry` as Stage 1, a different URL. Events name the open
 * turn in `payload.turn_id`. Window focus / visibility / fullscreen are recorded as in Stage 1.
 * Refetches when the server's turn number (`current_task_index`) or status changes.
 */
export function useStage2Telemetry(opts: {
  sid: string;
  live: boolean;
  turnId: string | undefined;
  order: number | undefined;
  refetch: () => Promise<unknown>;
}) {
  const { sid, live } = opts;
  const tel = useRef<SessionTelemetry | null>(null);
  // A child's effects run before this hook's: what it records on mount waits for the socket object.
  const early = useRef<[string, TelemetryEventType, ReturnType<typeof turnPayload>][]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [server, setServer] = useState<{ state: ServerState; at: number } | null>(null);
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  useEffect(() => {
    if (!live) return;
    const t = new SessionTelemetry({
      url: stage2WsUrl(sid),
      create: (u) => new WebSocket(u) as never,
      refresh: () => refreshSession(getApiBaseUrl(), (r) => fetch(r)),
      resync: () => latest.current.refetch(),
      onState: (s) => {
        setServer({ state: s, at: performance.now() });
        const cur = latest.current;
        if (s.status !== 'in_progress' || s.current_task_index !== cur.order) void cur.refetch();
      },
      onStatus: setConnection,
    });
    tel.current = t;
    for (const [id, type, payload] of early.current.splice(0)) t.record(id, type, payload);
    t.start();
    return () => {
      t.stop();
      tel.current = null;
    };
  }, [sid, live]);

  useEffect(() => {
    if (!live) return;
    const rec = (type: TelemetryEventType) => {
      const id = latest.current.turnId;
      if (id) tel.current?.record(id, type, {});
    };
    const onFs = () => {
      if (!document.fullscreenElement) rec('fullscreen_exit');
    };
    const onHide = () => tel.current?.flush();
    const onBlur = () => rec('focus_lost');
    const onFocus = () => rec('focus_gained');
    const onVis = () => rec(document.hidden ? 'visibility_hidden' : 'visibility_visible');
    window.addEventListener('pagehide', onHide);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [live]);

  return {
    connection,
    server,
    /** Event about the open turn; `turnId` defaults to the current one. */
    record: (type: TelemetryEventType, turnId?: string) => {
      const id = turnId ?? latest.current.turnId;
      if (!id) return;
      if (tel.current) tel.current.record(id, type, turnPayload(id));
      else early.current.push([id, type, turnPayload(id)]);
    },
    flush: () => tel.current?.flush(),
  };
}

export type Stage2Telemetry = ReturnType<typeof useStage2Telemetry>;
