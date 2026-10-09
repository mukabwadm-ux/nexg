/**
 * The words the host portal uses, in one plain module.
 *
 * These lived in the `'use client'` files that own the matching
 * forms, which looked tidy and did not work: Next.js turns
 * every export of a client module into a client reference, so a
 * server page importing `spotLabel` got an object rather than a
 * function and the page died with "spotLabel is not a function".
 * It typechecks either way — the boundary is a runtime one.
 *
 * So the vocabulary is here, with no directive, and both sides
 * import it.
 */

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

export function kindLabel(k: string): string {
  return KINDS.find((x) => x.value === k)?.label ?? k.replace(/_/g, ' ');
}
