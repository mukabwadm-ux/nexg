import { describe, expect, it } from 'vitest';

import { TIME_OF_DAY_PHRASE, nairobiHour, timeOfDay } from './time-of-day';

describe('timeOfDay', () => {
  it('splits the day into morning, afternoon, evening and night', () => {
    const at = (hour: number) => TIME_OF_DAY_PHRASE[timeOfDay(hour)];
    expect(at(4)).toBe('tonight');
    expect(at(5)).toBe('this morning');
    expect(at(11)).toBe('this morning');
    expect(at(12)).toBe('this afternoon');
    expect(at(16)).toBe('this afternoon');
    expect(at(17)).toBe('this evening');
    expect(at(20)).toBe('this evening');
    expect(at(21)).toBe('tonight');
    expect(at(0)).toBe('tonight');
  });

  it('copes with out-of-range hours', () => {
    expect(timeOfDay(24 + 9)).toBe('morning');
    expect(timeOfDay(-1)).toBe('night');
  });
});

describe('nairobiHour', () => {
  it('reads the hour in Africa/Nairobi (UTC+3)', () => {
    expect(nairobiHour(new Date('2026-11-11T06:30:00Z'))).toBe(9);
    expect(nairobiHour(new Date('2026-11-11T22:15:00Z'))).toBe(1);
  });
});
