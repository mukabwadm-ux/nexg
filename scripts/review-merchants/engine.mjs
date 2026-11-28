// Sets up each review merchant's bookings in the booking engine, through the
// same signed bridge the merchant portal uses.
//
// Re-runs are safe:
// - resources are matched by name and given the shop's hours;
// - an offering that exists is kept (the owner's portal edits win), unless its
//   setup in shops.mjs changed in a way the engine only accepts as a revised
//   offering; then the old one is switched off and a revised one made;
// - a hidden item's offering is switched off;
// - dated sessions are added only for start times that do not exist yet.
//
// Needs BOOKING_ENGINE_URL and BOOKING_BRIDGE_SECRET in the environment. The
// secret is only used to sign requests; it is never printed.

import { createHmac, randomUUID } from 'node:crypto';

const NAIROBI = '+03:00';
const DAYS_AHEAD = 45;
const WEEK = [0, 1, 2, 3, 4, 5, 6];
/** Minutes a table or court is kept free between bookings (BQ_SPACE_POLICY). */
const TURNOVER_MINUTES = 15;

/** Opening hours for a shop's bookable resources (Nairobi time): `hours` in shops.mjs. */
const scheduleOf = (shop) => ({
  days: WEEK,
  start: shop.hours?.[0] ?? '08:00',
  end: shop.hours?.[1] ?? '20:00',
});

