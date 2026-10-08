import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Bookings & Guests' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/bookings"
      title="Bookings & Guests"
      lead="Arrivals, in-stay and departures"
      headlineValue="Soon"
      headlineNote="Stays linked to units"
    >
      <NotBuiltYet what="Bookings & Guests" willHold="Arrivals and departures per unit, each stay linked to the unit so a QR order can be attributed to the right guest. First name, masked phone and dates only — never a full number." />
    </HostSection>
  );
}
