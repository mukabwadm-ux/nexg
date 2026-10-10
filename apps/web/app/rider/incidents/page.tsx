import { NotBuiltYet, RiderBoard, RiderPageHead, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h } = await riderContext();
  if (!h) return null;

  return (
    <RiderBoard>
      <RiderPageHead
        title="Incidents"
        lead="SOS history and anything reported."
      />
      <NotBuiltYet what="Incidents" willHold="Every SOS you have pressed, accidents and unsafe addresses you reported with their photos, and the outcome of each. SOS itself works from every screen right now." />
    </RiderBoard>
  );
}
