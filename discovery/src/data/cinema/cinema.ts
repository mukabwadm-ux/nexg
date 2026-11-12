/**
 * Cinemas: films, showings and seats (owner, 11 Nov 2026). Plain TypeScript with no React or browser APIs, so the
 * NexG app can reuse it as it is.
 *
 * A cinema's own ticketing system owns its seats. NexG reads films, showings and prices from that system through a
 * CinemaConnector, asks it for the seats free when a seat map opens, and (when the connector can) asks it to hold
 * and confirm seats. Seats shown are a snapshot; nothing here holds a seat. One film plays at many cinemas, so a
 * film has its own ID from the source and is never matched by title.
 */
import type { Merchant } from '../../providers/DiscoveryProvider';
import { subcategoryOf } from '../offeringKinds';

export type SeatType = 'standard' | 'vip' | 'wheelchair';
export const seatTypes: readonly SeatType[] = ['standard', 'vip', 'wheelchair'];
export const seatTypeLabel: Record<SeatType, string> = { standard: 'Standard', vip: 'VIP', wheelchair: 'Wheelchair space' };

export interface Seat { id: string; row: string; number: number; type: SeatType }
/** One row as it faces the screen, left to right. `null` is an aisle or a gap. */
export interface SeatRow { label: string; cells: (Seat | null)[] }
export interface SeatPlan { screenId: string; screenName: string; rows: SeatRow[] }

/** A short silent clip for the film page, with an optional poster frame and captions. */
export interface FilmPreview { video: string; poster?: string }
export interface Film {
  /** The source's film ID, shared by every cinema showing it. */
  id: string;
  title: string;
  /** Kenya Film Classification Board rating: GE, PG, 16, 18 or R. */
  classification?: string;
  languages: string[];
  runtimeMinutes?: number;
  genres: string[];
  /** yyyy-mm-dd. */
  releaseDate?: string;
  synopsis?: string;
  poster?: string;
  preview?: FilmPreview;
  /** A full trailer elsewhere (a link, never embedded autoplay). */
  trailerUrl?: string;
}
export interface Showing {
  id: string;
  filmId: string;
  /** The cinema, as a Discovery merchant ID. */
  merchantId: string;
  screenId: string;
  screenName: string;
  /** An exact instant (ISO 8601 with offset). Shown in Nairobi time. */
  startsAt: string;
  /** 2D, 3D, IMAX… */
  format: string;
  language?: string;
  /** Ticket price per seat type. A type without a price is shown without one. */
  prices: Partial<Record<SeatType, number>>;
  currency: string;
}
export interface Programme { films: Film[]; showings: Showing[]; observedAt: string }
export interface SeatSnapshot { showingId: string; plan: SeatPlan; taken: string[]; observedAt: string }
export interface ProgrammeQuery {
  /** One cinema's programme (cinema first)… */
  merchantId?: string;
  /** …or every cinema showing one film (film first). */
  filmId?: string;
  from: Date;
  days: number;
}

/** One cinema ticketing system (or the stand-in), behind one shape. */
export interface CinemaConnector {
  readonly id: string;
  /**
   * Whether this connector can ask the cinema's own system to hold and confirm seats. Until one can, a choice of
   * seats is a request kept on the device and the page says nothing has been sent.
   */
  readonly holds: boolean;
  getProgramme(query: ProgrammeQuery, signal?: AbortSignal): Promise<Programme>;
  getSeats(showing: Showing, signal?: AbortSignal): Promise<SeatSnapshot>;
}

/** Cinemas are their own subcategory in Experiences (its taxonomy entry waits for the owner's icon). */
const CINEMA_IDS = new Set(['experiences:cinemas', 'experiences_cinemas']);
export function isCinema(merchant: Pick<Merchant, 'subcategoryId'>): boolean {
  if (!merchant.subcategoryId) return false;
  return CINEMA_IDS.has(merchant.subcategoryId) || CINEMA_IDS.has(subcategoryOf(merchant)?.subcategory.id ?? '');
}

// ── Time: every showing is shown in Nairobi time (EAT, UTC+3, no daylight saving). ──

