import { BookingError, type Identity } from './types.js';
import type { BookingEngine } from './engine.js';
import { randomUUID } from 'node:crypto';
import { validateReservationFeePolicy } from '@nexg/booking-config';
import { requireManager } from './auth.js';

type Doc = Record<string, any>;
const RESERVED = new Set(['held', 'confirmed']);
const CLOSED = new Set(['completed', 'cancelled', 'expired', 'no-show']);
const KINDS = new Set(['staff', 'asset', 'vehicle', 'room', 'space', 'equipment', 'capacity_pool']);
const integer = (value: unknown, label: string, min = 0, max = 1e9): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new BookingError(422, `${label} must be a whole number between ${min} and ${max}.`, 'invalid_input');
  return value;
};
function label(value: unknown, name: string, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BookingError(422, `${name} is required and must be at most ${max} characters.`, 'invalid_input');
  return value.trim();
}
function version(doc: Doc, input: Doc) {
  const current = doc.nexg?.version ?? 1;
  if (input.expectedVersion !== current) throw new BookingError(409, 'This record changed. Refresh before saving.', 'version_conflict');
  return current + 1;
}
function schedule(value: any) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!value || !Array.isArray(value.days) || !value.days.length || value.days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6) || !time.test(value.start) || !time.test(value.end) || value.start === value.end) throw new BookingError(422, 'Choose valid weekdays and different opening and closing times.', 'invalid_schedule');
  return { days: [...new Set(value.days)], start: value.start, end: value.end };
}
function exactInstant(value: unknown) {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new BookingError(422, 'Use an exact date and time with its time offset.', 'invalid_time');
  return new Date(value).toISOString();
}
function matchesResource(doc: Doc, id: string, internalId: string | number) {
  const relatedId = (value: any) => String(typeof value === 'object' ? value?.id : value);
  return (doc.nexg?.resourceIds ?? []).includes(id) || relatedId(doc.resource) === String(internalId) || (doc.items ?? []).some((item: any) => relatedId(item.resource) === String(internalId));
}
function hasLiveAllocation(doc: Doc, now: number) {
  return RESERVED.has(doc.status) && (doc.nexg?.custodyState === 'in_use' || doc.nexg?.workState === 'in_use' || Date.parse(doc.endTime ?? doc.nexg?.endTime) > now);
}

/** Changes preserve history. Capacity edits never silently rewrite accepted commitments. */
export async function manageResource(engine: BookingEngine, identity: Identity, id: string, input: Doc, key?: string) {
  requireManager(identity);
  const c = engine.managementContext();
  return c.command(identity, key, `resource.${id}.update`, input, async (req: any) => {
    const doc = await c.own('resources', id, identity, req);
    const nextVersion = version(doc, input);
    const data: Doc = { nexg: { ...doc.nexg, version: nextVersion } };
    if (input.name !== undefined) data.name = label(input.name, 'Resource name');
    const structural = ['quantity', 'kind', 'capacityMode', 'capacityUnit', 'quantityScale', 'partyCapacity', 'schedule', 'active'].some(k => input[k] !== undefined);
    if (structural) {
      const live = (await c.all('reservations', identity, req)).some((d: Doc) => matchesResource(d, id, doc.id) && hasLiveAllocation(d, c.now()));
      if (live) throw new BookingError(409, 'This resource has active commitments. Resolve them before changing capacity, hours, or availability.', 'resource_has_commitments');
      const kind = input.kind ?? doc.resourceType;
      if (!KINDS.has(kind)) throw new BookingError(422, 'Choose a supported resource kind.', 'invalid_resource');
      data.resourceType = kind;
      const exclusive = ['asset', 'vehicle', 'space'].includes(kind);
      data.quantity = exclusive ? 1 : integer(input.quantity ?? doc.quantity, 'Capacity', 1);
      data.capacityMode = exclusive ? 'per-reservation' : input.capacityMode ?? doc.capacityMode;
      if (!['per-reservation', 'per-guest'].includes(data.capacityMode)) throw new BookingError(422, 'Choose a supported capacity mode.', 'invalid_capacity_mode');
      if (input.capacityUnit !== undefined) data.nexg.capacityUnit = label(input.capacityUnit, 'Capacity unit', 40);
      if (input.quantityScale !== undefined) data.nexg.quantityScale = integer(input.quantityScale, 'Quantity precision', 0, 6);
      if (input.partyCapacity !== undefined) data.nexg.partyCapacity = integer(input.partyCapacity, 'Party capacity', 1);
      if (input.schedule !== undefined) data.nexg.schedule = schedule(input.schedule);
      if (input.active !== undefined) { if (typeof input.active !== 'boolean') throw new BookingError(422, 'Availability must be true or false.', 'invalid_input'); data.active = input.active; }
    }
    const result = await c.update('resources', doc.id, data, identity, req);
    if (input.schedule !== undefined) {
      for (const old of await c.all('schedules', identity, req)) {
        const resource = typeof old.resource === 'object' ? old.resource?.id : old.resource;
        if (String(resource) === String(doc.id) && old.active !== false) await c.update('schedules', old.id, { active: false }, identity, req);
      }
      const hours = data.nexg.schedule;
      const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      if (hours.start < hours.end) await c.create('schedules', { name: `${result.name} hours`, resource: doc.id, scheduleType: 'recurring', recurringSlots: hours.days.map((day: number) => ({ day: days[day], startTime: hours.start, endTime: hours.end })), active: true }, identity, req);
    }
    await c.audit(identity, req, 'booking.resource.updated', id, { version: nextVersion });
    return engine.resourceView(result);
  });
}

