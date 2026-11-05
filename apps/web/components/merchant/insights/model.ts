import { listBookingProfiles } from '@nexg/booking-config/profiles';
import type {
  BookingModel,
  CampaignRow,
  CustomerRow,
  DateBasis,
  DateRange,
  InsightFilters,
  InsightMetric,
  InsightPermissionPolicy,
  InsightRecord,
  InsightReport,
  InsightStatus,
  InsightsSourceSnapshot,
  InsightTab,
  InsightView,
  MenuRow,
  MetricDefinition,
  OperationRow,
  SourceCoverage,
  SourceKind,
} from './types';
export * from './types';

export const profiles = listBookingProfiles();
export const INSIGHT_TIMEZONE = 'Africa/Nairobi' as const;
export const MODEL_REPORTS: Record<
  BookingModel,
  {
    label: string;
    tab: string;
    offering: string;
    unit: string;
    metricId: string;
    description: string;
  }
> = {
  ORDER: {
    label: 'Orders',
    tab: 'orders',
    offering: 'Products',
    unit: 'orders',
    metricId: 'order_completed',
    description: 'Orders and declared item quantities, with separate financial outcomes.',
  },
  APPOINTMENT: {
    label: 'Appointments',
    tab: 'appointments',
    offering: 'Services',
    unit: 'appointments',
    metricId: 'appointment_outcomes',
    description: 'Scheduled appointment outcomes and usable provider time.',
  },
  FIELD_VISIT: {
    label: 'Visits',
    tab: 'visits',
    offering: 'Services',
    unit: 'visits',
    metricId: 'visit_on_time',
    description: 'Accepted arrival windows and actual recorded arrivals.',
  },
  ASSET_INTERVAL: {
    label: 'Rentals',
    tab: 'rentals',
    offering: 'Fleet',
    unit: 'rentals',
    metricId: 'asset_reserved_util',
    description: 'Reserved and actual-used asset time against usable asset capacity.',
  },
  TRANSFER: {
    label: 'Transfers',
    tab: 'transfers',
    offering: 'Services',
    unit: 'transfers',
    metricId: 'transfer_on_time',
    description: 'Actual trip or greeting commitments and milestone evidence.',
  },
  SESSION_CAPACITY: {
    label: 'Sessions',
    tab: 'bookings',
    offering: 'Experiences',
    unit: 'places',
    metricId: 'booked_place_fill',
    description: 'Dated occurrence places, reservations and recorded attendance.',
  },
  SPACE_RESERVATION: {
    label: 'Spaces',
    tab: 'bookings',
    offering: 'Spaces',
    unit: 'space-minutes',
    metricId: 'space_reserved_util',
    description: 'Compatible table or event-space intervals, not room-night inventory.',
  },
  TOUR: {
    label: 'Tours',
    tab: 'bookings',
    offering: 'Experiences',
    unit: 'tours',
    metricId: 'tour_operated',
    description: 'Actual departures and supplier-confirmed tour outcomes.',
  },
  PRODUCTION_DUE: {
    label: 'Production',
    tab: 'production',
    offering: 'Products',
    unit: 'production jobs',
    metricId: 'production_on_time',
    description: 'Accepted production work and versioned due commitments.',
  },
  REQUEST_QUOTE: {
    label: 'Quotes',
    tab: 'quotes',
    offering: 'Services',
    unit: 'requests',
    metricId: 'request_with_accepted_quote_rate',
    description: 'Requests that reached accepted quotes, with open requests retained.',
  },
  LINKED_WINDOWS: {
    label: 'Collections',
    tab: 'collections',
    offering: 'Services',
    unit: 'linked jobs',
    metricId: 'linked_windows_on_time',
    description: 'Collection and return promises linked to one parent work identity.',
  },
  SERVICE_JOB: {
    label: 'Jobs',
    tab: 'jobs',
    offering: 'Services',
    unit: 'jobs',
    metricId: 'job_outcomes',
    description: 'Assessment, approval, execution and recorded job completion.',
  },
  ENTITLEMENT: {
    label: 'Passes',
    tab: 'passes',
    offering: 'Services',
    unit: 'rights',
    metricId: 'entitlement_issued',
    description: 'Rights issued and valid uses, separate from session attendance.',
  },
  FREIGHT: {
    label: 'Shipments',
    tab: 'shipments',
    offering: 'Services',
    unit: 'shipments',
    metricId: 'freight_milestone_on_time',
    description: 'Accepted shipment milestones, custody and unknown evidence.',
  },
  STORAGE: {
    label: 'Storage',
    tab: 'storage',
    offering: 'Spaces',
    unit: 'pallet-minutes',
    metricId: 'storage_occupied_util',
    description: 'Compatible typed storage capacity and actual occupied intervals.',
  },
};

