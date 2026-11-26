/** Adapter candidate: translate trusted cinema showing inventory into exclusive
 * Payload Reserve items, inside the existing BookingEngine transaction only.
 * This is not a second reservation store and writes nothing by itself.
 */
export type SeatType = 'standard' | 'vip' | 'wheelchair';
type Showing = {
  id: string; merchantId: string; screenId: string; filmId: string; occurrenceId: string;
  startsAt: string; endsAt: string; status: string;
  pricesMinor: Partial<Record<SeatType, number>>;
  seats: readonly { code: string; type: SeatType; resourceId: string }[];
};
type Intent = { showingId: string; seatIds: readonly string[]; requestId: string; expectedTotalMinor: number };
type Scope = { merchantId: string; screenId: string; occurrenceId: string };
type Reason = 'invalid_intent' | 'wrong_showing' | 'not_on_sale' | 'invalid_inventory' | 'unknown_seat' | 'price_changed';
const fail = (reason: Reason) => ({ ok: false as const, reason });
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const code = (s: string) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= 12;
const instant = (s: string) => /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? Date.parse(s) : NaN;
const validTypes = new Set<SeatType>(['standard','vip','wheelchair']);

export function toMovieReservationItems(show: Showing, intent: Intent, scope: Scope, now: number) {
  if (!uuid.test(intent.showingId) || !uuid.test(intent.requestId) || !Array.isArray(intent.seatIds)
    || intent.seatIds.length < 1 || intent.seatIds.length > 10 || !intent.seatIds.every(code)
    || new Set(intent.seatIds).size !== intent.seatIds.length
    || !Number.isSafeInteger(intent.expectedTotalMinor) || intent.expectedTotalMinor <= 0) return fail('invalid_intent');
  if (show.id !== intent.showingId || show.merchantId !== scope.merchantId || show.screenId !== scope.screenId
    || show.occurrenceId !== scope.occurrenceId) return fail('wrong_showing');
  const start = instant(show.startsAt), end = instant(show.endsAt);
  if (![show.merchantId, show.screenId, show.filmId, show.occurrenceId].every(s=>uuid.test(s))
    || !Number.isFinite(start) || !Number.isFinite(end) || end<=start || !Number.isFinite(now)
    || !Array.isArray(show.seats) || show.seats.length > 5000) return fail('invalid_inventory');
  const cutoff = start - 600_000;
  if (show.status !== 'on_sale' || now >= cutoff) return fail('not_on_sale');
  const seats = new Map<string, Showing['seats'][number]>(), resources = new Set<string>();
  for (const row of show.seats) {
    if (!code(row.code) || !uuid.test(row.resourceId) || !validTypes.has(row.type)
      || seats.has(row.code) || resources.has(row.resourceId)) return fail('invalid_inventory');
    seats.set(row.code,row); resources.add(row.resourceId);
  }
  const codes = [...intent.seatIds].sort();
  const items: { resourceId:string; seatId:string; quantity:1 }[] = [];
  let total = 0;
  for (const seatId of codes) {
    const row = seats.get(seatId);
    if (!row) return fail('unknown_seat');
    const price = show.pricesMinor[row.type];
    if (price === undefined || !Number.isSafeInteger(price) || price <= 0) return fail('invalid_inventory');
    total += price;
    if (!Number.isSafeInteger(total)) return fail('invalid_inventory');
    items.push({ resourceId:row.resourceId, seatId, quantity:1 });
  }
  if (total !== intent.expectedTotalMinor) return fail('price_changed');
  return {
    ok:true as const, showingId:show.id, screenId:show.screenId, occurrenceId:show.occurrenceId,
    items, totalMinor:total, currency:'KES' as const, startsAt:new Date(start).toISOString(), endsAt:new Date(end).toISOString(),
    expiresAt:new Date(Math.min(cutoff, now + 300_000)).toISOString(),
    idempotencyPayload:[intent.showingId, codes, intent.expectedTotalMinor] as const,
  };
}
