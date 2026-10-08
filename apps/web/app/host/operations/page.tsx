import { HostSection, NotBuiltYet, hostContext } from '@/components/host/section';

export const metadata = { title: 'Guest Operations' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { home, live, nav } = await hostContext();
  if (!home) return null;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/operations"
      title="Guest Operations"
      lead="What NexG handles for your guests"
      headlineValue="Soon"
      headlineNote="Rules and the guest landing"
    >
      <NotBuiltYet what="Guest Operations" willHold="Your hand-off rules in one view, do-not-disturb windows, the welcome message a guest sees when they scan, and which merchants appear on your unit’s landing page." />
    </HostSection>
  );
}
