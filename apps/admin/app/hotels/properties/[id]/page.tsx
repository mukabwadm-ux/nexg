import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as React from 'react';

import { reviewProperty } from '@/app/hotels/actions';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { PropertyReview } from '@/components/hotels/property-review';
import { DASH, HOST_STATUS_TONE, kes, Pill, plural } from '@/components/hotels/shared';
import { Card } from '@nexg/ui';
import { hostPayouts } from '@/lib/host-payouts';
import {
  isReviewStatus,
  occupancyOf,
  photoRefs,
  pinOf,
  REVIEW_LABEL,
  REVIEW_TONE,
  upcoming,
} from '@/lib/property-detail';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Property' };
export const dynamic = 'force-dynamic';

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://nexgapp.com');

const DOCUMENT_LABEL: Record<string, string> = {
  id_document: 'ID or passport',
  authority: 'Proof of authority to let',
  kra_pin: 'KRA PIN certificate',
  business_registration: 'Business registration',
};

const STAY_LABEL: Record<string, string> = {
  held: 'Held',
  booked: 'Booked',
  in_stay: 'Checked in',
  departed: 'Departed',
  cancelled: 'Cancelled',
  blocked: 'Blocked by host',
};

const REQUEST_TONE: Record<string, string> = {
  new: 'bg-gold-soft text-gold-text',
  reviewing: 'bg-warning-bg text-warning',
  matched: 'bg-warning-bg text-warning',
  sent: 'bg-success-bg text-success',
  won: 'bg-success-bg text-success',
  lost: 'bg-bg text-muted',
  closed: 'bg-bg text-muted-light',
  open: 'bg-gold-soft text-gold-text',
  in_progress: 'bg-warning-bg text-warning',
  waiting_on_host: 'bg-warning-bg text-warning',
  waiting_on_guest: 'bg-warning-bg text-warning',
  quoted: 'bg-warning-bg text-warning',
  resolved: 'bg-success-bg text-success',
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * One property, everything staff need to judge whether it is real and how
 * it is doing: the place, its photos, the host and their documents, the
 * units, who is in tonight, what guests asked for, and the reviews.
 *
 * Read with the staff member's own session, so RLS decides what shows.
 * Before migration 20270323000100 the property has no review status: the
 * page is read-only and says so.
 */
export default async function PropertyPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!uuid.test(params.id)) notFound();

  const supabase = createClient();
  const { data: property, error } = await supabase
    .from('property')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the property: ${error.message}`);
  if (!property) notFound();

  const [
    { data: summary },
    { data: hostRow },
    { data: hostDirectory },
    { data: city },
    { data: unitRows },
    { data: lister },
  ] = await Promise.all([
    supabase.from('console_property_v').select('*').eq('id', property.id).maybeSingle(),
    supabase
      .from('host')
      .select(
        'id, display_name, contact_name, email, status, kind, tier, verified_at, verification_method, went_live_at, listing_link',
      )
      .eq('id', property.host_id)
      .maybeSingle(),
    supabase
      .from('console_host_directory_v')
      .select('phone_masked')
      .eq('id', property.host_id)
      .maybeSingle(),
    property.city_id
      ? supabase.from('city').select('name').eq('id', property.city_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('unit')
      .select(
        'id, name, label_public, status, listed, host_published, archived_at, bedrooms, bathrooms, max_guests, size_sqm, bed_setup, nightly_rate_kes, min_nights, photos, paused_reason, created_at',
      )
      .eq('property_id', property.id)
      .order('name'),
    property.listed_by
      ? supabase
          .from('staff_user')
          .select('display_name')
          .eq('id', property.listed_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const units = unitRows ?? [];
  const unitIds = units.map((u) => u.id);
  const unitName = new Map(units.map((u) => [u.id, u.label_public || u.name]));
  const scope = unitIds.length
    ? `property_id.eq.${property.id},unit_id.in.(${unitIds.join(',')})`
    : `property_id.eq.${property.id}`;

  const [
    { data: stayRows },
    { data: hostRequests },
    { data: matches },
    { data: documentRows },
    payouts,
    team,
  ] = await Promise.all([
    supabase
      .from('stay')
      .select(
        'id, unit_id, guest_first_name, party_adults, party_children, check_in, check_out, status, source, quote_total_kes, paid_kes, checked_in_at, created_at',
      )
      .or(scope)
      .order('check_in', { ascending: false })
      .limit(300),
    supabase
      .from('host_request')
      .select(
        'id, reference, kind, type, priority, title, status, raised_by, unit_id, created_at, resolved_at',
      )
      .or(scope)
      .order('created_at', { ascending: false })
      .limit(100),
    unitIds.length
      ? supabase
          .from('stay_request_match')
          .select(
            'id, unit_id, rank, quoted_nightly_kes, guest_response, sent_at, request:request_id(id, reference, status, requester_name, check_in, check_out, guests, created_at)',
          )
          .in('unit_id', unitIds)
          .order('created_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from('host_document')
      .select('id, kind, file_name, status, rejection_reason, uploaded_at, storage_path')
      .eq('host_id', property.host_id)
      .is('superseded_at', null)
      .order('uploaded_at', { ascending: true }),
    supabase.rpc('rpc_host_payouts'),
    /* Added by 20270323000100. Before it, the team list is the roles only. */
    supabase.rpc('rpc_property_team', { p_property_id: property.id }),
  ]);

  const stays = stayRows ?? [];
  const stayIds = stays.map((s) => s.id);
  const { data: reviewRows } = stayIds.length
    ? await supabase
        .from('stay_review')
        .select('stay_id, rating, text, themes, answered_at')
        .in('stay_id', stayIds.slice(0, 300))
        .not('rating', 'is', null)
        .order('answered_at', { ascending: false })
    : { data: [] };
  const reviews = reviewRows ?? [];

  /* Before the migration staff cannot read team emails; read the roles. */
  const { data: memberRows } = team.error
    ? await supabase
        .from('host_user')
        .select('user_id, role, units, accepted_at, created_at')
        .eq('host_id', property.host_id)
    : { data: null };
  const people =
    team.data?.map((m) => ({
      key: m.user_id,
      role: m.role,
      email: m.email as string | null,
      scope: m.unit_scope,
      accepted: m.accepted_at,
    })) ??
    (memberRows ?? []).map((m) => ({
      key: m.user_id,
      role: m.role,
      email: null as string | null,
      scope: m.units ? m.units.length : null,
      accepted: m.accepted_at,
    }));

  /* Photos and documents are private files: short-lived signed links. */
  const propertyPhotos = photoRefs(property.photos);
  const unitPhotos = units.flatMap((u) =>
    photoRefs(u.photos).map((p) => ({ ...p, unit: u.label_public || u.name })),
  );
  const photoPaths = Array.from(
    new Set([...propertyPhotos, ...unitPhotos].flatMap((p) => (p.path ? [p.path] : []))),
  );
  const docs = documentRows ?? [];
  const [{ data: signedPhotos }, { data: signedDocs }] = await Promise.all([
    photoPaths.length
      ? supabase.storage.from('host-photos').createSignedUrls(photoPaths, 1800)
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
    docs.length
      ? supabase.storage.from('partner-documents').createSignedUrls(
          docs.map((d) => d.storage_path),
          600,
        )
      : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);
  const photoUrl = new Map(signedPhotos?.map((s) => [s.path, s.signedUrl]));
  const docUrl = new Map(signedDocs?.map((s) => [s.path, s.signedUrl]));

  const payout = hostPayouts(payouts.data).find((p) => p.host_id === property.host_id) ?? null;
  const pin = pinOf(property.point);
  const now = new Date();
  const liveUnits = units.filter((u) => !u.archived_at);
  const listedUnits = liveUnits.filter((u) => u.listed && u.status === 'live');
  const occupiedNow = liveUnits.filter((u) => occupancyOf(u.id, stays, now) === 'occupied');
  const coming = upcoming(stays, now).slice(0, 20);
  const pastStays = stays
    .filter((s) => new Date(s.check_in).getTime() <= now.getTime())
    .slice(0, 20);

  const reviewStatus = isReviewStatus(property.review_status) ? property.review_status : null;
  const averageRating = reviews.length
    ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
    : null;
  const showing = summary ? !summary.blocked_reason : false;

  return (
    <ConsoleShell staff={staff} current="/hotels">
      <ConsoleHeader title={property.name} breadcrumb="NEXG Stays · Listings & properties" />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <Link
          href="/hotels?tab=listings"
          className="text-muted hover:text-ink text-sm font-semibold"
        >
          ← Back to listings
        </Link>

        {/* ─────────────────────────────── the decision */}
        <Card className="mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-muted text-[0.6875rem] font-extrabold uppercase tracking-wide">
                {property.kind.replace(/_/g, ' ')} ·{' '}
                {[property.area, city?.name].filter(Boolean).join(', ') || DASH}
              </p>
              <h1 className="mt-1 text-xl font-extrabold">{property.name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-2">
                {reviewStatus && (
                  <Pill tone={REVIEW_TONE[reviewStatus]}>
                    {REVIEW_LABEL[reviewStatus].toUpperCase()}
                  </Pill>
                )}
                {summary &&
                  (summary.blocked_reason ? (
                    <Pill tone="bg-warning-bg text-warning">
                      Not on the site: {summary.blocked_reason}
                    </Pill>
                  ) : (
                    <Pill tone="bg-success-bg text-success">LIVE ON THE SITE</Pill>
                  ))}
              </p>
            </div>
            <a
              href={`${SITE}/stays/${property.slug}`}
              target="_blank"
              rel="noreferrer"
              className="border-border-strong rounded-full border px-4 py-2 text-[0.8125rem] font-extrabold"
            >
              View on website ↗
            </a>
          </div>
          {!showing && (
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
              The website page opens only while the property is live.
            </p>
          )}

          <div className="border-border mt-5 border-t pt-4">
            <h2 className="text-[0.9375rem] font-extrabold">NexG review</h2>
            {reviewStatus ? (
              <>
                <p className="text-muted mt-1 text-sm font-semibold">
                  {reviewStatus === 'pending'
                    ? 'Guests cannot see this property until someone at NexG checks it: the photos match a real place, the address and pin are right, and the host’s documents show they may let it.'
                    : reviewStatus === 'approved'
                      ? 'Checked and approved. Suspend it if something turns out to be wrong; it leaves the site at once.'
                      : reviewStatus === 'rejected'
                        ? 'Rejected. Guests cannot see it. Approve it once the host has fixed what was wrong.'
                        : 'Suspended. Guests cannot see it or book it. Reinstate it once the problem is dealt with.'}
                </p>
                {property.review_reason && (
                  <p className="bg-bg mt-2 rounded-lg p-3 text-sm font-semibold">
                    Reason: {property.review_reason}
                  </p>
                )}
                {property.reviewed_at && (
                  <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
                    Last decided {date(property.reviewed_at)}
                    {property.reviewed_by
                      ? summary?.reviewed_by_name
                        ? ` by ${summary.reviewed_by_name}`
                        : ''
                      : ' (approved automatically because it was already live)'}
                  </p>
                )}
                {/* Matches authz.works_hospitality(), which rpc_property_review checks. */}
                {staff.isSuperAdmin ||
                staff.roles.some((r) =>
                  ['ops_manager', 'partnerships', 'city_lead'].includes(r),
                ) ? (
                  <PropertyReview
                    propertyId={property.id}
                    status={reviewStatus}
                    action={reviewProperty}
                  />
                ) : (
                  <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
                    Reviewing properties is for operations, partnerships and city leads.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted mt-1 text-sm font-semibold">
                Property review switches on after the next database update. Until then this page is
                read-only.
              </p>
            )}
          </div>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            {/* ─────────────────────────────── the place */}
            <Card className="p-5 sm:p-6">
              <h2 className="text-[0.9375rem] font-extrabold">The property</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.8125rem] font-semibold xl:grid-cols-2">
                <Field label="Kind" value={property.kind.replace(/_/g, ' ')} />
                <Field label="Area" value={property.area ?? DASH} />
                <Field label="City" value={city?.name ?? DASH} />
                <Field
                  label="Floors"
                  value={property.floors === null ? DASH : String(property.floors)}
                />
                <Field label="Check-in from" value={property.check_in_from?.slice(0, 5) ?? DASH} />
                <Field label="Check-out by" value={property.check_out_by?.slice(0, 5) ?? DASH} />
                <Field label="Created" value={date(property.created_at)} />
                <Field
                  label="Listed"
                  value={
                    property.listed
                      ? `${date(property.listed_at)}${lister?.display_name ? ` by ${lister.display_name}` : ''}`
                      : 'No'
                  }
                />
                <Field
                  label="Map pin"
                  value={
                    pin ? (
                      <a
                        href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {pin.lat}, {pin.lng} ↗
                      </a>
                    ) : (
                      'No pin set'
                    )
                  }
                />
                {property.is_sample && <Field label="Sample" value="Shown, never bookable" />}
                {property.accepts_test_payments && (
                  <Field label="Test property" value="Seen only by staff and reviewers" />
                )}
              </dl>

              <Prose label="Summary" text={property.summary} />
              <Prose label="Description" text={property.description} />
              <Prose label="The neighbourhood" text={property.neighbourhood_note} />
              <Prose label="House rules" text={property.house_rules} />
              <Prose label="Cancellation policy" text={property.cancellation_policy} />

              <p className="text-muted-light mt-4 text-[0.625rem] font-extrabold uppercase tracking-wide">
                Amenities
              </p>
              {property.amenities.length > 0 ? (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {property.amenities.map((a) => (
                    <span
                      key={a}
                      className="border-border-strong rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold"
                    >
                      {a}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-muted mt-1 text-[0.8125rem] font-semibold">None entered.</p>
              )}
            </Card>

            {/* ─────────────────────────────── photos */}
            <Card className="p-5 sm:p-6">
              <h2 className="text-[0.9375rem] font-extrabold">
                Photos{' '}
                <span className="text-muted-light text-[0.75rem]">
                  {propertyPhotos.length} of the building · {unitPhotos.length} of units
                </span>
              </h2>
              <p className="text-muted mt-1 text-[0.75rem] font-semibold">
                Click a photo to open it full size.
              </p>
              {propertyPhotos.length + unitPhotos.length === 0 ? (
                <p className="text-muted mt-3 text-sm font-semibold">
                  The host has not added any photos.
                </p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ...propertyPhotos.map((p) => ({ ...p, unit: null as string | null })),
                    ...unitPhotos,
                  ].map((p, i) => {
                    const url = p.src ?? (p.path ? photoUrl.get(p.path) : undefined);
                    const label = [p.unit, p.caption].filter(Boolean).join(' · ') || 'Photo';
                    return (
                      <li key={`${p.path ?? p.src ?? p.caption}-${i}`}>
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage links */}
                            <img
                              src={url}
                              alt={label}
                              loading="lazy"
                              className="bg-bg aspect-[4/3] w-full rounded-lg object-cover"
                            />
                          </a>
                        ) : (
                          <span className="bg-bg text-muted flex aspect-[4/3] w-full items-center justify-center rounded-lg p-2 text-center text-[0.6875rem] font-bold">
                            Placeholder, no photo uploaded
                          </span>
                        )}
                        <span className="text-muted mt-1 block truncate text-[0.6875rem] font-semibold">
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* ─────────────────────────────── units */}
            <Card className="overflow-x-auto p-0">
              <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-[0.9375rem] font-extrabold">Units</h2>
                <p className="text-muted-light text-[0.6875rem] font-semibold">
                  {listedUnits.length} listed of {plural(liveUnits.length, 'unit')} ·{' '}
                  {occupiedNow.length} occupied now
                </p>
              </div>
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                    <th className="px-4 py-3">Unit</th>
                    <th className="px-4 py-3">Sleeps</th>
                    <th className="px-4 py-3">Rate / night</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Right now</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((u) => {
                    const occ = occupancyOf(u.id, stays, now);
                    return (
                      <tr key={u.id} className="border-border border-b last:border-b-0">
                        <td className="px-4 py-3">
                          <span className="block text-[0.8125rem] font-extrabold">
                            {u.label_public || u.name}
                          </span>
                          <span className="text-muted-light block text-[0.6875rem] font-semibold">
                            {[
                              u.bedrooms !== null ? plural(u.bedrooms, 'bedroom') : null,
                              u.bathrooms !== null ? `${u.bathrooms} bath` : null,
                              u.size_sqm ? `${u.size_sqm} m²` : null,
                              u.bed_setup,
                            ]
                              .filter(Boolean)
                              .join(' · ') || DASH}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[0.8125rem] font-bold">
                          {u.max_guests ?? DASH}
                        </td>
                        <td className="px-4 py-3 text-[0.8125rem] font-bold">
                          {u.nightly_rate_kes === null ? 'On request' : kes(u.nightly_rate_kes)}
                          {u.min_nights > 1 && (
                            <span className="text-muted-light block text-[0.6875rem] font-semibold">
                              min {plural(u.min_nights, 'night')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Pill
                            tone={
                              u.archived_at
                                ? 'bg-bg text-muted-light'
                                : u.listed && u.status === 'live'
                                  ? 'bg-success-bg text-success'
                                  : 'bg-bg text-muted'
                            }
                          >
                            {u.archived_at
                              ? 'ARCHIVED'
                              : u.listed && u.status === 'live'
                                ? 'LISTED'
                                : `${u.status.replace(/_/g, ' ').toUpperCase()}${
                                    u.host_published ? '' : ' · NOT PUBLISHED'
                                  }`}
                          </Pill>
                          {u.paused_reason && (
                            <span className="text-muted-light mt-1 block text-[0.6875rem] font-semibold">
                              {u.paused_reason}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Pill
                            tone={
                              occ === 'occupied'
                                ? 'bg-gold-soft text-gold-text'
                                : occ === 'blocked'
                                  ? 'bg-bg text-muted'
                                  : 'bg-success-bg text-success'
                            }
                          >
                            {occ === 'occupied'
                              ? 'OCCUPIED'
                              : occ === 'blocked'
                                ? 'BLOCKED'
                                : 'FREE'}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {units.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-muted px-4 py-8 text-center text-sm font-semibold"
                      >
                        No units in this property yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            {/* ─────────────────────────────── bookings */}
            <Card className="p-0">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.9375rem] font-extrabold">Bookings</h2>
              </div>
              <StayList
                title={`Coming up (${coming.length})`}
                empty="No upcoming bookings."
                rows={coming}
                unitName={unitName}
              />
              <StayList
                title="Recent and current"
                empty="No stays recorded yet."
                rows={pastStays}
                unitName={unitName}
              />
            </Card>

            {/* ─────────────────────────────── requests */}
            <Card className="p-0">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.9375rem] font-extrabold">Requests</h2>
                <p className="text-muted-light text-[0.6875rem] font-semibold">
                  Guests’ stay requests we proposed this property for, and requests raised during
                  stays
                </p>
              </div>
              <Section title={`Stay requests matched to its units (${matches?.length ?? 0})`}>
                {(matches ?? []).length === 0 ? (
                  <Empty>No guest stay request has been matched to this property.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {(matches ?? []).map((m) => {
                      const r = Array.isArray(m.request) ? m.request[0] : m.request;
                      return (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <span className="min-w-0">
                            <Link
                              href={`/hotels?tab=listings&selected=${r?.id ?? ''}`}
                              className="text-[0.8125rem] font-extrabold hover:underline"
                            >
                              {r?.reference ?? DASH}
                            </Link>
                            <span className="text-muted-light block text-[0.6875rem] font-semibold">
                              {r?.requester_name ?? '[Requester]'} ·{' '}
                              {unitName.get(m.unit_id) ?? DASH}
                              {r?.check_in ? ` · ${date(r.check_in)}` : ''}
                              {r?.guests ? ` · ${plural(r.guests, 'guest')}` : ''}
                              {m.quoted_nightly_kes ? ` · ${kes(m.quoted_nightly_kes)}` : ''}
                              {m.guest_response ? ` · guest: ${m.guest_response}` : ''}
                            </span>
                          </span>
                          {r?.status && (
                            <Pill tone={REQUEST_TONE[r.status]}>{r.status.toUpperCase()}</Pill>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
              <Section title={`Requests and issues during stays (${hostRequests?.length ?? 0})`}>
                {(hostRequests ?? []).length === 0 ? (
                  <Empty>No requests or issues raised for this property.</Empty>
                ) : (
                  <>
                    <p className="text-muted px-4 pt-2 text-[0.6875rem] font-semibold">
                      Most asked: {topTypes(hostRequests ?? [])}
                    </p>
                    <ul className="divide-border divide-y">
                      {(hostRequests ?? []).slice(0, 30).map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                        >
                          <span className="min-w-0">
                            <span className="block text-[0.8125rem] font-extrabold">{r.title}</span>
                            <span className="text-muted-light block text-[0.6875rem] font-semibold">
                              {r.reference} · {r.kind} · {r.type.replace(/_/g, ' ')} · raised by{' '}
                              {r.raised_by}
                              {r.unit_id ? ` · ${unitName.get(r.unit_id) ?? ''}` : ''} ·{' '}
                              {date(r.created_at)}
                            </span>
                          </span>
                          <Pill tone={REQUEST_TONE[r.status]}>
                            {r.status.replace(/_/g, ' ').toUpperCase()}
                          </Pill>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>
            </Card>

            {/* ─────────────────────────────── reviews */}
            <Card className="p-0">
              <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-[0.9375rem] font-extrabold">Guest reviews</h2>
                {averageRating !== null && (
                  <span className="text-[0.8125rem] font-extrabold">
                    ★ {averageRating.toFixed(1)}{' '}
                    <span className="text-muted-light font-semibold">
                      from {plural(reviews.length, 'review')}
                    </span>
                  </span>
                )}
              </div>
              {reviews.length === 0 ? (
                <Empty>
                  {reviewStatus
                    ? 'No guest has reviewed a stay here yet.'
                    : 'Guest reviews show here after the next database update.'}
                </Empty>
              ) : (
                <ul className="divide-border divide-y">
                  {reviews.slice(0, 30).map((r) => (
                    <li key={r.stay_id} className="px-4 py-3">
                      <p className="text-[0.8125rem] font-extrabold">
                        {'★'.repeat(r.rating ?? 0)}
                        <span className="text-muted-light">{'★'.repeat(5 - (r.rating ?? 0))}</span>
                        <span className="text-muted-light ml-2 text-[0.6875rem] font-semibold">
                          {date(r.answered_at)}
                        </span>
                      </p>
                      {r.text && (
                        <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-relaxed">
                          {r.text}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ─────────────────────────────── right column */}
          <div className="space-y-6">
            <Card className="p-5">
              <h2 className="text-[0.9375rem] font-extrabold">Host</h2>
              {hostRow ? (
                <>
                  <Link
                    href={`/hotels?tab=hosts&selected=${hostRow.id}`}
                    className="mt-2 block text-[0.9375rem] font-extrabold hover:underline"
                  >
                    {hostRow.display_name || hostRow.contact_name || 'Unnamed host'}
                  </Link>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone={HOST_STATUS_TONE[hostRow.status]}>
                      {hostRow.status.toUpperCase()}
                    </Pill>
                    <Pill>{hostRow.kind.replace(/_/g, ' ').toUpperCase()}</Pill>
                  </p>
                  <dl className="mt-3 space-y-1.5 text-[0.75rem] font-semibold">
                    <Field label="Contact" value={hostRow.contact_name ?? DASH} />
                    <Field label="Phone" value={hostDirectory?.phone_masked ?? DASH} />
                    <Field
                      label="Email"
                      value={
                        hostRow.email ? (
                          <a href={`mailto:${hostRow.email}`} className="underline">
                            {hostRow.email}
                          </a>
                        ) : (
                          DASH
                        )
                      }
                    />
                    <Field
                      label="Verified"
                      value={
                        hostRow.verified_at
                          ? `${date(hostRow.verified_at)}${
                              hostRow.verification_method
                                ? ` · ${hostRow.verification_method.replace(/_/g, ' ')}`
                                : ''
                            }`
                          : 'Not yet'
                      }
                    />
                    <Field label="Live since" value={date(hostRow.went_live_at)} />
                    {hostRow.listing_link && (
                      <Field
                        label="Their listing"
                        value={
                          /^https?:\/\//.test(hostRow.listing_link) ? (
                            <a
                              href={hostRow.listing_link}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Open ↗
                            </a>
                          ) : (
                            hostRow.listing_link
                          )
                        }
                      />
                    )}
                  </dl>
                  <Link
                    href={`/hotels/hosts/${hostRow.id}/verify`}
                    className="mt-3 inline-block text-[0.75rem] font-extrabold underline"
                  >
                    Host verification and documents →
                  </Link>
                </>
              ) : (
                <p className="text-muted mt-2 text-sm font-semibold">The host could not be read.</p>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-[0.9375rem] font-extrabold">Who manages it</h2>
              <p className="text-muted mt-1 text-[0.6875rem] font-semibold">
                The host’s accounts that can run this property
              </p>
              {people.length === 0 ? (
                <p className="text-muted mt-2 text-sm font-semibold">
                  No sign-in is linked to this host yet.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {people.map((p) => (
                    <li key={p.key} className="text-[0.75rem] font-semibold">
                      <span className="font-extrabold capitalize">{p.role}</span>
                      {p.scope !== null && (
                        <span className="text-muted-light"> · {plural(p.scope, 'unit')} only</span>
                      )}
                      {!p.accepted && <span className="text-muted-light"> · invite pending</span>}
                      <span className="text-muted block break-all">
                        {p.email ?? 'Email shows after the next database update'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-[0.9375rem] font-extrabold">Ownership and authority</h2>
              <p className="text-muted mt-1 text-[0.6875rem] font-semibold">
                Documents the host uploaded when they applied. They cover the host, not one
                property.
              </p>
              {docs.length === 0 ? (
                <p className="text-muted mt-2 text-sm font-semibold">
                  The host has not uploaded any documents.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {docs.map((d) => {
                    const url = docUrl.get(d.storage_path);
                    return (
                      <li key={d.id} className="text-[0.75rem] font-semibold">
                        <span className="font-extrabold">{DOCUMENT_LABEL[d.kind] ?? d.kind}</span>{' '}
                        <Pill
                          tone={
                            d.status === 'approved'
                              ? 'bg-success-bg text-success'
                              : d.status === 'rejected'
                                ? 'bg-danger-bg text-danger'
                                : 'bg-gold-soft text-gold-text'
                          }
                        >
                          {d.status.toUpperCase()}
                        </Pill>
                        <span className="text-muted block">
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" className="underline">
                              {d.file_name}
                            </a>
                          ) : (
                            d.file_name
                          )}{' '}
                          · {date(d.uploaded_at)}
                        </span>
                        {d.rejection_reason && (
                          <span className="text-danger block">{d.rejection_reason}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-[0.9375rem] font-extrabold">Payouts</h2>
              {payout ? (
                <dl className="mt-2 space-y-1.5 text-[0.75rem] font-semibold">
                  <Field label="Paid by" value={payout.rail.replace(/_/g, ' ')} />
                  <Field label="To" value={payout.destination_masked ?? DASH} />
                  <Field label="Name" value={payout.account_name ?? DASH} />
                  <Field
                    label="Finance check"
                    value={
                      payout.verified ? `Verified ${date(payout.verified_at)}` : 'Not verified'
                    }
                  />
                </dl>
              ) : (
                <p className="text-muted mt-2 text-sm font-semibold">
                  {payouts.error
                    ? 'Payout details could not be read.'
                    : 'The host has not given payout details yet.'}
                </p>
              )}
            </Card>
          </div>
        </div>
      </main>
    </ConsoleShell>
  );
}

function date(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : DASH;
}

function topTypes(rows: { type: string }[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  return Array.from(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, n]) => `${t.replace(/_/g, ' ')} (${n})`)
    .join(', ');
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right font-extrabold">{value}</dd>
    </div>
  );
}

function Prose({ label, text }: { label: string; text: string | null }) {
  return (
    <>
      <p className="text-muted-light mt-4 text-[0.625rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className="text-muted mt-1 whitespace-pre-line text-[0.8125rem] font-semibold leading-[1.7]">
        {text?.trim() || 'Not entered.'}
      </p>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-border border-b last:border-b-0">
      <p className="text-muted-light px-4 pt-3 text-[0.625rem] font-extrabold uppercase tracking-wide">
        {title}
      </p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted px-4 py-4 text-sm font-semibold">{children}</p>;
}

function StayList({
  title,
  empty,
  rows,
  unitName,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    unit_id: string | null;
    guest_first_name: string | null;
    party_adults: number | null;
    party_children: number | null;
    check_in: string;
    check_out: string;
    status: string;
    source: string;
    quote_total_kes: number | null;
  }[];
  unitName: Map<string, string>;
}) {
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-extrabold">
                  {s.status === 'blocked' ? 'Blocked by host' : (s.guest_first_name ?? 'Guest')}
                  <span className="text-muted-light font-semibold">
                    {' '}
                    · {s.unit_id ? (unitName.get(s.unit_id) ?? DASH) : DASH}
                  </span>
                </span>
                <span className="text-muted-light block text-[0.6875rem] font-semibold">
                  {date(s.check_in)} → {date(s.check_out)}
                  {s.party_adults
                    ? ` · ${plural(s.party_adults + (s.party_children ?? 0), 'guest')}`
                    : ''}
                  {` · ${s.source.replace(/_/g, ' ')}`}
                  {s.quote_total_kes ? ` · ${kes(s.quote_total_kes)}` : ''}
                </span>
              </span>
              <Pill
                tone={
                  s.status === 'in_stay'
                    ? 'bg-gold-soft text-gold-text'
                    : s.status === 'booked' || s.status === 'held'
                      ? 'bg-success-bg text-success'
                      : 'bg-bg text-muted'
                }
              >
                {(STAY_LABEL[s.status] ?? s.status).toUpperCase()}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
