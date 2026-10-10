import { NotBuiltYet, RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Shifts' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h } = await riderContext();
  if (!h) return null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Shifts"
        lead="Guaranteed slots, and what the incentive pays."
      />
      <NotBuiltYet what="Shifts" willHold="Available windows in your zone with their incentive terms, committing and releasing with the consequence shown before you confirm, and the outcome of shifts you have completed." />
    </RiderBoard>
  );
}
