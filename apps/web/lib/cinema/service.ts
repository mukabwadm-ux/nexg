import {
  CinemaError,
  withTimeout,
  type BookingAnswer,
  type CinemaConnector,
  type HoldAnswer,
  type SeatType,
} from './connector';
import { refundCinemaHold } from './refund';

/**
 * The cinema checkout and its worker, against any CinemaConnector
 * (contract: cinema-app-contract-2026-11-23.md). Two database handles:
 * `user` reads as the signed-in customer (so test tenants and closed
 * showings stay hidden from them), `db` is the service role that records
 * what the cinema's system answered. Every flow reads with `user` before it
 * writes with `db`.
 */
export type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; code?: string; hint?: string } | null }>;

export type ConnectorFor = (connection: {
  connectionId: string;
  adapterId: string;
}) => CinemaConnector;

export class CinemaProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    title: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(title);
    this.name = 'CinemaProblem';
  }
}

/** How long a payment needs once it starts. */
export const PAYMENT_WINDOW_MS = 10 * 60 * 1000;
/** A cinema stops selling 10 minutes before the start; NexG also needs time to pay. */
export const SALES_CLOSE_MS = 10 * 60 * 1000 + PAYMENT_WINDOW_MS;
/** Seats held at once on cinemas' systems, per customer. */
export const MAX_ACTIVE_HOLDS = 3;

const cinema = (name?: string | null) => name?.trim() || 'the cinema';
const Cinema = (name?: string | null) => name?.trim() || 'The cinema';

const unavailable = () =>
  new CinemaProblem(
    503,
    'SERVICE_UNAVAILABLE',
    'Cinema checkout is unavailable. Try again shortly.',
  );
const unreachable = (name?: string | null) =>
  new CinemaProblem(
    503,
    'CINEMA_UNREACHABLE',
    `We can't reach ${cinema(name)}'s booking system right now. Try again in a minute.`,
  );
const closed = () => new CinemaProblem(410, 'SHOWING_CLOSED', 'This showing is no longer on sale.');
const notFound = () => new CinemaProblem(404, 'NOT_FOUND', 'Seat hold not found.');
const holdEnded = () =>
  new CinemaProblem(409, 'HOLD_ENDED', 'Your seats were released. Pick them again.');
const invalidSeats = () =>
  new CinemaProblem(422, 'INVALID_REQUEST', 'Choose one to ten seats from the seat map.');

interface ShowingCall {
  showingId: string;
  showingRef: string;
  status: string;
  startsAt: string;
  connectionId: string;
  adapterId: string;
  connectionState: string;
  cinemaName?: string | null;
  prices: { standard: number | null; vip: number | null; wheelchair: number | null };
}

interface HoldForWorker {
  holdId: string;
  state: string;
  requestId: string;
  connectionId: string;
  adapterId: string;
  showingRef: string;
  seats: string[];
  totalMinor: number;
  holdRef: string;
  bookingRef: string | null;
  paymentReference: string | null;
  expiresAt: string;
  settledAt?: string | null;
  refundReason?: string | null;
  cancelRequestedAt?: string | null;
  cinemaName?: string | null;
}

type SeatPlan = {
  plan?: { rows?: { cells: ({ id: string; type: SeatType } | null)[] }[] };
  taken?: string[];
} & Record<string, unknown>;

type HoldView = Record<string, unknown> & { state?: string; seats?: string[]; showingId?: string };

async function must<T>(
  call: ReturnType<Rpc>,
  onError: (e: { message: string; code?: string; hint?: string }) => never,
): Promise<T> {
  const { data, error } = await call;
  if (error) onError(error);
  return data as T;
}

function fromCinemaError(error: unknown, name?: string | null): never {
  if (error instanceof CinemaProblem) throw error;
  if (error instanceof CinemaError) {
    switch (error.code) {
      case 'seat_taken': {
        const seats = error.options.seats ?? [];
        const first = seats[0];
        throw new CinemaProblem(
          409,
          'SEAT_TAKEN',
          first
            ? `Seat ${first} was just taken. Pick another seat.`
            : 'A seat was just taken. Pick another seat.',
          { seats },
        );
      }
      case 'showing_closed':
        throw closed();
      case 'hold_expired':
        throw holdEnded();
      case 'cancel_window_closed':
        throw new CinemaProblem(
          409,
          'CANCEL_WINDOW_CLOSED',
          `${Cinema(name)} doesn't allow cancelling this close to the showing.`,
        );
      case 'invalid':
        throw invalidSeats();
      default:
        throw unreachable(name);
    }
  }
  throw unreachable(name);
}

