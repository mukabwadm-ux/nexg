import { describe, expect, it } from 'vitest';

import { hostPayouts } from './host-payouts';

describe('host payout details', () => {
  it('reads the list, leaving out rows it cannot show', () => {
    const rows = hostPayouts([
      { host_id: 'a', rail: 'mpesa_phone', version: '3', verified: true },
      { host_id: 'b', rail: 'cheque', version: 1, verified: false },
      { partner_id: 'c', rail: 'bank', version: 1, verified: false },
      null,
    ]);
    expect(rows.map((r) => [r.host_id, r.version, r.verified])).toEqual([['a', 3, true]]);
    expect(hostPayouts(undefined)).toEqual([]);
  });
});
