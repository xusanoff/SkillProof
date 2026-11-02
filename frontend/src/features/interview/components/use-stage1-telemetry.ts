'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl, refreshSession } from '@/lib/api';
import {
  SessionTelemetry,
  type ConnectionStatus,
  type Draft,
  type ServerState,
  type TelemetryEventType,
} from '@/lib/telemetry';
import { wsUrl, type Session } from '../model';

/**
 * Wires the DOM-free `SessionTelemetry` to a session: one connection per session id, window
 * focus / visibility / fullscreen events, and "refetch the session" whenever the server says the
 * task or status changed (and after every reconnect).
 */
export function useStage1Telemetry(
  session: Session,
  taskId: string | undefined,
  refetch: () => Promise<unknown>,
) {
  const tel = useRef<SessionTelemetry | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [server, setServer] = useState<{ state: ServerState; at: number } | null>(null);
  const latest = useRef({ index: session.current_task_index, taskId, refetch });
  useEffect(() => {
    latest.current = { index: session.current_task_index, taskId, refetch };
  });

  const sid = session.id;
  const live = session.status === 'in_progress';
  useEffect(() => {
    if (!live) return;
    const t = new SessionTelemetry({
      url: wsUrl(sid),
      create: (u) => new WebSocket(u) as never,
      refresh: () => refreshSession(getApiBaseUrl(), (r) => fetch(r)),
      resync: () => latest.current.refetch(),
      onState: (s) => {
        setServer({ state: s, at: performance.now() });
        if (s.status !== 'in_progress' || s.current_task_index !== latest.current.index) {
          void latest.current.refetch();
        }
      },
      onStatus: setConnection,
    });
    tel.current = t;
    t.start();
    return () => {
      t.stop();
      tel.current = null;
    };
  }, [sid, live]);

  // Environment signals (spec §7.1b / §6.0: recorded, shown to the employer, never blocking).
  useEffect(() => {
    if (!live) return;
    const rec = (type: TelemetryEventType) => {
      const id = latest.current.taskId;
      if (id) tel.current?.record(id, type, {});
    };
    const onBlur = () => rec('focus_lost');
    const onFocus = () => rec('focus_gained');
    const onVis = () => rec(document.hidden ? 'visibility_hidden' : 'visibility_visible');
    const onFs = () => {
      if (!document.fullscreenElement) rec('fullscreen_exit');
    };
    // Leaving the page: push what is waiting (events and the draft) while the socket is still open.
    const onHide = () => {
      tel.current?.flush();
      tel.current?.sendDraft();
    };
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
    record: (type: TelemetryEventType, payload: Record<string, unknown>) => {
      const id = latest.current.taskId;
      if (id) tel.current?.record(id, type, payload);
    },
    setDraft: (d: Draft) => tel.current?.setDraft(d),
    flush: () => tel.current?.flush(),
  };
}
