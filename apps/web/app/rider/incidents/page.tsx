import { NotBuiltYet, RiderPage, riderContext } from '@/components/rider/frame';

export const metadata = { title: 'Incidents' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { h, active, nav } = await riderContext();
  if (!h) return null;

  return (
    <RiderPage
      h={h}
      active={active}
      nav={nav}
      current="/rider/incidents"
      title="Incidents"
      lead="SOS history and anything reported."
    >
      <NotBuiltYet what="Incidents" willHold="Every SOS you have pressed, accidents and unsafe addresses you reported with their photos, and the outcome of each. SOS itself works from every screen right now." />
    </RiderPage>
  );
}
