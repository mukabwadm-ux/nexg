import { Card, StatusBadge, type StatusKey } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { deleteMerchant, goLive, setMerchantDeactivated } from '@/app/merchants/actions';
import { sendFeaturedPitch, unfeatureMerchant } from '@/app/featured/actions';
import { ActivatePanel } from '@/components/activate-panel';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { FeaturedNow } from '@/components/featured/place-merchant';
import { MerchantLifecycleActions } from '@/components/merchant-lifecycle-actions';
import { PitchPanel, type Preview } from '@/components/featured/pitch-panel';
import { OnboardingRecord } from '@/components/onboarding-record';
import { ApplicationReviewUnavailable } from '@/components/merchants/application-review-view';
import { BookingReadiness } from '@/components/merchants/booking-readiness';
import { MerchantDocumentsSection } from '@/components/merchants/documents-section';
import { MerchantCatalogue, MerchantOverview } from '@/components/merchants/merchant-overview';
import { MerchantSearch } from '@/components/merchants/merchant-search';
import { MerchantPerformance } from '@/components/merchants/performance';
import { loadMerchantDocuments } from '@/lib/merchant-documents';
import { isManagedMerchantApplication, ReviewSourceError } from '@/lib/merchant-application-review';
import {
  rangeFrom,
  summarise,
  type PerformanceOrder,
  type PerformanceRating,
} from '@/lib/merchant-performance';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Merchant' };
export const dynamic = 'force-dynamic';

