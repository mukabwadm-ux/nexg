import { describe, expect, it } from 'vitest';

import { partnerPayouts, payoutDeclaration } from './partner-payouts';

describe('partner payout details', () => {
  it('sends only the fields of the chosen rail, trimmed', () => {
    expect(
      payoutDeclaration('mpesa_paybill', {
        paybillNumber: ' 400200 ',
        accountReference: 'ACC-778899',
        tillNumber: '5123456',
      }),
    ).toEqual({ rail: 'mpesa_paybill', paybillNumber: '400200', accountReference: 'ACC-778899' });
    expect(payoutDeclaration('mpesa_till', {})).toEqual({ rail: 'mpesa_till', tillNumber: '' });
  });

  it('reads the list, leaving out rows it cannot show', () => {
    const rows = partnerPayouts([
      { partner_id: 'a', rail: 'bank', version: '2', verified: true },
      { partner_id: 'b', rail: 'cheque', version: 1, verified: false },
      null,
    ]);
    expect(rows.map((r) => [r.partner_id, r.version, r.verified])).toEqual([['a', 2, true]]);
    expect(partnerPayouts(null)).toEqual([]);
  });
});
