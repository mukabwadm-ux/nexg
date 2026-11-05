'use client';

import { HomePanel } from './home-panel';
import * as React from 'react';
import { useMerchantOnboardingDemoContext } from './merchant-onboarding-demo-provider';
import type { DemoPanelContent } from '@/lib/merchant-onboarding-demo-dashboard';

export type SamplePanelKind =
  | 'business'
  | 'attention'
  | 'order'
  | 'stock'
  | 'booking'
  | 'location'
  | 'orders'
  | 'bookings'
  | 'sales'
  | 'promotions'
  | 'help'
  | 'account'
  | 'notifications';
const descriptions: Record<
  SamplePanelKind,
  { title: string; description: string; details: string[] }
> = {
  business: {
    title: 'Business status',
    description: 'Sample business status',
    details: ['Approved', 'Nairobi Collective'],
  },
  attention: {
    title: 'Needs attention',
    description: 'Sample items across your locations',
    details: ['New order · #4612 · Westlands', 'Low stock · 3 items', 'Booking request · Kilimani'],
  },
  order: {
    title: 'Order #4612',
    description: 'Sample order · Westlands',
    details: ['New', '2 items', 'Item details are not available in this example.'],
  },
  stock: {
    title: 'Low stock',
    description: 'Sample items running low',
    details: ['Maize Flour 2kg', 'Cooking Oil 1L', 'Eggs (Tray)'],
  },
  booking: {
    title: 'Booking request',
    description: 'Sample request · Kilimani',
    details: ['Catering for 20 people', 'Sat, 15 Jun', 'Request awaiting review'],
  },
  location: {
    title: 'Location details',
    description: 'Sample location',
    details: ['Choose a location to review its current status.'],
  },
  orders: {
    title: 'Orders today',
    description: '12 · Sample data',
    details: [
      'Order #4612 · Westlands · 2 items · New',
      'Other orders are not shown in this example.',
    ],
  },
  bookings: {
    title: 'Bookings today',
    description: '3 · Sample data',
    details: ['Booking details are not shown in this example.'],
  },
  sales: {
    title: 'Net sales today',
    description: 'Sample data',
    details: ['KES 24,800', 'Breakdown unavailable in this concept.'],
  },
  promotions: {
    title: 'Promotions',
    description: 'Choose how you want to reach more customers.',
    details: ['Featured placement', 'Create a promotion'],
  },
  help: {
    title: 'How can we help?',
    description: 'Sample support topics',
    details: ['Orders', 'Offerings', 'Money', 'Account', 'Contact support'],
  },
  account: {
    title: 'Account',
    description: 'Sample merchant account',
    details: ['Nairobi Collective', 'Account settings'],
  },
  notifications: {
    title: 'Notifications',
    description: 'Sample notifications',
    details: ['No notifications shown in this example.'],
  },
};

export function HomeSamplePanel({
  kind,
  trigger,
  location,
  content,
}: {
  kind: SamplePanelKind;
  trigger: React.ReactNode;
  location?: string;
  content?: DemoPanelContent;
}) {
  const demoContext = useMerchantOnboardingDemoContext();
  const panel = descriptions[kind];
  const details =
    content?.details ??
    (kind === 'location' && location
      ? [location, 'Sample status shown on Home.']
      : demoContext && (kind === 'business' || kind === 'account')
        ? panel.details.map((detail) =>
            detail === 'Nairobi Collective' ? demoContext.businessName : detail,
          )
        : panel.details);
  return (
    <HomePanel
      title={content?.title ?? panel.title}
      description={content?.description ?? panel.description}
      trigger={trigger}
    >
      <ul className="divide-border border-border divide-y rounded-lg border">
        {details.map((detail) => (
          <li key={detail} className="px-4 py-3 text-sm">
            {detail}
          </li>
        ))}
      </ul>
      <p className="text-muted text-xs">Sample preview. No account changes are made here.</p>
    </HomePanel>
  );
}
