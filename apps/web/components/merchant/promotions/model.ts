import {
  discountedMinor,
  money,
  moneyMinor,
  type Catalogue,
  type Offering,
  type OfferingProfile,
} from '../offerings/model';
import { schemas } from '../offerings/schemas';

export type PromotionKind = 'offer' | 'featured';
export type Phase =
  | 'draft'
  | 'running'
  | 'paused'
  | 'ended'
  | 'requested'
  | 'cancelled'
  | 'rejected';
export type DisplayState =
  | 'Draft'
  | 'Scheduled'
  | 'Active'
  | 'Paused'
  | 'Ended'
  | 'Awaiting confirmation'
  | 'Cancelled'
  | 'Rejected'
  | 'Needs attention';
export type DiscountRule = NonNullable<Offering['discount']>;
export type PublicSnapshot = {
  name: string;
  description: string;
  image?: string;
  unit: string;
  action: string;
  baseMinor: number | null;
  priceMinor: number | null;
  benefit: string;
  terms: string;
  details?: { label: string; value: string }[];
  isStorefront?: boolean;
};
export type Campaign = {
  id: string;
  profileId: string;
  version: number;
  name: string;
  kind: PromotionKind;
  offeringId: string;
  phase: Phase;
  rule: Omit<DiscountRule, 'enabled'>;
  appliedRule?: DiscountRule;
  placement?: { surface: 'homepage' | 'category' | 'popular'; startsOn: string; weeks: number };
  archivedPreview?: PublicSnapshot;
  updatedAt: string;
  history: { at: string; action: string; version: number }[];
};
export type PromotionData = { version: 1; revision: number; campaigns: Campaign[] };
export type PromotionCatalogue = Catalogue & { promotionsPreview?: PromotionData };

const modelContext: Record<string, { qualifier: string; use: string }> = {
  ORDER: {
    qualifier: 'Product or item',
    use: 'The selected item, variants and unit determine the customer price.',
  },
  APPOINTMENT: {
    qualifier: 'Service and duration',
    use: 'The promotion applies to the listed service price. Available appointment times remain separate.',
  },
  FIELD_VISIT: {
    qualifier: 'Visit and service area',
    use: 'Coverage and available visits are confirmed separately.',
  },
  ASSET_INTERVAL: {
    qualifier: 'Rental and rate unit',
    use: 'The rate is per listed unit. Rental dates, extras and deposits are separate.',
  },
  TRANSFER: {
    qualifier: 'Trip or greeting',
    use: 'The route, travel date and available resources remain separate.',
  },
  SESSION_CAPACITY: {
    qualifier: 'Event or session',
    use: 'The selected session and available places remain separate.',
  },
  SPACE_RESERVATION: {
    qualifier: 'Space and party',
    use: 'The selected space, party and available time remain separate.',
  },
  TOUR: {
    qualifier: 'Tour or departure',
    use: 'Departure dates and supplier confirmation remain separate.',
  },
  PRODUCTION_DUE: {
    qualifier: 'Custom work',
    use: 'Only a known listed price can receive an automatic offer.',
  },
  REQUEST_QUOTE: {
    qualifier: 'Enquiry',
    use: 'An unknown quote cannot be shown as a discounted price.',
  },
  LINKED_WINDOWS: {
    qualifier: 'Collection and return',
    use: 'Collection, processing and return times remain separate.',
  },
  SERVICE_JOB: {
    qualifier: 'Service job',
    use: 'An unknown repair or job quote cannot be shown as a discounted price.',
  },
  ENTITLEMENT: {
    qualifier: 'Plan or membership',
    use: 'The offer applies to the listed price; plan use and renewal remain separate.',
  },
  FREIGHT: {
    qualifier: 'Shipment and rate unit',
    use: 'The route, cargo and any final quote remain separate.',
  },
  STORAGE: {
    qualifier: 'Storage and billing unit',
    use: 'The space, storage period and any final quote remain separate.',
  },
};

