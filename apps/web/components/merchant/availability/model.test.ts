import offeringsConfig from '@/components/merchant/offerings/config.json';
import { SUBCATEGORY_VARIANTS } from '@nexg/booking-config/variants';

/** The audited 128 specialties plus the subcategory variants. */
const PROFILE_COUNT = 128 + SUBCATEGORY_VARIANTS.length;
/** The audited 193 profile/model bindings plus each variant's copy of its base's models. */
const BINDING_COUNT =
  193 +
  SUBCATEGORY_VARIANTS.reduce(
    (n, v) => n + offeringsConfig.profiles.find((p) => p.id === v.baseSubcategoryId)!.models.length,
    0,
  );

import { describe, expect, it } from 'vitest';
import { calendarItems, timeGridSegments, type CalendarItem } from './calendar';
import { availableSchemas, extendOfferingProfiles, seedCatalogue } from '../offerings/model';
import { schemas } from '../offerings/schemas';
import {
  DEMO_NOW,
  applyProposal,
  evaluate,
  fitsHours,
  normalHours,
  poolUsage,
  previewImpact,
  profiles,
  resolveView,
  seedSnapshot,
  validateHours,
  type Context,
  type Proposal,
} from './model';
import {
  importHours,
  localAvailabilitySource,
  scheduleCsv,
  storageKey,
  type StorageLike,
} from './source';

