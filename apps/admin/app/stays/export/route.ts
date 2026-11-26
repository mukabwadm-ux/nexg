import { documentCompany, renderTableReport } from '@nexg/merchant-agreement/documents';
import { NextResponse, type NextRequest } from 'next/server';

import { periodFrom, toCsv } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import {
  asObject,
  CASE_CATEGORY_LABEL,
  label,
  REPORTS,
  SOURCE_LABEL,
  uuidOrNull,
  type ReportKey,
  type StayRow,
} from '@/lib/stays-module';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Cell = string | number | null | undefined;
const SIZE = 500;

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/**
 * Stays reports as CSV, or with ?format=pdf as a branded PDF of the same
 * rows: the same readers the screens use (they check the module
 * themselves), every row of the period, and a line in the report log
 * (rpc_console_stays_report_log) so Reports shows who exported what.
 */
export async function GET(request: NextRequest) {
  /* A link prefetch is not a download: answer it empty, read and log nothing. */
  if (request.headers.get('next-router-prefetch') || request.headers.get('rsc')) {
    return new NextResponse(null, { status: 204 });
  }
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  const sp = request.nextUrl.searchParams;
  const period = periodFrom({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  const city = uuidOrNull(sp.get('city'));
  const report = (REPORTS.find((r) => r.key === sp.get('report'))?.key ?? 'bookings') as ReportKey;
  const db = createClient() as unknown as Untyped;
  const dated = { p_from: period.from, p_to: period.to };

  /* Reads every page of a paged reader, up to 20 pages of 500. */
  async function all<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.rpc(fn, { ...args, p_page: page, p_size: SIZE });
      if (error) throw new Error(error.message);
      const rows = (asObject(data).rows as T[] | undefined) ?? [];
      out.push(...rows);
      if (rows.length < SIZE) break;
    }
    return out;
  }

  let rows: Cell[][];
  try {
    if (
      report === 'bookings' ||
      report === 'revenue' ||
      report === 'guests' ||
      report === 'concierge'
    ) {
      const stays = await all<StayRow>('rpc_console_stays_list', {
        ...dated,
        p_city: city,
        p_view:
          report === 'bookings' ? 'reservations' : report === 'revenue' ? 'finance' : 'spending',
        p_tab: report === 'concierge' ? 'concierge' : 'all',
        p_q: null,
      });
      rows = [
        [
          'Booking ref',
          'Guest',
          'Unit',
          'Building',
          'Area',
          'Host',
          'Check-in',
          'Check-out',
          'Nights',
          'Status',
          'Source',
          'Booking value (KES)',
          'NexG commission (KES)',
          'Host share (KES)',
          'Concierge spend (KES)',
          'Paid through NexG',
        ],
        ...stays.map((s) => [
          s.ref,
          s.guest_name,
          s.unit_label,
          s.property_name,
          s.area,
          s.host_name,
          s.check_in.slice(0, 10),
          s.check_out.slice(0, 10),
          s.nights,
          s.status,
          label(SOURCE_LABEL, s.source),
          s.value_kes,
          s.commission_kes,
          s.host_share_kes,
          s.concierge_kes ?? 0,
          s.paid ? 'yes' : 'no',
        ]),
      ];
    } else if (report === 'occupancy' || report === 'units') {
      const units = await all<Record<string, unknown>>('rpc_console_stays_units', {
        ...dated,
        p_city: city,
        p_tab: 'all',
        p_q: null,
        p_property: null,
      });
      rows = [
        [
          'Unit',
          'Building',
          'Area',
          'Host',
          'Bedrooms',
          'Max guests',
          'Rate / night (KES)',
          'State',
          'Booked nights',
          'Blocked nights',
          'Occupancy %',
          'Revenue (KES)',
        ],
        ...units.map((u) => [
          u.label as string,
          u.property_name as string,
          u.area as string,
          u.host_name as string,
          u.bedrooms as number,
          u.max_guests as number,
          u.nightly_rate_kes as number,
          u.bucket as string,
          u.nights as number,
          u.blocked_nights as number,
          u.occupancy_pct as number,
          u.revenue_kes as number,
        ]),
      ];
    } else if (report === 'hosts') {
      const hosts = await all<Record<string, unknown>>('rpc_console_stays_hosts', {
        p_tab: 'all',
        p_q: null,
      });
      rows = [
        [
          'Host',
          'Contact',
          'Type',
          'Status',
          'City',
          'Properties',
          'Units',
          'ID approved',
          'Authority approved',
          'KRA PIN approved',
          'Payout verified',
          'Registered',
          'Verified',
        ],
        ...hosts.map((h) => [
          h.name as string,
          h.contact_name as string,
          h.kind as string,
          h.bucket as string,
          h.city_name as string,
          h.properties as number,
          h.units as number,
          h.id_ok ? 'yes' : 'no',
          h.authority_ok ? 'yes' : 'no',
          h.kra_ok ? 'yes' : 'no',
          h.payout_ok ? 'yes' : 'no',
          String(h.created_at ?? '').slice(0, 10),
          String(h.verified_at ?? '').slice(0, 10),
        ]),
      ];
    } else if (report === 'managers') {
      const { data, error } = await db.rpc('rpc_console_stays_partners', {
        p_tab: 'all',
        p_q: null,
      });
      if (error) throw new Error(error.message);
      const partners = (asObject(data).rows as Record<string, unknown>[] | undefined) ?? [];
      rows = [
        [
          'Partner',
          'Company',
          'Role',
          'Status',
          'Buildings',
          'Units',
          'Leads',
          'Onboarded',
          'Eligible commission (KES)',
          'Partner share (KES)',
          'Paid (KES)',
        ],
        ...partners.map((p) => [
          p.name as string,
          p.legal_name as string,
          p.partner_kind as string,
          p.status as string,
          p.buildings as number,
          p.units as number,
          p.leads as number,
          p.onboarded as number,
          p.commission_kes as number,
          p.share_kes as number,
          p.paid_kes as number,
        ]),
      ];
    } else if (report === 'reviews') {
      const reviews = await all<Record<string, unknown>>('rpc_console_stays_reviews', {
        ...dated,
        p_city: city,
        p_tab: 'all',
        p_q: null,
        p_rating: null,
      });
      rows = [
        [
          'Booking ref',
          'Guest',
          'Building',
          'Unit',
          'Rating',
          'Review',
          'Date',
          'Moderation',
          'Featured',
          'NexG reply',
        ],
        ...reviews.map((r) => [
          r.ref as string,
          r.guest_name as string,
          r.property_name as string,
          r.unit_label as string,
          r.rating as number,
          r.text as string,
          String(r.answered_at ?? '').slice(0, 10),
          r.moderation as string,
          r.featured ? 'yes' : 'no',
          r.staff_reply as string,
        ]),
      ];
    } else {
      const cases = await all<Record<string, unknown>>('rpc_console_stays_cases', {
        ...dated,
        p_tab: 'all',
        p_q: null,
      });
      rows = [
        [
          'Case',
          'Type',
          'Category',
          'Title',
          'Booking ref',
          'Building',
          'Unit',
          'Reported by',
          'Parties',
          'Amount (KES)',
          'Priority',
          'Status',
          'Opened',
          'Resolved',
          'Resolution',
        ],
        ...cases.map((c) => [
          c.ref_text as string,
          c.case_type as string,
          label(CASE_CATEGORY_LABEL, c.category as string),
          c.title as string,
          c.stay_ref as string,
          c.property_name as string,
          c.unit_label as string,
          c.reported_by as string,
          c.parties as string,
          c.amount_kes as number,
          c.priority as string,
          c.status as string,
          String(c.created_at ?? '').slice(0, 10),
          String(c.resolved_at ?? '').slice(0, 10),
          c.resolution as string,
        ]),
      ];
    }
  } catch (e) {
    return new NextResponse(`Could not export: ${(e as Error).message}`, { status: 500 });
  }

  /* The log is best-effort: a failed log line never blocks the download. */
  await Promise.resolve(
    db.rpc('rpc_console_stays_report_log', {
      p_report: report,
      p_from: period.from,
      p_to: period.to,
      p_rows: rows.length - 1,
    }),
  ).catch(() => null);

  if (sp.get('format') === 'pdf') {
    let scope = 'All cities';
    if (city) {
      const { data } = await createClient()
        .from('city')
        .select('name')
        .eq('id', city)
        .maybeSingle();
      scope = (data as { name?: string } | null)?.name ?? scope;
    }
    /* The letterhead phone is Finance's to read; without it the default company block prints. */
    const letterhead = await Promise.resolve(db.rpc('rpc_fin_letterhead')).catch(() => null);
    const phone = (letterhead?.data as { phone?: string | null } | null)?.phone ?? null;
    try {
      const doc = await renderTableReport({
        title: REPORTS.find((r) => r.key === report)?.title ?? report,
        section: 'Stays',
        from: period.from,
        to: period.to,
        scope,
        generatedBy: staff.displayName,
        rows,
        company: documentCompany(phone),
      });
      return new NextResponse(Buffer.from(doc.bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="nexg-stays-${report}-${period.from}-to-${period.to}.pdf"`,
          'Cache-Control': 'private, no-store',
        },
      });
    } catch (e) {
      return new NextResponse(`Could not make the PDF: ${(e as Error).message}`, { status: 500 });
    }
  }

  /* A byte-order mark first, so Excel reads the shillings and names as UTF-8. */
  return new NextResponse(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="nexg-stays-${report}-${period.from}-to-${period.to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
