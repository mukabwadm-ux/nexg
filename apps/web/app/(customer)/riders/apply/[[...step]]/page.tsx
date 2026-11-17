import { redirect } from 'next/navigation';

/**
 * The rider application is one form on /riders now (owner, 17 Nov 2026), so
 * /riders/apply and its old steps (start, ride, areas, documents, payout) all
 * lead there. A merchant's fleet invite (?invite=) comes along; the form
 * passes it to rpc_rider_start.
 */
export const dynamic = 'force-dynamic';

export default function RiderApply({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const invite = searchParams?.invite;
  if (typeof invite === 'string' && invite.length > 0 && invite.length <= 200)
    redirect(`/riders?invite=${encodeURIComponent(invite)}#apply`);
  redirect('/riders#apply');
}
