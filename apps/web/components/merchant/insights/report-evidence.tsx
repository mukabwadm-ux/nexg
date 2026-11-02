'use client';

import type { ColumnDef } from '@nexg/ui';
import type { ReactNode } from 'react';
import { MODEL_REPORTS } from './model';
import { EvidenceTable, money, number, Unavailable } from './presentation';
import type { DateBasis, InsightRecord, InsightReport, InsightView } from './types';

type Props = {
  view: InsightView;
  report: InsightReport;
  evidenceMetric?: string | null;
  onRecord: (record: InsightRecord) => void;
};

const basisLabels: Record<DateBasis, string> = {
  requested: 'Request cohort',
  completed: 'Completed in period',
  scheduled: 'Scheduled in period',
  due: 'Promise due in period',
  posted: 'Posted in period',
  occurred: 'Occurred in period',
};
const dateHeadings: Record<DateBasis, string> = {
  requested: 'Requested on',
  completed: 'Completed on',
  scheduled: 'Scheduled on',
  due: 'Due on',
  posted: 'Posted on',
  occurred: 'Occurred on',
};

function localDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Not recorded';
  const date = new Date(`${value}T12:00:00+03:00`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Nairobi',
      }).format(date)
    : 'Not recorded';
}

function instant(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? `${new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      }).format(new Date(value))} EAT`
    : 'Not recorded';
}

function recordDate(record: InsightRecord, basis: DateBasis) {
  switch (basis) {
    case 'completed':
      return record.completedOn;
    case 'scheduled':
      return record.scheduledOn;
    case 'due':
      return record.dueOn;
    case 'occurred':
      return record.occurredOn;
    case 'requested':
      return record.requestedOn;
    default:
      return undefined;
  }
}

function column<T>(
  id: string,
  header: string,
  value: (row: T) => ReactNode,
  sortValue?: (row: T) => unknown,
): ColumnDef<T, unknown> {
  return {
    id,
    header,
    accessorFn: (row) => {
      const raw = sortValue ? sortValue(row) : value(row);
      return typeof raw === 'string' || (typeof raw === 'number' && Number.isFinite(raw))
        ? raw
        : undefined;
    },
    sortUndefined: 'last',
    cell: ({ row }) => value(row.original),
  };
}

const instantOrder = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;

