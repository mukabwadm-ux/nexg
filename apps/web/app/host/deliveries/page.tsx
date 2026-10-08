import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Deliveries' };
export const dynamic = 'force-dynamic';

export default async function HostDeliveriesPage() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/deliveries"
      title="Deliveries"
      lead="Everything that arrived at your units, how it was handed over, and the photo proving it."
      headlineValue={live ? '0' : 'Soon'}
      headlineNote={live ? 'Deliveries so far' : 'Opens when you go live'}
    >
      <NotBuiltYet
        what="The delivery log"
        willHold="Every arrival at your units with the hand-off rule that was applied, who took it, and a proof-of-delivery photo that only you and the managers scoped to that property can open."
      />
    </HostSection>
  );
}
