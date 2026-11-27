// Sets up each review merchant's bookings in the booking engine, through the
// same signed bridge the merchant portal uses. Idempotent: resources and
// offerings are matched by name and reused; dated sessions are added only for
// start times that do not exist yet.
//
// Needs BOOKING_ENGINE_URL and BOOKING_BRIDGE_SECRET in the environment. The
// secret is only used to sign requests; it is never printed.

import { createHmac, randomUUID } from 'node:crypto';

const NAIROBI = '+03:00';
const DAYS_AHEAD = 45;
const WEEK = [0, 1, 2, 3, 4, 5, 6];
const OPEN_ALL_DAY = { days: WEEK, start: '00:00', end: '23:59' };

export function bridge(service, secret, businessId) {
  // The engine allows 120 requests a minute per business; wait and retry when it says so.
  return async function call(path, body, method = body === undefined ? 'GET' : 'POST', attempt = 0) {
    const claims = Buffer.from(
      JSON.stringify({ businessId, userId: 'review-seed', role: 'owner', branches: null, expiresAt: Date.now() + 60_000 }),
    ).toString('base64url');
    const response = await fetch(new URL(`/v1/${path}`, service), {
      method,
      headers: {
        'x-nexg-booking-context': claims,
        'x-nexg-booking-signature': createHmac('sha256', secret).update(claims).digest('hex'),
        'idempotency-key': randomUUID(),
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const value = text ? JSON.parse(text) : null;
    if (response.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, 61_000));
      return call(path, body, method, attempt + 1);
    }
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${value?.detail ?? value?.message ?? text}`);
    return value;
  };
}

const policy = {
  intakeMode: 'instant_after_requirements',
  active: true,
  bookingEnabled: true,
  leadTimeMinutes: 0,
  horizonDays: 365,
  paymentPolicyId: 'NO_PREPAYMENT_V1',
  changePolicyId: 'CHANGE_BEFORE_START_V1',
  policyVersion: 1,
  currency: 'KES',
};

/** The offering body for one item, given the ids of the resources it uses. */
function offeringBody(item, e, resourceIds, extra) {
  const base = { ...policy, name: item.name, description: item.desc, model: e.model, resourceIds, priceMinor: e.priceMinor };
  switch (e.model) {
    case 'APPOINTMENT':
      return { ...base, durationMinutes: e.durationMinutes, ...(e.choose ? { resourceSelectionMode: 'choose_one' } : {}) };
    case 'SPACE_RESERVATION':
      return { ...base, durationMinutes: e.durationMinutes, capacity: e.capacity };
    case 'SESSION_CAPACITY':
      return { ...base, durationMinutes: e.durationMinutes, capacity: e.capacity, capacityUnit: 'place', quantityScale: 0, ticketTypes: e.ticketTypes };
    case 'REQUEST_QUOTE':
      return { ...base, intakeMode: 'request_quote', pricingBasis: 'indicative', quoteRange: e.quoteRange };
    case 'TRANSFER':
      return { ...base, durationMinutes: e.durationMinutes, capacity: e.passengers, withDriver: true, transportIncluded: true, travelMinutes: 15 };
    case 'ASSET_INTERVAL':
      return { ...base, durationMinutes: 1440, pricingBasis: 'per_duration', durationUnitMinutes: 1440, minimumBillableUnits: 1,
        minDurationMinutes: 1440, maxDurationMinutes: 1440 * 30, rentalTerms: e.rentalTerms };
    case 'FIELD_VISIT':
      return { ...base, durationMinutes: e.durationMinutes, serviceArea: { areas: e.areas }, travelMinutes: 30 };
    case 'TOUR':
      return { ...base, durationMinutes: e.durationMinutes, capacity: e.capacity, capacityUnit: 'place', quantityScale: 0, specialistSetup: {
        model: 'TOUR', version: 1, supplierComponents: [], mode: 'shared', itinerary: e.itinerary, itineraryVersion: 1,
        resourceIds: resourceIds.slice(0, -1), poolResourceId: resourceIds.at(-1), minimumParticipants: 1, maximumParticipants: e.capacity } };
    case 'LINKED_WINDOWS':
      return { ...base, pricingBasis: 'per_quantity', capacityUnit: 'kg', quantityScale: 0, specialistSetup: {
        model: 'LINKED_WINDOWS', version: 1, supplierComponents: [], promiseMode: 'FIRM_PRE_ACCEPTED',
        incomingMethod: 'CUSTOMER_DROPOFF', outgoingMethod: 'CUSTOMER_COLLECTION', incomingResourceIds: [],
        outgoingResourceIds: [], processingResourceId: resourceIds[0], processingUnit: 'kg', quantityScale: 0,
        minimumProcessingMinutes: 120, maximumProcessingMinutes: 1440, calendarBasis: 'elapsed', workingDays: WEEK,
        opens: '00:00', closes: '23:59' } };
    case 'SERVICE_JOB':
      return { ...base, durationMinutes: e.durationMinutes, specialistSetup: {
        model: 'SERVICE_JOB', version: 1, supplierComponents: [], jobSchedulingMode: 'scheduled_work',
        assessmentMode: 'fixed_scope', resourceIds, durationMinutes: e.durationMinutes, partsRequired: false,
        partsEvidenceKind: 'authorized_manual_reference', custodyMode: 'customer_retains', custodyResourceIds: [],
        custodyDurationMinutes: 1440 } };
    case 'ENTITLEMENT':
      return { ...base, intakeMode: 'plan_enrolment', specialistSetup: {
        model: 'ENTITLEMENT', version: 1, supplierComponents: [], planId: extra.planId, planVersion: 1,
        scopeOfferingIds: [extra.childId], validity: { mode: 'relative_to_activation', duration: { value: e.validityDays, unit: 'day' } },
        credits: [{ id: 'visits', quantityMinor: e.credits, unit: 'visit', scale: 0, offeringIds: [extra.childId] }],
        creditCancellation: 'restore_before_start', renewal: 'none' } };
    default:
      throw new Error(`No offering builder for ${e.model}`);
  }
}

/** Dated start times (Nairobi) for sessions and shared tour departures. */
function startTimes(e) {
  const out = [];
  const today = new Date(Date.now() + 3 * 3600_000); // Nairobi wall clock
  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d));
    const date = day.toISOString().slice(0, 10);
    const weekday = (day.getUTCDay() + 6) % 7; // 0 = Monday
    let times = [];
    if (e.daily) times = [e.daily];
    if (e.departures) times = e.departures;
    if (e.weekly && e.weekly.includes(weekday)) times = [e.time];
    if (e.hourly) {
      const [from, to] = e.hourly.map((t) => Number(t.slice(0, 2)));
      for (let h = from; h <= to; h++) times.push(`${String(h).padStart(2, '0')}:00`);
    }
    for (const t of times) {
      const start = new Date(`${date}T${t}:00${NAIROBI}`);
      if (start.getTime() > Date.now() + 3600_000) out.push(start);
    }
  }
  return out;
}

const iso = (d) => d.toISOString().replace('.000Z', 'Z');

/**
 * Sets up one shop. `items` are its bookable items ({ name, desc, kind, engine, id }).
 * Returns [{ id, kind, offeringId }] for linkSql.
 */
export async function setUpShop(call, shop, items, log = () => {}) {
  await call('configuration', { subcategoryId: shop.engineProfile, businessName: shop.name, published: true }, 'PUT');
  let ws = await call('workspace');
  const resources = new Map(ws.resources.map((r) => [r.name, r]));
  const offerings = new Map(ws.offerings.map((o) => [o.name, o]));

  async function resource(name, kind, quantity, extra = {}) {
    if (resources.has(name)) return resources.get(name).id;
    const body = { name, kind, quantity, schedule: OPEN_ALL_DAY, ...extra };
    if (kind === 'space' && quantity > 1) Object.assign(body, { quantity: 1, partyCapacity: quantity });
    if (kind === 'vehicle' && quantity > 1) Object.assign(body, { quantity: 1, partyCapacity: quantity });
    const made = await call('resources', body);
    resources.set(name, made);
    log(`  resource ${name}`);
    return made.id;
  }
  async function offering(item, e, resourceIds, extra = {}) {
    const body = offeringBody(item, e, resourceIds, extra);
    // An offering that exists is kept as it is: the engine refuses to rewrite an offering's
    // duration, model or resources, and the owner's portal edits must win over a re-run.
    if (offerings.has(item.name)) return offerings.get(item.name);
    const made = await call('offerings', body);
    offerings.set(item.name, made);
    log(`  offering ${item.name} (${made.executionMode ?? e.model})`);
    return made;
  }

  const links = [];
  for (const item of items) {
    const e = item.engine;
    let ids = [];
    if (e.resources) for (const [name, kind, qty] of e.resources) ids.push(await resource(name, kind, qty));
    if (e.model === 'LINKED_WINDOWS') ids = [await resource('Laundry workload', 'capacity_pool', e.capacityKg, { capacityUnit: 'kg', quantityScale: 0, capacityMode: 'per-guest' })];
    if (e.model === 'SESSION_CAPACITY' || e.model === 'TOUR') {
      const pool = `${item.name} places`;
      if (e.model === 'TOUR') ids.push(await resource(`${item.name} guide`, 'staff', 1));
      ids = [...ids, await resource(pool, 'capacity_pool', e.capacity, { capacityUnit: 'place', quantityScale: 0, capacityMode: 'per-guest' })];
    }
    let extra = {};
    if (e.model === 'ENTITLEMENT') {
      const child = e.childItem
        ? offerings.get(e.childItem)
        : await offering({ name: e.child.name, desc: e.child.name }, { model: 'APPOINTMENT', durationMinutes: e.child.durationMinutes, priceMinor: 0 },
            await Promise.all(e.child.resources.map(([n, k, qn]) => resource(n, k, qn))));
      if (!child) throw new Error(`${item.name}: covered offering not found`);
      extra = { childId: child.id, planId: `PLAN-${shop.slug}-${item.n}` };
    }
    const made = await offering(item, e, ids, extra);
    if (e.daily || e.departures || e.weekly || e.hourly) {
      const existing = new Set((ws.occurrences ?? []).filter((o) => o.offeringId === made.id).map((o) => new Date(o.startTime).getTime()));
      let added = 0;
      let version = made.version ?? 1;
      for (const start of startTimes(e)) {
        if (existing.has(start.getTime())) continue;
        const end = new Date(start.getTime() + e.durationMinutes * 60_000);
        const row = await call(`offerings/${made.id}/occurrences`, { expectedVersion: version, startTime: iso(start), endTime: iso(end), capacity: e.capacity, published: true });
        version = row.offeringVersion ?? version + 1;
        added++;
      }
      if (added) log(`  ${added} dated sessions for ${item.name}`);
    }
    links.push({ id: item.id, kind: item.kind, offeringId: made.id });
  }
  return links;
}
