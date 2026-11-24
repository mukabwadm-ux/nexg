import { describe, expect, it } from 'vitest';

import { PHOTO_LIMIT, PHOTO_ROOMS, coverOf, isPhotoRoom, photosOf } from './vocab';

describe('photo rooms', () => {
  it('keeps a known room on each photo and drops anything else', () => {
    expect(
      photosOf([
        { path: 'h/u/1.jpg', room: 'kitchen' },
        { path: 'h/u/2.jpg', room: 'attic' },
        { path: 'h/u/3.jpg' },
        { nope: true },
      ]),
    ).toEqual([
      { path: 'h/u/1.jpg', room: 'kitchen' },
      { path: 'h/u/2.jpg' },
      { path: 'h/u/3.jpg' },
    ]);
  });

  it('offers the rooms the owner listed, with the studio bed area under bedroom', () => {
    expect(PHOTO_ROOMS.map((room) => room.value)).toEqual([
      'living',
      'dining',
      'kitchen',
      'bedroom',
      'washroom',
      'outside',
      'other',
    ]);
    expect(PHOTO_ROOMS.find((room) => room.value === 'bedroom')?.label).toMatch(/bed area/);
    expect(isPhotoRoom('washroom')).toBe(true);
    expect(isPhotoRoom('Washroom')).toBe(false);
  });

  it('holds several photos per room and still finds the cover', () => {
    expect(PHOTO_LIMIT.unit).toBeGreaterThanOrEqual(PHOTO_ROOMS.length * 5);
    expect(
      coverOf([
        { path: 'a', room: 'living' },
        { path: 'b', cover: true, room: 'kitchen' },
      ])?.path,
    ).toBe('b');
  });
});
