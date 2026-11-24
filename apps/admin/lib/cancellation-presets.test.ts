import { describe, expect, it } from 'vitest';

import { checkTiers, toCancellationPresets } from './cancellation-presets';

describe('cancellation presets read', () => {
  it('is null for an error or an odd shape', () => {
    expect(toCancellationPresets(null)).toBeNull();
    expect(toCancellationPresets([1, 2])).toBeNull();
  });

  it('reads missing lists as empty and drops presets it does not know', () => {
    expect(toCancellationPresets({})).toEqual({ canRequest: false, canDecide: false, presets: [] });
    const read = toCancellationPresets({
      canRequest: true,
      presets: [
        {
          preset: 'moderate',
          tiers: [
            { days_before: 5, refund_pct: 100 },
            { days_before: 'x', refund_pct: 1 },
          ],
          text: 'A full refund…',
          pending: { id: 'p1', tiers: [{ days_before: 0, refund_pct: 0 }], mine: true },
        },
        { preset: 'custom', tiers: [] },
      ],
    });
    expect(read?.presets).toHaveLength(1);
    expect(read?.presets[0]?.tiers).toEqual([{ days_before: 5, refund_pct: 100 }]);
    expect(read?.presets[0]?.pending?.mine).toBe(true);
  });
});

describe('checking typed tiers', () => {
  it('sorts most days first and needs a 0-day last step', () => {
    expect(
      checkTiers([
        { days: '0', pct: '0' },
        { days: '7', pct: '50%' },
        { days: '14', pct: '100' },
      ]),
    ).toEqual({
      ok: true,
      tiers: [
        { days_before: 14, refund_pct: 100 },
        { days_before: 7, refund_pct: 50 },
        { days_before: 0, refund_pct: 0 },
      ],
    });
    expect(checkTiers([{ days: '3', pct: '100' }]).ok).toBe(false);
  });

  it('refuses what the database refuses', () => {
    expect(checkTiers([]).ok).toBe(false);
    expect(checkTiers(Array.from({ length: 6 }, (_, i) => ({ days: `${i}`, pct: '0' }))).ok).toBe(
      false,
    );
    expect(checkTiers([{ days: '1.5', pct: '0' }]).ok).toBe(false);
    expect(checkTiers([{ days: '400', pct: '0' }]).ok).toBe(false);
    expect(
      checkTiers([
        { days: '5', pct: '50' },
        { days: '0', pct: '100' },
      ]).ok,
    ).toBe(false);
    expect(
      checkTiers([
        { days: '0', pct: '0' },
        { days: '0', pct: '0' },
      ]).ok,
    ).toBe(false);
  });
});
