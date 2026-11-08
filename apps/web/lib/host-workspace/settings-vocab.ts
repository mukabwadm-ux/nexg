export const FEATURES: { key: string; label: string; consequence: string }[] = [
  {
    key: 'guest_ops',
    label: 'Guest Operations',
    consequence: 'NexG handles guest chat, orders and deliveries for all properties.',
  },
  {
    key: 'charge_to_room',
    label: 'Charge to room',
    consequence: 'Hotels only. Needs a folio model and a desk device; ask host ops to enable it.',
  },
  {
    key: 'packages',
    label: 'Welcome packages',
    consequence: 'Scheduling and rules appear in Packages & Amenities.',
  },
  {
    key: 'calendar_sync',
    label: 'Calendar sync',
    consequence: 'Airbnb and Booking.com iCal feeds can be connected in Bookings.',
  },
  {
    key: 'stay_review',
    label: 'Stay review request',
    consequence: 'Asked once before check-out via the QR landing. One reminder, never more.',
  },
  {
    key: 'referral_on_cards',
    label: 'Referral code on printed cards',
    consequence: 'A small code on the back of tent cards, pointing at your referral link.',
  },
  {
    key: 'analytics_email',
    label: 'Analytics exports to email',
    consequence: 'Monthly, to you and an accountant address you set under Billing.',
  },
];

export const EVENTS: { key: string; label: string; channel: string }[] = [
  {
    key: 'delivery_at_reception',
    label: 'Delivery arriving at reception',
    channel: 'In-app + sound',
  },
  { key: 'retired_card_scanned', label: 'Retired QR card scanned', channel: 'Push' },
  { key: 'request_waiting', label: 'Request waiting on you', channel: 'Push + WhatsApp' },
  { key: 'caretaker_unconfirmed', label: 'Caretaker not confirmed after 48 h', channel: 'Push' },
  { key: 'invoice_ready', label: 'Statement or invoice ready', channel: 'Email' },
  { key: 'guest_data_request', label: 'Guest data request', channel: 'Email + push' },
  { key: 'stay_review_received', label: 'Stay review received', channel: 'In-app' },
];

export const ROLES = ['owner', 'managers', 'front_desk'] as const;

export const THEMES = [
  { value: 'nexg', label: 'NexG classic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'contrast', label: 'High contrast' },
  { value: 'custom', label: 'Custom' },
];
