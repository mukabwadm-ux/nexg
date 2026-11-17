/**
 * A merchant's own image or video for a homepage featured card or a
 * promotion's banner: what may be sent, and how it is described.
 *
 * The same caps are checked three times: here in the browser before the
 * upload, by the `promo-media` bucket (10 MB, the five types), and by the
 * database against the type and size storage recorded
 * (fn_promo_media_object, migration 20270101120100). Keep the numbers in
 * step with that function. The Supabase project is on the Free plan, with
 * 1 GB of storage shared by every bucket, so they are deliberately small.
 */

export const PROMO_MEDIA_BUCKET = 'promo-media';

export type PromoMediaKind = 'image' | 'video';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;

export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 10 * 1024 * 1024;
/** Checked in the browser only: the server cannot read a video's length. */
export const VIDEO_MAX_SECONDS = 30;
/** Smaller than this and a card or banner looks soft on a phone. */
export const MIN_SIDE_PX = 480;

export const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/** For the file input's accept attribute. */
export const PROMO_MEDIA_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',');

/** What a merchant is told the limits are, in one line. */
export const PROMO_MEDIA_RULES =
  'An image (JPG, PNG or WebP, up to 3 MB) or a video (MP4 or WebM, up to 10 MB and 30 seconds).';

export function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The kind a declared type belongs to, or null when it is not allowed. */
export function kindOfType(type: string): PromoMediaKind | null {
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return 'image';
  if ((VIDEO_TYPES as readonly string[]).includes(type)) return 'video';
  return null;
}

/**
 * The first check, on what the browser says about the file: an allowed
 * type within its cap. Returns the kind, or the sentence to show.
 */
export function checkDeclared(
  type: string,
  size: number,
): { ok: true; kind: PromoMediaKind } | { ok: false; message: string } {
  const kind = kindOfType(type);
  if (!kind) {
    return {
      ok: false,
      message: 'Choose a JPG, PNG or WebP image, or an MP4 or WebM video.',
    };
  }
  if (size <= 0) return { ok: false, message: 'That file is empty.' };
  if (kind === 'image' && size > IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: `That image is ${megabytes(size)}. An image can be up to 3 MB: export it smaller, or as JPG or WebP.`,
    };
  }
  if (kind === 'video' && size > VIDEO_MAX_BYTES) {
    return {
      ok: false,
      message: `That video is ${megabytes(size)}. A video can be up to 10 MB: export it shorter or at 720p.`,
    };
  }
  return { ok: true, kind };
}

/**
 * The type a file's first bytes say it is, whatever its name says. Used in
 * the browser before upload and on the server after it, so a renamed file
 * (a .mov called .mp4, a GIF called .png) is caught either way.
 */
export function sniffType(bytes: Uint8Array): string | null {
  const at = (offset: number, ...values: number[]) =>
    values.every((value, i) => bytes[offset + i] === value);
  const ascii = (offset: number, text: string) =>
    [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  /* ISO base media: a box size, then "ftyp", then the brand. QuickTime
     (brand "qt  ") is the iPhone's .mov, which most browsers cannot play. */
  if (ascii(4, 'ftyp')) return ascii(8, 'qt  ') ? 'video/quicktime' : 'video/mp4';
  return null;
}

/** Whether the bytes are the type declared. WebM and Matroska share a signature. */
export function sniffMatches(declared: string, bytes: Uint8Array): boolean {
  return sniffType(bytes) === declared;
}

export interface PromoMediaRef {
  kind: PromoMediaKind;
  path: string;
  /** A video's still frame; never set for an image. */
  posterPath?: string | null;
}

/** The shape the database functions take ({kind, path, poster_path}). */
export function mediaPayload(media: PromoMediaRef | null) {
  if (!media) return null;
  return {
    kind: media.kind,
    path: media.path,
    ...(media.kind === 'video' ? { poster_path: media.posterPath ?? null } : {}),
  };
}

/** <merchant id>/<uuid>.<ext>, as the bucket's insert policy requires. */
export function mediaPath(merchantId: string, id: string, type: string): string {
  const extension = EXTENSION[type];
  if (!extension) throw new Error('Unsupported file type.');
  return `${merchantId}/${id}.${extension}`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH = new RegExp(`^(${UUID})/${UUID}\\.(jpg|png|webp|mp4|webm)$`);

/** The merchant a path belongs to, or null if it is not a promo-media path. */
export function mediaOwner(path: string): string | null {
  return PATH.exec(path)?.[1] ?? null;
}

/** "15% off" or "KES 200 off", as a guest reads a promotion. */
export function promotionBenefit(kind: string, value: number): string {
  return kind === 'percent' ? `${value}% off` : `KES ${value.toLocaleString('en-KE')} off`;
}
