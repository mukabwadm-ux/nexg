import { Button, Card } from '@nexg/ui';
import { ArrowLeft, Building2, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Price } from '@/components/currency/price';
import {
  KIND_LABEL,
  PhotoSlot,
  SampleChip,
  UnitMiniCard,
  type UnitCardRow,
  unitBedsLabel,
  unitTitle,
} from '@/components/stays/listing';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';
// Next 14 caches plain fetches with no expiry; see lib/supabase/public.ts.
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PropertyRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  area: string | null;
  city_name: string | null;
  summary: string | null;
  amenities: string[];
  photos: { caption?: string; src?: string }[];
  check_in_from: string | null;
  check_out_by: string | null;
  units_available: number;
  is_sample: boolean;
}

interface UnitRow extends UnitCardRow {
  unit_summary: string | null;
  bathrooms: number | null;
  size_sqm: number | null;
  bed_setup: string | null;
  min_nights: number;
  unit_amenities: string[];
  floor: string | null;
  handoff_arranged: boolean;
}

async function load(slug: string, unitId: string) {
  if (!UUID.test(unitId)) return null;
  const supabase = createPublicClient();
  const { data: property } = await supabase
    .from('property_public')
    .select(
      'id, slug, name, kind, area, city_name, summary, amenities, photos, check_in_from, check_out_by, units_available, is_sample',
    )
    .eq('slug', slug)
    .maybeSingle();
  if (!property) return null;
  const p = property as PropertyRow;

  /* All of the apartment's units at once: this one, and the others for
     "More units in this apartment". The view only has listed units. */
  const { data: units } = await supabase
    .from('property_unit_public')
    .select('*')
    .eq('property_id', p.id)
    .order('nightly_rate_kes', { nullsFirst: false });
  const list = (units as UnitRow[] | null) ?? [];
  const unit = list.find((u) => u.id === unitId);
  if (!unit) return null;
  return { property: p, unit, others: list.filter((u) => u.id !== unitId) };
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string; unitId: string };
}): Promise<Metadata> {
  const found = await load(params.slug, params.unitId);
  if (!found) return { title: 'Stay not found' };
  const { property, unit } = found;
  return {
    title: `${unitTitle(unit)} · ${property.name}`,
    description:
      unit.unit_summary ??
      `${unitTitle(unit)}, one of the units in ${property.name}${property.area ? `, ${property.area}` : ''}.`,
  };
}

/**
 * One unit, shown as part of the apartment it sits in.
 *
 * The apartment is the thing NexG manages for its owner, so the unit page
 * always says which apartment it belongs to and shows the other units
 * there: a guest who likes the building but not this flat has somewhere to
 * go next.
 *
 * Same privacy rule as the apartment page: `property_unit_public` carries
 * no address, gate code or contact, so this page has none to leak.
 */
