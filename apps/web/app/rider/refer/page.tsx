import { NotBuiltYet, RiderPage, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Refer a rider' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h, active, nav } = await riderContext();
  if (!h) return null;

  return (
    <RiderPage
      h={h}
      active={active}
      nav={nav}
      current="/rider/refer"
      title="Refer a rider"
      lead="Bring somebody you would ride with."
    >
      <NotBuiltYet what="Refer a rider" willHold="Your referral link and code, who has joined through it and how far through activation they are. Reward terms are not set yet, so no amount is shown rather than a figure you might count on." />
    </RiderPage>
  );
}
