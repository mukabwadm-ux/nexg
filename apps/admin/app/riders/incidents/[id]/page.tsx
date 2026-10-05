import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { clock, DASH, riderName, when } from '@/components/riders/shared';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

import { acknowledgeSos } from '../../actions';

export const metadata: Metadata = { title: 'Incident' };
export const dynamic = 'force-dynamic';

/**
 * One incident, deep-linkable — the SOS banner and the Concierge desk
 * both point here, and the link is meant to be pasted to somebody.
 *
 * Closing it needs an outcome. That is enforced in
 * `rpc_incident_resolve` and by a check constraint on the table; this
 * page only has to say so plainly, because the person reading it is
 * about to decide whether a rider is safe.
 */
export default async function IncidentPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const [{ data: incident }, { data: notes }] = await Promise.all([
    supabase
      .from('incident')
      /* One literal, not a concatenation: PostgREST infers the row type
         from the string itself, and `a' + 'b` gives it nothing to read. */
      .select(
        'id, kind, severity, status, happened_at, description, resolution, resolved_at, acknowledged_at, injury, police_ref, insurance_claim_ref, insurance_claim_status, compensation_kes, order_reference, reported_by_type, rider_id, rider:rider_id(first_name, last_name, phone, vehicle, plate_no)',
      )
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('incident_note')
      .select('id, body, created_at, author:author_id(display_name)')
      .eq('incident_id', params.id)
      .order('created_at'),
  ]);

  if (!incident) notFound();

  const rider = incident.rider as {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    vehicle: string | null;
    plate_no: string | null;
  } | null;

  const unacknowledged = incident.kind === 'sos' && !incident.acknowledged_at;

  return (
    <ConsoleShell staff={staff} current="/riders">
      <ConsoleHeader
        title={`${incident.kind.replace(/_/g, ' ')} · ${incident.severity}`}
        breadcrumb={`Reported by ${incident.reported_by_type} · ${when(incident.happened_at)} ${clock(
          incident.happened_at,
        )}`}
      />

      <main className="px-4 py-6 sm:px-8">
        <Link
          href="/riders?tab=health"
          className="text-muted hover:text-ink text-[0.75rem] font-bold"
        >
          ← Back to Health &amp; safety
        </Link>

        {unacknowledged && (
          <Card className="border-danger bg-danger-bg mt-4 flex flex-wrap items-center justify-between gap-3 border-2 p-4">
            <p className="text-danger text-[0.875rem] font-extrabold">
              Nobody has acknowledged this SOS yet.
            </p>
            <form action={acknowledgeSos}>
              <input type="hidden" name="incident_id" value={incident.id} />
              <button
                type="submit"
                className="bg-danger rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-opacity hover:opacity-90"
              >
                Acknowledge
              </button>
            </form>
          </Card>
        )}

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <div className="space-y-4">
            <Card className="p-5">
              <p className="text-[0.9375rem] font-extrabold">What happened</p>
              <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
                {incident.description ?? 'No account has been recorded yet.'}
              </p>
              {incident.order_reference && (
                <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
                  Order {incident.order_reference}
                </p>
              )}
            </Card>

            <Card className="p-0">
              <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
                Timeline
              </p>
              <ul className="divide-border divide-y">
                <li className="px-4 py-3">
                  <p className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                    Reported · {clock(incident.happened_at)}
                  </p>
                </li>
                {incident.acknowledged_at && (
                  <li className="px-4 py-3">
                    <p className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                      Acknowledged · {clock(incident.acknowledged_at)}
                    </p>
                  </li>
                )}
                {(
                  (notes as
                    | {
                        id: number;
                        body: string;
                        created_at: string;
                        author: { display_name: string } | null;
                      }[]
                    | null) ?? []
                ).map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <p className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                      {n.author?.display_name ?? 'Staff'} · {clock(n.created_at)}
                    </p>
                    <p className="mt-1 text-[0.8125rem] font-semibold">{n.body}</p>
                  </li>
                ))}
                {incident.resolved_at && (
                  <li className="px-4 py-3">
                    <p className="text-success text-[0.625rem] font-extrabold uppercase">
                      Resolved · {clock(incident.resolved_at)}
                    </p>
                    <p className="mt-1 text-[0.8125rem] font-semibold">{incident.resolution}</p>
                  </li>
                )}
              </ul>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <p className="text-[0.9375rem] font-extrabold">Rider</p>
              {rider ? (
                <>
                  <p className="mt-2 text-[0.875rem] font-extrabold">{riderName(rider)}</p>
                  <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                    {rider.vehicle ?? DASH} · {rider.plate_no ?? 'plate pending'}
                  </p>
                  <Link
                    href={`/riders/${incident.rider_id}`}
                    className="bg-ink hover:bg-ink/90 mt-3 inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-colors"
                  >
                    Open rider
                  </Link>
                </>
              ) : (
                <p className="text-muted mt-2 text-[0.75rem] font-semibold">
                  No rider is named on this incident.
                </p>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-[0.9375rem] font-extrabold">Claim</p>
              <dl className="mt-3 space-y-2 text-[0.75rem] font-semibold">
                <Row label="Injury" value={incident.injury ? 'Yes' : 'No'} />
                <Row label="Police ref" value={incident.police_ref ?? DASH} />
                <Row label="Insurance claim" value={incident.insurance_claim_ref ?? DASH} />
                <Row label="Claim status" value={incident.insurance_claim_status ?? DASH} />
                <Row
                  label="Compensation"
                  value={
                    incident.compensation_kes === null
                      ? DASH
                      : `KES ${Number(incident.compensation_kes).toLocaleString('en-KE')}`
                  }
                />
              </dl>
            </Card>

            {incident.status !== 'resolved' && incident.status !== 'closed' && (
              <Card className="p-5">
                <p className="text-[0.9375rem] font-extrabold">Closing this</p>
                <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
                  An incident cannot be closed without an account of what happened — the database
                  refuses it. Write the outcome, and any compensation, before resolving.
                </p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-extrabold">{value}</dd>
    </div>
  );
}
