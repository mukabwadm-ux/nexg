import { listBookingProfiles, type BookingModel } from '@nexg/booking-config/profiles';

import {
  merchantOnboardingDemoQuery,
  type MerchantOnboardingDemoContext,
} from './merchant-onboarding-demo';

export type DemoPanelContent = {
  title: string;
  description: string;
  details: string[];
};

export type DemoAttentionItem = {
  title: string;
  detail: string;
  meta: string;
  button: string;
  panel: DemoPanelContent;
};

export type MerchantOnboardingDemoDashboard = {
  demoQuery: string;
  activityLabel: string;
  activitySingular: string;
  activityCount: number;
  secondaryLabel: string;
  secondaryCount: number;
  revenueLabel: string;
  revenueCents: number;
  activitySummary: string;
  completedLabel: string;
  completedCount: number;
  openLabel: string;
  openCount: number;
  activitySeries: number[];
  secondarySeries: number[];
  revenueSeriesCents: number[];
  attentionItems: DemoAttentionItem[];
  attentionPanel: DemoPanelContent;
  activityPanel: DemoPanelContent;
  secondaryPanel: DemoPanelContent;
  revenuePanel: DemoPanelContent;
};

const profiles = listBookingProfiles();

const modelCopy: Record<
  BookingModel,
  {
    activityLabel: string;
    activitySingular: string;
    secondaryLabel: string;
    revenueLabel: string;
    secondaryCount: number;
    items: [string, string, string];
    attention: [string, string, string];
  }
