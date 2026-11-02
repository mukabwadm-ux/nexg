import 'server-only';

import {
  addDateDays,
  localDateInNairobi,
  parseDateRange,
  previousDateRange,
} from '../components/merchant/insights/model';
import type {
  DateRange,
  InsightLineItem,
  InsightOffering,
  InsightPermissionPolicy,
  InsightRecord,
  InsightsSourceSnapshot,
  SourceKind,
} from '../components/merchant/insights/types';
import { createClient } from './supabase/server';
import { MerchantAccessError, requireMerchantWorkspaceOperations } from './merchant-access';

const MAX_ORDERS = 1000;
const MAX_ITEMS_PER_BATCH = 1000;
const ITEM_BATCH_SIZE = 100;
const SOURCE_VERSION = 'legacy-order-evidence-v1';
const DAY_MS = 86_400_000;

type Membership = { role: string; branches: string[] | null; caps: Record<string, unknown> | null };
type Merchant = { id: string; trading_name: string; subcategory: string | null };
type Branch = { id: string; name: string };
type CatalogueItem = { id: string; name: string };
type Order = {
  id: string;
  reference: string;
  branch_id: string | null;
  stage: string;
  currency: string;
  placed_at: string;
  confirmed_at: string | null;
  ready_at: string | null;
  promised_ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason_code: string | null;
  scheduled_for: string | null;
  subtotal_cents: number | string | null;
};
type OrderItem = {
  id: string;
  order_id: string;
  catalogue_item_id: string | null;
  name: string;
  quantity: number;
  line_total_cents: number | string | null;
};

export class MerchantInsightsError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 403 | 503,
  ) {
    super(message);
    this.name = 'MerchantInsightsError';
  }
}

/** Date-only boundaries stay in Nairobi, independent of the host's timezone. */
export function liveInsightsRange(input: Partial<DateRange> = {}, now = new Date()): DateRange {
  const today = localDateInNairobi(now.toISOString());
  try {
    if (
      (input.from !== undefined && typeof input.from !== 'string') ||
      (input.to !== undefined && typeof input.to !== 'string')
    )
      throw new Error('Invalid date value');
    const to = input.to || addDateDays(today, -1);
    const from = input.from || addDateDays(to, -27);
    const range = parseDateRange(from, to);
    const duration = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS;
    if (duration >= 366 || range.to > today) throw new Error('Unsupported period');
    return range;
  } catch {
    throw new MerchantInsightsError(
      'Choose valid dates, up to 366 days, ending today or earlier.',
      400,
    );
  }
}

