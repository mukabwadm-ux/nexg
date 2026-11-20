import { describe, expect, it } from 'vitest';

import { applicationAnswerGroups, describeAnswer } from './application-answers';

describe('applicationAnswerGroups', () => {
  it('labels the answers a new-form merchant gave, per chosen specialty', () => {
    const groups = applicationAnswerGroups({
      categoryId: 'travel_tours',
      subcategories: ['safaris'],
      answersBySubcategory: { safaris: { Q_ACCOMMODATION_INCLUDED: true } },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.subcategoryId).toBe('safaris');
    const row = groups[0]!.rows.find((r) => r.id === 'Q_ACCOMMODATION_INCLUDED');
    expect(row).toEqual({
      id: 'Q_ACCOMMODATION_INCLUDED',
      label: 'Accommodation Included?',
      value: 'Yes',
    });
    expect(groups[0]!.rows.filter((r) => r.value === '—').length).toBeGreaterThan(0);
  });

  it('shows nothing for a payload that is not a new-form application', () => {
    expect(applicationAnswerGroups(null)).toEqual([]);
    expect(applicationAnswerGroups({ business: {} })).toEqual([]);
  });
});

describe('describeAnswer', () => {
  it('reads answers the way staff talk about them', () => {
    expect(describeAnswer(undefined)).toBe('—');
    expect(describeAnswer(false)).toBe('No');
    expect(describeAnswer(['same_day', 'next_week'])).toBe('Same day, Next week');
    expect(describeAnswer(30)).toBe('30');
    expect(describeAnswer('Nyama choma and sides')).toBe('Nyama choma and sides');
  });
});
