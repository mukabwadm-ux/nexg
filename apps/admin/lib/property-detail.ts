/**
 * The property page's arithmetic: where the pin is, which photos to sign,
 * whether a unit has somebody in it tonight, and what each review state
 * means for staff and for guests. Kept apart from the page so it can be
 * tested without a database.
 */

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ReviewDecision = 'approve' | 'reject' | 'suspend' | 'reinstate';

export const REVIEW_DECISIONS: readonly ReviewDecision[] = [
  'approve',
  'reject',
  'suspend',
  'reinstate',
];

export function isReviewStatus(v: unknown): v is ReviewStatus {
  return v === 'pending' || v === 'approved' || v === 'rejected' || v === 'suspended';
}

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  pending: 'Waiting for review',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const REVIEW_TONE: Record<ReviewStatus, string> = {
  pending: 'bg-gold-soft text-gold-text',
  approved: 'bg-success-bg text-success',
  rejected: 'bg-danger-bg text-danger',
  suspended: 'bg-danger-bg text-danger',
};

/** The buttons a reviewer gets for each state; the database enforces the same. */
export function decisionsFor(status: ReviewStatus): ReviewDecision[] {
  switch (status) {
    case 'pending':
      return ['approve', 'reject'];
    case 'rejected':
      return ['approve'];
    case 'approved':
      return ['suspend'];
    case 'suspended':
      return ['reinstate'];
  }
}

export function needsReason(decision: ReviewDecision): boolean {
  return decision === 'reject' || decision === 'suspend';
}

/** A PostGIS point as PostgREST returns it (GeoJSON or hex EWKB). */
export function pinOf(point: unknown): { lat: number; lng: number } | null {
  let lng: number | undefined;
  let lat: number | undefined;
  if (point && typeof point === 'object' && 'coordinates' in point) {
    const coordinates = (point as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates)) [lng, lat] = coordinates as number[];
  } else if (typeof point === 'string' && /^[0-9a-f]+$/i.test(point) && point.length >= 42) {
    const bytes = Buffer.from(point, 'hex');
    const little = bytes[0] === 1;
    const type = little ? bytes.readUInt32LE(1) : bytes.readUInt32BE(1);
    if ((type & 0xff) !== 1) return null;
    const offset = type & 0x20000000 ? 9 : 5;
    if (bytes.length < offset + 16) return null;
    lng = little ? bytes.readDoubleLE(offset) : bytes.readDoubleBE(offset);
    lat = little ? bytes.readDoubleLE(offset + 8) : bytes.readDoubleBE(offset + 8);
  }
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

export interface PhotoRef {
  path: string | null;
  src: string | null;
  caption: string | null;
}

/**
 * The photos a host saved: a storage path in host-photos (signed for
 * staff), a full URL, or a placeholder with only a caption.
 */
export function photoRefs(v: unknown): PhotoRef[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((p): PhotoRef[] => {
    if (!p || typeof p !== 'object') return [];
    const o = p as Record<string, unknown>;
    const path = typeof o.path === 'string' && o.path ? o.path : null;
    const src = typeof o.src === 'string' && /^https?:\/\//.test(o.src) ? o.src : null;
    const caption = typeof o.caption === 'string' && o.caption ? o.caption : null;
    if (!path && !src && !caption) return [];
    return [{ path, src, caption }];
  });
}

export interface StayLike {
  unit_id: string | null;
  status: string;
  check_in: string;
  check_out: string;
}

export type Occupancy = 'occupied' | 'blocked' | 'free';

/**
 * Is somebody in this unit right now? A stay counts from check-in to
 * check-out unless it was cancelled; a host's own block shows as blocked.
 */
export function occupancyOf(unitId: string, stays: StayLike[], now = new Date()): Occupancy {
  const t = now.getTime();
  let blocked = false;
  for (const s of stays) {
    if (s.unit_id !== unitId || s.status === 'cancelled') continue;
    if (new Date(s.check_in).getTime() > t || new Date(s.check_out).getTime() <= t) continue;
    if (s.status === 'blocked') blocked = true;
    else return 'occupied';
  }
  return blocked ? 'blocked' : 'free';
}

/** Bookings still to come: held or booked, starting after now, soonest first. */
export function upcoming<T extends StayLike>(stays: T[], now = new Date()): T[] {
  const t = now.getTime();
  return stays
    .filter((s) => ['held', 'booked'].includes(s.status) && new Date(s.check_in).getTime() > t)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
}
