import {
  CinemaError,
  type BookingAnswer,
  type CinemaConnector,
  type HoldAnswer,
  type Programme,
  type SeatAnswer,
} from './connector';

/** Calls public.sandbox_cinema(tenant, op, args) with the service role. */
export type SandboxRpc = (
  op: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

type Answer = { ok?: boolean; error?: string; seats?: string[]; retryable?: boolean } & Record<
  string,
  unknown
>;

const MESSAGES: Record<string, string> = {
  showing_closed: 'This showing is no longer on sale.',
  seat_taken: 'A seat was just taken.',
  hold_expired: 'The hold has ended.',
  seat_lost: 'The cinema could not keep these seats.',
  cancel_window_closed: 'Too close to the showing to cancel.',
  invalid_seats: 'Those are not seats in this screen.',
};

/**
 * The sandbox cinema (migration 20270317000200): a ticketing system with its
 * own state, for test cinemas only. It answers like a real one, including its
 * faults: "down" answers as if unreachable and "slow" outlasts the live
 * timeout, so the same paths a real outage takes are the ones tested.
 */
export class SandboxCinemaConnector implements CinemaConnector {
  readonly adapterId = 'sandbox-cinema';
  readonly capabilities = { extend: true, cancel: true, maxSeats: 10, maxHoldSeconds: 1200 };

  constructor(
    private readonly rpc: SandboxRpc,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async call(op: string, args: Record<string, unknown> = {}): Promise<Answer> {
    const fault = await this.rpc('fault', {});
    const faults = (fault.data ?? {}) as { down?: boolean; slow?: boolean };
    if (fault.error || faults.down)
      throw new CinemaError('unavailable', "The cinema's booking system is not answering.");
    if (faults.slow) await this.sleep(9000);
    const { data, error } = await this.rpc(op, args);
    if (error)
      throw new CinemaError('unavailable', "The cinema's booking system is not answering.");
    const answer = (data ?? {}) as Answer;
    if (answer.ok === false) {
      const code = answer.error ?? 'unavailable';
      switch (code) {
        case 'seat_taken':
          throw new CinemaError('seat_taken', MESSAGES.seat_taken!, { seats: answer.seats ?? [] });
        case 'showing_closed':
        case 'hold_expired':
        case 'seat_lost':
        case 'cancel_window_closed':
          throw new CinemaError(code, MESSAGES[code]!);
        case 'invalid_seats':
          throw new CinemaError('invalid', MESSAGES.invalid_seats!);
        default:
          throw new CinemaError('unavailable', "The cinema's booking system is not answering.", {
            retryable: answer.retryable ?? true,
          });
      }
    }
    return answer;
  }

  async programme(window: { from: Date; days: number }): Promise<Programme> {
    const answer = await this.call('programme', {
      from: window.from.toISOString(),
      days: window.days,
    });
    return {
      window: answer.window,
      films: answer.films,
      screens: answer.screens,
      showings: answer.showings,
    } as Programme;
  }

  async seatMap(showingRef: string): Promise<SeatAnswer> {
    const answer = await this.call('seat_map', { showingRef });
    return {
      showingRef,
      observedAt: String(answer.observedAt),
      taken: (answer.taken as string[]) ?? [],
    };
  }

  async hold(input: {
    showingRef: string;
    seats: string[];
    requestId: string;
    ttlSeconds: number;
  }): Promise<HoldAnswer> {
    const answer = await this.call('hold', input);
    return {
      holdRef: String(answer.holdRef),
      expiresAt: String(answer.expiresAt),
      totalMinor: Number(answer.totalMinor),
      lines: (answer.lines as HoldAnswer['lines']) ?? [],
    };
  }

  async extend(holdRef: string, until: Date) {
    const answer = await this.call('extend', { holdRef, until: until.toISOString() });
    return { expiresAt: String(answer.expiresAt) };
  }

  async confirm(input: {
    holdRef: string;
    requestId: string;
    paymentRef: string;
  }): Promise<BookingAnswer> {
    const answer = await this.call('confirm', input);
    const booking = {
      bookingRef: String(answer.bookingRef),
      tickets: (answer.tickets as BookingAnswer['tickets']) ?? [],
    };
    // "Books, then answers too late": the booking exists, the caller times out.
    if (answer.late) await this.sleep(9000);
    return booking;
  }

  async lookup(requestId: string): Promise<BookingAnswer | null> {
    const answer = await this.call('lookup', { requestId });
    if (!answer.found || answer.cancelled) return null;
    return {
      bookingRef: String(answer.bookingRef),
      tickets: (answer.tickets as BookingAnswer['tickets']) ?? [],
    };
  }

  async release(holdRef: string) {
    await this.call('release', { holdRef });
  }

  async cancel(bookingRef: string) {
    await this.call('cancel', { bookingRef });
  }
}
