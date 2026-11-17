import { randomUUID } from 'node:crypto';
import { normalizeBookingAnswers } from '@nexg/booking-config';
import type { BookingEngine } from './engine.js';
import { requireManager } from './auth.js';
import { BookingError, type Identity, type Customer } from './types.js';
import { parseBookingInstant } from './time.js';
import { calculateBookingPrice } from './pricing.js';
import { assertStayPilotEnabled, assertStayPilotEnvironment } from './stay-pilot.js';

type Doc = Record<string, any>;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail = (code: string, message: string, status = 409): never => {
  throw new BookingError(status, message, code);
};
const actor = (i: Identity) => {
  if (!i.userId) fail('forbidden', 'A trusted actor is required.', 403);
  if (i.role !== 'customer') requireManager(i);
};
const scopeKey = (i: Identity) =>
  JSON.stringify([i.businessId, i.userId, i.role, i.branches ? [...i.branches].sort() : null]);
const exact = (v: unknown, keys: string[]) =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => keys.includes(k));
function stayCustomer(customer?: Customer): Customer {
  if (
    !customer ||
    typeof customer.name !== 'string' ||
    !customer.name.trim() ||
    customer.name.length > 200 ||
    (!customer.email && !customer.phone) ||
    (customer.email !== undefined &&
      (typeof customer.email !== 'string' ||
        customer.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))) ||
    (customer.phone !== undefined &&
      (typeof customer.phone !== 'string' || !customer.phone.trim() || customer.phone.length > 100))
  )
    return fail('stay_customer_required', 'Trusted customer contact is required.', 422);
  return {
    name: customer.name.trim(),
    ...(customer.email ? { email: customer.email } : {}),
    ...(customer.phone ? { phone: customer.phone } : {}),
  };
}
export interface StayInventoryInput {
  offeringId: string;
  expectedOfferingVersion: number;
  propertyId: string;
  unitId: string;
  resourceId: string;
  maxGuests: number;
  minNights: number;
  maxNights: number;
  checkInTime: string;
  checkOutTime: string;
}
export interface StayQuoteInput {
  propertyId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}
export interface StayHoldInput {
  quoteId: string;
  requestId: string;
  expectedTotalMinor: number;
}
export type StaySearchInput = Omit<StayQuoteInput, 'unitId' | 'propertyId'> & {
  propertyId: string | null;
};
export interface StayQuote extends StayQuoteInput {
  quoteId: string;
  offeringId: string;
  nights: number;
  nightlyMinor: number;
  totalMinor: number;
  currency: 'KES';
  expiresAt: string;
}

