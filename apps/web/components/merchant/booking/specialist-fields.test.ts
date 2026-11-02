import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { specialistBookingFromForm } from './specialist-fields';

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}
describe('typed specialist intake', () => {
  it('keeps a queued service job separate from its requested completion date', () => {
    const value = specialistBookingFromForm(
      {
        model: 'SERVICE_JOB',
        version: 1,
        jobSchedulingMode: 'queue',
        assessmentMode: 'fixed_scope',
        durationMinutes: 45,
        partsRequired: false,
        custodyMode: 'customer_retains',
        custodyDurationMinutes: 0,
      },
      form({ spJobDescription: 'Exterior wash and vacuum', spJobCompletion: '2026-11-02T17:00' }),
    );
    assert.equal(value.model, 'SERVICE_JOB');
    if (value.model !== 'SERVICE_JOB') return;
    assert.equal(value.requestedInterval, undefined);
    assert.equal(value.completionPromise, '2026-11-02T14:00:00.000Z');
  });
  it('records only incoming work when processing and return require assessment', () => {
    const value = specialistBookingFromForm(
      {
        model: 'LINKED_WINDOWS',
        version: 1,
        promiseMode: 'ASSESSMENT_REQUIRED',
        incomingMethod: 'CUSTOMER_DROPOFF',
        outgoingMethod: 'CUSTOMER_COLLECTION',
        processingUnit: 'kg',
        quantityScale: 2,
        minimumProcessingMinutes: 60,
        maximumProcessingMinutes: 1440,
        calendarBasis: 'elapsed',
        workingDays: [1, 2, 3, 4, 5],
        opens: '08:00',
        closes: '18:00',
      },
      form({ spIncomingStart: '2026-11-02T08:00', spIncomingEnd: '2026-11-02T09:00' }),
    );
    assert.equal(value.model, 'LINKED_WINDOWS');
    assert.equal('processing' in value, false);
    assert.equal('outgoing' in value, false);
    assert.equal('workload' in value, false);
  });
  it('keeps independent cargo dimensions and actual route windows', () => {
    const value = specialistBookingFromForm(
      {
        model: 'FREIGHT',
        version: 1,
        legs: [
          {
            id: 'nairobi-mombasa',
            origin: 'Nairobi',
            destination: 'Mombasa',
            dimensions: [
              { unit: 'kg', scale: 2 },
              { unit: 'cbm', scale: 2 },
            ],
          },
        ],
        requiresDocuments: true,
        requiresClearance: false,
        finalMode: 'delivery',
      },
      form({
        spCargoDescription: 'Boxed equipment',
        spPieces: '2',
        'spCargo:kg': '12.50',
        'spCargo:cbm': '0.75',
        'spLeg:nairobi-mombasaStart': '2026-11-02T08:00',
        'spLeg:nairobi-mombasaEnd': '2026-11-02T18:00',
      }),
    );
    assert.equal(value.model, 'FREIGHT');
    if (value.model !== 'FREIGHT') return;
    assert.deepEqual(value.cargo, [
      { quantityMinor: 1250, unit: 'kg', scale: 2 },
      { quantityMinor: 75, unit: 'cbm', scale: 2 },
    ]);
    assert.equal(value.legs[0]?.id, 'nairobi-mombasa');
    assert.equal(value.legs[0]?.startTime, '2026-11-02T05:00:00.000Z');
  });
});
