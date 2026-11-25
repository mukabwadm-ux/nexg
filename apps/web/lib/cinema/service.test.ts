import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CinemaError, type CinemaConnector } from './connector';

const refunds = vi.hoisted(() => ({ refundCinemaHold: vi.fn() }));
vi.mock('./refund', () => refunds);
import {
  CinemaProblem,
  cancelBooking,
  WORKER_BUDGET_MS,
  liveSeatMap,
  placeHold,
  preparePayment,
  releaseHold,
  runWorker,
  type Rpc,
} from './service';

const SHOWING = '11111111-1111-4111-8111-111111111111';
const HOLD = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';

const plan = {
  showingId: SHOWING,
  plan: {
    rows: [
      {
        label: 'F',
        cells: [
          { id: 'F7', type: 'standard' },
          { id: 'F8', type: 'vip' },
        ],
      },
    ],
  },
  taken: [],
};
const call = {
  showingId: SHOWING,
  showingRef: 'SB-1',
  status: 'on_sale',
  startsAt: '2099-01-01T17:00:00Z',
  connectionId: 'conn',
  adapterId: 'sandbox-cinema',
  connectionState: 'operational',
  prices: { standard: 65000, vip: 90000, wheelchair: 65000 },
};

function fakeConnector(overrides: Partial<CinemaConnector> = {}): CinemaConnector {
  return {
    adapterId: 'sandbox-cinema',
    capabilities: { extend: true, cancel: true, maxSeats: 10, maxHoldSeconds: 1200 },
    programme: vi.fn(),
    seatMap: vi.fn(async () => ({
      showingRef: 'SB-1',
      observedAt: '2026-11-23T10:00:00Z',
      taken: ['A1'],
    })),
    hold: vi.fn(async () => ({
      holdRef: 'H-1',
      expiresAt: '2026-11-23T10:07:00Z',
      totalMinor: 155000,
      lines: [
        { seat: 'F7', type: 'standard' as const, priceMinor: 65000 },
        { seat: 'F8', type: 'vip' as const, priceMinor: 90000 },
      ],
    })),
    extend: vi.fn(async () => ({ expiresAt: '2026-11-23T10:20:00Z' })),
    confirm: vi.fn(async () => ({
      bookingRef: 'B-1',
      tickets: [{ seat: 'F7', ticketRef: 'T-1' }],
    })),
    lookup: vi.fn(async () => null),
    release: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  };
}

type Answer = { data?: unknown; error?: { message: string; code?: string; hint?: string } };
function fakeRpc(answers: Record<string, Answer | ((args: Record<string, unknown>) => Answer)>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args = {}) => {
    calls.push({ fn, args });
    const found = answers[fn];
    const answer = typeof found === 'function' ? found(args) : (found ?? {});
    return { data: answer.data ?? null, error: answer.error ?? null };
  };
  return { rpc, calls, names: () => calls.map((c) => c.fn) };
}

async function problem(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof CinemaProblem) return error;
    throw error;
  }
  throw new Error('expected a problem');
}

let connector: CinemaConnector;
beforeEach(() => {
  connector = fakeConnector();
});