function authority(config: Doc, i: Identity, service: Doc) {
  const bindings = normalizeBookingAnswers({
    ...config,
    subcategoryId: config.subcategoryId,
    scope: {
      businessId: i.businessId,
      offeringId: service.publicId,
      locationId: service.nexg?.locationId,
    },
  }).values['integration.data_authority'];
  if (!Array.isArray(bindings)) return false;
  const required = ['reservations', 'availability', 'resources', 'pricing'],
    seen = new Set<string>();
  for (const a of bindings) {
    if (!a || !required.includes(a.data_class)) continue;
    const s = a.scope;
    if (!s || typeof s !== 'object' || !s.business_id) return false;
    if (
      s.business_id !== i.businessId ||
      (s.activity_id && s.activity_id !== config.subcategoryId) ||
      (s.offering_id && s.offering_id !== service.publicId) ||
      (s.location_id && s.location_id !== service.nexg.locationId) ||
      s.session_id
    )
      continue;
    if (
      Object.keys(s).some(
        (k) => !['business_id', 'activity_id', 'offering_id', 'location_id'].includes(k),
      ) ||
      a.authority !== 'NEXG_AUTHORITATIVE' ||
      a.owner_reference !== 'nexg-booking-engine'
    )
      return false;
    seen.add(a.data_class);
  }
  return required.every((k) => seen.has(k));
}
function times(input: StayQuoteInput, inventory: Doc) {
  if (!/^\d{4}-\d\d-\d\d$/.test(input.checkIn) || !/^\d{4}-\d\d-\d\d$/.test(input.checkOut))
    fail('invalid_stay_intent', 'Use exact check-in and check-out dates.', 422);
  const dayIn = parseBookingInstant(input.checkIn + 'T00:00:00+03:00'),
    dayOut = parseBookingInstant(input.checkOut + 'T00:00:00+03:00'),
    nights = (dayOut - dayIn) / 86400000;
  if (!Number.isInteger(nights) || nights < inventory.minNights || nights > inventory.maxNights)
    fail('invalid_stay_nights', 'Choose nights within the published room limits.', 422);
  const start = parseBookingInstant(input.checkIn + 'T' + inventory.checkInTime + ':00+03:00'),
    end = parseBookingInstant(input.checkOut + 'T' + inventory.checkOutTime + ':00+03:00');
  if (end <= start) fail('invalid_stay_nights', 'Check-out must follow check-in.', 422);
  return {
    nights,
    start,
    end,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
  };
}
async function source(
  engine: BookingEngine,
  i: Identity,
  propertyId: string,
  unitId: string,
  req: any,
) {
  const c = engine.managementContext(),
    config = (await c.all('businesses', i, req))[0]?.configuration;
  const matches = (await c.all('services', i, req)).filter(
    (s) =>
      s.nexg?.stayInventory?.propertyId === propertyId && s.nexg?.stayInventory?.unitId === unitId,
  );
  if (matches.length !== 1) fail('stay_inventory_required', 'Choose one exact NexG-managed room.');
  const service = await c.own('services', matches[0]!.publicId, i, req),
    inventory = service.nexg.stayInventory;
  assertStayPilotEnabled(inventory);
  if (
    config?.published !== true ||
    inventory.contractVersion !== 1 ||
    inventory.managedBy !== 'nexg' ||
    service.active !== true ||
    service.nexg.bookingEnabled !== true ||
    service.nexg.model !== 'ASSET_INTERVAL' ||
    service.durationType !== 'flexible' ||
    service.nexg.pricingBasis !== 'per_night' ||
    !authority(config, i, service)
  )
    fail(
      'stay_authority_required',
      'Published native ownership of room inventory and pricing is required.',
    );
  const resource = await c.own('resources', inventory.resourceId, i, req);
  if (
    resource.active !== true ||
    resource.quantity !== 1 ||
    resource.capacityMode !== 'per-reservation' ||
    !['asset', 'space'].includes(resource.resourceType) ||
    resource.nexg?.locationId !== service.nexg.locationId ||
    !Array.isArray(service.nexg.resourceIds) ||
    service.nexg.resourceIds.length !== 1 ||
    service.nexg.resourceIds[0] !== resource.publicId
  )
    fail(
      'stay_inventory_required',
      'The published room must be one exclusive active owner resource.',
    );
  return { service, inventory, resource };
}
function price(service: Doc, start: number, end: number) {
  if (
    !Number.isSafeInteger(service.nexg.priceMinor) ||
    service.nexg.priceMinor <= 0 ||
    (service.nexg.reservationFee && service.nexg.reservationFee.mode !== 'no_fee') ||
    (service.nexg.minimumBillableUnits ?? 1) !== 1
  )
    fail(
      'stay_price_required',
      'This Stay path supports positive room-only nightly pricing without additional fees.',
    );
  const p = calculateBookingPrice(service.nexg, start, end, 1);
  return { nightlyMinor: service.nexg.priceMinor, totalMinor: p.totalMinor };
}
function available(rows: Doc[], resource: Doc, start: number, end: number, now: number) {
  const id = (v: any) => String(v && typeof v === 'object' ? v.id : v);
  return !rows.some(
    (r) =>
      !['cancelled', 'expired'].includes(r.status) &&
      !(r.status === 'held' && Date.parse(r.nexg?.expiresAt) <= now) &&
      Date.parse(r.startTime) < end &&
      Date.parse(r.endTime) > start &&
      [r.resource, ...(r.items ?? []).map((x: any) => x.resource)].some(
        (v) => id(v) === String(resource.id),
      ),
  );
}
function admission(
  c: ReturnType<BookingEngine['managementContext']>,
  service: Doc,
  inventory: Doc,
  resource: Doc,
  input: StayQuoteInput,
  window: ReturnType<typeof times>,
) {
  return (
    input.adults + input.children <= inventory.maxGuests &&
    window.start > c.now() &&
    window.start >= c.now() + (service.nexg.leadTimeMinutes ?? 0) * 60000 &&
    (!service.nexg.horizonDays || window.start <= c.now() + service.nexg.horizonDays * 86400000) &&
    c.scheduleAllows(service, resource, window.start, window.end)
  );
}
/** Caller must establish the actual coherent snapshot; this performs no writes. */
export async function readStayAvailability(
  engine: BookingEngine,
  i: Identity,
  input: StayQuoteInput,
  transaction: { request: any; coherentSnapshot: true },
) {
  actor(i);
  if (transaction?.coherentSnapshot !== true || transaction.request?.transactionID == null)
    fail('stay_snapshot_required', 'A coherent transaction snapshot is required.');
  if (
    !exact(input, ['propertyId', 'unitId', 'checkIn', 'checkOut', 'adults', 'children']) ||
    ![input.propertyId, input.unitId].every((v) => typeof v === 'string' && uuid.test(v)) ||
    !Number.isSafeInteger(input.adults) ||
    input.adults < 1 ||
    !Number.isSafeInteger(input.children) ||
    input.children < 0
  )
    fail('invalid_stay_intent', 'Choose exact room, dates and guests.', 422);
  const c = engine.managementContext(),
    req = c.request(i, transaction.request.transactionID),
    { service, inventory, resource } = await source(engine, i, input.propertyId, input.unitId, req),
    window = times(input, inventory),
    pricing = price(service, window.start, window.end);
  const free =
    admission(c, service, inventory, resource, input, window) &&
    available(await c.all('reservations', i, req), resource, window.start, window.end, c.now());
  return {
    contractVersion: 1 as const,
    authority: 'nexg-booking-engine' as const,
    held: false as const,
    ...input,
    offeringId: service.publicId,
    nights: window.nights,
    available: free,
    ...pricing,
    currency: 'KES' as const,
    observedAt: new Date(c.now()).toISOString(),
  };
}

