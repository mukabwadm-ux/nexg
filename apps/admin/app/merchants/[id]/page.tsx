import { Card, StatusBadge, type StatusKey } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { goLive, rejectDocument, setFeatured, verifyDocument } from '@/app/merchants/actions';
import { ActivatePanel } from '@/components/activate-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { DocumentReview, type ReviewDocument } from '@/components/document-review';
import { FeatureToggle } from '@/components/feature-toggle';
import { OnboardingRecord } from '@/components/onboarding-record';
import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchant application' };
export const dynamic = 'force-dynamic';

export default async function MerchantApplicationPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  const supabase = createClient();

  const { data: merchant } = await supabase
    .from('merchant')
    .select('*, city(name)')
    .eq('id', params.id)
    .maybeSingle();

  if (!merchant) notFound();

  const [
    { data: requirements },
    { data: documents },
    { data: branches },
    { data: readiness },
    { data: categoryConfig },
    { data: fleet },
    { data: chases },
  ] = await Promise.all([
    /*
     * The same function the merchant's own documents step called, rather than
     * a second copy of the rules here. A reviewer looking at a shorter list
     * than the applicant was shown is how a licence goes unasked for.
     */
    supabase.rpc('fn_merchant_required_docs', { p_merchant_id: params.id }),
    supabase
      .from('document')
      .select('id, requirement_id, status, storage_path, mime, expires_at, rejection_reason')
      .eq('owner_type', 'merchant')
      .eq('owner_id', params.id)
      .is('superseded_at', null),
    supabase
      .from('merchant_branch')
      .select(
        'name, address_text, is_primary, inherits_hours, latitude, longitude, zone:zone_id (name, tier, eta_min, eta_max, cod_allowed)',
      )
      .eq('merchant_id', params.id)
      .order('is_primary', { ascending: false }),
    supabase.rpc('fn_merchant_readiness', { p_merchant_id: params.id }),
    merchant.category
      ? supabase
          .from('category_config')
          .select('label, questions, card_kind')
          .eq('category', merchant.category)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('merchant_fleet_rider')
      .select('name, phone, vehicle, plate_no, invite_status, rider_id')
      .eq('merchant_id', params.id),
    supabase
      .from('document_request')
      .select('requirement_id, sent_at, channel')
      .eq('owner_type', 'merchant')
      .eq('owner_id', params.id)
      .is('fulfilled_document_id', null),
  ]);

  const applicable =
    (requirements as
      | {
          id: string;
          kind: string;
          label: string;
          why_text: string | null;
          required: boolean;
          essential: boolean;
        }[]
      | null) ?? [];
  const byRequirement = new Map((documents ?? []).map((d) => [d.requirement_id, d]));
  const chasedIds = new Set(
    ((chases as { requirement_id: string }[] | null) ?? []).map((c) => c.requirement_id),
  );

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
        helpText: chasedIds.has(requirement.id)
          ? `${requirement.why_text ?? ''} · the merchant asked us to chase this on WhatsApp`.trim()
          : requirement.why_text,
        /* Essential is what blocks going live; the rest have a grace period. */
        required: requirement.essential,
        status: (document?.status ?? 'missing') as ReviewDocument['status'],
        expiresAt: document?.expires_at ?? null,
        rejectionReason: document?.rejection_reason ?? null,
        url,
        mime: document?.mime ?? null,
      };
    }),
  );

  const outstanding = review.filter((d) => d.required && d.status !== 'verified');
  const city = merchant.city as { name: string } | null;
  const primary = branches?.[0];

  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title={merchant.trading_name}
        breadcrumb="Merchants → Application"
        action={<StatusBadge status={merchant.status as StatusKey} />}
      />

      <main className="px-4 py-6 sm:px-8">
        <Link
          href="/merchants"
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
                />
              </div>
            </div>

            {/*
              Everything the merchant answered during onboarding. It lives
              here rather than only in the database because a reviewer on the
              call needs the same picture the applicant was building.
            */}
            <OnboardingRecord
              merchant={merchant}
              config={
                categoryConfig as { label: string; questions: unknown; card_kind: string } | null
              }
              branches={(branches as BranchRow[] | null) ?? []}
              fleet={(fleet as FleetRow[] | null) ?? []}
              readiness={readiness as Record<string, unknown> | null}
            />
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Business</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Legal name', merchant.legal_name ?? '— not given'],
                  [
                    'Category',
                    merchant.category_other ??
                      merchant.category?.replace(/_/g, ' ') ??
                      '— not chosen',
                  ],
                  ['City', city?.name ?? '—'],
                  ['Contact', merchant.contact_name ?? '—'],
                  ['Phone', merchant.contact_phone],
                  ['Email', merchant.contact_email ?? '— phone only'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-light shrink-0 font-semibold">{label}</dt>
                    <dd className="truncate text-right font-bold">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="border-border mt-4 border-t pt-3">
                <p className="text-muted-light text-xs font-semibold">Collection address</p>
                <p className="mt-1 text-sm font-bold">{primary?.address_text ?? 'Not given yet'}</p>
              </div>

              {/*
                Whether anyone has checked this number. A reviewer about to
                ring it should know whether it has been proved or merely
                typed — a wrong number here is an unreachable business.
              */}
              <div className="border-border mt-3 border-t pt-3">
                <p className="text-muted-light text-xs font-semibold">Phone verification</p>
                <p
                  className={`mt-1 text-sm font-bold ${
                    merchant.phone_verified_at ? 'text-success' : 'text-warning'
                  }`}
                >
                  {merchant.phone_verified_at
                    ? 'Verified by code'
                    : 'Not verified — confirm it on the call'}
                </p>
              </div>
            </Card>

            <FeatureToggle
              featured={merchant.featured}
              live={merchant.status === 'live'}
              onToggle={async (next) => {
                'use server';
                return setFeatured(params.id, next);
              }}
            />

            <ActivatePanel
              kind="merchant"
              disabled={merchant.status === 'live'}
              outstanding={outstanding.length}
              currentStatus={merchant.status}
              onActivate={async (reason) => {
                'use server';
                return goLive(params.id, reason);
              }}
            />
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}

export interface BranchRow {
  name: string | null;
  address_text: string | null;
  is_primary: boolean;
  inherits_hours: boolean;
  latitude: number | null;
  longitude: number | null;
  zone: {
    name: string;
    tier: string;
    eta_min: number;
    eta_max: number;
    cod_allowed: boolean;
  } | null;
}

export interface FleetRow {
  name: string;
  phone: string;
  vehicle: string;
  plate_no: string | null;
  invite_status: string;
  rider_id: string | null;
}