export default async function UnitPage({ params }: { params: { slug: string; unitId: string } }) {
  const found = await load(params.slug, params.unitId);
  if (!found) notFound();
  const { property: p, unit: u, others } = found;

  const sample = p.is_sample === true;
  const bookable = !sample && u.nightly_rate_kes !== null;
  /* The unit's own photographs first, then the building's. */
  const photos = [...u.photos, ...p.photos];
  const title = unitTitle(u);
  const propertyHref = `/stays/${p.slug}`;

  return (
    <>
      <SiteHeader
        action={{ label: 'Ask for this one', href: '/stays#tailor' }}
        signIn={{ label: 'All stays', href: '/stays' }}
      />

      <main id="main" className="mx-auto max-w-[120rem] px-4 pb-16 pt-6 sm:px-[30px]">
        <nav
          aria-label="Breadcrumb"
          className="text-muted flex flex-wrap items-center gap-1.5 text-[0.75rem] font-bold"
        >
          <Link href="/stays" className="hover:text-ink">
            All stays
          </Link>
          <span aria-hidden="true">/</span>
          <Link href={propertyHref} className="hover:text-ink inline-flex items-center gap-1">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {p.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" className="text-ink">
            {title}
          </span>
        </nav>

        {/* ─────────────────────────────────────── the gallery */}
        <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr] sm:grid-rows-2">
          <PhotoSlot
            seed={u.id}
            caption={photos[0]?.caption}
            src={photos[0]?.src}
            sizes="(min-width: 640px) 66vw, 100vw"
            priority
            className="h-56 w-full rounded-xl sm:row-span-2 sm:h-full sm:min-h-[20rem]"
          />
          {[1, 2].map((i) => (
            <PhotoSlot
              key={i}
              seed={`${u.id}-${i}`}
              caption={photos[i]?.caption}
              src={photos[i]?.src}
              sizes="33vw"
              className="hidden h-full min-h-[9.5rem] w-full rounded-xl sm:block"
            />
          ))}
        </div>

        <div className="mt-7 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-14">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <Link
                href={propertyHref}
                className="border-gold text-ink hover:bg-gold/15 inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[0.75rem] font-extrabold"
              >
                <Building2 aria-hidden="true" className="h-3.5 w-3.5" />
                Part of {p.name}
              </Link>
              {sample && <SampleChip />}
              <span className="text-muted-light inline-flex items-center gap-1 text-[0.75rem] font-semibold">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                {p.area ?? p.city_name}
              </span>
            </p>

            <h1 className="mt-3 text-[2rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
              {title}
            </h1>

            {u.unit_summary && (
              <p className="text-muted mt-3 max-w-[42rem] text-[0.9375rem] font-semibold leading-[1.8]">
                {u.unit_summary}
              </p>
            )}

            <dl className="border-border mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y py-4">
              <Fact label="Bedrooms" value={unitBedsLabel(u.bedrooms)} />
              <Fact label="Bathrooms" value={String(u.bathrooms ?? '—')} />
              <Fact label="Sleeps" value={String(u.max_guests ?? '—')} />
              {u.size_sqm !== null && <Fact label="Size" value={`${u.size_sqm} m²`} />}
              {u.floor && <Fact label="Floor" value={u.floor} />}
              <Fact
                label="Minimum stay"
                value={`${u.min_nights} night${u.min_nights === 1 ? '' : 's'}`}
              />
            </dl>

            {u.bed_setup && (
              <p className="text-muted mt-5 text-[0.875rem] font-semibold">{u.bed_setup}</p>
            )}

            {u.unit_amenities.length > 0 && (
              <>
                <h2 className="mt-8 text-[1.125rem] font-extrabold">In the unit</h2>
                <ul className="mt-3 grid max-w-[42rem] gap-2 sm:grid-cols-2">
                  {u.unit_amenities.map((a) => (
                    <li key={a} className="text-muted text-[0.8125rem] font-semibold">
                      · {a}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* ─────────────────────────────── the apartment it is in */}
            <Card className="mt-8 max-w-[42rem] p-5">
              <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                The apartment
              </p>
              <p className="mt-1.5 text-[1.125rem] font-extrabold">
                <Link href={propertyHref} className="hover:underline">
                  {p.name}
                </Link>
                <span className="text-muted-light ml-2 text-[0.6875rem] font-bold uppercase">
                  {KIND_LABEL[p.kind] ?? p.kind}
                </span>
              </p>
              {p.summary && (
                <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
                  {p.summary}
                </p>
              )}
              {p.amenities.length > 0 && (
                <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
                  {p.amenities.join(' · ')}
                </p>
              )}
              <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
                {p.units_available} {p.units_available === 1 ? 'unit' : 'units'} listed here
                {p.check_in_from && ` · check in from ${p.check_in_from.slice(0, 5)}`}
                {p.check_out_by && ` · check out by ${p.check_out_by.slice(0, 5)}`}
              </p>
              <Link
                href={propertyHref}
                className="text-gold-text mt-3 inline-block text-[0.75rem] font-extrabold hover:underline"
              >
                See the whole apartment →
              </Link>
            </Card>
          </div>

          {/* ───────────────────────────────────────── the rail */}
          <div className="lg:sticky lg:top-24">
            <Card className="p-5">
              <p className="text-[1.25rem] font-extrabold">
                {u.nightly_rate_kes === null ? (
                  'Price on request'
                ) : (
                  <Price kes={u.nightly_rate_kes} />
                )}
              </p>
              {u.nightly_rate_kes !== null && (
                <p className="text-muted-light text-[0.75rem] font-semibold">
                  per night · min {u.min_nights} night{u.min_nights === 1 ? '' : 's'}
                </p>
              )}

              {sample ? (
                <>
                  <p className="text-muted mt-4 text-[0.8125rem] font-semibold leading-[1.75]">
                    This is a sample listing that shows how stays look on NexG. It cannot be booked.
                  </p>
                  <Button asChild className="mt-4 w-full">
                    <Link href="/stays#tailor">Find me a stay</Link>
                  </Button>
                </>
              ) : (
                <>
                  {bookable && (
                    <Button asChild className="mt-4 w-full">
                      <Link href={`/stays/${p.slug}/book?unit=${u.id}`}>Book this unit</Link>
                    </Button>
                  )}
                  <Button
                    asChild
                    className={bookable ? 'mt-2 w-full' : 'mt-4 w-full'}
                    variant={bookable ? 'outline' : 'black'}
                  >
                    <Link href={`/stays/${p.slug}/enquire?unit=${u.id}`}>Ask about this unit</Link>
                  </Button>
                </>
              )}

              {u.handoff_arranged && (
                <p className="text-success mt-4 text-[0.6875rem] font-bold">
                  Concierge hand-off already set up for this unit
                </p>
              )}
            </Card>
          </div>
        </div>

        {/* ─────────────────────────── more units in this apartment */}
        <section className="mt-12" aria-labelledby="more-units">
          <h2 id="more-units" className="text-[1.375rem] font-extrabold tracking-[-0.01em]">
            More units in this apartment
          </h2>
          {others.length === 0 ? (
            <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
              {title} is the only unit listed in {p.name} right now.
            </p>
          ) : (
            <>
              <p className="text-muted-light mt-1.5 text-[0.75rem] font-semibold">
                {others.length} more in {p.name}, each let separately.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {others.map((other) => (
                  <UnitMiniCard key={other.id} propertySlug={p.slug} unit={other} />
                ))}
              </div>
            </>
          )}
        </section>
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
