/**
 * Ticket requests kept on this device. Until a cinema's own system can hold and confirm seats through NexG, a choice
 * of seats is saved here and the page says it hasn't been sent. Plain TypeScript: the app swaps the storage.
 */
import { MAX_SEATS } from './cinema';

export interface TicketRequest {
  showingId: string;
  merchantId: string;
  filmId: string;
  filmTitle: string;
  screenName: string;
  startsAt: string;
  format: string;
  seats: string[];
  /** Absent when a chosen seat has no price. */
  total?: number;
  currency: string;
  savedAt: string;
}

const KEY = 'nexg.discovery.cinema.v1';
const MAX_PER_CINEMA = 10;
const MAX_CINEMAS = 20;

/** The smallest storage a request needs: localStorage on the web, an adapter in the app. */
export interface RequestStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

function webStorage(): RequestStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

type Root = Record<string, { requests: TicketRequest[]; updatedAt: string }>;
function readRoot(storage: RequestStorage | undefined): Root {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Root : {};
  } catch {
    return {};
  }
}

const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
function clean(value: unknown, now: Date): TicketRequest | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;
  const seats = Array.isArray(entry.seats) ? [...new Set(entry.seats.filter((seat): seat is string => text(seat, 12)))].slice(0, MAX_SEATS) : [];
  if (!text(entry.showingId) || !text(entry.merchantId) || !text(entry.filmId) || !text(entry.filmTitle) || !text(entry.startsAt, 40) || !seats.length) return undefined;
  // A showing that has started is no longer a request.
  const starts = Date.parse(entry.startsAt);
  if (!Number.isFinite(starts) || starts <= now.getTime()) return undefined;
  return {
    showingId: entry.showingId, merchantId: entry.merchantId, filmId: entry.filmId, filmTitle: entry.filmTitle, startsAt: entry.startsAt, seats,
    screenName: text(entry.screenName) ? entry.screenName : '', format: text(entry.format, 20) ? entry.format : '',
    total: typeof entry.total === 'number' && Number.isFinite(entry.total) && entry.total >= 0 ? entry.total : undefined,
    currency: text(entry.currency, 3) ? entry.currency : 'KES', savedAt: text(entry.savedAt, 40) ? entry.savedAt : '',
  };
}

/** One cinema's requests still ahead, soonest first. Read defensively: storage can be empty, blocked or edited. */
export function readTicketRequests(merchantId: string, now = new Date(), storage = webStorage()): TicketRequest[] {
  const kept = readRoot(storage)[merchantId]?.requests;
  if (!Array.isArray(kept)) return [];
  return kept.map((entry) => clean(entry, now)).filter((entry): entry is TicketRequest => Boolean(entry) && entry!.merchantId === merchantId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function write(merchantId: string, requests: TicketRequest[], storage: RequestStorage | undefined) {
  if (!storage) return;
  try {
    const root = readRoot(storage);
    if (requests.length) root[merchantId] = { requests: requests.slice(0, MAX_PER_CINEMA), updatedAt: new Date().toISOString() };
    else delete root[merchantId];
    const recent = Object.entries(root).sort(([, a], [, b]) => String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? ''))).slice(0, MAX_CINEMAS);
    storage.setItem(KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    // Private windows and full storage: the page keeps working for this visit.
  }
}

/** Keeps a request, replacing any earlier one for the same showing. Returns the cinema's requests. */
export function keepTicketRequest(request: TicketRequest, now = new Date(), storage = webStorage()): TicketRequest[] {
  const next = [...readTicketRequests(request.merchantId, now, storage).filter((entry) => entry.showingId !== request.showingId), request]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  write(request.merchantId, next, storage);
  return next;
}
export function forgetTicketRequest(merchantId: string, showingId: string, now = new Date(), storage = webStorage()): TicketRequest[] {
  const next = readTicketRequests(merchantId, now, storage).filter((entry) => entry.showingId !== showingId);
  write(merchantId, next, storage);
  return next;
}
