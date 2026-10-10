import { NotBuiltYet, RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Health' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h } = await riderContext();
  if (!h) return null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Health"
        lead="Your band, the five numbers behind it, and training."
      />
      <NotBuiltYet what="Health" willHold="Acceptance, completion, on-time pickup, proof-of-delivery and rating, each with what moves it. Strikes with their reason and expiry, cooldown history, and the training modules." />
    </RiderBoard>
  );
}
