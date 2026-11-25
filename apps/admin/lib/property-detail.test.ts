import { describe, expect, it } from 'vitest';

import { decisionsFor, occupancyOf, photoRefs, pinOf, upcoming } from './property-detail';

const NOW = new Date('2026-11-25T12:00:00Z');

describe('property review decisions', () => {
  it('offers only the moves the database allows', () => {
    expect(decisionsFor('pending')).toEqual(['approve', 'reject']);
    expect(decisionsFor('rejected')).toEqual(['approve']);
    expect(decisionsFor('approved')).toEqual(['suspend']);
    expect(decisionsFor('suspended')).toEqual(['reinstate']);
  });
});

describe('the pin', () => {
  it('reads GeoJSON and hex EWKB', () => {
    expect(pinOf({ type: 'Point', coordinates: [36.7856, -1.2921] })).toEqual({
      lat: -1.2921,
      lng: 36.7856,
    });
    // SRID 4326 point (36.8, -1.3), little-endian EWKB.
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(0x20000001, 1);
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(36.8, 9);
    buf.writeDoubleLE(-1.3, 17);
    expect(pinOf(buf.toString('hex'))).toEqual({ lat: -1.3, lng: 36.8 });
    expect(pinOf(null)).toBeNull();
    expect(pinOf('zz')).toBeNull();
  });
});

describe('photos', () => {
  it('keeps paths, full URLs and captioned placeholders', () => {
    expect(
      photoRefs([
        { path: 'h/p/a.jpg', caption: 'Front' },
        { src: 'https://example.test/b.jpg' },
        { src: 'javascript:alert(1)' },
        { caption: 'Kitchen', placeholder: true },
        null,
      ]),
    ).toEqual([
      { path: 'h/p/a.jpg', src: null, caption: 'Front' },
      { path: null, src: 'https://example.test/b.jpg', caption: null },
      { path: null, src: null, caption: 'Kitchen' },
    ]);
    expect(photoRefs('nope')).toEqual([]);
  });
});

describe('occupancy', () => {
  const stays = [
    {
      unit_id: 'a',
      status: 'in_stay',
      check_in: '2026-11-24T11:00:00Z',
      check_out: '2026-11-27T08:00:00Z',
    },
    {
      unit_id: 'b',
      status: 'cancelled',
      check_in: '2026-11-24T11:00:00Z',
      check_out: '2026-11-27T08:00:00Z',
    },
    {
      unit_id: 'c',
      status: 'blocked',
      check_in: '2026-11-24T00:00:00Z',
      check_out: '2026-11-26T00:00:00Z',
    },
    {
      unit_id: 'd',
      status: 'departed',
      check_in: '2026-11-20T11:00:00Z',
      check_out: '2026-11-25T08:00:00Z',
    },
    {
      unit_id: 'd',
      status: 'booked',
      check_in: '2026-12-01T11:00:00Z',
      check_out: '2026-12-03T08:00:00Z',
    },
    {
      unit_id: 'a',
      status: 'held',
      check_in: '2026-11-28T11:00:00Z',
      check_out: '2026-11-29T08:00:00Z',
    },
  ];

  it('says who is in tonight', () => {
    expect(occupancyOf('a', stays, NOW)).toBe('occupied');
    expect(occupancyOf('b', stays, NOW)).toBe('free');
    expect(occupancyOf('c', stays, NOW)).toBe('blocked');
    expect(occupancyOf('d', stays, NOW)).toBe('free');
  });

  it('lists what is coming, soonest first', () => {
    expect(upcoming(stays, NOW).map((s) => s.unit_id)).toEqual(['a', 'd']);
  });
});
