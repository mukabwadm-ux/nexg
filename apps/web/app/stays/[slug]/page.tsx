import { Button, Card } from '@nexg/ui';
import { ArrowLeft, BedDouble, Bath, MapPin, Maximize, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PhotoSlot, bedroomLabel, KIND_LABEL, rateLabel } from '@/components/stays/listing';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';

interface PropertyRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  area: string | null;
  city_name: string | null;
  summary: string | null;
  description: string | null;
  amenities: string[];
  photos: { caption?: string }[];
  neighbourhood_note: string | null;
  check_in_from: string | null;
  check_out_by: string | null;
  units_available: number;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  sleeps_max: number | null;
  from_rate_kes: number | null;
}

interface UnitRow {
  id: string;
  label_public: string | null;
  name: string;
  unit_summary: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  size_sqm: number | null;
  bed_setup: string | null;
  nightly_rate_kes: number | null;
  min_nights: number;
  unit_amenities: string[];
  photos: { caption?: string }[];
  floor: string | null;
  handoff_arranged: boolean;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('property_public')
    .select('name, summary, area')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!data) return { title: 'Stay not found' };
  return {
    title: `${data.name} · ${data.area ?? 'Nairobi'}`,
    description: data.summary ?? undefined,
  };
}

/**
 * One property, then its units — the order a guest actually decides
 * in. They pick the building from the photographs and the street, then
 * work out which flat inside it suits them.
 *
 * No address, no gate code, no contact number anywhere on this page.
 * `property_unit_public` does not carry them, so there is nothing here
 * to leak: where exactly it is comes after somebody is actually
 * coming.
 */
