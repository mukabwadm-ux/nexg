import {
  Building2,
  ConciergeBell,
  LayoutGrid,
  QrCode,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { PillTabs } from '@/components/console-kit';

/**
 * The tabs, in the order the overview sheet lists them.
 *
 * Filters live in the URL, so a link pasted into Slack opens the same
 * screen the sender was looking at.
 */
export const HOTEL_TABS = [
  { key: 'hosts', label: 'Airbnb hosts & units' },
  { key: 'listings', label: 'Listings & requests' },
  { key: 'refunds', label: 'Stay refunds' },
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
    subtitle:
      'Hosts, property managers and every unit with its hand-off rule · QR packs · welcome packages',
  },
  listings: {
    title: 'Listings & stay requests',
    subtitle: 'What guests can see, and what they have asked for · match, send, record the outcome',
  },
  refunds: {
    title: 'Stay refunds',
    subtitle: 'Guests owed their money back for a stay · reverse in M-Pesa, record the reference',
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
    subtitle: 'Every card NexG has printed, where it sits, and what guests did after scanning it',
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

const HOTEL_ICONS: Record<HotelTab, LucideIcon> = {
  hosts: Users,
  listings: LayoutGrid,
  refunds: RotateCcw,
  hotels: Building2,
  charge: ReceiptText,
  desk: ConciergeBell,
  qr: QrCode,
  guests: UserRound,
  data: ShieldCheck,
};

export function HotelTabs({ current }: { current: string }) {
  return (
    <PillTabs
      tabs={HOTEL_TABS.map((tab) => ({
        href: `/hotels?tab=${tab.key}`,
        label: tab.label,
        icon: HOTEL_ICONS[tab.key],
        active: current === tab.key,
      }))}
    />
  );
}