/** Tenant inventory only. This is not a cross-merchant search or a booking. */
export async function readStaySearch(
  engine: BookingEngine,
  i: Identity,
  input: StaySearchInput,
  transaction: { request: any; coherentSnapshot: true },
) {
  assertStayPilotEnvironment();
  actor(i);
  if (transaction?.coherentSnapshot !== true || transaction.request?.transactionID == null)
    fail('stay_snapshot_required', 'A coherent transaction snapshot is required.', 503);
  if (
    !exact(input, ['propertyId', 'checkIn', 'checkOut', 'adults', 'children']) ||
    (input.propertyId !== null &&
      (typeof input.propertyId !== 'string' || !uuid.test(input.propertyId))) ||
    typeof input.checkIn !== 'string' ||
    typeof input.checkOut !== 'string' ||
    !Number.isSafeInteger(input.adults) ||
    input.adults < 1 ||
    !Number.isSafeInteger(input.children) ||
    input.children < 0 ||
    input.adults + input.children > 40
  )
    fail('invalid_stay_intent', 'Choose exact dates and guest counts.', 422);
  const nights = times(
    { ...input, propertyId: '', unitId: '' },
    {
      minNights: 1,
      maxNights: 90,
      checkInTime: '15:00',
      checkOutTime: '11:00',
    },
  ).nights;
  const c = engine.managementContext();
  const req = c.request(i, transaction.request.transactionID);
  const mapped = (await c.all('services', i, req))
    .filter((service) => service.nexg?.stayInventory != null)
    .map((service) => service.nexg.stayInventory);
  if (!mapped.length || mapped.length > 200)
    fail('stay_search_scope_unavailable', 'Complete native room scope is unavailable.', 503);
  const scopes = new Set<string>(),
    units = new Set<string>(),
    resources = new Set<string>();
  for (const binding of mapped) {
    if (
      ![binding.propertyId, binding.unitId, binding.resourceId].every(
        (id) => typeof id === 'string' && uuid.test(id),
      ) ||
      units.has(binding.unitId.toLowerCase()) ||
      resources.has(binding.resourceId.toLowerCase())
    )
      fail('stay_search_scope_unavailable', 'Complete native room scope is unavailable.', 503);
    units.add(binding.unitId.toLowerCase());
    resources.add(binding.resourceId.toLowerCase());
    scopes.add(binding.propertyId);
  }
  if (input.propertyId !== null && !scopes.has(input.propertyId))
    fail('stay_search_scope_unavailable', 'Complete native room scope is unavailable.', 503);
  const scoped = mapped.filter(
    (binding) => input.propertyId === null || binding.propertyId === input.propertyId,
  );
  const reservations = await c.all('reservations', i, req);
  const now = c.now();
  const items: Array<{
    propertyId: string;
    unitId: string;
    offeringId: string;
    nights: number;
    nightlyMinor: number;
    totalMinor: number;
    currency: 'KES';
  }> = [];
  for (const binding of scoped) {
    const exactRoom = { ...input, propertyId: binding.propertyId, unitId: binding.unitId };
    const { service, inventory, resource } = await source(
      engine,
      i,
      binding.propertyId,
      binding.unitId,
      req,
    );
    if (nights < inventory.minNights || nights > inventory.maxNights) continue;
    const window = times(exactRoom, inventory);
    if (
      !admission(c, service, inventory, resource, exactRoom, window) ||
      !available(reservations, resource, window.start, window.end, now)
    )
      continue;
    items.push({
      propertyId: binding.propertyId,
      unitId: binding.unitId,
      offeringId: service.publicId,
      nights,
      ...price(service, window.start, window.end),
      currency: 'KES',
    });
  }
  return {
    contractVersion: 1 as const,
    authority: 'nexg-booking-engine' as const,
    scope: 'business' as const,
    businessId: i.businessId,
    complete: true as const,
    request: input,
    observedAt: new Date(now).toISOString(),
    checkedUnits: scoped.length,
    items,
  };
}

