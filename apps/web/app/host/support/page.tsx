import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/support"
      title="Support"
      lead="The handbook and a person"
      headlineValue="Soon"
      headlineNote="Get Help reaches a person"
    >
      <NotBuiltYet what="Support" willHold="How verification works, how hand-off rules behave at night, what happens when a delivery goes wrong, and a way to reach the concierge desk about any of it." />
    </HostSection>
  );
}
