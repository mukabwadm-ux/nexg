import { describe, expect, it } from 'vitest';

import { rankPopularSearches, topicForSearch } from './popular-searches';

describe('topicForSearch', () => {
  it('matches a search to its topic', () => {
    expect(topicForSearch('JKIA pickup tonight')).toBe('airport');
    expect(topicForSearch('cheap hotel westlands')).toBe('stays');
    expect(topicForSearch('deep tissue massage')).toBe('spa');
    expect(topicForSearch('pizza')).toBe('restaurants');
    expect(topicForSearch('red wine')).toBe('drinks');
    expect(topicForSearch('dry cleaning')).toBe('laundry');
  });

  it('only matches short words as whole words', () => {
    expect(topicForSearch('barber')).toBe('spa');
    expect(topicForSearch('a great view')).toBeNull();
    expect(topicForSearch('bars in kilimani')).toBe('drinks');
  });

  it('ignores searches it cannot place, and too-short ones', () => {
    expect(topicForSearch('qwerty')).toBeNull();
    expect(topicForSearch('sp')).toBeNull();
  });
});

describe('rankPopularSearches', () => {
  it('shows the most searched topics first', () => {
    expect(rankPopularSearches({ laundry: 9, pharmacy: 4, drinks: 4, stays: 1, spa: 1 })).toEqual([
      'laundry',
      'pharmacy',
      'drinks',
      'stays',
    ]);
  });

  it('fills the row in the usual order when there are few searches', () => {
    expect(rankPopularSearches()).toEqual(['airport', 'stays', 'spa', 'restaurants']);
    expect(rankPopularSearches({ laundry: 2 })).toEqual(['laundry', 'airport', 'stays', 'spa']);
  });
});
