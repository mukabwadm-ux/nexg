import { describe, expect, it } from 'vitest';

import { calendarBars } from '../../../../hosts-workspace/src/calendar-bars';

const TODAY = '2026-12-03';
const stay = (id: string, status: string, start: string, end: string) => ({
  id,
  status,
  start,
  end,
});
const drawn = (stays: ReturnType<typeof stay>[]) =>
  calendarBars(stays, TODAY).map((bar) => [bar.stay.id, bar.stay.start, bar.drawnEnd]);

describe('the calendar bars of a unit', () => {
  it('frees the nights left after an early check-out for a new booking', () => {
    // The workspace lists stays by check-in, latest first.
    expect(
      drawn([
        stay('new', 'Confirmed', '2026-12-04', '2026-12-06'),
        stay('left', 'Completed', '2026-12-01', '2026-12-08'),
      ]),
    ).toEqual([
      ['left', '2026-12-01', TODAY],
      ['new', '2026-12-04', '2026-12-06'],
    ]);
  });

  it('paints a checked-out stay under every booking, hold and block', () => {
    const order = drawn([
      stay('block', 'Blocked', '2026-12-02', '2026-12-03'),
      stay('later-left', 'Completed', '2026-12-01', '2026-12-02'),
      stay('hold', 'Hold', '2026-11-30', '2026-12-01'),
      stay('booked', 'Confirmed', '2026-11-29', '2026-11-30'),
      stay('earlier-left', 'Completed', '2026-11-28', '2026-12-05'),
    ]).map(([id]) => id);
    expect(order).toEqual(['earlier-left', 'later-left', 'block', 'hold', 'booked']);
  });

  it('keeps the booked dates of a stay that ended, and of one still to end', () => {
    expect(
      drawn([
        stay('in', 'Checked in', '2026-12-02', '2026-12-07'),
        stay('past', 'Completed', '2026-11-28', '2026-11-30'),
      ]),
    ).toEqual([
      ['past', '2026-11-28', '2026-11-30'],
      ['in', '2026-12-02', '2026-12-07'],
    ]);
  });

  it('draws no drafts, cancelled stays, or stays checked out on their arrival day', () => {
    expect(
      drawn([
        stay('draft', 'Draft', '2026-12-04', '2026-12-06'),
        stay('cancelled', 'Cancelled', '2026-12-04', '2026-12-06'),
        stay('same-day', 'Completed', TODAY, '2026-12-06'),
      ]),
    ).toEqual([]);
  });
});
