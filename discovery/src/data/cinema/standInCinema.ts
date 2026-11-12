/**
 * The stand-in cinema system: it answers like a cinema's ticketing system would, from demo-seed/cinema/
 * stand-in-cinema.json, for the five local demo cinemas only. It expands a weekly programme into dated showings in
 * Nairobi time and gives each showing a repeatable set of taken seats. It cannot hold seats, so the pages keep
 * requests on the device. The real connector (Derrick NexG's cinema API) replaces it without changing the pages.
 */
import { addDays, nairobiDay, seatRows, type CinemaConnector, type Film, type Programme, type ProgrammeQuery, type SeatPlan, type SeatSnapshot, type SeatType, type Showing } from './cinema';

export interface StandInSession { film: string; screen: string; format: string; times: string[]; language?: string;
  /** Weekdays it runs, 0 = Sunday. Every day when absent. */
  days?: number[] }
export interface StandInCinema { code: string; merchantId: string; prices: Partial<Record<SeatType, number>>; sessions: StandInSession[] }
export interface StandInData {
  currency: string;
  formatSurcharge: Record<string, number>;
  films: Film[];
  screens: { id: string; name: string; rows: [string, string][] }[];
  cinemas: StandInCinema[];
}

const screenKey = (code: string, screen: string) => `${code}:${screen}`;
function planFor(data: StandInData, screenId: string): SeatPlan | undefined {
  const template = data.screens.find((screen) => screen.id === screenId.split(':')[1]);
  return template && { screenId, screenName: template.name, rows: seatRows(template.rows) };
}

/** Dated showings for the query, in Nairobi time. A cinema is matched by its Supabase ID or its demo code. */
export function standInProgramme(data: StandInData, query: ProgrammeQuery): Programme {
  const today = nairobiDay(query.from);
  const showings: Showing[] = [];
  for (const cinema of data.cinemas) {
    if (query.merchantId && query.merchantId !== cinema.merchantId && query.merchantId !== cinema.code) continue;
    const merchantId = query.merchantId ?? cinema.merchantId;
    for (let offset = 0; offset < query.days; offset += 1) {
      const day = addDays(today, offset);
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      for (const session of cinema.sessions) {
        if (query.filmId && session.film !== query.filmId) continue;
        if (session.days && !session.days.includes(weekday)) continue;
        const template = data.screens.find((screen) => screen.id === session.screen);
        if (!template) continue;
        const surcharge = data.formatSurcharge[session.format] ?? 0;
        const prices = Object.fromEntries(Object.entries(cinema.prices).map(([type, amount]) => [type, amount + surcharge])) as Partial<Record<SeatType, number>>;
        for (const time of session.times) {
          showings.push({
            id: `${cinema.code}.${session.screen}.${day}.${time.replace(':', '')}`, filmId: session.film, merchantId,
            screenId: screenKey(cinema.code, session.screen), screenName: template.name, startsAt: `${day}T${time}:00+03:00`,
            format: session.format, language: session.language, prices, currency: data.currency,
          });
        }
      }
    }
  }
  showings.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const shown = new Set(showings.map((showing) => showing.filmId));
  return { films: data.films.filter((film) => shown.has(film.id)), showings, observedAt: query.from.toISOString() };
}

/** A small repeatable random sequence, so a showing's taken seats stay the same on every visit. */
function sequence(seed: string) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => { state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0; state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0; return ((state ^= state >>> 16) >>> 0) / 4294967296; };
}

/** Taken seats: busier in the evening and at weekends, quieter further ahead, in groups of one to four. */
export function standInSeats(data: StandInData, showing: Showing, now = new Date()): SeatSnapshot {
  const plan = planFor(data, showing.screenId);
  if (!plan) throw new Error(`Unknown screen ${showing.screenId}`);
  const start = new Date(showing.startsAt);
  const hour = Number(showing.startsAt.slice(11, 13));
  const weekday = new Date(`${nairobiDay(start)}T12:00:00Z`).getUTCDay();
  const daysAhead = Math.max(0, Math.round((start.getTime() - now.getTime()) / 86_400_000));
  const busy = (hour >= 20 ? 0.4 : hour >= 17 ? 0.5 : 0.22) + (weekday === 5 || weekday === 6 ? 0.15 : 0);
  const ratio = Math.max(0.05, busy * (1 - Math.min(daysAhead, 6) * 0.12));
  const random = sequence(showing.id);
  const taken: string[] = [];
  for (const row of plan.rows) {
    let group = 0;
    for (const seat of row.cells) {
      if (!seat) { group = 0; continue; }
      if (group > 0 || random() < ratio / 2.2) {
        taken.push(seat.id);
        group = group > 0 ? group - 1 : Math.floor(random() * 4);
      }
    }
  }
  return { showingId: showing.id, plan, taken, observedAt: now.toISOString() };
}

export function standInConnector(load: () => Promise<StandInData>, clock: () => Date = () => new Date()): CinemaConnector {
  let data: Promise<StandInData> | undefined;
  const read = () => (data ??= load().catch((error: unknown) => { data = undefined; throw error; }));
  return {
    id: 'stand-in',
    holds: false,
    async getProgramme(query, signal) {
      const source = await read();
      signal?.throwIfAborted();
      return standInProgramme(source, query);
    },
    async getSeats(showing, signal) {
      const source = await read();
      signal?.throwIfAborted();
      return standInSeats(source, showing, clock());
    },
  };
}
