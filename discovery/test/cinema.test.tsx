import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import data from '../demo-seed/cinema/stand-in-cinema.json';
import {
  MAX_SEATS, cinemasOnDay, dayTab, endsAround, filmFacts, filmsOnDay, fromPrice, isCinema, nairobiDay, onSale, seatIndex, seatRows, showingDays,
  strandedSeats, ticketSummary, toggleSeat, type SeatPlan, type Showing,
} from '../src/data/cinema/cinema';
import { standInConnector, standInProgramme, standInSeats, type StandInData } from '../src/data/cinema/standInCinema';
import { cinemaConnector } from '../src/data/cinema/connector';
import { forgetTicketRequest, keepTicketRequest, readTicketRequests, type RequestStorage, type TicketRequest } from '../src/data/cinema/ticketRequests';
import { SeatMap } from '../src/components/cinema/SeatMap';
import { CinemaStorefront } from '../src/components/cinema/CinemaStorefront';
import { parseRoute, routeUrl } from '../src/routing/discoveryRoute';

const standIn = data as unknown as StandInData;
// Thursday 12 November 2026, 09:00 in Nairobi.
const now = new Date('2026-11-12T06:00:00Z');
const plan: SeatPlan = { screenId: 'x:hall', screenName: 'Screen 9', rows: seatRows([['A', 'w..ss'], ['B', 'ss.vv']]) };
const showing = (extra: Partial<Showing> = {}): Showing => ({ id: 's1', filmId: 'f1', merchantId: 'm1', screenId: 'x:hall', screenName: 'Screen 9',
  startsAt: '2026-11-12T19:30:00+03:00', format: '2D', prices: { standard: 600, vip: 1000, wheelchair: 600 }, currency: 'KES', ...extra });

test('seat plans number seats left to right and keep aisles as gaps', () => {
  assert.deepEqual(plan.rows[0]!.cells.map((cell) => cell?.id ?? '.'), ['A1', '.', '.', 'A2', 'A3']);
  assert.equal(plan.rows[0]!.cells[0]!.type, 'wheelchair');
  assert.equal(plan.rows[1]!.cells[3]!.type, 'vip');
  assert.equal(seatIndex(plan).size, 7);
});

test('choosing seats refuses taken seats, unknown seats and an eleventh seat', () => {
  const seats = seatIndex({ screenId: 's', screenName: 'S', rows: seatRows([['A', 'ssssssssssss']]) });
  const taken = new Set(['A1']);
  assert.equal(toggleSeat([], 'A1', seats, taken).refused, 'taken');
  assert.equal(toggleSeat([], 'Z9', seats, taken).refused, 'unknown');
  const ten = Array.from({ length: MAX_SEATS }, (_, index) => `A${index + 2}`);
  assert.equal(toggleSeat(ten.slice(0, 9), 'A12', seats, taken).refused, undefined);
  assert.deepEqual(toggleSeat(['A2'], 'A2', seats, taken).selected, []);
  assert.equal(toggleSeat(ten.slice(0, 10), 'A12', seats, taken).refused, 'limit');
});

test('a single seat left between a choice and a taken seat or aisle is pointed out', () => {
  const row: SeatPlan = { screenId: 's', screenName: 'S', rows: seatRows([['C', 'sssss.ss']]) };
  assert.deepEqual(strandedSeats(row, new Set(['C1']), new Set(['C3'])), ['C2']);
  assert.deepEqual(strandedSeats(row, new Set(), new Set(['C1', 'C2'])), []);
  assert.deepEqual(strandedSeats(row, new Set(), new Set(['C4'])), ['C5']);
});

test('the summary prices each seat type and only totals when every seat has a price', () => {
  const seats = seatIndex(plan);
  const summary = ticketSummary(showing(), seats, ['B1', 'B3', 'B4']);
  assert.deepEqual(summary.lines.map((line) => [line.type, line.seats.length, line.price]), [['standard', 1, 600], ['vip', 2, 1000]]);
  assert.equal(summary.total, 2600);
  const partial = ticketSummary(showing({ prices: { standard: 600 } }), seats, ['B1', 'B3']);
  assert.equal(partial.total, undefined);
  assert.equal(partial.unpriced, 1);
});

