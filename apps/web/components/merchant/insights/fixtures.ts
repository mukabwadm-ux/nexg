import { getBookingProfile } from '@nexg/booking-config/profiles';
import { addDateDays, MODEL_REPORTS } from './model';
import type {
  BookingModel,
  InsightFilters,
  InsightLineItem,
  InsightPermissionPolicy,
  InsightRecord,
  InsightsSourceSnapshot,
  SourceCoverage,
  SourceKind,
} from './types';

export const DEFAULT_FILTERS: InsightFilters = {
  from: '2026-10-04',
  to: '2026-10-31',
  locationId: 'karen',
  activity: 'all',
  keyword: '',
  tab: 'overview',
};
export const SAMPLE_POLICY: InsightPermissionPolicy = {
  canRead: true,
  canExport: true,
  canReadFinance: true,
  canReadCustomers: true,
  canReadPromotions: true,
  allowedLocationIds: ['karen', 'westlands'],
  allowedModels: Object.keys(MODEL_REPORTS) as BookingModel[],
  privacyMinimum: 1,
};
const AS_OF = '2026-11-01T08:00:00+03:00';
const locations = [
  { id: 'karen', label: 'Karen branch' },
  { id: 'westlands', label: 'Westlands branch' },
];
const kinds: SourceKind[] = [
  'work',
  'items',
  'customers',
  'operations',
  'campaigns',
  'finance',
  'capacity',
];
function sourceCoverage(models: BookingModel[], supplied: SourceKind[] = kinds): SourceCoverage[] {
  return models.flatMap((model) =>
    locations.flatMap((location) =>
      supplied.map((kind) => ({
        id: `${model}:${location.id}:${kind}`,
        model,
        locationId: location.id,
        kind,
        from: '2026-09-06',
        to: '2026-10-31',
        status: 'ready' as const,
        asOf: AS_OF,
        definitionVersion: 'sample-1',
      })),
    ),
  );
}
export function createUnavailableSnapshot(
  input: Partial<
    Pick<
      InsightsSourceSnapshot,
      | 'merchantId'
      | 'merchantName'
      | 'subcategoryId'
      | 'enabledModels'
      | 'locations'
      | 'asOf'
      | 'notice'
    >
  > = {},
): InsightsSourceSnapshot {
  return {
    version: 1,
    sourceMode: 'live',
    status: 'unavailable',
    merchantId: input.merchantId || 'unavailable',
    merchantName: input.merchantName || 'Your business',
    subcategoryId: input.subcategoryId || 'unknown',
    asOf: input.asOf || '',
    currency: 'KES',
    enabledModels: input.enabledModels || [],
    locations: input.locations || [],
    offerings: [],
    records: [],
    lineItems: [],
    postings: [],
    campaignEvents: [],
    capacity: [],
    coverage: [],
    notice: input.notice || 'An authorized reporting source has not supplied this evidence.',
  };
}

const MENU = [
  { id: 'beef-burger', label: 'Beef burger', priceKES: 1000 },
  { id: 'chicken-pilau', label: 'Chicken pilau', priceKES: 800 },
  { id: 'veggie-wrap', label: 'Veggie wrap', priceKES: 600 },
  { id: 'chips', label: 'Chips', priceKES: 400 },
  { id: 'fruit-juice', label: 'Fruit juice', priceKES: 300 },
  { id: 'grilled-chicken', label: 'Grilled chicken', priceKES: 800 },
  { id: 'garden-salad', label: 'Garden salad', priceKES: 300 },
  { id: 'tea', label: 'Tea', priceKES: 275 },
];
// Actual unit allocations preserve every SKU, weekly unit and weekly amount total.
const WEEK_ITEMS = [
  [89, 79, 65, 51, 37, 25, 20, 12],
  [101, 85, 71, 58, 43, 28, 22, 12],
  [109, 94, 79, 62, 48, 33, 25, 12],
  [121, 102, 85, 69, 52, 34, 29, 12],
];
const WEEK_COMPLETED = [252, 280, 308, 336];