function context(id = 'restaurant', schema?: string): Context {
  const p = profiles.find((p) => p.id === id)!;
  const catalogue = seedCatalogue(schema ? { ...p, schema } : p);
  const offering = {
    ...catalogue.offerings[0]!,
    publication: 'published' as const,
    priceMode: 'fixed' as const,
  };
  return {
    profile: p,
    offering,
    location: 'Westlands',
    method: offering.fulfilmentMethods?.[0] ?? 'Merchant location',
    scenario: 'current',
    role: 'manager',
  };
}
function memory() {
  const data = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
  return { data, storage, source: localAvailabilitySource(storage) };
}
const change = (extra: Partial<Proposal> = {}): Proposal => ({
  id: 'op-1',
  kind: 'hours',
  title: 'Reviewed hours',
  reason: 'Changed operating schedule',
  hours: normalHours(),
  ...extra,
});
describe('Availability merchant decisions', () => {
  it('resolves every default and explicitly configured candidate without enabling unrelated models', () => {
    const rendered: string[] = [];
    for (const p of profiles)
      for (const schema of availableSchemas(p)) {
        const c = context(p.id, schema),
          view = resolveView(p, c.offering, [schema]);
        expect(view.model).toBe(schemas[schema]!.model);
        expect(p.models.includes(view.model)).toBe(true);
        rendered.push(p.id + ':' + view.model);
      }
    expect(new Set(rendered.map((x) => x.split(':')[0])).size).toBe(PROFILE_COUNT);
    expect(new Set(rendered).size).toBe(BINDING_COUNT);
    const c = context('restaurant', 'SPACE_RESERVATION_V1');
    expect(() => resolveView(c.profile, c.offering, ['PRODUCT_CATALOG_V1'])).toThrow(
      'Availability setup unresolved',
    );
  });
  it('reuses registered behaviour for a new category and rejects an unknown editor', () => {
    const base = profiles.find((p) => p.id === 'makeup')!;
    const p = { ...base, id: 'new-specialty', name: 'New service' };
    const registered = extendOfferingProfiles([p]).find((x) => x.id === 'new-specialty')!;
    const o = seedCatalogue(registered).offerings[0]!;
    expect(resolveView(registered, o, [o.schemaId]).renderer).toBe('calendar');
    expect(() => extendOfferingProfiles([{ ...p, schema: 'UNKNOWN' }])).toThrow(
      'Register the new editor',
    );
  });
  it('validates split and overnight hours across the weekly boundary', () => {
    const h = normalHours();
    h[6]!.intervals = [{ start: '22:00', end: '02:00', nextDay: true }];
    h[0]!.intervals = [{ start: '01:00', end: '08:00', nextDay: false }];
    expect(validateHours(h)).toEqual([
      'Intervals overlap, including an adjacent overnight period.',
    ]);
    h[0]!.intervals = [{ start: '08:00', end: '17:00', nextDay: false }];
    expect(fitsHours(h, '2026-11-02T00:30', '2026-11-02T01:30')).toBe(true);
    expect(fitsHours(h, '2026-11-02T02:00', '2026-11-02T03:00')).toBe(false);
  });
  it('can accept configured future orders while doors are closed now and keeps stock separate', () => {
    const c = { ...context(), method: 'Delivery' },
      s = seedSnapshot(c);
    s.hours[1]!.state = 'closed';
    const q = { start: '2026-11-04T15:00', end: '2026-11-04T16:00', quantity: 1, resourceIds: [] };
    expect(evaluate(s, c, q).state).toBe('available');
    expect(evaluate(s, { ...c, offering: { ...c.offering, stock: 0 } }, q).reasons).toEqual([
      'Requested quantity exceeds source-confirmed stock.',
    ]);
  });
  it('pauses only the selected intake method without deleting commitments or holds', () => {
    const c = context(),
      s = seedSnapshot(c);
    s.pauses = [];
    const p = change({
      kind: 'pause',
      method: 'Delivery',
      start: DEMO_NOW,
      end: '2026-11-03T18:00',
    });
    const next = applyProposal(s, p, c);
    const q = { start: '2026-11-03T15:00', end: '2026-11-03T16:00', quantity: 1, resourceIds: [] };
    expect(evaluate(next, { ...c, method: 'Delivery' }, q).state).toBe('unavailable');
    expect(evaluate(next, c, q).state).toBe('available');
    expect(next.events).toEqual(s.events);
  });
  it('retains unknown source semantics and does not shorten a service to fit a slot', () => {
    const c = context('makeup'),
      s = seedSnapshot(c),
      q = {
        start: '2026-11-03T15:00',
        end: '2026-11-03T15:15',
        quantity: 1,
        resourceIds: [s.resources[0]!.id],
      };
    expect(evaluate(s, { ...c, scenario: 'stale' }, q).state).toBe('unknown');
    expect(evaluate(s, c, q).reasons).toEqual([
      'The exact configured service duration must fit; it cannot be shortened to a slot step.',
    ]);
  });
  it('keeps a hidden required room constraint and an ongoing rental return blocking', () => {
    const c = context('makeup'),
      s = seedSnapshot(c),
      room = s.resources.find((r) => r.kind === 'Existing booking resource')!;
    s.events.push({
      id: 'room-busy',
      workId: 'ROOM-2',
      title: 'Other work',
      customer: 'Sample',
      resources: [room.id],
      start: '2026-11-03T15:00',
      end: '2026-11-03T16:00',
      status: 'confirmed',
    });
    const r = evaluate(s, c, {
      start: '2026-11-03T15:00',
      end: '2026-11-03T16:00',
      quantity: 1,
      resourceIds: [s.resources[0]!.id, room.id],
    });
    expect(r.state).toBe('unavailable');
    expect(r.reasons).toEqual(['ROOM-2 blocks Treatment Room 1.']);
    const rental = context('self_drive'),
      rs = seedSnapshot(rental);
    expect(
      evaluate(rs, rental, {
        start: '2026-11-04T10:00',
        end: '2026-11-04T18:00',
        quantity: 1,
        resourceIds: [rs.resources[0]!.id],
      }).reasons[0],
    ).toContain('until actual return is recorded');
  });
  it('maintains one capacity snapshot and rejects a reduction below held plus reserved', () => {
    const c = context('classes'),
      s = seedSnapshot(c),
      pool = s.pools[0]!;
    expect(poolUsage(s, pool.id)).toEqual({ total: 12, held: 2, reserved: 7, remaining: 3 });
    const p = change({ kind: 'capacity', poolId: pool.id, unit: pool.unit, quantity: 8 });
    expect(previewImpact(s, p, c).errors[0]).toBe(
      'Capacity cannot be lower than confirmed and valid held obligations.',
    );
    expect(s.pools[0]!.total).toBe(12);
  });
  it('does not release a hold from a timer, then persists owner-confirmed expiry once', async () => {
    const { source } = memory(),
      c = context('classes');
    await source.setClock(c, '2026-11-03T09:45');
    expect(poolUsage(await source.load(c), 'places').held).toBe(2);
    await source.refresh(c, true);
    expect(poolUsage(await source.load(c), 'places')).toEqual({
      total: 12,
      held: 0,
      reserved: 7,
      remaining: 5,
    });
    await source.refresh(c, true);
    expect((await source.load(c)).history).toHaveLength(1);
  });
  it('blocks a maintenance conflict and permits it only after the same Work record is reassigned', async () => {
    const { source } = memory(),
      c = context('self_drive'),
      s = await source.load(c);
    const p = change({
      kind: 'block',
      start: '2026-11-04T08:00',
      end: '2026-11-05T18:00',
      resourceIds: [s.resources[0]!.id],
    });
    expect(previewImpact(s, p, c).affected.map((e) => e.workId)).toEqual(['RNT-2070', 'BK-2071']);
    await source.saveDraft(c, p);
    await source.resolveWork(c, 'RNT-2070', 'return', {}, s.revision);
    expect((await source.draft(c))?.id).toBe(p.id);
    const next = await source.load(c);
    await source.resolveWork(
      c,
      'BK-2071',
      'reassign',
      { resourceId: next.resources[2]!.id },
      next.revision,
    );
    const ready = await source.load(c);
    expect((await source.draft(c))?.id).toBe(p.id);
    expect(previewImpact(ready, p, c).errors).toEqual([]);
    await source.apply(c, p, ready.revision);
    expect((await source.load(c)).events.find((e) => e.id === 'op-1:0')?.status).toBe('block');
  });
  it('rejects concurrent revisions and reconciles an unknown result without duplicating changes', async () => {
    const { source, storage } = memory(),
      c = context(),
      other = localAvailabilitySource(storage),
      p = change();
    const first = await source.load(c);
    const op = await source.apply(c, p, first.revision, 'unknown');
    expect(op.state).toBe('pending');
    expect((await other.load(c)).revision).toBe(0);
    expect((await other.reconcile(c, p.id)).state).toBe('applied');
    expect((await source.reconcile(c, p.id)).state).toBe('applied');
    const actual = await source.load(c);
    expect(actual.history.map((x) => x.title)).toEqual(['Reviewed hours']);
    await expect(other.apply(c, change({ id: 'op-2' }), first.revision)).rejects.toThrow(
      'changed in another tab',
    );
  });
  it('keeps drafts per profile/location and does not claim success when storage fails', async () => {
    const { source, storage } = memory(),
      c = context(),
      p = change();
    await source.saveDraft(c, p);
    expect((await source.draft(c))?.title).toBe('Reviewed hours');
    expect(await source.draft({ ...c, location: 'Kilimani' })).toBe(null);
    const denied = localAvailabilitySource({
      ...storage,
      setItem: () => {
        throw new Error('Quota');
      },
    });
    await expect(denied.apply(c, p, 0)).rejects.toThrow('could not be saved locally');
    expect((await source.load(c)).history).toEqual([]);
    expect((await source.draft(c))?.title).toBe('Reviewed hours');
    storage.setItem(storageKey(c.profile.id), '{}');
    await expect(source.load(c)).rejects.toThrow('saved Availability preview could not be read');
  });
  it('copies schedules only to explicit targets and reports target conflicts', async () => {
    const { source } = memory(),
      c = context('makeup'),
      s = await source.load(c);
    const h = normalHours();
    h[1]!.state = 'closed';
    const p = change({ hours: h, targets: ['Westlands', 'Kilimani'] });
    const impact = previewImpact(s, p, c);
    expect(impact.affected.map((e) => e.workId)).toEqual([
      'BK-1048',
      'BK-1051',
      'BK-1042',
      'BREAK-1',
    ]);
    await expect(source.apply(c, p, 0)).rejects.toThrow('Existing commitments are retained');
  });
  it('roundtrips split hours through CSV and rejects a missing day', () => {
    const s = seedSnapshot(context()),
      read = importHours(scheduleCsv(s));
    expect(read.errors).toEqual([]);
    expect(read.hours).toEqual(s.hours);
    const bad = importHours('sample_day,state,start,end,ends_next_day\n0,closed,,,false');
    expect(bad.errors).toEqual(['Include all seven weekdays; missing is not the same as closed.']);
  });
  it('does not treat a quote or membership as reserved service capacity', () => {
    const c = context('private_events'),
      s = seedSnapshot(c);
    expect(
      evaluate(s, c, {
        start: '2026-11-04T15:00',
        end: '2026-11-04T16:00',
        quantity: 1,
        resourceIds: [],
      }).state,
    ).toBe('request-only');
  });
});