/** Uses only the reporting model's already scoped, permission-filtered evidence. */
export function ReportEvidence({ view, report, evidenceMetric = null, onRecord }: Props) {
  const authorized = view.reports.find((item) => item.id === report.id);
  const metric = evidenceMetric ? view.metrics[evidenceMetric] : undefined;
  if (!authorized || authorized.status === 'unavailable')
    return (
      <Unavailable
        title="This report is unavailable"
        message={
          authorized?.reason ||
          report.reason ||
          'This report is not available for the current source and permitted scope.'
        }
      />
    );
  if (
    evidenceMetric &&
    (!metric ||
      metric.reportId !== authorized.id ||
      !authorized.metricIds.includes(evidenceMetric) ||
      metric.status === 'unavailable')
  )
    return (
      <Unavailable
        title="This metric is unavailable"
        message={metric?.reason || 'Required evidence is not available for this metric and scope.'}
      />
    );

  const basis = metric?.dateBasis ?? authorized.dateBasis;
  const title = metric ? `${metric.label} evidence` : `${authorized.label} evidence`;
  const description = (count: number) =>
    `${metric ? `${metric.definition} ` : ''}${number(count)} matching evidence rows · ${basisLabels[basis]} · Africa/Nairobi${(metric?.status ?? authorized.status) === 'partial' ? ' · Partial evidence' : ''}`;
  const missing = (message?: string) => (
    <Unavailable
      message={
        message ||
        metric?.reason ||
        'The required source evidence is unavailable for this scope. Missing evidence is not zero activity.'
      }
    />
  );
  const noEvidence = (kind: 'items' | 'customers' | 'campaigns' | 'finance' | 'capacity') => {
    const metrics = authorized.metricIds
      .map((id) => view.metrics[id])
      .filter((item) => item?.requiredSources.includes(kind));
    return metrics.length > 0 && metrics.every((item) => item?.status === 'unavailable');
  };
  const records = evidenceMetric
    ? (view.metricRecords[evidenceMetric] ?? [])
    : (view.reportRecords[authorized.id] ?? []);
  const recordLookup = new Map(
    [
      ...view.records,
      ...Object.values(view.reportRecords).flat(),
      ...Object.values(view.metricRecords).flat(),
    ].map((record) => [record.id, record]),
  );
  const recordButton = (record: InsightRecord) => (
    <button
      type="button"
      className="in-text-button"
      aria-label={`View record ${record.reference}`}
      onClick={() => onRecord(record)}
    >
      {record.reference}
    </button>
  );

  if (authorized.id === 'RPT_SOURCE_COVERAGE') {
    if (!view.coverage.length)
      return missing('The source did not supply authorized coverage information.');
    return (
      <EvidenceTable
        title="Source coverage evidence"
        description={`${number(view.coverage.length)} scoped source entries · each source retains its own coverage period and update time`}
        data={view.coverage}
        columns={[
          column<InsightView['coverage'][number]>('kind', 'Source', (row) => row.kind),
          column<InsightView['coverage'][number]>(
            'model',
            'Activity',
            (row) => MODEL_REPORTS[row.model].label,
          ),
          column<InsightView['coverage'][number]>('location', 'Location', (row) => row.locationId),
          column<InsightView['coverage'][number]>(
            'from',
            'From',
            (row) => localDate(row.from),
            (row) => row.from,
          ),
          column<InsightView['coverage'][number]>(
            'to',
            'Through',
            (row) => localDate(row.to),
            (row) => row.to,
          ),
          column<InsightView['coverage'][number]>('status', 'Coverage', (row) => row.status),
          column<InsightView['coverage'][number]>(
            'asOf',
            'Updated',
            (row) => instant(row.asOf),
            (row) => instantOrder(row.asOf),
          ),
          column<InsightView['coverage'][number]>(
            'definition',
            'Definition version',
            (row) => row.definitionVersion,
          ),
        ]}
      />
    );
  }

  if (authorized.id === 'RPT_ORDER_VARIANTS') {
    if (noEvidence('items')) return missing();
    if (metric) {
      const data = view.lineItems;
      return (
        <EvidenceTable
          title={title}
          description={description(data.length)}
          data={data}
          columns={[
            column<InsightView['lineItems'][number]>(
              'record',
              'Record',
              (row) => {
                const record = recordLookup.get(row.recordId);
                return record ? recordButton(record) : row.recordId;
              },
              (row) => recordLookup.get(row.recordId)?.reference ?? row.recordId,
            ),
            column<InsightView['lineItems'][number]>('offering', 'Offering', (row) => row.label),
            column<InsightView['lineItems'][number]>(
              'variant',
              'Accepted variant',
              (row) => row.variant ?? 'Not recorded',
            ),
            column<InsightView['lineItems'][number]>(
              'quantity',
              'Quantity',
              (row) => number(row.quantity),
              (row) => row.quantity,
            ),
            column<InsightView['lineItems'][number]>('unit', 'Unit', (row) => row.unit),
            column<InsightView['lineItems'][number]>(
              'amount',
              'Item amount before refunds',
              (row) => money(row.itemAmountMinor, view.currency),
              (row) => row.itemAmountMinor,
            ),
            column<InsightView['lineItems'][number]>('currency', 'Currency', () => view.currency),
          ]}
        />
      );
    }
    return (
      <EvidenceTable
        title={title}
        description={`${description(view.menuRows.length)} · grouped by accepted offering, variant and unit; item amounts exclude delivery fees and tips`}
        data={view.menuRows}
        columns={[
          column<InsightView['menuRows'][number]>('offering', 'Offering', (row) => row.label),
          column<InsightView['menuRows'][number]>(
            'variant',
            'Accepted variant',
            (row) => row.variant,
          ),
          column<InsightView['menuRows'][number]>(
            'quantity',
            'Fulfilled quantity',
            (row) => number(row.units),
            (row) => row.units,
          ),
          column<InsightView['menuRows'][number]>('unit', 'Unit', (row) => row.unit),
          column<InsightView['menuRows'][number]>(
            'amount',
            'Item amount before refunds',
            (row) => money(row.itemSalesMinor, view.currency),
            (row) => row.itemSalesMinor,
          ),
          column<InsightView['menuRows'][number]>('currency', 'Currency', () => view.currency),
        ]}
      />
    );
  }

  if (authorized.id === 'RPT_REPEAT_ACTIVITY') {
    if (noEvidence('customers')) return missing(view.metrics.identified_customers?.reason);
    const data = view.customerRows.filter(
      (row) =>
        !evidenceMetric ||
        !['first_time_customers', 'returning_customers'].includes(evidenceMetric) ||
        row.cohort === (evidenceMetric === 'first_time_customers' ? 'First time' : 'Returning'),
    );
    return (
      <EvidenceTable
        title={title}
        description={description(data.length)}
        data={data}
        columns={[
          column<InsightView['customerRows'][number]>(
            'identity',
            'Customer reference',
            (row) => row.id,
          ),
          column<InsightView['customerRows'][number]>('cohort', 'Cohort', (row) => row.cohort),
          column<InsightView['customerRows'][number]>(
            'completed',
            'Completed records',
            (row) => number(row.orders),
            (row) => row.orders,
          ),
          column<InsightView['customerRows'][number]>(
            'amount',
            'Item amount',
            (row) => money(row.itemSalesMinor, view.currency),
            (row) => row.itemSalesMinor,
          ),
          column<InsightView['customerRows'][number]>('currency', 'Currency', () => view.currency),
        ]}
      />
    );
  }

  if (authorized.id === 'RPT_POSTED_MERCHANT_ACTIVITY') {
    if (noEvidence('finance') && !view.postingRows.length) return missing();
    const kind = {
      merchant_credits: 'merchant_credit',
      refund_debits: 'refund_debit',
      fee_debits: 'fee_debit',
    }[evidenceMetric ?? ''];
    const data = view.postingRows.filter((row) => !kind || row.kind === kind);
    return (
      <EvidenceTable
        title={title}
        description={`${description(data.length)} · each posting retains its currency; mixed currencies are not combined`}
        data={data}
        columns={[
          column<InsightView['postingRows'][number]>(
            'reference',
            'Reference',
            (row) => row.reference,
          ),
          column<InsightView['postingRows'][number]>(
            'posted',
            'Posted on',
            (row) => localDate(row.postedOn),
            (row) => row.postedOn,
          ),
          column<InsightView['postingRows'][number]>('kind', 'Posting class', (row) =>
            row.kind.replaceAll('_', ' '),
          ),
          {
            ...column<InsightView['postingRows'][number]>(
              'amount',
              'Amount',
              (row) => money(row.amountMinor, row.currency),
              (row) => row.amountMinor,
            ),
            sortingFn: (a, b) =>
              a.original.currency.localeCompare(b.original.currency) ||
              (a.original.amountMinor ?? 0) - (b.original.amountMinor ?? 0),
          },
          column<InsightView['postingRows'][number]>('currency', 'Currency', (row) => row.currency),
        ]}
      />
    );
  }

  if (authorized.id === 'RPT_CAMPAIGN_MEASUREMENT') {
    if (noEvidence('campaigns') && !view.campaignRows.length) return missing();
    const impressions =
      !evidenceMetric || ['qualified_impressions', 'tap_impression_ratio'].includes(evidenceMetric);
    const taps =
      !evidenceMetric ||
      ['qualified_taps', 'tap_impression_ratio', 'orders_per_tap_ratio'].includes(evidenceMetric);
    const attributed =
      !evidenceMetric || ['attributed_orders', 'orders_per_tap_ratio'].includes(evidenceMetric);
    type Row = InsightView['campaignRows'][number];
    const columns: ColumnDef<Row, unknown>[] = [column('campaign', 'Campaign', (row) => row.label)];
    if (impressions)
      columns.push(
        column(
          'impressions',
          'Qualified impressions',
          (row) => number(row.impressions),
          (row) => row.impressions,
        ),
      );
    if (taps)
      columns.push(
        column(
          'taps',
          'Qualified taps',
          (row) => number(row.taps),
          (row) => row.taps,
        ),
      );
    if (attributed)
      columns.push(
        column(
          'attributed',
          'Attributed accepted orders',
          (row) => number(row.attributedAcceptedOrders),
          (row) => row.attributedAcceptedOrders,
        ),
        column(
          'window',
          'Tap window minutes',
          (row) => number(row.windowMinutes),
          (row) => row.windowMinutes,
        ),
      );
    return (
      <EvidenceTable
        title={title}
        description={`${description(view.campaignRows.length)} · qualified events and source-attributed accepted work do not establish causal lift or value`}
        data={view.campaignRows}
        columns={columns}
      />
    );
  }

  const capacity = metric
    ? metric.requiredSources.includes('capacity')
    : authorized.metricIds.some((id) => view.metrics[id]?.requiredSources.includes('capacity'));
  if (capacity) {
    const models = metric?.models ?? authorized.models;
    const data = view.capacityRows.filter((row) => models === '*' || models.includes(row.model));
    if (!data.length && noEvidence('capacity')) return missing();
    return (
      <EvidenceTable
        title={title}
        description={`${description(data.length)} · each source-owned resource pool retains its declared unit`}
        data={data}
        columns={[
          column<InsightView['capacityRows'][number]>('resource', 'Resource', (row) => row.label),
          column<InsightView['capacityRows'][number]>(
            'model',
            'Activity',
            (row) => MODEL_REPORTS[row.model].label,
          ),
          column<InsightView['capacityRows'][number]>(
            'location',
            'Location',
            (row) => row.locationId,
          ),
          column<InsightView['capacityRows'][number]>(
            'date',
            'Occurred on',
            (row) => localDate(row.occurredOn),
            (row) => row.occurredOn,
          ),
          column<InsightView['capacityRows'][number]>('unit', 'Unit', (row) => row.unit),
          column<InsightView['capacityRows'][number]>(
            'usable',
            'Usable',
            (row) => number(row.usable),
            (row) => row.usable,
          ),
          column<InsightView['capacityRows'][number]>(
            'reserved',
            'Reserved',
            (row) => number(row.reserved),
            (row) => row.reserved,
          ),
          column<InsightView['capacityRows'][number]>(
            'used',
            'Actual used',
            (row) => number(row.used),
            (row) => row.used,
          ),
        ]}
      />
    );
  }

  const columns: ColumnDef<InsightRecord, unknown>[] = [
    column('reference', 'Reference', recordButton, (row) => row.reference),
    column('model', 'Activity', (row) => MODEL_REPORTS[row.model].label),
    column('location', 'Location', (row) => row.locationId),
    column('offering', 'Offering', (row) => row.label),
    column(
      'date',
      dateHeadings[basis],
      (row) => localDate(recordDate(row, basis)),
      (row) => recordDate(row, basis),
    ),
    column('basis', 'Date basis', () => basisLabels[basis]),
    column('outcome', 'Outcome', (row) => row.outcome.replaceAll('_', ' ')),
  ];
  const timing = (key: keyof InsightRecord, heading: string) =>
    columns.push(
      column(
        String(key),
        heading,
        (row) => instant(row[key] as string | null | undefined),
        (row) => instantOrder(row[key] as string | null | undefined),
      ),
    );
  switch (evidenceMetric) {
    case 'order_ready_on_time':
    case 'missing_ready_promises':
      timing('promiseAt', 'Accepted ready promise');
      timing('readyAt', 'Actually ready');
      break;
    case 'preparation_median':
      timing('startedAt', 'Preparation started');
      timing('readyAt', 'Actually ready');
      break;
    case 'visit_on_time':
      timing('arrivalAt', 'Actual arrival');
      timing('arrivalWindowEnd', 'Arrival window end');
      break;
    case 'rental_on_time_return':
      timing('returnAt', 'Actual return');
      timing('returnDueAt', 'Accepted return promise');
      break;
    case 'transfer_on_time':
    case 'freight_milestone_on_time':
      timing('arrivalAt', 'Actual milestone');
      timing('promiseAt', 'Accepted promise');
      break;
    case 'linked_windows_on_time':
      timing('collectionAt', 'Actual collection');
      timing('collectionDueAt', 'Collection promise');
      timing('returnAt', 'Actual return');
      timing('returnDueAt', 'Return promise');
      break;
    case 'production_on_time':
      columns.push(
        column(
          'completedOn',
          'Completed on',
          (row) => localDate(row.completedOn),
          (row) => row.completedOn,
        ),
        column(
          'dueOn',
          'Accepted due date',
          (row) => localDate(row.dueOn),
          (row) => row.dueOn,
        ),
      );
      break;
    case 'session_attendance':
      columns.push(
        column(
          'attendedPlaces',
          'Recorded attended places',
          (row) => number(row.attendedPlaces),
          (row) => row.attendedPlaces,
        ),
      );
      break;
    case 'request_with_accepted_quote_rate':
      columns.push(
        column(
          'quoteAccepted',
          'Accepted quote',
          (row) =>
            row.quoteAccepted === true
              ? 'Yes'
              : row.quoteAccepted === false
                ? 'No'
                : 'Not recorded',
          (row) => (row.quoteAccepted == null ? undefined : Number(row.quoteAccepted)),
        ),
      );
      break;
    case 'entitlement_redemptions':
      columns.push(
        column(
          'entitlementUses',
          'Valid uses',
          (row) => number(row.entitlementUses),
          (row) => row.entitlementUses,
        ),
      );
      break;
  }
  return (
    <EvidenceTable
      title={title}
      description={description(records.length)}
      data={records}
      columns={columns}
    />
  );
}
