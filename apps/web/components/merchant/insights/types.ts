import type { BookingModel, BookingProfileSummary } from '@nexg/booking-config/profiles';

export type { BookingModel, BookingProfileSummary };
export type InsightStatus = 'ready' | 'partial' | 'unavailable';
export type SourceKind =
  | 'work'
  | 'items'
  | 'customers'
  | 'operations'
  | 'campaigns'
  | 'finance'
  | 'capacity';
export type DateBasis = 'requested' | 'completed' | 'scheduled' | 'due' | 'posted' | 'occurred';
export type DateRange = { from: string; to: string };
export type InsightFilters = DateRange & {
  locationId: string;
  activity: BookingModel | 'all';
  keyword: string;
  tab?: string;
};
export type InsightPermissionPolicy = {
  canRead: boolean;
  canExport: boolean;
  canReadFinance: boolean;
  canReadCustomers: boolean;
  canReadPromotions: boolean;
  allowedLocationIds: string[];
  allowedModels: BookingModel[];
  /** Supplied by the owner policy. Missing does not invent a privacy threshold. */
  privacyMinimum?: number;
};
export type SourceCoverage = DateRange & {
  id: string;
  kind: SourceKind;
  model: BookingModel;
  locationId: string;
  status: InsightStatus;
  asOf: string;
  definitionVersion: string;
  message?: string;
};
export type InsightOffering = {
  id: string;
  label: string;
  model: BookingModel;
  locationIds: string[];
  enabled: boolean;
  presentation: 'menu' | 'products' | 'services' | 'fleet' | 'experiences' | 'spaces';
};
export type InsightRecord = {
  id: string;
  reference: string;
  label: string;
  model: BookingModel;
  locationId: string;
  offeringId: string;
  requestedOn: string;
  completedOn?: string | null;
  scheduledOn?: string | null;
  dueOn?: string | null;
  occurredOn?: string | null;
  outcome: string;
  fulfilment?: string;
  customerId?: string | null;
  /** Owner-confirmed history, not inferred from the current reporting slice. */
  customerFirstCompletedOn?: string | null;
  itemAmountMinor?: number | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  readyAt?: string | null;
  promiseAt?: string | null;
  arrivalAt?: string | null;
  arrivalWindowEnd?: string | null;
  returnAt?: string | null;
  returnDueAt?: string | null;
  collectionAt?: string | null;
  collectionDueAt?: string | null;
  quoteAccepted?: boolean;
  cancellationReason?: string | null;
  bookedPlaces?: number | null;
  attendedPlaces?: number | null;
  entitlementUses?: number | null;
  quantity?: number | null;
  quantityUnit?: string | null;
};
export type InsightLineItem = {
  id: string;
  recordId: string;
  offeringId: string;
  label: string;
  variant: string | null;
  quantity: number | null;
  unit: string;
  itemAmountMinor: number | null;
};
export type InsightPosting = {
  id: string;
  model: BookingModel;
  locationId: string;
  postedOn: string;
  kind: 'merchant_credit' | 'refund_debit' | 'fee_debit';
  amountMinor: number | null;
  currency: string;
  reference: string;
  recordId?: string;
};
export type InsightCampaignEvent = {
  id: string;
  campaignId: string;
  campaignLabel: string;
  model: BookingModel;
  locationId: string;
  occurredOn: string;
  kind: 'impression' | 'tap' | 'attributed_accepted_order';
  /** A source-confirmed event count, never an inferred people count. */
  count: number;
  attributionWindowMinutes?: number;
  observationComplete: boolean;
};
export type InsightCapacity = {
  id: string;
  resourceId: string;
  label: string;
  model: BookingModel;
  locationId: string;
  occurredOn: string;
  unit: 'minutes' | 'places' | 'pallet-minutes';
  usable: number | null;
  reserved: number | null;
  used: number | null;
};
export type InsightsSourceSnapshot = {
  version: 1;
  sourceMode: 'sample' | 'live';
  status: InsightStatus;
  merchantId: string;
  merchantName: string;
  subcategoryId: string;
  asOf: string;
  currency: string;
  enabledModels: BookingModel[];
  locations: { id: string; label: string }[];
  offerings: InsightOffering[];
  records: InsightRecord[];
  lineItems: InsightLineItem[];
  postings: InsightPosting[];
  campaignEvents: InsightCampaignEvent[];
  capacity: InsightCapacity[];
  coverage: SourceCoverage[];
  notice?: string;
};
export type InsightTab = { key: string; label: string; models: BookingModel[] };
export type MetricDefinition = {
  id: string;
  label: string;
  question: string;
  definition: string;
  models: BookingModel[] | '*';
  requiredSources: SourceKind[];
  dateBasis: DateBasis;
  unit: string;
  format: 'count' | 'money' | 'percent' | 'minutes';
  reportId: string;
  permission?: 'finance' | 'customers' | 'promotions';
  version: string;
};
export type InsightMetric = MetricDefinition & {
  value: number | null;
  status: InsightStatus;
  reason?: string;
  numerator?: number | null;
  denominator?: number | null;
  sampleSize?: number;
  range?: DateRange;
  comparisonKey?: string;
};
export type InsightReport = {
  id: string;
  label: string;
  area: string;
  models: BookingModel[] | '*';
  metricIds: string[];
  dateBasis: DateBasis;
  status?: InsightStatus;
  reason?: string;
};
export type MenuRow = {
  id: string;
  label: string;
  variant: string;
  unit: string;
  units: number | null;
  itemSalesMinor: number | null;
  records: number;
};
export type CustomerRow = {
  id: string;
  cohort: 'First time' | 'Returning' | 'Unknown';
  orders: number;
  itemSalesMinor: number | null;
};
export type OperationRow = {
  method: string;
  eligible: number;
  onTime: number;
  late: number;
  missingPromise: number;
};
export type CampaignRow = {
  id: string;
  label: string;
  impressions: number;
  taps: number;
  attributedAcceptedOrders: number | null;
  windowMinutes: number | null;
};
export type InsightView = {
  sourceMode: 'sample' | 'live';
  status: InsightStatus;
  merchantName: string;
  filters: InsightFilters;
  timezone: 'Africa/Nairobi';
  currency: string;
  asOf: string;
  models: BookingModel[];
  locationIds: string[];
  tabs: InsightTab[];
  metrics: Record<string, InsightMetric>;
  weekly: {
    from: string;
    to: string;
    label: string;
    completed: number | null;
    units: number | null;
    itemSalesMinor: number | null;
  }[];
  fulfilment: { label: string; value: number }[];
  records: InsightRecord[];
  reportRecords: Record<string, InsightRecord[]>;
  metricRecords: Record<string, InsightRecord[]>;
  lineItems: InsightLineItem[];
  menuRows: MenuRow[];
  customerRows: CustomerRow[];
  operationRows: OperationRow[];
  cancellationReasons: { label: string; value: number }[];
  campaignRows: CampaignRow[];
  postingRows: InsightPosting[];
  capacityRows: InsightCapacity[];
  reports: InsightReport[];
  coverage: SourceCoverage[];
  canExport: boolean;
  notice?: string;
};