/** Offering edits use the same validation as creation, and keep accepted work immutable. */
export async function manageOffering(engine: BookingEngine, identity: Identity, id: string, input: Doc, key?: string) {
  requireManager(identity);
  const c = engine.managementContext();
  return c.command(identity, key, `offering.${id}.update`, input, async (req: any) => {
    const doc = await c.own('services', id, identity, req);
    const nextVersion = version(doc, input);
    const financial = ['priceMinor', 'pricingBasis', 'durationUnitMinutes', 'minimumBillableUnits', 'reservationFee', 'paymentPolicyId', 'changePolicyId', 'policyVersion'];
    const permitted = new Set(['expectedVersion', 'name', 'description', 'active', 'bookingEnabled', ...financial]);
    if (Object.keys(input).some(k => !permitted.has(k))) throw new BookingError(422, 'Create a revised offering to change its duration, model, or resource requirements. Existing bookings keep their accepted terms.', 'new_offering_revision_required');
    const data: Doc = { nexg: { ...doc.nexg, version: nextVersion } };
    if (financial.some(k => input[k] !== undefined)) {
      const work = [...await c.all('reservations', identity, req), ...await c.all('booking-requests', identity, req)];
      if (work.some((d: Doc) => d.nexg?.offeringId === id && !CLOSED.has(d.status ?? d.nexg?.status))) throw new BookingError(409, 'This offering has open work. Create a new offering revision to change prices or payment terms.', 'offering_has_commitments');
      for (const field of financial) if (input[field] !== undefined) data.nexg[field] = input[field];
      integer(data.nexg.priceMinor, 'Price');
      if (!['per_booking', 'per_quantity', 'per_duration', 'per_night', 'indicative'].includes(data.nexg.pricingBasis ?? 'per_booking')) throw new BookingError(422, 'Choose a supported pricing basis.', 'invalid_price');
      if (data.nexg.pricingBasis === 'indicative' && !['ORDER', 'REQUEST_QUOTE', 'ENTITLEMENT', 'PRODUCTION_DUE', 'SERVICE_JOB', 'FREIGHT'].includes(doc.nexg.model)) throw new BookingError(422, 'An indicative price needs a request offering; a reservable time requires an accepted price.', 'invalid_price');
      if (data.nexg.pricingBasis === 'per_duration') integer(data.nexg.durationUnitMinutes, 'Billing duration unit', 1, 527040);
      if (data.nexg.minimumBillableUnits !== undefined) integer(data.nexg.minimumBillableUnits, 'Minimum billable units', 1);
      const issues = validateReservationFeePolicy(data.nexg.reservationFee ?? { mode: 'no_fee', treatment: 'credited_to_total', requiredBeforeConfirmation: false, refundTerms: 'No reservation fee.' }, data.nexg.paymentPolicyId);
      if (issues.length) throw new BookingError(422, issues.map((i: any) => i.message).join(' '), 'invalid_fee');
      if (!['NO_PREPAYMENT_V1', 'MANUAL_COLLECTION_V1'].includes(data.nexg.paymentPolicyId) || data.nexg.changePolicyId !== 'CHANGE_BEFORE_START_V1' || data.nexg.policyVersion !== 1) throw new BookingError(422, 'Choose supported versioned payment and change policies.', 'policy_setup_required');
    }
    if (input.name !== undefined) data.name = label(input.name, 'Offering name');
    if (input.description !== undefined) { if (typeof input.description !== 'string' || input.description.length > 2000) throw new BookingError(422, 'Description must be at most 2000 characters.', 'invalid_input'); data.description = input.description.trim(); }
    for (const flag of ['active', 'bookingEnabled']) if (input[flag] !== undefined) {
      if (typeof input[flag] !== 'boolean') throw new BookingError(422, 'Availability must be true or false.', 'invalid_input');
      if (flag === 'active') data.active = input.active; else data.nexg.bookingEnabled = input.bookingEnabled;
    }
    const result = await c.update('services', doc.id, data, identity, req);
    await c.audit(identity, req, 'booking.offering.updated', id, { version: nextVersion });
    return engine.offeringView(result);
  });
}