// Only customer-facing offering information is copied into a preview.
const publicFields: Record<string, string> = {
  sale_unit: 'Sale unit',
  duration_minutes: 'Duration (minutes)',
  service_location_modes: 'Service location',
  remote_channel_reference: 'Remote session',
  scope_fields: 'Included scope',
  service_area_reference: 'Service areas',
  rental_unit: 'Rental unit',
  min_rental_quantity: 'Minimum rental units',
  driver_mode: 'Driver',
  asset_class_reference: 'Asset class',
  deposit_kes: 'Refundable deposit (KES)',
  transport_mode: 'Included service',
  route_fields: 'Route',
  vehicle_class_reference: 'Vehicle class',
  passenger_limit: 'Passengers',
  luggage_limit: 'Luggage pieces',
  admission_type: 'Admission',
  session_start: 'Session starts (EAT)',
  participant_limit: 'Places per session',
  group_size_min: 'Minimum participants',
  group_size_max: 'Maximum participants',
  party_min: 'Minimum party',
  party_max: 'Maximum party',
  capacity_mode: 'Capacity use',
  departure_mode: 'Departure type',
  tour_transport_mode: 'Transport',
  itinerary_fields: 'Itinerary',
  validity_days: 'Validity (days)',
  usage_unit: 'Plan unit',
  included_units: 'Included units',
  entitlement_schema_reference: 'Included benefits',
  renewal_policy: 'Renewal',
  billing_period: 'Billing period',
  space_unit: 'Storage unit',
  storage_location_references: 'Storage location',
  access_policy: 'Access terms',
  intake_unit: 'Intake unit',
  processing_terms: 'Processing terms',
  collection_policy: 'Collection terms',
  measurement_units: 'Rate unit',
  supported_route_references: 'Supported routes',
  max_weight_kg: 'Maximum cargo weight (kg)',
  handover_methods: 'Handover',
  cancellation_policy: 'Cancellation terms',
};

export function contextFor(item: Offering) {
  const schema = schemas[item.schemaId];
  if (!schema) throw new Error('This offering type is not registered.');
  const context = modelContext[schema.model];
  if (!context) throw new Error('This offering model is not registered.');
  return {
    ...context,
    model: schema.model,
    label: schema.label,
    action: schema.action,
    unit: item.unit || schema.unit,
  };
}

export function localInstant(value: string): number | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return Number.NaN;
  const result = Date.parse(`${value}+03:00`);
  if (
    !Number.isFinite(result) ||
    new Date(result + 3 * 3600_000).toISOString().slice(0, 16) !== value
  )
    return Number.NaN;
  return result;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function ruleMatches(campaign: Campaign, item?: Offering) {
  return !!item && !!campaign.appliedRule && same(item.discount, campaign.appliedRule);
}
export function campaignState(campaign: Campaign, item?: Offering, now = Date.now()): DisplayState {
  if (campaign.phase === 'draft') return 'Draft';
  if (campaign.phase === 'cancelled') return 'Cancelled';
  if (campaign.phase === 'rejected') return 'Rejected';
  if (campaign.phase === 'ended') return 'Ended';
  if (campaign.phase === 'requested') return 'Awaiting confirmation';
  const start = localInstant(campaign.rule.startsAt),
    end = localInstant(campaign.rule.endsAt);
  if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)))
    return 'Needs attention';
  if (end !== null && now >= end) return 'Ended';
  if (!ruleMatches(campaign, item) || item?.sources.price !== 'nexg') return 'Needs attention';
  if (campaign.phase === 'paused') return 'Paused';
  if (
    !item ||
    item.publication !== 'published' ||
    item.sync !== 'current' ||
    item.availabilityPaused ||
    (schemas[item.schemaId]?.capacity === 'stock' &&
      (!item.availabilityLinked || item.stock === undefined || item.stock <= 0))
  )
    return 'Needs attention';
  return start !== null && now < start ? 'Scheduled' : 'Active';
}
export const isHistory = (state: DisplayState) =>
  ['Ended', 'Cancelled', 'Rejected'].includes(state);