describe('Availability specialty variants and accepted terms', () => {
  it('uses a greeter without inventing a vehicle and requires a declared rental driver', () => {
    const c = context('meet_greet'),
      s = seedSnapshot(c);
    expect(s.resources.map((r) => r.kind)).toEqual(['Greeter']);
    expect(
      evaluate(s, c, {
        start: '2026-11-04T10:00',
        end: '2026-11-04T11:30',
        quantity: 1,
        resourceIds: [s.resources[0]!.id],
      }).state,
    ).toBe('available');
    const rental = context('self_drive');
    rental.offering.fields.driver_mode = 'Qualified driver included';
    const rs = seedSnapshot(rental);
    expect(
      evaluate(rs, rental, {
        start: '2026-11-04T10:00',
        end: '2026-11-04T18:00',
        quantity: 1,
        resourceIds: [rs.resources[2]!.id],
      }).reasons,
    ).toEqual(['Include the actual driver resource in this joint allocation.']);
  });
  it('switches an explicitly private tour to role scheduling with no invented place pool', () => {
    const id = profiles.find((p) => p.models.includes('TOUR'))!.id,
      c = context(id, 'TOUR_PACKAGE_V1');
    c.offering.fields.departure_mode = 'Private itinerary';
    c.offering.fields.tour_transport_mode = 'No transport included';
    expect(resolveView(c.profile, c.offering, [c.offering.schemaId]).renderer).toBe('roles');
    expect(seedSnapshot(c).pools).toEqual([]);
    expect(seedSnapshot(c).resources.map((r) => r.kind)).toEqual(['Guide']);
  });
  it('preserves incoming, processing and outgoing roles without transport on drop-off', () => {
    const c = { ...context('laundry'), method: 'Customer drop-off and pickup' },
      s = seedSnapshot(c);
    expect(s.resources).toEqual([]);
    expect(s.events.map((e) => e.role)).toEqual([
      'Processing',
      'Customer drop-off',
      'Customer pickup',
    ]);
    expect(new Set(s.events.map((e) => e.id)).size).toBe(3);
  });
  it('supports special date hours independently of the repeating schedule', () => {
    const c = context(),
      s = seedSnapshot(c),
      h = normalHours();
    s.pauses = [];
    h[2]!.intervals = [{ start: '14:00', end: '18:00', nextDay: false }];
    const next = applyProposal(s, change({ kind: 'date-hours', date: '2026-11-04', hours: h }), c);
    expect(
      evaluate(next, c, {
        start: '2026-11-04T10:00',
        end: '2026-11-04T11:00',
        quantity: 1,
        resourceIds: [],
      }).state,
    ).toBe('unavailable');
    expect(
      evaluate(next, c, {
        start: '2026-11-11T10:00',
        end: '2026-11-11T11:00',
        quantity: 1,
        resourceIds: [],
      }).state,
    ).toBe('available');
  });
  it('uses the selected optional fee policy for a new hold, not a universal fixed fee', () => {
    const c = context('makeup'),
      s = seedSnapshot(c),
      q = {
        start: '2026-11-03T15:00',
        end: '2026-11-03T16:00',
        quantity: 1,
        resourceIds: [s.resources[0]!.id],
      };
    const p = change({
      kind: 'hold',
      start: q.start,
      end: q.end,
      request: q,
      resourceIds: q.resourceIds,
    });
    const noFee = applyProposal(s, p, c).events.find((e) => e.id === 'op-1')!;
    expect({ id: noFee.workId, status: noFee.status, fee: noFee.fee }).toEqual({
      id: 'HOLD-op-1',
      status: 'held',
      fee: undefined,
    });
    c.offering.reservationFee = { mode: 'percentage', amount: '10', creditToTotal: true };
    const withFee = applyProposal(s, p, c).events.find((e) => e.id === 'op-1')!;
    expect(withFee.fee).toEqual({ amount: 350, state: 'awaiting' });
  });
});