/** A closure is real resource unavailability; it cannot erase an existing allocation. */
export async function createClosure(engine: BookingEngine, identity: Identity, id: string, input: Doc, key?: string) {
  requireManager(identity);
  const c = engine.managementContext();
  return c.command(identity, key, `resource.${id}.closure`, input, async (req: any) => {
    const doc = await c.own('resources', id, identity, req);
    const nextVersion = version(doc, input);
    if (input.removeId !== undefined) {
      const closures = doc.nexg?.closures ?? [];
      if (typeof input.removeId !== 'string' || !closures.some((closure: Doc) => closure.id === input.removeId)) throw new BookingError(404, 'This closure was not found.', 'not_found');
      const result = await c.update('resources', doc.id, { nexg: { ...doc.nexg, version: nextVersion, closures: closures.filter((closure: Doc) => closure.id !== input.removeId) } }, identity, req);
      await c.audit(identity, req, 'booking.resource.closure_removed', id, { closureId: input.removeId, version: nextVersion });
      return engine.resourceView(result);
    }
    const startTime = exactInstant(input.startTime), endTime = exactInstant(input.endTime);
    if (Date.parse(endTime) <= Date.parse(startTime)) throw new BookingError(422, 'Closure end must follow its start.', 'invalid_interval');
    const reason = label(input.reason, 'Closure reason', 300);
    const conflicts = (await c.all('reservations', identity, req)).some((d: Doc) => matchesResource(d, id, doc.id) && hasLiveAllocation(d, c.now()) && Date.parse(d.startTime) < Date.parse(endTime) && (d.nexg?.custodyState === 'in_use' || d.nexg?.workState === 'in_use' || Date.parse(d.endTime) > Date.parse(startTime)));
    if (conflicts) throw new BookingError(409, 'This closure overlaps an accepted booking. Resolve that booking before closing the resource.', 'closure_conflict');
    const existing = doc.nexg?.closures ?? [];
    if (existing.length >= 500) throw new BookingError(422, 'Archive old closure records before adding more.', 'closure_limit');
    const closure = { id: randomUUID(), startTime, endTime, reason, recordedBy: identity.userId };
    const result = await c.update('resources', doc.id, { nexg: { ...doc.nexg, version: nextVersion, closures: [...existing, closure] } }, identity, req);
    await c.audit(identity, req, 'booking.resource.closed', id, { ...closure, version: nextVersion });
    return engine.resourceView(result);
  });
}