const NAIROBI = 'Africa/Nairobi';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: NAIROBI, year: 'numeric', month: '2-digit', day: '2-digit' });
const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: NAIROBI, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** The Nairobi calendar day (yyyy-mm-dd) of an instant. */
export const nairobiDay = (at: Date | string) => dayFormat.format(new Date(at));
export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
/** "19:30". */
export const showtimeClock = (at: string) => clockFormat.format(new Date(at));
/** Day tabs: "Today" / "Wed 12 Nov", "Tomorrow" / "Thu 13 Nov", then "Fri" / "14 Nov". */
export function dayTab(day: string, today: string): { label: string; detail: string } {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = weekdayFormat.format(date);
  const calendar = dateFormat.format(date);
  if (day === today) return { label: 'Today', detail: `${weekday} ${calendar}` };
  if (day === addDays(today, 1)) return { label: 'Tomorrow', detail: `${weekday} ${calendar}` };
  return { label: weekday, detail: calendar };
}
/** "Wed 12 Nov" for summaries. */
export const dayName = (day: string) => { const date = new Date(`${day}T12:00:00Z`); return `${weekdayFormat.format(date)} ${dateFormat.format(date)}`; };

/** Showings stop being offered this many minutes before they start. */
export const SALES_CLOSE_MINUTES = 10;
/** Showings still on sale at `now`, earliest first. */
export function onSale(showings: readonly Showing[], now: Date): Showing[] {
  const cutoff = now.getTime() + SALES_CLOSE_MINUTES * 60_000;
  return showings.filter((showing) => Date.parse(showing.startsAt) > cutoff).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
/** The days that have showings on sale, in order. */
export const showingDays = (showings: readonly Showing[]) => [...new Set(showings.map((showing) => nairobiDay(showing.startsAt)))].sort();

/** One cinema's day, film by film (cinema first). Films keep the order of their first showing. */
export function filmsOnDay(programme: Programme, day: string): { film: Film; showings: Showing[] }[] {
  const films = new Map(programme.films.map((film) => [film.id, film]));
  const groups = new Map<string, Showing[]>();
  for (const showing of programme.showings) {
    if (nairobiDay(showing.startsAt) !== day || !films.has(showing.filmId)) continue;
    groups.set(showing.filmId, [...(groups.get(showing.filmId) ?? []), showing]);
  }
  return [...groups].map(([id, showings]) => ({ film: films.get(id)!, showings }));
}
/** One film's day, cinema by cinema (film first). Cinemas keep the order of their first showing. */
export function cinemasOnDay(showings: readonly Showing[], day: string): { merchantId: string; showings: Showing[] }[] {
  const groups = new Map<string, Showing[]>();
  for (const showing of showings) {
    if (nairobiDay(showing.startsAt) !== day) continue;
    groups.set(showing.merchantId, [...(groups.get(showing.merchantId) ?? []), showing]);
  }
  return [...groups].map(([merchantId, list]) => ({ merchantId, showings: list }));
}

/** The lowest ticket price among these showings, if any has one. */
export function fromPrice(showings: readonly Showing[]): { amount: number; currency: string } | undefined {
  let best: { amount: number; currency: string } | undefined;
  for (const showing of showings) {
    for (const amount of Object.values(showing.prices)) {
      if (typeof amount === 'number' && Number.isFinite(amount) && (!best || amount < best.amount)) best = { amount, currency: showing.currency };
    }
  }
  return best;
}
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en-KE')}`;
  }
}
/** "2 h 05 min". */
export function runtimeLabel(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
}
/** The film's facts in District's order: rating, language, length (genres are shown on their own). Unknown facts are left out. */
export function filmFacts(film: Film): string[] {
  const language = film.languages[0] && (film.languages.length > 1 ? `${film.languages[0]} +${film.languages.length - 1} more` : film.languages[0]);
  return [film.classification, language, runtimeLabel(film.runtimeMinutes)].filter((fact): fact is string => Boolean(fact));
}
/** When a showing ends, from the film's running time; "about" because adverts and trailers vary. */
export function endsAround(showing: Showing, film?: Film): string | undefined {
  if (!film?.runtimeMinutes) return undefined;
  return showtimeClock(new Date(Date.parse(showing.startsAt) + film.runtimeMinutes * 60_000).toISOString());
}

