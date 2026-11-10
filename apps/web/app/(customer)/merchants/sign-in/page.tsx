import type { Metadata } from 'next';

import { PortalSignInPage, type SignInSearchParams } from '@/components/auth/portal-sign-in-page';

export const metadata: Metadata = {
  title: 'Merchant sign in',
  description: 'Sign in to your NexG merchant workspace.',
};

/** Merchants sign in here; customers use /sign-in. */
export default function MerchantSignInPage({
  searchParams,
}: {
  searchParams?: SignInSearchParams;
}) {
  return <PortalSignInPage portal="merchant" searchParams={searchParams} />;
}
