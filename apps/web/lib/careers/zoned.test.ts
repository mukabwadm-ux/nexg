import { describe, expect, it } from 'vitest';

import { zonedToInstant } from './zoned';

describe('zonedToInstant', () => {
  it('reads the clock time in the city, not in the browser', () => {
    expect(zonedToInstant('2026-12-14T10:30', 'Africa/Nairobi')).toBe('2026-12-14T07:30:00.000Z');
    expect(zonedToInstant('2026-12-14T10:30', 'UTC')).toBe('2026-12-14T10:30:00.000Z');
  });

  it('crosses midnight back into the day before', () => {
    expect(zonedToInstant('2026-12-15T01:15', 'Africa/Nairobi')).toBe('2026-12-14T22:15:00.000Z');
  });

  it('refuses anything that is not a datetime-local value', () => {
    expect(zonedToInstant('', 'Africa/Nairobi')).toBeNull();
    expect(zonedToInstant('14/12/2026 10:30', 'Africa/Nairobi')).toBeNull();
    expect(zonedToInstant('2026-12-14T10:30:00', 'Africa/Nairobi')).toBeNull();
  });
});