describe('Availability future schedules and capacity intervals', () => {
  it('applies a future weekly schedule only from its effective date', () => {
    const c = context(),
      s = seedSnapshot(c);
    s.pauses = [];
    const h = normalHours();
    h[2]!.state = 'closed';
    const next = applyProposal(s, change({ effectiveFrom: '2026-11-09', hours: h }), c);
    const q = { quantity: 1, resourceIds: [] };
    expect(
      evaluate(next, c, { ...q, start: '2026-11-04T15:00', end: '2026-11-04T16:00' }).state,
    ).toBe('available');
    expect(
      evaluate(next, c, { ...q, start: '2026-11-11T15:00', end: '2026-11-11T16:00' }).state,
    ).toBe('unavailable');
  });
  it('does not sum non-overlapping occupancy as simultaneous usage', () => {
    const c = context('classes'),
      s = seedSnapshot(c);
    s.events = s.events.filter((e) => e.status === 'confirmed');
    s.events.push({
      ...s.events.find((e) => e.poolId === 'places')!,
      id: 'next-day',
      start: '2026-11-08T10:00',
      end: '2026-11-08T11:00',
      quantity: 10,
    });
    expect(poolUsage(s, 'places')).toEqual({ total: 12, held: 0, reserved: 10, remaining: 2 });
  });
  it('does not overwrite a newer revision when an older unknown result is reconciled', async () => {
    const { source } = memory(),
      c = context();
    const old = change({ id: 'older' });
    await source.apply(c, old, 0, 'unknown');
    await source.apply(c, change({ id: 'newer' }), 0);
    expect((await source.reconcile(c, 'older')).state).toBe('rejected');
    expect((await source.load(c)).history.map((h) => h.operationId)).toEqual(['newer']);
  });
});