> = {
  ORDER: {
    activityLabel: 'Orders',
    activitySingular: 'order',
    secondaryLabel: 'Items in catalogue',
    revenueLabel: 'Net sales',
    secondaryCount: 18,
    items: ['Sample product · 2 items', 'New customer order · 3 items', 'Pickup order · 1 item'],
    attention: ['New order', 'Offering to review', 'Order ready soon'],
  },
  APPOINTMENT: {
    activityLabel: 'Appointments',
    activitySingular: 'appointment',
    secondaryLabel: 'Appointments today',
    revenueLabel: 'Service revenue',
    secondaryCount: 6,
    items: [
      'Consultation · Westlands',
      'Follow-up session · Kilimani',
      'New service booking · Westlands',
    ],
    attention: ['Appointment to confirm', 'Provider schedule to review', 'Upcoming appointment'],
  },
  FIELD_VISIT: {
    activityLabel: 'Customer visits',
    activitySingular: 'visit',
    secondaryLabel: 'Visits scheduled',
    revenueLabel: 'Service revenue',
    secondaryCount: 5,
    items: ['Home service · Kilimani', 'Site visit · Westlands', 'Customer visit · Lavington'],
    attention: ['Visit window approaching', 'New service request', 'Upcoming customer visit'],
  },
  ASSET_INTERVAL: {
    activityLabel: 'Rentals',
    activitySingular: 'rental',
    secondaryLabel: 'Fleet available',
    revenueLabel: 'Rental revenue',
    secondaryCount: 8,
    items: ['Toyota RAV4 · 3 days', 'Honda Fit · 1 day', 'Nissan X-Trail · 2 days'],
    attention: ['New rental request', 'Vehicle return due', 'Upcoming vehicle pickup'],
  },
  TRANSFER: {
    activityLabel: 'Transfers',
    activitySingular: 'transfer',
    secondaryLabel: 'Pickups today',
    revenueLabel: 'Trip revenue',
    secondaryCount: 6,
    items: [
      'Airport to Westlands · 2 passengers',
      'JKIA pickup · 3 passengers',
      'CBD drop-off · 1 passenger',
    ],
    attention: ['New transfer request', 'Pickup approaching', 'Upcoming transfer'],
  },
  SESSION_CAPACITY: {
    activityLabel: 'Sessions',
    activitySingular: 'session',
    secondaryLabel: 'Places booked',
    revenueLabel: 'Booking revenue',
    secondaryCount: 24,
    items: ['Workshop · 2 places', 'Class session · 4 places', 'Event booking · 3 places'],
    attention: ['New session booking', 'Capacity to review', 'Upcoming session'],
  },
  SPACE_RESERVATION: {
    activityLabel: 'Reservations',
    activitySingular: 'reservation',
    secondaryLabel: 'Arrivals today',
    revenueLabel: 'Reservation revenue',
    secondaryCount: 7,
    items: ['Table for 4 · 7:00 PM', 'Private space · 5 guests', 'Meeting room · 10:00 AM'],
    attention: ['New reservation', 'Arrival approaching', 'Upcoming reservation'],
  },
  TOUR: {
    activityLabel: 'Tour bookings',
    activitySingular: 'tour booking',
    secondaryLabel: 'Departures today',
    revenueLabel: 'Tour revenue',
    secondaryCount: 4,
    items: ['Nairobi day tour · 2 guests', 'Safari drive · 4 guests', 'City walk · 3 guests'],
    attention: ['New tour booking', 'Departure approaching', 'Upcoming tour'],
  },
  PRODUCTION_DUE: {
    activityLabel: 'Production jobs',
    activitySingular: 'production job',
    secondaryLabel: 'Due today',
    revenueLabel: 'Production revenue',
    secondaryCount: 5,
    items: [
      'Custom order · collection today',
      'Made-to-order item · 2 pieces',
      'Personalised order · 1 item',
    ],
    attention: ['New production job', 'Due date approaching', 'Upcoming collection'],
  },
  REQUEST_QUOTE: {
    activityLabel: 'Requests',
    activitySingular: 'request',
    secondaryLabel: 'Quotes awaiting reply',
    revenueLabel: 'Agreed value',
    secondaryCount: 3,
    items: [
      'Customer request · details supplied',
      'Quote requested · Westlands',
      'New enquiry · Kilimani',
    ],
    attention: ['New customer request', 'Quote needs a reply', 'Upcoming follow-up'],
  },
  LINKED_WINDOWS: {
    activityLabel: 'Collection jobs',
    activitySingular: 'collection job',
    secondaryLabel: 'Returns due',
    revenueLabel: 'Service revenue',
    secondaryCount: 4,
    items: ['Laundry · 4 items', 'Dry cleaning · 2 items', 'Ironing · 3 items'],
    attention: ['New collection job', 'Return due soon', 'Upcoming collection'],
  },
  SERVICE_JOB: {
    activityLabel: 'Service jobs',
    activitySingular: 'service job',
    secondaryLabel: 'Jobs in progress',
    revenueLabel: 'Service revenue',
    secondaryCount: 7,
    items: [
      'Device assessment · Westlands',
      'Repair job · Kilimani',
      'Customer service · Lavington',
    ],
    attention: ['New service job', 'Job ready for review', 'Upcoming handover'],
  },
  ENTITLEMENT: {
    activityLabel: 'Memberships',
    activitySingular: 'membership',
    secondaryLabel: 'Renewals due',
    revenueLabel: 'Membership revenue',
    secondaryCount: 3,
    items: [
      'Monthly access · current period',
      'Training membership · renews soon',
      'Member plan · active',
    ],
    attention: ['New membership', 'Renewal due', 'Upcoming member session'],
  },
  FREIGHT: {
    activityLabel: 'Shipments',
    activitySingular: 'shipment',
    secondaryLabel: 'In transit',
    revenueLabel: 'Freight revenue',
    secondaryCount: 9,
    items: [
      'Nairobi to Mombasa · 3 cartons',
      'Air freight · 2 packages',
      'Road freight · 1 pallet',
    ],
    attention: ['New shipment', 'Delivery milestone due', 'Upcoming collection'],
  },
  STORAGE: {
    activityLabel: 'Storage allocations',
    activitySingular: 'storage allocation',
    secondaryLabel: 'Units occupied',
    revenueLabel: 'Storage revenue',
    secondaryCount: 12,
    items: [
      'Storage unit A12 · 4 containers',
      'Cold storage · 2 crates',
      'Warehouse bay B04 · 1 pallet',
    ],
    attention: ['New storage request', 'Allocation to review', 'Upcoming release'],
  },
};

const activitySeriesByModel: Record<BookingModel, number[]> = {
  ORDER: [8, 11, 8, 13, 16, 15, 12],
  APPOINTMENT: [6, 8, 7, 9, 11, 10, 12],
  FIELD_VISIT: [4, 6, 5, 8, 7, 9, 8],
  ASSET_INTERVAL: [5, 6, 5, 8, 9, 8, 7],
  TRANSFER: [6, 8, 7, 9, 10, 8, 11],
  SESSION_CAPACITY: [2, 4, 3, 5, 6, 4, 7],
  SPACE_RESERVATION: [3, 4, 4, 6, 5, 6, 7],
  TOUR: [2, 2, 4, 5, 3, 6, 7],
  PRODUCTION_DUE: [4, 5, 4, 6, 7, 8, 6],
  REQUEST_QUOTE: [4, 6, 5, 7, 7, 9, 8],
  LINKED_WINDOWS: [4, 4, 5, 7, 6, 8, 7],
  SERVICE_JOB: [5, 5, 7, 6, 8, 7, 9],
  ENTITLEMENT: [8, 8, 9, 8, 10, 9, 11],
  FREIGHT: [3, 4, 3, 6, 5, 7, 6],
  STORAGE: [6, 6, 8, 7, 9, 8, 9],
};