const modelIds = Object.keys(MODEL_REPORTS) as BookingModel[];
const TAB_ORDER = [
  'overview',
  'orders',
  'appointments',
  'rentals',
  'transfers',
  'visits',
  'bookings',
  'quotes',
  'production',
  'jobs',
  'collections',
  'shipments',
  'storage',
  'passes',
  'menu',
  'products',
  'services',
  'fleet',
  'experiences',
  'spaces',
  'capacity',
  'staff',
  'customers',
  'operations',
  'reviews',
  'promotions',
  'finance',
  'reports',
];
const title = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
const def = (
  id: string,
  label: string,
  models: BookingModel[] | '*',
  unit: string,
  dateBasis: DateBasis,
  requiredSources: SourceKind[],
  reportId: string,
  definition: string,
  format: MetricDefinition['format'] = 'count',
  permission?: MetricDefinition['permission'],
): MetricDefinition => ({
  id,
  label,
  question: label,
  models,
  unit,
  dateBasis,
  requiredSources,
  reportId,
  definition,
  format,
  permission,
  version: '1',
});
export const METRIC_DEFINITIONS: MetricDefinition[] = [
  def(
    'work_requested',
    'Requests received',
    '*',
    'work records',
    'requested',
    ['work'],
    'RPT_WORK_OUTCOMES',
    'Distinct authorized work identities received in period, grouped by actual model.',
  ),
  def(
    'work_completed',
    'Completed work',
    '*',
    'work records',
    'completed',
    ['work'],
    'RPT_WORK_OUTCOMES',
    'Distinct actual model completion events in period. Refunds do not erase completion.',
  ),
  def(
    'order_completed',
    'Completed orders',
    ['ORDER'],
    'orders',
    'completed',
    ['work'],
    'RPT_ORDER_OUTCOMES',
    'Orders with an actual completion event in period.',
  ),
  def(
    'order_cohort_completed',
    'Completed request-cohort orders',
    ['ORDER'],
    'orders',
    'requested',
    ['work'],
    'RPT_ORDER_OUTCOMES',
    'Completed members of the request-received cohort, observed as of the source update. Carry-in requests are excluded.',
  ),
  def(
    'order_cancelled',
    'Cancelled requests',
    ['ORDER'],
    'requests',
    'requested',
    ['work'],
    'RPT_ORDER_OUTCOMES',
    'Cancelled members of the request-received cohort, observed as of the source update.',
  ),
  def(
    'order_open',
    'Open requests',
    ['ORDER'],
    'requests',
    'requested',
    ['work'],
    'RPT_ORDER_OUTCOMES',
    'Explicitly open members of the request-received cohort, not inferred failures.',
  ),
  def(
    'order_units',
    'Units fulfilled',
    ['ORDER'],
    'declared item units',
    'completed',
    ['work', 'items'],
    'RPT_ORDER_VARIANTS',
    'Sum of known fulfilled quantities in one compatible declared unit. Mixed or unknown units are unavailable.',
  ),
  def(
    'order_item_sales',
    'Item sales before refunds',
    ['ORDER'],
    'KES',
    'completed',
    ['work', 'items'],
    'RPT_ORDER_VARIANTS',
    'Accepted historical item amounts on completed work. Excludes delivery/service fees and tips; refunds use separate postings.',
    'money',
    'finance',
  ),
  def(
    'order_average_item_sales',
    'Average item sales / order',
    ['ORDER'],
    'KES',
    'completed',
    ['work', 'items'],
    'RPT_ORDER_VARIANTS',
    'Known completed-cohort item amounts divided by completed orders. Not profit, payout or recognized sales.',
    'money',
    'finance',
  ),
  def(
    'order_ready_on_time',
    'Ready on time',
    ['ORDER'],
    'percent',
    'completed',
    ['work', 'operations'],
    'RPT_ORDER_READINESS',
    'Actual-ready instant at or before accepted ready promise, divided by completed records with both instants. Missing promises remain visible.',
    'percent',
  ),
  def(
    'missing_ready_promises',
    'Missing ready promises',
    ['ORDER'],
    'completed orders',
    'completed',
    ['work', 'operations'],
    'RPT_ORDER_READINESS',
    'Completed orders without a recorded accepted ready promise.',
  ),
  def(
    'preparation_median',
    'Median preparation',
    ['ORDER'],
    'minutes',
    'completed',
    ['work', 'operations'],
    'RPT_ORDER_READINESS',
    'Median actual kitchen-start to actual-ready duration among valid paired events. Creation/completion times are not substituted.',
    'minutes',
  ),
  def(
    'identified_customers',
    'Identified customers',
    '*',
    'merchant-scoped identities',
    'completed',
    ['work', 'customers'],
    'RPT_REPEAT_ACTIVITY',
    'Distinct permitted merchant-scoped identities with completed work in period.',
    'count',
    'customers',
  ),
  def(
    'first_time_customers',
    'First-time customers',
    '*',
    'identities',
    'completed',
    ['work', 'customers'],
    'RPT_REPEAT_ACTIVITY',
    'Identities whose owner-confirmed first completed work is in this period.',
    'count',
    'customers',
  ),
  def(
    'returning_customers',
    'Returning customers',
    '*',
    'identities',
    'completed',
    ['work', 'customers'],
    'RPT_REPEAT_ACTIVITY',
    'Identities with confirmed completion before the period and at least one completion in the period.',
    'count',
    'customers',
  ),
  def(
    'returning_share',
    'Returning share',
    '*',
    'percent',
    'completed',
    ['work', 'customers'],
    'RPT_REPEAT_ACTIVITY',
    'Returning merchant-scoped identities divided by all identified completed-cohort identities. Unknown history is not first time.',
    'percent',
    'customers',
  ),
  def(
    'qualified_impressions',
    'Qualified impressions',
    '*',
    'events',
    'occurred',
    ['campaigns'],
    'RPT_CAMPAIGN_MEASUREMENT',
    'Source-confirmed qualified impression events, not unique people.',
    'count',
    'promotions',
  ),
  def(
    'qualified_taps',
    'Qualified taps',
    '*',
    'events',
    'occurred',
    ['campaigns'],
    'RPT_CAMPAIGN_MEASUREMENT',
    'Source-confirmed qualified tap events.',
    'count',
    'promotions',
  ),
  def(
    'tap_impression_ratio',
    'Tap / impression event ratio',
    '*',
    'percent',
    'occurred',
    ['campaigns'],
    'RPT_CAMPAIGN_MEASUREMENT',
    'Qualified taps divided by qualified impressions; an event ratio, not a people conversion rate.',
    'percent',
    'promotions',
  ),
  def(
    'attributed_orders',
    'Attributed accepted orders',
    ['ORDER'],
    'accepted orders',
    'occurred',
    ['campaigns'],
    'RPT_CAMPAIGN_MEASUREMENT',
    'Deduplicated source-attributed accepted orders under a declared closed tap window. Does not establish causal lift or value.',
    'count',
    'promotions',
  ),
  def(
    'orders_per_tap_ratio',
    'Orders / tap event ratio',
    ['ORDER'],
    'percent',
    'occurred',
    ['campaigns'],
    'RPT_CAMPAIGN_MEASUREMENT',
    'Attributed accepted orders divided by qualified taps in the same closed observed cohort.',
    'percent',
    'promotions',
  ),
  def(
    'merchant_credits',
    'Posted merchant credits',
    '*',
    'KES',
    'posted',
    ['finance'],
    'RPT_POSTED_MERCHANT_ACTIVITY',
    'Authoritative merchant-credit postings in period in one currency.',
    'money',
    'finance',
  ),
  def(
    'refund_debits',
    'Refund debits',
    '*',
    'KES',
    'posted',
    ['finance'],
    'RPT_POSTED_MERCHANT_ACTIVITY',
    'Authoritative refund-debit postings in period, separate from work outcomes.',
    'money',
    'finance',
  ),
  def(
    'fee_debits',
    'Recorded fee debits',
    '*',
    'KES',
    'posted',
    ['finance'],
    'RPT_POSTED_MERCHANT_ACTIVITY',
    'Actual recorded fee debits; this calculation establishes no tariff.',
    'money',
    'finance',
  ),
  def(
    'net_posted_credit',
    'Net posted credit',
    '*',
    'KES',
    'posted',
    ['finance'],
    'RPT_POSTED_MERCHANT_ACTIVITY',
    'Merchant credits less refund and fee debits. Excludes payouts, holds and pending activity; not profit.',
    'money',
    'finance',
  ),
  def(
    'appointment_outcomes',
    'Completed appointments',
    ['APPOINTMENT'],
    'appointments',
    'completed',
    ['work'],
    'RPT_APPOINTMENT_OUTCOMES',
    'Appointments with actual administrative completion evidence.',
  ),
  def(
    'appointment_confirmed_rate',
    'Confirmed requests',
    ['APPOINTMENT'],
    'percent',
    'requested',
    ['work'],
    'RPT_APPOINTMENT_OUTCOMES',
    'Confirmed or later completed members divided by the same request cohort.',
    'percent',
  ),
  def(
    'provider_reserved_util',
    'Reserved provider time',
    ['APPOINTMENT', 'FIELD_VISIT'],
    'percent',
    'occurred',
    ['capacity'],
    'RPT_PROVIDER_CAPACITY',
    'Source-owned reserved minutes divided by usable provider minutes. No denominator is inferred from headcount.',
    'percent',
  ),
  def(
    'visit_on_time',
    'Arrival within promise',
    ['FIELD_VISIT'],
    'percent',
    'due',
    ['work', 'operations'],
    'RPT_VISIT_ARRIVAL',
    'Recorded arrivals within accepted arrival windows divided by eligible due visits with known evidence.',
    'percent',
  ),
  def(
    'asset_reserved_util',
    'Reserved asset utilization',
    ['ASSET_INTERVAL'],
    'percent',
    'occurred',
    ['capacity'],
    'RPT_ASSET_UTILIZATION',
    'Source-owned reserved asset minutes divided by usable asset minutes after exclusions.',
    'percent',
  ),
  def(
    'asset_used_util',
    'Actual asset utilization',
    ['ASSET_INTERVAL'],
    'percent',
    'occurred',
    ['capacity'],
    'RPT_ASSET_UTILIZATION',
    'Actual-used asset minutes divided by usable asset minutes. Separate from reservations.',
    'percent',
  ),
  def(
    'rental_on_time_return',
    'Returns within promise',
    ['ASSET_INTERVAL'],
    'percent',
    'due',
    ['work', 'operations'],
    'RPT_RENTAL_RETURNS',
    'Actual return at or before the accepted return instant, among eligible due records.',
    'percent',
  ),
  def(
    'transfer_on_time',
    'Pickup / meeting within promise',
    ['TRANSFER'],
    'percent',
    'due',
    ['work', 'operations'],
    'RPT_TRANSFER_PROMISES',
    'Actual pickup or greeting milestone compared with its specific accepted promise.',
    'percent',
  ),
  def(
    'booked_place_fill',
    'Place fill',
    ['SESSION_CAPACITY'],
    'percent',
    'occurred',
    ['capacity'],
    'RPT_SESSION_PLACES',
    'Reserved places divided by source-confirmed usable places for actual occurrences, shared pools counted once.',
    'percent',
  ),
  def(
    'session_attendance',
    'Recorded attendance',
    ['SESSION_CAPACITY'],
    'places',
    'scheduled',
    ['work'],
    'RPT_SESSION_PLACES',
    'Sum of known actual attended places; a reservation or sold pass is not attendance.',
  ),
  def(
    'space_reserved_util',
    'Reserved space utilization',
    ['SPACE_RESERVATION'],
    'percent',
    'occurred',
    ['capacity'],
    'RPT_SPACE_CAPACITY',
    'Reserved compatible space minutes divided by usable space minutes. Not guest count or lodging occupancy.',
    'percent',
  ),
  def(
    'tour_operated',
    'Completed tours',
    ['TOUR'],
    'tours',
    'completed',
    ['work'],
    'RPT_TOUR_DEPARTURES',
    'Actual operated/completed tours, separate from supplier enquiry or departure places.',
  ),
  def(
    'production_on_time',
    'Production completed by due date',
    ['PRODUCTION_DUE'],
    'percent',
    'due',
    ['work'],
    'RPT_PRODUCTION_PROMISES',
    'Accepted production jobs completed by accepted local due date divided by due jobs; open overdue jobs remain in the cohort.',
    'percent',
  ),
  def(
    'request_with_accepted_quote_rate',
    'Requests with accepted quote',
    ['REQUEST_QUOTE'],
    'percent',
    'requested',
    ['work'],
    'RPT_REQUEST_QUOTES',
    'Distinct request identities reaching an accepted quote divided by the request cohort as of the stated update. Not quote-issued decision acceptance.',
    'percent',
  ),
  def(
    'accepted_quote_value',
    'Accepted quote value',
    ['REQUEST_QUOTE'],
    'money',
    'requested',
    ['work'],
    'RPT_REQUEST_QUOTES',
    'Total quoted amount for accepted requests in the selected cohort.',
    'currency',
  ),
  def(
    'linked_windows_on_time',
    'Collection and return promises met',
    ['LINKED_WINDOWS'],
    'percent',
    'due',
    ['work', 'operations'],
    'RPT_LINKED_PROMISES',
    'One linked parent job qualifies only when recorded collection and return both meet their accepted promises.',
    'percent',
  ),
  def(
    'job_outcomes',
    'Completed service jobs',
    ['SERVICE_JOB'],
    'jobs',
    'completed',
    ['work'],
    'RPT_SERVICE_JOBS',
    'Actual completed service jobs; an intake appointment is a different work identity.',
  ),
  def(
    'entitlement_issued',
    'Rights issued',
    ['ENTITLEMENT'],
    'rights',
    'requested',
    ['work'],
    'RPT_ENTITLEMENT_USAGE',
    'Recorded entitlement issuance identities; issuance does not prove attendance or renewal consent.',
  ),
  def(
    'entitlement_redemptions',
    'Valid redemptions',
    ['ENTITLEMENT'],
    'uses',
    'occurred',
    ['work'],
    'RPT_ENTITLEMENT_USAGE',
    'Known owner-confirmed entitlement uses in period, including rights issued earlier.',
  ),
  def(
    'freight_milestone_on_time',
    'Shipment milestone within promise',
    ['FREIGHT'],
    'percent',
    'due',
    ['work', 'operations'],
    'RPT_FREIGHT_MILESTONES',
    'Recorded shipment milestone at or before its accepted promise, among eligible due shipments. No scan is invented.',
    'percent',
  ),
  def(
    'storage_occupied_util',
    'Occupied storage capacity',
    ['STORAGE'],
    'percent',
    'occurred',
    ['capacity'],
    'RPT_STORAGE_CAPACITY',
    'Actual occupied pallet-minutes divided by compatible usable pallet-minutes; area/volume units cannot mix.',
    'percent',
  ),
];