describe('Availability series and linked work changes', () => {
  it('edits future series blocks without conflicting with itself and preserves earlier blocks', () => {
    const c = context(),
      s = seedSnapshot(c),
      p = change({
        kind: 'block',
        start: '2026-11-04T15:00',
        end: '2026-11-04T16:00',
        recurrence: { everyDays: 7, count: 3 },
      });
    const first = applyProposal(s, p, c);
    const edit = change({
      id: 'edit-series',
      kind: 'block',
      eventId: 'op-1:1',
      affectScope: 'future',
      start: '2026-11-11T15:30',
      end: '2026-11-11T16:30',
    });
    expect(previewImpact(first, edit, c).errors).toEqual([]);
    const updated = applyProposal(first, edit, c);
    expect(updated.events.filter((e) => e.seriesId === 'op-1').map((e) => e.start)).toEqual([
      '2026-11-04T12:00:00.000Z',
      '2026-11-11T12:30:00.000Z',
      '2026-11-18T12:30:00.000Z',
    ]);
    const removed = applyProposal(
      updated,
      change({
        id: 'remove-series',
        kind: 'remove',
        eventId: 'edit-series:0',
        affectScope: 'future',
      }),
      c,
    );
    expect(removed.events.filter((e) => e.seriesId === 'op-1').map((e) => e.start)).toEqual([
      '2026-11-04T12:00:00.000Z',
    ]);
  });
  it('never displays a queue job as a reserved bay or time slot', () => {
    const c = context('car_wash'),
      s = seedSnapshot(c);
    expect(s.events.map((e) => ({ status: e.status, resources: e.resources }))).toEqual([
      { status: 'tentative', resources: [] },
      { status: 'tentative', resources: [] },
    ]);
  });
  it('moves all linked roles and keeps the accepted processing duration', async () => {
    const { source } = memory(),
      c = context('laundry'),
      s = await source.load(c);
    const next = await source.resolveWork(
      c,
      'BK-1080',
      'reschedule',
      { start: '2026-11-04T10:00', end: '2026-11-05T10:00' },
      s.revision,
    );
    expect(
      next.events
        .filter((e) => e.workId === 'BK-1080')
        .map((e) => ({ role: e.role, start: e.start, end: e.end })),
    ).toEqual([
      { role: 'Processing', start: '2026-11-04T07:00:00.000Z', end: '2026-11-05T07:00:00.000Z' },
      { role: 'Collection', start: '2026-11-04T06:00:00.000Z', end: '2026-11-04T07:00:00.000Z' },
      { role: 'Return', start: '2026-11-05T07:00:00.000Z', end: '2026-11-05T08:00:00.000Z' },
    ]);
  });
  it('rejects fractional participant capacity', () => {
    const c = context('classes'),
      s = seedSnapshot(c);
    expect(
      previewImpact(
        s,
        change({ kind: 'capacity', poolId: 'places', unit: 'people', quantity: 12.5 }),
        c,
      ).errors,
    ).toContain('Participant capacity must be a whole number.');
  });
});

