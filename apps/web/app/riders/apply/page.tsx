import type { Metadata } from 'next';

import { RiderApplyFlow } from '@/components/riders/rider-apply-flow';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Become a rider',
  description: 'Apply to ride with NexG. Three steps, about two minutes to start.',
};

export default async function RiderApplyPage({
  searchParams,
}: {
  searchParams?: { first_name?: string; phone?: string; city?: string; vehicle?: string };
}) {
  const supabase = createClient();

  const [{ data: cities }, { data: requirements }] = await Promise.all([
    supabase
      .from('city')
      .select('id, name, slug, status')
      .neq('status', 'waitlist')
      .order('sort', { ascending: true }),
    // Public: an applicant must be able to see what they will be asked for.
    supabase
      .from('document_requirement')
      .select('id, kind, label, help_text, has_expiry, applies_when, sort')
      .eq('owner_type', 'rider')
      .order('sort', { ascending: true }),
  ]);

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Rider sign in', href: '/riders/sign-in' }}
        action={{ label: 'Help', href: '/help' }}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <RiderApplyFlow
          cities={cities ?? []}
          requirements={requirements ?? []}
          prefill={{
            firstName: searchParams?.first_name ?? '',
            phone: searchParams?.phone ?? null,
            cityId: searchParams?.city ?? null,
            vehicle: searchParams?.vehicle ?? 'motorbike',
          }}
        />
      </main>

      <SiteFooter />
    </>
  );
}
