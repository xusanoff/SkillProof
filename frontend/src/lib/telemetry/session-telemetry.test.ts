import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBuffer } from './event-buffer';
import type { SocketLike } from './session-socket';
import { SessionTelemetry, type ServerState } from './session-telemetry';

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverState(over: Partial<ServerState> = {}) {
    const s = {
      type: 'state',
      status: 'in_progress',
      reason: null,
      current_task_index: 0,
      inactive_s: 0,
      warning_s: 60,
      limit_s: 90,
      ack_seq: 0,
      ...over,
    };
    this.onmessage?.({ data: JSON.stringify(s) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const batches = (s: FakeSocket) => s.sent.filter((m) => m.type === 'events');

function make(over: Partial<ConstructorParameters<typeof SessionTelemetry>[0]> = {}) {
  const resync = vi.fn(async () => {});
  const refresh = vi.fn(async () => true);
  const onStatus = vi.fn();
  const onState = vi.fn();
  const t = new SessionTelemetry({
    url: 'ws://x/events',
    create: (u) => new FakeSocket(u),
    refresh,
    resync,
    onState,
    onStatus,
    now: () => 1234.6,
    ...over,
  });
  return { t, resync, refresh, onStatus, onState };
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('EventBuffer', () => {
  it('numbers from the given start and keeps unacked events', () => {
    const b = new EventBuffer(5, () => 10.4);
    b.record('t', 'cursor', { line: 1, column: 1 });
    b.record('t', 'insert', {});
    expect(b.takeBatch().map((e) => e.seq)).toEqual([5, 6]);
    expect(b.takeBatch()).toEqual([]);
    b.ack(5);
    expect(b.unacked).toBe(1);
    b.resetSent();
    expect(b.takeBatch().map((e) => e.seq)).toEqual([6]);
    b.ack(3); // never moves backwards
    expect(b.unacked).toBe(1);
  });
});

describe('SessionTelemetry: pages', () => {
  it('starts at 1 on a fresh page and names its page when it reconnects', async () => {
    const { t } = make();
    t.record('t', 'insert', {});
    t.start();
    expect(last().url).toBe('ws://x/events');
    last().open();
    last().serverState({ page: 3 } as Partial<ServerState>);
    await vi.advanceTimersByTimeAsync(1500);
    expect((batches(last())[0].events as { seq: number }[]).map((e) => e.seq)).toEqual([1]);
    last().drop(1006);
    await vi.advanceTimersByTimeAsync(1000);
    expect(last().url).toBe('ws://x/events?page=3');
  });
});

describe('SessionTelemetry', () => {
  it('batches every ~1.5 s with seq from 1 and the client clock', async () => {
    const { t } = make();
    t.start();
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    t.record('task-1', 'focus_lost');
    t.record('task-1', 'focus_gained');
    await vi.advanceTimersByTimeAsync(1500);
    const [b] = batches(last());
    expect(b).toMatchObject({ type: 'events', sent_t_ms: 1235 });
    expect((b.events as { seq: number; t_ms: number }[]).map((e) => [e.seq, e.t_ms])).toEqual([
      [1, 1235],
      [2, 1235],
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(batches(last())).toHaveLength(1); // nothing new → no empty batches
  });

  it('sends the draft every ~5 s only when it changed', async () => {
    const { t } = make();
    t.start();
    last().open();
    await vi.advanceTimersByTimeAsync(0);
    t.setDraft({ task_id: 't', language: 'python', code: 'print(1)' });
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const drafts = last().sent.filter((m) => m.type === 'draft');
    expect(drafts).toEqual([{ type: 'draft', task_id: 't', language: 'python', code: 'print(1)' }]);
    t.setDraft({ task_id: 't', language: 'python', code: 'print(2)' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(last().sent.filter((m) => m.type === 'draft')).toHaveLength(2);
  });

  it('acked events are dropped; unacked ones are resent after a reconnect', async () => {
    const { t, resync, onStatus } = make();
    t.start();
    const first = last();
    first.open();
    await vi.advanceTimersByTimeAsync(0);
    t.record('t', 'insert', {});
    t.record('t', 'insert', {});
    await vi.advanceTimersByTimeAsync(1500);
    first.serverState({ ack_seq: 1 }); // only the first one is stored
    expect(t.unacked).toBe(1);
    first.drop(1006);
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(500);
    const second = last();
    expect(second).not.toBe(first);
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(resync).toHaveBeenCalledTimes(2); // GET session on every connect, incl. the reconnect
    const resent = batches(second)[0].events as { seq: number }[];
    expect(resent.map((e) => e.seq)).toEqual([2]);
  });

  it('reconnects with exponential delay (500 ms, 1 s, 2 s …)', async () => {
    const { t } = make();
    t.start();
    last().drop(1006);
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeSocket.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.all).toHaveLength(2);
    last().drop(1006);
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.all).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.all).toHaveLength(3);
  });

  it('4401 refreshes the session and reconnects; a failed refresh stops', async () => {
    const a = make();
    a.t.start();
    last().drop(4401);
    await vi.advanceTimersByTimeAsync(600);
    expect(a.refresh).toHaveBeenCalledTimes(1);
    expect(FakeSocket.all).toHaveLength(2);

    FakeSocket.all = [];
    const b = make({ refresh: async () => false });
    b.t.start();
    last().drop(4401);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(b.onStatus).toHaveBeenLastCalledWith('failed');
  });

  it('4409 does not reconnect and reports superseded', async () => {
    const { t, onStatus } = make();
    t.start();
    last().drop(4409);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith('superseded');
  });

  it('forwards server state (inactivity countdown) to the UI', async () => {
    const { t, onState } = make();
    t.start();
    last().open();
    last().serverState({ inactive_s: 65, warning_s: 60, limit_s: 90 });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ inactive_s: 65, limit_s: 90 }));
    t.stop();
  });

  it('keeps events while offline and never throws', async () => {
    const { t } = make();
    t.start();
    t.record('t', 'visibility_hidden');
    await vi.advanceTimersByTimeAsync(1500); // socket still connecting → not open
    expect(t.unacked).toBe(1);
  });
});