test('times and days are Nairobi time, and showings close ten minutes before they start', () => {
  assert.equal(nairobiDay('2026-11-12T21:30:00Z'), '2026-11-13');
  assert.deepEqual(dayTab('2026-11-12', '2026-11-12'), { label: 'Today', detail: 'Thu 12 Nov' });
  assert.equal(dayTab('2026-11-13', '2026-11-12').label, 'Tomorrow');
  assert.deepEqual(dayTab('2026-11-14', '2026-11-12'), { label: 'Sat', detail: '14 Nov' });
  const soon = showing({ id: 'soon', startsAt: '2026-11-12T09:05:00+03:00' });
  const later = showing({ id: 'later', startsAt: '2026-11-12T09:15:00+03:00' });
  assert.deepEqual(onSale([later, soon], now).map((entry) => entry.id), ['later']);
  assert.equal(endsAround(showing(), { id: 'f1', title: 'F', languages: [], genres: [], runtimeMinutes: 118 }), '21:28');
});

test('one film plays at several cinemas and is grouped by its ID, never by title', () => {
  const programme = standInProgramme(standIn, { filmId: 'film-long-rains', from: now, days: 7 });
  const cinemas = new Set(programme.showings.map((entry) => entry.merchantId));
  assert.deepEqual([...cinemas].sort(), ['c1000000-0000-4000-8000-000000000751', 'c1000000-0000-4000-8000-000000000753', 'c1000000-0000-4000-8000-000000000755']);
  assert.deepEqual(programme.films.map((film) => film.id), ['film-long-rains']);
  const today = cinemasOnDay(programme.showings, '2026-11-12');
  assert.equal(today.length, 3);
  assert.equal(fromPrice(today.find((entry) => entry.merchantId.endsWith('755'))!.showings)?.amount, 500);
});

test('the stand-in follows weekdays, adds format surcharges and answers to a cinema’s demo code', () => {
  const thursday = standInProgramme(standIn, { merchantId: 'M0751', from: now, days: 1 });
  assert.ok(thursday.showings.every((entry) => entry.merchantId === 'M0751'));
  assert.ok(!thursday.showings.some((entry) => entry.filmId === 'film-lion-counted-stars'), 'the family film runs Friday to Sunday');
  const week = standInProgramme(standIn, { merchantId: 'M0751', from: now, days: 7 });
  assert.ok(week.showings.some((entry) => entry.filmId === 'film-lion-counted-stars'));
  assert.deepEqual(showingDays(week.showings).length, 7);
  const imax = standInProgramme(standIn, { merchantId: 'M0752', from: now, days: 1 }).showings.find((entry) => entry.format === 'IMAX')!;
  assert.deepEqual(imax.prices, { standard: 1250, vip: 1800, wheelchair: 1250 });
  const films = filmsOnDay(week, '2026-11-12');
  assert.equal(films[0]!.film.id, 'film-long-rains');
  assert.ok(films.every(({ showings }) => showings.every((entry) => nairobiDay(entry.startsAt) === '2026-11-12')));
});

test('taken seats are repeatable for a showing and never more than the hall', async () => {
  const one = standInProgramme(standIn, { merchantId: 'M0752', from: now, days: 1 }).showings[0]!;
  const first = standInSeats(standIn, one, now);
  assert.deepEqual(standInSeats(standIn, one, now).taken, first.taken);
  assert.ok(first.taken.length > 0 && first.taken.length < seatIndex(first.plan).size);
  const connector = standInConnector(async () => standIn, () => now);
  assert.equal(connector.holds, false, 'the stand-in can’t hold seats, so pages keep requests on the device');
  assert.deepEqual((await connector.getSeats(one)).taken, first.taken);
});

