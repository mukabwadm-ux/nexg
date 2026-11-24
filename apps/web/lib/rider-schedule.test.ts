import { describe, expect, it } from 'vitest';

import { paidAutomatically, payoutTerms, payoutWhen } from './rider-schedule';

describe('how a rider is paid, in words', () => {
  it('says the payout run until Finance picks a schedule', () => {
    expect(payoutWhen(undefined)).toBe('in the weekly payout run');
    expect(payoutWhen({ mode: 'run' })).toBe('in the weekly payout run');
    expect(paidAutomatically({ mode: 'run' })).toBe(false);
    expect(payoutTerms({ mode: 'run' })).toBeNull();
  });

  it('names the day and time of an automatic schedule', () => {
    expect(payoutWhen({ mode: 'daily', payHour: 9 })).toBe('every day at 09:00');
    expect(payoutWhen({ mode: 'weekly', weekday: 'friday', payHour: 14 })).toBe(
      'every Friday at 14:00',
    );
    expect(payoutWhen({ mode: 'monthly', monthlyDay: 2, payHour: 9 })).toBe(
      'on the 2nd of each month at 09:00',
    );
    expect(payoutWhen({ mode: 'monthly', monthlyDay: 11, payHour: 9 })).toBe(
      'on the 11th of each month at 09:00',
    );
    expect(payoutWhen({ mode: 'immediate' })).toBe('as soon as your earnings clear');
  });

  it('says the hold and who pays the fee', () => {
    expect(payoutTerms({ mode: 'daily', holdHours: 24, feePaidBy: 'nexg' })).toBe(
      'Earnings are paid once they are 1 day old. NexG pays the transfer fee.',
    );
    expect(payoutTerms({ mode: 'weekly', holdHours: 0, feePaidBy: 'rider', feeKes: 30 })).toBe(
      "Paystack's KES 30 transfer fee comes off each payout.",
    );
    expect(payoutTerms({ mode: 'weekly', holdHours: 0, feePaidBy: 'rider', feeKes: null })).toBe(
      "Paystack's transfer fee comes off each payout.",
    );
  });
});
