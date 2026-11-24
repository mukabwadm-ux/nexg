import { Card } from '@nexg/ui';
import { BedDouble, MapPin, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import midnight from './midnight.module.css';
import { Price } from '@/components/currency/price';

/** Shared pieces of the stays listing, used by /stays and the /hosts teaser. */

export interface PropertyCardRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  area: string | null;
  city_name: string | null;
  summary: string | null;
  amenities: string[];
  photos: { placeholder?: boolean; caption?: string; path?: string; src?: string }[];
  units_available: number;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  sleeps_max: number | null;
  from_rate_kes: number | null;
  /** A demonstration listing: shown and labelled, never bookable. */
  is_sample?: boolean;
}

export const KIND_LABEL: Record<string, string> = {
  apartment: 'Apartment',
  apartment_block: 'Apartments',
  villa: 'Villa',
  townhouse: 'Townhouses',
  guest_house: 'Guest house',
  cottage: 'Cottage',
  penthouse: 'Penthouse',
  studio: 'Studio',
};

/**
 * "Studio" when the smallest unit has no bedroom, a range when the
 * property spans sizes, one number when they are all the same.
 */
export function bedroomLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  const lo = min ?? max!;
  const hi = max ?? min!;
  if (lo === hi) return lo === 0 ? 'Studio' : `${lo} bed${lo === 1 ? '' : 's'}`;
  return `${lo === 0 ? 'Studio' : lo}–${hi} beds`;
}

export function rateLabel(kes: number | null): string {
  return kes === null ? 'Price on request' : `from KES ${kes.toLocaleString('en-KE')}`;
}

/** rateLabel, in the visitor's display currency. */
export function RateLabel({ kes }: { kes: number | null }) {
  if (kes === null) return <>Price on request</>;
  return (
    <>
      from <Price kes={kes} />
    </>
  );
}

/**
 * The listing's photograph, or a slot with nothing in it yet.
 *
 * `src` is a photograph served by the site from /images/: only sample
 * listings have one, and they are labelled as samples wherever they appear.
 *
 * A deliberate, deterministic tile rather than a grey box or a stock
 * photograph: these properties have no photography, and borrowing
 * somebody else's would misrepresent what a guest is booking. The hue
 * comes from the name so a property looks the same everywhere it
 * appears.
 */
