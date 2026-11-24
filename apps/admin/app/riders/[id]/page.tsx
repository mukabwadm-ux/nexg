import type { Database } from '@nexg/db';
import { Card, StatusBadge, type StatusKey } from '@nexg/ui';
import {
  Activity,
  Banknote,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Route,
  ShieldAlert,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { activateRider, rejectDocument, verifyDocument } from '@/app/riders/actions';
import { fileDocumentFor, remindToUpload } from '@/app/documents/actions';
import { ActivatePanel } from '@/components/activate-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentReview, type ReviewDocument } from '@/components/document-review';
import { RiderRecordPanel, type RiderRecord } from '@/components/rider-record';
import { RiderKitPanel, type RiderKitStatus } from '@/components/riders/rider-kit-panel';
import { RiderStagePanel } from '@/components/riders/rider-stage-panel';
import {
  ActivityView,
  ConductView,
  MessagesView,
  MoneyView,
  OverviewView,
  RiderKpis,
  TripsView,
  type RiderProfile,
  type TripDetail,
} from '@/components/riders/rider-profile';
import { PillTabs } from '@/components/console-kit';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Rider' };
export const dynamic = 'force-dynamic';

/*
 * A rider's record. The views are links (?view=) so a pasted link opens the
 * same view. Application is the onboarding page this used to be, and is
 * where someone still onboarding lands; everything else comes from one
 * reader, rpc_console_rider_profile (20270312000100).
 */
const VIEWS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'trips', label: 'Trips', icon: Route },
  { key: 'money', label: 'Money', icon: Banknote },
  { key: 'activity', label: 'Shifts & rewards', icon: Activity },
  { key: 'conduct', label: 'Ratings & conduct', icon: ShieldAlert },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'application', label: 'Application', icon: ClipboardList },
] as const;

export default async function RiderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { view?: string; trip?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const { data: rider } = await supabase
    .from('rider')
    .select('*, city(name)')
    .eq('id', params.id)
    .maybeSingle();

  // RLS already limits this to the cities this account covers, so "not found"
  // and "not yours" are deliberately the same answer.
  if (!rider) notFound();

  const onboarding = !rider.activated_at && !['active', 'suspended'].includes(rider.status);
  const view = VIEWS.some((v) => v.key === searchParams?.view)
    ? searchParams!.view!
    : onboarding
      ? 'application'
      : 'overview';

  let profile: RiderProfile | null = null;
  let failure: string | null = null;
  let trip: TripDetail | null = null;
  const photos: Record<string, string> = {};

  if (view !== 'application') {
    const { data, error } = await supabase.rpc('rpc_console_rider_profile', {
      p_rider_id: params.id,
    });
    profile = (data as unknown as RiderProfile | null) ?? null;
    failure = error?.message ?? null;

    const tripId = searchParams?.trip;
    if (view === 'trips' && tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      const res = await supabase.rpc('rpc_console_rider_trip', {
        p_rider_id: params.id,
        p_order_id: tripId,
      });
      trip = (res.data as unknown as TripDetail | null) ?? null;
      /* Proof photos: five-minute signed URLs, minted per request, never stored. */
      const paths = Array.from(
        new Set(
          [trip?.handoff_photo_path, ...(trip?.events ?? []).map((e) => e.photo_path)].filter(
            (p): p is string => !!p,
          ),
        ),
      );
      await Promise.all(
        paths.map(async (path) => {
          const { data: signed } = await supabase.storage
            .from('rider-proof')
            .createSignedUrl(path, 300);
          if (signed?.signedUrl) photos[path] = signed.signedUrl;
        }),
      );
    }
  }

  const city = rider.city as { name: string } | null;

  return (
    <ConsoleShell staff={staff} current="/riders">
      <ConsoleHeader
        title={`${rider.first_name} ${rider.last_name ?? ''}`.trim()}
        breadcrumb={`${city?.name ?? 'No city'} · ${rider.vehicle ?? 'no vehicle'}${
          rider.plate_no ? ` · ${rider.plate_no}` : ''
        }`}
        action={<StatusBadge status={rider.status as StatusKey} />}
      />

      <main className="space-y-5 px-4 py-6 sm:px-8">
        <Link
          href="/riders"
          className="text-muted hover:text-ink text-xs font-bold transition-colors"
        >
          ← All riders
        </Link>

        <PillTabs
          tabs={VIEWS.map((v) => ({
            href: `/riders/${params.id}?view=${v.key}`,
            label: v.label,
            icon: v.icon,
            active: view === v.key,
          }))}
        />

        {view === 'application' ? (
          <ApplicationView rider={rider} staffId={staff.staffId} />
        ) : !profile ? (
          <Card className="p-5">
            <p className="text-danger text-sm font-bold">
              The rider&apos;s record could not be read{failure ? `: ${failure}` : '.'}
            </p>
          </Card>
        ) : (
          <>
            <RiderKpis p={profile} />
            {view === 'overview' && <OverviewView p={profile} />}
            {view === 'trips' && <TripsView p={profile} trip={trip} photos={photos} />}
            {view === 'money' && <MoneyView p={profile} />}
            {view === 'activity' && <ActivityView p={profile} />}
            {view === 'conduct' && <ConductView p={profile} />}
            {view === 'messages' && <MessagesView p={profile} />}
          </>
        )}
      </main>
    </ConsoleShell>
  );
}