export const REPORTS: InsightReport[] = [
  {
    id: 'RPT_SOURCE_COVERAGE',
    label: 'Source coverage',
    area: 'All areas',
    models: '*',
    metricIds: [],
    dateBasis: 'occurred',
  },
  ...[...new Set(METRIC_DEFINITIONS.map((metric) => metric.reportId))].map((id): InsightReport => {
    const metrics = METRIC_DEFINITIONS.filter((metric) => metric.reportId === id);
    const wildcard = metrics.some((metric) => metric.models === '*');
    return {
      id,
      label:
        (
          {
            RPT_ORDER_OUTCOMES: 'Order outcomes',
            RPT_ORDER_VARIANTS: 'Menu / offering performance',
            RPT_ORDER_READINESS: 'Ready promise timing',
            RPT_REPEAT_ACTIVITY: 'Returning customer activity',
            RPT_CAMPAIGN_MEASUREMENT: 'Campaign measurement',
            RPT_POSTED_MERCHANT_ACTIVITY: 'Posted merchant activity',
          } as Record<string, string>
        )[id] || metrics[0]!.label,
      area: id.includes('POSTED')
        ? 'Finance'
        : id.includes('CAMPAIGN')
          ? 'Promotions'
          : id.includes('REPEAT')
            ? 'Customers'
            : metrics[0]!.models === '*'
              ? 'Operations'
              : MODEL_REPORTS[metrics[0]!.models[0]!].label,
      models: wildcard
        ? '*'
        : [...new Set(metrics.flatMap((metric) => (metric.models === '*' ? [] : metric.models)))],
      metricIds: metrics.map((metric) => metric.id),
      dateBasis: id === 'RPT_ORDER_OUTCOMES' ? 'requested' : metrics[0]!.dateBasis,
    };
  }),
  {
    id: 'RPT_PUBLISHED_FEEDBACK',
    label: 'Published feedback',
    area: 'Customers',
    models: '*',
    metricIds: [],
    dateBasis: 'occurred',
    status: 'unavailable',
    reason: 'A published-feedback source has not been supplied.',
  },
];

function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function parseDateRange(from: string, to: string): DateRange {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error('Choose a valid ordered date-only range.');
  return { from, to };
}
export function addDateDays(value: string, days: number) {
  if (!validDate(value) || !Number.isInteger(days))
    throw new Error('Invalid date-only arithmetic.');
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function previousDateRange(range: DateRange): DateRange {
  parseDateRange(range.from, range.to);
  const days =
    Math.round(
      (Date.parse(`${range.to}T12:00:00Z`) - Date.parse(`${range.from}T12:00:00Z`)) / 86400000,
    ) + 1;
  return { from: addDateDays(range.from, -days), to: addDateDays(range.from, -1) };
}
export function localDateInNairobi(instant: string) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(instant) || !Number.isFinite(Date.parse(instant)))
    throw new Error('An explicit-offset instant is required.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INSIGHT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const read = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}
const recordDate = (row: InsightRecord, basis: DateBasis) =>
  basis === 'completed'
    ? row.completedOn
    : basis === 'scheduled'
      ? row.scheduledOn
      : basis === 'due'
        ? row.dueOn
        : basis === 'occurred'
          ? row.occurredOn || row.completedOn || row.requestedOn
          : row.requestedOn;
const knownInstant = (value: string | null | undefined) =>
  value && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
    ? Date.parse(value)
    : null;
const ratio = (numerator: number, denominator: number) => ({
  value: denominator > 0 ? (numerator / denominator) * 100 : null,
  numerator,
  denominator,
  ...(denominator > 0 ? {} : { reason: 'No eligible denominator in this scope.' }),
});
function unique<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const previous = map.get(row.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row))
      throw new Error(`Conflicting evidence for ${row.id}.`);
    map.set(row.id, row);
  }
  return [...map.values()];
}
function admittedModels(snapshot: InsightsSourceSnapshot, policy: InsightPermissionPolicy) {
  return policy.canRead
    ? [...new Set(snapshot.enabledModels)].filter(
        (model) => modelIds.includes(model) && policy.allowedModels.includes(model),
      )
    : [];
}
export function resolveInsightTabs(
  snapshot: InsightsSourceSnapshot,
  policy: InsightPermissionPolicy,
): InsightTab[] {
  if (!policy.canRead) return [];
  const models = admittedModels(snapshot, policy);
  const map = new Map<string, InsightTab>();
  const put = (key: string, label: string, model?: BookingModel) => {
    const previous = map.get(key);
    map.set(key, {
      key,
      label,
      models: [...new Set([...(previous?.models || []), ...(model ? [model] : [])])],
    });
  };
  put('overview', 'Overview');
  for (const model of models)
    put(
      MODEL_REPORTS[model].tab,
      MODEL_REPORTS[model].tab === 'bookings' ? 'Bookings' : MODEL_REPORTS[model].label,
      model,
    );
  for (const offering of snapshot.offerings.filter(
    (offering) =>
      offering.enabled &&
      models.includes(offering.model) &&
      offering.locationIds.some((id) => policy.allowedLocationIds.includes(id)),
  ))
    put(offering.presentation, title(offering.presentation), offering.model);
  if (
    snapshot.capacity.some(
      (row) => models.includes(row.model) && policy.allowedLocationIds.includes(row.locationId),
    ) &&
    !(models.length === 1 && models[0] === 'ASSET_INTERVAL' && map.has('fleet'))
  )
    put(
      'capacity',
      models.length === 1 && models[0] === 'TOUR'
        ? 'Departures'
        : models.length === 1 && models[0] === 'SESSION_CAPACITY'
          ? 'Sessions'
          : 'Capacity',
    );
  if (models.length && policy.canReadCustomers) put('customers', 'Customers');
  if (models.length) put('operations', 'Operations');
  if (models.length && policy.canReadPromotions) put('promotions', 'Promotions');
  if (models.length && policy.canReadFinance) put('finance', 'Finance');
  put('reports', 'Reports');
  return [...map.values()].sort((a, b) => TAB_ORDER.indexOf(a.key) - TAB_ORDER.indexOf(b.key));
}