export function benefitLabel(campaign: Campaign) {
  if (campaign.kind === 'featured') return 'Featured placement';
  if (!campaign.rule.value) return 'Discount not set';
  return campaign.rule.kind === 'percentage'
    ? `${campaign.rule.value}% off`
    : `${money(campaign.rule.value)} off`;
}
export function emptyCampaign(profile: OfferingProfile, offeringId = '', id = ''): Campaign {
  return {
    id,
    profileId: profile.id,
    version: 0,
    name: '',
    kind: 'offer',
    offeringId,
    phase: 'draft',
    rule: { kind: 'percentage', value: '', startsAt: '', endsAt: '' },
    placement: {
      surface: 'homepage',
      startsOn: new Date(Date.now() + 7 * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 10),
      weeks: 1,
    },
    updatedAt: new Date().toISOString(),
    history: [],
  };
}
/** Add self-contained examples without altering any existing offering or campaign. */
export function initialPromotions(
  profile: OfferingProfile,
  existing: Catalogue,
): { catalogue: PromotionCatalogue; data: PromotionData } {
  const catalogue: PromotionCatalogue = structuredClone(existing);
  const now = Date.now();
  const local = (days: number) =>
    new Date(now + days * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 16);
  const stamp = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const eligible = catalogue.offerings.filter(
    (item) =>
      item.publication === 'published' &&
      item.sources.price === 'nexg' &&
      ['fixed', 'unit'].includes(item.priceMode) &&
      moneyMinor(item.price) !== null,
  );
  const product = eligible.find((item) => schemas[item.schemaId]?.model === 'ORDER') ?? eligible[0];
  const service =
    eligible.find((item) => schemas[item.schemaId]?.model === 'APPOINTMENT') ?? eligible[0];
  const uniqueId = (base: string) => {
    let id = base,
      suffix = 2;
    while (catalogue.offerings.some((item) => item.id === id)) id = `${base}-${suffix++}`;
    return id;
  };
  const copy = (
    template: Offering | undefined,
    name: string,
    index: number,
  ): Offering | undefined => {
    if (!template) return undefined;
    const item = structuredClone(template);
    item.id = uniqueId(`${profile.id}-promotion-example-${index}`);
    item.name = name;
    item.version = 1;
    item.history = [{ at: stamp(-8), action: 'Example offering created', version: 1 }];
    delete item.discount;
    if (profile.id === 'makeup' && schemas[item.schemaId]?.model === 'ORDER') {
      item.price = '2400';
      item.variants = [];
      item.image = '/images/best-sellers/beauty.jpg';
    }
    catalogue.offerings.push(item);
    return item;
  };
  const first = copy(
    product,
    profile.id === 'makeup' ? 'Care essentials bundle' : `${profile.name} special`,
    1,
  );
  const second = copy(
    service,
    profile.id === 'makeup' ? 'Quiet-hour makeup' : `${profile.name} appointment`,
    2,
  );
  const third = copy(
    product,
    profile.id === 'makeup' ? 'Gift-ready set' : `${profile.name} selection`,
    3,
  );
  const make = (
    id: string,
    name: string,
    item: Offering | undefined,
    rule: Campaign['rule'],
    phase: Phase,
    kind: PromotionKind = 'offer',
  ): Campaign => {
    const campaign: Campaign = {
      ...emptyCampaign(profile, item?.id ?? '', `${profile.id}-promotion-${id}`),
      name,
      kind,
      rule,
      phase,
      version: 1,
      updatedAt: stamp(-1),
      history: [{ at: stamp(-1), action: 'Example promotion created', version: 1 }],
    };
    if (item && phase === 'running') {
      item.discount = { ...rule, enabled: true };
      campaign.appliedRule = { ...item.discount };
    }
    return campaign;
  };
  const percent = (value: string, startsAt = '', endsAt = '') => ({
    kind: 'percentage' as const,
    value,
    startsAt,
    endsAt,
  });
  const active = make(
    'weekend',
    profile.id === 'makeup' ? 'Weekend essentials' : `${profile.name} special`,
    first,
    percent('10', local(-1), local(8)),
    first ? 'running' : 'draft',
  );
  const scheduled = make(
    'quiet',
    profile.id === 'makeup' ? 'Quiet-hour appointments' : 'Coming soon',
    second,
    percent('15', local(2), local(9)),
    second ? 'running' : 'draft',
  );
  const gift = make(
    'gift',
    profile.id === 'makeup' ? 'Gift-ready sets' : 'Seasonal offer',
    third,
    { kind: 'amount', value: '300', startsAt: local(-1), endsAt: local(8) },
    third && moneyMinor(third.price)! >= 30000 ? 'running' : 'draft',
  );
  const featured = make(
    'featured',
    'November preview',
    undefined,
    percent(''),
    'draft',
    'featured',
  );
  const attention = make('attention', 'Delivery savings', undefined, percent('10'), 'running');
  attention.offeringId = `${profile.id}-unavailable-example`;
  const history = [
    make('history-1', 'Weekend essentials - October', first, percent('10'), 'ended'),
    make('history-2', 'October storefront', first, percent(''), 'ended', 'featured'),
    make('history-3', 'Delivery savings - October', first, percent('10'), 'cancelled'),
    make('history-4', 'Gift guide spotlight', first, percent(''), 'rejected', 'featured'),
  ];
  history.forEach((campaign, index) => {
    campaign.updatedAt = stamp(-index - 2);
    campaign.version = 2;
    campaign.history = [
      {
        at: stamp(-index - 2),
        action:
          campaign.phase === 'ended'
            ? 'Ended as scheduled'
            : campaign.phase === 'rejected'
              ? 'Request declined'
              : 'Promotion cancelled',
        version: 2,
      },
      { at: stamp(-index - 5), action: 'Example terms updated', version: 2 },
      { at: stamp(-index - 8), action: 'Example promotion created', version: 1 },
    ];
    campaign.archivedPreview =
      publicSnapshot({ ...campaign, phase: 'running' }, first, now) ?? undefined;
  });
  const data: PromotionData = {
    version: 1,
    revision: 0,
    campaigns: [active, scheduled, gift, featured, attention, ...history],
  };
  catalogue.promotionsPreview = data;
  return { catalogue, data };
}
export function validateCampaign(
  campaign: Campaign,
  item: Offering | undefined,
  publish: boolean,
): string[] {
  const errors: string[] = [];
  if (!campaign.name.trim() || campaign.name.length > 120)
    errors.push('Enter a promotion name of up to 120 characters.');
  if (!['offer', 'featured'].includes(campaign.kind))
    errors.push('Choose a supported promotion type.');
  if (campaign.kind === 'featured') {
    if (campaign.offeringId && (!item || item.profileId !== campaign.profileId))
      errors.push('Choose an offering from this business activity.');
    if (publish) {
      const placement = campaign.placement;
      if (
        !placement ||
        !['homepage', 'category', 'popular'].includes(placement.surface) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(placement.startsOn) ||
        !Number.isFinite(localInstant(`${placement.startsOn}T00:00`)) ||
        !Number.isInteger(placement.weeks) ||
        placement.weeks < 1 ||
        placement.weeks > 12
      )
        errors.push('Choose a placement, valid start date and duration.');
    }
    return errors;
  }
  if (!item) {
    if (publish) errors.push('Choose an existing offering.');
    return errors;
  }
  if (item.profileId !== campaign.profileId)
    errors.push('Choose an offering from this business activity.');
  if (publish && item.publication !== 'published')
    errors.push('Publish the offering before using it in a promotion.');
  if (publish && item.sources.price !== 'nexg')
    errors.push('The price is managed by a connected system. Manage its discount there.');
  if (publish && item.sync !== 'current')
    errors.push('Refresh the offering source before applying a promotion.');
  if (publish && !['fixed', 'unit'].includes(item.priceMode))
    errors.push('An automatic offer needs a known fixed or unit price.');
  const value = moneyMinor(campaign.rule.value);
  const bases = item.variants.length
    ? item.variants.map((v) => moneyMinor(v.price))
    : [moneyMinor(item.price)];
  if (
    (publish || campaign.rule.value) &&
    (value === null ||
      value <= 0 ||
      (campaign.rule.kind === 'percentage' && value > 10000) ||
      (campaign.rule.kind === 'amount' &&
        bases.some((b) => b === null || (value !== null && value > b))))
  )
    errors.push('Enter a positive discount, up to 100% or no greater than each eligible price.');
  if (publish && bases.some((b) => b === null))
    errors.push('Set a price for every selected variant.');
  const start = localInstant(campaign.rule.startsAt),
    end = localInstant(campaign.rule.endsAt);
  if (
    (start !== null && !Number.isFinite(start)) ||
    (end !== null && !Number.isFinite(end)) ||
    (start !== null && end !== null && end <= start)
  )
    errors.push('Enter a valid start and end, with the end after the start.');
  return errors;
}