export function bridge(service, secret, businessId) {
  // The engine allows 120 requests a minute per business; wait and retry when it says so.
  return async function call(
    path,
    body,
    method = body === undefined ? 'GET' : 'POST',
    attempt = 0,
  ) {
    const claims = Buffer.from(
      JSON.stringify({
        businessId,
        userId: 'review-seed',
        role: 'owner',
        branches: null,
        expiresAt: Date.now() + 60_000,
      }),
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
    if (!response.ok)
      throw new Error(
        `${method} ${path}: ${response.status} ${value?.detail ?? value?.message ?? text}`,
      );
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
function offeringBody(shop, item, e, resourceIds, extra) {
  const base = {
    ...policy,
    name: item.name,
    description: item.desc,
    model: e.model,
    resourceIds,
    priceMinor: e.priceMinor,
  };
  switch (e.model) {
    case 'APPOINTMENT':
      return {
        ...base,
        durationMinutes: e.durationMinutes,
        ...(e.choose ? { resourceSelectionMode: 'choose_one' } : {}),
      };
    case 'SPACE_RESERVATION':
      // With more than one table or court, the customer picks one.
      return {
        ...base,
        durationMinutes: e.durationMinutes,
        capacity: e.capacity,
        bufferAfterMinutes: TURNOVER_MINUTES,
        ...(resourceIds.length > 1 ? { resourceSelectionMode: 'choose_one' } : {}),
      };
    case 'SESSION_CAPACITY':
      return {
        ...base,
        durationMinutes: e.durationMinutes,
        capacity: e.capacity,
        capacityUnit: 'place',
        quantityScale: 0,
        ticketTypes: e.ticketTypes,
      };
    case 'REQUEST_QUOTE':
      return {
        ...base,
        intakeMode: 'request_quote',
        pricingBasis: 'indicative',
        quoteRange: e.quoteRange,
      };
    case 'TRANSFER':
      return {
        ...base,
        durationMinutes: e.durationMinutes,
        capacity: e.passengers,
        // A greeter meets the guest: no vehicle is part of that booking.
        withDriver: !e.greeter,
        transportIncluded: !e.greeter,
        travelMinutes: 15,
        serviceArea: {
          areas: e.areas ?? ['JKIA', 'Westlands', 'Kilimani', 'Lavington', 'CBD', 'Karen'],
        },
      };
    case 'ASSET_INTERVAL':
      return {
        ...base,
        durationMinutes: 1440,
        pricingBasis: 'per_duration',
        durationUnitMinutes: 1440,
        minimumBillableUnits: 1,
        minDurationMinutes: 1440,
        maxDurationMinutes: 1440 * 30,
        rentalTerms: e.rentalTerms,
      };
    case 'FIELD_VISIT':
      return {
        ...base,
        durationMinutes: e.durationMinutes,
        serviceArea: { areas: e.areas },
        travelMinutes: 30,
      };
    case 'TOUR':
      return {
        ...base,
        // Priced per traveller, as the store lists it (price_per 'person').
        pricingBasis: 'per_quantity',
        durationMinutes: e.durationMinutes,
        capacity: e.capacity,
        capacityUnit: 'place',
        quantityScale: 0,
        specialistSetup: {
          model: 'TOUR',
          version: 1,
          supplierComponents: [],
          mode: 'shared',
          itinerary: e.itinerary,
          itineraryVersion: 1,
          resourceIds: resourceIds.slice(0, -1),
          poolResourceId: resourceIds.at(-1),
          minimumParticipants: 1,
          maximumParticipants: e.capacity,
        },
      };
    case 'LINKED_WINDOWS':
      return {
        ...base,
        pricingBasis: 'per_quantity',
        capacityUnit: 'kg',
        quantityScale: 0,
        specialistSetup: {
          model: 'LINKED_WINDOWS',
          version: 1,
          supplierComponents: [],
          promiseMode: 'FIRM_PRE_ACCEPTED',
          // The shop collects the laundry and brings it back: the windows are its van's times.
          incomingMethod: 'MERCHANT_COLLECTION',
          outgoingMethod: 'MERCHANT_RETURN',
          incomingResourceIds: extra.counterIds,
          outgoingResourceIds: extra.counterIds,
          processingResourceId: resourceIds[0],
          processingUnit: 'kg',
          quantityScale: 0,
          minimumProcessingMinutes: 120,
          maximumProcessingMinutes: 1440,
          calendarBasis: 'elapsed',
          workingDays: WEEK,
          opens: scheduleOf(shop).start,
          closes: scheduleOf(shop).end,
        },
      };
    case 'SERVICE_JOB':
      return {
        ...base,
        durationMinutes: e.durationMinutes,
        specialistSetup: {
          model: 'SERVICE_JOB',
          version: 1,
          supplierComponents: [],
          jobSchedulingMode: 'scheduled_work',
          assessmentMode: 'fixed_scope',
          resourceIds,
          durationMinutes: e.durationMinutes,
          partsRequired: false,
          partsEvidenceKind: 'authorized_manual_reference',
          custodyMode: 'customer_retains',
          custodyResourceIds: [],
          custodyDurationMinutes: 1440,
        },
      };
    case 'ENTITLEMENT':
      return {
        ...base,
        intakeMode: 'plan_enrolment',
        specialistSetup: {
          model: 'ENTITLEMENT',
          version: 1,
          supplierComponents: [],
          planId: extra.planId,
          planVersion: 1,
          scopeOfferingIds: [extra.childId],
          validity: {
            mode: 'relative_to_activation',
            duration: { value: e.validityDays, unit: 'day' },
          },
          credits: [
            {
              id: 'visits',
              quantityMinor: e.credits,
              unit: 'visit',
              scale: 0,
              offeringIds: [extra.childId],
            },
          ],
          creditCancellation: 'restore_before_start',
          renewal: 'none',
        },
      };
    default:
      throw new Error(`No offering builder for ${e.model}`);
  }
}

/** Fields the engine only changes through a revised offering. */
const SETUP_FIELDS = [
  'pricingBasis',
  'durationMinutes',
  'resourceSelectionMode',
  'transportIncluded',
  'withDriver',
  'bufferAfterMinutes',
];

function needsRevision(existing, body) {
  for (const key of SETUP_FIELDS)
    if (body[key] !== undefined && existing[key] !== body[key]) return true;
  const ids = (list) => JSON.stringify([...(list ?? [])].sort());
  // A specialist offering's stored resource list also holds the resources its setup names,
  // so for those only the setup itself is compared.
  if (!body.specialistSetup && ids(existing.resourceIds) !== ids(body.resourceIds)) return true;
  if (body.serviceArea && ids(existing.serviceArea?.areas) !== ids(body.serviceArea.areas))
    return true;
  const incoming = body.specialistSetup?.incomingResourceIds;
  if (incoming && ids(existing.specialistSetup?.incomingResourceIds) !== ids(incoming)) return true;
  return false;
}

/** The answers that switch on each booking type the shop offers, and who owns its bookings. */
function configurationFor(shop, businessId, spaces) {
  const owner = (dataClass) => ({
    data_class: dataClass,
    authority: 'NEXG_AUTHORITATIVE',
    owner_reference: shop.legal,
    scope: { business_id: businessId },
  });
  return {
    subcategoryId: shop.engineProfile,
    businessName: shop.name,
    published: true,
    canonicalAnswers: {
      ...(shop.engineAnswers ?? {}),
      Q_DATA_AUTHORITY: ['reservations', 'work_items', 'offerings'].map(owner),
      ...(spaces.length
        ? {
            BQ_SPACE_POLICY: {
              spaces: spaces.map((space) => ({
                resource_id: space.id,
                minimum_party_size: 1,
                maximum_party_size: space.partyCapacity,
                active: true,
              })),
              combinations: [],
              turnover_minutes: TURNOVER_MINUTES,
            },
          }
        : {}),
    },
  };
}

/** Dated start times (Nairobi) for sessions and shared tour departures. */
function startTimes(e) {
  const out = [];
  const today = new Date(Date.now() + 3 * 3600_000); // Nairobi wall clock
  for (let d = 0; d < DAYS_AHEAD; d++) {
    const day = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d),
    );
    const date = day.toISOString().slice(0, 10);
    const weekday = (day.getUTCDay() + 6) % 7; // 0 = Monday
    let times = [];
    if (e.daily) times = [e.daily];
    if (e.departures) times = e.departures;
    if (e.weekly && e.weekly.includes(weekday)) times = [e.time];
    for (const t of times) {
      const start = new Date(`${date}T${t}:00${NAIROBI}`);
      if (start.getTime() > Date.now() + 3600_000) out.push(start);
    }
  }
  return out;
}

const iso = (d) => d.toISOString().replace('.000Z', 'Z');

/**
 * Sets up one shop. `items` are its bookable items ({ name, desc, kind, engine, id, hidden }).
 * Returns [{ id, kind, offeringId }] for linkSql (hidden items are not linked).
 */
export async function setUpShop(call, shop, businessId, items, log = () => {}) {
  await call('configuration', configurationFor(shop, businessId, []), 'PUT');
  const ws = await call('workspace');
  const resources = new Map(ws.resources.map((r) => [r.name, r]));
  const offerings = new Map(ws.offerings.filter((o) => o.active !== false).map((o) => [o.name, o]));
  const schedule = scheduleOf(shop);

  async function resource(name, kind, quantity, extra = {}) {
    const existing = resources.get(name);
    if (existing) {
      const current = existing.schedule;
      if (current?.start !== schedule.start || current?.end !== schedule.end) {
        try {
          const updated = await call(
            `resources/${existing.id}`,
            { schedule, expectedVersion: existing.version ?? 1 },
            'PATCH',
          );
          resources.set(name, { ...existing, ...updated });
          log(`  hours ${name} ${schedule.start}-${schedule.end}`);
        } catch (error) {
          // The engine keeps the hours of a resource that already has sessions or bookings
          // (409). For sessions and departures the times are the dated sessions anyway.
          if (!String(error.message).includes(': 409 ')) throw error;
          log(`  kept hours of ${name} (it has sessions or bookings)`);
        }
      }
      return existing.id;
    }
    const body = { name, kind, quantity, schedule, ...extra };
    if (['space', 'vehicle'].includes(kind) && quantity > 1)
      Object.assign(body, { quantity: 1, partyCapacity: quantity });
    const made = await call('resources', body);
    resources.set(name, { ...made, partyCapacity: made.partyCapacity ?? body.partyCapacity });
    log(`  resource ${name}`);
    return made.id;
  }

  // 1. Resources for every item first, so the table policy can name the actual tables.
  const plan = [];
  for (const item of items) {
    const e = item.engine;
    const ids = [];
    const extra = {};
    if (e.resources)
      for (const [name, kind, qty] of e.resources) ids.push(await resource(name, kind, qty));
    if (e.model === 'LINKED_WINDOWS') {
      ids.push(
        await resource('Laundry workload', 'capacity_pool', e.capacityKg, {
          capacityUnit: 'kg',
          quantityScale: 0,
          capacityMode: 'per-guest',
        }),
      );
      extra.counterIds = [await resource('Collection van', 'vehicle', 1)];
    }
    if (e.model === 'SESSION_CAPACITY' || e.model === 'TOUR') {
      if (e.model === 'TOUR') ids.push(await resource(`${item.name} guide`, 'staff', 1));
      ids.push(
        await resource(`${item.name} places`, 'capacity_pool', e.capacity, {
          capacityUnit: 'place',
          quantityScale: 0,
          capacityMode: 'per-guest',
        }),
      );
    }
    plan.push({ item, e, ids, extra });
  }

  // 2. The answers that enable each booking type, with the actual tables or courts.
  const byId = new Map([...resources.values()].map((r) => [r.id, r]));
  const spaceIds = [
    ...new Set(
      plan.filter((p) => p.e.model === 'SPACE_RESERVATION' && !p.item.hidden).flatMap((p) => p.ids),
    ),
  ];
  if (spaceIds.length)
    await call(
      'configuration',
      configurationFor(
        shop,
        businessId,
        spaceIds.map((id) => ({ id, partyCapacity: byId.get(id)?.partyCapacity ?? 1 })),
      ),
      'PUT',
    );

  async function offering(item, e, resourceIds, extra) {
    const found = offerings.get(item.name);
    if (item.hidden) {
      if (found) {
        await call(
          `offerings/${found.id}`,
          { active: false, expectedVersion: found.version ?? 1 },
          'PATCH',
        );
        offerings.delete(item.name);
        log(`  switched off ${item.name}`);
      }
      return null;
    }
    const body = offeringBody(shop, item, e, resourceIds, extra);
    if (found && !needsRevision(found, body)) return found;
    // The revised offering is made first, so a refusal leaves the old one working.
    const made = await call('offerings', body);
    offerings.set(item.name, made);
    log(`  offering ${item.name} (${made.executionMode ?? e.model})`);
    if (found) {
      await call(
        `offerings/${found.id}`,
        { active: false, expectedVersion: found.version ?? 1 },
        'PATCH',
      );
      log(`  switched off the earlier ${item.name}`);
    }
    return made;
  }

  // 3. Offerings, then dated sessions and departures.
  const links = [];
  for (const { item, e, ids, extra } of plan) {
    if (e.model === 'ENTITLEMENT' && !item.hidden) {
      const child = offerings.get(e.childItem);
      if (!child) throw new Error(`${item.name}: covered offering ${e.childItem} not found`);
      Object.assign(extra, { childId: child.id, planId: `PLAN-${shop.slug}-${item.n}` });
    }
    const made = await offering(item, e, ids, extra);
    if (!made) continue;
    if (e.daily || e.departures || e.weekly) {
      const existing = new Set(
        (ws.occurrences ?? [])
          .filter((o) => o.offeringId === made.id)
          .map((o) => new Date(o.startTime).getTime()),
      );
      let added = 0;
      let version = made.version ?? 1;
      for (const start of startTimes(e)) {
        if (existing.has(start.getTime())) continue;
        const end = new Date(start.getTime() + e.durationMinutes * 60_000);
        const row = await call(`offerings/${made.id}/occurrences`, {
          expectedVersion: version,
          startTime: iso(start),
          endTime: iso(end),
          capacity: e.capacity,
          published: true,
        });
        version = row.offeringVersion ?? version + 1;
        added++;
      }
      if (added) log(`  ${added} dated sessions for ${item.name}`);
    }
    links.push({ id: item.id, kind: item.kind, offeringId: made.id });
  }
  return links;
}
