/**
 * One interface for every cinema ticketing system (owner, 23 Nov 2026: "we
 * send requests and book on their system").
 *
 * The cinema's own system is the truth for its programme, seats and bookings.
 * NexG asks it for the programme in the background, for live seats while the
 * customer waits, and holds, confirms, releases and cancels on it. Each call
 * carries NexG's request id, so a retry never books twice, and each answer
 * keeps the system's own references. A real cinema is one class implementing
 * this; nothing that calls it changes (design: cinema-api-design-2026-11-23.md).
 */

export type SeatType = 'standard' | 'vip' | 'wheelchair';

export interface ProgrammeFilm {
  ref: string;
  title: string;
  classification?: string;
  runtimeMinutes?: number;
  releaseDate?: string;
  languages?: string[];
  genres?: string[];
  synopsis?: string;
  poster?: string;
  trailerUrl?: string;
  /** Standard ids that link one film across cinemas (imdb, eidr, …). */
  externalIds?: Record<string, string>;
}

export interface ProgrammeScreen {
  ref: string;
  name: string;
  layoutVersion?: string;
  rows: {
    label: string;
    position: number;
    seats: { code: string; column: number; number: number; type: SeatType }[];
  }[];
}

export interface ProgrammeShowing {
  ref: string;
  filmRef: string;
  screenRef: string;
  startsAt: string;
  endsAt: string;
  format?: string;
  language?: string;
  status: 'on_sale' | 'closed' | 'cancelled';
  prices: { standardMinor?: number; vipMinor?: number; wheelchairMinor?: number };
}

/** The shape public.cinema_sync_apply takes. */
export interface Programme {
  window: { from: string; to: string };
  films: ProgrammeFilm[];
  screens: ProgrammeScreen[];
  showings: ProgrammeShowing[];
}

export interface SeatAnswer {
  showingRef: string;
  observedAt: string;
  taken: string[];
}

export interface HoldAnswer {
  holdRef: string;
  expiresAt: string;
  totalMinor: number;
  lines: { seat: string; type: SeatType; priceMinor: number }[];
}

/**
 * What kind of code a ticket's barcode is, as the cinema's door scanner reads
 * it. 'other' is a kind NexG cannot draw: the app then shows the ticket
 * reference rather than a picture the scanner would not read. No format at
 * all means QR (the app's default).
 */
export type BarcodeFormat = 'qr' | 'code128' | 'pdf417' | 'aztec' | 'other';

export interface Ticket {
  seat: string;
  ticketRef: string;
  barcode?: string;
  barcodeFormat?: BarcodeFormat;
}

export interface BookingAnswer {
  bookingRef: string;
  tickets: Ticket[];
}

const FORMATS: Record<string, Exclude<BarcodeFormat, 'other'>> = {
  qr: 'qr',
  qrcode: 'qr',
  code128: 'code128',
  pdf417: 'pdf417',
  aztec: 'aztec',
  aztecode: 'aztec',
  azteccode: 'aztec',
};

/** A system's own name for a barcode kind, as NexG's ("QR_CODE", "Code-128", …). Never a guess. */
export function barcodeFormat(raw: unknown): BarcodeFormat | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return FORMATS[raw.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? 'other';
}

/**
 * Tickets as NexG records them: seat, reference, the barcode value, and its
 * format beside it when the system said one. Every adapter's answer passes
 * through this before it is recorded.
 */
export function normaliseTickets(raw: unknown): Ticket[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const t = item as Record<string, unknown>;
    if (typeof t.seat !== 'string' || typeof t.ticketRef !== 'string') return [];
    const ticket: Ticket = { seat: t.seat, ticketRef: t.ticketRef };
    if (typeof t.barcode === 'string' && t.barcode !== '') {
      ticket.barcode = t.barcode;
      const format = barcodeFormat(t.barcodeFormat);
      if (format) ticket.barcodeFormat = format;
    }
    return [ticket];
  });
}

export interface Capabilities {
  extend: boolean;
  cancel: boolean;
  maxSeats: number;
  /** The longest a hold may be extended to, from when it was made. */
  maxHoldSeconds: number;
}

export type CinemaErrorCode =
  | 'unavailable' // the system did not answer in time, or is down
  | 'seat_taken' // a seat is no longer free (seats says which)
  | 'showing_closed' // no longer on sale
  | 'hold_expired' // the hold is gone
  | 'seat_lost' // the cinema refused the booking for good
  | 'cancel_window_closed' // too close to the start to cancel
  | 'invalid'; // the request itself is wrong

export class CinemaError extends Error {
  constructor(
    readonly code: CinemaErrorCode,
    message: string,
    readonly options: { seats?: string[]; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'CinemaError';
  }
  get retryable() {
    return this.options.retryable ?? this.code === 'unavailable';
  }
}

export interface CinemaConnector {
  readonly adapterId: string;
  readonly capabilities: Capabilities;
  programme(window: { from: Date; days: number }): Promise<Programme>;
  seatMap(showingRef: string): Promise<SeatAnswer>;
  hold(input: {
    showingRef: string;
    seats: string[];
    requestId: string;
    ttlSeconds: number;
  }): Promise<HoldAnswer>;
  extend(holdRef: string, until: Date): Promise<{ expiresAt: string }>;
  confirm(input: {
    holdRef: string;
    requestId: string;
    paymentRef: string;
  }): Promise<BookingAnswer>;
  /** After a timeout nobody can read: did that request book? */
  lookup(requestId: string): Promise<BookingAnswer | null>;
  release(holdRef: string): Promise<void>;
  cancel(bookingRef: string): Promise<void>;
}

/** Calls the customer waits on stop after this long, and say so plainly. */
export const LIVE_TIMEOUT_MS = 8000;

export async function withTimeout<T>(work: Promise<T>, ms = LIVE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new CinemaError('unavailable', "The cinema's booking system did not answer in time."),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
