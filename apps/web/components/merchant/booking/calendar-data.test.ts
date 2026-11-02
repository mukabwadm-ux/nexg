import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { bookingCalendarSegments } from './calendar-data';
import { overlapsDay } from './format';
import type { BookingRecord } from './types';

const work: BookingRecord = {
  id: 'parent-work',
  offeringId: 'laundry',
  offeringName: 'Laundry with return',
  model: 'LINKED_WINDOWS',
  resourceIds: ['collection-vehicle', 'processing-pool', 'return-vehicle'],
  startTime: '2026-11-01T08:00:00+03:00',
  endTime: '2026-11-07T18:00:00+03:00',
  quantity: 3,
  customer: { name: 'Test customer' },
  status: 'confirmed',
  version: 4,
  priceMinor: 100000,
  currency: 'KES',
  executionMode: 'native_workflow',
  specialist: {
    model: 'LINKED_WINDOWS',
    state: 'COLLECTION_CONFIRMED',
    summary: 'Actual role commitments',
    details: {},
    availableCommands: [],
    allocations: [
      {
        id: 'incoming-claim',
        role: 'incoming',
        resourceIds: ['collection-vehicle'],
        startTime: '2026-11-01T08:00:00+03:00',
        endTime: '2026-11-01T09:00:00+03:00',
        status: 'confirmed',
      },
      {
        id: 'processing-claim',
        role: 'processing',
        resourceIds: ['processing-pool'],
        startTime: '2026-11-02T10:00:00+03:00',
        endTime: '2026-11-02T13:00:00+03:00',
        status: 'confirmed',
      },
      {
        id: 'outgoing-claim',
        role: 'outgoing',
        resourceIds: ['return-vehicle'],
        startTime: '2026-11-07T17:00:00+03:00',
        endTime: '2026-11-07T18:00:00+03:00',
        status: 'confirmed',
      },
    ],
  },
};

describe('calendar capacity from committed specialist roles', () => {
  it('reserves a service bay for actual work rather than until the requested collection date', () => {
    const job: BookingRecord = {
      ...work,
      model: 'SERVICE_JOB',
      quantity: 1,
      specialist: {
        ...work.specialist!,
        model: 'SERVICE_JOB',
        allocations: [
          {
            id: 'wash-bay-use',
            role: 'job_work',
            resourceIds: ['wash-bay'],
            startTime: '2026-11-01T08:00:00+03:00',
            endTime: '2026-11-01T08:45:00+03:00',
            status: 'confirmed',
          },
        ],
      },
    };
    const entries = bookingCalendarSegments(job);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.endTime, '2026-11-01T08:45:00+03:00');
    assert.equal(
      entries.some((entry) => overlapsDay(entry, '2026-11-02')),
      false,
    );
  });
  it('leaves the gap between incoming, processing and outgoing steps free', () => {
    const entries = bookingCalendarSegments(work);
    assert.equal(
      entries.some((entry) => overlapsDay(entry, '2026-11-04')),
      false,
    );
    assert.equal(entries.filter((entry) => overlapsDay(entry, '2026-11-02')).length, 1);
    assert.deepEqual(entries[0]?.resourceIds, ['collection-vehicle']);
    assert.deepEqual(entries[2]?.resourceIds, ['return-vehicle']);
  });
  it('retains the parent work reference and party quantity instead of inventing per-person resource claims', () => {
    const shared = {
      ...work,
      model: 'TOUR' as const,
      specialist: {
        ...work.specialist!,
        model: 'TOUR' as const,
        allocations: [
          {
            id: 'shared-departure',
            role: 'tour_departure',
            resourceIds: ['dated-place-pool'],
            startTime: work.startTime!,
            endTime: work.endTime!,
            status: 'confirmed',
          },
        ],
      },
    };
    const entries = bookingCalendarSegments(shared);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.id, work.id);
    assert.equal(entries[0]?.quantity, 3);
    assert.equal(entries[0]?.calendarSegmentId, 'shared-departure');
    assert.equal(work.offeringName, 'Laundry with return');
  });
  it('does not paint uncommitted scope, entitlement validity or released cancellation as busy', () => {
    assert.deepEqual(
      bookingCalendarSegments({ ...work, specialist: { ...work.specialist!, allocations: [] } }),
      [],
    );
    assert.deepEqual(
      bookingCalendarSegments({
        ...work,
        model: 'ENTITLEMENT',
        specialist: { ...work.specialist!, model: 'ENTITLEMENT', allocations: [] },
      }),
      [],
    );
    assert.deepEqual(bookingCalendarSegments({ ...work, status: 'cancelled' }), []);
    assert.deepEqual(
      bookingCalendarSegments({
        ...work,
        specialist: {
          ...work.specialist!,
          allocations: work.specialist!.allocations.map((allocation) => ({
            ...allocation,
            status: 'cancelled',
          })),
        },
      }),
      [],
    );
  });
});