async function showingCall(db: Rpc, showingId: string): Promise<ShowingCall | null> {
  return must<ShowingCall | null>(
    db('cinema_showing_for_call', { p_showing_id: showingId }),
    () => {
      throw unavailable();
    },
  );
}

async function seatPlan(user: Rpc, showingId: string): Promise<SeatPlan> {
  return must<SeatPlan>(user('rpc_cinema_seat_map', { p_showing_id: showingId }), (e) => {
    if (e.code === 'P0002') throw closed();
    throw unavailable();
  });
}

function connected(call: ShowingCall | null): call is ShowingCall {
  return call !== null && ['operational', 'degraded'].includes(call.connectionState);
}

export async function liveSeatMap(
  user: Rpc,
  db: Rpc,
  connectorFor: ConnectorFor,
  showingId: string,
) {
  const plan = await seatPlan(user, showingId);
  const call = await showingCall(db, showingId);
  if (call === null) return { ...plan, live: false };
  if (!connected(call)) throw closed();
  try {
    const live = await withTimeout(connectorFor(call).seatMap(call.showingRef));
    await db('cinema_record_snapshot', {
      p_showing_id: showingId,
      p_taken: live.taken,
      p_observed_at: live.observedAt,
    });
    return { ...plan, taken: live.taken, observedAt: live.observedAt, live: true };
  } catch (error) {
    return fromCinemaError(error, call.cinemaName);
  }
}

async function forWorker(db: Rpc, holdId: string): Promise<HoldForWorker> {
  const hold = await must<HoldForWorker | null>(
    db('cinema_hold_for_worker', { p_hold_id: holdId }),
    () => {
      throw unavailable();
    },
  );
  if (!hold) throw notFound();
  return hold;
}

/* Records the end of a hold; answers the state it is in afterwards. */
async function endHold(db: Rpc, holdId: string, state: 'released' | 'expired') {
  const { data, error } = await db('cinema_record_hold_ended', {
    p_hold_id: holdId,
    p_state: state,
  });
  if (error) throw new Error(error.message);
  return (data as { state?: string } | null)?.state;
}

/* Lets go of a hold NexG holds: recorded first, then the cinema is told. */
async function letGo(db: Rpc, connectorFor: ConnectorFor, holdId: string) {
  const hold = await forWorker(db, holdId);
  if (hold.state !== 'held') return false;
  if ((await endHold(db, holdId, 'released')) !== 'released') return false;
  // The cinema forgets an unreleased hold when it lapses, so a failed call is not fatal.
  await withTimeout(connectorFor(hold).release(hold.holdRef)).catch(() => undefined);
  return true;
}

function sameSeats(a: string[] | undefined, b: string[]) {
  return a !== undefined && a.length === b.length && [...a].sort().every((s, i) => s === b[i]);
}

