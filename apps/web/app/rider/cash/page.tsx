import { NotBuiltYet, RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Cash' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h } = await riderContext();
  if (!h) return null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Cash"
        lead="What you are holding, your cap, and how to deposit it."
      />
      <NotBuiltYet what="Cash" willHold="Cash on hand against your cap, the paybill and your rider code, deposit history with its matching status, and a way to send evidence when a deposit does not match automatically." />
    </RiderBoard>
  );
}
