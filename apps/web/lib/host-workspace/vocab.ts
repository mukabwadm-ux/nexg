/** Shared labels and stored values for the host workspace. */

/* ════════════════════════════════════════════════ QR spots */

/**
 * Where a card sits in a unit.
 *
 * The labels are the room as a host describes it; the values
 * are an older enum that says `fridge` and `lobby`. Mapping
 * here means nobody has to read the column name off a screen.
 */
export const SPOTS: { value: string; label: string }[] = [
  { value: 'bedside', label: 'Bedside table' },
  { value: 'fridge', label: 'Kitchen counter' },
  { value: 'welcome_book', label: 'Living room · welcome book' },
  { value: 'counter', label: 'Reception desk' },
  { value: 'door', label: 'Inside the door' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'pool', label: 'Pool / outside' },
  { value: 'other', label: 'Somewhere else' },
];

export function spotLabel(v: string | null): string {
  return SPOTS.find((s) => s.value === v)?.label ?? v ?? '—';
}

/* ════════════════════════════════════════════ hand-off rules */

/** The six modes a rider can be told to use at a door. */
export const HANDOFFS: { value: string; label: string }[] = [
  { value: '', label: 'Not set yet' },
  { value: 'guest_meets_at_gate', label: 'Guest meets at gate' },
  { value: 'leave_with_askari', label: 'Leave with askari' },
  { value: 'lockbox', label: 'Lockbox' },
  { value: 'call_guest_first', label: 'Call guest first' },
  { value: 'reception', label: 'Reception' },
  { value: 'caretaker', label: 'Caretaker' },
];

export function handoffLabel(h: string | null): string {
  return HANDOFFS.find((x) => x.value === (h ?? ''))?.label ?? h ?? 'Not set';
}

/* ═══════════════════════════════════════════ property kinds */

export const KINDS: { value: string; label: string }[] = [
  { value: 'apartment_block', label: 'Apartment block' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'studio', label: 'Studio' },
  { value: 'villa', label: 'Villa' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'guest_house', label: 'Guest house' },
  { value: 'cottage', label: 'Cottage' },
  { value: 'penthouse', label: 'Penthouse' },
];

/* ════════════════════════════════════════════════ photos */

export interface Photo {
  path: string;
  alt?: string;
  cover?: boolean;
}

/**
 * The photo list off a `jsonb` column, safely.
 *
 * Here and not beside the upload form for the reason stated at
 * the top of this file: the server pages read these, and an
 * export of a `'use client'` module is not callable on the
 * server. That mistake was made twice — the second time with
 * the note about the first one already written.
 */
export function photosOf(v: unknown): Photo[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p): p is Photo => typeof p === 'object' && p !== null && typeof (p as Photo).path === 'string',
  );
}

/** The cover, or the first one, or nothing. */
export function coverOf(v: unknown): Photo | null {
  const all = photosOf(v);
  return all.find((p) => p.cover) ?? all[0] ?? null;
}

export const HOST_SUPPORT_DESKS = [
  {
    value: 'hotel_or_airbnb',
    label: 'Host ops — my account, units or cards',
    note: 'The desk that handles properties, QR cards, hand-off rules and packages.',
  },
  {
    value: 'my_order',
    label: 'Concierge — a guest, an order or a delivery',
    note: 'The desk that talks to guests and riders. Use this when somebody is waiting.',
  },
  {
    value: 'payment',
    label: 'Money — an invoice, a reward or a statement',
    note: 'Billing questions and anything on your statement that looks wrong.',
  },
  {
    value: 'partnership',
    label: 'Partnerships — commercial, or something bigger',
    note: 'More properties, a hotel, or a conversation about how we work together.',
  },
  {
    value: 'something_else',
    label: 'Something else',
    note: 'If none of the above fits. We will route it from here.',
  },
] as const;

export const BOOKING_SOURCES = [
  { value: 'entered', label: 'Entered by you' },
  { value: 'walk_in', label: 'Walk-in / direct' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'pms', label: 'PMS' },
];

export const CALENDAR_PROVIDERS = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'ical', label: 'Another iCal feed' },
  { value: 'pms_csv', label: 'Hotel PMS (CSV upload)' },
];


export const HOST_REQUEST_TYPES = [
  { value: 'amenities', label: 'Amenities' },
  { value: 'late_checkout', label: 'Late check-out' },
  { value: 'transport', label: 'Transport' },
  { value: 'access', label: 'Access · locked out · gate' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'recommendations', label: 'Recommendations' },
  { value: 'order', label: 'An order' },
  { value: 'rider_conduct', label: 'A rider' },
  { value: 'other', label: 'Something else' },
];

export const HOST_REQUEST_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_host', label: 'Waiting on you' },
  { value: 'waiting_on_guest', label: 'Waiting on the guest' },
];
