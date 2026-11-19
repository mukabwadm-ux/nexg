/** How a customer gets a catalogue item (`catalogue_item_kind`, 20270116000100). */
export const ITEM_KINDS = [
  'buy',
  'ticket',
  'seats',
  'appointment',
  'table',
  'trip',
  'transfer',
  'rental',
  'service',
  'request',
  'pass',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  buy: 'Bought (basket and checkout)',
  ticket: 'Ticket',
  seats: 'Seats',
  appointment: 'Appointment',
  table: 'Table',
  trip: 'Trip',
  transfer: 'Transfer',
  rental: 'Rental',
  service: 'Service visit',
  request: 'Request or quote',
  pass: 'Pass or membership',
};
