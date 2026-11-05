import { describe, expect, it } from 'vitest';
import { availabilityConflict, confirmFlight, initialAviationState } from './model';

describe('Heliflight demo booking commitments', () => {
  it('keeps payment separate from booking confirmation', () => {
    const state = initialAviationState();
    const flight = state.flights.find((f) => f.id === 'HF-1044')!;
    flight.payment = 'paid';
    expect(confirmFlight(state, flight.id).error).toMatch(/acceptance/);
    expect(flight.stage).toBe('quoted');
  });

  it('rejects confirmation without written operator approval', () => {
    const state = initialAviationState();
    expect(confirmFlight(state, 'HF-1043').error).toMatch(/operator confirmation/);
  });

  it('allows the booking own hold and replaces it with a confirmed commitment', () => {
    const state = initialAviationState();
    state.flights.find((f) => f.id === 'HF-1043')!.operatorApproved = true;
    const result = confirmFlight(state, 'HF-1043');
    expect(result.error).toBeUndefined();
    expect(result.state.flights.find((f) => f.id === 'HF-1043')).toMatchObject({
      stage: 'confirmed',
      payment: 'unpaid',
    });
    expect(result.state.blocks.some((b) => b.flightId === 'HF-1043')).toBe(false);
  });

  it('blocks a second booking over the same aircraft commitment', () => {
    const state = initialAviationState();
    const flight = state.flights.find((f) => f.id === 'HF-1043')!;
    flight.quote.aircraftId = 'as350-white-blue';
    flight.quote.passengers = 4;
    flight.quote.time = '09:00';
    flight.operatorApproved = true;
    expect(confirmFlight(state, flight.id).error).toMatch(/HF-1042/);
    expect(state.flights.find((f) => f.id === flight.id)!.stage).toBe('accepted');
  });

  it('treats adjacent intervals as available and maintenance as unavailable', () => {
    const state = initialAviationState();
    expect(
      availabilityConflict(state, 'as350-white-blue', '2026-11-05', '10:20', '11:20'),
    ).toBeNull();
    expect(availabilityConflict(state, 'as350-dark-grey', '2026-11-05', '10:20', '11:20')).toBe(
      'Scheduled maintenance',
    );
  });

  it('does not confirm a trip outside the supported calendar day', () => {
    const state = initialAviationState();
    const flight = state.flights.find(f => f.id === 'HF-1043')!;
    flight.operatorApproved = true;
    flight.quote.time = '23:00';
    expect(confirmFlight(state, flight.id).error).toMatch(/07:00 and 19:00/);
    expect(flight.stage).toBe('accepted');
  });
});
