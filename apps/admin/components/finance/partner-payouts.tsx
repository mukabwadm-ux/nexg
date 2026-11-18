'use client';

import { Button, EmptyState } from '@nexg/ui';
import { BadgeCheck, Handshake } from 'lucide-react';
import * as React from 'react';

import { verifyPartnerPayout } from '@/app/finance/settlements/actions';
import { ConfirmAction, useRunner } from '@/components/portal/client-kit';
import { PanelHead, Pill } from '@/components/portal/kit';
import { PARTNER_PAYOUT_RAILS, type PartnerPayout } from '@/lib/partner-payouts';
import { dateTime } from '@/lib/portal';

const HELD_STATUSES = ['paused', 'suspended', 'delisted'];

/**
 * Where each experience partner is paid, and whether Finance has checked
 * it. Experiences staff declare the details on the partner's profile; a
 * run pays a partner only once someone with full Finance, other than
 * whoever declared them, has verified them here.
 */
export function PartnerPayoutDetails({
  rows,
  canVerify,
  myStaffId,
  isSuperAdmin,
}: {
  rows: PartnerPayout[];
  /** Full Finance: the database checks again. */
  canVerify: boolean;
  myStaffId: string;
  isSuperAdmin: boolean;
}) {
  const waiting = rows.filter((r) => !r.verified).length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PanelHead
        title="Partner Payout Details"
        aside={
          rows.length === 0
            ? undefined
            : waiting > 0
              ? `${waiting.toLocaleString('en-KE')} awaiting verification`
              : 'All verified'
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-5 w-5" />}
          title="No payout details declared yet"
          description="Experiences staff declare where a partner is paid on the partner's profile. Finance verifies the details here before a run pays the partner; until then the partner's payouts are held."
        />
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-2xl border">
          {rows.map((r) => (
            <PayoutRow
              key={r.partner_id}
              row={r}
              canVerify={canVerify}
              own={r.declared_by === myStaffId}
              isSuperAdmin={isSuperAdmin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PayoutRow({
  row: r,
  canVerify,
  own,
  isSuperAdmin,
}: {
  row: PartnerPayout;
  canVerify: boolean;
  own: boolean;
  isSuperAdmin: boolean;
}) {
  const { run } = useRunner();
  const rail = PARTNER_PAYOUT_RAILS[r.rail];
  const details = r.account
    ? rail.fields.map((f) => ({ label: f.label, value: r.account?.[f.key] ?? '—' }))
    : null;

  return (
    <li className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
      <span className="min-w-0 flex-1 basis-64">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold">{r.partner_name}</span>
          {HELD_STATUSES.includes(r.partner_status) && (
            <Pill tone="red">
              {r.partner_status.charAt(0).toUpperCase() + r.partner_status.slice(1)}
            </Pill>
          )}
        </span>
        <span className="text-muted block truncate text-xs font-semibold">
          {rail.label} · {r.destination_masked ?? '—'}
          {r.account_name ? ` · ${r.account_name}` : ''}
        </span>
        {details && !r.verified && (
          <span className="text-muted mt-0.5 block text-xs tabular-nums">
            {details.map((d) => `${d.label}: ${d.value}`).join(' · ')}
          </span>
        )}
        <span className="text-muted-light block text-xs">
          Declared by {r.declared_by_name ?? 'a former staff member'} · {dateTime(r.declared_at)}
          {r.verified && r.verified_at
            ? ` · Verified by ${r.verified_by_name ?? 'a former staff member'} · ${dateTime(r.verified_at)}`
            : ''}
        </span>
      </span>
      <Pill tone={r.verified ? 'green' : 'amber'} dot>
        {r.verified ? 'Verified' : 'Awaiting Verification'}
      </Pill>
      {!r.verified && canVerify && (
        <span className="flex w-full justify-end sm:w-auto">
          {own && !isSuperAdmin ? (
            <span className="text-muted-light text-xs font-semibold">
              You declared these. Someone else verifies them.
            </span>
          ) : (
            <ConfirmAction
              trigger={
                <Button variant="black" size="sm" leadingIcon={<BadgeCheck className="h-4 w-4" />}>
                  Verify
                </Button>
              }
              tone="black"
              title={`Verify ${r.partner_name}'s payout details?`}
              body={
                <>
                  {rail.label}:{' '}
                  {details ? details.map((d) => d.value).join(' · ') : r.destination_masked}. Check
                  them against the partner&apos;s own records (a call to the number on file, or
                  their bank letter) first. The next payout run pays the partner here.
                  {own ? ' You declared these yourself: this is logged for review.' : ''}
                </>
              }
              confirmLabel="Verify"
              onConfirm={() => run(() => verifyPartnerPayout(r.partner_id, r.version))}
            />
          )}
        </span>
      )}
    </li>
  );
}