export async function placeHold(
  user: Rpc,
  db: Rpc,
  connectorFor: ConnectorFor,
  input: {
    userId: string;
    showingId: string;
    seats: string[];
    expectedTotalMinor: number;
    requestId: string;
  },
  now = new Date(),
) {
  const seats = [...new Set(input.seats)].sort();
  if (seats.length < 1 || seats.length > 10 || seats.length !== input.seats.length)
    throw invalidSeats();

  // What this customer may see, read as them, before anything else.
  const plan = await seatPlan(user, input.showingId);

  // A retry with the same request answers what NexG already holds, without
  // asking the cinema again.
  const earlier = await must<HoldView | null>(
    db('cinema_hold_for_request', { p_user_id: input.userId, p_request_id: input.requestId }),
    () => {
      throw unavailable();
    },
  );
  if (earlier) {
    if (earlier.showingId !== input.showingId || !sameSeats(earlier.seats, seats))
      throw new CinemaProblem(
        409,
        'REQUEST_REUSED',
        'This request was already used for other seats. Start a new selection.',
      );
    const { showingId: _showingId, ...view } = earlier;
    return view;
  }

  const call = await showingCall(db, input.showingId);
  if (!connected(call)) throw closed();
  if (new Date(call.startsAt).getTime() - now.getTime() < SALES_CLOSE_MS)
    throw new CinemaProblem(410, 'SHOWING_CLOSED', 'Sales for this showing have closed.');

  const types = new Map<string, SeatType>();
  for (const row of plan.plan?.rows ?? [])
    for (const cell of row.cells) if (cell) types.set(cell.id, cell.type);
  let expected = 0;
  for (const seat of seats) {
    const type = types.get(seat);
    const price = type ? call.prices[type] : null;
    if (!type || price === null || price === undefined) throw invalidSeats();
    expected += price;
  }
  if (expected !== input.expectedTotalMinor)
    throw new CinemaProblem(409, 'PRICE_CHANGED', 'Seat prices changed. Review your selection.');

  // Picking seats again for the same showing replaces the earlier hold; a
  // customer holds seats for at most three showings at a time.
  const active = await must<{ holdId: string; showingId: string; state: string }[]>(
    db('cinema_active_holds', { p_user_id: input.userId }),
    () => {
      throw unavailable();
    },
  );
  let others = 0;
  for (const hold of active ?? []) {
    if (hold.showingId === input.showingId && hold.state === 'held') {
      await letGo(db, connectorFor, hold.holdId).catch(() => false);
    } else {
      others += 1;
    }
  }
  if (others >= MAX_ACTIVE_HOLDS) throw tooMany();

  const connector = connectorFor(call);
  let hold: HoldAnswer;
  try {
    hold = await withTimeout(
      connector.hold({
        showingRef: call.showingRef,
        seats,
        requestId: input.requestId,
        ttlSeconds: 420,
      }),
    );
  } catch (error) {
    return fromCinemaError(error, call.cinemaName);
  }
  const holdRef = hold.holdRef;
  const release = () => withTimeout(connector.release(holdRef)).catch(() => undefined);
  if (hold.totalMinor !== expected) {
    await release();
    throw new CinemaProblem(409, 'PRICE_CHANGED', 'Seat prices changed. Review your selection.');
  }
  const recorded = await db('cinema_record_hold', {
    p_showing_id: input.showingId,
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_seats: seats,
    p_lines: hold.lines,
    p_total_minor: hold.totalMinor,
    p_source_hold_ref: hold.holdRef,
    p_expires_at: hold.expiresAt,
  });
  if (recorded.error) {
    // NexG could not take the hold, so the cinema must not keep it either.
    await release();
    if (recorded.error.hint === 'too_many_holds') throw tooMany();
    throw unavailable();
  }
  return recorded.data as Record<string, unknown>;
}

const tooMany = () =>
  new CinemaProblem(
    409,
    'TOO_MANY_HOLDS',
    'You already have seats held for three showings. Pay for them or let them go first.',
  );

export async function myHold(user: Rpc, holdId: string) {
  return must<HoldView>(user('rpc_my_cinema_hold', { p_hold_id: holdId }), (e) => {
    if (e.code === 'P0002') throw notFound();
    throw unavailable();
  });
}

/** The customer's own holds and bookings, newest first (contract v3, step 4b). */
export async function myHolds(
  user: Rpc,
  page: { limit?: number; before?: string; beforeId?: string },
) {
  return must<{ holds: HoldView[]; next: { before: string; beforeId: string } | null }>(
    user('rpc_my_cinema_holds', {
      p_limit: page.limit ?? 20,
      p_before: page.before ?? null,
      p_before_id: page.beforeId ?? null,
    }),
    (e) => {
      if (e.code === '42501')
        throw new CinemaProblem(401, 'AUTH_REQUIRED', 'Sign in to see your tickets.');
      if (e.code === '22023')
        throw new CinemaProblem(
          422,
          'INVALID_REQUEST',
          'That page of your tickets could not be read.',
        );
      throw unavailable();
    },
  );
}