const minor = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
};
const dateOnly = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return localDateInNairobi(value);
  } catch {
    return null;
  }
};
const chunks = <T>(rows: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

export type LiveMerchantInsights = {
  snapshot: InsightsSourceSnapshot;
  policy: InsightPermissionPolicy;
  range: DateRange;
};

/** The caller's RLS client is the only source. Request IDs never determine tenant access. */
export async function loadMerchantInsights(
  input: Partial<DateRange> = {},
): Promise<LiveMerchantInsights> {
  const now = new Date();
  const asOf = now.toISOString();
  const range = liveInsightsRange(input, now);
  const prior = previousDateRange(range);
  const readRange = { from: prior.from, to: range.to };
  const lower = new Date(`${readRange.from}T00:00:00+03:00`).toISOString();
  const upper = new Date(`${addDateDays(readRange.to, 1)}T00:00:00+03:00`).toISOString();
  let client: ReturnType<typeof createClient>;
  try {
    client = createClient();
  } catch {
    throw new MerchantInsightsError('The reporting connection is not configured.', 503);
  }

  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user || auth.data.user.is_anonymous)
    throw new MerchantInsightsError('Sign in to open Insights.', 401);
  const home = await client.rpc('fn_partner_home');
  const identity = home.data as unknown as { kind?: string; id?: string; name?: string } | null;
  if (home.error)
    throw new MerchantInsightsError('Your merchant reporting identity could not be read.', 503);
  if (identity?.kind !== 'merchant' || !identity.id)
    throw new MerchantInsightsError('Insights is available to your own merchant workspace.', 403);
  try {
    await requireMerchantWorkspaceOperations(client, identity.id);
  } catch (error) {
    if (error instanceof MerchantAccessError)
      throw new MerchantInsightsError(error.message, error.status);
    throw error;
  }
  const membershipResult = await client
    .from('merchant_user')
    .select('role, branches, caps')
    .eq('merchant_id', identity.id)
    .eq('user_id', auth.data.user.id)
    .maybeSingle();
  const membership = membershipResult.data as unknown as Membership | null;
  // Owner is the existing role explicitly described as having all merchant access.
  // A manager/cashier reporting grant is not established by the existing caps contract.
  if (membershipResult.error)
    throw new MerchantInsightsError('Your reporting permissions could not be read.', 503);
  if (!membership || membership.role !== 'owner')
    throw new MerchantInsightsError('Your membership does not include live reporting access.', 403);

  const [merchantResult, branchResult, catalogueResult] = await Promise.all([
    client
      .from('merchant')
      .select('id, trading_name, subcategory')
      .eq('id', identity.id)
      .maybeSingle(),
    client.from('merchant_branch').select('id, name').eq('merchant_id', identity.id).order('name'),
    client
      .from('catalogue_item')
      .select('id, name', { count: 'exact' })
      .eq('merchant_id', identity.id)
      .order('id')
      .limit(MAX_ORDERS),
  ]);
  const merchant = merchantResult.data as unknown as Merchant | null;
  if (merchantResult.error || !merchant)
    throw new MerchantInsightsError(
      'Your merchant reporting configuration could not be read.',
      503,
    );
  const branchRows = (branchResult.data || []) as unknown as Branch[];
  const restricted = membership.branches !== null;
  const allowedBranches = branchRows.filter(
    (branch) => !restricted || membership.branches!.includes(branch.id),
  );
  const locations = allowedBranches.map((branch) => ({ id: branch.id, label: branch.name }));
  // Null-branch history is available only to an unrestricted owner.
  if (!restricted) locations.push({ id: 'unassigned', label: 'Unassigned branch' });
  const policy: InsightPermissionPolicy = {
    canRead: !branchResult.error && locations.length > 0,
    canExport: !branchResult.error && locations.length > 0,
    canReadFinance: true,
    canReadCustomers: false,
    canReadPromotions: true,
    allowedLocationIds: locations.map((location) => location.id),
    allowedModels: ['ORDER'],
  };
  const snapshot: InsightsSourceSnapshot = {
    version: 1,
    sourceMode: 'live',
    status: 'unavailable',
    merchantId: merchant.id,
    merchantName: merchant.trading_name || identity.name || 'Your business',
    subcategoryId: merchant.subcategory || 'unconfigured',
    asOf,
    currency: 'KES',
    enabledModels: [],
    locations,
    offerings: [],
    records: [],
    lineItems: [],
    postings: [],
    campaignEvents: [],
    capacity: [],
    coverage: [],
  };
  const result = (): LiveMerchantInsights => ({ snapshot, policy, range });
  if (branchResult.error || !policy.canRead) {
    snapshot.notice = branchResult.error
      ? 'Location permissions could not be read. No report data has been loaded.'
      : 'Your membership has no permitted reporting locations.';
    return result();
  }
  const catalogue = (catalogueResult.data || []) as unknown as CatalogueItem[];
  // An actual legacy catalogue is ORDER-engine evidence. A taxonomy candidate is not.
  if (catalogue.length && !restricted) snapshot.enabledModels = ['ORDER'];
  const messages: Partial<Record<SourceKind, string>> = {
    customers: 'A merchant-scoped customer history and privacy policy have not been connected.',
    finance:
      'An approved posted-merchant-activity projection has not been connected. Open Money for current statements.',
    campaigns: 'Qualified campaign measurement and attribution have not been connected.',
    capacity: 'A controlled resource-capacity source has not been connected.',
  };
  const coverage = (
    kind: SourceKind,
    status: 'ready' | 'partial' | 'unavailable',
    message?: string,
  ) => {
    for (const location of locations) {
      const common = {
        kind,
        model: 'ORDER' as const,
        locationId: location.id,
        asOf,
        definitionVersion: SOURCE_VERSION,
        ...(message ? { message } : {}),
      };
      const today = localDateInNairobi(asOf);
      if (status === 'ready' && readRange.to === today) {
        const yesterday = addDateDays(today, -1);
        if (readRange.from <= yesterday)
          snapshot.coverage.push({
            ...common,
            id: `${kind}:${location.id}:closed`,
            from: readRange.from,
            to: yesterday,
            status,
          });
        snapshot.coverage.push({
          ...common,
          id: `${kind}:${location.id}:today`,
          from: today,
          to: today,
          status: 'partial',
          message: 'Today is still in progress.',
        });
      } else
        snapshot.coverage.push({ ...common, id: `${kind}:${location.id}`, ...readRange, status });
    }
  };
  for (const kind of ['customers', 'finance', 'campaigns', 'capacity'] as const)
    coverage(kind, 'unavailable', messages[kind]);

  let query = client
    .from('order')
    .select(
      'id, reference, branch_id, stage, currency, placed_at, confirmed_at, ready_at, promised_ready_at, delivered_at, cancelled_at, cancel_reason_code, scheduled_for, subtotal_cents',
      { count: 'exact' },
    )
    .eq('merchant_id', merchant.id)
    .or(
      `and(placed_at.gte.${lower},placed_at.lt.${upper}),and(delivered_at.gte.${lower},delivered_at.lt.${upper}),and(promised_ready_at.gte.${lower},promised_ready_at.lt.${upper})`,
    )
    .order('placed_at', { ascending: false })
    .order('id')
    .limit(MAX_ORDERS);
  if (restricted)
    query = query.in(
      'branch_id',
      allowedBranches.map((branch) => branch.id),
    );
  const orderResult = await query;
  if (orderResult.error) {
    coverage('work', 'unavailable', 'Order evidence could not be loaded. Retry the report.');
    coverage('items', 'unavailable', 'Items depend on unavailable order evidence.');
    coverage('operations', 'unavailable', 'Promise timing depends on unavailable order evidence.');
    snapshot.notice =
      'Order reporting is unavailable. No failed read has been converted into zero activity.';
    return result();
  }
  const orders = (orderResult.data || []) as unknown as Order[];
  if (orders.length) snapshot.enabledModels = ['ORDER'];
  const incompleteOrders =
    orderResult.count === null ? orders.length >= MAX_ORDERS : orderResult.count > orders.length;
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const itemResults = await Promise.all(
    chunks(
      orders.map((order) => order.id),
      ITEM_BATCH_SIZE,
    ).map((ids) =>
      client
        .from('order_item')
        .select('id, order_id, catalogue_item_id, name, quantity, line_total_cents', {
          count: 'exact',
        })
        .in('order_id', ids)
        .is('removed_at', null)
        .order('id')
        .limit(MAX_ITEMS_PER_BATCH),
    ),
  );
  const itemFailed = itemResults.some((items) => items.error);
  const incompleteItems = itemResults.some(
    (items) =>
      !items.error &&
      (items.count === null
        ? (items.data?.length || 0) >= MAX_ITEMS_PER_BATCH
        : items.count > (items.data?.length || 0)),
  );
  const items = itemResults.flatMap((items) =>
    items.error ? [] : ((items.data || []) as unknown as OrderItem[]),
  );
  const presentation = ['restaurant', 'cafe', 'coffee', 'bakery', 'fast_food', 'juice'].includes(
    merchant.subcategory || '',
  )
    ? ('menu' as const)
    : ('products' as const);
  const offeringMap = new Map<string, InsightOffering>();
  for (const item of restricted ? [] : catalogue)
    offeringMap.set(item.id, {
      id: item.id,
      label: item.name,
      model: 'ORDER',
      locationIds: policy.allowedLocationIds,
      enabled: true,
      presentation,
    });
  const firstOffering = new Map<string, string>();
  for (const item of items) {
    const order = orderMap.get(item.order_id);
    if (!order) continue;
    const offeringId = item.catalogue_item_id || `historical-item:${item.id}`;
    if (!offeringMap.has(offeringId))
      offeringMap.set(offeringId, {
        id: offeringId,
        label: item.name,
        model: 'ORDER',
        locationIds: policy.allowedLocationIds,
        enabled: true,
        presentation,
      });
    if (!firstOffering.has(order.id)) firstOffering.set(order.id, offeringId);
    const line: InsightLineItem = {
      id: item.id,
      recordId: item.order_id,
      offeringId,
      label: item.name,
      variant: null,
      quantity: Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : null,
      unit: 'order-line units',
      itemAmountMinor: order.currency === 'KES' ? minor(item.line_total_cents) : null,
    };
    snapshot.lineItems.push(line);
  }
  snapshot.offerings = [...offeringMap.values()];
  for (const order of orders) {
    const completedOn = dateOnly(order.delivered_at),
      requestedOn = dateOnly(order.placed_at);
    if (!requestedOn) continue;
    const row: InsightRecord = {
      id: order.id,
      reference: order.reference,
      label: `Order ${order.reference}`,
      model: 'ORDER',
      locationId: order.branch_id || 'unassigned',
      offeringId: firstOffering.get(order.id) || 'unmapped-order-item',
      requestedOn,
      completedOn,
      scheduledOn: dateOnly(order.scheduled_for),
      dueOn: dateOnly(order.promised_ready_at),
      outcome: completedOn
        ? 'completed'
        : order.cancelled_at || order.stage === 'cancelled'
          ? 'cancelled'
          : order.stage === 'refunded' || order.stage === 'delivered'
            ? 'unknown'
            : 'open',
      itemAmountMinor: order.currency === 'KES' ? minor(order.subtotal_cents) : null,
      acceptedAt: order.confirmed_at,
      readyAt: order.ready_at,
      promiseAt: order.promised_ready_at,
      cancellationReason: order.cancel_reason_code,
    };
    snapshot.records.push(row);
  }
  const missingDates =
    snapshot.records.length !== orders.length ||
    snapshot.records.some((order) => order.outcome === 'unknown');
  snapshot.status =
    incompleteOrders ||
    incompleteItems ||
    itemFailed ||
    catalogueResult.error ||
    missingDates ||
    readRange.to === localDateInNairobi(asOf)
      ? 'partial'
      : 'ready';
  if (catalogueResult.error && !snapshot.enabledModels.length) snapshot.status = 'unavailable';
  coverage(
    'work',
    incompleteOrders || missingDates ? 'partial' : 'ready',
    incompleteOrders
      ? `The source returned a bounded page of ${orders.length} orders. Totals are partial.`
      : missingDates
        ? 'Some records lack valid lifecycle timestamps.'
        : undefined,
  );
  coverage(
    'items',
    itemFailed ? 'unavailable' : incompleteItems || incompleteOrders ? 'partial' : 'ready',
    itemFailed
      ? 'Historical order items could not be read.'
      : incompleteItems || incompleteOrders
        ? 'Only a bounded subset of item evidence is available.'
        : 'Quantities are order-line units; typed physical units and variants are not supplied by this source.',
  );
  coverage(
    'operations',
    incompleteOrders || missingDates ? 'partial' : 'ready',
    'Ready and accepted promise times are source-backed. Preparation-start events are not supplied; preparation duration remains unavailable.',
  );
  snapshot.notice = [
    'Live order evidence is scoped to your permitted locations. Customer identity, campaign attribution, posted Finance activity and other operational-model adapters are not connected.',
    incompleteOrders || incompleteItems
      ? 'The returned source page is incomplete; affected metrics are labelled partial.'
      : '',
    orders.some((order) => order.currency !== 'KES')
      ? 'Other-currency item amounts remain unavailable; they are not converted or added to KES.'
      : '',
    catalogueResult.error
      ? 'Catalogue configuration could not be read. Existing order evidence is retained, but activity setup cannot be confirmed from the failed read.'
      : !snapshot.enabledModels.length
        ? 'No actual legacy order catalogue or order activity is configured yet. Category candidates do not activate reporting models.'
        : '',
  ]
    .filter(Boolean)
    .join(' ');
  return result();
}