export function PhotoSlot({
  seed,
  caption,
  className,
  src,
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw',
  priority = false,
}: {
  seed: string;
  caption?: string;
  className?: string;
  src?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (src?.startsWith('/images/')) {
    return (
      <span className={`relative block overflow-hidden bg-[#EDE9E0] ${className ?? ''}`}>
        <Image
          src={src}
          alt={caption ?? ''}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </span>
    );
  }
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const a = `hsl(${h} 32% 86%)`;
  const b = `hsl(${(h + 38) % 360} 36% 74%)`;

  return (
    <span
      aria-hidden="true"
      className={`relative block overflow-hidden ${className ?? ''}`}
      style={{ background: `linear-gradient(140deg, ${a}, ${b})` }}
    >
      {caption && (
        <span className="absolute bottom-2 left-2.5 rounded bg-black/25 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white">
          {caption}
        </span>
      )}
    </span>
  );
}

export function PropertyCard({
  property,
  tone = 'light',
  units = [],
}: {
  property: PropertyCardRow;
  /** The apartment's listed units, shown as rows under its facts. */
  units?: UnitCardRow[];
  /** `midnight` is the dark card used on the /stays page. */
  tone?: 'light' | 'midnight';
}) {
  if (tone === 'midnight') return <MidnightPropertyCard property={property} />;
  return (
    <Card className="text-ink group overflow-hidden p-0 transition-shadow hover:shadow-md">
      <Link href={`/stays/${property.slug}`} className="block">
        <PhotoSlot
          seed={property.slug}
          caption={property.photos[0]?.caption}
          src={property.photos[0]?.src}
          className="h-44 w-full"
        />

        <span className="block p-4">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="border-border-strong text-muted rounded-full border px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
              {KIND_LABEL[property.kind] ?? property.kind}
            </span>
            {property.is_sample && <SampleChip />}
            <span className="text-muted-light inline-flex items-center gap-1 text-[0.6875rem] font-semibold">
              <MapPin aria-hidden="true" className="h-3 w-3" />
              {property.area ?? property.city_name ?? '—'}
            </span>
          </span>

          <span className="mt-2 block text-[1rem] font-extrabold leading-tight">
            {property.name}
          </span>

          {property.summary && (
            <span className="text-muted mt-1.5 line-clamp-2 block text-[0.8125rem] font-semibold leading-[1.6]">
              {property.summary}
            </span>
          )}

          <span className="text-muted-light mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-bold">
            <span className="inline-flex items-center gap-1">
              <BedDouble aria-hidden="true" className="h-3.5 w-3.5" />
              {bedroomLabel(property.bedrooms_min, property.bedrooms_max)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden="true" className="h-3.5 w-3.5" />
              sleeps {property.sleeps_max ?? '—'}
            </span>
            <span>
              {property.units_available} unit{property.units_available === 1 ? '' : 's'}
            </span>
          </span>

          <CardUnitRows units={units} />

          <span className="border-border mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-[0.875rem] font-extrabold">
              <RateLabel kes={property.from_rate_kes} />
              {property.from_rate_kes !== null && (
                <span className="text-muted-light text-[0.6875rem] font-semibold"> / night</span>
              )}
            </span>
            <span className="text-gold-text text-[0.75rem] font-extrabold group-hover:underline">
              See units →
            </span>
          </span>
        </span>
      </Link>
    </Card>
  );
}

/** The same card for the dark /stays page: glass panel, inset photo. */
function MidnightPropertyCard({ property }: { property: PropertyCardRow }) {
  return (
    <Link href={`/stays/${property.slug}`} className={`group ${midnight.card}`}>
      <PhotoSlot
        seed={property.slug}
        caption={property.photos[0]?.caption}
        src={property.photos[0]?.src}
        className="h-44 w-full rounded-[10px]"
      />

      <span className="block px-2 pb-2 pt-4">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/30 px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide text-white/85">
            {KIND_LABEL[property.kind] ?? property.kind}
          </span>
          {property.is_sample && <SampleChip />}
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-white/70">
            <MapPin aria-hidden="true" className="h-3 w-3" />
            {property.area ?? property.city_name ?? '—'}
          </span>
        </span>

        <span className="mt-2 block text-[1rem] font-extrabold leading-tight text-white">
          {property.name}
        </span>

        {property.summary && (
          <span className="mt-1.5 line-clamp-2 block text-[0.8125rem] font-semibold leading-[1.6] text-white/75">
            {property.summary}
          </span>
        )}

        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-bold text-white/70">
          <span className="inline-flex items-center gap-1">
            <BedDouble aria-hidden="true" className="h-3.5 w-3.5" />
            {bedroomLabel(property.bedrooms_min, property.bedrooms_max)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users aria-hidden="true" className="h-3.5 w-3.5" />
            sleeps {property.sleeps_max ?? '—'}
          </span>
          <span>
            {property.units_available} unit{property.units_available === 1 ? '' : 's'}
          </span>
        </span>

        <span className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-3">
          <span className="text-[0.875rem] font-extrabold text-white">
            <RateLabel kes={property.from_rate_kes} />
            {property.from_rate_kes !== null && (
              <span className="text-[0.6875rem] font-semibold text-white/70"> / night</span>
            )}
          </span>
          <span className="text-gold text-[0.75rem] font-extrabold group-hover:underline">
            See units →
          </span>
        </span>
      </span>
    </Link>
  );
}

/** One unit as the listing shows it: enough for a row or a small card. */
export interface UnitCardRow {
  id: string;
  property_id: string;
  label_public: string | null;
  name: string;
  bedrooms: number | null;
  max_guests: number | null;
  nightly_rate_kes: number | null;
  photos: { caption?: string; src?: string }[];
}

export function unitTitle(unit: Pick<UnitCardRow, 'label_public' | 'name'>): string {
  return unit.label_public ?? unit.name;
}

/** Every unit has its own page under the apartment it sits in. */
export function unitHref(propertySlug: string, unitId: string): string {
  return `/stays/${propertySlug}/units/${unitId}`;
}

export function unitBedsLabel(bedrooms: number | null): string {
  if (bedrooms === null) return '— beds';
  return bedrooms === 0 ? 'Studio' : `${bedrooms} bed${bedrooms === 1 ? '' : 's'}`;
}

/**
 * The units inside one apartment, as rows on its listing card, so the
 * Stays page reads as buildings with their flats rather than loose flats.
 * Plain text: the whole card is already the link to the apartment.
 */
function CardUnitRows({ units, max = 3 }: { units: UnitCardRow[]; max?: number }) {
  if (units.length === 0) return null;
  const shown = units.slice(0, max);
  return (
    <span className="border-border mt-3 block border-t pt-2.5">
      <span className="text-muted-light block text-[0.625rem] font-extrabold uppercase tracking-wide">
        Units in this apartment
      </span>
      <span className="mt-1.5 block space-y-1.5">
        {shown.map((u) => (
          <span key={u.id} className="block text-[0.75rem] leading-snug">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-ink min-w-0 truncate font-bold">{unitTitle(u)}</span>
              <span className="text-ink shrink-0 font-extrabold">
                {u.nightly_rate_kes === null ? 'On request' : <Price kes={u.nightly_rate_kes} />}
              </span>
            </span>
            <span className="text-muted-light block text-[0.6875rem] font-semibold">
              {unitBedsLabel(u.bedrooms)} · sleeps {u.max_guests ?? '—'}
            </span>
          </span>
        ))}
        {units.length > max && (
          <span className="text-muted-light block text-[0.6875rem] font-bold">
            + {units.length - max} more
          </span>
        )}
      </span>
    </span>
  );
}

/** A small card for one unit: "More units in this apartment". */
export function UnitMiniCard({ propertySlug, unit }: { propertySlug: string; unit: UnitCardRow }) {
  return (
    <Card className="text-ink group overflow-hidden p-0 transition-shadow hover:shadow-md">
      <Link href={unitHref(propertySlug, unit.id)} className="block">
        <PhotoSlot
          seed={unit.id}
          caption={unit.photos[0]?.caption}
          src={unit.photos[0]?.src}
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw"
          className="h-32 w-full"
        />
        <span className="block p-3.5">
          <span className="block text-[0.9375rem] font-extrabold leading-tight">
            {unitTitle(unit)}
          </span>
          <span className="text-muted-light mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] font-bold">
            <span className="inline-flex items-center gap-1">
              <BedDouble aria-hidden="true" className="h-3.5 w-3.5" />
              {unitBedsLabel(unit.bedrooms)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users aria-hidden="true" className="h-3.5 w-3.5" />
              sleeps {unit.max_guests ?? '—'}
            </span>
          </span>
          <span className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[0.8125rem] font-extrabold">
              {unit.nightly_rate_kes === null ? (
                'Price on request'
              ) : (
                <>
                  <Price kes={unit.nightly_rate_kes} />
                  <span className="text-muted-light text-[0.625rem] font-semibold"> / night</span>
                </>
              )}
            </span>
            <span className="text-gold-text text-[0.6875rem] font-extrabold group-hover:underline">
              View →
            </span>
          </span>
        </span>
      </Link>
    </Card>
  );
}

/** Marks a demonstration listing, which cannot be booked. */
export function SampleChip() {
  return (
    <span
      title="A sample listing that shows how stays look on NexG. It cannot be booked."
      className="bg-gold text-ink rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide"
    >
      Sample listing
    </span>
  );
}
