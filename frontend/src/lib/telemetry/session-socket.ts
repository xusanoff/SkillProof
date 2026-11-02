/** Minimal WebSocket surface, so tests can inject a fake. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(code?: number): void;
  readonly readyState: number;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export type ConnectionStatus =
  'connecting' | 'open' | 'reconnecting' | 'superseded' | 'ended' | 'failed';

export interface SocketOptions {
  /** Read on every (re)connect. */
  url: () => string;
  create: (url: string) => SocketLike;
  /** Called on `4401`: refresh the session cookie. `false` → give up (session is gone). */
  refresh: () => Promise<boolean>;
  /** Called after each (re)connect is open, before anything is sent: `GET session`. */
  onOpen: () => Promise<void> | void;
  onMessage: (msg: Record<string, unknown>) => void;
  onStatus: (s: ConnectionStatus) => void;
  scheduler?: Scheduler;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const OPEN = 1;

/**
 * One telemetry connection with exponential reconnect (500 ms → 15 s).
 * `4409` (a newer tab took over) and `1000` (stage ended) never reconnect;
 * `4401` refreshes the cookie first; `4403` / `4404` are fatal.
 */
export class SessionSocket {
  private ws: SocketLike | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private closed = false;
  private readonly sched: Scheduler;

  constructor(private readonly o: SocketOptions) {
    this.sched = o.scheduler ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
  }

  connect() {
    if (this.closed) return;
    this.o.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = this.o.create(this.o.url());
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      void Promise.resolve(this.o.onOpen()).finally(() => {
        if (this.ws === ws && !this.closed) this.o.onStatus('open');
      });
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data) as Record<string, unknown>;
        this.o.onMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      void this.handleClose(e.code);
    };
    ws.onerror = () => {};
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === OPEN;
  }

  send(obj: unknown): boolean {
    if (!this.isOpen) return false;
    this.ws!.send(JSON.stringify(obj));
    return true;
  }

  close() {
    this.closed = true;
    if (this.timer !== null) this.sched.clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close(1000);
    }
  }

  private async handleClose(code: number) {
    if (this.closed) return;
    if (code === 4409) return this.finish('superseded');
    if (code === 1000) return this.finish('ended');
    if (code === 4403 || code === 4404) return this.finish('failed');
    if (code === 4401) {
      const ok = await this.o.refresh().catch(() => false);
      if (!ok) return this.finish('failed');
    }
    this.o.onStatus('reconnecting');
    const delay = Math.min(
      this.o.maxDelayMs ?? 15_000,
      (this.o.baseDelayMs ?? 500) * 2 ** this.attempt,
    );
    this.attempt += 1;
    this.timer = this.sched.setTimeout(() => this.connect(), delay);
  }

  private finish(s: ConnectionStatus) {
    this.closed = true;
    this.o.onStatus(s);
  }
}