function coverageStatus(
  rows: SourceCoverage[],
  kind: SourceKind,
  model: BookingModel,
  locationId: string,
  range: DateRange,
): InsightStatus {
  const matching = rows.filter(
    (row) =>
      row.kind === kind &&
      row.model === model &&
      row.locationId === locationId &&
      row.status !== 'unavailable' &&
      row.to >= range.from &&
      row.from <= range.to,
  );
  if (!matching.length) return 'unavailable';
  let cursor = range.from;
  for (const row of matching
    .filter((row) => row.status === 'ready')
    .sort((a, b) => a.from.localeCompare(b.from))) {
    if (row.from > cursor) break;
    if (row.to >= range.to) return 'ready';
    if (row.to >= cursor) cursor = addDateDays(row.to, 1);
  }
  return 'partial';
}

export function buildInsights(
  snapshot: InsightsSourceSnapshot,
  filters: InsightFilters,
  policy: InsightPermissionPolicy,
): InsightView {
  const range = parseDateRange(filters.from, filters.to);
  const keyword = filters.keyword.trim().toLocaleLowerCase('en');
  const dateValidity = new Map<string, boolean>();
  const inRange = (value: string | null | undefined, selected: DateRange) => {
    if (!value) return false;
    let valid = dateValidity.get(value);
    if (valid === undefined) {
      valid = validDate(value);
      dateValidity.set(value, valid);
    }
    return valid && value >= selected.from && value <= selected.to;
  };
  const models = admittedModels(snapshot, policy).filter(
    (model) => filters.activity === 'all' || model === filters.activity,
  );
  const locationIds = snapshot.locations
    .map((location) => location.id)
    .filter(
      (id) =>
        policy.allowedLocationIds.includes(id) &&
        (filters.locationId === 'all' || id === filters.locationId),
    );
  const owns = (row: { model: BookingModel; locationId: string }) =>
    models.includes(row.model) && locationIds.includes(row.locationId);
  const hasText = (...values: (string | undefined | null)[]) =>
    !keyword || values.filter(Boolean).join(' ').toLocaleLowerCase('en').includes(keyword);
  const offerings = new Map(snapshot.offerings.map((offering) => [offering.id, offering]));
  const scoped = unique(snapshot.records).filter(
    (row) =>
      owns(row) &&
      hasText(
        row.reference,
        row.label,
        row.fulfilment,
        row.outcome,
        row.cancellationReason,
        offerings.get(row.offeringId)?.label,
        policy.canReadCustomers ? row.customerId : undefined,
      ),
  );
  const recordsByBasis: Partial<Record<DateBasis, InsightRecord[]>> = {};
  const at = (basis: DateBasis) =>
    (recordsByBasis[basis] ||= scoped.filter((row) => inRange(recordDate(row, basis), range)));
  const requested = at('requested');
  const completed = at('completed').filter((row) => row.outcome === 'completed');
  const orderCompleted = completed.filter((row) => row.model === 'ORDER');
  const completedIds = new Set(orderCompleted.map((row) => row.id));
  const lines = unique(snapshot.lineItems).filter((row) => completedIds.has(row.recordId));
  const recordsWithItems = new Set(lines.map((row) => row.recordId));
  const unknownRequestDateModels = new Set(
    scoped.filter((row) => !validDate(row.requestedOn)).map((row) => row.model),
  );
  const unknownCompletionDateModels = new Set(
    scoped
      .filter(
        (row) => row.outcome === 'completed' && (!row.completedOn || !validDate(row.completedOn)),
      )
      .map((row) => row.model),
  );
  const missingOrderItems = orderCompleted.some((record) => !recordsWithItems.has(record.id));
  const scopedIds = new Set(scoped.map((row) => row.id));
  const postingRows = unique(snapshot.postings).filter(
    (row) =>
      owns(row) &&
      inRange(row.postedOn, range) &&
      (!keyword || hasText(row.reference) || (!!row.recordId && scopedIds.has(row.recordId))),
  );
  const campaignEvents = unique(snapshot.campaignEvents).filter(
    (row) =>
      owns(row) && inRange(row.occurredOn, range) && hasText(row.campaignLabel, row.campaignId),
  );
  const capacityRows = unique(snapshot.capacity).filter(
    (row) => owns(row) && inRange(row.occurredOn, range) && hasText(row.label, row.resourceId),
  );
  const coverage = snapshot.coverage.filter((row) => owns(row));
  const metricModels = (definition: MetricDefinition) =>
    definition.models === '*'
      ? models
      : models.filter((model) => definition.models.includes(model));
  const statusFor = (definition: MetricDefinition): { status: InsightStatus; reason?: string } => {
    if (!policy.canRead || !locationIds.length)
      return { status: 'unavailable', reason: 'This reporting scope is not permitted.' };
    if (
      definition.permission &&
      !{
        finance: policy.canReadFinance,
        customers: policy.canReadCustomers,
        promotions: policy.canReadPromotions,
      }[definition.permission]
    )
      return { status: 'unavailable', reason: 'This report needs a separate permission.' };
    const relevant = metricModels(definition);
    if (!relevant.length)
      return { status: 'unavailable', reason: 'Not applicable to the actual enabled activity.' };
    if (snapshot.status === 'unavailable')
      return {
        status: 'unavailable',
        reason: snapshot.notice || 'The reporting source is unavailable.',
      };
    if (
      definition.requiredSources.includes('work') &&
      relevant.some((model) => unknownRequestDateModels.has(model))
    )
      return { status: 'unavailable', reason: 'Some work evidence has an unknown request date.' };
    if (
      definition.dateBasis === 'completed' &&
      relevant.some((model) => unknownCompletionDateModels.has(model))
    )
      return { status: 'unavailable', reason: 'Some completed work has no valid completion date.' };
    if (definition.requiredSources.includes('items') && missingOrderItems)
      return { status: 'unavailable', reason: 'Some completed orders lack item evidence.' };
    const states = definition.requiredSources.flatMap((kind) =>
      relevant.flatMap((model) =>
        locationIds.map((location) => coverageStatus(coverage, kind, model, location, range)),
      ),
    );
    if (states.includes('unavailable'))
      return {
        status: 'unavailable',
        reason: 'Required source evidence is unavailable for part of the selected scope.',
      };
    if (states.includes('partial'))
      return {
        status: 'partial',
        reason: 'Observed values cover only part of the selected period or source.',
      };
    return { status: 'ready' };
  };
  const customerMap = new Map<string, CustomerRow>();
  if (policy.canReadCustomers)
    for (const row of completed) {
      if (!row.customerId) continue;
      const first = row.customerFirstCompletedOn;
      const cohort: CustomerRow['cohort'] =
        !first || !validDate(first)
          ? 'Unknown'
          : first < range.from
            ? 'Returning'
            : inRange(first, range)
              ? 'First time'
              : 'Unknown';
      const previous = customerMap.get(row.customerId);
      const amount = row.itemAmountMinor;
      customerMap.set(row.customerId, {
        id: row.customerId,
        cohort: previous && previous.cohort !== cohort ? 'Unknown' : cohort,
        orders: (previous?.orders || 0) + 1,
        itemSalesMinor:
          !policy.canReadFinance || amount == null || (previous && previous.itemSalesMinor === null)
            ? null
            : (previous?.itemSalesMinor || 0) + amount,
      });
    }
  const customerRows = [...customerMap.values()].sort(
    (a, b) => b.orders - a.orders || a.id.localeCompare(b.id),
  );
  const minimum = policy.privacyMinimum;
  const customerSafe =
    Number.isSafeInteger(minimum) && minimum! >= 1 && customerRows.length >= minimum!;
  const readyRecords = orderCompleted.filter(
    (row) => knownInstant(row.promiseAt) !== null && knownInstant(row.readyAt) !== null,
  );
  const readyOnTime = readyRecords.filter(
    (row) => knownInstant(row.readyAt)! <= knownInstant(row.promiseAt)!,
  ).length;
  const preparation = orderCompleted
    .flatMap((row) => {
      const start = knownInstant(row.startedAt),
        end = knownInstant(row.readyAt);
      return start !== null && end !== null && end >= start ? [(end - start) / 60000] : [];
    })
    .sort((a, b) => a - b);
  const median = preparation.length
    ? preparation.length % 2
      ? preparation[Math.floor(preparation.length / 2)]!
      : (preparation[preparation.length / 2 - 1]! + preparation[preparation.length / 2]!) / 2
    : null;
  const eventCount = (kind: string) =>
    campaignEvents.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.count, 0);
  const attributionReady =
    campaignEvents.every((row) => row.observationComplete) &&
    new Set(
      campaignEvents
        .filter((row) => row.kind === 'attributed_accepted_order')
        .map((row) => row.attributionWindowMinutes),
    ).size <= 1 &&
    campaignEvents
      .filter((row) => row.kind === 'attributed_accepted_order')
      .every(
        (row) => Number.isFinite(row.attributionWindowMinutes) && row.attributionWindowMinutes! > 0,
      );
  const sumKnown = (values: (number | null | undefined)[]) =>
    values.some((value) => value == null || !Number.isFinite(value))
      ? null
      : values.reduce<number>((sum, value) => sum + value!, 0);
  const moneySum = (values: (number | null | undefined)[]) => {
    if (values.some((value) => !Number.isSafeInteger(value) || value! < 0)) return null;
    const result = sumKnown(values);
    return Number.isSafeInteger(result) ? result : null;
  };
  const itemSales = moneySum(lines.map((row) => row.itemAmountMinor));
  const currencies = new Set(postingRows.map((row) => row.currency));
  const postingSum = (kind: string) =>
    currencies.size > 1 || (currencies.size === 1 && !currencies.has(snapshot.currency))
      ? null
      : moneySum(postingRows.filter((row) => row.kind === kind).map((row) => row.amountMinor));
  const dueRatio = (
    rows: InsightRecord[],
    actual: (row: InsightRecord) => string | null | undefined,
    promised: (row: InsightRecord) => string | null | undefined,
  ) => {
    const eligible = rows.filter(
      (row) => knownInstant(actual(row)) !== null && knownInstant(promised(row)) !== null,
    );
    const result = ratio(
      eligible.filter((row) => knownInstant(actual(row))! <= knownInstant(promised(row))!).length,
      eligible.length,
    );
    return {
      ...result,
      ...(eligible.length < rows.length
        ? {
            status: 'partial' as const,
            reason: `${rows.length - eligible.length} records lack required timing evidence.`,
          }
        : {}),
    };
  };
  type Calculation = {
    value: number | null;
    numerator?: number | null;
    denominator?: number | null;
    reason?: string;
    sampleSize?: number;
    status?: InsightStatus;
    unit?: string;
  };
  const calculate = (definition: MetricDefinition): Calculation => {
    const relevant = metricModels(definition);
    const rows = at(definition.dateBasis).filter((row) => relevant.includes(row.model));
    const done = rows.filter((row) => row.outcome === 'completed');
    const capacity = capacityRows.filter((row) => relevant.includes(row.model));
    switch (definition.id) {
      case 'work_requested':
        return { value: rows.length };
      case 'work_completed':
      case 'order_completed':
      case 'appointment_outcomes':
      case 'tour_operated':
      case 'job_outcomes':
        return { value: done.length };
      case 'order_cancelled':
        return { value: rows.filter((row) => row.outcome === 'cancelled').length };
      case 'order_cohort_completed':
        return { value: done.length };
      case 'order_open':
        return { value: rows.filter((row) => row.outcome === 'open').length };
      case 'order_units':
        return new Set(lines.map((row) => row.unit)).size > 1
          ? { value: null, reason: 'Select a compatible item unit; units cannot be combined.' }
          : {
              value: sumKnown(lines.map((row) => row.quantity)),
              unit: lines[0]?.unit || definition.unit,
            };
      case 'order_item_sales':
        return { value: itemSales };
      case 'order_average_item_sales':
        return {
          value:
            itemSales !== null && orderCompleted.length ? itemSales / orderCompleted.length : null,
          numerator: itemSales,
          denominator: orderCompleted.length,
        };
      case 'order_ready_on_time':
        return ratio(readyOnTime, readyRecords.length);
      case 'missing_ready_promises':
        return {
          value: orderCompleted.filter((row) => knownInstant(row.promiseAt) === null).length,
        };
      case 'preparation_median':
        return {
          value: median,
          sampleSize: preparation.length,
          ...(preparation.length < orderCompleted.length
            ? {
                status: 'partial',
                reason: 'Some completed records lack paired preparation events.',
              }
            : {}),
        };
      case 'identified_customers':
      case 'first_time_customers':
      case 'returning_customers':
      case 'returning_share': {
        if (!customerSafe)
          return {
            value: null,
            reason:
              'An approved privacy threshold and sufficient permitted identity evidence are required.',
          };
        const first = customerRows.filter((row) => row.cohort === 'First time').length,
          returning = customerRows.filter((row) => row.cohort === 'Returning').length;
        if (
          definition.id !== 'identified_customers' &&
          customerRows.some((row) => row.cohort === 'Unknown')
        )
          return {
            value: null,
            reason: 'Prior completion history is unknown for some identities.',
          };
        return definition.id === 'returning_share'
          ? ratio(returning, customerRows.length)
          : {
              value:
                definition.id === 'identified_customers'
                  ? customerRows.length
                  : definition.id === 'first_time_customers'
                    ? first
                    : returning,
            };
      }
      case 'qualified_impressions':
        return { value: eventCount('impression') };
      case 'qualified_taps':
        return { value: eventCount('tap') };
      case 'tap_impression_ratio':
        return ratio(eventCount('tap'), eventCount('impression'));
      case 'attributed_orders':
        return attributionReady
          ? { value: eventCount('attributed_accepted_order') }
          : { value: null, reason: 'Attribution window or observation is incomplete.' };
      case 'orders_per_tap_ratio':
        return attributionReady
          ? ratio(eventCount('attributed_accepted_order'), eventCount('tap'))
          : { value: null, reason: 'Attribution window or observation is incomplete.' };
      case 'merchant_credits':
        return {
          value: postingSum('merchant_credit'),
          ...(currencies.size > 1
            ? { reason: 'Currencies remain separate; a combined total is unavailable.' }
            : {}),
        };
      case 'refund_debits':
        return {
          value: postingSum('refund_debit'),
          ...(currencies.size > 1
            ? { reason: 'Currencies remain separate; a combined total is unavailable.' }
            : {}),
        };
      case 'fee_debits':
        return {
          value: postingSum('fee_debit'),
          ...(currencies.size > 1
            ? { reason: 'Currencies remain separate; a combined total is unavailable.' }
            : {}),
        };
      case 'net_posted_credit': {
        const credit = postingSum('merchant_credit'),
          refunds = postingSum('refund_debit'),
          fees = postingSum('fee_debit');
        return {
          value:
            credit !== null && refunds !== null && fees !== null ? credit - refunds - fees : null,
          ...(currencies.size > 1
            ? { reason: 'Currencies remain separate; a combined total is unavailable.' }
            : {}),
        };
      }
      case 'appointment_confirmed_rate':
        return ratio(
          rows.filter((row) => ['confirmed', 'completed', 'no_show'].includes(row.outcome)).length,
          rows.length,
        );
      case 'provider_reserved_util':
      case 'asset_reserved_util':
      case 'asset_used_util':
      case 'booked_place_fill':
      case 'space_reserved_util':
      case 'storage_occupied_util': {
        const units = new Set(capacity.map((row) => row.unit));
        if (units.size > 1) return { value: null, reason: 'Capacity units are incompatible.' };
        const pools = capacity.map(
          (row) => `${row.locationId}:${row.resourceId}:${row.occurredOn}:${row.unit}`,
        );
        if (new Set(pools).size !== pools.length)
          return {
            value: null,
            reason:
              'Shared resource capacity needs one owner-confirmed pool record per day and unit.',
          };
        const numerator = sumKnown(
          capacity.map((row) =>
            ['asset_used_util', 'storage_occupied_util'].includes(definition.id)
              ? row.used
              : row.reserved,
          ),
        );
        const denominator = sumKnown(capacity.map((row) => row.usable));
        return numerator === null || denominator === null
          ? { value: null, reason: 'Usable or used capacity is unknown.' }
          : ratio(numerator, denominator);
      }
      case 'visit_on_time':
        return dueRatio(
          rows,
          (row) => row.arrivalAt,
          (row) => row.arrivalWindowEnd,
        );
      case 'rental_on_time_return':
        return dueRatio(
          rows,
          (row) => row.returnAt,
          (row) => row.returnDueAt,
        );
      case 'transfer_on_time':
      case 'freight_milestone_on_time':
        return dueRatio(
          rows,
          (row) => row.arrivalAt,
          (row) => row.promiseAt,
        );
      case 'session_attendance':
        return { value: sumKnown(rows.map((row) => row.attendedPlaces)) };
      case 'production_on_time':
        return ratio(
          rows.filter(
            (row) =>
              row.outcome === 'completed' &&
              row.completedOn &&
              row.dueOn &&
              row.completedOn <= row.dueOn,
          ).length,
          rows.length,
        );
      case 'request_with_accepted_quote_rate':
        return ratio(rows.filter((row) => row.quoteAccepted === true).length, rows.length);
      case 'accepted_quote_value': {
        const accepted = rows.filter((row) => row.quoteAccepted === true);
        return {
          value: accepted.every((row) => Number.isSafeInteger(row.quoteAmountMinor))
            ? accepted.reduce((total, row) => total + row.quoteAmountMinor!, 0)
            : null,
          sampleSize: accepted.length,
        };
      }
      case 'linked_windows_on_time': {
        const eligible = rows.filter((row) =>
          [row.collectionAt, row.collectionDueAt, row.returnAt, row.returnDueAt].every(
            (value) => knownInstant(value) !== null,
          ),
        );
        return {
          ...ratio(
            eligible.filter(
              (row) =>
                knownInstant(row.collectionAt)! <= knownInstant(row.collectionDueAt)! &&
                knownInstant(row.returnAt)! <= knownInstant(row.returnDueAt)!,
            ).length,
            eligible.length,
          ),
          ...(eligible.length < rows.length
            ? { status: 'partial', reason: 'Some linked jobs lack collection or return evidence.' }
            : {}),
        };
      }
      case 'entitlement_issued':
        return { value: rows.filter((row) => row.outcome === 'issued').length };
      case 'entitlement_redemptions':
        return { value: sumKnown(rows.map((row) => row.entitlementUses)) };
      default:
        return {
          value: null,
          reason: 'This calculation is not supported by the supplied evidence.',
        };
    }
  };
  const metrics: Record<string, InsightMetric> = {};
  for (const definition of METRIC_DEFINITIONS) {
    if (definition.id === 'accepted_quote_value' && !snapshot.records.some((record) => record.quoteAmountMinor !== undefined))
      continue;
    const gate = statusFor(definition);
    const result: Calculation =
      gate.status === 'unavailable' ? { value: null } : calculate(definition);
    const status =
      result.value === null
        ? 'unavailable'
        : result.status === 'partial' || gate.status === 'partial'
          ? 'partial'
          : 'ready';
    metrics[definition.id] = {
      ...definition,
      ...(definition.format === 'money' ? { unit: snapshot.currency } : {}),
      ...gate,
      ...result,
      status,
      range,
      comparisonKey: JSON.stringify([
        definition.id,
        definition.version,
        locationIds.slice().sort(),
        metricModels(definition).slice().sort(),
        keyword,
        snapshot.currency,
        coverage
          .filter((row) => definition.requiredSources.includes(row.kind))
          .map((row) => row.definitionVersion)
          .filter((value, index, all) => all.indexOf(value) === index)
          .sort(),
      ]),
      ...(result.value === null && !gate.reason && !result.reason
        ? { reason: 'Required quantities or denominator are unknown.' }
        : {}),
    };
  }
  const menuMap = new Map<string, MenuRow>();
  const menuContributors = new Map<string, Set<string>>();
  for (const row of lines) {
    const key = `${row.offeringId}:${row.variant ?? 'Unknown'}:${row.unit}`;
    const previous = menuMap.get(key);
    const contributors = menuContributors.get(key) || new Set<string>();
    contributors.add(row.recordId);
    menuContributors.set(key, contributors);
    menuMap.set(key, {
      id: key,
      label: row.label,
      variant: row.variant ?? 'Unknown',
      unit: row.unit,
      units:
        row.quantity === null || previous?.units === null
          ? null
          : (previous?.units || 0) + row.quantity!,
      itemSalesMinor:
        !policy.canReadFinance || row.itemAmountMinor === null || previous?.itemSalesMinor === null
          ? null
          : (previous?.itemSalesMinor || 0) + row.itemAmountMinor!,
      records: contributors.size,
    });
  }
  const operationMap = new Map<string, OperationRow>();
  for (const row of orderCompleted) {
    const method = row.fulfilment || 'Unknown';
    const previous = operationMap.get(method) || {
      method,
      eligible: 0,
      onTime: 0,
      late: 0,
      missingPromise: 0,
    };
    const promised = knownInstant(row.promiseAt),
      ready = knownInstant(row.readyAt);
    if (promised === null) previous.missingPromise++;
    else if (ready !== null) {
      previous.eligible++;
      if (ready <= promised) previous.onTime++;
      else previous.late++;
    }
    operationMap.set(method, previous);
  }
  const campaignMap = new Map<string, CampaignRow>();
  for (const row of campaignEvents) {
    const previous = campaignMap.get(row.campaignId) || {
      id: row.campaignId,
      label: row.campaignLabel,
      impressions: 0,
      taps: 0,
      attributedAcceptedOrders: attributionReady ? 0 : null,
      windowMinutes: row.attributionWindowMinutes ?? null,
    };
    if (row.kind === 'impression') previous.impressions += row.count;
    if (row.kind === 'tap') previous.taps += row.count;
    if (row.kind === 'attributed_accepted_order') {
      if (attributionReady)
        previous.attributedAcceptedOrders = (previous.attributedAcceptedOrders || 0) + row.count;
      previous.windowMinutes = row.attributionWindowMinutes ?? null;
    }
    campaignMap.set(row.campaignId, previous);
  }
  const cancellationMap = new Map<string, number>();
  for (const row of requested.filter((row) => row.outcome === 'cancelled')) {
    const reason = row.cancellationReason || 'Unknown';
    cancellationMap.set(reason, (cancellationMap.get(reason) || 0) + 1);
  }
  const sanitize = (row: InsightRecord): InsightRecord => ({
    ...row,
    ...(!policy.canReadCustomers || !customerSafe
      ? { customerId: undefined, customerFirstCompletedOn: undefined }
      : {}),
    ...(!policy.canReadFinance ? { itemAmountMinor: undefined } : {}),
  });
  const reportRecords: Record<string, InsightRecord[]> = {};
  const metricRecords: Record<string, InsightRecord[]> = {};
  const contributesTo = (id: string, row: InsightRecord) => {
    switch (id) {
      case 'work_completed':
      case 'order_completed':
      case 'order_cohort_completed':
      case 'appointment_outcomes':
      case 'tour_operated':
      case 'job_outcomes':
        return row.outcome === 'completed';
      case 'order_cancelled':
        return row.outcome === 'cancelled';
      case 'order_open':
        return row.outcome === 'open';
      case 'order_units':
      case 'order_item_sales':
      case 'order_average_item_sales':
        return row.outcome === 'completed' && recordsWithItems.has(row.id);
      case 'order_ready_on_time':
        return knownInstant(row.promiseAt) !== null && knownInstant(row.readyAt) !== null;
      case 'missing_ready_promises':
        return knownInstant(row.promiseAt) === null;
      case 'preparation_median': {
        const start = knownInstant(row.startedAt),
          end = knownInstant(row.readyAt);
        return start !== null && end !== null && end >= start;
      }
      case 'identified_customers':
      case 'returning_share':
        return !!row.customerId && customerMap.has(row.customerId);
      case 'first_time_customers':
        return !!row.customerId && customerMap.get(row.customerId)?.cohort === 'First time';
      case 'returning_customers':
        return !!row.customerId && customerMap.get(row.customerId)?.cohort === 'Returning';
      case 'visit_on_time':
        return knownInstant(row.arrivalAt) !== null && knownInstant(row.arrivalWindowEnd) !== null;
      case 'rental_on_time_return':
        return knownInstant(row.returnAt) !== null && knownInstant(row.returnDueAt) !== null;
      case 'transfer_on_time':
      case 'freight_milestone_on_time':
        return knownInstant(row.arrivalAt) !== null && knownInstant(row.promiseAt) !== null;
      case 'linked_windows_on_time':
        return [row.collectionAt, row.collectionDueAt, row.returnAt, row.returnDueAt].every(
          (value) => knownInstant(value) !== null,
        );
      case 'entitlement_issued':
        return row.outcome === 'issued';
      default:
        // Request-cohort ratios retain their full denominator, including open work.
        return true;
    }
  };
  for (const definition of METRIC_DEFINITIONS) {
    if (
      definition.requiredSources.includes('work') &&
      statusFor(definition).status !== 'unavailable'
    )
      metricRecords[definition.id] = at(definition.dateBasis)
        .filter(
          (row) =>
            metricModels(definition).includes(row.model) &&
            (definition.dateBasis !== 'completed' || row.outcome === 'completed') &&
            contributesTo(definition.id, row),
        )
        .map(sanitize);
  }
  const reports = REPORTS.filter(
    (report) =>
      (report.models === '*' || report.models.some((model) => models.includes(model))) &&
      !(report.area === 'Finance' && !policy.canReadFinance) &&
      !(report.area === 'Customers' && !policy.canReadCustomers) &&
      !(report.area === 'Promotions' && !policy.canReadPromotions),
  ).map((report) => {
    const values = report.metricIds.map((id) => metrics[id]!);
    const gates = report.metricIds.map((id) => statusFor(metrics[id]!));
    reportRecords[report.id] = report.metricIds.some(
      (id) =>
        metrics[id]!.requiredSources.includes('work') &&
        statusFor(metrics[id]!).status !== 'unavailable',
    )
      ? at(report.dateBasis)
          .filter((row) => report.models === '*' || report.models.includes(row.model))
          .map(sanitize)
      : [];
    return {
      ...report,
      status:
        report.status ||
        ((report.id === 'RPT_SOURCE_COVERAGE'
          ? 'ready'
          : values.some((metric) => metric.status === 'ready')
            ? 'ready'
            : values.some((metric) => metric.status === 'partial') ||
                gates.some((gate) => gate.status !== 'unavailable')
              ? 'partial'
              : 'unavailable') as InsightStatus),
    };
  });
  const weekly: InsightView['weekly'] = [];
  for (let from = range.from; from <= range.to; from = addDateDays(from, 7)) {
    const to = addDateDays(from, 6) < range.to ? addDateDays(from, 6) : range.to;
    const work = completed.filter((row) => inRange(row.completedOn, { from, to }));
    const ids = new Set(work.map((row) => row.id));
    const items = lines.filter((row) => ids.has(row.recordId));
    weekly.push({
      from,
      to,
      label: `${Number(from.slice(-2))}–${Number(to.slice(-2))}`,
      completed: metrics.work_completed!.status === 'unavailable' ? null : work.length,
      units:
        metrics.order_units!.status === 'unavailable'
          ? null
          : sumKnown(items.map((row) => row.quantity)),
      itemSalesMinor:
        metrics.order_item_sales!.status === 'unavailable'
          ? null
          : sumKnown(items.map((row) => row.itemAmountMinor)),
    });
  }
  const fulfilmentMap = new Map<string, number>();
  for (const row of orderCompleted) {
    const key = row.fulfilment || 'Unknown';
    fulfilmentMap.set(key, (fulfilmentMap.get(key) || 0) + 1);
  }
  const visibleLines = lines.map((row) => ({
    ...row,
    ...(!policy.canReadFinance ? { itemAmountMinor: null } : {}),
  }));
  const workAvailable = metrics.work_requested!.status !== 'unavailable';
  const itemsAvailable = statusFor(metrics.order_units!).status !== 'unavailable';
  const operationsAvailable = statusFor(metrics.order_ready_on_time!).status !== 'unavailable';
  const financeAvailable = statusFor(metrics.merchant_credits!).status !== 'unavailable';
  return {
    sourceMode: snapshot.sourceMode,
    status: snapshot.status,
    merchantName: snapshot.merchantName,
    filters: { ...filters, ...range },
    timezone: INSIGHT_TIMEZONE,
    currency: snapshot.currency,
    asOf: snapshot.asOf,
    models,
    locationIds,
    tabs: resolveInsightTabs(snapshot, policy),
    metrics,
    weekly,
    records: workAvailable ? requested.map(sanitize) : [],
    reportRecords,
    metricRecords,
    lineItems: itemsAvailable ? visibleLines : [],
    menuRows: itemsAvailable
      ? [...menuMap.values()].sort(
          (a, b) => (b.units || 0) - (a.units || 0) || a.label.localeCompare(b.label),
        )
      : [],
    customerRows:
      customerSafe && metrics.identified_customers!.status !== 'unavailable' ? customerRows : [],
    operationRows: operationsAvailable ? [...operationMap.values()] : [],
    cancellationReasons: workAvailable
      ? [...cancellationMap].map(([label, value]) => ({ label, value }))
      : [],
    fulfilment:
      metrics.order_completed!.status !== 'unavailable'
        ? [...fulfilmentMap].map(([label, value]) => ({ label, value }))
        : [],
    campaignRows:
      metrics.qualified_impressions!.status !== 'unavailable' ? [...campaignMap.values()] : [],
    postingRows: policy.canReadFinance && financeAvailable ? postingRows : [],
    capacityRows:
      policy.canRead && snapshot.status !== 'unavailable'
        ? capacityRows.filter(
            (row) =>
              coverageStatus(coverage, 'capacity', row.model, row.locationId, range) !==
              'unavailable',
          )
        : [],
    reports: policy.canRead ? reports : [],
    coverage: policy.canRead ? coverage : [],
    canExport: policy.canRead && policy.canExport && locationIds.length > 0 && models.length > 0,
    notice: snapshot.notice,
  };
}

