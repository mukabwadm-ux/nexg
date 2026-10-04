/**
 * Shared by the server-rendered QR tab and the client controls on it.
 *
 * In its own file with no `'use client'` because every export of a
 * client module is a client *reference* — a server component that
 * imports a plain array from one and calls `.map()` on it fails at
 * render with "Attempted to call map() from the server". The array
 * has to live somewhere neutral that both can import.
 */
export const PLACEMENTS = [
  { value: 'counter', label: 'Kitchen counter' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'door', label: 'By the door' },
  { value: 'welcome_book', label: 'Welcome book' },
  { value: 'bedside', label: 'Bedside' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'pool', label: 'Pool' },
  { value: 'other', label: 'Somewhere else' },
] as const;

export const PLACEMENT_LABEL: Record<string, string> = Object.fromEntries(
  PLACEMENTS.map((p) => [p.value, p.label]),
);