export function createRestaurantSnapshot(): InsightsSourceSnapshot {
  const snapshot: InsightsSourceSnapshot = {
    version: 1,
    sourceMode: 'sample',
    status: 'ready',
    merchantId: 'sample-karibu-kitchen',
    merchantName: 'Karibu Kitchen',
    subcategoryId: 'restaurant',
    asOf: AS_OF,
    currency: 'KES',
    enabledModels: ['ORDER'],
    locations: locations.map((row) => ({ ...row })),
    offerings: MENU.map((row) => ({
      id: row.id,
      label: row.label,
      model: 'ORDER',
      locationIds: ['karen', 'westlands'],
      enabled: true,
      presentation: 'menu',
    })),
    records: [],
    lineItems: [],
    postings: [],
    campaignEvents: [],
    capacity: [],
    coverage: sourceCoverage(
      ['ORDER'],
      ['work', 'items', 'customers', 'operations', 'campaigns', 'finance'],
    ),
    notice: 'Sample preview. Fictional dated evidence; filters and reports compute from this data.',
  };
  const people: { id: string; orders: number; returning: boolean }[] = [
    { id: 'C-0104', orders: 6, returning: false },
    { id: 'C-0105', orders: 5, returning: false },
    ...Array.from({ length: 598 }, (_, index) => ({
      id: `C-${1000 + index}`,
      orders: index < 183 ? 2 : 1,
      returning: false,
    })),
    { id: 'C-0101', orders: 8, returning: true },
    { id: 'C-0102', orders: 7, returning: true },
    { id: 'C-0103', orders: 6, returning: true },
    ...Array.from({ length: 237 }, (_, index) => ({
      id: `C-${200 + index}`,
      orders: index < 126 ? 2 : 1,
      returning: true,
    })),
  ];
  const assignments = people.flatMap((person) =>
    Array.from({ length: person.orders }, () => person),
  );
  const completedIds = [...Array.from({ length: 1173 }, (_, index) => index + 1), 1246, 1247, 1248];
  const methods = [
    ...Array<string>(587).fill('Delivery'),
    ...Array<string>(352).fill('Pickup'),
    ...Array<string>(234).fill('Dine-in'),
    'Dine-in',
    'Pickup',
    'Delivery',
  ];
  const methodIndex: Record<string, number> = {};
  const missing: Record<string, number> = { Delivery: 4, Pickup: 3, 'Dine-in': 1 };
  const late: Record<string, number> = { Delivery: 37, Pickup: 21, 'Dine-in': 12 };
  let globalIndex = 0;
  for (let week = 0; week < 4; week++) {
    const records: InsightRecord[] = [];
    for (let index = 0; index < WEEK_COMPLETED[week]!; index++, globalIndex++) {
      const number = completedIds[globalIndex]!;
      const on = number >= 1246 ? '2026-10-31' : addDateDays('2026-10-04', week * 7 + (index % 7));
      const method = methods[globalIndex]!;
      const rank = methodIndex[method] || 0;
      methodIndex[method] = rank + 1;
      const person = assignments[globalIndex]!;
      records.push({
        id: `order-${number}`,
        reference: `ORD-${number}`,
        label: 'Menu order',
        model: 'ORDER',
        locationId: 'karen',
        offeringId: '',
        requestedOn: on,
        completedOn: on,
        dueOn: on,
        occurredOn: on,
        outcome: 'completed',
        fulfilment: method,
        customerId: person.id,
        customerFirstCompletedOn: person.returning ? '2026-09-01' : undefined,
        itemAmountMinor: 0,
        acceptedAt: `${on}T10:58:00+03:00`,
        startedAt: `${on}T11:00:00+03:00`,
        readyAt: `${on}T11:28:00+03:00`,
        promiseAt:
          rank < missing[method]!
            ? null
            : `${on}T11:${rank < missing[method]! + late[method]! ? '20' : '30'}:00+03:00`,
      });
    }
    const remaining = [...WEEK_ITEMS[week]!];
    const protectedRows = new Set<string>();
    const recordLabels = new Map<string, Set<string>>();
    const add = (record: InsightRecord, sku: number, quantity = 1) => {
      if (remaining[sku]! < quantity) throw new Error('Invalid restaurant sample unit allocation.');
      const item = MENU[sku]!;
      remaining[sku]! -= quantity;
      for (let unit = 0; unit < quantity; unit++) {
        const line: InsightLineItem = {
          id: `line-${snapshot.lineItems.length + 1}`,
          recordId: record.id,
          offeringId: item.id,
          label: item.label,
          variant: 'Standard',
          quantity: 1,
          unit: 'each',
          itemAmountMinor: item.priceKES * 100,
        };
        snapshot.lineItems.push(line);
        const labels = recordLabels.get(record.id) || new Set<string>();
        labels.add(item.label);
        recordLabels.set(record.id, labels);
        record.itemAmountMinor = (record.itemAmountMinor || 0) + line.itemAmountMinor!;
        record.offeringId ||= item.id;
      }
    };
    for (const record of records) {
      if (['C-0101', 'C-0102', 'C-0103', 'C-0104', 'C-0105'].includes(record.customerId!)) {
        add(record, 0);
        protectedRows.add(record.id);
      } else if (record.reference === 'ORD-1248') {
        add(record, 0);
        protectedRows.add(record.id);
      } else if (record.reference === 'ORD-1247') {
        add(record, 1);
        protectedRows.add(record.id);
      } else if (record.reference === 'ORD-1246') {
        add(record, 2, 2);
        protectedRows.add(record.id);
      }
    }
    let sku = 0;
    const nextSku = () => {
      while (!remaining[sku]) sku = (sku + 1) % MENU.length;
      const result = sku;
      sku = (sku + 1) % MENU.length;
      return result;
    };
    for (const record of records.filter((row) => !row.offeringId)) add(record, nextSku());
    const available = records.filter((row) => !protectedRows.has(row.id));
    let cursor = 0;
    while (remaining.some((quantity) => quantity > 0)) {
      add(available[cursor++ % available.length]!, nextSku());
    }
    for (const record of records) {
      record.label = [...(recordLabels.get(record.id) || [])].join(', ');
      snapshot.postings.push({
        id: `credit-${record.id}`,
        reference: record.reference,
        recordId: record.id,
        model: 'ORDER',
        locationId: 'karen',
        postedOn: record.completedOn!,
        kind: 'merchant_credit',
        amountMinor: record.itemAmountMinor!,
        currency: 'KES',
      });
    }
    snapshot.records.push(...records);
  }
  // Confirmed historical first-completion dates are independent from report filters.
  const first = new Map<string, string>();
  for (const record of snapshot.records)
    if (record.customerId && record.completedOn)
      first.set(
        record.customerId,
        [first.get(record.customerId), record.completedOn].filter(Boolean).sort()[0]!,
      );
  for (const record of snapshot.records)
    record.customerFirstCompletedOn ||= first.get(record.customerId!);
  const reasons = [
    ...Array<string>(24).fill('Changed plans'),
    ...Array<string>(18).fill('Item unavailable'),
    ...Array<string>(6).fill('Other recorded'),
    ...Array<null>(6).fill(null),
  ];
  for (let index = 0; index < 54; index++) {
    const number = index < 53 ? 1174 + index : 1245;
    const on = number === 1245 ? '2026-10-31' : addDateDays('2026-10-04', index % 28);
    snapshot.records.push({
      id: `order-${number}`,
      reference: `ORD-${number}`,
      label: 'Veggie wrap',
      model: 'ORDER',
      locationId: 'karen',
      offeringId: 'veggie-wrap',
      requestedOn: on,
      outcome: 'cancelled',
      fulfilment: 'Delivery',
      itemAmountMinor: 60000,
      cancellationReason: reasons[index],
    });
  }
  for (let index = 0; index < 18; index++) {
    const number = 1227 + index;
    snapshot.records.push({
      id: `order-${number}`,
      reference: `ORD-${number}`,
      label: 'Menu request',
      model: 'ORDER',
      locationId: 'karen',
      offeringId: 'chicken-pilau',
      requestedOn: index === 17 ? '2026-10-31' : addDateDays('2026-10-04', index % 28),
      outcome: 'open',
      fulfilment: 'Pickup',
      itemAmountMinor: 90000,
    });
  }
  snapshot.postings.push(
    {
      id: 'refund-batch',
      reference: 'Refund batch RF-1030',
      model: 'ORDER',
      locationId: 'karen',
      postedOn: '2026-10-30',
      kind: 'refund_debit',
      amountMinor: 1764000,
      currency: 'KES',
    },
    {
      id: 'fee-batch',
      reference: 'Recorded fees FE-1031',
      model: 'ORDER',
      locationId: 'karen',
      postedOn: '2026-10-31',
      kind: 'fee_debit',
      amountMinor: 5880000,
      currency: 'KES',
    },
  );
  const event = (kind: 'impression' | 'tap' | 'attributed_accepted_order', count: number) => {
    for (let index = 0; index < count; index++)
      snapshot.campaignEvents.push({
        id: `${kind}-${index + 1}`,
        campaignId: 'dinner-discovery',
        campaignLabel: 'Dinner discovery',
        model: 'ORDER',
        locationId: 'karen',
        occurredOn: addDateDays('2026-10-04', index % 28),
        kind,
        count: 1,
        attributionWindowMinutes: kind === 'attributed_accepted_order' ? 30 : undefined,
        observationComplete: true,
      });
  };
  event('impression', 12000);
  event('tap', 600);
  event('attributed_accepted_order', 36);
  // Independent branch and prior-period facts make the controls exercise actual scope changes.
  for (const [id, locationId, on, amount] of [
    ['west-1', 'westlands', '2026-10-12', 40000],
    ['west-2', 'westlands', '2026-10-18', 40000],
    ['west-3', 'westlands', '2026-10-25', 40000],
    ['prior-1', 'karen', '2026-09-10', 100000],
  ] as const) {
    snapshot.records.push({
      id,
      reference: id.toUpperCase(),
      label: locationId === 'westlands' ? 'Chips' : 'Beef burger',
      model: 'ORDER',
      locationId,
      offeringId: locationId === 'westlands' ? 'chips' : 'beef-burger',
      requestedOn: on,
      completedOn: on,
      dueOn: on,
      outcome: 'completed',
      fulfilment: 'Pickup',
      itemAmountMinor: amount,
      customerId: `${id}-customer`,
      customerFirstCompletedOn: on,
      startedAt: `${on}T11:00:00+03:00`,
      readyAt: `${on}T11:28:00+03:00`,
      promiseAt: `${on}T11:30:00+03:00`,
    });
    snapshot.lineItems.push({
      id: `line-${id}`,
      recordId: id,
      offeringId: locationId === 'westlands' ? 'chips' : 'beef-burger',
      label: locationId === 'westlands' ? 'Chips' : 'Beef burger',
      variant: 'Standard',
      quantity: 1,
      unit: 'each',
      itemAmountMinor: amount,
    });
    snapshot.postings.push({
      id: `credit-${id}`,
      reference: id.toUpperCase(),
      recordId: id,
      model: 'ORDER',
      locationId,
      postedOn: on,
      kind: 'merchant_credit',
      amountMinor: amount,
      currency: 'KES',
    });
  }
  return snapshot;
}