export async function preparePayment(
  user: Rpc,
  db: Rpc,
  connectorFor: ConnectorFor,
  holdId: string,
  now = new Date(),
) {
  const mine = await myHold(user, holdId);
  const hold = await forWorker(db, holdId);
  // Already paying or paid: answer the hold as it is, never "released".
  if (['paying', 'confirming', 'confirmed', 'refund_due', 'refunded'].includes(hold.state))
    return mine;
  if (hold.state !== 'held' || new Date(hold.expiresAt) <= now) throw holdEnded();
  const connector = connectorFor(hold);
  let expiresAt = hold.expiresAt;
  if (connector.capabilities.extend) {
    try {
      expiresAt = (
        await withTimeout(
          connector.extend(
            hold.holdRef,
            new Date(now.getTime() + PAYMENT_WINDOW_MS + 5 * 60 * 1000),
          ),
        )
      ).expiresAt;
    } catch (error) {
      return fromCinemaError(error, hold.cinemaName);
    }
  }
  if (new Date(expiresAt).getTime() < now.getTime() + PAYMENT_WINDOW_MS)
    throw new CinemaProblem(
      409,
      'HOLD_TOO_SHORT',
      "There isn't enough time left on this hold to pay. Hold the seats again?",
    );
  return must<HoldView>(
    db('cinema_record_paying', { p_hold_id: holdId, p_expires_at: expiresAt }),
    (e) => {
      if (e.code === 'P0002') throw notFound();
      if (e.hint === 'hold_ended') throw holdEnded();
      // Anything else is ours, and the cinema's hold still stands: safe to retry.
      throw unavailable();
    },
  );
}

export async function releaseHold(user: Rpc, db: Rpc, connectorFor: ConnectorFor, holdId: string) {
  await myHold(user, holdId);
  const hold = await forWorker(db, holdId);
  if (hold.state === 'paying' || hold.state === 'confirming')
    throw new CinemaProblem(409, 'PAYMENT_IN_PROGRESS', 'Payment has started for these seats.');
  if (hold.state !== 'held') return;
  // NexG's record first: it refuses once payment has started, so seats are
  // never let go of under a payment that began a moment ago.
  await letGo(db, connectorFor, holdId);
}

/**
 * Cancel a confirmed booking. The request is written down before the cinema
 * is asked, so a cancel that the cinema made but never answered is still
 * finished by the worker and refunded. Answers 200 when the cinema has
 * cancelled, 202 while it has not answered yet.
 */
export async function cancelBooking(
  user: Rpc,
  db: Rpc,
  connectorFor: ConnectorFor,
  holdId: string,
): Promise<{ status: 200 | 202; body: HoldView }> {
  await myHold(user, holdId);
  const hold = await forWorker(db, holdId);
  if (hold.state === 'refund_due' || hold.state === 'refunded')
    return { status: 200, body: await myHold(user, holdId) };
  if (hold.state !== 'confirmed' || !hold.bookingRef)
    throw new CinemaProblem(409, 'NOT_CANCELLABLE', 'Only a confirmed booking can be cancelled.');
  const connector = connectorFor(hold);
  if (!connector.capabilities.cancel)
    throw new CinemaProblem(
      409,
      'CANCEL_WINDOW_CLOSED',
      `${Cinema(hold.cinemaName)} doesn't allow cancelling bookings on NexG.`,
    );
  await must(db('cinema_record_cancel_requested', { p_hold_id: holdId }), () => {
    throw unavailable();
  });
  const outcome = await cancelAtCinema(db, connector, hold);
  if (outcome === 'refused')
    throw new CinemaProblem(
      409,
      'CANCEL_WINDOW_CLOSED',
      `${Cinema(hold.cinemaName)} doesn't allow cancelling this close to the showing.`,
    );
  return { status: outcome === 'cancelled' ? 200 : 202, body: await myHold(user, holdId) };
}

/* One attempt to cancel at the cinema, recorded either way. */
async function cancelAtCinema(
  db: Rpc,
  connector: CinemaConnector,
  hold: HoldForWorker,
): Promise<'cancelled' | 'refused' | 'waiting'> {
  try {
    await withTimeout(connector.cancel(hold.bookingRef ?? ''));
  } catch (error) {
    const failure =
      error instanceof CinemaError ? error : new CinemaError('unavailable', 'The cancel failed.');
    await db('cinema_record_cancel_failed', {
      p_hold_id: hold.holdId,
      p_error: failure.message,
      p_final: !failure.retryable,
    });
    return failure.retryable ? 'waiting' : 'refused';
  }
  const recorded = await db('cinema_record_cancelled', {
    p_hold_id: hold.holdId,
    p_reason: 'customer_cancelled',
  });
  // If this fails, the request still stands and the worker records it next time.
  return recorded.error ? 'waiting' : 'cancelled';
}

