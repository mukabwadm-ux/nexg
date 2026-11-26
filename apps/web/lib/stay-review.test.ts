import { describe, expect, it } from 'vitest';

import { asMyStayReviews, reviewFromForm } from './stay-review';

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('reviewFromForm', () => {
  it('needs an overall rating', () => {
    expect(reviewFromForm(form({ cleanliness: '4' }))).toEqual({
      ok: false,
      message: 'Choose an overall rating from 1 to 5 stars.',
    });
  });

  it('keeps the categories the guest rated and drops the rest', () => {
    expect(
      reviewFromForm(form({ rating: '4', cleanliness: '5', value: '9', location: '', text: '  ' })),
    ).toEqual({ ok: true, review: { rating: 4, text: null, cleanliness: 5 } });
  });

  it('refuses text over 2000 characters', () => {
    expect(reviewFromForm(form({ rating: '5', text: 'a'.repeat(2001) })).ok).toBe(false);
  });
});

describe('asMyStayReviews', () => {
  it('reads anything but an array as none', () => {
    expect(asMyStayReviews(null)).toEqual([]);
    expect(asMyStayReviews([{ stay_id: 'x' }])).toHaveLength(1);
  });
});
