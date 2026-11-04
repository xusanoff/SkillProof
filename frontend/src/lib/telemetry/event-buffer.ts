export type TelemetryEventType =
  | 'insert'
  | 'replace'
  | 'delete'
  | 'cursor'
  | 'editor_reset'
  | 'copy'
  | 'paste_internal'
  | 'paste_external_blocked'
  | 'focus_lost'
  | 'focus_gained'
  | 'fullscreen_exit'
  | 'visibility_hidden'
  | 'visibility_visible'
  | 'idle_start'
  | 'idle_end'
  | 'question_played'
  | 'speech_activity'
  | 'typing_activity'
  | 'think';

export interface TelemetryEvent {
  seq: number;
  task_id: string;
  t_ms: number;
  type: TelemetryEventType;
  payload: Record<string, unknown>;
}

export const MAX_BATCH = 500;

/**
 * Sequenced outbox. `seq` is this page's own counter, from 1; the server keeps pages apart (D-090). Events stay until acknowledged
 * (`ack_seq` from the server), and everything unacknowledged is resent after a reconnect
 * (the server drops duplicates).
 */
export class EventBuffer {
  private events: TelemetryEvent[] = [];
  private nextSeq: number;
  private sentUpTo: number;
  private acked: number;

  constructor(
    nextSeq: number,
    private readonly now: () => number,
  ) {
    this.nextSeq = nextSeq;
    this.sentUpTo = nextSeq - 1;
    this.acked = nextSeq - 1;
  }

  record(taskId: string, type: TelemetryEventType, payload: Record<string, unknown> = {}) {
    this.events.push({
      seq: this.nextSeq++,
      task_id: taskId,
      t_ms: Math.round(this.now()),
      type,
      payload,
    });
  }

  /** Not-yet-sent events (at most `MAX_BATCH`), marked as sent on this connection. */
  takeBatch(): TelemetryEvent[] {
    const batch = this.events.filter((e) => e.seq > this.sentUpTo).slice(0, MAX_BATCH);
    if (batch.length) this.sentUpTo = batch[batch.length - 1].seq;
    return batch;
  }

  hasUnsent(): boolean {
    return this.events.some((e) => e.seq > this.sentUpTo);
  }

  /** The server stored everything up to and including `ackSeq` (never moves backwards). */
  ack(ackSeq: number) {
    if (ackSeq <= this.acked) return;
    this.acked = ackSeq;
    this.events = this.events.filter((e) => e.seq > ackSeq);
  }

  /** New connection: everything not acknowledged has to go out again. */
  resetSent() {
    this.sentUpTo = this.acked;
  }

  get unacked(): number {
    return this.events.length;
  }
}