/** The worker stops taking new work after this long, inside the 60 s a run has. */
export const WORKER_BUDGET_MS = 40_000;
/** Bookings found after NexG stopped waiting are looked for this long after payment. */
export const LATE_BOOKING_LOOKUP_MS = 24 * 60 * 60 * 1000;

/** One pass of the cinema worker: what cinema_due_work lists, done. */
export async function runWorker(db: Rpc, connectorFor: ConnectorFor, now = () => new Date()) {
  const { data, error } = await db('cinema_due_work', { p_limit: 50 });
  if (error) throw new Error('cinema_due_work failed');
  const due = data as {
    syncs: { connectionId: string; adapterId: string }[];
    confirms: string[];
    expiries: string[];
    cancels?: string[];
    refunds: string[];
  };
  const started = now().getTime();
  const inTime = () => now().getTime() - started < WORKER_BUDGET_MS;
  const done = {
    synced: 0,
    syncFailed: 0,
    confirmed: 0,
    confirmRetrying: 0,
    refundDue: 0,
    expired: 0,
    cancelled: 0,
    cancelWaiting: 0,
    cancelRefused: 0,
    foundLate: 0,
    failed: 0,
    left: 0,
    /* Full refunds through Paystack (lib/cinema/refund.ts): asked now, asked
       before and awaiting Paystack's answer, or not sent (shown in the admin).
       refundsNeedPerson: live refunds are off, a person refunds by hand.
       refundsDeferred: the cinema could not say whether a late booking was
       made, so no refund this run. */
    refundsStarted: 0,
    refundsWaiting: 0,
    refundsFailed: 0,
    refundsNeedPerson: 0,
    refundsDeferred: 0,
  };

  // Each item on its own: one that fails is retried next run, the rest go on.
  async function each(ids: string[], work: (id: string) => Promise<void>) {
    for (const id of ids) {
      if (!inTime()) {
        done.left += 1;
        continue;
      }
      try {
        await work(id);
      } catch {
        done.failed += 1;
      }
    }
  }

  // Confirms first: someone has paid and is waiting for tickets.
  await each(due.confirms, async (holdId) => {
    const outcome = await confirmOne(db, connectorFor, holdId);
    if (outcome) done[outcome] += 1;
  });

  await each(due.cancels ?? [], async (holdId) => {
    const hold = await forWorker(db, holdId);
    if (hold.state !== 'confirmed' || !hold.cancelRequestedAt || !hold.bookingRef) return;
    const outcome = await cancelAtCinema(db, connectorFor(hold), hold);
    if (outcome === 'cancelled') done.cancelled += 1;
    else if (outcome === 'refused') done.cancelRefused += 1;
    else done.cancelWaiting += 1;
  });

  await each(due.expiries, async (holdId) => {
    const hold = await forWorker(db, holdId);
    // Recorded first: a payment that settled since the list was made keeps its seats.
    if ((await endHold(db, holdId, 'expired')) !== 'expired') return;
    // The cinema lets an unreleased hold lapse on its own, so a failed call is not fatal.
    await withTimeout(connectorFor(hold).release(hold.holdRef)).catch(() => undefined);
    done.expired += 1;
  });

  // A paid hold NexG stopped waiting for may have booked after all: such a
  // booking is honoured rather than refunded.
  await each(due.refunds, async (holdId) => {
    const hold = await forWorker(db, holdId);
    if (hold.state !== 'refund_due') return;
    const settled = hold.settledAt ? new Date(hold.settledAt).getTime() : 0;
    if (
      hold.refundReason === 'confirm_refused' &&
      now().getTime() - settled < LATE_BOOKING_LOOKUP_MS
    ) {
      /* Only a definite "no booking" lets the refund go ahead. A lookup that
         fails or times out leaves this hold for the next run: never refund
         money for seats the cinema may have booked. */
      let booking: BookingAnswer | null;
      try {
        booking = await withTimeout(connectorFor(hold).lookup(`confirm:${hold.requestId}`));
      } catch {
        done.refundsDeferred += 1;
        return;
      }
      if (booking) {
        const recorded = await db('cinema_record_confirm', {
          p_hold_id: holdId,
          p_booking_ref: booking.bookingRef,
          p_tickets: booking.tickets,
        });
        if (recorded.error) throw new Error(recorded.error.message);
        done.foundLate += 1;
        return;
      }
    }
    /* Paystack is asked to refund the whole payment. The hold becomes
       "refunded" (the contract's cinema_record_refunded) only when Paystack's
       refund.processed answer arrives, through fn_paystack_refund_apply, not
       here. A failure is logged and counted; the next run tries again. */
    try {
      const refunded = await refundCinemaHold(db, holdId, hold.refundReason ?? 'refund_due');
      if (refunded.outcome === 'sent') done.refundsStarted += 1;
      else if (refunded.outcome === 'needs_person') done.refundsNeedPerson += 1;
      else if (refunded.outcome === 'refused') {
        // Recorded as failed by the database; counted once, not asked again this run.
        done.refundsFailed += 1;
        console.warn('cinema refund refused by Paystack', {
          holdId,
          reason: refunded.message.slice(0, 200),
        });
      } else done.refundsWaiting += 1;
    } catch (failure) {
      done.refundsFailed += 1;
      console.warn('cinema refund not sent', {
        holdId,
        reason: failure instanceof Error ? failure.message.slice(0, 200) : 'unknown',
      });
    }
  });

  await each(
    due.syncs.map((s) => s.connectionId),
    async (connectionId) => {
      const sync = due.syncs.find((s) => s.connectionId === connectionId)!;
      try {
        // From a day back, so a showing the cinema cancels after it started still arrives.
        const programme = await withTimeout(
          connectorFor(sync).programme({
            from: new Date(now().getTime() - 24 * 60 * 60 * 1000),
            days: 8,
          }),
          20_000,
        );
        const applied = await db('cinema_sync_apply', {
          p_connection_id: sync.connectionId,
          p_programme: programme,
        });
        if (applied.error) throw new Error(applied.error.message);
        done.synced += 1;
      } catch (failure) {
        await db('cinema_sync_failed', {
          p_connection_id: sync.connectionId,
          p_error:
            failure instanceof Error ? failure.message : "The cinema's system did not answer.",
        });
        done.syncFailed += 1;
      }
    },
  );
  return done;
}

