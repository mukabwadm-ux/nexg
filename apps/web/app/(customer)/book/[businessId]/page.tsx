import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CustomerBookingForm } from '@/components/booking/customer-booking-form';
import { CustomerBooking } from '@/components/merchant/booking/customer-booking';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { bookingEngineEnabledForMerchant } from '@/lib/booking/bridge';
import { nairobiDate, PUBLIC_RESOURCE_COLUMNS, type PublicResource } from '@/lib/booking/customer';
import { createClient } from '@/lib/supabase/server';

export const metadata = {
  title: 'Book with a NEXG merchant',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function CustomerBookingPage({
  params,
  searchParams,
}: {
  params: { businessId: string };
  searchParams?: { resource?: string };
}) {
  const useEngine =
    !searchParams?.resource && bookingEngineEnabledForMerchant(params.businessId, process.env);
  if (useEngine && process.env.NODE_ENV !== 'production') {
    return <CustomerBooking businessId={params.businessId} />;
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.businessId)) notFound();

  const supabase = createClient();
  // merchant_public only returns live businesses.
  const [{ data: merchant }, { data: rows, error: resourceError }, { data: auth }] =
    await Promise.all([
      supabase
        .from('merchant_public')
        .select('id, trading_name')
        .eq('id', params.businessId)
        .maybeSingle(),
      supabase
        .from('bookable_resource')
        .select(PUBLIC_RESOURCE_COLUMNS)
        .eq('merchant_id', params.businessId)
        .eq('active', true)
        .order('created_at'),
      supabase.auth.getUser(),
    ]);
  if (!merchant?.id || !merchant.trading_name) notFound();

  const resources = (rows ?? []) as unknown as PublicResource[];
  if (useEngine && !resourceError && rows && resources.length === 0) {
    return <CustomerBooking businessId={merchant.id} />;
  }
  const user = auth.user && !auth.user.is_anonymous ? auth.user : null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[48rem] px-4 pb-16 pt-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-muted-light text-xs font-semibold">
          <Link href={`/explore/${merchant.id}`} className="hover:text-ink transition-colors">
            {merchant.trading_name}
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span className="text-ink">Book</span>
        </nav>
        <h1 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em]">
          Book with {merchant.trading_name}
        </h1>

        <div className="mt-6">
          {resources.length === 0 ? (
            <p className="text-muted text-[0.9375rem] font-semibold">
              {merchant.trading_name} isn’t taking online bookings yet.{' '}
              <Link href={`/explore/${merchant.id}`} className="text-ink underline">
                Back to their page
              </Link>
              .
            </p>
          ) : (
            <CustomerBookingForm
              merchant={{ id: merchant.id, name: merchant.trading_name }}
              resources={resources}
              initialResourceId={searchParams?.resource ?? null}
              today={nairobiDate(new Date())}
              signedIn={Boolean(user)}
              defaults={{
                name: text(meta.full_name) || text(meta.name),
                phone: user?.phone ? `+${user.phone.replace(/^\+/, '')}` : text(meta.phone),
              }}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