const revenuePerActivityCents: Record<BookingModel, number> = {
  ORDER: 200_000,
  APPOINTMENT: 260_000,
  FIELD_VISIT: 320_000,
  ASSET_INTERVAL: 420_000,
  TRANSFER: 300_000,
  SESSION_CAPACITY: 180_000,
  SPACE_RESERVATION: 220_000,
  TOUR: 480_000,
  PRODUCTION_DUE: 350_000,
  REQUEST_QUOTE: 520_000,
  LINKED_WINDOWS: 240_000,
  SERVICE_JOB: 280_000,
  ENTITLEMENT: 160_000,
  FREIGHT: 600_000,
  STORAGE: 400_000,
};

const secondarySeriesByModel: Record<BookingModel, number[]> = {
  ORDER: [14, 15, 14, 17, 16, 18, 18],
  APPOINTMENT: [3, 4, 4, 5, 5, 6, 6],
  FIELD_VISIT: [2, 3, 3, 4, 4, 5, 5],
  ASSET_INTERVAL: [6, 7, 7, 8, 8, 9, 8],
  TRANSFER: [3, 4, 4, 5, 6, 5, 6],
  SESSION_CAPACITY: [10, 12, 14, 15, 18, 20, 24],
  SPACE_RESERVATION: [2, 3, 4, 4, 5, 6, 7],
  TOUR: [1, 2, 2, 3, 3, 4, 4],
  PRODUCTION_DUE: [2, 3, 3, 4, 4, 5, 5],
  REQUEST_QUOTE: [1, 2, 2, 2, 3, 3, 3],
  LINKED_WINDOWS: [1, 2, 2, 3, 3, 4, 4],
  SERVICE_JOB: [3, 4, 4, 5, 5, 6, 7],
  ENTITLEMENT: [1, 2, 2, 2, 3, 3, 3],
  FREIGHT: [4, 5, 5, 6, 7, 8, 9],
  STORAGE: [8, 9, 9, 10, 11, 12, 12],
};

const rentalItemsBySubcategory: Record<string, [string, string, string]> = {
  car_rental: ['Toyota RAV4 · 3 days', 'Honda Fit · 1 day', 'Nissan X-Trail · 2 days'],
  self_drive: [
    'Toyota RAV4 · self-drive · 3 days',
    'Honda Fit · self-drive · 1 day',
    'Nissan X-Trail · self-drive · 2 days',
  ],
  corporate_rental: [
    'Toyota Corolla · corporate fleet',
    'Nissan X-Trail · monthly agreement',
    'Toyota HiAce · company booking',
  ],
  long_term_rental: [
    'Toyota Fortuner · 3 months',
    'Honda Fit · 6 months',
    'Nissan X-Trail · 1 year',
  ],
  bike_rental: [
    'Bicycle · BIKE 012 · 1 day',
    'Bicycle · BIKE 013 · 2 days',
    'Bicycle · BIKE 014 · 1 day',
  ],
};

