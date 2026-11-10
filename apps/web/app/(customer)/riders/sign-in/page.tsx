import type { Metadata } from 'next';

import { PortalSignInPage, type SignInSearchParams } from '@/components/auth/portal-sign-in-page';

export const metadata: Metadata = {
  title: 'Rider sign in',
  description: 'Sign in to your NexG rider dashboard.',
};

/** Riders sign in here; customers use /sign-in. */
export default function RiderSignInPage({ searchParams }: { searchParams?: SignInSearchParams }) {
  return <PortalSignInPage portal="rider" searchParams={searchParams} />;
}
