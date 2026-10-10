import { NotBuiltYet, RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h } = await riderContext();
  if (!h) return null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Support"
        lead="The handbook, and a person."
      />
      <NotBuiltYet what="Support" willHold="How offers and pay lines work, cash rules, hand-offs at hotels and gated compounds, what to do after an accident, and a thread to rider ops. In English and Kiswahili." />
    </RiderBoard>
  );
}
