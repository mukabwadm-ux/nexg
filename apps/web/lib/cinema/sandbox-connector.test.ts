import { describe, expect, it, vi } from 'vitest';

import { CinemaError, withTimeout } from './connector';
import { SandboxCinemaConnector } from './sandbox-connector';

type Answers = Record<string, unknown>;

function sandbox(answers: Answers, faults: { down?: boolean; slow?: boolean } = {}) {
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const sleep = vi.fn(async () => undefined);
  const connector = new SandboxCinemaConnector(async (op, args) => {
    calls.push({ op, args });
    if (op === 'fault') return { data: faults, error: null };
    return { data: answers[op] ?? { ok: true }, error: null };
  }, sleep);
  return { connector, calls, sleep };
}

async function failure(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    return error as CinemaError;
  }
  throw new Error('expected the call to fail');
}

describe('the sandbox cinema connector', () => {
  it('answers like a system that is down when told to be', async () => {
    const { connector, calls } = sandbox({}, { down: true });
    const error = await failure(connector.seatMap('S1'));
    expect(error).toBeInstanceOf(CinemaError);
    expect(error.code).toBe('unavailable');
    expect(error.retryable).toBe(true);
    // Nothing reaches the cinema's own state while it is down.
    expect(calls.map((c) => c.op)).toEqual(['fault']);
  });

  it('is slow enough to outlast the live timeout when told to be', async () => {
    const { connector, sleep } = sandbox(
      { seat_map: { ok: true, observedAt: 'now', taken: [] } },
      { slow: true },
    );
    await connector.seatMap('S1');
    expect(sleep).toHaveBeenCalledWith(9000);
  });

  it('says which seat was taken', async () => {
    const { connector } = sandbox({ hold: { ok: false, error: 'seat_taken', seats: ['F7'] } });
    const error = await failure(
      connector.hold({ showingRef: 'S1', seats: ['F7', 'F8'], requestId: 'r', ttlSeconds: 420 }),
    );
    expect(error.code).toBe('seat_taken');
    expect(error.options.seats).toEqual(['F7']);
    expect(error.retryable).toBe(false);
  });

  it('maps refusals to their codes, and unknown seats to an invalid request', async () => {
    const { connector } = sandbox({
      confirm: { ok: false, error: 'seat_lost' },
      extend: { ok: false, error: 'hold_expired' },
      hold: { ok: false, error: 'invalid_seats' },
      cancel: { ok: false, error: 'cancel_window_closed' },
    });
    expect(
      (await failure(connector.confirm({ holdRef: 'H', requestId: 'r', paymentRef: 'p' }))).code,
    ).toBe('seat_lost');
    expect((await failure(connector.extend('H', new Date()))).code).toBe('hold_expired');
    expect(
      (
        await failure(
          connector.hold({ showingRef: 'S', seats: ['Z99'], requestId: 'r', ttlSeconds: 1 }),
        )
      ).code,
    ).toBe('invalid');
    expect((await failure(connector.cancel('B'))).code).toBe('cancel_window_closed');
  });

  it('keeps a retryable failure retryable', async () => {
    const { connector } = sandbox({
      confirm: { ok: false, error: 'unavailable', retryable: true },
    });
    const error = await failure(
      connector.confirm({ holdRef: 'H', requestId: 'r', paymentRef: 'p' }),
    );
    expect(error.code).toBe('unavailable');
    expect(error.retryable).toBe(true);
  });

  it('books, then answers too late, when told to', async () => {
    const { connector, sleep } = sandbox({
      confirm: { ok: true, bookingRef: 'B1', tickets: [], late: true },
    });
    expect(
      (await connector.confirm({ holdRef: 'H', requestId: 'r', paymentRef: 'p' })).bookingRef,
    ).toBe('B1');
    expect(sleep).toHaveBeenCalledWith(9000);
  });

  it('finds a booking by request, but not a cancelled one', async () => {
    const found = sandbox({
      lookup: {
        ok: true,
        found: true,
        bookingRef: 'B1',
        tickets: [{ seat: 'F7', ticketRef: 'T' }],
      },
    });
    expect(await found.connector.lookup('r')).toEqual({
      bookingRef: 'B1',
      tickets: [{ seat: 'F7', ticketRef: 'T' }],
    });
    const cancelled = sandbox({
      lookup: { ok: true, found: true, cancelled: true, bookingRef: 'B1' },
    });
    expect(await cancelled.connector.lookup('r')).toBeNull();
    const missing = sandbox({ lookup: { ok: true, found: false } });
    expect(await missing.connector.lookup('r')).toBeNull();
  });
});

describe('the live timeout', () => {
  it('stops waiting and says the cinema did not answer', async () => {
    vi.useFakeTimers();
    try {
      const waiting = withTimeout(new Promise(() => undefined), 8000);
      const caught = waiting.catch((error: CinemaError) => error);
      await vi.advanceTimersByTimeAsync(8000);
      const error = (await caught) as CinemaError;
      expect(error).toBeInstanceOf(CinemaError);
      expect(error.code).toBe('unavailable');
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes an answer through', async () => {
    expect(await withTimeout(Promise.resolve(7))).toBe(7);
  });
});
