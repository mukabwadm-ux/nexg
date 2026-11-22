import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import { createClient } from '@/lib/supabase/server';

/**
 * What this merchant's own people did in the merchant portal.
 *
 * Staff only. The merchant never sees this: nothing in the portal
 * reads it, and `rpc_admin_merchant_activity` refuses anyone who is
 * not staff with merchant or full audit access. It is there so that,
 * if something goes wrong, we can show the merchant who on their team
 * did what, when, and from which device and address.
 */

export interface MerchantActivityRow {
  id: number;
  at: string;
  who: string;
  who_role: string | null;
  action: string;
  action_label: string;
  sentence: string;
  target_type: string | null;
  target_label: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  device_id: string | null;
  device_label: string | null;
  session_id: string | null;
}

const TABLE_LABEL: Record<string, string> = {
  catalogue_item: 'menu item',
  catalogue_section: 'menu section',
  merchant: 'business details',
  merchant_branch: 'branch',
  merchant_hours: 'opening hours',
  merchant_user: 'team member',
  merchant_message: 'message',
};

function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** "price_kes: 500 → 550" for the fields that moved. */
function changes(row: MerchantActivityRow): string[] {
  const before = row.before ?? {};
  const after = row.after ?? {};
  if (
    row.action === 'merchant.record_changed' &&
    Object.keys(after).length > 0 &&
    !('rows' in after)
  ) {
    return Object.keys(after)
      .slice(0, 6)
      .map((k) => `${k.replace(/_/g, ' ')}: ${show(before[k])} → ${show(after[k])}`);
  }
  if ('rows' in after) {
    const fields = Array.isArray(after.fields) ? (after.fields as string[]) : [];
    return [
      `${show(after.rows)} rows${fields.length ? ` · ${fields.slice(0, 6).join(', ').replace(/_/g, ' ')}` : ''}`,
    ];
  }
  return [];
}

function title(row: MerchantActivityRow): string {
  const thing = row.target_type
    ? (TABLE_LABEL[row.target_type] ?? row.target_type.replace(/_/g, ' '))
    : null;
  const verb =
    row.action === 'merchant.record_created'
      ? 'Added'
      : row.action === 'merchant.record_changed'
        ? 'Changed'
        : row.action === 'merchant.record_removed'
          ? 'Removed'
          : null;
  if (verb && thing) return `${verb} ${thing}${row.target_label ? ` · ${row.target_label}` : ''}`;
  return `${row.action_label}${row.target_label ? ` · ${row.target_label}` : ''}`;
}

export async function MerchantActivityLog({
  merchantId,
  limit = 15,
  before,
  full = false,
}: {
  merchantId: string;
  limit?: number;
  before?: number | null;
  full?: boolean;
}) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_admin_merchant_activity', {
    p_merchant_id: merchantId,
    p_limit: limit,
    p_before_id: before ?? undefined,
  });
  const rows = (data as MerchantActivityRow[] | null) ?? [];
  const oldest = rows.at(-1)?.id;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Merchant activity log</h2>
        <span className="text-muted-light text-[0.6875rem] font-bold uppercase tracking-wide">
          Staff only · not shown to the merchant
        </span>
      </div>
      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
        Everything this merchant&apos;s team changed in their portal: who, what, when, and from
        which device and address. Addresses are kept for 365 days.
      </p>

      {error ? (
        <p className="text-muted mt-4 text-[0.8125rem] font-semibold">
          The activity log is not open to you. {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted mt-4 text-[0.8125rem] font-semibold">
          {before ? 'Nothing older.' : 'Nothing recorded yet.'}
        </p>
      ) : (
        <ul className="divide-border mt-4 divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-3 text-[0.8125rem]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-extrabold">{title(row)}</span>
                <span className="text-muted-light text-[0.75rem] font-bold tabular-nums">
                  {when(row.at)}
                </span>
              </div>
              <p className="text-muted mt-0.5 font-semibold">
                {row.who}
                {row.who_role ? ` (${row.who_role})` : ''}
                {row.device_label ? ` · ${row.device_label}` : ''}
                {row.ip ? ` · ${row.ip}` : ''}
                {row.device_id ? ` · device ${row.device_id.slice(0, 8)}` : ''}
              </p>
              {row.reason && (
                <p className="mt-0.5 text-[0.75rem] font-semibold">&ldquo;{row.reason}&rdquo;</p>
              )}
              {changes(row).map((line) => (
                <p
                  key={line}
                  className="text-muted-light mt-0.5 break-words font-mono text-[0.6875rem]"
                >
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {!error && rows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-[0.8125rem] font-bold">
          {!full && (
            <Link
              href={`/merchants/${encodeURIComponent(merchantId)}/activity`}
              className="text-gold-text underline"
            >
              See the full log
            </Link>
          )}
          {full && rows.length === limit && oldest && (
            <Link
              href={`/merchants/${encodeURIComponent(merchantId)}/activity?before=${oldest}`}
              className="text-gold-text underline"
            >
              Older
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
