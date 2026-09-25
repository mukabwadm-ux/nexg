import type { Metadata } from 'next';

import { MerchantApplyFlow } from '@/components/merchants/merchant-apply-flow';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Register your business',
  description: 'List your business on NexG. Four steps, about two minutes to start.',
};

export default async function MerchantApplyPage({
  searchParams,
}: {
  searchParams?: {
    trading_name?: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    category?: string;
    city?: string;
  };
}) {
  const supabase = createClient();

  const [{ data: cities }, { data: requirements }] = await Promise.all([
    supabase
      .from('city')
      .select('id, name, slug, status')
      .neq('status', 'waitlist')
      .order('sort', { ascending: true }),
    supabase
      .from('document_requirement')
      .select('id, kind, label, help_text, has_expiry, applies_when, sort')
      .eq('owner_type', 'merchant')
      .order('sort', { ascending: true }),
  ]);

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Merchant sign in', href: '/merchants/sign-in' }}
        action={{ label: 'Help', href: '/help' }}
      />

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <MerchantApplyFlow
          cities={cities ?? []}
          requirements={requirements ?? []}
          prefill={{
            tradingName: searchParams?.trading_name ?? '',
            contactName: searchParams?.contact_name ?? '',
            phone: searchParams?.phone ?? null,
            email: searchParams?.email ?? '',
            category: searchParams?.category ?? 'restaurant',
            cityId: searchParams?.city ?? null,
          }}
        />
      </main>

      <SiteFooter />
    </>
  );
}