/** Provisioning accepts trusted manager bindings only; property/unit IDs cannot come from checkout. */
export async function publishStayInventory(
  engine: BookingEngine,
  i: Identity,
  input: StayInventoryInput,
  key: string,
) {
  requireManager(i);
  if (!i.userId) fail('forbidden', 'A trusted manager is required.', 403);
  if (
    !exact(input, [
      'offeringId',
      'expectedOfferingVersion',
      'propertyId',
      'unitId',
      'resourceId',
      'maxGuests',
      'minNights',
      'maxNights',
      'checkInTime',
      'checkOutTime',
    ]) ||
    ![input.offeringId, input.propertyId, input.unitId, input.resourceId].every(
      (v) => typeof v === 'string' && uuid.test(v),
    ) ||
    ![input.expectedOfferingVersion, input.maxGuests, input.minNights, input.maxNights].every(
      (v) => Number.isSafeInteger(v) && v > 0,
    ) ||
    input.maxGuests > 40 ||
    input.maxNights > 90 ||
    input.minNights > input.maxNights ||
    ![input.checkInTime, input.checkOutTime].every(
      (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
    )
  )
    fail('invalid_stay_inventory', 'Supply exact room inventory and limits.', 422);
  const c = engine.managementContext();
  return c.command(i, key, 'stays.inventory.publish', input, async (req) => {
    const service = await c.own('services', input.offeringId, i, req),
      config = (await c.all('businesses', i, req))[0]?.configuration;
    if (service.nexg?.version !== input.expectedOfferingVersion)
      fail('version_conflict', 'The offering changed. Refresh first.');
    if (
      service.nexg?.stayInventory ||
      (await c.all('services', i, req)).some(
        (s) =>
          s.nexg?.stayInventory?.unitId === input.unitId ||
          s.nexg?.stayInventory?.resourceId === input.resourceId,
      )
    )
      fail('stay_inventory_exists', 'The room identity and resource are immutable once published.');
    if (
      config?.published !== true ||
      !authority(config, i, service) ||
      service.nexg?.model !== 'ASSET_INTERVAL' ||
      service.durationType !== 'flexible' ||
      service.nexg.pricingBasis !== 'per_night' ||
      service.active !== true ||
      service.nexg.bookingEnabled !== true
    )
      fail('stay_authority_required', 'An active native Stay offering is required.');
    const r = await c.own('resources', input.resourceId, i, req);
    if (
      r.active !== true ||
      r.quantity !== 1 ||
      r.capacityMode !== 'per-reservation' ||
      !['asset', 'space'].includes(r.resourceType) ||
      r.nexg?.locationId !== service.nexg.locationId ||
      service.nexg.resourceIds?.length !== 1 ||
      service.nexg.resourceIds[0] !== r.publicId
    )
      fail('stay_inventory_required', 'Bind exactly one active exclusive room resource.');
    price(service, Date.parse('2030-01-01T12:00:00Z'), Date.parse('2030-01-02T07:00:00Z'));
    const { offeringId, expectedOfferingVersion, ...definition } = input;
    const inventory = {
      ...definition,
      contractVersion: 1,
      managedBy: 'nexg',
      version: 1,
      pilotState: 'disabled',
    };
    await c.update(
      'services',
      service.id,
      { nexg: { ...service.nexg, version: service.nexg.version + 1, stayInventory: inventory } },
      i,
      req,
    );
    await c.audit(i, req, 'stay.inventory.published', input.unitId, {
      offeringId,
      propertyId: input.propertyId,
    });
    return { offeringId, propertyId: input.propertyId, unitId: input.unitId, version: 1 };
  });
}

export async function quoteStay(
  engine: BookingEngine,
  i: Identity,
  input: StayQuoteInput,
  key: string,
): Promise<StayQuote> {
  assertStayPilotEnvironment();
  actor(i);
  if (
    !exact(input, ['propertyId', 'unitId', 'checkIn', 'checkOut', 'adults', 'children']) ||
    ![input.propertyId, input.unitId].every((v) => typeof v === 'string' && uuid.test(v)) ||
    !Number.isSafeInteger(input.adults) ||
    input.adults < 1 ||
    !Number.isSafeInteger(input.children) ||
    input.children < 0 ||
    input.adults + input.children > 40
  )
    fail('invalid_stay_intent', 'Choose the exact room, dates and guests.', 422);
  const c = engine.managementContext();
  const saved = await c.command(i, key, 'stays.quote', input, async (req) => {
    const { service, inventory, resource } = await source(
        engine,
        i,
        input.propertyId,
        input.unitId,
        req,
      ),
      window = times(input, inventory);
    if (!admission(c, service, inventory, resource, input, window))
      fail('stay_unavailable', 'The room is unavailable for these dates or guests.');
    if (
      !available(await c.all('reservations', i, req), resource, window.start, window.end, c.now())
    )
      fail('stay_unavailable', 'The room is already occupied for those dates.');
    const pricing = price(service, window.start, window.end),
      quote: StayQuote = {
        ...input,
        quoteId: randomUUID(),
        offeringId: service.publicId,
        nights: window.nights,
        ...pricing,
        currency: 'KES',
        expiresAt: new Date(Math.min(c.now() + 300000, window.start)).toISOString(),
      };
    return {
      kind: 'stay.quote',
      actorScope: scopeKey(i),
      inventoryVersion: inventory.version,
      resourceId: resource.publicId,
      quote,
    };
  });
  return saved.quote;
}

export function stayHoldView(doc: Doc, now: number) {
  const n = doc.nexg,
    s = n.stayHold;
  const reconciliation =
    n.stayPaymentReconciliation?.state === 'required' &&
    n.stayPaymentReconciliation?.fundsObserved === true;
  const paid =
    doc.status === 'confirmed' &&
    n.paymentState === 'provider_verified' &&
    n.stayPayment?.state === 'settled' &&
    n.paidMinor === s.totalMinor &&
    n.stayPayment.amountMinor === s.totalMinor &&
    n.stayPayment.currency === 'KES';
  return {
    id: doc.publicId,
    status: doc.status === 'held' && Date.parse(n.expiresAt) <= now ? 'expired' : doc.status,
    quoteId: s.quoteId,
    propertyId: s.propertyId,
    unitId: s.unitId,
    offeringId: n.offeringId,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    adults: s.adults,
    children: s.children,
    nights: s.nights,
    nightlyMinor: s.nightlyMinor,
    totalMinor: s.totalMinor,
    currency: 'KES' as const,
    startTime: doc.startTime,
    endTime: doc.endTime,
    expiresAt: n.expiresAt ?? s.holdExpiresAt ?? null,
    version: n.version,
    paymentStatus: reconciliation
      ? ('pending' as const)
      : paid
        ? ('paid' as const)
        : n.stayPayment?.state === 'pending'
          ? ('pending' as const)
          : ('unpaid' as const),
    paymentReconciliationRequired: reconciliation,
    refundDue: false,
  };
}
/** Payment confirmation rechecks inventory ownership, not mutable current pricing. */
export async function assertStayHoldReady(engine: BookingEngine, i: Identity, doc: Doc, req: any) {
  const c = engine.managementContext(),
    s = doc.nexg?.stayHold;
  if (
    !s ||
    doc.status !== 'held' ||
    !Number.isFinite(Date.parse(doc.nexg?.expiresAt)) ||
    Date.parse(doc.nexg.expiresAt) <= c.now()
  )
    fail('stay_hold_expired', 'The active Stay hold is required.');
  const { service, inventory, resource } = await source(engine, i, s.propertyId, s.unitId, req),
    window = times(s, inventory);
  if (
    inventory.version !== s.inventoryVersion ||
    service.publicId !== doc.nexg.offeringId ||
    doc.nexg.resourceIds?.length !== 1 ||
    doc.nexg.resourceIds[0] !== resource.publicId ||
    Date.parse(doc.startTime) !== window.start ||
    Date.parse(doc.endTime) !== window.end ||
    !c.scheduleAllows(service, resource, window.start, window.end)
  )
    fail('stay_inventory_changed', 'The accepted Stay inventory no longer matches.');
}
export async function readStayHold(engine: BookingEngine, i: Identity, id: string) {
  actor(i);
  const c = engine.managementContext();
  const matches = (await c.all('reservations', i)).filter(
    (r) =>
      r.nexg?.stayHold?.contractVersion === 1 &&
      (r.publicId === id || r.nexg.stayHold.quoteId === id) &&
      (i.role !== 'customer' || r.nexg.createdBy === i.userId),
  );
  if (matches.length !== 1) fail('not_found', 'Stay not found.', 404);
  const doc = await c.own('reservations', matches[0]!.publicId, i);
  return stayHoldView(doc, c.now());
}
export async function createStayHold(
  engine: BookingEngine,
  i: Identity,
  input: StayHoldInput,
  trustedCustomer?: Customer,
) {
  assertStayPilotEnvironment();
  actor(i);
  if (
    !exact(input, ['quoteId', 'requestId', 'expectedTotalMinor']) ||
    ![input.quoteId, input.requestId].every((v) => typeof v === 'string' && uuid.test(v)) ||
    input.requestId !== input.quoteId ||
    !Number.isSafeInteger(input.expectedTotalMinor) ||
    input.expectedTotalMinor <= 0
  )
    fail(
      'invalid_stay_intent',
      'Use the reviewed quote ID as request ID and its exact total.',
      422,
    );
  const customer = stayCustomer(trustedCustomer);
  const c = engine.managementContext(),
    result = await c.command(
      i,
      input.requestId,
      'stays.hold',
      { ...input, customer: customer! },
      async (req) => {
        const saved = (await c.all('booking-operations', i, req))
          .map((r) => r.result)
          .find(
            (r) =>
              r?.kind === 'stay.quote' &&
              r.quote?.quoteId === input.quoteId &&
              r.actorScope === scopeKey(i),
          );
        if (!saved) fail('stay_quote_required', 'A quote issued to this actor is required.');
        const q = saved.quote as StayQuote;
        if (Date.parse(q.expiresAt) <= c.now())
          fail('stay_quote_expired', 'The quote expired; request a fresh price.');
        const { service, inventory, resource } = await source(
            engine,
            i,
            q.propertyId,
            q.unitId,
            req,
          ),
          window = times(q, inventory),
          pricing = price(service, window.start, window.end);
        if (
          inventory.version !== saved.inventoryVersion ||
          resource.publicId !== saved.resourceId ||
          service.publicId !== q.offeringId ||
          pricing.totalMinor !== q.totalMinor ||
          pricing.nightlyMinor !== q.nightlyMinor ||
          input.expectedTotalMinor !== q.totalMinor
        )
          fail('stay_price_changed', 'The room or price changed; request a fresh quote.');
        if (!admission(c, service, inventory, resource, q, window))
          fail('stay_unavailable', 'The room is unavailable.');
        await c.expireHolds(i, req);
        if (
          !available(
            await c.all('reservations', i, req),
            resource,
            window.start,
            window.end,
            c.now(),
          )
        )
          fail('stay_unavailable', 'The room is already occupied for those dates.');
        const id = randomUUID(),
          expiresAt = new Date(Math.min(c.now() + 900000, window.start)).toISOString();
        const {
          quoteId,
          propertyId,
          unitId,
          checkIn,
          checkOut,
          adults,
          children,
          nights,
          nightlyMinor,
          totalMinor,
        } = q;
        const doc = await c.create(
          'reservations',
          {
            publicId: id,
            service: service.id,
            resource: resource.id,
            startTime: window.startTime,
            endTime: window.endTime,
            status: 'held',
            guest: customer!,
            guestCount: 1,
            nexg: {
              publicId: id,
              offeringId: service.publicId,
              model: 'ASSET_INTERVAL',
              resourceIds: [resource.publicId],
              locationId: service.nexg.locationId,
              quantity: 1,
              version: 1,
              createdBy: i.userId,
              expiresAt,
              stayHold: {
                contractVersion: 1,
                quoteId,
                propertyId,
                unitId,
                checkIn,
                checkOut,
                adults,
                children,
                nights,
                nightlyMinor,
                totalMinor,
                currency: 'KES',
                inventoryVersion: inventory.version,
                holdExpiresAt: expiresAt,
              },
            },
          },
          i,
          req,
        );
        if (Date.parse(doc.startTime) !== window.start || Date.parse(doc.endTime) !== window.end)
          fail('stay_window_mismatch', 'Reserve must preserve the exact Stay window.');
        await c.audit(i, req, 'stay.hold.created', id, { status: 'held' });
        return { bookingId: id };
      },
    );
  return readStayHold(engine, i, result.bookingId);
}
