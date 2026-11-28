import { describe, expect, it, vi } from 'vitest';

import { finishReviewBooking, isReviewShop } from './platform';

describe('review shop autopilot', () => {
  it('only knows NexG review shops', () => {
    expect(isReviewShop('ae7e0002-0011-4000-8000-000000000011')).toBe(true);
    expect(isReviewShop('01a21b27-88d2-7e15-b85b-4e43ee40a3fa')).toBe(false);
    expect(isReviewShop('ae7e')).toBe(false);
  });

  it('never calls the engine for an ordinary shop or a real payment', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(
      await finishReviewBooking('01a21b27-88d2-7e15-b85b-4e43ee40a3fa', 'b1', true),
    ).toMatchObject({ ok: false, code: 'not_a_review_shop' });
    expect(
      await finishReviewBooking('ae7e0002-0011-4000-8000-000000000011', 'b1', false),
    ).toMatchObject({ ok: false, code: 'not_a_review_shop' });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
