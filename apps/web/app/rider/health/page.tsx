import { NotBuiltYet, RiderPage, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Health' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h, active, nav } = await riderContext();
  if (!h) return null;

  return (
    <RiderPage
      h={h}
      active={active}
      nav={nav}
      current="/rider/health"
      title="Health"
      lead="Your band, the five numbers behind it, and training."
    >
      <NotBuiltYet what="Health" willHold="Acceptance, completion, on-time pickup, proof-of-delivery and rating, each with what moves it. Strikes with their reason and expiry, cooldown history, and the training modules." />
    </RiderPage>
  );
}
