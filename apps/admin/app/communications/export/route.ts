import { NextResponse, type NextRequest } from 'next/server';

import { asObject, csvSafe, oneOfOr } from '@/lib/comms';
import { canOpenComms } from '@/lib/comms-server';
import { periodFrom, toCsv } from '@/lib/portal';
import { requireStaff } from '@/lib/staff';
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

const KINDS = ['logs', 'campaigns', 'consent', 'suppression'] as const;

/**
 * Communications records as CSV: the same readers the screens use (they
 * check the caller themselves, and mask addresses), every row up to 10,000,
 * and a line in the audit log saying who downloaded what.
 */
export async function GET(request: NextRequest) {
  /* A link prefetch is not a download: answer it empty, read and log nothing. */
  if (request.headers.get('next-router-prefetch') || request.headers.get('rsc')) {
    return new NextResponse(null, { status: 204 });
  }
  const staff = await requireStaff();
  if (!canOpenComms(staff)) return new NextResponse('Not open to your role.', { status: 403 });
  const sp = request.nextUrl.searchParams;
  const kind = oneOfOr(sp.get('kind') ?? undefined, KINDS) ?? 'logs';
  const period = periodFrom({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  const db = createClient() as unknown as Untyped;
  const opt = (k: string) => sp.get(k) || null;

  async function all<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.rpc(fn, { ...args, p_page: page, p_per: SIZE });
      if (error) throw new Error(error.message);
      const rows = (asObject(data).rows as T[] | undefined) ?? [];
      out.push(...rows);
      if (rows.length < SIZE) break;
    }
    return out;
  }

  let table: Cell[][];
  try {
    if (kind === 'logs') {
      const rows = await all<Record<string, Cell>>('rpc_comms_logs', {
        p_from: period.from,
        p_to: period.to,
        p_channel: opt('channel'),
        p_status: opt('status'),
        p_audience: opt('audience'),
        p_search: opt('q'),
      });
      table = [
        [
          'Log ID',
          'Date & time (UTC)',
          'Channel',
          'Audience',
          'Recipient (masked)',
          'Message',
          'Template',
          'Campaign',
          'Status',
          'Error',
          'Delivered at',
          'Seconds',
          'Attempts',
          'Provider',
        ],
        ...rows.map((r) => [
          r.ref,
          r.created_at,
          r.channel,
          r.audience,
          r.recipient,
          r.subject,
          r.template,
          r.campaign_ref,
          r.status,
          r.error,
          r.sent_at,
          r.seconds,
          r.attempts,
          r.provider,
        ]),
      ];
    } else if (kind === 'campaigns') {
      const rows = await all<Record<string, unknown>>('rpc_comms_campaigns', {
        p_from: period.from,
        p_to: period.to,
      });
      table = [
        [
          'Ref',
          'Name',
          'Kind',
          'Audiences',
          'Channels',
          'People',
          'Messages queued',
          'Delivered',
          'Failed',
          'Waiting',
          'Left out: no consent',
          'Left out: suppressed',
          'Left out: no address',
          'Sent at (UTC)',
        ],
        ...rows.map((r) => [
          r.ref as Cell,
          r.name as Cell,
          r.kind as Cell,
          ((r.audiences as string[]) ?? []).join(' '),
          ((r.channels as string[]) ?? []).join(' '),
          r.people as Cell,
          r.queued as Cell,
          r.sent as Cell,
          r.failed as Cell,
          r.waiting as Cell,
          r.skipped_consent as Cell,
          r.skipped_suppressed as Cell,
          r.skipped_no_address as Cell,
          r.created_at as Cell,
        ]),
      ];
    } else if (kind === 'consent') {
      const rows = await all<Record<string, Cell>>('rpc_comms_consent', {
        p_from: period.from,
        p_to: period.to,
      });
      table = [
        [
          'Date & time (UTC)',
          'Person (masked)',
          'Audience',
          'Kind',
          'Channel',
          'Granted',
          'Source',
          'Evidence',
          'Recorded by',
        ],
        ...rows.map((r) => [
          r.at,
          r.who,
          r.audience,
          r.kind,
          r.channel,
          String(r.granted),
          r.source,
          r.evidence,
          r.staff ?? 'The person',
        ]),
      ];
    } else {
      const rows = await all<Record<string, Cell>>('rpc_comms_suppressions', {
        p_channel: opt('channel'),
      });
      table = [
        ['Channel', 'Address (masked)', 'Reason', 'Note', 'Source', 'Added (UTC)', 'Added by'],
        ...rows.map((r) => [r.channel, r.address, r.reason, r.note, r.source, r.created_at, r.by]),
      ];
    }
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Could not read the records.', {
      status: 400,
    });
  }

  await db.rpc('rpc_comms_export_log', { p_kind: kind, p_rows: table.length - 1 });
  const body = String.fromCharCode(0xfeff) + toCsv(table.map((row) => row.map(csvSafe)));
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="nexg-communications-${kind}-${period.from}-to-${period.to}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
