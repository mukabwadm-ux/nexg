import { Card } from '@nexg/ui';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';

import { StayCheckout } from '@/components/stays/stay-checkout';
import { PhotoSlot } from '@/components/stays/listing';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Book your stay' };
export const dynamic = 'force-dynamic';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface PropertyRow {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  check_in_from: string | null;
  check_out_by: string | null;
}

interface UnitRow {
  id: string;
  name: string;
  label_public: string | null;
  max_guests: number | null;
  nightly_rate_kes: number | null;
  min_nights: number | null;
  photos: { caption?: string }[] | null;
}

/**
 * Book one unit: dates, a 15-minute hold, then M-Pesa.
 *
 * Only for units with a nightly rate; a unit priced on request still goes
 * through the enquiry. The guest signs in with their email before holding,
 * so the confirmation has somewhere to go.
 */
export default async function BookPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { unit?: string; in?: string; out?: string; adults?: string; stay?: string };
}) {
  // Availability must be live: never serve busy nights from the fetch cache.
  noStore();
  const pub = createPublicClient();
  const { data: propertyData } = await pub
    .from('property_public')
    .select('id, slug, name, area, check_in_from, check_out_by')
    .eq('slug', params.slug)
    .maybeSingle();
  if (!propertyData) notFound();
  const property = propertyData as PropertyRow;

  const { data: units } = await pub
    .from('property_unit_public')
    .select('id, name, label_public, max_guests, nightly_rate_kes, min_nights, photos')
    .eq('property_id', property.id)
    .order('nightly_rate_kes');
  const bookable = ((units as UnitRow[] | null) ?? []).filter((u) => u.nightly_rate_kes !== null);
  const unit = bookable.find((u) => u.id === searchParams?.unit) ?? bookable[0];
  if (!unit) notFound();

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const yearOut = new Date(Date.now() + 365 * 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Nairobi',
  });
  const { data: busy } = await pub.rpc('rpc_unit_busy', {
    p_unit_id: unit.id,
    p_from: today,
    p_to: yearOut,
  });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user && !user.is_anonymous && user.email);

  return (
    <>
      <SiteHeader signIn={{ label: 'All stays', href: '/stays' }} />
      <main id="main" className="mx-auto max-w-[72rem] px-4 pb-16 pt-6 sm:px-8">
        <Link
          href={`/stays/${property.slug}`}
          className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[0.75rem] font-bold"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          {property.name}
        </Link>

        <h1 className="mt-4 text-[1.75rem] font-extrabold tracking-[-0.02em]">Book your stay</h1>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <StayCheckout
            slug={property.slug}
            units={bookable.map((u) => ({
              id: u.id,
              name: u.label_public ?? u.name,
              maxGuests: u.max_guests ?? 1,
              nightlyKes: u.nightly_rate_kes ?? 0,
              minNights: u.min_nights ?? 1,
            }))}
            unitId={unit.id}
            busy={(busy ?? []).map((b) => ({ start: b.starts_on, end: b.ends_on }))}
            today={today}
            signedIn={signedIn}
            initial={{
              checkIn: DAY.test(searchParams?.in ?? '') ? searchParams?.in : undefined,
              checkOut: DAY.test(searchParams?.out ?? '') ? searchParams?.out : undefined,
              adults: Number(searchParams?.adults) || undefined,
              stayId: searchParams?.stay,
            }}
          />

          <Card className="overflow-hidden p-0">
            <PhotoSlot seed={unit.id} caption={unit.photos?.[0]?.caption} className="h-40 w-full" />
            <div className="p-5">
              <p className="text-[1rem] font-extrabold">{property.name}</p>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
                {property.area ?? 'Nairobi'}
              </p>
              <p className="text-muted mt-4 text-[0.75rem] font-semibold leading-[1.7]">
                Check in from {property.check_in_from?.slice(0, 5) ?? '14:00'}, check out by{' '}
                {property.check_out_by?.slice(0, 5) ?? '10:00'}. The exact address and how to get in
                come from your host once you have booked.
              </p>
            </div>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
