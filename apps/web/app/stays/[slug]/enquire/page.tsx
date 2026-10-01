import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PhotoSlot } from '@/components/stays/listing';
import { TailorForm } from '@/components/stays/tailor-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = { title: 'Ask about this stay' };
export const dynamic = 'force-dynamic';

/**
 * The enquiry, with the property already named.
 *
 * The same form as the hero — one request table, one desk queue — but
 * the place they were looking at is carried into the note, so nobody
 * has to type "the one in Kilimani with the balcony" and hope.
 */
export default async function EnquirePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { unit?: string };
}) {
  const supabase = createPublicClient();

  const { data: property } = await supabase
    .from('property_public')
    .select('id, slug, name, area, city_name, summary, from_rate_kes')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!property || !property.id || !property.slug || !property.name) notFound();

  const { data: unit } = searchParams?.unit
    ? await supabase
        .from('property_unit_public')
        .select('id, label_public, name, nightly_rate_kes')
        .eq('id', searchParams.unit)
        .eq('property_id', property.id!)
        .maybeSingle()
    : { data: null };

  const unitLabel = unit ? (unit.label_public ?? unit.name) : null;
  const subject = unitLabel ? `${property.name} · ${unitLabel}` : property.name!;

  return (
    <>
      <SiteHeader
        action={{ label: 'All stays', href: '/stays' }}
        signIn={{ label: 'List your Airbnb', href: '/hosts' }}
      />

      <main id="main" className="mx-auto max-w-[96rem] px-4 pb-16 pt-6 sm:px-8 lg:px-16">
        <Link
          href={`/stays/${property.slug!}`}
          className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[0.75rem] font-bold"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to {property.name}
        </Link>

        <div className="mt-5 grid gap-10 lg:grid-cols-[1fr_34rem] lg:items-start lg:gap-14">
          <div className="lg:pt-4">
            <p className="text-gold-text text-[0.6875rem] font-extrabold uppercase tracking-[0.12em]">
              Asking about
            </p>
            <h1 className="mt-2 text-[2rem] font-extrabold leading-tight tracking-[-0.02em]">
              {subject}
            </h1>
            <p className="text-muted-light mt-1.5 text-[0.8125rem] font-semibold">
              {property.area ?? property.city_name}
            </p>

            <PhotoSlot
              seed={unit?.id ?? property.slug!}
              className="mt-5 h-44 w-full max-w-[28rem] rounded-xl"
            />

            {property.summary && (
              <p className="text-muted mt-5 max-w-[32rem] text-[0.875rem] font-semibold leading-[1.8]">
                {property.summary}
              </p>
            )}

            <p className="text-muted-light mt-5 max-w-[32rem] text-[0.75rem] font-semibold leading-[1.8]">
              We check whether this one is actually free on your dates before answering. If it is
              not, you get the two closest things that are — rather than silence.
            </p>
          </div>

          <TailorForm
            areas={property.area ? [property.area] : []}
            subject={subject}
            heading={`Ask about ${subject}`}
          />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
