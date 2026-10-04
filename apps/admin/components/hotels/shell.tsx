import Link from 'next/link';

/**
 * The tabs, in the order the overview sheet lists them.
 *
 * Filters live in the URL, so a link pasted into Slack opens the same
 * screen the sender was looking at.
 */
export const HOTEL_TABS = [
  { key: 'hosts', label: 'Airbnb hosts & units' },
  { key: 'listings', label: 'Listings & requests' },
  { key: 'hotels', label: 'Hotels' },
  { key: 'charge', label: 'Charge to room' },
  { key: 'desk', label: 'Front desk & access' },
  { key: 'qr', label: 'QR & attribution' },
  { key: 'guests', label: 'Guests' },
  { key: 'data', label: 'Data requests' },
] as const;

export type HotelTab = (typeof HOTEL_TABS)[number]['key'];

export const TAB_TITLE: Record<string, { title: string; subtitle: string }> = {
  hosts: {
    title: 'Airbnb hosts & units',
    subtitle: 'Hosts, property managers and every unit with its hand-off rule · QR packs · welcome packages',
  },
  listings: {
    title: 'Listings & stay requests',
    subtitle: 'What guests can see, and what they have asked for · match, send, record the outcome',
  },
  hotels: { title: 'Hotels', subtitle: 'Partner hotels, rooms and the prospect pipeline' },
  charge: {
    title: 'Charge to room',
    subtitle: 'Folio postings, desk confirmations, rejections and month-end reconciliation',
  },
  desk: {
    title: 'Front desk & access',
    subtitle: 'Desk performance, the rules riders are given, and access incidents',
  },
  qr: {
    title: 'QR & attribution',
    subtitle:
      'Every card NexG has printed, where it sits, and what guests did after scanning it',
  },
  guests: {
    title: 'Guests & data requests',
    subtitle: 'Guest lookup with masked data · consent · KDPA access and erasure requests',
  },
  data: {
    title: 'Data requests',
    subtitle: 'The KDPA queue · identity, scope, bundles and erasures',
  },
};

export function HotelTabs({ current }: { current: string }) {
  return (
    <nav
      className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
      aria-label="Hotels and Airbnb sections"
    >
      {HOTEL_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/hotels?tab=${tab.key}`}
          className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
            current === tab.key
              ? 'border-gold text-ink'
              : 'text-muted hover:text-ink border-transparent'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