// ── Seats ──

/** Most cinemas cap one booking at ten seats. */
export const MAX_SEATS = 10;
const typeByMark: Record<string, SeatType> = { s: 'standard', v: 'vip', w: 'wheelchair' };

/**
 * A seat plan from compact rows, as a stand-in or a simple source sends them: one string per row, left to right,
 * `s` standard, `v` VIP, `w` wheelchair space, `.` an aisle or gap. Seats are numbered from 1, left to right.
 */
export function seatRows(rows: readonly (readonly [label: string, pattern: string])[]): SeatRow[] {
  return rows.map(([label, pattern]) => {
    let number = 0;
    const cells = [...pattern].map((mark) => {
      const type = typeByMark[mark];
      if (!type) return null;
      number += 1;
      return { id: `${label}${number}`, row: label, number, type };
    });
    return { label, cells };
  });
}
export function seatIndex(plan: SeatPlan): Map<string, Seat> {
  const index = new Map<string, Seat>();
  for (const row of plan.rows) for (const seat of row.cells) if (seat) index.set(seat.id, seat);
  return index;
}

export interface SeatToggle { selected: string[]; refused?: 'taken' | 'limit' | 'unknown' }
/** Picks or drops one seat. Taken seats, unknown seats and an eleventh seat are refused with a reason. */
export function toggleSeat(selected: readonly string[], seatId: string, seats: ReadonlyMap<string, Seat>, taken: ReadonlySet<string>): SeatToggle {
  if (selected.includes(seatId)) return { selected: selected.filter((id) => id !== seatId) };
  if (!seats.has(seatId)) return { selected: [...selected], refused: 'unknown' };
  if (taken.has(seatId)) return { selected: [...selected], refused: 'taken' };
  if (selected.length >= MAX_SEATS) return { selected: [...selected], refused: 'limit' };
  return { selected: [...selected, seatId] };
}

/**
 * Free seats a choice would leave stranded: a single seat between the chosen seats and a taken seat, an aisle or the
 * row's end. Cinemas usually ask people not to leave one, so the page mentions it (it never blocks the choice).
 */
export function strandedSeats(plan: SeatPlan, taken: ReadonlySet<string>, selected: ReadonlySet<string>): string[] {
  const stranded: string[] = [];
  const blocked = (cell: Seat | null | undefined) => !cell || taken.has(cell.id) || selected.has(cell.id);
  for (const row of plan.rows) {
    row.cells.forEach((cell, index) => {
      if (!cell || blocked(cell) === true) return;
      const left = row.cells[index - 1];
      const right = row.cells[index + 1];
      if (blocked(left) && blocked(right) && ((left && selected.has(left.id)) || (right && selected.has(right.id)))) stranded.push(cell.id);
    });
  }
  return stranded;
}

export interface TicketLine { type: SeatType; seats: string[]; price?: number }
export interface TicketSummary { lines: TicketLine[]; total?: number; currency: string; unpriced: number }
/** The chosen seats by type, with each type's price and a total when every seat has a price. */
export function ticketSummary(showing: Showing, seats: ReadonlyMap<string, Seat>, selected: readonly string[]): TicketSummary {
  const lines: TicketLine[] = [];
  for (const type of seatTypes) {
    const chosen = selected.filter((id) => seats.get(id)?.type === type);
    if (chosen.length) lines.push({ type, seats: chosen, price: showing.prices[type] });
  }
  const unpriced = lines.filter((line) => line.price === undefined).reduce((sum, line) => sum + line.seats.length, 0);
  const total = unpriced ? undefined : lines.reduce((sum, line) => sum + (line.price ?? 0) * line.seats.length, 0);
  return { lines, total: lines.length ? total : undefined, currency: showing.currency, unpriced };
}
/** Seat IDs in reading order ("C7, C8, D2"). */
export const seatList = (ids: readonly string[]) => [...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(', ');
