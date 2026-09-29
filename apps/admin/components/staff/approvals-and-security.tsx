'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { decideApproval } from '@/app/staff/actions';

import { when, type ApprovalRow, type StaffRow } from './shared';

/**
 * Pending approvals.
 *
 * Only role grants appear here — merchant suspensions have their own place
 * on the merchant. The rule is that the approver is not the requester, so
 * a request you raised shows the reason and no buttons.
 */
export function ApprovalsTab({ approvals }: { approvals: ApprovalRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const decide = async (id: string, approve: boolean) => {
    const note = window.prompt(
      approve ? 'A note for the audit trail (optional).' : 'Why are you refusing?',
    );
    if (note === null) return;
    setBusy(id);
    const r = await decideApproval(id, approve, note);
    setBusy(null);
    toast({
      title: r.ok ? 'Recorded' : 'Not allowed',
      description: r.message,
      tone: r.ok ? 'success' : 'danger',
    });
    if (r.ok) router.refresh();
  };

  if (approvals.length === 0) {
    return (
      <Card className="mt-6 p-8 text-center">
        <p className="text-muted text-sm font-semibold">
          Nothing waiting. Role proposals appear here for someone else to accept.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {approvals.map((a) => (
        <Card key={a.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-extrabold">
                {a.role === 'super_admin' ? 'Super admin' : 'Finance'} for {a.personName}
              </p>
              <p className="text-muted-light mt-0.5 text-xs font-semibold">
                {a.personEmail} · proposed by {a.requestedBy} · {when(a.createdAt)}
              </p>
              {a.reason && (
                <p className="border-border bg-bg mt-3 rounded-lg border p-3 text-[0.8125rem] font-semibold leading-[1.7]">
                  {a.reason}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {a.requestedByMe ? (
                <p className="text-muted-light max-w-[14rem] text-xs font-semibold leading-[1.6]">
                  You proposed this, so you cannot accept it. {a.personName} can accept it
                  themselves, or another super admin can.
                </p>
              ) : (
                <>
                  <Button size="sm" loading={busy === a.id} onClick={() => void decide(a.id, true)}>
                    {a.forMe ? 'Accept for myself' : 'Grant it'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === a.id}
                    onClick={() => void decide(a.id, false)}
                  >
                    Refuse
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * Sessions & security.
 *
 * Everything here is read from Supabase Auth. The honest headline is that
 * two-step verification is available on the project and enforced nowhere —
 * saying so plainly is more useful than a dashboard implying it is on.
 */
export function SecurityTab({ rows }: { rows: StaffRow[] }) {
  const enrolled = rows.filter((r) => r.mfa_enrolled);
  const sessions = rows.reduce((n, r) => n + r.active_sessions, 0);
  const neverSignedIn = rows.filter((r) => r.invited);
  const stale = rows.filter(
    (r) => r.last_sign_in_at && Date.now() - new Date(r.last_sign_in_at).getTime() > 30 * 864e5,
  );

  return (
    <div className="mt-6 space-y-4">
      <Card className="border-warning/40 bg-warning-bg p-5">
        <p className="text-warning text-[0.9375rem] font-extrabold">
          Two-step verification is not enforced
        </p>
        <p className="text-warning mt-2 max-w-3xl text-[0.8125rem] font-semibold leading-[1.7]">
          Supabase Auth supports it and this page reads who has enrolled — {enrolled.length} of{' '}
          {rows.length} so far — but nothing requires it, and the sign-in form does not ask. A
          console that can take a merchant live and read uploaded national IDs should require it.
          That is a change to the sign-in page, not a setting.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Enrolled in two-step" value={`${enrolled.length} of ${rows.length}`} />
        <Stat label="Open sessions" value={String(sessions)} />
        <Stat label="Never signed in" value={String(neverSignedIn.length)} />
        <Stat label="No sign-in in 30 days" value={String(stale.length)} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Two-step</th>
              <th className="px-4 py-3">Sessions</th>
              <th className="px-4 py-3">Last sign-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staff_id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-3">
                  <p className="text-[0.8125rem] font-extrabold">{r.display_name}</p>
                  <p className="text-muted-light text-xs font-semibold">{r.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-1 text-[0.625rem] font-extrabold ${
                      r.mfa_enrolled ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
                    }`}
                  >
                    {r.mfa_enrolled ? 'Enrolled' : 'Not enrolled'}
                  </span>
                </td>
                <td className="text-muted px-4 py-3 text-xs font-semibold">{r.active_sessions}</td>
                <td className="text-muted px-4 py-3 text-xs font-semibold">
                  {r.last_sign_in_at ? when(r.last_sign_in_at) : 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </Card>
  );
}