export default async function PropertyPage({ params }: { params: { slug: string } }) {
  const supabase = createPublicClient();

  const { data: property } = await supabase
    .from('property_public')
    .select('*')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!property) notFound();
  const p = property as PropertyRow;

  const { data: units } = await supabase
    .from('property_unit_public')
    .select('*')
    .eq('property_id', p.id)
    .order('nightly_rate_kes', { nullsFirst: false });

  const list = (units as UnitRow[] | null) ?? [];

  return (
    <>
      <SiteHeader
        action={{ label: 'Ask for this one', href: '/stays#tailor' }}
        signIn={{ label: 'All stays', href: '/stays' }}
      />

      <main id="main" className="mx-auto max-w-[96rem] px-4 pb-16 pt-6 sm:px-8 lg:px-16">
        <Link
          href="/stays"
          className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[0.75rem] font-bold"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          All stays
        </Link>

        {/* ─────────────────────────────────────── the gallery */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr] sm:grid-rows-2">
          <PhotoSlot
            seed={p.slug}
            caption={p.photos[0]?.caption}
            className="h-56 w-full rounded-xl sm:row-span-2 sm:h-full sm:min-h-[20rem]"
          />
          {[1, 2].map((i) => (
            <PhotoSlot
              key={i}
              seed={`${p.slug}-${i}`}
              caption={p.photos[i]?.caption}
              className="hidden h-full min-h-[9.5rem] w-full rounded-xl sm:block"
            />
          ))}
        </div>

        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-14">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="border-border-strong text-muted rounded-full border px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                {KIND_LABEL[p.kind] ?? p.kind}
              </span>
              <span className="text-muted-light inline-flex items-center gap-1 text-[0.75rem] font-semibold">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {p.area ?? p.city_name}
              </span>
            </p>

            <h1 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
              {p.name}
            </h1>

            {p.summary && (
              <p className="text-muted mt-3 max-w-[42rem] text-[0.9375rem] font-semibold leading-[1.8]">
                {p.summary}
              </p>
            )}

            <dl className="border-border mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y py-4">
              <Fact label="Units" value={String(p.units_available)} />
              <Fact label="Bedrooms" value={bedroomLabel(p.bedrooms_min, p.bedrooms_max)} />
              <Fact label="Sleeps up to" value={String(p.sleeps_max ?? '—')} />
              <Fact label="Check in" value={p.check_in_from?.slice(0, 5) ?? '—'} />
              <Fact label="Check out" value={p.check_out_by?.slice(0, 5) ?? '—'} />
            </dl>

            {p.description && (
              <p className="text-muted mt-6 max-w-[42rem] text-[0.875rem] font-semibold leading-[1.9]">
                {p.description}
              </p>
            )}

            {p.amenities.length > 0 && (
              <>
                <h2 className="mt-8 text-[1.125rem] font-extrabold">What the building has</h2>
                <ul className="mt-3 grid max-w-[42rem] gap-2 sm:grid-cols-2">
                  {p.amenities.map((a) => (
                    <li key={a} className="text-muted text-[0.8125rem] font-semibold">
                      · {a}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {p.neighbourhood_note && (
              <>
                <h2 className="mt-8 text-[1.125rem] font-extrabold">Where it is</h2>
                <p className="text-muted mt-2 max-w-[42rem] text-[0.875rem] font-semibold leading-[1.8]">
                  {p.neighbourhood_note}
                </p>
                <p className="text-muted-light mt-2 max-w-[42rem] text-[0.75rem] font-semibold leading-relaxed">
                  The exact address and how to get in come once a stay is agreed — not before.
                </p>
              </>
            )}

            {/* ─────────────────────────────────────── the units */}
            <h2 className="mt-10 text-[1.375rem] font-extrabold tracking-[-0.01em]">
              {list.length === 1 ? 'The unit' : `Choose your unit (${list.length})`}
            </h2>
            <p className="text-muted-light mt-1.5 text-[0.75rem] font-semibold">
              Each one is let separately and serviced between stays.
            </p>

            <ul className="mt-5 space-y-4">
              {list.map((u) => (
                <li key={u.id}>
                  <Card className="grid gap-4 overflow-hidden p-0 sm:grid-cols-[13rem_minmax(0,1fr)]">
                    <PhotoSlot
                      seed={u.id}
                      caption={u.photos[0]?.caption}
                      className="h-36 w-full sm:h-full sm:min-h-[10rem]"
                    />
                    <div className="p-4 pt-0 sm:py-4 sm:pl-0 sm:pr-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[1rem] font-extrabold">
                            {u.label_public ?? u.name}
                          </p>
                          {u.unit_summary && (
                            <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
                              {u.unit_summary}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[1rem] font-extrabold">
                            {u.nightly_rate_kes === null
                              ? 'On request'
                              : `KES ${u.nightly_rate_kes.toLocaleString('en-KE')}`}
                          </p>
                          <p className="text-muted-light text-[0.625rem] font-semibold">
                            {u.nightly_rate_kes === null
                              ? 'ask us'
                              : `per night · min ${u.min_nights} night${u.min_nights === 1 ? '' : 's'}`}
                          </p>
                        </div>
                      </div>

                      <p className="text-muted-light mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] font-bold">
                        <span className="inline-flex items-center gap-1">
                          <BedDouble aria-hidden="true" className="h-3.5 w-3.5" />
                          {u.bedrooms === 0 ? 'Studio' : `${u.bedrooms ?? '—'} bed`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Bath aria-hidden="true" className="h-3.5 w-3.5" />
                          {u.bathrooms ?? '—'} bath
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users aria-hidden="true" className="h-3.5 w-3.5" />
                          sleeps {u.max_guests ?? '—'}
                        </span>
                        {u.size_sqm && (
                          <span className="inline-flex items-center gap-1">
                            <Maximize aria-hidden="true" className="h-3.5 w-3.5" />
                            {u.size_sqm} m²
                          </span>
                        )}
                        {u.floor && <span>floor {u.floor}</span>}
                      </p>

                      {u.bed_setup && (
                        <p className="text-muted mt-2 text-[0.75rem] font-semibold">
                          {u.bed_setup}
                        </p>
                      )}

                      {u.unit_amenities.length > 0 && (
                        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
                          {u.unit_amenities.join(' · ')}
                        </p>
                      )}

                      {/*
                       * The guest is told a rule exists, not what it is.
                       * The askari's name and the gate code belong to the
                       * rider on the delivery, not to a browser.
                       */}
                      {u.handoff_arranged && (
                        <p className="text-success mt-3 text-[0.6875rem] font-bold">
                          Concierge hand-off already set up for this unit
                        </p>
                      )}

                      <Button asChild className="mt-4" size="sm">
                        <Link href={`/stays/${p.slug}/enquire?unit=${u.id}`}>
                          Ask about this unit
                        </Link>
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </div>

          {/* ───────────────────────────────────────── the rail */}
          <div className="lg:sticky lg:top-24">
            <Card className="p-5">
              <p className="text-[1.25rem] font-extrabold">{rateLabel(p.from_rate_kes)}</p>
              {p.from_rate_kes !== null && (
                <p className="text-muted-light text-[0.75rem] font-semibold">per night</p>
              )}

              <p className="text-muted mt-4 text-[0.8125rem] font-semibold leading-[1.75]">
                Tell us your dates and who is coming. Somebody on the desk checks what is actually
                free and comes back — usually the same day.
              </p>

              <Button asChild className="mt-4 w-full">
                <Link href={`/stays/${p.slug}/enquire`}>Check these dates</Link>
              </Button>

              <p className="text-muted-light mt-3 text-center text-[0.6875rem] font-semibold">
                Nothing is booked or charged here.
              </p>

              <div className="border-border mt-5 border-t pt-4">
                <p className="text-[0.8125rem] font-extrabold">Concierge included</p>
                <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.7]">
                  Food, drinks, laundry, pharmacy and airport transfers, delivered to the door by
                  the host&rsquo;s own rule — so nobody rings your bell at 1am unless you asked
                  them to.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-0.5 text-[0.9375rem] font-extrabold">{value}</dd>
    </div>
  );
}
