import { describe, expect, it } from 'vitest';

import {
  EMPTY_PAYOUT_FORM,
  describePayout,
  maskAccount,
  payoutFormProblem,
} from './merchant-payouts';

describe('payout summary', () => {
  it('shows till and paybill numbers and hides all but the last four of a bank account', () => {
    expect(describePayout({ rail: 'mpesa_till', tillNumber: '5123456' })).toEqual({
      method: 'M-Pesa Till (Buy Goods)',
      detail: 'Till number 5123456',
    });
    expect(
      describePayout({ rail: 'mpesa_paybill', paybillNumber: '400200', accountReference: 'SHOP7' }),
    ).toEqual({ method: 'M-Pesa PayBill', detail: 'PayBill 400200, account SHOP7' });
    expect(
      describePayout({
        rail: 'bank',
        bankName: 'Equity Bank',
        accountName: 'Deck Supplies Ltd',
        accountNumber: '0123 4567 8901',
      }),
    ).toEqual({ method: 'Equity Bank', detail: 'Deck Supplies Ltd · •••• 8901' });
    expect(maskAccount('1234')).toBe('1234');
  });

  it('has nothing to show without a declaration, and names an unsupported one', () => {
    expect(describePayout(null)).toBeNull();
    expect(describePayout({})).toBeNull();
    expect(describePayout({ rail: 'mobile_money' })?.method).toBe('An earlier payout method');
  });
});

describe('payout form checks', () => {
  it('asks for a method first', () => {
    expect(payoutFormProblem(EMPTY_PAYOUT_FORM)).toBe('Choose how you want to be paid.');
  });

  it('needs digit-only till and paybill numbers and every bank field', () => {
    const till = { ...EMPTY_PAYOUT_FORM, method: 'mpesa_till' };
    expect(payoutFormProblem(till)).toBe('Enter your Till number.');
    expect(payoutFormProblem({ ...till, tillNumber: '12-34' })).toMatch(/digits only/);
    expect(payoutFormProblem({ ...till, tillNumber: ' 123456 ' })).toBeNull();

    const paybill = { ...EMPTY_PAYOUT_FORM, method: 'mpesa_paybill', paybillNumber: '400200' };
    expect(payoutFormProblem(paybill)).toBe('Enter the account number for this PayBill.');
    expect(payoutFormProblem({ ...paybill, accountReference: 'A1' })).toBeNull();

    const bank = { ...EMPTY_PAYOUT_FORM, method: 'bank', bankName: 'KCB', holderName: 'Deck' };
    expect(payoutFormProblem(bank)).toBe('Enter the account number.');
    expect(payoutFormProblem({ ...bank, bankAccount: '1100' })).toBeNull();
  });
});
