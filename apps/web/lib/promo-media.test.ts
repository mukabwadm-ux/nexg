import { describe, expect, it } from 'vitest';

import {
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  checkDeclared,
  mediaOwner,
  mediaPath,
  mediaPayload,
  promotionBenefit,
  sniffType,
} from './promo-media';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  );

const MERCHANT = 'c9710000-0000-4000-8000-00000000000a';
const FILE = 'c9750000-0000-4000-8000-000000000001';

describe('promo media rules', () => {
  it('takes the five types within their caps and says why anything else is refused', () => {
    expect(checkDeclared('image/webp', 900_000)).toEqual({ ok: true, kind: 'image' });
    expect(checkDeclared('video/mp4', VIDEO_MAX_BYTES)).toEqual({ ok: true, kind: 'video' });
    expect(checkDeclared('image/gif', 1000)).toMatchObject({ ok: false });
    expect(checkDeclared('video/quicktime', 1000)).toMatchObject({ ok: false });
    expect(checkDeclared('image/png', IMAGE_MAX_BYTES + 1)).toMatchObject({
      ok: false,
      message: expect.stringContaining('up to 3 MB'),
    });
    expect(checkDeclared('video/webm', VIDEO_MAX_BYTES + 1)).toMatchObject({
      ok: false,
      message: expect.stringContaining('up to 10 MB'),
    });
    expect(checkDeclared('image/jpeg', 0)).toMatchObject({ ok: false });
  });

  it('reads what a file really is from its first bytes', () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffType(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp');
    expect(sniffType(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe('video/webm');
    expect(sniffType(bytes(0, 0, 0, 0x20, 'ftyp', 'isom'))).toBe('video/mp4');
    /* An iPhone .mov renamed .mp4 is still QuickTime. */
    expect(sniffType(bytes(0, 0, 0, 0x14, 'ftyp', 'qt  '))).toBe('video/quicktime');
    expect(sniffType(bytes('GIF89a'))).toBeNull();
    expect(sniffType(bytes('<html>'))).toBeNull();
  });

  it('names files <merchant>/<uuid>.<ext> and knows whose folder a path is in', () => {
    expect(mediaPath(MERCHANT, FILE, 'video/webm')).toBe(`${MERCHANT}/${FILE}.webm`);
    expect(() => mediaPath(MERCHANT, FILE, 'image/gif')).toThrow();
    expect(mediaOwner(`${MERCHANT}/${FILE}.jpg`)).toBe(MERCHANT);
    expect(mediaOwner(`${MERCHANT}/poster.jpg`)).toBeNull();
    expect(mediaOwner(`${MERCHANT}/${FILE}.gif`)).toBeNull();
    expect(mediaOwner(`../${MERCHANT}/${FILE}.jpg`)).toBeNull();
  });

  it('sends the database {kind, path, poster_path}, with a still only for a video', () => {
    expect(mediaPayload(null)).toBeNull();
    expect(mediaPayload({ kind: 'image', path: 'a.jpg', posterPath: 'b.jpg' })).toEqual({
      kind: 'image',
      path: 'a.jpg',
    });
    expect(mediaPayload({ kind: 'video', path: 'a.mp4', posterPath: 'b.jpg' })).toEqual({
      kind: 'video',
      path: 'a.mp4',
      poster_path: 'b.jpg',
    });
  });

  it('words a promotion as a guest reads it', () => {
    expect(promotionBenefit('percent', 15)).toBe('15% off');
    expect(promotionBenefit('amount', 2000)).toBe('KES 2,000 off');
  });
});
