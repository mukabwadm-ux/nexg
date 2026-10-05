import { Card, StatusBadge, type StatusKey } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { activateRider, rejectDocument, verifyDocument } from '@/app/riders/actions';
import { remindToUpload } from '@/app/documents/actions';
import { ActivatePanel } from '@/components/activate-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentReview, type ReviewDocument } from '@/components/document-review';
import { RiderRecordPanel, type RiderRecord } from '@/components/rider-record';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Rider application' };
export const dynamic = 'force-dynamic';

export default async function RiderApplicationPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  const supabase = createClient();

  const { data: rider } = await supabase
    .from('rider')
    .select('*, city(name)')
    .eq('id', params.id)
    .maybeSingle();

  // RLS already limits this to the cities this account covers, so "not found"
  // and "not yours" are deliberately the same answer.
  if (!rider) notFound();

  const [{ data: requirements }, { data: documents }, { data: readiness }, { data: employer }] =
    await Promise.all([
      /*
       * The same function the rider's own documents step called, rather than
       * a second copy of the rules here. This page used to filter on vehicle
       * alone, so it would have missed the owner's permission letter and the
       * insurance certificate entirely — both of which now hang off answers
       * rather than the vehicle.
       */
      supabase.rpc('fn_rider_required_docs', { p_rider_id: params.id }),
      supabase
        .from('document')
        .select(
          'id, requirement_id, side, status, storage_path, mime, expires_at, rejection_reason',
        )
        .eq('owner_type', 'rider')
        .eq('owner_id', params.id)
        .is('superseded_at', null),
      supabase.rpc('fn_rider_readiness', { p_rider_id: params.id }),
      rider.employer_merchant_id
        ? supabase
            .from('merchant')
            .select('trading_name')
            .eq('id', rider.employer_merchant_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const applicable =
    (requirements as
      | { id: string; kind: string; label: string; why_text: string | null; essential: boolean }[]
      | null) ?? [];

  const byRequirement = new Map((documents ?? []).map((d) => [d.requirement_id, d]));

  /*
   * Signed URLs are minted here, per request, and last five minutes (section
   * 3.4). They are never stored: a URL in the page source that still worked
   * tomorrow would be a copy of the document nobody could revoke.
   */
  /* When each document was last chased, so the button can say
     something true rather than offering to send a fourth message. */
  const { data: chaseState } = await supabase.rpc('fn_document_chase_state', {
    p_owner_type: 'rider',
    p_owner_id: params.id,
  });
  const chases_ = (chaseState ?? {}) as Record<
    string,
    {
      last_sent_at: string | null;
      last_channel: string | null;
      by: string | null;
      by_applicant: boolean;
      times: number | null;
      can_send_again: boolean;
      next_allowed_at: string | null;
    }
  >;

  const review: ReviewDocument[] = await Promise.all(
    applicable.map(async (requirement) => {
      const document = byRequirement.get(requirement.id);
      let url: string | null = null;

      if (document) {
        const { data } = await supabase.storage
          .from('partner-documents')
          .createSignedUrl(document.storage_path, 300);
        url = data?.signedUrl ?? null;
      }

      return {
        id: document?.id ?? null,
        kind: requirement.kind,
        label: requirement.label,
        helpText: requirement.why_text,
        required: requirement.essential,
        status: (document?.status ?? 'missing') as ReviewDocument['status'],
        expiresAt: document?.expires_at ?? null,
        rejectionReason: document?.rejection_reason ?? null,
        url,
        mime: document?.mime ?? null,
        chase: chases_[requirement.kind] ?? null,
      };
    }),
  );

  const outstanding = review.filter((d) => d.required && d.status !== 'verified');
  const city = rider.city as { name: string } | null;

  return (
    <ConsoleShell staff={staff} current="/riders">
      <ConsoleHeader
        title={`${rider.first_name} ${rider.last_name ?? ''}`.trim()}
        breadcrumb="Riders → Application"
        action={<StatusBadge status={rider.status as StatusKey} />}
      />

      <main className="px-4 py-6 sm:px-8">
        <Link
          href="/riders"
          className="text-muted hover:text-ink text-xs font-bold transition-colors"
        >
          ← Back to the pipeline
        </Link>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Documents</h2>
              <p className="text-muted mt-1 text-sm font-semibold">
                {outstanding.length === 0
                  ? 'Everything required is verified.'
                  : `${outstanding.length} of ${review.filter((d) => d.required).length} still to verify.`}
              </p>

              <div className="mt-4">
                <DocumentReview
                  documents={review}
                  onVerify={async (documentId) => {
                    'use server';
                    return verifyDocument(documentId, params.id);
                  }}
                  onReject={async (documentId, reason) => {
                    'use server';
                    return rejectDocument(documentId, params.id, reason);
                  }}
                  onRemind={async (kind) => {
                    'use server';
                    return remindToUpload('rider', params.id, kind);
                  }}
                />
              </div>
            </div>

            <RiderRecordPanel
              rider={rider as unknown as RiderRecord}
              readiness={readiness as Record<string, unknown> | null}
              merchantName={(employer as { trading_name: string } | null)?.trading_name ?? null}
            />
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Applicant</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Phone', rider.phone],
                  [
                    'Phone verified',
                    rider.phone_verified_at ? 'Yes, by code' : 'No — confirm on the call',
                  ],
                  ['City', city?.name ?? '—'],
                  ['Vehicle', rider.vehicle ?? '— not chosen'],
                  ['Plate', rider.plate_no ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-light font-semibold">{label}</dt>
                    <dd className="font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <ActivatePanel
              kind="rider"
              disabled={rider.status === 'active'}
              outstanding={outstanding.length}
              currentStatus={rider.status}
              onActivate={async (reason) => {
                'use server';
                return activateRider(params.id, reason);
              }}
            />
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}
