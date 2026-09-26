import { Card, StatusBadge, type StatusKey } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { activateRider, rejectDocument, verifyDocument } from '@/app/riders/actions';
import { ActivatePanel } from '@/components/activate-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentReview, type ReviewDocument } from '@/components/document-review';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Rider application' };
export const dynamic = 'force-dynamic';

export default async function RiderApplicationPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  const supabase = createClient();

  const { data: rider } = await supabase
    .from('rider')
    .select('id, first_name, last_name, phone, status, vehicle, plate_no, created_at, city(name)')
    .eq('id', params.id)
    .maybeSingle();

  // RLS already limits this to the cities this account covers, so "not found"
  // and "not yours" are deliberately the same answer.
  if (!rider) notFound();

  const [{ data: requirements }, { data: documents }] = await Promise.all([
    supabase
      .from('document_requirement')
      .select('id, kind, label, help_text, required, applies_when, sort')
      .eq('owner_type', 'rider')
      .order('sort', { ascending: true }),
    supabase
      .from('document')
      .select('id, requirement_id, status, storage_path, mime, expires_at, rejection_reason')
      .eq('owner_type', 'rider')
      .eq('owner_id', params.id)
      .is('superseded_at', null),
  ]);

  const applicable = (requirements ?? []).filter((requirement) => {
    const when = requirement.applies_when as Record<string, string[]> | null;
    const vehicles = when?.['vehicle'];
    return !vehicles || vehicles.includes(rider.vehicle);
  });

  const byRequirement = new Map((documents ?? []).map((d) => [d.requirement_id, d]));

  /*
   * Signed URLs are minted here, per request, and last five minutes (section
   * 3.4). They are never stored: a URL in the page source that still worked
   * tomorrow would be a copy of the document nobody could revoke.
   */
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
        helpText: requirement.help_text,
        required: requirement.required,
        status: (document?.status ?? 'missing') as ReviewDocument['status'],
        expiresAt: document?.expires_at ?? null,
        rejectionReason: document?.rejection_reason ?? null,
        url,
        mime: document?.mime ?? null,
      };
    }),
  );

  const outstanding = review.filter((d) => d.required && d.status !== 'verified');
  const city = rider.city as { name: string } | null;

  return (
    <ConsoleShell staff={staff} current="/riders">
      <ConsoleHeader
        title={`${rider.first_name} ${rider.last_name}`.trim()}
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
              />
            </div>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Applicant</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Phone', rider.phone],
                  ['City', city?.name ?? '—'],
                  ['Vehicle', rider.vehicle],
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