type RiderWithCity = Database['public']['Tables']['rider']['Row'] & {
  city: { name: string } | null;
};

/** The onboarding page: documents, checks, kit, activation and suspension. */
async function ApplicationView({ rider, staffId }: { rider: RiderWithCity; staffId: string }) {
  const params = { id: rider.id };
  const staff = { staffId };
  const supabase = createClient();

  const [{ data: kit }, { data: trainingRows }, { data: trips }, { data: suspensions }] =
    await Promise.all([
      supabase.rpc('rpc_rider_kit_status', { p_rider_id: params.id }),
      supabase.from('rider_training').select('module, passed').eq('rider_id', params.id),
      supabase
        .from('rider_test_trip')
        .select('outcome, created_at, notes')
        .eq('rider_id', params.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('approval_request')
        .select('id, reason, created_at, requested_by')
        .eq('kind', 'rider_suspension')
        .eq('target_id', params.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);
  const background = (rider.background_check ?? {}) as Record<string, unknown>;
  const pending = (suspensions ?? [])[0] as
    | { id: string; reason: string | null; created_at: string; requested_by: string | null }
    | undefined;
  const stageState = {
    status: rider.status as string,
    background: {
      status: typeof background.status === 'string' ? background.status : null,
      note: typeof background.note === 'string' ? background.note : null,
      checked_at: typeof background.checked_at === 'string' ? background.checked_at : null,
    },
    trainingPassed: (trainingRows ?? []).some((t) => t.module === 'basics' && t.passed),
    testTrip:
      ((trips ?? [])[0] as
        | { outcome: string; created_at: string; notes: string | null }
        | undefined) ?? null,
    pendingSuspension: pending
      ? {
          id: pending.id,
          reason: pending.reason,
          created_at: pending.created_at,
          mine: pending.requested_by === staff.staffId,
        }
      : null,
  };

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
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
              onFiled={async (input) => {
                'use server';
                return fileDocumentFor('rider', params.id, input);
              }}
              storagePrefix={`rider/${params.id}`}
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
              ['Phone (M-Pesa)', rider.phone],
              ['Email (login)', rider.email ?? '— not submitted yet'],
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

        <div id="suspend" className="scroll-mt-6">
          <RiderStagePanel riderId={params.id} state={stageState} />
        </div>

        <RiderKitPanel riderId={params.id} status={kit as unknown as RiderKitStatus | null} />

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
  );
}