test('no cinema system is configured unless the build asks for the stand-in', () => {
  assert.equal(cinemaConnector(undefined), undefined);
  assert.equal(cinemaConnector('stand-in')?.id, 'stand-in');
});

test('ticket requests stay on the device, one per showing, and drop once the showing starts', () => {
  const kept = new Map<string, string>();
  const storage: RequestStorage = { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, value); } };
  const request = (extra: Partial<TicketRequest> = {}): TicketRequest => ({ showingId: 's1', merchantId: 'm1', filmId: 'f1', filmTitle: 'F', screenName: 'Screen 1',
    startsAt: '2026-11-12T19:30:00+03:00', format: '2D', seats: ['C7', 'C8'], total: 1300, currency: 'KES', savedAt: now.toISOString(), ...extra });
  keepTicketRequest(request(), now, storage);
  keepTicketRequest(request({ seats: ['D1'] }), now, storage);
  keepTicketRequest(request({ showingId: 's0', startsAt: '2026-11-12T08:00:00+03:00' }), new Date('2026-11-12T04:00:00Z'), storage);
  const list = readTicketRequests('m1', now, storage);
  assert.deepEqual(list.map((entry) => [entry.showingId, entry.seats.join()]), [['s1', 'D1']]);
  assert.deepEqual(forgetTicketRequest('m1', 's1', now, storage), []);
});

test('cinemas are recognised by their subcategory', () => {
  assert.equal(isCinema({ subcategoryId: 'experiences_cinemas' }), true);
  assert.equal(isCinema({ subcategoryId: 'experiences:cinemas' }), true);
  assert.equal(isCinema({ subcategoryId: 'experiences_concerts' }), false);
});

test('film facts follow District’s order and leave out what the source doesn’t send', () => {
  assert.deepEqual(filmFacts({ id: 'f', title: 'F', classification: 'PG', languages: ['English', 'Swahili'], runtimeMinutes: 118, genres: ['Drama'] }), ['PG', 'English +1 more', '1 h 58 min']);
  assert.deepEqual(filmFacts({ id: 'f', title: 'F', languages: [], genres: [] }), []);
});

test('the seat map labels every seat, prices each section and keys only the seat types the hall has', () => {
  const hall: SeatPlan = { screenId: 'x:hall', screenName: 'Screen 9', rows: seatRows([['A', 'w..ss'], ['B', 'ss.ss'], ['C', 'vv.vv']]) };
  const html = renderToStaticMarkup(<SeatMap plan={hall} showing={showing()} taken={new Set(['A2'])} selected={new Set(['B1'])} onToggle={() => {}} />);
  assert.match(html, /disabled="" aria-label="Row A, seat 2, Standard, taken"/);
  assert.match(html, /aria-pressed="true"[^>]*aria-label="Row B, seat 1, Standard, chosen"/);
  assert.match(html, /Standard · Ksh\s?600|Standard · KES\s?600/);
  assert.match(html, /VIP · (Ksh|KES)\s?1,000/);
  assert.match(html, /Wheelchair space/);
});

test('a cinema without a connected system says so instead of inventing showtimes', () => {
  const html = renderToStaticMarkup(<CinemaStorefront merchant={{ id: 'm1', name: 'Gold Cinema Co.', subcategoryId: 'experiences_cinemas', items: [] }} onBack={() => {}} onFilm={() => {}} connector={undefined} now={now} />);
  assert.match(html, /Showtimes aren’t on NexG yet/);
  assert.match(html, /Gold Cinema Co\. hasn’t connected its showtimes/);
});

test('a film has its own page address, and a store address drops it', () => {
  const route = parseRoute('?film=film-long-rains');
  assert.equal(route.film, 'film-long-rains');
  assert.equal(routeUrl(route), '/?film=film-long-rains');
  assert.equal(parseRoute('?merchant=m1&film=film-long-rains').film, undefined);
  assert.equal(routeUrl({ ...route, merchantId: 'm1' }), '/?merchant=m1');
});