export function storefrontSnapshot(profile: OfferingProfile): PublicSnapshot {
  return {
    name: profile.id === 'makeup' ? 'Nairobi Collective' : `${profile.name} business`,
    description: `Discover ${profile.name.toLowerCase()} and more.`,
    image:
      profile.id === 'makeup'
        ? '/images/categories/beauty.jpg'
        : '/images/categories/marketplace.jpg',
    unit: '',
    action: 'View business',
    baseMinor: null,
    priceMinor: null,
    benefit: 'Featured placement',
    terms: 'Sponsored business placement.',
    isStorefront: true,
  };
}

export function publicSnapshot(
  campaign: Campaign,
  item?: Offering,
  at = Date.now(),
  variantId?: string,
): PublicSnapshot | null {
  if (!item) return null;
  const schema = schemas[item.schemaId];
  if (!schema) return null;
  const candidate: Offering =
    campaign.kind === 'offer'
      ? { ...item, discount: { ...campaign.rule, enabled: campaign.phase !== 'paused' } }
      : item;
  const variant = item.variants.find((v) => v.id === variantId) ?? item.variants[0];
  const base = ['quote', 'enquiry'].includes(item.priceMode)
    ? null
    : moneyMinor(variant?.price ?? item.price);
  const price = base === null ? null : discountedMinor(candidate, base, at);
  const benefit =
    campaign.kind === 'featured'
      ? 'Featured placement'
      : !campaign.rule.value
        ? 'Discount not set'
        : campaign.phase === 'paused'
          ? 'Offer paused'
          : base !== null && price !== null && price < base
            ? benefitLabel(campaign)
            : 'Offer not active at this time';
  const details = [
    ...(variant?.name ? [{ label: 'Selected option', value: variant.name }] : []),
    ...Object.entries(item.fields)
      .filter(([key, value]) => publicFields[key] && value !== '' && value !== undefined)
      .map(([key, value]) => ({ label: publicFields[key]!, value: String(value) })),
    ...(item.optionGroups ?? []).flatMap((group) => {
      const choices = group.choices.filter(
        (choice) =>
          choice.name &&
          (!choice.variantIds.length || (variant && choice.variantIds.includes(variant.id))),
      );
      if (!group.name || !choices.length) return [];
      return [
        {
          label: `Available ${group.name}`,
          value: choices
            .map((choice) => {
              const extra = moneyMinor(choice.extra);
              return extra !== null && extra > 0
                ? `${choice.name} (+${money(choice.extra)})`
                : choice.name;
            })
            .join(', '),
        },
      ];
    }),
  ];
  return {
    name: item.name,
    description: item.description,
    image: item.image,
    unit: item.unit,
    action: schema.action,
    baseMinor: base,
    priceMinor: price,
    benefit,
    terms:
      [
        campaign.rule.startsAt ? `Starts ${campaign.rule.startsAt.replace('T', ' ')}` : '',
        campaign.rule.endsAt ? `Ends ${campaign.rule.endsAt.replace('T', ' ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'See offering details.',
    details,
  };
}
