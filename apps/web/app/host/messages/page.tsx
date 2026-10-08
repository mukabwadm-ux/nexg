import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/messages"
      title="Messages"
      lead="Your threads with NexG"
      headlineValue="Soon"
      headlineNote="Reach the desk from Get Help"
    >
      <NotBuiltYet what="Messages" willHold="The concierge desk, host ops, and the rider on an active delivery to your unit with their number masked. Guest messages stay between the guest and the desk." />
    </HostSection>
  );
}
