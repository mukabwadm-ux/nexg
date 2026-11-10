import { describe, expect, it } from 'vitest';

import { failureCopy, failureKind } from './payment-outcome';

describe('payment outcomes', () => {
  it('reads Safaricom result descriptions', () => {
    expect(failureKind('Request cancelled by user')).toBe('cancelled');
    expect(failureKind('Request Cancelled by user.')).toBe('cancelled');
    expect(failureKind('DS timeout user cannot be reached')).toBe('timeout');
    expect(failureKind('The balance is insufficient for the transaction.')).toBe('insufficient');
    expect(failureKind('The initiator information is invalid.')).toBe('wrong_pin');
    expect(
      failureKind(
        'Unable to lock subscriber, a transaction is already in process for the current subscriber',
      ),
    ).toBe('busy');
    expect(failureKind('Transaction has expired')).toBe('timeout');
  });

  it('reads bank and card reasons', () => {
    expect(failureKind('The customer cancelled at the bank.')).toBe('cancelled');
    expect(failureKind('The bank declined the payment: insufficient funds.')).toBe('insufficient');
    expect(failureKind('The bank declined the payment: the account is blocked.')).toBe('declined');
    expect(failureKind('Declined')).toBe('declined');
    expect(failureKind('abandoned')).toBe('cancelled');
  });

  it('falls back to a plain explanation', () => {
    expect(failureKind(null)).toBe('unknown');
    expect(failureKind('Something odd happened')).toBe('unknown');
    expect(failureCopy('unknown', 'KES 1,360').title).toBe('That did not go through');
  });

  it('always says nothing was charged, and names the amount where it helps', () => {
    for (const kind of [
      'cancelled',
      'timeout',
      'insufficient',
      'wrong_pin',
      'declined',
      'unknown',
    ] as const) {
      expect(failureCopy(kind, 'KES 1,360').message).toMatch(/nothing was charged/i);
    }
    expect(failureCopy('insufficient', 'KES 1,360').message).toContain('KES 1,360');
    expect(failureCopy('cancelled', 'KES 1,360').title).toBe('Payment cancelled');
  });
});