export function createModelSnapshot(
  profileId: string,
  selectedModel?: BookingModel,
): InsightsSourceSnapshot {
  const profile = getBookingProfile(profileId);
  if (!profile) throw new Error('Choose a registered merchant profile.');
  const model = selectedModel || profile.defaultModelId;
  if (!profile.candidateModels.includes(model))
    throw new Error('This sample offering model is not a candidate for the selected profile.');
  if (profileId === 'restaurant' && model === 'ORDER') return createRestaurantSnapshot();
  const info = MODEL_REPORTS[model];
  const resourceModel = [
    'APPOINTMENT',
    'FIELD_VISIT',
    'ASSET_INTERVAL',
    'SESSION_CAPACITY',
    'SPACE_RESERVATION',
    'TOUR',
    'STORAGE',
  ].includes(model);
  const supplied: SourceKind[] = [
    'work',
    'operations',
    ...(resourceModel ? ['capacity' as const] : []),
  ];
  const presentation = (
    model === 'ORDER'
      ? 'products'
      : model === 'ASSET_INTERVAL'
        ? 'fleet'
        : ['SESSION_CAPACITY', 'TOUR'].includes(model)
          ? 'experiences'
          : ['SPACE_RESERVATION', 'STORAGE'].includes(model)
            ? 'spaces'
            : model === 'PRODUCTION_DUE'
              ? 'products'
              : 'services'
  ) as InsightsSourceSnapshot['offerings'][number]['presentation'];
  const snapshot: InsightsSourceSnapshot = {
    version: 1,
    sourceMode: 'sample',
    status: 'ready',
    merchantId: `sample-${profileId}`,
    merchantName: `${profile.name} sample business`,
    subcategoryId: profileId,
    asOf: AS_OF,
    currency: 'KES',
    enabledModels: [model],
    locations: locations.map((row) => ({ ...row })),
    offerings: [
      {
        id: `offering-${profileId}`,
        label: `${profile.name} offering`,
        model,
        enabled: true,
        locationIds: ['karen', 'westlands'],
        presentation,
      },
    ],
    records: [],
    lineItems: [],
    postings: [],
    campaignEvents: [],
    capacity: [],
    coverage: sourceCoverage([model], supplied),
    notice:
      'Sample preview. This explicitly configured sample activity uses its own model and evidence. Other sources remain unavailable.',
  };
  for (let index = 0; index < 12; index++) {
    const on = addDateDays('2026-10-04', index * 2);
    const end = `${on}T12:00:00+03:00`;
    const actual = `${on}T${index === 1 ? '13' : '11'}:50:00+03:00`;
    const outcome =
      model === 'ENTITLEMENT'
        ? 'issued'
        : model === 'REQUEST_QUOTE'
          ? index < 6
            ? 'accepted'
            : index < 8
              ? 'declined'
              : index === 8
                ? 'expired'
                : 'open'
          : index < 9
            ? 'completed'
            : index === 9
              ? 'cancelled'
              : 'open';
    snapshot.records.push({
      id: `${model}-${index + 1}`,
      reference: `${model.slice(0, 3)}-${1040 + index}`,
      label: `${profile.name} ${info.unit}`,
      model,
      locationId: 'karen',
      offeringId: `offering-${profileId}`,
      requestedOn: on,
      completedOn: outcome === 'completed' ? on : undefined,
      scheduledOn: on,
      dueOn: on,
      occurredOn: on,
      outcome,
      arrivalAt: index === 2 ? null : actual,
      arrivalWindowEnd: end,
      promiseAt: end,
      returnAt: index === 2 ? null : actual,
      returnDueAt: end,
      collectionAt: actual,
      collectionDueAt: end,
      quoteAccepted: model === 'REQUEST_QUOTE' ? index < 6 : undefined,
      attendedPlaces: model === 'SESSION_CAPACITY' ? (index < 9 ? 8 : 0) : undefined,
      bookedPlaces: model === 'SESSION_CAPACITY' ? 10 : undefined,
      entitlementUses: model === 'ENTITLEMENT' ? (index < 6 ? 2 : 1) : undefined,
    });
    if (resourceModel)
      snapshot.capacity.push({
        id: `capacity-${model}-${index}`,
        resourceId: `resource-${index % 3}`,
        label: `${info.label} resource ${(index % 3) + 1}`,
        model,
        locationId: 'karen',
        occurredOn: on,
        unit:
          model === 'SESSION_CAPACITY' || model === 'TOUR'
            ? 'places'
            : model === 'STORAGE'
              ? 'pallet-minutes'
              : 'minutes',
        usable: model === 'SESSION_CAPACITY' || model === 'TOUR' ? 12 : 480,
        reserved: model === 'SESSION_CAPACITY' || model === 'TOUR' ? 10 : 360,
        used: model === 'SESSION_CAPACITY' || model === 'TOUR' ? 8 : 300,
      });
    if (model === 'ORDER') {
      const record = snapshot.records[snapshot.records.length - 1]!;
      record.itemAmountMinor = 25000;
      if (outcome === 'completed')
        snapshot.lineItems.push({
          id: `item-${index}`,
          recordId: record.id,
          offeringId: record.offeringId,
          label: `${profile.name} product`,
          variant: 'Standard',
          quantity: index + 1,
          unit: 'each',
          itemAmountMinor: 25000,
        });
    }
  }
  if (model === 'ORDER') snapshot.coverage.push(...sourceCoverage([model], ['items']));
  return snapshot;
}