async function confirmOne(
  db: Rpc,
  connectorFor: ConnectorFor,
  holdId: string,
): Promise<'confirmed' | 'confirmRetrying' | 'refundDue' | null> {
  const hold = await forWorker(db, holdId);
  // Handled since it was listed (refunded, or confirmed by an earlier run).
  if (hold.state !== 'confirming') return null;
  const connector = connectorFor(hold);
  // The same id on every attempt, so the cinema never books twice.
  const requestId = `confirm:${hold.requestId}`;
  let booking: BookingAnswer | null = null;
  let failure: CinemaError | null = null;
  try {
    booking = await withTimeout(
      connector.confirm({
        holdRef: hold.holdRef,
        requestId,
        paymentRef: hold.paymentReference ?? '',
      }),
    );
  } catch (error) {
    failure =
      error instanceof CinemaError ? error : new CinemaError('unavailable', 'The confirm failed.');
    // No answer: it may have booked anyway. Ask before trying again.
    if (failure.retryable)
      booking = await withTimeout(connector.lookup(requestId)).catch(() => null);
  }
  if (booking) {
    const recorded = await db('cinema_record_confirm', {
      p_hold_id: holdId,
      p_booking_ref: booking.bookingRef,
      p_tickets: booking.tickets,
    });
    if (recorded.error) {
      // NexG can no longer take this booking (already refunded): the cinema must not keep it.
      await withTimeout(connector.cancel(booking.bookingRef)).catch(() => undefined);
      throw new Error(recorded.error.message);
    }
    return 'confirmed';
  }
  const final = failure !== null && !failure.retryable;
  const recorded = await db('cinema_record_confirm_failed', {
    p_hold_id: holdId,
    p_error: failure?.message ?? 'The cinema did not confirm.',
    p_final: final,
  });
  if (recorded.error) throw new Error(recorded.error.message);
  return (recorded.data as { state?: string } | null)?.state === 'refund_due'
    ? 'refundDue'
    : 'confirmRetrying';
}