/** One category-aware source for the sample Home summary, attention cards and charts. */
export function merchantOnboardingDemoDashboard(
  context: MerchantOnboardingDemoContext | null,
): MerchantOnboardingDemoDashboard {
  const selected = context?.subcategories ?? [
    { id: 'restaurant', name: 'Restaurant' },
    { id: 'supermarket', name: 'Supermarket' },
  ];
  const selectedProfiles = selected.flatMap((item) => {
    const profile = profiles.find((candidate) => candidate.subcategoryId === item.id);
    return profile ? [profile] : [];
  });
  const profile =
    selectedProfiles[0] ??
    profiles.find((candidate) => candidate.subcategoryId === 'restaurant') ??
    profiles[0]!;
  const model = profile.defaultModelId;
  const copy = modelCopy[model];
  const selectedModels = [...new Set(selectedProfiles.map((item) => item.defaultModelId))];
  const models = selectedModels.length ? selectedModels : [model];
  const mixedActivities = models.length > 1;
  const sumSeries = (seriesForModel: Record<BookingModel, number[]>) =>
    activitySeriesByModel[model].map((_, index) =>
      models.reduce((sum, selectedModel) => sum + seriesForModel[selectedModel][index]!, 0),
    );
  const activitySeries = sumSeries(activitySeriesByModel);
  const secondarySeries = mixedActivities
    ? activitySeriesByModel[model].map(() => models.length)
    : sumSeries(secondarySeriesByModel);
  const revenueSeriesCents = models.reduce<number[]>(
    (series, selectedModel) =>
      series.map(
        (value, index) =>
          value +
          activitySeriesByModel[selectedModel][index]! * revenuePerActivityCents[selectedModel],
      ),
    Array(activitySeries.length).fill(0),
  );
  const activityCount = activitySeries.at(-1) ?? 0;
  const secondaryCount = mixedActivities ? models.length : copy.secondaryCount;
  const revenueCents = revenueSeriesCents.at(-1) ?? 0;
  const activityLabel = mixedActivities ? 'Work items' : copy.activityLabel;
  const secondaryLabel = mixedActivities ? 'Activity types' : copy.secondaryLabel;
  const revenueLabel = mixedActivities ? 'Combined revenue' : copy.revenueLabel;
  const activitySummary = context
    ? `${context.categoryName} · ${context.subcategories.map((item) => item.name).join(', ')}`
    : 'Restaurant & Food · Restaurant, Supermarket';
  const place = 'Westlands';
  const itemRows = [0, 1, 2].map((index) => {
    const itemProfile = selectedProfiles[index] ?? profile;
    const itemModel = itemProfile.defaultModelId;
    const itemCopy = modelCopy[itemModel];
    const item =
      itemModel === 'ORDER' && index === 0
        ? `Sample ${itemProfile.name} offering · 2 items`
        : itemModel === 'ASSET_INTERVAL'
          ? (rentalItemsBySubcategory[itemProfile.subcategoryId]?.[index] ?? itemCopy.items[index]!)
          : itemCopy.items[index]!;
    return {
      title: itemCopy.attention[index]!,
      detail: `${item} · ${place}`,
      meta: index === 0 ? '2 mins ago' : index === 1 ? '12 mins ago' : 'Today',
      button: index === 1 ? 'Review' : 'View work',
      panel: {
        title: itemCopy.attention[index]!,
        description: item,
        details: [
          item,
          `Activity: ${itemProfile.name}`,
          `Business: ${context?.businessName ?? 'Nairobi Collective'}`,
        ],
      },
    };
  });

  return {
    demoQuery: context ? merchantOnboardingDemoQuery(context) : '',
    activityLabel,
    activitySingular: mixedActivities ? 'work item' : copy.activitySingular,
    activityCount,
    secondaryLabel,
    secondaryCount,
    revenueLabel,
    revenueCents,
    activitySummary,
    completedLabel: mixedActivities
      ? 'Completed work items'
      : `Completed ${copy.activityLabel.toLowerCase()}`,
    completedCount: Math.max(activityCount - 3, 0),
    openLabel: mixedActivities ? 'Open work items' : `Open ${copy.activityLabel.toLowerCase()}`,
    openCount: 2,
    activitySeries,
    secondarySeries,
    revenueSeriesCents,
    attentionItems: itemRows,
    attentionPanel: {
      title: 'Needs attention',
      description: `${context?.categoryName ?? 'Restaurants & Food'} sample activity`,
      details: itemRows.map((item) => `${item.title} · ${item.detail}`),
    },
    activityPanel: {
      title: `${activityLabel} today`,
      description: `${activityCount} · Sample data`,
      details: [
        ...itemRows.map((item) => `${item.title} · ${item.detail}`),
        'Other sample work is available in Work.',
      ],
    },
    secondaryPanel: {
      title: secondaryLabel,
      description: `${secondaryCount} · Sample data`,
      details: [
        selected.map((item) => item.name).join(', '),
        'Counts are examples for these selected activities.',
      ],
    },
    revenuePanel: {
      title: `${revenueLabel} today`,
      description: 'Sample data',
      details: [
        `KES ${Math.round(revenueCents / 100).toLocaleString('en-KE')}`,
        `${activityCount} ${activityLabel.toLowerCase()} represented.`,
      ],
    },
  };
}
