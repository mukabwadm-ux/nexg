import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PortalSignInPage, type SignInSearchParams } from '@/components/auth/portal-sign-in-page';
import { isPortal, safeNext, signInHref, withinPortal, type Portal } from '@/lib/auth-portals';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to NexG to order, book stays and follow your requests.',
};

/**
 * Customer sign-in.
 *
 * Merchants, riders and hosts have their own pages. Older links that still
 * say `role=merchant` (or point `next` into a partner workspace) are sent to
 * the right portal with their parameters, so bookmarks and emails keep
 * working. A partner who signs in here anyway is taken to their workspace.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams?: SignInSearchParams & { role?: string };
}) {
  const role = searchParams?.role;
  const next = safeNext(searchParams?.next);
  const partner: Portal | null =
    isPortal(role) && role !== 'customer'
      ? role
      : next
        ? ((['merchant', 'rider', 'host'] as const).find(
            (portal) => withinPortal(portal, next) || next.startsWith(`/${portal}s/register`),
          ) ?? null)
        : null;
  if (partner) {
    const { role: _role, ...rest } = searchParams ?? {};
    void _role;
    redirect(signInHref(partner, rest));
  }
  return <PortalSignInPage portal="customer" searchParams={searchParams} />;
}
