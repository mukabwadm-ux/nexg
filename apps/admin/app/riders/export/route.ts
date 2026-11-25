import { NextResponse, type NextRequest } from 'next/server';

import { periodFrom, toCsv } from '@/lib/portal';
import {
  BUCKET_LABEL,
  CASE_BUCKET_LABEL,
  CASE_REASON_LABEL,
  CASE_TYPE_LABEL,
  DELIVERY_BUCKET_LABEL,
  KYC_LABEL,
  OUTCOME_LABEL,
  PAYOUT_LABEL,
  PRIORITY_LABEL,
  REPORTER_LABEL,
  STAGE_LABEL,
  asObject,
  caseRef,
  riderRef,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Cell = string | number | null | undefined;
const EXPORT_SIZE = 5000;

/**
 * Export on the Riders screens: the rows the screen's table holds, every
 * page of them, with the same period, tab and filters, as CSV. The reader
 * functions check the module again, so this route cannot read more than
 * the screen can.
 */
export async function GET(request: NextRequest) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const sp = request.nextUrl.searchParams;
  const period = periodFrom({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  const view = sp.get('view') ?? 'riders';
  const opt = (k: string) => {
    const v = sp.get(k);
    return v && v !== 'all' ? v : undefined;
  };
  const supabase = createClient();
  const base = { p_from: period.from, p_to: period.to, p_page: 1, p_size: EXPORT_SIZE };

  let rows: Cell[][];
  let name: string;

  if (view === 'onboarding') {
    const { data, error } = await supabase.rpc('rpc_console_riders_onboarding', {
      ...base,
      p_tab: sp.get('tab') ?? 'all',
      p_q: opt('q'),
      p_zone: opt('zone'),
      p_vehicle: opt('vehicle'),
      p_kyc: opt('kyc'),
    });
    if (error) return fail(error.message);
    const list = (asObject(data).rows as RiderFact[] | undefined) ?? [];
    name = 'rider-applications';
    rows = [
      [
        'Rider ID',
        'Name',
        'Phone',
        'Vehicle',
        'Zone',
        'KYC',
        'Documents verified',
        'Documents required',
        'Onboarding status',
        'Submitted',
      ],
      ...list.map((r) => [
        riderRef(r.rider_id),
        r.name,
        r.phone,
        r.vehicle,
        r.zone_name,
        KYC_LABEL[r.kyc] ?? r.kyc,
        r.docs_verified,
        r.docs_required,
        STAGE_LABEL[r.stage ?? ''] ?? r.stage,
        r.submitted_at ?? r.created_at,
      ]),
    ];
  } else if (view === 'deliveries') {
    const { data, error } = await supabase.rpc('rpc_console_riders_deliveries', {
      ...base,
      p_tab: sp.get('tab') ?? 'all',
      p_q: opt('q'),
      p_zone: opt('zone'),
    });
    if (error) return fail(error.message);
    const list = (asObject(data).rows as Record<string, unknown>[] | undefined) ?? [];
    name = 'rider-deliveries';
    rows = [
      [
        'Order ID',
        'Customer',
        'Merchant',
        'Service',
        'Rider',
        'Zone',
        'Amount (KES)',
        'Status',
        'Placed',
        'Picked up',
        'Delivered',
        'Promised',
      ],
      ...list.map((r) => [
        r.reference as string,
        r.customer as string,
        r.merchant as string,
        r.category as string,
        r.rider as string,
        r.zone as string,
        Math.round(Number(r.total_cents ?? 0) / 100),
        DELIVERY_BUCKET_LABEL[r.bucket as string] ?? (r.bucket as string),
        r.placed_at as string,
        r.picked_up_at as string,
        r.delivered_at as string,
        r.promised_delivery_at as string,
      ]),
    ];
  } else if (view === 'cases') {
    const { data, error } = await supabase.rpc('rpc_console_riders_cases', {
      ...base,
      p_tab: sp.get('tab') ?? 'all',
      p_q: opt('q'),
      p_type: opt('type'),
      p_priority: opt('priority'),
    });
    if (error) return fail(error.message);
    const list = (asObject(data).rows as Record<string, unknown>[] | undefined) ?? [];
    name = 'rider-cases';
    rows = [
      [
        'Case ID',
        'Order ID',
        'Type',
        'Reason',
        'Reported by',
        'Rider',
        'Zone',
        'Status',
        'Priority',
        'Created',
        'SLA due',
        'Resolved',
        'Outcome',
        'Assignee',
        'What happened',
      ],
      ...list.map((c) => [
        caseRef(c.id as string),
        c.order_reference as string,
        CASE_TYPE_LABEL[c.case_type as string] ?? (c.case_type as string),
        c.reason ? (CASE_REASON_LABEL[c.reason as string] ?? (c.reason as string)) : '',
        REPORTER_LABEL[c.reported_by as string] ?? (c.reported_by as string),
        c.rider as string,
        c.zone as string,
        CASE_BUCKET_LABEL[c.bucket as string] ?? (c.bucket as string),
        PRIORITY_LABEL[c.priority as string] ?? (c.priority as string),
        c.created_at as string,
        c.sla_due_at as string,
        c.resolved_at as string,
        c.outcome ? (OUTCOME_LABEL[c.outcome as string] ?? (c.outcome as string)) : '',
        c.assignee as string,
        c.description as string,
      ]),
    ];
  } else if (view === 'zones') {
    const { data, error } = await supabase.rpc('rpc_console_riders_availability', {
      p_from: period.from,
      p_to: period.to,
    });
    if (error) return fail(error.message);
    const zones = (asObject(data).by_zone as Record<string, unknown>[] | undefined) ?? [];
    name = 'rider-zones';
    rows = [
      ['Zone', 'Active', 'Online', 'Available', 'On trip', 'Riders in zone'],
      ...zones.map((z) => [
        z.name as string,
        z.active ? 'Yes' : 'No',
        z.online as number,
        z.available as number,
        z.on_trip as number,
        z.total as number,
      ]),
    ];
  } else {
    /* riders, earnings, performance and the earnings statement all read the rider list. */
    const { data, error } = await supabase.rpc('rpc_console_riders_list', {
      ...base,
      p_tab: view === 'statement' ? 'all' : (sp.get('tab') ?? 'all'),
      p_q: opt('q'),
      p_zone: opt('zone'),
      p_vehicle: opt('vehicle'),
      p_kyc: opt('kyc'),
      p_sort:
        view === 'performance'
          ? 'score'
          : view === 'riders'
            ? (sp.get('sort') ?? 'trips')
            : 'earned',
    });
    if (error) return fail(error.message);
    const list = (asObject(data).rows as RiderFact[] | undefined) ?? [];
    if (view === 'performance') {
      name = 'rider-performance';
      rows = [
        [
          'Rider ID',
          'Name',
          'Zone',
          'Deliveries',
          'On time %',
          'Completion %',
          'Acceptance %',
          'Rating',
          'Avg delivery (min)',
          'Score',
        ],
        ...list.map((r) => [
          riderRef(r.rider_id),
          r.name,
          r.zone_name,
          r.trips,
          r.on_time_pct,
          r.completion_pct,
          r.acceptance_pct,
          r.rating_avg,
          r.delivery_min,
          r.score,
        ]),
      ];
    } else if (view === 'earnings' || view === 'statement') {
      name = view === 'statement' ? 'rider-earnings-statement' : 'rider-earnings';
      rows = [
        [
          'Rider ID',
          'Name',
          'Phone',
          'Deliveries',
          'Earnings (KES)',
          'Adjustments (KES)',
          'Net (KES)',
          'Pending payout (KES)',
          'Latest payout',
          'Last paid',
        ],
        ...list.map((r) => [
          riderRef(r.rider_id),
          r.name,
          r.phone,
          r.trips,
          r.earned_kes,
          r.adjustments_kes,
          r.earned_kes + r.adjustments_kes,
          Math.round(r.payable_cents / 100),
          r.payout_state ? (PAYOUT_LABEL[r.payout_state] ?? r.payout_state) : '',
          r.payout_paid_at,
        ]),
      ];
    } else {
      name = 'riders';
      rows = [
        [
          'Rider ID',
          'Name',
          'Phone',
          'Vehicle',
          'Plate',
          'Zone',
          'Status',
          'KYC',
          'Rating',
          'Ratings',
          'Deliveries in period',
          'Deliveries all time',
          'Earnings in period (KES)',
          'Last active',
        ],
        ...list.map((r) => [
          riderRef(r.rider_id),
          r.name,
          r.phone,
          r.vehicle,
          r.plate_no,
          r.zone_name,
          BUCKET_LABEL[r.bucket] ?? r.bucket,
          KYC_LABEL[r.kyc] ?? r.kyc,
          r.rating_avg,
          r.rating_count,
          r.trips,
          r.trips_all,
          r.earned_kes,
          r.last_active,
        ]),
      ];
    }
  }

  const body = String.fromCharCode(0xfeff) + toCsv(rows);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${period.from}-to-${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

function fail(message: string) {
  return new NextResponse(`Could not export: ${message}`, { status: 500 });
}