describe('Calendar decisions and accepted resource terms', () => {
  it('keeps a session resource reserved when all participant reservations are removed', () => {
    const c = context('classes'),
      s = seedSnapshot(c),
      o = s.occurrences[0]!;
    s.events = s.events.filter((e) => e.role === 'Session anchor');
    const attendee = {
      start: o.start,
      end: o.end,
      quantity: 1,
      poolId: o.poolId,
      resourceIds: o.resources,
    };
    expect(evaluate(s, c, attendee).state).toBe('available');
    const unrelated = context('makeup');
    unrelated.offering = {
      ...unrelated.offering,
      fields: { ...unrelated.offering.fields, duration_minutes: '60' },
    };
    expect(
      evaluate(s, unrelated, {
        ...attendee,
        poolId: undefined,
        end: o.start.slice(0, 10) + 'T11:00',
      }).state,
    ).toBe('unavailable');
    expect(
      calendarItems(s, c, resolveView(c.profile, c.offering, [c.offering.schemaId])),
    ).toHaveLength(1);
  });
  it('shows production work on the actual due date instead of creating a service appointment', () => {
    const c = context('cakes'),
      s = seedSnapshot(c),
      view = resolveView(c.profile, c.offering, [c.offering.schemaId]);
    const record = s.events.find((e) => e.status === 'confirmed')!;
    const due = calendarItems(s, c, view).find((i) => i.event?.id === record.id)!;
    expect(due.milestone).toBe(true);
    expect(due.start).toBe(record.end);
    expect(due.title).toContain('Due');
  });
  it('packs overlapping bookings separately and clips overnight continuation to its real end', () => {
    const item = (id: string, start: string, end: string): CalendarItem => ({
      id,
      title: id,
      start,
      end,
      status: 'confirmed',
      label: '',
      resources: [],
    });
    const day = '2026-11-04';
    const layout = timeGridSegments(
      [
        item('overnight', '2026-11-03T22:00', day + 'T09:00'),
        item('overlap', day + 'T08:30', day + 'T10:00'),
        item('later', day + 'T11:00', day + 'T12:00'),
      ],
      day,
      8,
      18,
    );
    expect(layout.find((x) => x.item.id === 'overnight')).toMatchObject({
      top: 0,
      height: 10,
      lanes: 2,
      lane: 0,
    });
    expect(layout.find((x) => x.item.id === 'overlap')).toMatchObject({
      top: 5,
      height: 15,
      lanes: 2,
      lane: 1,
    });
    expect(layout.find((x) => x.item.id === 'later')).toMatchObject({
      top: 30,
      height: 10,
      lanes: 1,
      lane: 0,
    });
    expect(timeGridSegments([item('outside', day + 'T21:00', day + 'T22:00')], day, 8, 18)).toEqual(
      [],
    );
  });
  it('does not shorten accepted turnover when the offering is edited later', () => {
    const c = context('makeup'),
      s = seedSnapshot(c);
    s.events = s.events.filter((e) => e.workId === 'BK-1048');
    s.events[0]!.afterMinutes = 30;
    const updated = {
      ...c,
      offering: { ...c.offering, fields: { ...c.offering.fields, after_buffer_minutes: '0' } },
    };
    const q = {
      start: '2026-11-03T11:15',
      end: '2026-11-03T12:15',
      quantity: 1,
      resourceIds: s.events[0]!.resources,
    };
    expect(evaluate(s, updated, q).state).toBe('unavailable');
    expect(
      evaluate(s, updated, { ...q, start: '2026-11-03T11:30', end: '2026-11-03T12:30' }).state,
    ).toBe('available');
  });
});