export default async function MerchantApplicationPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { range?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');
  let managed: boolean;
  try {
    managed = await isManagedMerchantApplication(params.id);
  } catch (error) {
    return (
      <ConsoleShell staff={staff} current="/merchants">
        <ConsoleHeader title="Merchant application" breadcrumb="Merchants / Application" />
        <main className="px-4 py-6 sm:px-8">
          <ApplicationReviewUnavailable
            status={error instanceof ReviewSourceError ? error.status : 503}
          />
        </main>
      </ConsoleShell>
    );
  }
  const supabase = createClient();
  /*
   * A new-form application is reviewed on its own read-only page. Once it is
   * approved, staff manage the merchant here like any other: documents,
   * Take live, deactivate, delete.
   */
  if (managed) {
    const { data: application } = await supabase
      .from('merchant_application')
      .select('review_state')
      .eq('merchant_id', params.id)
      .maybeSingle();
    if (application?.review_state !== 'approved')
      redirect(`/merchants/applications/${encodeURIComponent(params.id)}`);
  }

  const { data: merchant, error: merchantError } = await supabase
    .from('merchant')
    .select('*, city(name)')
    .eq('id', params.id)
    .maybeSingle();

  if (merchantError) {
    throw new Error(`Could not load merchant: ${merchantError.message}`);
  }

  /* What their placement actually is, if they have one. The boolean
     on the merchant row only says yes or no. */
  const { data: featuredPlacement } = await supabase
    .from('merchant_featured_v')
    .select('*')
    .eq('merchant_id', params.id)
    .maybeSingle();

  if (!merchant || merchant.deleted_at) notFound();

  /* After the null check, so `merchant` is actually narrowed. Only
     worth pitching to somebody who is trading and not already in a
     slot. */
  const { data: pitch } =
    merchant.status === 'live' && !featuredPlacement
      ? await supabase.rpc('rpc_featured_pitch_preview', { p_merchant_id: params.id })
      : { data: null };

  /* Two windows back, plus a day for the Nairobi offset. */
  const range = rangeFrom(searchParams?.range);
  const now = new Date();
  const performanceSince = new Date(
    now.getTime() - (range.days * 2 + 1) * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    documents,
    { data: branches },
    { data: readiness },
    { data: categoryConfig },
    { data: fleet },
    { count: activeResources },
    { data: performanceOrders, error: performanceError },
    { data: performanceRatings },
    { data: catalogue, count: catalogueCount },
    { count: teamCount },
    { count: liveOfferings },
  ] = await Promise.all([
    loadMerchantDocuments(supabase, params.id),
    supabase
      .from('merchant_branch')
      .select(
        'name, address_text, is_primary, inherits_hours, latitude, longitude, zone:zone_id (name, tier, eta_min, eta_max, cod_allowed)',
      )
      .eq('merchant_id', params.id)
      .order('is_primary', { ascending: false }),
    supabase.rpc('fn_merchant_readiness', { p_merchant_id: params.id }),
    (merchant.category_key ?? merchant.category)
      ? supabase
          .from('category_config')
          .select('label, questions, subcategories, card_kind')
          .eq('category', merchant.category_key ?? merchant.category!)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('merchant_fleet_rider')
      .select('name, phone, vehicle, plate_no, invite_status, rider_id')
      .eq('merchant_id', params.id),
    supabase
      .from('bookable_resource')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', params.id)
      .eq('active', true),
    /* This window and the one before it, for the Performance section. */
    supabase
      .from('order')
      .select(
        'placed_at, stage, subtotal_cents, confirmed_at, ready_at, promised_ready_at, guest_id, order_item(name, quantity, line_total_cents, removed_at)',
      )
      .eq('merchant_id', params.id)
      .gte('placed_at', performanceSince)
      .order('placed_at', { ascending: true })
      .limit(5000),
    supabase
      .from('order_rating')
      .select('stars, created_at')
      .eq('merchant_id', params.id)
      .gte('created_at', performanceSince)
      .limit(5000),
    /* What they sell: on the menu first, then hidden drafts. */
    supabase
      .from('catalogue_item')
      .select('id, name, price_kes, available, updated_at', { count: 'exact' })
      .eq('merchant_id', params.id)
      .order('available', { ascending: false })
      .order('name', { ascending: true })
      .limit(12),
    supabase
      .from('merchant_user')
      .select('user_id', { count: 'exact', head: true })
      .eq('merchant_id', params.id),
    supabase
      .from('catalogue_item')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', params.id)
      .eq('available', true),
  ]);

  const { review, outstanding } = documents;
  const city = merchant.city as { name: string } | null;
  const primary = branches?.[0];
  const canManageLifecycle = staff.isSuperAdmin || staff.roles.includes('merchant_ops');
  const performance = summarise(
    (performanceOrders as PerformanceOrder[] | null) ?? [],
    (performanceRatings as PerformanceRating[] | null) ?? [],
    range.days,
    now,
  );
  const trading = ['live', 'paused', 'suspended'].includes(merchant.status);
  const name = merchant.trading_name || merchant.legal_name || 'Unnamed merchant';
  return (
    <ConsoleShell staff={staff} current="/merchants">
      <ConsoleHeader
        title={name}
        breadcrumb={trading ? 'Merchants → Merchant' : 'Merchants → Application'}
        action={<StatusBadge status={merchant.status as StatusKey} />}
      />

      <main className="px-4 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/merchants"
              className="text-muted hover:text-ink text-xs font-bold transition-colors"
            >
              ← Back to merchants
            </Link>
            {managed ? (
              <Link
                prefetch={false}
                href={`/merchants/applications/${encodeURIComponent(params.id)}`}
                className="text-gold-text text-xs font-bold"
              >
                View the approved application
              </Link>
            ) : null}
          </div>
          <MerchantSearch />
        </div>

        <MerchantOverview
          name={name}
          legalName={merchant.legal_name}
          status={merchant.status}
          category={
            merchant.category_other ??
            categoryConfig?.label ??
            merchant.category?.replace(/_/g, ' ') ??
            null
          }
          city={city?.name ?? null}
          contactName={merchant.contact_name}
          phone={merchant.contact_phone}
          email={merchant.contact_email}
          phoneVerified={!!merchant.phone_verified_at}
          joinedAt={merchant.created_at}
          liveSince={merchant.went_live_at}
          documents={{
            onFile: documents.onFile,
            total: review.length,
            outstanding: outstanding.length,
          }}
          branches={branches?.length ?? 0}
          offerings={{ live: liveOfferings ?? 0, total: catalogueCount ?? 0 }}
          team={teamCount ?? null}
          rating={{ value: performance.rating.value, count: performance.rating.count }}
        />

        {/* For every merchant: an applicant with no orders sees "No data"
            rather than a missing section, so the page always has the same
            shape. */}
        <section id="performance" aria-label="Performance" className="mt-8 scroll-mt-24">
          <MerchantPerformance
            merchantId={params.id}
            range={range.key}
            data={performance}
            failed={!!performanceError}
          />
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-10">
            <MerchantDocumentsSection merchantId={params.id} {...documents} />

            <MerchantCatalogue
              items={
                (catalogue as
                  | { id: string; name: string; price_kes: number | null; available: boolean }[]
                  | null) ?? []
              }
              total={catalogueCount ?? 0}
            />

            {/*
              Everything the merchant answered during onboarding. It lives
              here rather than only in the database because a reviewer on the
              call needs the same picture the applicant was building.
            */}
            <div id="onboarding" className="scroll-mt-24">
              <OnboardingRecord
                merchant={merchant}
                config={
                  categoryConfig as {
                    label: string;
                    questions: unknown;
                    subcategories: unknown;
                    card_kind: string;
                  } | null
                }
                branches={(branches as BranchRow[] | null) ?? []}
                fleet={(fleet as FleetRow[] | null) ?? []}
                readiness={readiness as Record<string, unknown> | null}
              />
            </div>
          </div>

          <div id="business" className="scroll-mt-24 space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wide">Business</h2>
              <dl className="mt-3 space-y-2 text-sm">
                {[
                  ['Legal name', merchant.legal_name ?? '— not given'],
                  [
                    'Category',
                    merchant.category_other ??
                      categoryConfig?.label ??
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

            {/*
              The old control was a boolean. Being featured is a slot
              held for a week at an agreed price, so this shows which
              one and until when — and selling a new one happens where
              those three things can be chosen.
            */}
            {merchant.status === 'live' && !featuredPlacement && (
              <PitchPanel
                merchantName={merchant.trading_name ?? merchant.legal_name ?? 'them'}
                preview={(pitch as Preview | null) ?? null}
                onSend={async (note) => {
                  'use server';
                  const r = await sendFeaturedPitch(params.id, note);
                  return { ok: r.ok, message: r.message ?? '' };
                }}
              />
            )}

            <FeaturedNow
              merchantName={merchant.trading_name ?? merchant.legal_name ?? ''}
              placement={
                featuredPlacement?.placement_kind && featuredPlacement.until
                  ? {
                      placement_kind: featuredPlacement.placement_kind,
                      placement_category: featuredPlacement.placement_category,
                      until: featuredPlacement.until,
                      price_per_week: featuredPlacement.price_per_week,
                      has_creative: featuredPlacement.has_creative ?? false,
                      booked_by_email: featuredPlacement.booked_by_email,
                    }
                  : null
              }
              onEnd={async (reason) => {
                'use server';
                return unfeatureMerchant(params.id, reason);
              }}
            />

            {canManageLifecycle && (
              <MerchantLifecycleActions
                merchantId={params.id}
                merchantName={merchant.trading_name ?? merchant.legal_name ?? 'this merchant'}
                status={merchant.status}
                isDeactivated={!!merchant.deactivated_at}
                onSetDeactivated={async (deactivated, reason) => {
                  'use server';
                  return setMerchantDeactivated(params.id, deactivated, reason);
                }}
                onDelete={async (confirmationName, reason) => {
                  'use server';
                  return deleteMerchant(params.id, confirmationName, reason);
                }}
              />
            )}

            <BookingReadiness
              merchantId={params.id}
              status={merchant.status}
              exploreVisible={!!merchant.explore_visible}
              subcategory={merchant.subcategory ?? null}
              activeResources={activeResources ?? 0}
            />

            {merchant.deactivated_at ? (
              <Card tone="muted" className="p-5">
                <h2 className="text-sm font-extrabold uppercase tracking-wide">
                  Activation paused
                </h2>
                <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
                  Reactivate this merchant from Merchant access before changing its listing status.
                </p>
              </Card>
            ) : (
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
            )}
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
