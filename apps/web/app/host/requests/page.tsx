import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Requests & Issues' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/requests"
      title="Requests & Issues"
      lead="Anything a guest or you raised"
      headlineValue="Soon"
      headlineNote="Handled by the desk today"
    >
      <NotBuiltYet what="Requests & Issues" willHold="Late deliveries, access problems, a rider who could not get in, extra towels. Each opens a conversation with the concierge desk and stays attached to the order it is about." />
    </HostSection>
  );
}
