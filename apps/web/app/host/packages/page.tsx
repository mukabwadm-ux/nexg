import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Packages & Amenities' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/packages"
      title="Packages & Amenities"
      lead="Welcome packages before check-in"
      headlineValue="Soon"
      headlineNote="Billed monthly"
    >
      <NotBuiltYet what="Packages & Amenities" willHold="Water, breakfast baskets, flowers, a local SIM — ordered from here, billed to you, placed in the unit before your guest arrives, with a photo confirming it was set up." />
    </HostSection>
  );
}
