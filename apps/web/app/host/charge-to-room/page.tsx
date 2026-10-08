import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Charge to Room' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/charge-to-room"
      title="Charge to Room"
      lead="Hotel folio postings"
      headlineValue="Soon"
      headlineNote="Hotels only"
    >
      <NotBuiltYet what="Charge to Room" willHold="For hotels: posting a guest order to their room folio, voiding and re-posting, and the end-of-day reconciliation against your PMS. Not used by Airbnb or serviced-apartment hosts." />
    </HostSection>
  );
}