describe('the live seat map', () => {
  it("reads the cinema's own seats and keeps what it said", async () => {
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    const map = await liveSeatMap(user.rpc, db.rpc, () => connector, SHOWING);
    expect(map).toMatchObject({ taken: ['A1'], live: true });
    expect(db.calls.find((c) => c.fn === 'cinema_record_snapshot')?.args).toMatchObject({
      p_taken: ['A1'],
    });
  });

  it("says so plainly when the cinema's system does not answer", async () => {
    connector = fakeConnector({
      seatMap: vi.fn(async () => Promise.reject(new CinemaError('unavailable', 'down'))),
    });
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    const error = await problem(liveSeatMap(user.rpc, db.rpc, () => connector, SHOWING));
    expect([error.status, error.code]).toEqual([503, 'CINEMA_UNREACHABLE']);
  });

  it('shows nothing the customer may not see', async () => {
    const user = fakeRpc({ rpc_cinema_seat_map: { error: { message: 'closed', code: 'P0002' } } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    const error = await problem(liveSeatMap(user.rpc, db.rpc, () => connector, SHOWING));
    expect(error.code).toBe('SHOWING_CLOSED');
    expect(db.calls).toEqual([]);
  });
});

describe('holding seats', () => {
  const input = {
    userId: USER,
    showingId: SHOWING,
    seats: ['F7', 'F8'],
    expectedTotalMinor: 155000,
    requestId: REQUEST,
  };

  it("holds them on the cinema's system, then records its hold", async () => {
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({
      cinema_showing_for_call: { data: call },
      cinema_record_hold: { data: { holdId: HOLD, state: 'held' } },
    });
    expect(await placeHold(user.rpc, db.rpc, () => connector, input)).toEqual({
      holdId: HOLD,
      state: 'held',
    });
    expect(connector.hold).toHaveBeenCalledWith({
      showingRef: 'SB-1',
      seats: ['F7', 'F8'],
      requestId: REQUEST,
      ttlSeconds: 420,
    });
    expect(db.calls.find((c) => c.fn === 'cinema_record_hold')?.args).toMatchObject({
      p_user_id: USER,
      p_source_hold_ref: 'H-1',
      p_total_minor: 155000,
    });
  });

  it('asks nothing of the cinema when the price the customer saw is out of date', async () => {
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    const error = await problem(
      placeHold(user.rpc, db.rpc, () => connector, { ...input, expectedTotalMinor: 130000 }),
    );
    expect(error.code).toBe('PRICE_CHANGED');
    expect(connector.hold).not.toHaveBeenCalled();
  });

  it('lets go of the hold when the cinema prices it differently', async () => {
    connector = fakeConnector({
      hold: vi.fn(async () => ({ holdRef: 'H-1', expiresAt: 'x', totalMinor: 160000, lines: [] })),
    });
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    expect((await problem(placeHold(user.rpc, db.rpc, () => connector, input))).code).toBe(
      'PRICE_CHANGED',
    );
    expect(connector.release).toHaveBeenCalledWith('H-1');
    expect(db.names()).not.toContain('cinema_record_hold');
  });

  it('names the seat that was just taken', async () => {
    connector = fakeConnector({
      hold: vi.fn(async () =>
        Promise.reject(new CinemaError('seat_taken', 'taken', { seats: ['F7'] })),
      ),
    });
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    const error = await problem(placeHold(user.rpc, db.rpc, () => connector, input));
    expect([error.status, error.code, error.message, error.extra]).toEqual([
      409,
      'SEAT_TAKEN',
      'Seat F7 was just taken. Pick another seat.',
      { seats: ['F7'] },
    ]);
  });

  it('refuses seats that are not on the map, and a cinema that is paused', async () => {
    const user = fakeRpc({ rpc_cinema_seat_map: { data: plan } });
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    expect(
      (await problem(placeHold(user.rpc, db.rpc, () => connector, { ...input, seats: ['Z1'] })))
        .code,
    ).toBe('INVALID_REQUEST');
    const paused = fakeRpc({
      cinema_showing_for_call: { data: { ...call, connectionState: 'paused' } },
    });
    expect((await problem(placeHold(user.rpc, paused.rpc, () => connector, input))).code).toBe(
      'SHOWING_CLOSED',
    );
    expect(connector.hold).not.toHaveBeenCalled();
  });
});

describe('paying and backing out', () => {
  const now = new Date('2026-11-23T10:03:00Z');
  const mine = fakeRpc({ rpc_my_cinema_hold: { data: { holdId: HOLD } } });
  const hold = (state: string, expiresAt = '2026-11-23T10:07:00Z') => ({
    holdId: HOLD,
    state,
    requestId: REQUEST,
    connectionId: 'conn',
    adapterId: 'sandbox-cinema',
    showingRef: 'SB-1',
    seats: ['F7'],
    totalMinor: 65000,
    holdRef: 'H-1',
    bookingRef: null,
    paymentReference: null,
    expiresAt,
  });

  it('extends the hold to cover the payment before it starts', async () => {
    const db = fakeRpc({
      cinema_hold_for_worker: { data: hold('held') },
      cinema_record_paying: { data: { state: 'paying' } },
    });
    expect(await preparePayment(mine.rpc, db.rpc, () => connector, HOLD, now)).toEqual({
      state: 'paying',
    });
    expect(connector.extend).toHaveBeenCalledWith('H-1', new Date('2026-11-23T10:18:00Z'));
    expect(db.calls.find((c) => c.fn === 'cinema_record_paying')?.args).toEqual({
      p_hold_id: HOLD,
      p_expires_at: '2026-11-23T10:20:00Z',
    });
  });

  it("won't start a payment the hold can't outlast", async () => {
    connector = fakeConnector({
      extend: vi.fn(async () => ({ expiresAt: '2026-11-23T10:08:00Z' })),
    });
    const db = fakeRpc({ cinema_hold_for_worker: { data: hold('held') } });
    expect((await problem(preparePayment(mine.rpc, db.rpc, () => connector, HOLD, now))).code).toBe(
      'HOLD_TOO_SHORT',
    );
    expect(db.names()).not.toContain('cinema_record_paying');
  });

  it('releases a hold the customer backs out of, but not once payment starts', async () => {
    const held = fakeRpc({
      cinema_hold_for_worker: { data: hold('held') },
      cinema_record_hold_ended: { data: { state: 'released' } },
    });
    await releaseHold(mine.rpc, held.rpc, () => connector, HOLD);
    // NexG records it before the cinema is told.
    expect(held.names().indexOf('cinema_record_hold_ended')).toBeGreaterThan(-1);
    expect(connector.release).toHaveBeenCalledWith('H-1');
    expect(held.calls.find((c) => c.fn === 'cinema_record_hold_ended')?.args).toEqual({
      p_hold_id: HOLD,
      p_state: 'released',
    });

    const paying = fakeRpc({ cinema_hold_for_worker: { data: hold('paying') } });
    expect((await problem(releaseHold(mine.rpc, paying.rpc, () => connector, HOLD))).code).toBe(
      'PAYMENT_IN_PROGRESS',
    );
  });
});

describe('the worker', () => {
  const paid = {
    holdId: HOLD,
    state: 'confirming',
    requestId: REQUEST,
    connectionId: 'conn',
    adapterId: 'sandbox-cinema',
    showingRef: 'SB-1',
    seats: ['F7'],
    totalMinor: 65000,
    holdRef: 'H-1',
    bookingRef: null,
    paymentReference: 'PSK-1',
    expiresAt: '2026-11-23T10:20:00Z',
  };
  const due = (confirms: string[] = [HOLD]) => ({
    data: { syncs: [], confirms, expiries: [], refunds: [] },
  });

  it('confirms a paid hold with the same request id every time', async () => {
    const db = fakeRpc({ cinema_due_work: due(), cinema_hold_for_worker: { data: paid } });
    expect((await runWorker(db.rpc, () => connector)).confirmed).toBe(1);
    expect(connector.confirm).toHaveBeenCalledWith({
      holdRef: 'H-1',
      requestId: `confirm:${REQUEST}`,
      paymentRef: 'PSK-1',
    });
    expect(db.calls.find((c) => c.fn === 'cinema_record_confirm')?.args).toMatchObject({
      p_booking_ref: 'B-1',
    });
  });

  it('asks whether a timed-out confirm booked before trying again', async () => {
    connector = fakeConnector({
      confirm: vi.fn(async () => Promise.reject(new CinemaError('unavailable', 'no answer'))),
      lookup: vi.fn(async () => ({ bookingRef: 'B-9', tickets: [] })),
    });
    const db = fakeRpc({ cinema_due_work: due(), cinema_hold_for_worker: { data: paid } });
    expect((await runWorker(db.rpc, () => connector)).confirmed).toBe(1);
    expect(connector.lookup).toHaveBeenCalledWith(`confirm:${REQUEST}`);
    expect(db.calls.find((c) => c.fn === 'cinema_record_confirm')?.args).toMatchObject({
      p_booking_ref: 'B-9',
    });
  });

  it('tries again later when nobody knows, and refunds when the cinema refuses', async () => {
    connector = fakeConnector({
      confirm: vi.fn(async () => Promise.reject(new CinemaError('unavailable', 'no answer'))),
    });
    const retry = fakeRpc({
      cinema_due_work: due(),
      cinema_hold_for_worker: { data: paid },
      cinema_record_confirm_failed: { data: { state: 'confirming' } },
    });
    expect((await runWorker(retry.rpc, () => connector)).confirmRetrying).toBe(1);
    expect(retry.calls.find((c) => c.fn === 'cinema_record_confirm_failed')?.args).toMatchObject({
      p_final: false,
    });

    connector = fakeConnector({
      confirm: vi.fn(async () => Promise.reject(new CinemaError('seat_lost', 'gone'))),
    });
    const refused = fakeRpc({
      cinema_due_work: due(),
      cinema_hold_for_worker: { data: paid },
      cinema_record_confirm_failed: { data: { state: 'refund_due' } },
    });
    expect((await runWorker(refused.rpc, () => connector)).refundDue).toBe(1);
    expect(connector.lookup).not.toHaveBeenCalled();
    expect(refused.calls.find((c) => c.fn === 'cinema_record_confirm_failed')?.args).toMatchObject({
      p_final: true,
    });
  });

  it('expires a lapsed hold on NexG first, and lets it go at the cinema only then', async () => {
    const lapsed = fakeRpc({
      cinema_due_work: { data: { syncs: [], confirms: [], expiries: [HOLD], refunds: [] } },
      cinema_hold_for_worker: { data: { ...paid, state: 'paying' } },
      cinema_record_hold_ended: { data: { state: 'expired' } },
    });
    expect((await runWorker(lapsed.rpc, () => connector)).expired).toBe(1);
    expect(connector.release).toHaveBeenCalledWith('H-1');
  });

  it('keeps the seats of a payment that settled while the hold was being expired', async () => {
    const settled = fakeRpc({
      cinema_due_work: { data: { syncs: [], confirms: [], expiries: [HOLD], refunds: [] } },
      cinema_hold_for_worker: { data: { ...paid, state: 'paying' } },
      cinema_record_hold_ended: { data: { state: 'confirming' } },
    });
    expect((await runWorker(settled.rpc, () => connector)).expired).toBe(0);
    expect(connector.release).not.toHaveBeenCalled();
  });

  it('keeps going past one broken item, and leaves the rest for the next run when time is up', async () => {
    const db = fakeRpc({
      cinema_due_work: due(['broken', HOLD]),
      cinema_hold_for_worker: (args) =>
        args.p_hold_id === 'broken' ? { error: { message: 'boom' } } : { data: paid },
    });
    expect(await runWorker(db.rpc, () => connector)).toMatchObject({ failed: 1, confirmed: 1 });

    let clock = 0;
    const late = fakeRpc({
      cinema_due_work: due([HOLD, HOLD]),
      cinema_hold_for_worker: { data: paid },
    });
    const now = () => new Date((clock += WORKER_BUDGET_MS));
    expect(await runWorker(late.rpc, () => connector, now)).toMatchObject({
      confirmed: 0,
      left: 2,
    });
  });
});

describe('holding seats, again and again', () => {
  const input = {
    userId: USER,
    showingId: SHOWING,
    seats: ['F7', 'F8'],
    expectedTotalMinor: 155000,
    requestId: REQUEST,
  };
  const seatsRead = () => fakeRpc({ rpc_cinema_seat_map: { data: plan } });

  it('answers a retry from what NexG holds, without asking the cinema again', async () => {
    const db = fakeRpc({
      cinema_hold_for_request: {
        data: { holdId: HOLD, state: 'held', seats: ['F7', 'F8'], showingId: SHOWING },
      },
    });
    expect(await placeHold(seatsRead().rpc, db.rpc, () => connector, input)).toEqual({
      holdId: HOLD,
      state: 'held',
      seats: ['F7', 'F8'],
    });
    expect(connector.hold).not.toHaveBeenCalled();
  });

  it('refuses a request id reused for other seats', async () => {
    const db = fakeRpc({
      cinema_hold_for_request: { data: { holdId: HOLD, seats: ['A1'], showingId: SHOWING } },
    });
    expect((await problem(placeHold(seatsRead().rpc, db.rpc, () => connector, input))).code).toBe(
      'REQUEST_REUSED',
    );
    expect(connector.hold).not.toHaveBeenCalled();
  });

  it('replaces an earlier hold on the same showing, and stops at three showings', async () => {
    const replacing = fakeRpc({
      cinema_showing_for_call: { data: call },
      cinema_active_holds: { data: [{ holdId: 'old', showingId: SHOWING, state: 'held' }] },
      cinema_hold_for_worker: { data: { holdId: 'old', state: 'held', holdRef: 'H-OLD' } },
      cinema_record_hold_ended: { data: { state: 'released' } },
      cinema_record_hold: { data: { holdId: HOLD, state: 'held' } },
    });
    await placeHold(seatsRead().rpc, replacing.rpc, () => connector, input);
    expect(connector.release).toHaveBeenCalledWith('H-OLD');
    expect(connector.hold).toHaveBeenCalled();

    const full = fakeRpc({
      cinema_showing_for_call: { data: call },
      cinema_active_holds: {
        data: ['a', 'b', 'c'].map((s) => ({ holdId: s, showingId: s, state: 'held' })),
      },
    });
    connector = fakeConnector();
    expect((await problem(placeHold(seatsRead().rpc, full.rpc, () => connector, input))).code).toBe(
      'TOO_MANY_HOLDS',
    );
    expect(connector.hold).not.toHaveBeenCalled();
  });

  it('lets the cinema hold go when NexG cannot record it', async () => {
    const db = fakeRpc({
      cinema_showing_for_call: { data: call },
      cinema_record_hold: { error: { message: 'too many', code: 'P0001', hint: 'too_many_holds' } },
    });
    expect((await problem(placeHold(seatsRead().rpc, db.rpc, () => connector, input))).code).toBe(
      'TOO_MANY_HOLDS',
    );
    expect(connector.release).toHaveBeenCalledWith('H-1');
  });

  it('stops selling 20 minutes before the start: time to pay, then the cinema closes', async () => {
    const db = fakeRpc({ cinema_showing_for_call: { data: call } });
    const nearly = new Date(new Date(call.startsAt).getTime() - 19 * 60 * 1000);
    const error = await problem(placeHold(seatsRead().rpc, db.rpc, () => connector, input, nearly));
    expect([error.status, error.code]).toEqual([410, 'SHOWING_CLOSED']);
    expect(connector.hold).not.toHaveBeenCalled();
  });
});

describe('paying for a hold already paid', () => {
  const mine = fakeRpc({ rpc_my_cinema_hold: { data: { holdId: HOLD, state: 'confirmed' } } });
  const base = {
    holdId: HOLD,
    requestId: REQUEST,
    connectionId: 'conn',
    adapterId: 'sandbox-cinema',
    showingRef: 'SB-1',
    seats: ['F7'],
    totalMinor: 65000,
    holdRef: 'H-1',
    bookingRef: 'B-1',
    paymentReference: 'PSK-1',
    expiresAt: '2099-01-01T16:40:00Z',
  };

  it('answers the hold as it is, never "released"', async () => {
    for (const state of ['confirming', 'confirmed', 'refund_due', 'refunded']) {
      const db = fakeRpc({ cinema_hold_for_worker: { data: { ...base, state } } });
      expect(await preparePayment(mine.rpc, db.rpc, () => connector, HOLD)).toEqual({
        holdId: HOLD,
        state: 'confirmed',
      });
    }
    expect(connector.extend).not.toHaveBeenCalled();
  });

  it('says "try again", not "released", when NexG fails to record the payment start', async () => {
    const db = fakeRpc({
      cinema_hold_for_worker: { data: { ...base, state: 'held', bookingRef: null } },
      cinema_record_paying: { error: { message: 'TypeError: fetch failed' } },
    });
    connector = fakeConnector({
      extend: vi.fn(async () => ({ expiresAt: '2099-01-01T16:40:00Z' })),
    });
    const error = await problem(preparePayment(mine.rpc, db.rpc, () => connector, HOLD));
    expect([error.status, error.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
  });
});

describe('cancelling a booking', () => {
  const mine = fakeRpc({ rpc_my_cinema_hold: { data: { holdId: HOLD, state: 'confirmed' } } });
  const booked = {
    holdId: HOLD,
    state: 'confirmed',
    requestId: REQUEST,
    connectionId: 'conn',
    adapterId: 'sandbox-cinema',
    showingRef: 'SB-1',
    seats: ['F7'],
    totalMinor: 65000,
    holdRef: 'H-1',
    bookingRef: 'B-1',
    paymentReference: 'PSK-1',
    expiresAt: '2099-01-01T16:40:00Z',
    cinemaName: '[Test] NexG Cinema',
  };

  it('writes the request down before asking the cinema, then records the cancel', async () => {
    const db = fakeRpc({ cinema_hold_for_worker: { data: booked } });
    const answer = await cancelBooking(mine.rpc, db.rpc, () => connector, HOLD);
    expect(answer.status).toBe(200);
    expect(db.names().indexOf('cinema_record_cancel_requested')).toBeLessThan(
      db.names().indexOf('cinema_record_cancelled'),
    );
    expect(connector.cancel).toHaveBeenCalledWith('B-1');
  });

  it('answers 202 while the cinema has not answered, and keeps asking', async () => {
    connector = fakeConnector({
      cancel: vi.fn(async () => Promise.reject(new CinemaError('unavailable', 'no answer'))),
    });
    const db = fakeRpc({ cinema_hold_for_worker: { data: booked } });
    expect((await cancelBooking(mine.rpc, db.rpc, () => connector, HOLD)).status).toBe(202);
    expect(db.calls.find((c) => c.fn === 'cinema_record_cancel_failed')?.args).toMatchObject({
      p_final: false,
    });
    expect(db.names()).not.toContain('cinema_record_cancelled');
  });

  it("says the cinema's name when it is too close to the start", async () => {
    connector = fakeConnector({
      cancel: vi.fn(async () => Promise.reject(new CinemaError('cancel_window_closed', 'late'))),
    });
    const db = fakeRpc({ cinema_hold_for_worker: { data: booked } });
    const error = await problem(cancelBooking(mine.rpc, db.rpc, () => connector, HOLD));
    expect([error.code, error.message]).toEqual([
      'CANCEL_WINDOW_CLOSED',
      "[Test] NexG Cinema doesn't allow cancelling this close to the showing.",
    ]);
    expect(db.calls.find((c) => c.fn === 'cinema_record_cancel_failed')?.args).toMatchObject({
      p_final: true,
    });
  });

  it('the worker finishes a cancel the cinema did not answer', async () => {
    const db = fakeRpc({
      cinema_due_work: {
        data: { syncs: [], confirms: [], expiries: [], cancels: [HOLD], refunds: [] },
      },
      cinema_hold_for_worker: { data: { ...booked, cancelRequestedAt: '2026-11-25T10:00:00Z' } },
    });
    expect((await runWorker(db.rpc, () => connector)).cancelled).toBe(1);
    expect(db.calls.find((c) => c.fn === 'cinema_record_cancelled')?.args).toEqual({
      p_hold_id: HOLD,
      p_reason: 'customer_cancelled',
    });
  });
});

describe('the worker and late answers', () => {
  const late = {
    holdId: HOLD,
    state: 'refund_due',
    refundReason: 'confirm_refused',
    settledAt: new Date().toISOString(),
    requestId: REQUEST,
    connectionId: 'conn',
    adapterId: 'sandbox-cinema',
    showingRef: 'SB-1',
    seats: ['F7'],
    totalMinor: 65000,
    holdRef: 'H-1',
    bookingRef: null,
    paymentReference: 'PSK-1',
    expiresAt: '2099-01-01T16:40:00Z',
  };
  const due = (refunds: string[]) => ({
    data: { syncs: [], confirms: [], expiries: [], cancels: [], refunds },
  });

  it('honours a booking the cinema made after NexG stopped waiting', async () => {
    connector = fakeConnector({
      lookup: vi.fn(async () => ({ bookingRef: 'B-LATE', tickets: [] })),
    });
    const db = fakeRpc({ cinema_due_work: due([HOLD]), cinema_hold_for_worker: { data: late } });
    expect((await runWorker(db.rpc, () => connector)).foundLate).toBe(1);
    expect(db.calls.find((c) => c.fn === 'cinema_record_confirm')?.args).toMatchObject({
      p_booking_ref: 'B-LATE',
    });
  });

  it('does not refund while the cinema cannot say whether it booked late', async () => {
    refunds.refundCinemaHold.mockReset();
    connector = fakeConnector({
      lookup: vi.fn(async () => {
        throw new CinemaError('unavailable', 'The cinema did not answer.');
      }),
    });
    const db = fakeRpc({ cinema_due_work: due([HOLD]), cinema_hold_for_worker: { data: late } });
    expect(await runWorker(db.rpc, () => connector)).toMatchObject({
      refundsDeferred: 1,
      refundsStarted: 0,
      refundsFailed: 0,
      failed: 0,
    });
    expect(refunds.refundCinemaHold).not.toHaveBeenCalled();
  });

  it('refunds a refused confirm once the cinema says it has no booking', async () => {
    refunds.refundCinemaHold.mockReset();
    refunds.refundCinemaHold.mockResolvedValueOnce({ reference: 'NXR-1', outcome: 'sent' });
    connector = fakeConnector({ lookup: vi.fn(async () => null) });
    const db = fakeRpc({ cinema_due_work: due([HOLD]), cinema_hold_for_worker: { data: late } });
    expect(await runWorker(db.rpc, () => connector)).toMatchObject({
      refundsStarted: 1,
      refundsDeferred: 0,
    });
    expect(connector.lookup).toHaveBeenCalledTimes(1);
    expect(refunds.refundCinemaHold).toHaveBeenCalledWith(db.rpc, HOLD, 'confirm_refused');
  });

  it('counts refunds left to a person, and Paystack refusals once', async () => {
    refunds.refundCinemaHold.mockReset();
    refunds.refundCinemaHold
      .mockResolvedValueOnce({ outcome: 'needs_person', message: 'Live refunds are off.' })
      .mockResolvedValueOnce({ reference: 'NXR-2', outcome: 'refused', message: 'No.' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = fakeRpc({
      cinema_due_work: due([HOLD, HOLD]),
      cinema_hold_for_worker: { data: { ...late, refundReason: 'showing_cancelled' } },
    });
    expect(await runWorker(db.rpc, () => connector)).toMatchObject({
      refundsNeedPerson: 1,
      refundsFailed: 1,
      refundsStarted: 0,
      failed: 0,
    });
    expect(refunds.refundCinemaHold).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('refunds other holds through Paystack, and counts what happened', async () => {
    refunds.refundCinemaHold.mockReset();
    refunds.refundCinemaHold.mockResolvedValueOnce({ reference: 'NXR-1', outcome: 'sent' });
    const db = fakeRpc({
      cinema_due_work: due([HOLD]),
      cinema_hold_for_worker: { data: { ...late, refundReason: 'customer_cancelled' } },
    });
    expect(await runWorker(db.rpc, () => connector)).toMatchObject({
      refundsStarted: 1,
      refundsWaiting: 0,
      refundsFailed: 0,
    });
    expect(refunds.refundCinemaHold).toHaveBeenCalledWith(db.rpc, HOLD, 'customer_cancelled');
    expect(connector.lookup).not.toHaveBeenCalled();
    // Never recorded as refunded here: only Paystack's processed answer does that.
    expect(db.names()).not.toContain('cinema_record_refunded');
  });

  it('counts a refund that was not sent, without stopping the run', async () => {
    refunds.refundCinemaHold.mockReset();
    refunds.refundCinemaHold
      .mockResolvedValueOnce({ reference: 'NXR-1', outcome: 'waiting' })
      .mockRejectedValueOnce(new Error('Live Paystack is not switched on'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const db = fakeRpc({
      cinema_due_work: due([HOLD, HOLD]),
      cinema_hold_for_worker: { data: { ...late, refundReason: 'showing_cancelled' } },
    });
    expect(await runWorker(db.rpc, () => connector)).toMatchObject({
      refundsWaiting: 1,
      refundsFailed: 1,
      failed: 0,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('does not confirm a hold that was handled since it was listed', async () => {
    const db = fakeRpc({
      cinema_due_work: { data: { syncs: [], confirms: [HOLD], expiries: [], refunds: [] } },
      cinema_hold_for_worker: { data: late },
    });
    await runWorker(db.rpc, () => connector);
    expect(connector.confirm).not.toHaveBeenCalled();
  });

  it('cancels at the cinema a booking NexG can no longer take', async () => {
    const db = fakeRpc({
      cinema_due_work: { data: { syncs: [], confirms: [HOLD], expiries: [], refunds: [] } },
      cinema_hold_for_worker: { data: { ...late, state: 'confirming' } },
      cinema_record_confirm: { error: { message: 'Only a paid hold is confirmed.' } },
    });
    expect((await runWorker(db.rpc, () => connector)).failed).toBe(1);
    expect(connector.cancel).toHaveBeenCalledWith('B-1');
  });

  it('syncs from a day back, so a showing cancelled after it started still arrives', async () => {
    const at = new Date('2026-11-25T18:00:00Z');
    const db = fakeRpc({
      cinema_due_work: {
        data: {
          syncs: [{ connectionId: 'conn', adapterId: 'sandbox-cinema' }],
          confirms: [],
          expiries: [],
          refunds: [],
        },
      },
    });
    connector = fakeConnector({
      programme: vi.fn(async () => ({
        window: { from: '', to: '' },
        films: [],
        screens: [],
        showings: [],
      })),
    });
    await runWorker(
      db.rpc,
      () => connector,
      () => at,
    );
    expect(connector.programme).toHaveBeenCalledWith({
      from: new Date('2026-11-24T18:00:00Z'),
      days: 8,
    });
  });
});

describe('tickets as NexG records them', () => {
  it("records each barcode's format in NexG's names", async () => {
    connector = fakeConnector({
      confirm: vi.fn(async () => ({
        bookingRef: 'B-1',
        tickets: [
          { seat: 'F7', ticketRef: 'T-1', barcode: 'X1', barcodeFormat: 'Code-128' as never },
        ],
      })),
    });
    const db = fakeRpc({
      cinema_due_work: { data: { syncs: [], confirms: [HOLD], expiries: [], refunds: [] } },
      cinema_hold_for_worker: {
        data: {
          holdId: HOLD,
          state: 'confirming',
          requestId: REQUEST,
          connectionId: 'conn',
          adapterId: 'sandbox-cinema',
          showingRef: 'SB-1',
          seats: ['F7'],
          totalMinor: 65000,
          holdRef: 'H-1',
          bookingRef: null,
          paymentReference: 'PSK-1',
          expiresAt: '2099-01-01T16:40:00Z',
        },
      },
    });
    await runWorker(db.rpc, () => connector);
    expect(db.calls.find((c) => c.fn === 'cinema_record_confirm')?.args).toMatchObject({
      p_tickets: [{ seat: 'F7', ticketRef: 'T-1', barcode: 'X1', barcodeFormat: 'code128' }],
    });
  });
});
