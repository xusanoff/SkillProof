import { EventBuffer, type TelemetryEventType } from './event-buffer';
import {
  SessionSocket,
  type ConnectionStatus,
  type Scheduler,
  type SocketLike,
} from './session-socket';

export interface ServerState {
  status: string;
  reason: string | null;
  current_task_index: number;
  inactive_s: number;
  warning_s: number;
  limit_s: number;
  ack_seq: number;
}

export interface Draft {
  task_id: string;
  language: string;
  code: string;
}

export interface TelemetryOptions {
  url: string;
  create: (url: string) => SocketLike;
  refresh: () => Promise<boolean>;
  /** `GET session` after every (re)connect. */
  /** `GET session` after every (re)connect. */
  resync: () => Promise<unknown> | void;
  onState: (s: ServerState) => void;
  onStatus: (s: ConnectionStatus) => void;
  /** Same clock as `t_ms` (client clock, ms). */
  now?: () => number;
  scheduler?: Scheduler;
  flushMs?: number;
  draftMs?: number;
}

/**
 * Stage 1 telemetry: events batched every ~1.5 s, the draft every ~5 s when it changed,
 * acknowledged events dropped, unacknowledged ones resent on reconnect. No DOM.
 */
export class SessionTelemetry {
  private readonly buffer: EventBuffer;
  private readonly socket: SessionSocket;
  private readonly now: () => number;
  private readonly sched: Scheduler;
  private flushTimer: unknown = null;
  private draftTimer: unknown = null;
  private draft: Draft | null = null;
  private sentDraft: string | null = null;
  private stopped = false;
  /** Given by the server on the first connection; reconnects name it, so resends stay duplicates. */
  private page: number | null = null;

  constructor(private readonly o: TelemetryOptions) {
    this.now = o.now ?? (() => performance.now());
    this.sched = o.scheduler ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
    this.buffer = new EventBuffer(1, this.now);
    this.socket = new SessionSocket({
      url: () => (this.page === null ? o.url : `${o.url}?page=${this.page}`),
      create: o.create,
      refresh: o.refresh,
      scheduler: o.scheduler,
      onOpen: async () => {
        this.buffer.resetSent();
        this.sentDraft = null;
        await o.resync();
        this.flush();
      },
      onMessage: (m) => {
        if (m.type !== 'state') return;
        const s = m as unknown as ServerState & { type: string; page?: number };
        if (typeof s.page === 'number') this.page = s.page;
        if (typeof s.ack_seq === 'number') this.buffer.ack(s.ack_seq);
        o.onState(s);
      },
      onStatus: (s) => {
        if (s === 'superseded' || s === 'ended' || s === 'failed') this.stopTimers();
        o.onStatus(s);
      },
    });
  }

  start() {
    this.socket.connect();
    this.scheduleFlush();
    this.scheduleDraft();
  }

  record(taskId: string, type: TelemetryEventType, payload: Record<string, unknown> = {}) {
    if (!this.stopped) this.buffer.record(taskId, type, payload);
  }

  setDraft(d: Draft) {
    this.draft = d;
  }

  /** Send what is waiting (also on blur / before submit). */
  flush() {
    if (!this.buffer.hasUnsent()) return;
    const events = this.buffer.takeBatch();
    const ok = this.socket.send({ type: 'events', sent_t_ms: Math.round(this.now()), events });
    if (!ok) this.buffer.resetSent();
  }

  sendDraft() {
    const d = this.draft;
    if (!d) return;
    const key = `${d.task_id}\n${d.language}\n${d.code}`;
    if (key === this.sentDraft) return;
    if (this.socket.send({ type: 'draft', ...d })) this.sentDraft = key;
  }

  stop() {
    this.stopped = true;
    this.stopTimers();
    this.socket.close();
  }

  get unacked(): number {
    return this.buffer.unacked;
  }

  private scheduleFlush() {
    this.flushTimer = this.sched.setTimeout(() => {
      this.flush();
      if (!this.stopped) this.scheduleFlush();
    }, this.o.flushMs ?? 1500);
  }

  private scheduleDraft() {
    this.draftTimer = this.sched.setTimeout(() => {
      this.sendDraft();
      if (!this.stopped) this.scheduleDraft();
    }, this.o.draftMs ?? 5000);
  }

  private stopTimers() {
    if (this.flushTimer !== null) this.sched.clearTimeout(this.flushTimer);
    if (this.draftTimer !== null) this.sched.clearTimeout(this.draftTimer);
    this.flushTimer = this.draftTimer = null;
  }
}
