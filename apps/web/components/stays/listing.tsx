import { Card } from '@nexg/ui';
import { BedDouble, MapPin, Users } from 'lucide-react';
import Link from 'next/link';

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
  photos: { placeholder?: boolean; caption?: string; path?: string }[];
  units_available: number;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  sleeps_max: number | null;
  from_rate_kes: number | null;
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

/**
 * A photo slot with nothing in it yet.
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
}: {
  seed: string;
  caption?: string;
  className?: string;
}) {
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

export function PropertyCard({ property }: { property: PropertyCardRow }) {
  return (
    <Card className="group overflow-hidden p-0 transition-shadow hover:shadow-md">
      <Link href={`/stays/${property.slug}`} className="block">
        <PhotoSlot
          seed={property.slug}
          caption={property.photos[0]?.caption}
          className="h-44 w-full"
        />

        <span className="block p-4">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="border-border-strong text-muted rounded-full border px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
              {KIND_LABEL[property.kind] ?? property.kind}
            </span>
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

          <span className="border-border mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-[0.875rem] font-extrabold">
              {rateLabel(property.from_rate_kes)}
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