export function compareMetric(current: InsightMetric, previous: InsightMetric) {
  const invalid = {
    status: 'unavailable' as const,
    absoluteChange: null,
    percentChange: null,
    reason:
      'Comparable complete evidence, definitions, scope and matched prior dates are required.',
  };
  if (
    current.status !== 'ready' ||
    previous.status !== 'ready' ||
    current.value === null ||
    previous.value === null ||
    !current.range ||
    !previous.range ||
    !current.comparisonKey ||
    current.comparisonKey !== previous.comparisonKey ||
    current.unit !== previous.unit ||
    current.dateBasis !== previous.dateBasis ||
    current.version !== previous.version
  )
    return invalid;
  const expected = previousDateRange(current.range);
  if (expected.from !== previous.range.from || expected.to !== previous.range.to) return invalid;
  const absoluteChange = current.value - previous.value;
  return {
    status: 'ready' as const,
    absoluteChange,
    percentChange:
      previous.value === 0 || current.format === 'percent'
        ? null
        : (absoluteChange / Math.abs(previous.value)) * 100,
    reason:
      previous.value === 0
        ? 'Prior value is zero; compare the actual values.'
        : current.format === 'percent'
          ? 'Rate change is expressed in percentage points.'
          : undefined,
  };
}
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value);
  if (
    typeof value === 'string' &&
    // C0 prefixes can hide spreadsheet formulas, so this guard deliberately matches them.
    // eslint-disable-next-line no-control-regex
    (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
  )
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportInsightsCsv(
  view: InsightView,
  reportId = 'RPT_ORDER_OUTCOMES',
  metricId?: string,
) {
  if (!view.canExport) throw new Error('Export is not permitted for this scope.');
  const report = view.reports.find((item) => item.id === reportId);
  if (!report || report.status === 'unavailable')
    throw new Error('Choose an available authorized report.');
  const selectedMetric = metricId ? view.metrics[metricId] : undefined;
  if (
    metricId &&
    (!selectedMetric ||
      selectedMetric.reportId !== reportId ||
      selectedMetric.status === 'unavailable')
  )
    throw new Error('Choose an available metric in the selected report.');
  const dateBasis = selectedMetric?.dateBasis || report.dateBasis;
  let headers: string[], rows: unknown[][];
  if (reportId === 'RPT_SOURCE_COVERAGE') {
    headers = ['Source', 'Model', 'Location', 'From', 'To', 'Status', 'As of', 'Definition'];
    rows = view.coverage.map((row) => [
      row.kind,
      row.model,
      row.locationId,
      row.from,
      row.to,
      row.status,
      row.asOf,
      row.definitionVersion,
    ]);
  } else if (reportId === 'RPT_ORDER_VARIANTS' && selectedMetric) {
    headers = [
      'Record',
      'Offering',
      'Variant',
      'Quantity',
      'Unit',
      'Item amount minor',
      'Currency',
    ];
    rows = view.lineItems.map((row) => [
      row.recordId,
      row.label,
      row.variant,
      row.quantity,
      row.unit,
      row.itemAmountMinor,
      view.currency,
    ]);
  } else if (reportId === 'RPT_ORDER_VARIANTS') {
    headers = ['Offering', 'Variant', 'Quantity', 'Unit', 'Item amount minor', 'Currency'];
    rows = view.menuRows.map((row) => [
      row.label,
      row.variant,
      row.units,
      row.unit,
      row.itemSalesMinor,
      view.currency,
    ]);
  } else if (reportId === 'RPT_REPEAT_ACTIVITY') {
    headers = ['Identity', 'Cohort', 'Completed records', 'Item amount minor', 'Currency'];
    rows = view.customerRows
      .filter(
        (row) =>
          !metricId ||
          !['first_time_customers', 'returning_customers'].includes(metricId) ||
          row.cohort === (metricId === 'first_time_customers' ? 'First time' : 'Returning'),
      )
      .map((row) => [row.id, row.cohort, row.orders, row.itemSalesMinor, view.currency]);
  } else if (reportId === 'RPT_POSTED_MERCHANT_ACTIVITY') {
    headers = ['Reference', 'Posted on', 'Kind', 'Amount minor', 'Currency'];
    const kind = {
      merchant_credits: 'merchant_credit',
      refund_debits: 'refund_debit',
      fee_debits: 'fee_debit',
    }[metricId ?? ''];
    rows = view.postingRows
      .filter((row) => !kind || row.kind === kind)
      .map((row) => [row.reference, row.postedOn, row.kind, row.amountMinor, row.currency]);
  } else if (reportId === 'RPT_CAMPAIGN_MEASUREMENT') {
    const impressions =
      !metricId || ['qualified_impressions', 'tap_impression_ratio'].includes(metricId);
    const taps =
      !metricId ||
      ['qualified_taps', 'tap_impression_ratio', 'orders_per_tap_ratio'].includes(metricId);
    const attributed =
      !metricId || ['attributed_orders', 'orders_per_tap_ratio'].includes(metricId);
    headers = [
      'Campaign',
      ...(impressions ? ['Impressions'] : []),
      ...(taps ? ['Taps'] : []),
      ...(attributed ? ['Attributed accepted orders', 'Tap window minutes'] : []),
    ];
    rows = view.campaignRows.map((row) => [
      row.label,
      ...(impressions ? [row.impressions] : []),
      ...(taps ? [row.taps] : []),
      ...(attributed ? [row.attributedAcceptedOrders, row.windowMinutes] : []),
    ]);
  } else if (
    selectedMetric
      ? selectedMetric.requiredSources.includes('capacity')
      : report.metricIds.some((id) => view.metrics[id]?.requiredSources.includes('capacity'))
  ) {
    headers = [
      'Resource',
      'Model',
      'Location',
      'Date',
      'Unit',
      'Usable',
      'Reserved',
      'Actual used',
    ];
    const models = selectedMetric?.models ?? report.models;
    rows = view.capacityRows
      .filter((row) => models === '*' || models.includes(row.model))
      .map((row) => [
        row.label,
        row.model,
        row.locationId,
        row.occurredOn,
        row.unit,
        row.usable,
        row.reserved,
        row.used,
      ]);
  } else {
    headers = ['Reference', 'Model', 'Location', 'Offering', 'Date', 'Date basis', 'Outcome'];
    const extra: Partial<Record<string, (keyof InsightRecord)[]>> = {
      order_ready_on_time: ['promiseAt', 'readyAt'],
      missing_ready_promises: ['promiseAt', 'readyAt'],
      preparation_median: ['startedAt', 'readyAt'],
      appointment_confirmed_rate: ['outcome'],
      visit_on_time: ['arrivalAt', 'arrivalWindowEnd'],
      rental_on_time_return: ['returnAt', 'returnDueAt'],
      transfer_on_time: ['arrivalAt', 'promiseAt'],
      freight_milestone_on_time: ['arrivalAt', 'promiseAt'],
      session_attendance: ['attendedPlaces'],
      production_on_time: ['completedOn', 'dueOn'],
      request_with_accepted_quote_rate: ['quoteAccepted'],
      accepted_quote_value: ['quoteAccepted', 'quoteAmountMinor'],
      linked_windows_on_time: ['collectionAt', 'collectionDueAt', 'returnAt', 'returnDueAt'],
      entitlement_redemptions: ['entitlementUses'],
    };
    const extraFields = metricId ? extra[metricId] || [] : [];
    headers.push(...extraFields);
    rows = (metricId ? view.metricRecords[metricId] || [] : view.reportRecords[reportId] || []).map(
      (row) => [
        row.reference,
        row.model,
        row.locationId,
        row.label,
        recordDate(row, dateBasis),
        dateBasis,
        row.outcome,
        ...extraFields.map((field) => row[field]),
      ],
    );
  }
  const context = [
    'Report',
    reportId,
    'Metric',
    metricId || '',
    'From',
    view.filters.from,
    'To',
    view.filters.to,
    'Timezone',
    view.timezone,
    'Location',
    view.filters.locationId,
    'Activity',
    view.filters.activity,
    'Keyword',
    view.filters.keyword,
    'Source',
    view.sourceMode,
    'Date basis',
    dateBasis,
    'Coverage',
    selectedMetric?.status || report.status,
    'As of',
    view.asOf,
    'Definition',
    selectedMetric?.version || '1',
  ];
  return [context, headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
export function formatInsightValue(
  metric: InsightMetric,
  currency = metric.format === 'money' ? metric.unit : 'KES',
) {
  if (metric.value === null) return 'Unavailable';
  if (metric.format === 'money')
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currencyDisplay: 'code',
      currency,
      maximumFractionDigits: 2,
    }).format(metric.value / 100);
  if (metric.format === 'percent')
    return `${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(metric.value)}%`;
  return `${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(metric.value)}${metric.format === 'minutes' ? ' min' : ''}`;
}
